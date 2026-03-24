#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
ARTIFACTS_DIR="${ROOT_DIR}/artifacts"
SYSTEM_ROOT="${ARTIFACTS_DIR}/system-root"

"${ROOT_DIR}/prepare-artifacts.sh"

rm -f "${ARTIFACTS_DIR}/player-release.tar.gz" "${ARTIFACTS_DIR}/system-release.tar.gz"
rm -rf "${SYSTEM_ROOT}"

tar -C "${ARTIFACTS_DIR}/player" -czf "${ARTIFACTS_DIR}/player-release.tar.gz" .

mkdir -p "${SYSTEM_ROOT}/usr/local/bin"
install -m 0755 "${ROOT_DIR}/systemd/start-kiosk.sh" "${SYSTEM_ROOT}/usr/local/bin/showroom-start-kiosk"
tar -C "${SYSTEM_ROOT}" -czf "${ARTIFACTS_DIR}/system-release.tar.gz" .

echo "Prepared release artifacts:"
echo "  ${ARTIFACTS_DIR}/showroom-agent"
echo "  ${ARTIFACTS_DIR}/player-release.tar.gz"
echo "  ${ARTIFACTS_DIR}/system-release.tar.gz"
