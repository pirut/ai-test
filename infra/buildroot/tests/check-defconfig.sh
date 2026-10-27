#!/bin/bash
# Resolves showroom_rpi5_defconfig against the pinned Buildroot and fails if
# Kconfig dropped or flipped any option it sets (a renamed symbol or an unmet
# dependency would otherwise silently leave a package out of the image).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILDROOT_VERSION="${SHOWROOM_BUILDROOT_VERSION:-2026.02.3}"
BUILDROOT_DIR="${SHOWROOM_BUILDROOT_DIR:-${ROOT_DIR}/.buildroot-${BUILDROOT_VERSION}}"
DEFCONFIG="${ROOT_DIR}/configs/showroom_rpi5_defconfig"
OUTPUT_DIR="$(mktemp -d)"
trap 'rm -rf "${OUTPUT_DIR}"' EXIT

if [[ ! -f "${BUILDROOT_DIR}/Makefile" ]]; then
  git clone --depth 1 --branch "${BUILDROOT_VERSION}" \
    https://gitlab.com/buildroot.org/buildroot.git "${BUILDROOT_DIR}"
fi

make -s -C "${BUILDROOT_DIR}" O="${OUTPUT_DIR}" BR2_EXTERNAL="${ROOT_DIR}" showroom_rpi5_defconfig >/dev/null

status=0
while IFS= read -r line; do
  if [[ "${line}" =~ ^(BR2_[A-Z0-9_]+)=(.*)$ ]]; then
    symbol="${BASH_REMATCH[1]}"
    if ! grep -qxF "${line}" "${OUTPUT_DIR}/.config"; then
      echo "defconfig: ${symbol} resolved to '$(grep "^${symbol}=" "${OUTPUT_DIR}/.config" | cut -d= -f2- || true)', not '${BASH_REMATCH[2]}'" >&2
      status=1
    fi
  elif [[ "${line}" =~ ^#\ (BR2_[A-Z0-9_]+)\ is\ not\ set$ ]]; then
    symbol="${BASH_REMATCH[1]}"
    if grep -q "^${symbol}=" "${OUTPUT_DIR}/.config"; then
      echo "defconfig: ${symbol} should be off but is enabled" >&2
      status=1
    fi
  fi
done <"${DEFCONFIG}"

if [[ "${status}" == 0 ]]; then
  echo "defconfig: every option resolved as written (Buildroot ${BUILDROOT_VERSION})"
fi
exit "${status}"
