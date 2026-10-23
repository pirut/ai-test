#!/bin/bash
# Buildroot post-build script for Showroom OS on the Raspberry Pi 5.
#
# Installs the same appliance scripts and units as the Raspberry Pi OS image
# (infra/pi-image), the prebuilt agent and player bundle, and the release and
# RAUC verification keys. Inputs come from the environment; build.sh sets
# them:
#
#   SHOWROOM_ARTIFACTS_DIR        output of infra/pi-image/prepare-artifacts.sh
#   SHOWROOM_IMAGE_VERSION        version written to /etc/os-release
#   SHOWROOM_RAUC_KEYRING         PEM CA certificate that signs OS bundles
#   SHOWROOM_RELEASE_PUBLIC_KEY   optional; defaults to release-public.base64
#   SHOWROOM_OS_CHANNEL_URL       optional, development images only: the OS
#                                 channel a test screen follows (showroom-os-follow)
set -euo pipefail

TARGET="${1:?target directory is required}"
PI_IMAGE="$(cd "${BR2_EXTERNAL_SHOWROOM_PATH}/../pi-image" && pwd)"
SYSTEMD_SRC="${PI_IMAGE}/systemd"
CONFIG_SRC="${PI_IMAGE}/config"
OVERLAY_SRC="${PI_IMAGE}/rpi-image-gen/rootfs-overlay"
ARTIFACTS="${SHOWROOM_ARTIFACTS_DIR:-${PI_IMAGE}/artifacts}"
VERSION="${SHOWROOM_IMAGE_VERSION:-dev}"
RELEASE_KEY="${SHOWROOM_RELEASE_PUBLIC_KEY:-$(tr -d '[:space:]' <"${PI_IMAGE}/release-public.base64")}"
KEYRING="${SHOWROOM_RAUC_KEYRING:?SHOWROOM_RAUC_KEYRING must name the RAUC signing CA certificate}"

# yt-dlp's standalone arm64 build, so the image needs no Python.
YTDLP_VERSION=2026.07.04
YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp_linux_aarch64"
YTDLP_SHA256=b6ce97646773070d7a7ffd6bbbdcaecb47c48483909c54c915bf08a7a9b5e0b1

fail() {
  echo "post-build: $*" >&2
  exit 1
}

[[ -x "${ARTIFACTS}/showroom-agent" ]] || fail "${ARTIFACTS}/showroom-agent is missing; run infra/pi-image/prepare-artifacts.sh"
[[ -x "${ARTIFACTS}/player/bin/showroom-player" ]] || fail "the player bundle has no native player; build it with SHOWROOM_REQUIRE_NATIVE_PLAYER=1"
[[ -s "${KEYRING}" ]] || fail "RAUC keyring ${KEYRING} is missing"
[[ -n "${RELEASE_KEY}" ]] || fail "no release public key"

# The agent and player bundle baked into the image. Signed app releases
# install newer versions under /var/lib/showroom/releases, as on Raspberry Pi
# OS; the launchers fall back to these.
install -D -m 0755 "${ARTIFACTS}/showroom-agent" "${TARGET}/usr/local/libexec/showroom-agent"
rm -rf "${TARGET}/opt/showroom/player"
mkdir -p "${TARGET}/opt/showroom/player"
cp -a "${ARTIFACTS}/player/." "${TARGET}/opt/showroom/player/"

# The built-in versions as release 1.0.0, like the Raspberry Pi OS image
# seeds /var/lib/showroom/releases. showroom-data-layout points the
# persistent "current" links here on first boot; the agent needs them to
# install and roll back signed app releases.
install -d "${TARGET}/usr/lib/showroom/releases/agent/1.0.0" "${TARGET}/usr/lib/showroom/releases/player"
ln -sfn /usr/local/libexec/showroom-agent "${TARGET}/usr/lib/showroom/releases/agent/1.0.0/showroom-agent"
ln -sfn /opt/showroom/player "${TARGET}/usr/lib/showroom/releases/player/1.0.0"

