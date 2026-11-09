#!/bin/bash
# The remote scripts are single-quoted on purpose: they expand on the screen.
# shellcheck disable=SC2016
# Pushes a local build of the player and/or agent straight to a test screen
# over SSH, without a release or a new image:
#
#   ./infra/pi-image/dev-push.sh root@showroom-test            # player and agent
#   ./infra/pi-image/dev-push.sh root@showroom-test player     # player only
#   ./infra/pi-image/dev-push.sh root@showroom-test --revert   # back to before the first push
#
# It installs the build as a "dev-<time>" release next to the signed ones in
# /var/lib/showroom/releases, switches the "current" link and restarts the
# service, so the next signed app release or OS update replaces it as usual.
#
# It only touches screens marked as test devices: Showroom OS development
# images (they follow an OS channel) or a screen where someone ran
#   sudo touch /var/lib/showroom/dev-device
# The SSH user must be root or have passwordless sudo. Set
# SHOWROOM_SKIP_BUILD=1 to push the artifacts from the last build again.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
ARTIFACTS_DIR="${SHOWROOM_ARTIFACTS_DIR:-${ROOT_DIR}/artifacts}"

usage() {
  awk 'NR > 3 && /^#/ { sub(/^# ?/, ""); print; next } NR > 3 { exit }' "$0" >&2
  exit 2
}

[[ $# -ge 1 ]] || usage
target="$1"
what="${2:-all}"
case "${what}" in
  all | player | agent | --revert) ;;
  *) usage ;;
esac

# Every remote script starts here: it refuses anything but a test device.
GUARD='set -euo pipefail
if [[ ! -e /etc/showroom/os-channel.env && ! -e /var/lib/showroom/dev-device ]]; then
  echo "dev-push: $(hostname) is not marked as a test device; run \"sudo touch /var/lib/showroom/dev-device\" on it first" >&2
  exit 3
fi
RELEASES=/var/lib/showroom/releases
'

# Runs a bash script on the screen as root with simple word arguments; stdin
# is passed through. The script travels base64-encoded so any login shell can
# run the command line.
remote() {
  local script="${GUARD}$1" encoded arg
  shift
  for arg in "$@"; do
    [[ "${arg}" =~ ^[A-Za-z0-9._@-]+$ ]] || { echo "dev-push: bad remote argument ${arg}" >&2; exit 2; }
  done
  encoded="$(printf '%s' "${script}" | base64 | tr -d '\n')"
  ssh -o BatchMode=yes -o ConnectTimeout=15 "${target}" \
    "s=\"\$(echo ${encoded} | base64 -d)\"; if [ \"\$(id -u)\" = 0 ]; then bash -c \"\$s\" _ $*; else sudo -n bash -c \"\$s\" _ $*; fi"
}

REVERT='for kind in agent player; do
  saved="${RELEASES}/${kind}/dev-previous"
  [[ -s "${saved}" ]] || continue
  ln -sfn "$(cat "${saved}")" "${RELEASES}/${kind}/current.next"
  mv -T "${RELEASES}/${kind}/current.next" "${RELEASES}/${kind}/current"
  rm -f "${saved}"
  find "${RELEASES}/${kind}" -mindepth 1 -maxdepth 1 -name "dev-*" -exec rm -rf {} +
  echo "dev-push: ${kind} is back on $(readlink "${RELEASES}/${kind}/current")"
done
systemctl restart showroom-agent.service showroom-kiosk.service
'

INSTALL='kind="$1" version="$2" service="$3"
dir="${RELEASES}/${kind}/${version}"
rm -rf "${dir}.partial"
mkdir -p "${dir}.partial"
tar -xzf - -C "${dir}.partial"
mv -T "${dir}.partial" "${dir}"
# Remember where the screen was before the first dev push, for --revert.
if [[ ! -s "${RELEASES}/${kind}/dev-previous" ]]; then
  readlink "${RELEASES}/${kind}/current" >"${RELEASES}/${kind}/dev-previous"
fi
ln -sfn "${version}" "${RELEASES}/${kind}/current.next"
mv -T "${RELEASES}/${kind}/current.next" "${RELEASES}/${kind}/current"
# Keep the three newest dev pushes.
find "${RELEASES}/${kind}" -mindepth 1 -maxdepth 1 -name "dev-2*" -printf "%f\n" \
  | sort -r | tail -n +4 | while read -r old; do rm -rf "${RELEASES:?}/${kind}/${old}"; done
systemctl restart "${service}"
echo "dev-push: ${kind} is now ${version}; journalctl -fu ${service} to follow it"
'

if [[ "${what}" == --revert ]]; then
  remote "${REVERT}"
  exit 0
fi

# Fail before building if the screen is unreachable or not a test device.
remote ':' </dev/null

if [[ "${SHOWROOM_SKIP_BUILD:-0}" != 1 ]]; then
  SHOWROOM_REQUIRE_NATIVE_PLAYER=1 "${ROOT_DIR}/prepare-artifacts.sh"
fi

version="dev-$(date -u +%Y%m%d%H%M%S)"
stage="$(mktemp -d)"
chmod 0755 "${stage}"
trap 'rm -rf "${stage}"' EXIT

push() {
  local kind="$1" service="$2" source="$3"
  echo "dev-push: ${kind} ${version} -> ${target}"
  tar -C "${source}" -czf - . | remote "${INSTALL}" "${kind}" "${version}" "${service}"
}

if [[ "${what}" == all || "${what}" == player ]]; then
  push player showroom-kiosk.service "${ARTIFACTS_DIR}/player"
fi
if [[ "${what}" == all || "${what}" == agent ]]; then
  install -m 0755 "${ARTIFACTS_DIR}/showroom-agent" "${stage}/showroom-agent"
  push agent showroom-agent.service "${stage}"
fi
