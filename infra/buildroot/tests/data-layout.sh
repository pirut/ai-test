#!/bin/bash
# Exercises showroom-data-layout's choice between the agent and player built
# into the image and a signed app release on the data partition, in a
# temporary directory. An OS update must not leave a screen running an app
# release older than what the new image carries, and falling back to the
# previous OS slot must bring that release back.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="${ROOT_DIR}/board/rpi5/rootfs-overlay/usr/libexec/showroom/showroom-data-layout"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
DATA="${WORK}/data"
RELEASES="${DATA}/showroom/releases"

# image NAME VERSION BUILT: a stand-in image with its built-in release.
image() {
  local root="${WORK}/$1"
  mkdir -p "${root}/releases/agent/$2" "${root}/releases/player/$2"
  printf '#!/bin/sh\n' >"${root}/releases/agent/$2/showroom-agent"
  chmod +x "${root}/releases/agent/$2/showroom-agent"
  ln -sfn "$2" "${root}/releases/agent/1.0.0"
  ln -sfn "$2" "${root}/releases/player/1.0.0"
  printf 'VERSION_ID=%s\n' "$2" >"${root}/os-release"
  if [[ -n "${3:-}" ]]; then echo "$3" >"${root}/build-epoch"; fi
}

# boot NAME: what showroom-data-layout does when that image starts. Every
# image has its built-in release at the same path, as on a screen.
boot() {
  ln -sfn "$1" "${WORK}/booted"
  SHOWROOM_DATA_ROOT="${DATA}" SHOWROOM_BUILTIN_RELEASES="${WORK}/booted/releases" \
    SHOWROOM_OS_RELEASE="${WORK}/booted/os-release" SHOWROOM_BUILD_EPOCH_FILE="${WORK}/booted/build-epoch" \
    "${SCRIPT}" 2>>"${WORK}/log" || { echo "FAIL: showroom-data-layout failed" >&2; exit 1; }
}

# install_release VERSION TIME: what the agent does for a signed app release.
install_release() {
  local kind
  for kind in agent player; do
    mkdir -p "${RELEASES}/${kind}/$1"
    if [[ "${kind}" == agent ]]; then
      printf '#!/bin/sh\n' >"${RELEASES}/agent/$1/showroom-agent"
      chmod +x "${RELEASES}/agent/$1/showroom-agent"
    fi
    touch -d "@$2" "${RELEASES}/${kind}/$1"
    ln -sfn "$1" "${RELEASES}/${kind}/current"
  done
}

expect() {
  local what="$1" want="$2" kind got
  for kind in agent player; do
    got="$(readlink "${RELEASES}/${kind}/current")"
    [[ "${got}" == "${want/KIND/${kind}}" ]] || { echo "FAIL: ${what}: ${kind} runs ${got}, expected ${want/KIND/${kind}}" >&2; cat "${WORK}/log" >&2; exit 1; }
  done
  echo "ok: ${what}"
}

image os1 2026.11.01.1 1000
image os2 2026.11.09.2 3000
image nostamp 2026.11.10.3

boot os1
expect "a new screen runs the built-in versions, named after the image" "${WORK}/booted/releases/KIND/2026.11.01.1"
[[ -d "${DATA}/network/system-connections" && -d "${DATA}/tailscale" && -d "${DATA}/timesync" && -d "${DATA}/rauc" ]] \
  || { echo "FAIL: persistent directories are missing" >&2; exit 1; }

install_release 5.1.0 2000
boot os1
expect "an app release installed after the image was built is kept" 5.1.0

boot os2
expect "an OS update with a newer agent and player switches to them" "${WORK}/booted/releases/KIND/2026.11.09.2"
boot os2
expect "and stays on them" "${WORK}/booted/releases/KIND/2026.11.09.2"

boot os1
expect "falling back to the older OS slot returns to the app release" 5.1.0
[[ ! -e "${RELEASES}/agent/superseded" && ! -L "${RELEASES}/agent/superseded" ]] || { echo "FAIL: superseded link left behind" >&2; exit 1; }

boot os2
install_release 5.2.0 4000
boot os2
expect "an app release newer than the image is kept" 5.2.0
[[ ! -L "${RELEASES}/player/superseded" ]] || { echo "FAIL: stale superseded link kept" >&2; exit 1; }

boot nostamp
expect "an image without a build time keeps the installed release" 5.2.0

rm -rf "${RELEASES}/agent/5.2.0" "${RELEASES}/player/5.2.0"
boot os2
expect "a release that is gone falls back to the built-in versions" "${WORK}/booted/releases/KIND/2026.11.09.2"

for kind in agent player; do ln -sfn "${WORK}/booted/releases/${kind}/1.0.0" "${RELEASES}/${kind}/current"; done
rm -f "${RELEASES}"/*/superseded
boot os2
expect "a link from an earlier image (1.0.0) moves to the image version" "${WORK}/booted/releases/KIND/2026.11.09.2"

echo "data layout: all checks passed"