# Appliance scripts and units, unchanged from the Raspberry Pi OS image. The
# legacy Chromium kiosk (start-kiosk.sh) is left out: there is no X11 here.
for script in \
  showroom-agent-launch showroom-kiosk-launch showroom-screenshot \
  showroom-diagnostics showroom-recovery-screen showroom-kiosk-recovery \
  showroom-kiosk-retry showroom-kiosk-ready showroom-update-guard \
  showroom-network-recovery showroom-network-onboarding; do
  install -D -m 0755 "${SYSTEMD_SRC}/${script}" "${TARGET}/usr/local/bin/${script}"
done
ln -sfn showroom-network-onboarding "${TARGET}/usr/local/bin/showroom-network-setup"
for unit in \
  showroom-agent.service showroom-kiosk.service showroom-kiosk-recovery.service \
  showroom-kiosk-retry.service showroom-kiosk-retry.timer showroom-update-guard.service \
  showroom-network-recovery.service showroom-network-onboarding.service; do
  install -D -m 0644 "${SYSTEMD_SRC}/${unit}" "${TARGET}/etc/systemd/system/${unit}"
done

# Remote SSH over Tailscale and the setup hotspot's captive DNS, from the
# Raspberry Pi OS image once they are there.
if [[ -f "${SYSTEMD_SRC}/showroom-tailscale-join" ]]; then
  install -D -m 0755 "${SYSTEMD_SRC}/showroom-tailscale-join" "${TARGET}/usr/local/bin/showroom-tailscale-join"
  for unit in showroom-tailscale-join.service showroom-tailscale-join.timer; do
    install -D -m 0644 "${SYSTEMD_SRC}/${unit}" "${TARGET}/etc/systemd/system/${unit}"
  done
fi
if [[ -f "${CONFIG_SRC}/showroom-setup-dnsmasq.conf" ]]; then
  install -D -m 0644 "${CONFIG_SRC}/showroom-setup-dnsmasq.conf" \
    "${TARGET}/etc/NetworkManager/dnsmasq-shared.d/showroom-setup.conf"
fi

install -D -m 0644 "${CONFIG_SRC}/getty-tty1-override.conf" "${TARGET}/etc/systemd/system/getty@tty1.service.d/override.conf"
install -D -m 0644 "${CONFIG_SRC}/20-showroom-console.sh" "${TARGET}/etc/profile.d/20-showroom-console.sh"
install -D -m 0644 "${CONFIG_SRC}/20-showroom-kernel-console.conf" "${TARGET}/etc/sysctl.d/20-showroom-kernel-console.conf"
install -D -m 0440 "${CONFIG_SRC}/showroom-maintenance.sudoers" "${TARGET}/etc/sudoers.d/020-showroom-maintenance"
install -D -m 0440 "${BR2_EXTERNAL_SHOWROOM_PATH}/board/rpi5/showroom-os.sudoers" "${TARGET}/etc/sudoers.d/021-showroom-os"
install -D -m 0644 "${OVERLAY_SRC}/etc/systemd/system.conf.d/20-showroom-watchdog.conf" \
  "${TARGET}/etc/systemd/system.conf.d/20-showroom-watchdog.conf"
install -D -m 0644 "${OVERLAY_SRC}/etc/systemd/journald.conf.d/20-showroom-limits.conf" \
  "${TARGET}/etc/systemd/journald.conf.d/20-showroom-limits.conf"

