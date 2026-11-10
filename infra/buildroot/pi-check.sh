#!/bin/bash
# Boot-and-play check for a real Showroom OS screen, run from a laptop over
# SSH (Tailscale SSH, or any SSH on a bench screen):
#
#   ./infra/buildroot/pi-check.sh root@showroom-test
#   ./infra/buildroot/pi-check.sh root@showroom-test --restarts 3 --soak 30
#   ./infra/buildroot/pi-check.sh root@showroom-test --restarts 0
#
# It runs the on-device self-test (showroom-selftest, the copy in this
# checkout), restarts the screen and checks that it comes back by itself and
# shows the same thing again, then keeps watching for a restart nobody asked
# for. This is the part the QEMU test in CI cannot do: the real display and
# GPU, hardware video decoding, the power supply, the watchdog and the
# firmware's boot slots.
#
#   --restarts N    restart the screen N times, checking after each (default 1;
#                   0 never restarts it)
#   --soak MINUTES  after the last check, watch this long for an unexpected
#                   restart and check once more (default 3)
#   --expect WHAT   any (default), setup or playing; see showroom-selftest
#
# The screen goes dark for about a minute per restart, so do not point this
# at a screen customers are looking at. The SSH user must be root or have
# passwordless sudo. Works from Linux and macOS.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SELFTEST="${ROOT_DIR}/board/rpi5/rootfs-overlay/usr/libexec/showroom/showroom-selftest"
# How long a screen may take to answer again after a restart, and to settle
# (pair state read, content playing) once it does.
BOOT_TIMEOUT=300
SETTLE_TIMEOUT=240

usage() {
  awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0" >&2
  exit 2
}

target=""
restarts=1
soak=3
expect=any
while (( $# > 0 )); do
  case "$1" in
    --restarts) restarts="${2:-}"; shift 2 ;;
    --soak) soak="${2:-}"; shift 2 ;;
    --expect) expect="${2:-}"; shift 2 ;;
    -h | --help) usage ;;
    -*) usage ;;
    *) [[ -z "${target}" ]] || usage; target="$1"; shift ;;
  esac
done
[[ -n "${target}" && "${restarts}" =~ ^[0-9]+$ && "${soak}" =~ ^[0-9]+$ ]] || usage
case "${expect}" in any | setup | playing) ;; *) usage ;; esac

say() {
  printf '\n== %s\n' "$*"
}

# Runs a bash script on the screen as root. It travels base64-encoded so any
# login shell can run the command line; the arguments are plain words.
remote() {
  local encoded
  encoded="$(printf '%s' "$1" | base64 | tr -d '\n')"
  shift
  ssh -o BatchMode=yes -o ConnectTimeout=10 "${target}" \
    "s=\"\$(echo ${encoded} | base64 -d)\"; if [ \"\$(id -u)\" = 0 ]; then bash -c \"\$s\" _ $*; else sudo -n bash -c \"\$s\" _ $*; fi"
}

boot_id() {
  remote 'cat /proc/sys/kernel/random/boot_id' 2>/dev/null | tr -d '\r\n'
}

selftest() {
  remote "$(cat "${SELFTEST}")" --expect "${expect}" --wait "${SETTLE_TIMEOUT}" --logs
}

# Waits until the screen answers with a boot id other than $1.
wait_for_new_boot() {
  local previous="$1" deadline=$(( SECONDS + BOOT_TIMEOUT )) current
  while (( SECONDS < deadline )); do
    sleep 5
    current="$(boot_id || true)"
    if [[ -n "${current}" && "${current}" != "${previous}" ]]; then
      printf '%s' "${current}"
      return 0
    fi
  done
  return 1
}

failures=0
check() {
  if selftest; then
    return 0
  fi
  failures=$((failures + 1))
  return 0
}

current="$(boot_id || true)"
if [[ -z "${current}" ]]; then
  echo "pi-check: cannot reach ${target} over SSH" >&2
  exit 2
fi
remote 'sed -n "s/^PRETTY_NAME=//p" /etc/os-release | tr -d "\""; tr -d "\0" </proc/device-tree/model 2>/dev/null; echo'

say "Self-test as found"
check

for (( round = 1; round <= restarts; round++ )); do
  say "Restart ${round} of ${restarts}"
  # showroom-reboot is what the agent uses; it returns before the screen goes down.
  remote 'nohup /usr/libexec/showroom/showroom-reboot >/dev/null 2>&1 &' || true
  if ! next="$(wait_for_new_boot "${current}")"; then
    echo "FAIL: ${target} did not come back within ${BOOT_TIMEOUT} seconds of restart ${round}" >&2
    exit 1
  fi
  current="${next}"
  echo "back up (boot ${current})"
  check
  # A restart loop shows up as another new boot id right after a good one.
  after="$(boot_id || true)"
  if [[ "${after}" != "${current}" ]]; then
    echo "FAIL: ${target} restarted again by itself right after restart ${round}" >&2
    exit 1
  fi
done

if (( soak > 0 )); then
  say "Watching for ${soak} minute(s)"
  deadline=$(( SECONDS + soak * 60 ))
  missed=0
  while (( SECONDS < deadline )); do
    sleep 20
    seen="$(boot_id || true)"
    if [[ -z "${seen}" ]]; then
      missed=$((missed + 1))
      if (( missed >= 6 )); then
        echo "FAIL: ${target} stopped answering for two minutes" >&2
        exit 1
      fi
    elif [[ "${seen}" != "${current}" ]]; then
      echo "FAIL: ${target} restarted by itself while it was only being watched" >&2
      exit 1
    else
      missed=0
    fi
  done
  check
fi

say "Result"
if (( failures > 0 )); then
  echo "FAIL: ${failures} self-test run(s) failed on ${target}; see above"
  exit 1
fi
echo "PASS: ${target} booted ${restarts} time(s) on request, came back each time and stayed up"
