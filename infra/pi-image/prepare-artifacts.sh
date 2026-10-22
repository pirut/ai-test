#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "${ROOT_DIR}/../.." && pwd)"
ARTIFACTS_DIR="${ROOT_DIR}/artifacts"
GO_CACHE="${SHOWROOM_GOCACHE:-${ARTIFACTS_DIR}/.go-cache}"
PLAYER_TARGET=aarch64-unknown-linux-gnu

mkdir -p "${ARTIFACTS_DIR}/player"
rm -rf "${ARTIFACTS_DIR}/player"
mkdir -p "${ARTIFACTS_DIR}/player"

pushd "${REPO_DIR}" >/dev/null
npm run build --workspace @showroom/player
(cd apps/agent && GOCACHE="${GO_CACHE}" GOOS=linux GOARCH=arm64 go build -trimpath -o "${ARTIFACTS_DIR}/showroom-agent" ./cmd/showroom-agent)
cp -R apps/player/dist/. "${ARTIFACTS_DIR}/player/"

# The native player rides inside the signed player bundle as bin/showroom-player,
# so it is checksummed, signed and rolled back together with the web player.
# libmpv is loaded at runtime, so cross-compiling needs only an arm64 C linker.
if [[ "$(uname -m)" != "aarch64" && -z "${CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER:-}" ]]; then
  if ! command -v aarch64-linux-gnu-gcc >/dev/null 2>&1; then
    echo "aarch64-linux-gnu-gcc is required to cross-compile the native player (apt install gcc-aarch64-linux-gnu)" >&2
    exit 1
  fi
  export CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc
fi
cargo build --locked --release --manifest-path apps/pi-player/Cargo.toml --target "${PLAYER_TARGET}"
install -D -m 0755 "apps/pi-player/target/${PLAYER_TARGET}/release/showroom-player" "${ARTIFACTS_DIR}/player/bin/showroom-player"
popd >/dev/null

echo "Prepared Pi image artifacts in ${ARTIFACTS_DIR}"
