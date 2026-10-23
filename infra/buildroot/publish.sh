#!/bin/bash
# Publishes a finished Showroom OS build from infra/buildroot/out/images as
# GitHub releases in the public images repository (default
# pirut/showroom-os). It needs the GitHub CLI and GH_TOKEN with write access
# to that repository's contents.
#
#   publish.sh dev      the rolling "dev" prerelease that test screens follow:
#                       latest.json, the OS bundle and showroom-os-rpi5-dev.img.xz
#   publish.sh stable   a release v<version> marked latest, with
#                       showroom-os-rpi5.img.xz at a fixed download URL
#
# Only development images (development keys, OS channel baked in) go to dev,
# and only production-signed images go to stable; the caller makes sure.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGES="${SHOWROOM_BUILDROOT_OUTPUT:-${ROOT_DIR}/out}/images"
REPO="${SHOWROOM_IMAGES_REPO:-pirut/showroom-os}"
VERSION="${SHOWROOM_IMAGE_VERSION:?SHOWROOM_IMAGE_VERSION is required}"
NAME="showroom-os-rpi5-${VERSION}"
CHANNEL="${1:-}"
KEEP_BUNDLES=3

image="${IMAGES}/${NAME}.img.xz"
bundle="${IMAGES}/${NAME}.raucb"
for file in "${image}" "${bundle}" "${IMAGES}/SHA256SUMS"; do
  [[ -s "${file}" ]] || { echo "publish: ${file} is missing" >&2; exit 1; }
done
stage="$(mktemp -d)"
trap 'rm -rf "${stage}"' EXIT
download="https://github.com/${REPO}/releases/download"
source_ref="${GITHUB_REPOSITORY:-local}@${GITHUB_SHA:-$(git -C "${ROOT_DIR}" rev-parse HEAD 2>/dev/null || echo unknown)}"

case "${CHANNEL}" in
  dev)
    if ! gh release view dev -R "${REPO}" >/dev/null 2>&1; then
      gh release create dev -R "${REPO}" --prerelease --title "Development builds" \
        --notes "Rolling development builds of Showroom OS for test screens. Development images install every new build from this channel by themselves; do not use them on screens in showrooms."
    fi
    cp "${image}" "${stage}/showroom-os-rpi5-dev.img.xz"
    jq -n \
      --arg version "${VERSION}" \
      --arg bundle "${download}/dev/${NAME}.raucb" \
      --arg sha256 "$(sha256sum "${bundle}" | cut -d' ' -f1)" \
      --arg image "${download}/dev/showroom-os-rpi5-dev.img.xz" \
      --arg image_sha256 "$(sha256sum "${image}" | cut -d' ' -f1)" \
      --arg source "${source_ref}" \
      --arg built "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      '{version: $version, bundle: $bundle, sha256: $sha256, image: $image, imageSha256: $image_sha256, source: $source, builtAt: $built}' \
      >"${stage}/latest.json"
    # The bundle first and latest.json last, so a screen never sees a
    # version whose bundle is not there yet.
    gh release upload dev -R "${REPO}" --clobber "${bundle}" "${stage}/showroom-os-rpi5-dev.img.xz"
    gh release upload dev -R "${REPO}" --clobber "${stage}/latest.json"
    # Old bundles: keep a few so a screen that is mid-download can finish.
    gh release view dev -R "${REPO}" --json assets \
      --jq '.assets | map(select(.name | test("^showroom-os-rpi5-.*\\.raucb$"))) | sort_by(.createdAt) | reverse | .['"${KEEP_BUNDLES}"':][].name' \
      | while read -r old; do
        gh release delete-asset dev "${old}" -R "${REPO}" --yes
      done
    echo "publish: ${VERSION} is on the dev channel: ${download}/dev/latest.json"
    ;;
  stable)
    cp "${image}" "${stage}/showroom-os-rpi5.img.xz"
    gh release create "v${VERSION}" -R "${REPO}" --latest \
      --title "Showroom OS ${VERSION}" \
      --notes "Showroom OS ${VERSION} for Raspberry Pi 5 screens, built from ${source_ref}. Flash showroom-os-rpi5.img.xz with Raspberry Pi Imager (Use custom), then pair the screen with its claim code." \
      "${image}" "${bundle}" "${IMAGES}/SHA256SUMS" "${stage}/showroom-os-rpi5.img.xz"
    echo "publish: https://github.com/${REPO}/releases/latest/download/showroom-os-rpi5.img.xz is now ${VERSION}"
    ;;
  *)
    echo "usage: $0 dev|stable" >&2
    exit 2
    ;;
esac
