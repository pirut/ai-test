#!/bin/bash
set -euo pipefail

export DISPLAY=:0
export XAUTHORITY=/home/pi/.Xauthority

startx /usr/bin/openbox-session -- :0 vt1 &
sleep 4
unclutter -idle 0.1 -root &
chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  http://127.0.0.1:4173

