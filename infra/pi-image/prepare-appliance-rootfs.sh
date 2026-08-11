#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
OVERLAY_DIR="${ROOT_DIR}/rpi-image-gen/rootfs-overlay"

if [[ -z "${SHOWROOM_RELEASE_PUBLIC_KEY:-}" ]]; then
  echo "SHOWROOM_RELEASE_PUBLIC_KEY is required (base64 Ed25519 public key)" >&2
  exit 1
fi

install_file() {
  local mode="$1" source="$2" destination="$3"
  mkdir -p "$(dirname "${destination}")"
  install -m "${mode}" "${source}" "${destination}"
}

"${ROOT_DIR}/prepare-artifacts.sh"

install_file 0755 "${ROOT_DIR}/artifacts/showroom-agent" "${OVERLAY_DIR}/usr/local/libexec/showroom-agent"
install_file 0755 "${ROOT_DIR}/systemd/showroom-agent-launch" "${OVERLAY_DIR}/usr/local/bin/showroom-agent-launch"
install_file 0755 "${ROOT_DIR}/systemd/start-kiosk.sh" "${OVERLAY_DIR}/usr/local/bin/showroom-start-kiosk"
install_file 0755 "${ROOT_DIR}/systemd/showroom-diagnostics" "${OVERLAY_DIR}/usr/local/bin/showroom-diagnostics"
install_file 0755 "${ROOT_DIR}/systemd/showroom-recovery-screen" "${OVERLAY_DIR}/usr/local/bin/showroom-recovery-screen"
install_file 0755 "${ROOT_DIR}/systemd/showroom-kiosk-recovery" "${OVERLAY_DIR}/usr/local/bin/showroom-kiosk-recovery"
install_file 0755 "${ROOT_DIR}/systemd/showroom-kiosk-retry" "${OVERLAY_DIR}/usr/local/bin/showroom-kiosk-retry"
install_file 0755 "${ROOT_DIR}/systemd/showroom-update-guard" "${OVERLAY_DIR}/usr/local/bin/showroom-update-guard"
install_file 0755 "${ROOT_DIR}/systemd/showroom-network-recovery" "${OVERLAY_DIR}/usr/local/bin/showroom-network-recovery"
install_file 0755 "${ROOT_DIR}/systemd/showroom-network-onboarding" "${OVERLAY_DIR}/usr/local/bin/showroom-network-onboarding"
ln -sfn showroom-network-onboarding "${OVERLAY_DIR}/usr/local/bin/showroom-network-setup"
install_file 0644 "${ROOT_DIR}/systemd/showroom-agent.service" "${OVERLAY_DIR}/etc/systemd/system/showroom-agent.service"
install_file 0644 "${ROOT_DIR}/systemd/showroom-kiosk.service" "${OVERLAY_DIR}/etc/systemd/system/showroom-kiosk.service"
install_file 0644 "${ROOT_DIR}/systemd/showroom-kiosk-recovery.service" "${OVERLAY_DIR}/etc/systemd/system/showroom-kiosk-recovery.service"
install_file 0644 "${ROOT_DIR}/systemd/showroom-kiosk-retry.service" "${OVERLAY_DIR}/etc/systemd/system/showroom-kiosk-retry.service"
install_file 0644 "${ROOT_DIR}/systemd/showroom-kiosk-retry.timer" "${OVERLAY_DIR}/etc/systemd/system/showroom-kiosk-retry.timer"
install_file 0644 "${ROOT_DIR}/systemd/showroom-update-guard.service" "${OVERLAY_DIR}/etc/systemd/system/showroom-update-guard.service"
install_file 0644 "${ROOT_DIR}/systemd/showroom-network-recovery.service" "${OVERLAY_DIR}/etc/systemd/system/showroom-network-recovery.service"
install_file 0644 "${ROOT_DIR}/systemd/showroom-network-onboarding.service" "${OVERLAY_DIR}/etc/systemd/system/showroom-network-onboarding.service"
install_file 0644 "${ROOT_DIR}/config/config.env" "${OVERLAY_DIR}/etc/showroom-agent/config.env"
sed -i.bak "s|^SHOWROOM_RELEASE_PUBLIC_KEY=.*$|SHOWROOM_RELEASE_PUBLIC_KEY=${SHOWROOM_RELEASE_PUBLIC_KEY}|" "${OVERLAY_DIR}/etc/showroom-agent/config.env"
sed -i.bak "s|^SHOWROOM_HARDWARE_PROFILE=.*$|SHOWROOM_HARDWARE_PROFILE=${SHOWROOM_HARDWARE_PROFILE:-rpi5-standard}|" "${OVERLAY_DIR}/etc/showroom-agent/config.env"
rm -f "${OVERLAY_DIR}/etc/showroom-agent/config.env.bak"
install_file 0644 "${ROOT_DIR}/config/Xwrapper.config" "${OVERLAY_DIR}/etc/X11/Xwrapper.config"
install_file 0644 "${ROOT_DIR}/config/99-modesetting.conf" "${OVERLAY_DIR}/etc/X11/xorg.conf.d/99-modesetting.conf"
install_file 0644 "${ROOT_DIR}/config/getty-tty1-override.conf" "${OVERLAY_DIR}/etc/systemd/system/getty@tty1.service.d/override.conf"
install_file 0644 "${ROOT_DIR}/config/20-showroom-ssh.conf" "${OVERLAY_DIR}/etc/ssh/sshd_config.d/20-showroom.conf"
install_file 0644 "${ROOT_DIR}/config/20-showroom-console.sh" "${OVERLAY_DIR}/etc/profile.d/20-showroom-console.sh"
install_file 0644 "${ROOT_DIR}/config/20-showroom-kernel-console.conf" "${OVERLAY_DIR}/etc/sysctl.d/20-showroom-kernel-console.conf"
install_file 0440 "${ROOT_DIR}/config/showroom-maintenance.sudoers" "${OVERLAY_DIR}/etc/sudoers.d/020-showroom-maintenance"

mkdir -p "${OVERLAY_DIR}/opt/showroom/player"
rsync -a --delete "${ROOT_DIR}/artifacts/player/" "${OVERLAY_DIR}/opt/showroom/player/"
mkdir -p "${OVERLAY_DIR}/var/lib/showroom/releases/player/1.0.0" "${OVERLAY_DIR}/var/lib/showroom/releases/agent/1.0.0"
rsync -a --delete "${ROOT_DIR}/artifacts/player/" "${OVERLAY_DIR}/var/lib/showroom/releases/player/1.0.0/"
install -m 0755 "${ROOT_DIR}/artifacts/showroom-agent" "${OVERLAY_DIR}/var/lib/showroom/releases/agent/1.0.0/showroom-agent"
ln -sfn 1.0.0 "${OVERLAY_DIR}/var/lib/showroom/releases/player/current"
ln -sfn 1.0.0 "${OVERLAY_DIR}/var/lib/showroom/releases/agent/current"

echo "Prepared appliance root filesystem overlay at ${OVERLAY_DIR}"
