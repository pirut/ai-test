#!/bin/bash
# Runs publish.sh against a stand-in build output with a recording stand-in
# for the GitHub CLI. Checks that a development image cannot become a stable
# release (or a customer image a dev build), and that a stable release
# carries what the website and the dashboard's release form need.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
VERSION=2026.11.09.7
NAME="showroom-os-rpi5-${VERSION}"

fail() {
  echo "publish dry run: $*" >&2
  exit 1
}

mkdir -p "${WORK}/bin" "${WORK}/out/images" "${WORK}/out/target/usr/lib" "${WORK}/out/target/etc/showroom" "${WORK}/uploads"
printf 'image\n' >"${WORK}/out/images/${NAME}.img.xz"
printf 'bundle\n' >"${WORK}/out/images/${NAME}.raucb"
(cd "${WORK}/out/images" && sha256sum "${NAME}.img.xz" "${NAME}.raucb" >SHA256SUMS)
printf 'VERSION_ID=%s\n' "${VERSION}" >"${WORK}/out/target/usr/lib/os-release"

# gh stand-in: logs every call, keeps a copy of uploaded files, and reports
# that no release exists yet.
cat >"${WORK}/bin/gh" <<'GH'
#!/bin/bash
printf '%s\n' "$*" >>"${GH_LOG}"
case "$1 $2" in
  "release view") [[ " $* " == *" --json "* ]] && exit 0; exit 1 ;;
  "release create" | "release upload")
    for arg in "$@"; do
      if [[ -f "${arg}" ]]; then cp "${arg}" "${GH_UPLOADS}/"; fi
    done
    ;;
esac
exit 0
GH
chmod +x "${WORK}/bin/gh"

publish() {
  : >"${WORK}/gh.log"
  rm -rf "${WORK}/uploads"
  mkdir -p "${WORK}/uploads"
  PATH="${WORK}/bin:${PATH}" GH_LOG="${WORK}/gh.log" GH_UPLOADS="${WORK}/uploads" GITHUB_STEP_SUMMARY="${WORK}/summary.md" \
    SHOWROOM_BUILDROOT_OUTPUT="${WORK}/out" SHOWROOM_IMAGE_VERSION="${VERSION}" SHOWROOM_IMAGES_REPO=example/showroom-os \
    "${ROOT_DIR}/publish.sh" "$@" >"${WORK}/publish.log" 2>&1
}
created() {
  grep -q '^release \(create\|upload\)' "${WORK}/gh.log"
}

# A customer image: stable only.
if publish dev || created; then fail "a customer image was published to the dev channel"; fi
publish stable || { cat "${WORK}/publish.log" >&2; fail "a customer image was not published as stable"; }
grep -q "^release create v${VERSION} -R example/showroom-os --latest " "${WORK}/gh.log" || fail "the stable release is not marked latest"
bundle_sha256="$(sha256sum "${WORK}/out/images/${NAME}.raucb" | cut -d' ' -f1)"
bundle_url="https://github.com/example/showroom-os/releases/download/v${VERSION}/${NAME}.raucb"
for file in showroom-os-rpi5.img.xz "${NAME}.img.xz" "${NAME}.raucb" "${NAME}.raucb.sha256" release.json SHA256SUMS; do
  [[ -s "${WORK}/uploads/${file}" ]] || fail "the stable release lacks ${file}"
done
cmp -s "${WORK}/uploads/showroom-os-rpi5.img.xz" "${WORK}/out/images/${NAME}.img.xz" || fail "the fixed-name image differs from the build"
(cd "${WORK}/uploads" && sha256sum --quiet -c "${NAME}.raucb.sha256") || fail "${NAME}.raucb.sha256 does not match the bundle"
[[ "$(jq -r '.version + " " + .bundle + " " + .sha256' "${WORK}/uploads/release.json")" == "${VERSION} ${bundle_url} ${bundle_sha256}" ]] \
  || fail "release.json does not describe the bundle"
for wanted in "${bundle_url}" "${bundle_sha256}"; do
  grep -qF "${wanted}" "${WORK}/uploads/notes.md" || fail "the release notes lack ${wanted} for the dashboard"
done
grep -qF "${bundle_sha256}" "${WORK}/summary.md" || fail "the run summary lacks the bundle checksum"

# A development image: dev only.
printf 'SHOWROOM_OS_CHANNEL_URL=https://example.com/latest.json\n' >"${WORK}/out/target/etc/showroom/os-channel.env"
if publish stable || created; then fail "a development image was published as a stable release"; fi
publish dev || { cat "${WORK}/publish.log" >&2; fail "a development image was not published to the dev channel"; }
[[ "$(jq -r '.version + " " + .sha256' "${WORK}/uploads/latest.json")" == "${VERSION} ${bundle_sha256}" ]] \
  || fail "latest.json does not describe the bundle"
[[ "$(tail -n 2 "${WORK}/gh.log" | head -n 1)" == "release upload dev -R example/showroom-os --clobber "*"/latest.json" ]] \
  || fail "latest.json is not the last upload"

# A build of another version than the one being published.
printf 'VERSION_ID=2026.11.09.6\n' >"${WORK}/out/target/usr/lib/os-release"
if publish dev || created; then fail "a build of another version was published"; fi

echo "publish dry run: channels, variants and release files are as expected"
