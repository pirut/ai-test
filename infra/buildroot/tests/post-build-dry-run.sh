#!/bin/bash
# Runs board/rpi5/post-build.sh on the root filesystem overlay with stand-in
# agent, player and FFmpeg files, then applies the systemd presets the way
# Buildroot does. It checks what the board scripts decide without a full
# build: which appliance files from infra/pi-image reach the image, that
# every unit the presets enable exists and its program is installed, the
# agent configuration, and the differences between a customer image and a
# development image. Needs systemctl (for --root preset-all).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

fail() {
  echo "post-build dry run: $*" >&2
  exit 1
}

"${ROOT_DIR}/generate-rauc-keys.sh" "${WORK}/keys" >/dev/null 2>&1
mkdir -p "${WORK}/artifacts/player/bin" "${WORK}/build"
printf '#!/bin/sh\n' >"${WORK}/artifacts/showroom-agent"
printf '#!/bin/sh\n' >"${WORK}/artifacts/player/bin/showroom-player"
printf '<!doctype html>\n' >"${WORK}/artifacts/player/index.html"
chmod 0755 "${WORK}/artifacts/showroom-agent" "${WORK}/artifacts/player/bin/showroom-player"

# stage NAME [CHANNEL_URL]: the overlay, then post-build.sh, then the presets.
stage() {
  local target="${WORK}/$1" channel="${2:-}"
  mkdir -p "${target}/usr/lib"
  cp -a "${ROOT_DIR}/board/rpi5/rootfs-overlay/." "${target}/"
  printf 'VERSION_ID=2026.02.3\n' >"${target}/usr/lib/os-release"
  printf 'hevc_v4l2request\n' >"${target}/usr/lib/libavcodec.so.60"
  BR2_EXTERNAL_SHOWROOM_PATH="${ROOT_DIR}" BUILD_DIR="${WORK}/build" \
    SHOWROOM_ARTIFACTS_DIR="${WORK}/artifacts" SHOWROOM_IMAGE_VERSION=2026.11.09.1 \
    SHOWROOM_RAUC_KEYRING="${WORK}/keys/ca.cert.pem" SHOWROOM_OS_CHANNEL_URL="${channel}" \
    "${ROOT_DIR}/board/rpi5/post-build.sh" "${target}" >"${WORK}/post-build.log" 2>&1 || {
      cat "${WORK}/post-build.log" >&2
      return 1
    }
  systemctl --root="${target}" preset-all >/dev/null 2>&1 || fail "systemctl preset-all failed for $1"
}

has_line() {
  grep -qxF -- "$2" "$1" || fail "${1#"${WORK}"/} lacks the line '$2'"
}

# A customer (field) image.
stage field
field="${WORK}/field"

for path in \
  usr/local/bin/showroom-tailscale-join \
  etc/systemd/system/showroom-tailscale-join.service \
  etc/systemd/system/showroom-tailscale-join.timer \
  etc/NetworkManager/dnsmasq-shared.d/showroom-setup.conf \
  etc/profile.d/10-showroom-starting.sh \
  etc/profile.d/20-showroom-console.sh \
  etc/rauc/keyring.pem \
  usr/lib/clock-epoch \
  usr/local/libexec/showroom-agent \
  opt/showroom/player/bin/showroom-player; do
  [[ -e "${field}/${path}" || -L "${field}/${path}" ]] || fail "/${path} is missing"
done
# The built-in release, named after the image version, that
# showroom-data-layout links "current" to; 1.0.0 is its name in earlier images.
releases="${field}/usr/lib/showroom/releases"
[[ "$(readlink "${releases}/agent/2026.11.09.1/showroom-agent")" == /usr/local/libexec/showroom-agent ]] \
  || fail "the built-in agent release does not point at the agent"
[[ "$(readlink "${releases}/player/2026.11.09.1")" == /opt/showroom/player ]] \
  || fail "the built-in player release does not point at the player"
[[ "$(readlink "${releases}/agent/1.0.0")" == 2026.11.09.1 && "$(readlink "${releases}/player/1.0.0")" == 2026.11.09.1 ]] \
  || fail "the 1.0.0 names of the built-in releases are missing"
grep -qE '^[0-9]{10,}$' "${field}/usr/lib/showroom/build-epoch" || fail "the image has no build time"
has_line "${field}/etc/NetworkManager/dnsmasq-shared.d/showroom-setup.conf" 'address=/#/10.42.0.1'

config="${field}/etc/showroom-agent/config.env"
has_line "${config}" 'SHOWROOM_SETUP_HOTSPOT=1'
has_line "${config}" 'SHOWROOM_SYSTEM_UPDATE_COMMAND=/usr/libexec/showroom/showroom-os-install'
has_line "${config}" 'SHOWROOM_REBOOT_COMMAND=/usr/libexec/showroom/showroom-reboot'
has_line "${config}" 'SHOWROOM_YTDLP_MANAGED_VERSION=2026.07.04-aarch64'
grep -qE '^SHOWROOM_RELEASE_PUBLIC_KEY=[A-Za-z0-9+/]{43}=$' "${config}" || fail "config.env has no release public key"
grep -qE '^SHOWROOM_API_BASE_URL=https://' "${config}" || fail "config.env has no dashboard URL"
# Every setting once: the agent's EnvironmentFile takes the last one silently.
duplicates="$(sed -n 's/^\([A-Z_]*\)=.*/\1/p' "${config}" | sort | uniq -d)"
[[ -z "${duplicates}" ]] || fail "config.env sets ${duplicates//$'\n'/, } more than once"
# Commands in the configuration that live in the image's own directories.
while read -r program; do
  [[ -x "${field}${program}" ]] || fail "config.env names ${program}, which is not installed"
