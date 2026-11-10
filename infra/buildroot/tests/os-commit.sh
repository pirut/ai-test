#!/bin/bash
# Checks are passed to eval, so they are single-quoted on purpose.
# shellcheck disable=SC2016
# Exercises showroom-os-commit with stand-ins for the tryboot backend, RAUC,
# systemd and the agent: a trial boot is committed only once the screen is
# healthy and the agent reached the service, anything else rolls back, an
# install whose restart never happened is tried, and a committed slot that
# keeps failing to start returns to the previous OS after three boots.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMMIT="${ROOT_DIR}/board/rpi5/rootfs-overlay/usr/libexec/showroom/showroom-os-commit"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
export WORK

export SHOWROOM_TRYBOOT_BACKEND="${WORK}/bin/backend"
export SHOWROOM_OS_REBOOT="${WORK}/bin/showroom-reboot"
export SHOWROOM_RAUC_STATE="${WORK}/rauc"
export SHOWROOM_STATE_ROOT="${WORK}/state"
export SHOWROOM_UPTIME_FILE="${WORK}/uptime"
export SHOWROOM_OS_COMMIT_POLL_SECONDS=0
export SHOWROOM_OS_COMMIT_POLLS=4
mkdir -p "${WORK}/bin" "${SHOWROOM_RAUC_STATE}" "${SHOWROOM_STATE_ROOT}"

# World state the stand-ins read: booted slot, fallback slot, which services
# run, whether the agent's health endpoint answers, and whether each poll
# brings a new cloud contact.
cat >"${WORK}/bin/backend" <<'STUB'
#!/bin/bash
echo "backend $*" >>"${WORK}/calls"
case "$1" in
  get-current) cat "${WORK}/booted" ;;
  get-fallback) [[ -s "${WORK}/fallback" ]] && cat "${WORK}/fallback" ;;
  fallback) [[ ! -e "${WORK}/fallback-fails" ]] ;;
  set-state) rm -f "${SHOWROOM_RAUC_STATE}/tryboot-pending" "${SHOWROOM_RAUC_STATE}/tryboot-attempted" ;;
esac
STUB
cat >"${WORK}/bin/showroom-reboot" <<'STUB'
#!/bin/bash
echo "tryboot-reboot" >>"${WORK}/calls"
STUB
cat >"${WORK}/bin/rauc" <<'STUB'
#!/bin/bash
echo "rauc $*" >>"${WORK}/calls"
rm -f "${SHOWROOM_RAUC_STATE}/tryboot-pending" "${SHOWROOM_RAUC_STATE}/tryboot-attempted"
STUB
cat >"${WORK}/bin/systemctl" <<'STUB'
#!/bin/bash
case "$1" in
  is-active) [[ -e "${WORK}/active-${3%.service}" ]] ;;
  reboot) echo reboot >>"${WORK}/calls" ;;
esac
STUB
cat >"${WORK}/bin/curl" <<'STUB'
#!/bin/bash
# Each health request stands for one poll: the agent reports a new contact
# with the service when it is online.
if [[ -e "${WORK}/online" ]]; then
  n="$(cat "${WORK}/contacts" 2>/dev/null || echo 0)"
  echo "$((n + 1))" >"${WORK}/contacts"
  printf '{"lastCloudContactAt":"contact-%s"}\n' "$((n + 1))" >"${SHOWROOM_STATE_ROOT}/device-state.json"
fi
url="${*: -1}"
if [[ "${url}" == *deep=1 ]]; then [[ -e "${WORK}/player-ok" ]]; else [[ -e "${WORK}/agent-ok" ]]; fi
STUB
chmod +x "${WORK}/bin/"*
export PATH="${WORK}/bin:${PATH}"

failures=0
check() {
  if eval "$2"; then echo "ok: $1"; else echo "FAIL: $1" >&2; failures=$((failures + 1)); fi
}
world() {
  rm -f "${WORK}"/active-* "${WORK}/agent-ok" "${WORK}/player-ok" "${WORK}/online" "${WORK}/fallback-fails"
  local flag
  for flag in "$@"; do touch "${WORK}/${flag}"; done
  echo 300 >"${WORK}/uptime"
}
healthy=(active-showroom-agent active-showroom-kiosk agent-ok player-ok)
run() { rm -f "${WORK}/calls"; touch "${WORK}/calls"; "${COMMIT}" 2>"${WORK}/log"; }
calls() { grep -v '^backend get-' "${WORK}/calls" | paste -sd, -; }
pending() { echo "$1" >"${SHOWROOM_RAUC_STATE}/tryboot-pending"; }
attempted() { echo "$1" >"${SHOWROOM_RAUC_STATE}/tryboot-attempted"; }
boot_count() { cat "${SHOWROOM_RAUC_STATE}/boot-count" 2>/dev/null || echo none; }
reason() { cat "${SHOWROOM_STATE_ROOT}/last-boot-reason" 2>/dev/null || true; }

