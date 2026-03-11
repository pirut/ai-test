#!/bin/bash
set -euo pipefail

SHOWROOM_DIR="$(cd "$(dirname "$0")"/.. && pwd)"

install -D -m 0644 "${SHOWROOM_DIR}/systemd/showroom-agent.service" "${ROOTFS_DIR}/etc/systemd/system/showroom-agent.service"
install -D -m 0644 "${SHOWROOM_DIR}/systemd/showroom-kiosk.service" "${ROOTFS_DIR}/etc/systemd/system/showroom-kiosk.service"
install -D -m 0644 "${SHOWROOM_DIR}/config/config.env" "${ROOTFS_DIR}/etc/showroom-agent/config.env"
install -D -m 0755 "${SHOWROOM_DIR}/systemd/start-kiosk.sh" "${ROOTFS_DIR}/usr/local/bin/showroom-start-kiosk"
install -D -m 0644 "${SHOWROOM_DIR}/boot/network.env.example" "${ROOTFS_DIR}/boot/network.env.example"

on_chroot <<'EOF'
systemctl enable showroom-agent.service
systemctl enable showroom-kiosk.service
mkdir -p /var/lib/showroom/cache /var/lib/showroom/state /opt/showroom/player
EOF
