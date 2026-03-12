#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="${ROOT_DIR}/out"
PIGEN_BRANCH="${PIGEN_BRANCH:-arm64}"
PIGEN_REPO="${PIGEN_REPO:-https://github.com/RPi-Distro/pi-gen.git}"
PIGEN_DIR="${PIGEN_DIR:-${OUT_DIR}/pi-gen-${PIGEN_BRANCH}}"
DEPLOY_DIR="${OUT_DIR}/deploy"
CONFIG_FILE="${PIGEN_DIR}/config"
CONFIG_SNAPSHOT="${OUT_DIR}/pi-gen.config"
SHOWROOM_STAGE="${ROOT_DIR}/stage-showroom"
SHOWROOM_SYNC_DIR="${PIGEN_DIR}/showroom/stage-showroom"
CONTAINER_NAME="${SHOWROOM_CONTAINER_NAME:-showroom_pi_gen}"
CLEAN_BUILD="${SHOWROOM_CLEAN_BUILD:-0}"

if [[ -z "${SHOWROOM_FIRST_USER_PASS:-}" ]]; then
  echo "SHOWROOM_FIRST_USER_PASS is required." >&2
  echo "Example: SHOWROOM_FIRST_USER_PASS='your-password' ./infra/pi-image/build-image.sh" >&2
  exit 1
fi

mkdir -p "${OUT_DIR}" "${DEPLOY_DIR}"

if [[ ! -d "${PIGEN_DIR}/.git" ]]; then
  git clone --branch "${PIGEN_BRANCH}" --single-branch "${PIGEN_REPO}" "${PIGEN_DIR}"
fi

bash "${ROOT_DIR}/prepare-artifacts.sh"

mkdir -p "${SHOWROOM_SYNC_DIR}"
rsync -a --delete "${ROOT_DIR}/stage-showroom/" "${SHOWROOM_SYNC_DIR}/"
rsync -a --delete "${ROOT_DIR}/artifacts/" "${SHOWROOM_SYNC_DIR}/artifacts/"
rsync -a --delete "${ROOT_DIR}/boot/" "${SHOWROOM_SYNC_DIR}/boot/"
rsync -a --delete "${ROOT_DIR}/config/" "${SHOWROOM_SYNC_DIR}/config/"
rsync -a --delete "${ROOT_DIR}/systemd/" "${SHOWROOM_SYNC_DIR}/systemd/"

cat > "${CONFIG_FILE}" <<EOF
IMG_NAME='${SHOWROOM_IMAGE_NAME:-showroom}'
PI_GEN_RELEASE='${SHOWROOM_RELEASE_NAME:-Showroom Kiosk}'
RELEASE='${SHOWROOM_DEBIAN_RELEASE:-trixie}'
DEPLOY_COMPRESSION='${SHOWROOM_DEPLOY_COMPRESSION:-xz}'
LOCALE_DEFAULT='${SHOWROOM_LOCALE:-en_US.UTF-8}'
TARGET_HOSTNAME='${SHOWROOM_HOSTNAME:-showroom}'
KEYBOARD_KEYMAP='${SHOWROOM_KEYMAP:-us}'
KEYBOARD_LAYOUT='${SHOWROOM_KEYBOARD_LAYOUT:-English (US)}'
TIMEZONE_DEFAULT='${SHOWROOM_TIMEZONE:-America/New_York}'
WPA_COUNTRY='${SHOWROOM_WPA_COUNTRY:-US}'
ENABLE_SSH='${SHOWROOM_ENABLE_SSH:-1}'
FIRST_USER_NAME='pi'
FIRST_USER_PASS='${SHOWROOM_FIRST_USER_PASS}'
DISABLE_FIRST_BOOT_USER_RENAME='1'
PASSWORDLESS_SUDO='${SHOWROOM_PASSWORDLESS_SUDO:-1}'
STAGE_LIST='stage0 stage1 stage2 showroom/stage-showroom'
EOF

cp "${CONFIG_FILE}" "${CONFIG_SNAPSHOT}"

if [[ -n "${SHOWROOM_SSH_PUBKEY:-}" ]]; then
  printf "PUBKEY_SSH_FIRST_USER='%s'\n" "${SHOWROOM_SSH_PUBKEY}" >> "${CONFIG_FILE}"
  printf "PUBKEY_ONLY_SSH='%s'\n" "${SHOWROOM_PUBKEY_ONLY_SSH:-0}" >> "${CONFIG_FILE}"
fi

pushd "${PIGEN_DIR}" >/dev/null
if [[ "${CLEAN_BUILD}" == "1" ]] && docker ps -a --format '{{.Names}}' | grep -qx "${CONTAINER_NAME}"; then
  docker rm -v "${CONTAINER_NAME}" >/dev/null
fi
CONTAINER_NAME="${CONTAINER_NAME}" CONTINUE=1 PRESERVE_CONTAINER=1 ./build-docker.sh
popd >/dev/null

rsync -a --delete "${PIGEN_DIR}/deploy/" "${DEPLOY_DIR}/"

LATEST_IMAGE="$(find "${DEPLOY_DIR}" -maxdepth 1 -type f \( -name '*.img' -o -name '*.img.xz' -o -name '*.img.gz' -o -name '*.zip' \) | sort | tail -n 1)"

if [[ -z "${LATEST_IMAGE}" ]]; then
  echo "Build completed but no image artifact was found in ${DEPLOY_DIR}" >&2
  exit 1
fi

printf '%s\n' "${LATEST_IMAGE}" > "${OUT_DIR}/latest-image.txt"
echo "Built image: ${LATEST_IMAGE}"
echo "Recorded latest artifact in ${OUT_DIR}/latest-image.txt"