echo '{"lastCloudContactAt":"before-the-update"}' >"${SHOWROOM_STATE_ROOT}/device-state.json"

# --- Trial boots ---------------------------------------------------------
echo B >"${WORK}/booted"
pending B; attempted B
world "${healthy[@]}" online
run
check "a healthy, online trial boot is committed" '[[ "$(calls)" == "rauc status mark-good booted" ]]'
check "a commit leaves no failed-boot count" '[[ "$(boot_count)" == none ]]'

pending B; attempted B
world "${healthy[@]}"
run
check "a trial boot that cannot reach the service rolls back" \
  '[[ "$(calls)" == "rauc status mark-bad booted,reboot" ]] && [[ "$(reason)" == *"could not reach the service"* ]]'
check "the rollback is counted" '[[ "$(cat "${SHOWROOM_STATE_ROOT}/rollback-count")" == 1 ]]'

pending B; attempted B
world active-showroom-agent agent-ok online
run
check "a trial boot without a working player rolls back" \
  '[[ "$(calls)" == "rauc status mark-bad booted,reboot" ]] && [[ "$(reason)" == *"failed its health check"* ]]'

pending B; attempted B
world "${healthy[@]}" online
run
check "a later good update clears the old rollback reason" '[[ -z "$(reason)" ]]'

# --- Back on the old slot -------------------------------------------------
echo A >"${WORK}/booted"
pending B; attempted B
world "${healthy[@]}" online
run
check "an update that never came up is marked bad and recorded" \
  '[[ "$(calls)" == "backend set-state B bad" ]] && [[ "$(reason)" == *"did not boot"* ]]'

pending B
rm -f "${SHOWROOM_RAUC_STATE}/tryboot-attempted"
run
check "an installed update that was never tried is restarted into" '[[ "$(calls)" == "tryboot-reboot" ]]'
rm -f "${SHOWROOM_RAUC_STATE}/tryboot-pending"

# --- Committed slot: failed-boot counter ----------------------------------
world "${healthy[@]}"
run
check "a stable boot leaves no count, online or not" '[[ -z "$(calls)" && "$(boot_count)" == none ]]'

world "${healthy[@]}"
echo 30 >"${WORK}/uptime"
run
check "a boot is not stable before two minutes" '[[ "$(boot_count)" == 1 ]]'

# No previous OS: an agent that never answers is counted but nothing restarts.
rm -f "${SHOWROOM_RAUC_STATE}/boot-count"
world active-showroom-kiosk
for _ in 1 2 3 4 5; do run; done
check "without a previous OS the screen is left alone" '[[ -z "$(calls)" && "$(boot_count)" == 3 ]]'

# With a previous OS: two restarts, then the fallback.
rm -f "${SHOWROOM_RAUC_STATE}/boot-count"
echo A >"${WORK}/fallback"
echo B >"${WORK}/booted"
run
check "first failed boot restarts" '[[ "$(calls)" == reboot && "$(boot_count)" == 1 ]]'
run
check "second failed boot restarts" '[[ "$(calls)" == reboot && "$(boot_count)" == 2 ]]'
run
check "third failed boot returns to the previous OS" \
  '[[ "$(calls)" == "backend fallback,reboot" && "$(boot_count)" == none ]] && [[ "$(reason)" == *"failed to start 3 times in a row"* ]]'

# Boots that die before the script can judge them (hang, watchdog reset,
# power cut) only leave the count behind; the next boot acts on it.
echo 3 >"${SHOWROOM_RAUC_STATE}/boot-count"
world "${healthy[@]}"
run
check "three dead boots fall back at the start of the fourth" '[[ "$(calls)" == "backend fallback,reboot" ]]'

echo 2 >"${SHOWROOM_RAUC_STATE}/boot-count"
world "${healthy[@]}"
run
check "a stable boot resets the count" '[[ -z "$(calls)" && "$(boot_count)" == none ]]'

echo 3 >"${SHOWROOM_RAUC_STATE}/boot-count"
world "${healthy[@]}" fallback-fails
run
check "an unusable fallback keeps the running slot" '[[ "$(calls)" == "backend fallback" && "$(boot_count)" == none ]]'

if [[ "${failures}" != 0 ]]; then
  echo "${failures} os-commit check(s) failed" >&2
  exit 1
fi
echo "os-commit: all checks passed"
