#!/bin/bash
# Exercises the RAUC tryboot backend (rootfs-overlay/usr/libexec/showroom)
# through an update, a commit, a failed trial and its rollback, without a
# Pi: boot partitions are directories bind-mounted in place of the FAT
# partitions inside a private mount namespace. Needs root (sudo in CI).
set -euo pipefail

if [[ "${1:-}" != "--inside" ]]; then
  exec unshare -m --propagation private "$0" --inside
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
BOARD="${HERE}/../board/rpi5"
BACKEND="${BOARD}/rootfs-overlay/usr/libexec/showroom/rauc-tryboot-backend"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

mount -t tmpfs none /data 2>/dev/null || { mkdir -p /data && mount -t tmpfs none /data; }
mount -t tmpfs none /run

# Partitions 1-3 of the fixed disk ID, as plain directories.
for n in 1 2 3; do mkdir -p "${WORK}/part-0${n}"; done
cp "${BOARD}/autoboot.txt" "${WORK}/part-01/autoboot.txt"
for n in 2 3; do
  for slot in A B; do
    root=05
    [[ "${slot}" == B ]] && root=06
    sed -e "s/@ROOT_PARTUUID@/53484f57-${root}/" -e "s/@SLOT@/${slot}/" \
      "${BOARD}/cmdline.txt.in" >"${WORK}/part-0${n}/cmdline-${slot}.txt"
  done
done
cp "${WORK}/part-02/cmdline-A.txt" "${WORK}/part-02/cmdline.txt"

# A mount wrapper that turns "mount -t vfat -o OPTS DEVICE DIR" into a bind
# mount of the matching directory.
mkdir -p "${WORK}/bin"
cat >"${WORK}/bin/mount" <<WRAPPER
#!/bin/bash
if [[ "\$1" == "-t" && "\$2" == "vfat" ]]; then
  device="\$5"
  exec /bin/mount --bind "${WORK}/part-\${device##*-}" "\$6"
fi
exec /bin/mount "\$@"
WRAPPER
chmod +x "${WORK}/bin/mount"
export PATH="${WORK}/bin:${PATH}"

boot_as() {
  sed -e "s/@ROOT_PARTUUID@/x/" -e "s/@SLOT@/$1/" "${BOARD}/cmdline.txt.in" >"${WORK}/cmdline"
  mount --bind "${WORK}/cmdline" /proc/cmdline
}
unboot() {
  umount /proc/cmdline
}
expect() {
  local description="$1" expected="$2" actual="$3"
  if [[ "${expected}" != "${actual}" ]]; then
    echo "FAIL: ${description}: expected '${expected}', got '${actual}'" >&2
    exit 1
  fi
  echo "ok: ${description}"
}
section() {
  awk -v want="$1" '/^\[/ { s = $0 } s == want && /^boot_partition=/ { sub(/.*=/, ""); print }' \
    "${WORK}/part-01/autoboot.txt"
}

boot_as A
expect "factory image boots slot A" A "$("${BACKEND}" get-current)"
expect "A is primary" A "$("${BACKEND}" get-primary)"
expect "A is good" good "$("${BACKEND}" get-state A)"
expect "B is bad" bad "$("${BACKEND}" get-state B)"
expect "marking the committed slot good is a no-op" 0 "$("${BACKEND}" set-state A good; echo $?)"
if "${BACKEND}" set-state A bad 2>/dev/null; then
  echo "FAIL: marking the running committed slot bad must be refused" >&2
  exit 1
fi
echo "ok: refuses to mark the committed slot bad"

# RAUC installs into B: mark it bad, write it, then make it primary.
"${BACKEND}" set-state B bad
"${BACKEND}" set-primary B
expect "B's cmdline.txt points at its own root" "$(cat "${WORK}/part-03/cmdline-B.txt")" "$(cat "${WORK}/part-03/cmdline.txt")"
expect "A stays committed until B proves itself" 2 "$(section '[all]')"
expect "B is the tryboot slot" 3 "$(section '[tryboot]')"
expect "B is primary while pending" B "$("${BACKEND}" get-primary)"
expect "pending marker" B "$(cat /data/rauc/tryboot-pending)"
unboot

# Trial boot of B (showroom-reboot sets the attempted marker) and commit.
cp /data/rauc/tryboot-pending /data/rauc/tryboot-attempted
boot_as B
expect "running B" B "$("${BACKEND}" get-current)"
expect "A is still primary during the trial" A "$("${BACKEND}" get-primary)"
"${BACKEND}" set-state B good
expect "B committed" 3 "$(section '[all]')"
expect "A is now the tryboot slot" 2 "$(section '[tryboot]')"
expect "pending cleared" no "$([[ -e /data/rauc/tryboot-pending ]] && echo yes || echo no)"
expect "B is primary" B "$("${BACKEND}" get-primary)"

# The next update goes to A and its trial boot never comes up: the firmware
# falls back to B, where showroom-os-commit marks A bad.
"${BACKEND}" set-state A bad
"${BACKEND}" set-primary A
expect "A's cmdline.txt points at its own root" "$(cat "${WORK}/part-02/cmdline-A.txt")" "$(cat "${WORK}/part-02/cmdline.txt")"
expect "A pending" A "$(cat /data/rauc/tryboot-pending)"
cp /data/rauc/tryboot-pending /data/rauc/tryboot-attempted
expect "still on B after the failed trial" B "$("${BACKEND}" get-current)"
"${BACKEND}" set-state A bad
expect "failed slot cleared from pending" no "$([[ -e /data/rauc/tryboot-pending ]] && echo yes || echo no)"
expect "B still committed" 3 "$(section '[all]')"
expect "B primary" B "$("${BACKEND}" get-primary)"
unboot

echo "tryboot backend: all checks passed"
