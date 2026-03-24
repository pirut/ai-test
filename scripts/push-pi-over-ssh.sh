#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ARTIFACTS_DIR="${ROOT_DIR}/infra/pi-image/artifacts"
SSH_USER="${SHOWROOM_SSH_USER:-pi}"
SSH_PASS="${SHOWROOM_SSH_PASS:-}"
SSH_PORT="${SHOWROOM_SSH_PORT:-22}"

if [[ -z "${SSH_PASS}" ]]; then
  echo "SHOWROOM_SSH_PASS is required." >&2
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "Usage: SHOWROOM_SSH_PASS=... $0 <host> [host ...]" >&2
  exit 1
fi

for required in showroom-agent player-release.tar.gz system-release.tar.gz; do
  if [[ ! -f "${ARTIFACTS_DIR}/${required}" ]]; then
    echo "Missing artifact: ${ARTIFACTS_DIR}/${required}" >&2
    exit 1
  fi
done

run_expect() {
  local mode="$1"
  local command="$2"

  expect <<EOF
set timeout 120
log_user 1
spawn ${mode} -P ${SSH_PORT} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ${command}
expect {
  "yes/no" { send "yes\r"; exp_continue }
  "password:" { send "${SSH_PASS}\r"; exp_continue }
  eof
}
catch wait result
set exit_status [lindex \$result 3]
exit \$exit_status
EOF
}

for host in "$@"; do
  echo "==> ${host}: uploading artifacts"
  run_expect \
    scp \
    "\"${ARTIFACTS_DIR}/showroom-agent\" \"${ARTIFACTS_DIR}/player-release.tar.gz\" \"${ARTIFACTS_DIR}/system-release.tar.gz\" ${SSH_USER}@${host}:/tmp/"

  echo "==> ${host}: installing"
  local_install_script="$(mktemp)"
  cat > "${local_install_script}" <<'EOS'
set -euo pipefail

install -d -m 0755 /tmp/showroom-update
mv /tmp/showroom-agent /tmp/showroom-update/showroom-agent
mv /tmp/player-release.tar.gz /tmp/showroom-update/player-release.tar.gz
mv /tmp/system-release.tar.gz /tmp/showroom-update/system-release.tar.gz

install -m 0755 /tmp/showroom-update/showroom-agent /usr/local/bin/showroom-agent

rm -rf /opt/showroom/player.next /opt/showroom/player.bak
mkdir -p /opt/showroom/player.next
tar -xzf /tmp/showroom-update/player-release.tar.gz -C /opt/showroom/player.next
if [[ -d /opt/showroom/player ]]; then
  mv /opt/showroom/player /opt/showroom/player.bak
fi
mv /opt/showroom/player.next /opt/showroom/player
rm -rf /opt/showroom/player.bak

tar -xzf /tmp/showroom-update/system-release.tar.gz -C /
systemctl restart showroom-agent.service
systemctl restart showroom-kiosk.service
systemctl is-active showroom-agent.service showroom-kiosk.service
cat /var/lib/showroom/state/device-state.json | sed -n '1,14p'
EOS

  run_expect \
    scp \
    "\"${local_install_script}\" ${SSH_USER}@${host}:/tmp/showroom-install.sh"

  run_expect \
    ssh \
    "${SSH_USER}@${host} \"sudo -S bash /tmp/showroom-install.sh && rm -f /tmp/showroom-install.sh\""

  rm -f "${local_install_script}"
done
