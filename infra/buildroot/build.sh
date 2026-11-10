#!/bin/bash
# Builds Showroom OS, the Buildroot image for Raspberry Pi 5 screens.
#
#   SHOWROOM_IMAGE_VERSION=2026.10.22.1 ./infra/buildroot/build.sh
#
# Runs on Linux (x86_64 or arm64) with Buildroot's host dependencies plus Go,
# Node and Rust for the agent and player (infra/pi-image/prepare-artifacts.sh).
# The flash image, OS update bundle and checksums land in
# infra/buildroot/out/images.
#
# Bundle signing: set SHOWROOM_RAUC_CERT and SHOWROOM_RAUC_KEY (the signing
# pair) and SHOWROOM_RAUC_KEYRING (the CA baked into the image). Without them
# the build makes throwaway development keys, so its bundles only install on
# images from the same output directory.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "${ROOT_DIR}/../.." && pwd)"
BUILDROOT_VERSION="${SHOWROOM_BUILDROOT_VERSION:-2026.02.3}"
BUILDROOT_DIR="${SHOWROOM_BUILDROOT_DIR:-${ROOT_DIR}/.buildroot-${BUILDROOT_VERSION}}"
OUTPUT_DIR="${SHOWROOM_BUILDROOT_OUTPUT:-${ROOT_DIR}/out}"
export BR2_DL_DIR="${BR2_DL_DIR:-${ROOT_DIR}/.dl}"
export SHOWROOM_IMAGE_VERSION="${SHOWROOM_IMAGE_VERSION:-$(date -u +%Y.%m.%d)-dev}"
export SHOWROOM_ARTIFACTS_DIR="${SHOWROOM_ARTIFACTS_DIR:-${REPO_DIR}/infra/pi-image/artifacts}"

if [[ ! -f "${BUILDROOT_DIR}/Makefile" ]]; then
  git clone --depth 1 --branch "${BUILDROOT_VERSION}" \
    https://gitlab.com/buildroot.org/buildroot.git "${BUILDROOT_DIR}"
fi

if [[ -z "${SHOWROOM_RAUC_CERT:-}" || -z "${SHOWROOM_RAUC_KEY:-}" ]]; then
  dev_keys="${OUTPUT_DIR}/rauc-dev-keys"
  if [[ ! -s "${dev_keys}/signing.key.pem" ]]; then
    "${ROOT_DIR}/generate-rauc-keys.sh" "${dev_keys}"
  fi
  echo "WARNING: signing OS bundles with development keys from ${dev_keys}" >&2
  export SHOWROOM_RAUC_CERT="${dev_keys}/signing.cert.pem"
  export SHOWROOM_RAUC_KEY="${dev_keys}/signing.key.pem"
  export SHOWROOM_RAUC_KEYRING="${dev_keys}/ca.cert.pem"
fi
export SHOWROOM_RAUC_KEYRING="${SHOWROOM_RAUC_KEYRING:-${SHOWROOM_RAUC_CERT}}"

if [[ "${SHOWROOM_SKIP_ARTIFACTS:-0}" != "1" ]]; then
  SHOWROOM_REQUIRE_NATIVE_PLAYER=1 "${REPO_DIR}/infra/pi-image/prepare-artifacts.sh"
fi

make -C "${BUILDROOT_DIR}" O="${OUTPUT_DIR}" BR2_EXTERNAL="${ROOT_DIR}" showroom_rpi5_defconfig
make -C "${BUILDROOT_DIR}" O="${OUTPUT_DIR}"

echo "Showroom OS ${SHOWROOM_IMAGE_VERSION} is in ${OUTPUT_DIR}/images"