# Agent configuration: the Raspberry Pi OS file with the Showroom OS
# differences (no Python for the yt-dlp zipapp, tryboot-aware reboot, RAUC
# OS bundles).
config="${TARGET}/etc/showroom-agent/config.env"
install -D -m 0644 "${CONFIG_SRC}/config.env" "${config}"
sed -i \
  -e "s|^SHOWROOM_RELEASE_PUBLIC_KEY=.*$|SHOWROOM_RELEASE_PUBLIC_KEY=${RELEASE_KEY}|" \
  -e "s|^SHOWROOM_YTDLP_MANAGED_VERSION=.*$|SHOWROOM_YTDLP_MANAGED_VERSION=${YTDLP_VERSION}-aarch64|" \
  -e "s|^SHOWROOM_YTDLP_MANAGED_URL=.*$|SHOWROOM_YTDLP_MANAGED_URL=${YTDLP_URL}|" \
  -e "s|^SHOWROOM_YTDLP_MANAGED_SHA256=.*$|SHOWROOM_YTDLP_MANAGED_SHA256=${YTDLP_SHA256}|" \
  -e "s|^SHOWROOM_REBOOT_COMMAND=.*$|SHOWROOM_REBOOT_COMMAND=/usr/libexec/showroom/showroom-reboot|" \
  "${config}"
printf 'SHOWROOM_SYSTEM_UPDATE_COMMAND=/usr/libexec/showroom/showroom-os-install\n' >>"${config}"

# OS bundle verification.
install -D -m 0644 "${KEYRING}" "${TARGET}/etc/rauc/keyring.pem"

# Mount points on the read-only root.
mkdir -p "${TARGET}/data" "${TARGET}/var/lib/showroom" "${TARGET}/var/lib/tailscale" \
  "${TARGET}/etc/NetworkManager/system-connections"

# Development images follow an OS channel so a test screen gets every new
# build without reflashing. Field images have no channel file.
rm -f "${TARGET}/etc/showroom/os-channel.env"
variant=""
variant_id=field
if [[ -n "${SHOWROOM_OS_CHANNEL_URL:-}" ]]; then
  [[ "${SHOWROOM_OS_CHANNEL_URL}" =~ ^https://[A-Za-z0-9._~:/?#@!$\&*+,\;=%-]+$ ]] \
    || fail "SHOWROOM_OS_CHANNEL_URL must be an https URL"
  install -d "${TARGET}/etc/showroom"
  printf 'SHOWROOM_OS_CHANNEL_URL=%s\n' "${SHOWROOM_OS_CHANNEL_URL}" >"${TARGET}/etc/showroom/os-channel.env"
  variant=" dev"
  variant_id=dev
fi

# Identity reported in heartbeats (the agent sends PRETTY_NAME).
buildroot_version="$(sed -n 's/^VERSION_ID=//p' "${TARGET}/usr/lib/os-release" 2>/dev/null | tr -d '"')"
rm -f "${TARGET}/etc/os-release"
cat >"${TARGET}/usr/lib/os-release" <<EOF
NAME="Showroom OS"
ID=showroom-os
ID_LIKE=buildroot
VERSION_ID=${VERSION}
IMAGE_ID=showroom-rpi5
IMAGE_VERSION=${VERSION}
VARIANT_ID=${variant_id}
PRETTY_NAME="Showroom OS ${VERSION}${variant} (Buildroot ${buildroot_version:-unknown})"
EOF
ln -sfn ../usr/lib/os-release "${TARGET}/etc/os-release"
install -d "${TARGET}/etc/showroom"
printf 'buildroot\n' >"${TARGET}/etc/showroom/image-variant"

# The HEVC decoder only works through Raspberry Pi's FFmpeg patches; fail the
# build if they were not applied (for example after a Buildroot bump changes
# the FFmpeg version and patches/ffmpeg/<version> no longer matches).
libavcodec="$(find "${TARGET}/usr/lib" -maxdepth 1 -name 'libavcodec.so.*' -type f | head -n 1)"
[[ -n "${libavcodec}" ]] || fail "libavcodec is missing"
grep -q hevc_v4l2request "${libavcodec}" || fail "libavcodec has no hevc_v4l2request hwaccel; check patches/ffmpeg"
