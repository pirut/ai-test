#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "${ROOT_DIR}/../.." && pwd)"
ARTIFACTS_DIR="${ROOT_DIR}/artifacts"

mkdir -p "${ARTIFACTS_DIR}/player"
rm -rf "${ARTIFACTS_DIR}/player"
mkdir -p "${ARTIFACTS_DIR}/player"

pushd "${REPO_DIR}" >/dev/null
npm run build --workspace @showroom/player
(cd apps/agent && GOOS=linux GOARCH=arm64 go build -o "${ARTIFACTS_DIR}/showroom-agent" ./cmd/showroom-agent)
cp -R apps/player/dist/. "${ARTIFACTS_DIR}/player/"
popd >/dev/null

echo "Prepared Pi image artifacts in ${ARTIFACTS_DIR}"
