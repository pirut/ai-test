#!/bin/bash
# Publishes a finished Showroom OS build from infra/buildroot/out/images as
# GitHub releases in the public images repository (default
# pirut/showroom-os). It needs the GitHub CLI and GH_TOKEN with write access
# to that repository's contents.
#
#   publish.sh dev      the rolling "dev" prerelease that test screens follow:
#                       latest.json, the OS bundle and showroom-os-rpi5-dev.img.xz
#   publish.sh stable   a release v<version> marked latest, with
#                       showroom-os-rpi5.img.xz at a fixed download URL (the
#                       website's download button) and, for the dashboard's
#                       release form, the OS bundle with its checksum:
#                       showroom-os-rpi5-<version>.raucb, .raucb.sha256 and
#                       release.json
#
# Only development images (development keys, OS channel baked in) go to dev,
# and only customer images (no OS channel) go to stable. The script checks
# that against the build's root filesystem; the caller chooses the keys.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT="${SHOWROOM_BUILDROOT_OUTPUT:-${ROOT_DIR}/out}"
IMAGES="${OUTPUT}/images"
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
[[ "${VERSION}" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "publish: version '${VERSION}' may only use letters, digits, '.', '_' and '-'" >&2; exit 1; }

# A development image on the stable channel would follow the dev channel in a
# showroom with its watchdog off; a customer image on the dev channel would
# take test screens off it. Both are told apart by the OS channel file.
os_release="${OUTPUT}/target/usr/lib/os-release"
[[ -r "${os_release}" ]] || { echo "publish: ${os_release} is missing; publish from the build's output directory" >&2; exit 1; }
built_version="$(sed -n 's/^VERSION_ID=//p' "${os_release}")"
[[ "${built_version}" == "${VERSION}" ]] || { echo "publish: the build is ${built_version:-unknown}, not ${VERSION}" >&2; exit 1; }
variant=field
[[ -e "${OUTPUT}/target/etc/showroom/os-channel.env" ]] && variant=dev
case "${CHANNEL}:${variant}" in
  dev:dev | stable:field) ;;
  dev:field) echo "publish: this is a customer image (no OS channel); it does not go to the dev channel" >&2; exit 1 ;;
  stable:dev) echo "publish: this is a development image (it follows the dev channel); it must not be a stable release" >&2; exit 1 ;;
esac

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
    if gh release view "v${VERSION}" -R "${REPO}" >/dev/null 2>&1; then
      echo "publish: release v${VERSION} already exists in ${REPO}; build a new version instead of replacing a published one" >&2
      exit 1
    fi
    bundle_url="${download}/v${VERSION}/${NAME}.raucb"
    bundle_sha256="$(sha256sum "${bundle}" | cut -d' ' -f1)"
    image_sha256="$(sha256sum "${image}" | cut -d' ' -f1)"
    cp "${image}" "${stage}/showroom-os-rpi5.img.xz"
    printf '%s  %s\n' "${bundle_sha256}" "${NAME}.raucb" >"${stage}/${NAME}.raucb.sha256"
    jq -n \
      --arg version "${VERSION}" \
      --arg bundle "${bundle_url}" \
      --arg sha256 "${bundle_sha256}" \
      --arg image "${download}/v${VERSION}/${NAME}.img.xz" \
      --arg image_sha256 "${image_sha256}" \
      --arg source "${source_ref}" \
      --arg built "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      '{version: $version, bundle: $bundle, sha256: $sha256, image: $image, imageSha256: $image_sha256, source: $source, builtAt: $built}' \
      >"${stage}/release.json"
    cat >"${stage}/notes.md" <<NOTES
Showroom OS ${VERSION} for Raspberry Pi 5 screens, built from ${source_ref}.

**New screen:** flash \`showroom-os-rpi5.img.xz\` with Raspberry Pi Imager (Use custom, no OS customisation), then pair the screen with the code it shows.

**Screens already on Showroom OS:** create a release in the dashboard with

- Version: \`${VERSION}\`
- OS bundle URL: \`${bundle_url}\`
- OS bundle SHA-256: \`${bundle_sha256}\`

Flash image SHA-256: \`${image_sha256}\`
NOTES
    gh release create "v${VERSION}" -R "${REPO}" --latest \
      --title "Showroom OS ${VERSION}" \
      --notes-file "${stage}/notes.md" \
      "${image}" "${bundle}" "${IMAGES}/SHA256SUMS" "${stage}/showroom-os-rpi5.img.xz" \
      "${stage}/${NAME}.raucb.sha256" "${stage}/release.json"
    if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
      {
        echo "### Showroom OS ${VERSION} is the stable release"
        echo
        echo "- Download for new screens: https://github.com/${REPO}/releases/latest/download/showroom-os-rpi5.img.xz"
        echo "- Dashboard release, version: \`${VERSION}\`"
        echo "- Dashboard release, OS bundle URL: \`${bundle_url}\`"
        echo "- Dashboard release, OS bundle SHA-256: \`${bundle_sha256}\`"
      } >>"${GITHUB_STEP_SUMMARY}"
    fi
    echo "publish: https://github.com/${REPO}/releases/latest/download/showroom-os-rpi5.img.xz is now ${VERSION}"
    echo "publish: OS bundle for the dashboard release form: ${bundle_url} (sha256 ${bundle_sha256})"
    ;;
  *)
    echo "usage: $0 dev|stable" >&2
    exit 2
    ;;
esac
