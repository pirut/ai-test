#!/bin/bash
# Checks are passed to eval, so they are single-quoted on purpose.
# shellcheck disable=SC2016
# Exercises showroom-os-follow against a channel on local files: installs a
# new version once, ignores the running one, never retries a version that fell
# back or that RAUC refused, rejects a bad checksum, and finishes an install
# whose reboot never happened.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FOLLOW="${ROOT_DIR}/board/rpi5/rootfs-overlay/usr/libexec/showroom/showroom-os-follow"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

export SHOWROOM_OS_CHANNEL_ENV="${WORK}/os-channel.env"
export SHOWROOM_OS_FOLLOW_STATE="${WORK}/data/rauc/follow"
export SHOWROOM_TRYBOOT_PENDING="${WORK}/data/rauc/tryboot-pending"
export SHOWROOM_TRYBOOT_ATTEMPTED="${WORK}/data/rauc/tryboot-attempted"
export SHOWROOM_OS_RELEASE="${WORK}/os-release"
export SHOWROOM_OS_INSTALL="${WORK}/install"
export SHOWROOM_OS_REBOOT="${WORK}/reboot"
mkdir -p "${WORK}/data/rauc"
printf 'SHOWROOM_OS_CHANNEL_URL=file://%s/latest.json\n' "${WORK}" >"${SHOWROOM_OS_CHANNEL_ENV}"

cat >"${SHOWROOM_OS_INSTALL}" <<'EOF'
#!/bin/bash
echo "install $(cat "$1")" >>"${WORK}/calls"
[[ ! -e "${WORK}/install-fails" ]]
EOF
cat >"${SHOWROOM_OS_REBOOT}" <<'EOF'
#!/bin/bash
echo reboot >>"${WORK}/calls"
EOF
chmod +x "${SHOWROOM_OS_INSTALL}" "${SHOWROOM_OS_REBOOT}"
export WORK

failures=0
check() {
  if eval "$2"; then echo "ok: $1"; else echo "FAIL: $1" >&2; failures=$((failures + 1)); fi
}
booted() { printf 'NAME="Showroom OS"\nVERSION_ID=%s\n' "$1" >"${SHOWROOM_OS_RELEASE}"; }
publish() {
  local version="$1" sha
  printf 'bundle %s\n' "${version}" >"${WORK}/${version}.raucb"
  sha="${2:-$(sha256sum "${WORK}/${version}.raucb" | cut -d' ' -f1)}"
  printf '{"version":"%s","bundle":"file://%s/%s.raucb","sha256":"%s"}\n' "${version}" "${WORK}" "${version}" "${sha}" >"${WORK}/latest.json"
}
run() { rm -f "${WORK}/calls"; touch "${WORK}/calls"; "${FOLLOW}" 2>"${WORK}/log"; }

booted 1.0
publish 1.0
run
check "running version is left alone" '[[ ! -s "${WORK}/calls" ]]'

publish 2.0
run
check "new version is installed and tried" '[[ "$(cat "${WORK}/calls")" == $'"'"'install bundle 2.0\nreboot'"'"' ]]'
check "attempt is recorded" '[[ "$(cat "${SHOWROOM_OS_FOLLOW_STATE}/attempted")" == 2.0 ]]'

# Install done, trial boot not reached: the tryboot backend left a pending slot.
echo B >"${SHOWROOM_TRYBOOT_PENDING}"
run
check "an install that was never tried reboots into it" '[[ "$(cat "${WORK}/calls")" == reboot ]]'

# Tried and fell back: back on 1.0, pending cleared by showroom-os-commit.
echo B >"${SHOWROOM_TRYBOOT_ATTEMPTED}"
run
check "nothing happens during a trial boot" '[[ ! -s "${WORK}/calls" ]]'
rm -f "${SHOWROOM_TRYBOOT_PENDING}" "${SHOWROOM_TRYBOOT_ATTEMPTED}"
run
check "a version that fell back is not retried" '[[ ! -s "${WORK}/calls" ]] && grep -qxF 2.0 "${SHOWROOM_OS_FOLLOW_STATE}/failed"'

publish 3.0
run
check "the next version is installed" '[[ "$(head -n1 "${WORK}/calls")" == "install bundle 3.0" ]]'
booted 3.0
run
check "a committed version clears the attempt" '[[ ! -s "${WORK}/calls" && ! -e "${SHOWROOM_OS_FOLLOW_STATE}/attempted" ]] && ! grep -qxF 3.0 "${SHOWROOM_OS_FOLLOW_STATE}/failed"'

publish 4.0 0000000000000000000000000000000000000000000000000000000000000000
check "a bad checksum fails without installing" '! run && [[ ! -s "${WORK}/calls" ]]'

publish 5.0
touch "${WORK}/install-fails"
check "a refused bundle fails" '! run && [[ "$(cat "${WORK}/calls")" == "install bundle 5.0" ]]'
rm -f "${WORK}/install-fails"
run
check "a refused bundle is not retried" '[[ ! -s "${WORK}/calls" ]]'

if [[ "${failures}" != 0 ]]; then
  echo "${failures} os-follow check(s) failed" >&2
  exit 1
fi
echo "os-follow: all checks passed"
