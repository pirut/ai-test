#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
ARTIFACTS_DIR="${ROOT_DIR}/artifacts"

"${ROOT_DIR}/prepare-artifacts.sh"

rm -f "${ARTIFACTS_DIR}/player-release.tar.gz"

tar -C "${ARTIFACTS_DIR}/player" -czf "${ARTIFACTS_DIR}/player-release.tar.gz" .

echo "Prepared release artifacts:"
echo "  ${ARTIFACTS_DIR}/showroom-agent"
echo "  ${ARTIFACTS_DIR}/player-release.tar.gz"
