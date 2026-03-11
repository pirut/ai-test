#!/bin/bash
set -euo pipefail

export DISPLAY=:0
export XAUTHORITY=/home/pi/.Xauthority

startx /usr/bin/openbox-session -- :0 vt1 &
sleep 4
unclutter -idle 0.1 -root &
CHROMIUM_BIN="$(command -v chromium-browser || command -v chromium || true)"

if [[ -z "${CHROMIUM_BIN}" ]]; then
  echo "Chromium executable not found" >&2
  exit 1
fi

"${CHROMIUM_BIN}" \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  http://127.0.0.1:4173