done < <(grep -oE '=(/usr/local/bin|/usr/libexec/showroom)/[A-Za-z0-9_-]+' "${config}" | cut -c2-)

# Every Showroom unit the presets enable exists and is enabled, and the
# programs the Showroom units run are in the image.
while read -r unit; do
  [[ -e "${field}/etc/systemd/system/${unit}" || -e "${field}/usr/lib/systemd/system/${unit}" ]] \
    || fail "the presets enable ${unit}, which is not installed"
  state="$(systemctl --root="${field}" is-enabled "${unit}" 2>&1 || true)"
  [[ "${state}" == enabled ]] || fail "${unit} should be enabled but is '${state}'"
done < <(sed -n 's/^enable \(showroom-.*\)$/\1/p' "${field}/usr/lib/systemd/system-preset/10-showroom.preset")
for unit in showroom-tailscale-join.timer showroom-kiosk-retry.timer showroom-os-commit.service \
  showroom-network-recovery.service; do
  grep -qxF "enable ${unit}" "${field}/usr/lib/systemd/system-preset/10-showroom.preset" \
    || fail "the presets do not enable ${unit}"
done
while IFS= read -r -d '' unit; do
  while read -r program; do
    [[ -x "${field}${program}" ]] || fail "${unit#"${field}"} runs ${program}, which is not installed"
  done < <(sed -n 's/^Exec[A-Za-z]*=[-@:+!|]*\(\/usr\/local\/bin\/[^ ]*\|\/usr\/libexec\/showroom\/[^ ]*\).*/\1/p' "${unit}")
  timer_unit="$(sed -n 's/^Unit=//p' "${unit}")"
  if [[ "${unit}" == *.timer ]]; then
    service="${timer_unit:-$(basename "${unit}" .timer).service}"
    [[ -e "${field}/etc/systemd/system/${service}" || -e "${field}/usr/lib/systemd/system/${service}" ]] \
      || fail "${unit#"${field}"} starts ${service}, which is not installed"
  fi
done < <(find "${field}/etc/systemd/system" "${field}/usr/lib/systemd/system" -maxdepth 1 -type f -name 'showroom-*' -print0)

# Mount points and bind sources of /etc/fstab: the root is read-only, so
# mount points outside /var (a tmpfs, where systemd creates them) must be in
# the image, and showroom-data-layout must create every directory that is
# bound from the data partition.
while read -r source mountpoint _; do
  [[ "${mountpoint}" == / ]] && continue
  [[ "${mountpoint}" == /var/* || -d "${field}${mountpoint}" ]] \
    || fail "fstab mount point ${mountpoint} is not in the image"
  if [[ "${source}" == /data/* ]]; then
    grep -qE "install -d .*\"\\\$\{DATA\}${source#/data}\"( |\$)" "${field}/usr/libexec/showroom/showroom-data-layout" \
      || fail "showroom-data-layout does not create ${source}"
  fi
done < <(grep -vE '^[[:space:]]*(#|$)' "${field}/etc/fstab")

# A customer image follows no OS channel, keeps the watchdog and says so.
[[ ! -e "${field}/etc/showroom/os-channel.env" ]] || fail "a customer image carries an OS channel"
[[ ! -e "${field}/etc/systemd/system.conf.d/90-showroom-dev.conf" ]] || fail "a customer image turns the watchdog off"
has_line "${field}/etc/systemd/system.conf.d/20-showroom-watchdog.conf" 'RuntimeWatchdogSec=15s'
has_line "${field}/usr/lib/os-release" 'VARIANT_ID=field'
has_line "${field}/usr/lib/os-release" 'VERSION_ID=2026.11.09.1'
has_line "${field}/usr/lib/os-release" 'PRETTY_NAME="Showroom OS 2026.11.09.1 (Buildroot 2026.02.3)"'
has_line "${field}/etc/showroom/image-variant" 'buildroot'
cmp -s "${WORK}/keys/ca.cert.pem" "${field}/etc/rauc/keyring.pem" || fail "the RAUC keyring is not the given CA"
for unit in showroom-os-follow.service showroom-os-follow.timer showroom-debug-log.service; do
  has_line "${field}/usr/lib/systemd/system/${unit}" 'ConditionPathExists=/etc/showroom/os-channel.env'
done

# A development image.
channel=https://github.com/example/showroom-os/releases/download/dev/latest.json
stage dev "${channel}"
dev="${WORK}/dev"
has_line "${dev}/etc/showroom/os-channel.env" "SHOWROOM_OS_CHANNEL_URL=${channel}"
has_line "${dev}/etc/systemd/system.conf.d/90-showroom-dev.conf" 'RuntimeWatchdogSec=off'
has_line "${dev}/usr/lib/os-release" 'VARIANT_ID=dev'
has_line "${dev}/usr/lib/os-release" 'PRETTY_NAME="Showroom OS 2026.11.09.1 dev (Buildroot 2026.02.3)"'

# Rebuilding the same output directory as a customer image drops the channel.
SHOWROOM_OS_CHANNEL_URL="" stage dev
[[ ! -e "${dev}/etc/showroom/os-channel.env" && ! -e "${dev}/etc/systemd/system.conf.d/90-showroom-dev.conf" ]] \
  || fail "a rebuild as a customer image keeps the development channel"

if stage bad 'http://example.com/latest.json' 2>/dev/null; then
  fail "a channel URL that is not https was accepted"
fi

echo "post-build dry run: appliance files, units, agent configuration and image variants are as expected"
