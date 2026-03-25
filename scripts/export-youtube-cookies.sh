#!/bin/bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <browser> <output-file>" >&2
  echo "Browsers: chrome, chromium, brave, edge, firefox, safari, opera, vivaldi, whale" >&2
  exit 1
fi

BROWSER="$1"
OUTPUT_PATH="$2"
WORK_DIR="${TMPDIR:-/tmp}/showroom-ytdlp"
YTDLP_BIN="${WORK_DIR}/yt-dlp"
YOUTUBE_TEST_URL="${YOUTUBE_TEST_URL:-https://www.youtube.com/watch?v=yi1n2lFg4zA}"

mkdir -p "${WORK_DIR}"

if [[ ! -x "${YTDLP_BIN}" ]]; then
  curl -L --fail -o "${YTDLP_BIN}" \
    "https://github.com/yt-dlp/yt-dlp/releases/download/2026.03.17/yt-dlp_macos"
  chmod +x "${YTDLP_BIN}"
fi

RAW_OUTPUT="${WORK_DIR}/raw.cookies.txt"
"${YTDLP_BIN}" \
  --cookies-from-browser "${BROWSER}" \
  --cookies "${RAW_OUTPUT}" \
  --skip-download \
  --playlist-end 1 \
  --socket-timeout 5 \
  --extractor-retries 1 \
  "${YOUTUBE_TEST_URL}" >/dev/null 2>&1 || true

awk '
  /^#/ { print; next }
  $1 ~ /(^|\\.)youtube\\.com$/ || $1 ~ /(^|\\.)google\\.com$/ || $1 ~ /(^|\\.)googlevideo\\.com$/ || $1 ~ /(^|\\.)ytimg\\.com$/ { print }
' "${RAW_OUTPUT}" > "${OUTPUT_PATH}"

echo "Exported YouTube cookies to ${OUTPUT_PATH}"
