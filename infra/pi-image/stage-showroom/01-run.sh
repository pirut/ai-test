#!/bin/bash
set -euo pipefail

SHOWROOM_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
ARTIFACTS_DIR="${SHOWROOM_DIR}/artifacts"

if [[ ! -f "${ARTIFACTS_DIR}/showroom-agent" ]]; then
  echo "Missing ${ARTIFACTS_DIR}/showroom-agent. Run infra/pi-image/prepare-artifacts.sh first." >&2
  exit 1
fi

if [[ ! -d "${ARTIFACTS_DIR}/player" ]]; then
  echo "Missing ${ARTIFACTS_DIR}/player. Run infra/pi-image/prepare-artifacts.sh first." >&2
  exit 1
fi

install -D -m 0644 "${SHOWROOM_DIR}/systemd/showroom-agent.service" "${ROOTFS_DIR}/etc/systemd/system/showroom-agent.service"
install -D -m 0644 "${SHOWROOM_DIR}/systemd/showroom-kiosk.service" "${ROOTFS_DIR}/etc/systemd/system/showroom-kiosk.service"
install -D -m 0644 "${SHOWROOM_DIR}/config/config.env" "${ROOTFS_DIR}/etc/showroom-agent/config.env"
install -D -m 0755 "${SHOWROOM_DIR}/systemd/start-kiosk.sh" "${ROOTFS_DIR}/usr/local/bin/showroom-start-kiosk"
install -D -m 0755 "${ARTIFACTS_DIR}/showroom-agent" "${ROOTFS_DIR}/usr/local/bin/showroom-agent"
install -D -m 0644 "${SHOWROOM_DIR}/boot/network.env.example" "${ROOTFS_DIR}/boot/network.env.example"
mkdir -p "${ROOTFS_DIR}/opt/showroom/player"
cp -R "${ARTIFACTS_DIR}/player/." "${ROOTFS_DIR}/opt/showroom/player/"

on_chroot <<'EOF'
systemctl enable showroom-agent.service
systemctl enable showroom-kiosk.service
mkdir -p /var/lib/showroom/cache /var/lib/showroom/state /opt/showroom/player
EOF
