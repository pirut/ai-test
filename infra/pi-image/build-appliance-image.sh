#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="${ROOT_DIR}/out"
BUILD_DIR="${OUT_DIR}/build-${SHOWROOM_DEVICE_LAYER:-rpi5}"
RELEASE_DIR="${OUT_DIR}/release-${SHOWROOM_DEVICE_LAYER:-rpi5}"
RIG_VERSION="${SHOWROOM_RPI_IMAGE_GEN_VERSION:-v2.7.0}"
RIG_DIR="${SHOWROOM_RPI_IMAGE_GEN_DIR:-${OUT_DIR}/rpi-image-gen-${RIG_VERSION}}"
DEVICE_LAYER="${SHOWROOM_DEVICE_LAYER:-rpi5}"
IMAGE_VERSION="${SHOWROOM_IMAGE_VERSION:-$(date -u +%Y.%m.%d.%H%M)}"
CONFIG_SOURCE="${ROOT_DIR}/rpi-image-gen/config/showroom.yaml"
CONFIG_GENERATED="${OUT_DIR}/showroom-${DEVICE_LAYER}.yaml"
PUBLIC_KEY_FILE="${SHOWROOM_RELEASE_PUBLIC_KEY_FILE:-${ROOT_DIR}/release-public.base64}"
BUILD_ARGS=()

case "${DEVICE_LAYER}" in
  rpi4|rpi5|cm4|cm5) ;;
  *) echo "SHOWROOM_DEVICE_LAYER must be rpi4, rpi5, cm4, or cm5" >&2; exit 1 ;;
esac

case "${DEVICE_LAYER}" in
  rpi4) export SHOWROOM_HARDWARE_PROFILE="${SHOWROOM_HARDWARE_PROFILE:-rpi4-industrial-sd}" ;;
  rpi5) export SHOWROOM_HARDWARE_PROFILE="${SHOWROOM_HARDWARE_PROFILE:-rpi5-industrial-sd}" ;;
  cm4) export SHOWROOM_HARDWARE_PROFILE="${SHOWROOM_HARDWARE_PROFILE:-cm4-emmc}" ;;
  cm5) export SHOWROOM_HARDWARE_PROFILE="${SHOWROOM_HARDWARE_PROFILE:-cm5-emmc}" ;;
esac

mkdir -p "${OUT_DIR}"
mkdir -p "${BUILD_DIR}"
if [[ -z "${SHOWROOM_RELEASE_PUBLIC_KEY:-}" && -f "${PUBLIC_KEY_FILE}" ]]; then
  export SHOWROOM_RELEASE_PUBLIC_KEY="$(tr -d '\r\n' < "${PUBLIC_KEY_FILE}")"
fi
"${ROOT_DIR}/prepare-appliance-rootfs.sh"

if [[ ! -d "${RIG_DIR}/.git" ]]; then
  git clone --depth 1 --branch "${RIG_VERSION}" https://github.com/raspberrypi/rpi-image-gen.git "${RIG_DIR}"
fi

if [[ "${SHOWROOM_INSTALL_BUILD_DEPS:-0}" == "1" ]]; then
  sudo "${RIG_DIR}/install_deps.sh"
fi

sed \
  -e "s/^  layer: rpi5$/  layer: ${DEVICE_LAYER}/" \
  -e "s/^  version: 1.0.0$/  version: ${IMAGE_VERSION}/" \
  "${CONFIG_SOURCE}" > "${CONFIG_GENERATED}"

if [[ -n "${SHOWROOM_CONNECT_AUTH_KEY:-}" ]]; then
  echo "Warning: embedded Connect auth keys are for small-batch commissioning only; use per-device organisation identities for fleet images." >&2
  BUILD_ARGS+=(-- "IGconf_connect_authkey=${SHOWROOM_CONNECT_AUTH_KEY}")
fi

(
  cd "${BUILD_DIR}"
  "${RIG_DIR}/rpi-image-gen" build \
    -S "${ROOT_DIR}/rpi-image-gen" \
    -c "${CONFIG_GENERATED}" \
    "${BUILD_ARGS[@]}"
)

IMAGE_WORK="${BUILD_DIR}/work/image-showroom-appliance"
RAW_IMAGE="${IMAGE_WORK}/showroom-appliance.img"
if [[ ! -f "${RAW_IMAGE}" ]]; then
  echo "Image generator completed without producing ${RAW_IMAGE}" >&2
  exit 1
fi

rm -rf "${RELEASE_DIR}"
mkdir -p "${RELEASE_DIR}"
RELEASE_IMAGE="${RELEASE_DIR}/showroom-${DEVICE_LAYER}-${IMAGE_VERSION}.img.xz"
xz -T0 -3 -c "${RAW_IMAGE}" > "${RELEASE_IMAGE}"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "${RELEASE_DIR}" && sha256sum "$(basename "${RELEASE_IMAGE}")" > SHA256SUMS.sha256)
else
  (cd "${RELEASE_DIR}" && shasum -a 256 "$(basename "${RELEASE_IMAGE}")" > SHA256SUMS.sha256)
fi

DEPLOY_DIR="$(find "${BUILD_DIR}/work" -maxdepth 1 -type d -name 'deploy-*' -print | sort | tail -n 1)"
if [[ -n "${DEPLOY_DIR}" ]]; then
  find "${DEPLOY_DIR}" -maxdepth 1 -type f \( -name '*sbom*.zst' -o -name 'manifest.zst' -o -name 'config.yaml.zst' \) -exec cp {} "${RELEASE_DIR}/" \;
fi

find "${RELEASE_DIR}" -maxdepth 1 -type f -print
