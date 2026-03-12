#!/bin/bash
set -euo pipefail

export HOME=/home/pi
export DISPLAY=:0
export XAUTHORITY=/home/pi/.Xauthority

RUNTIME_URL="http://127.0.0.1:4173/local/kiosk/runtime"
RUNTIME_PATH="/tmp/showroom-kiosk-runtime.json"
PLAYLIST_PATH="/tmp/showroom-kiosk-playlist.txt"
APP_PID=""
APP_MODE=""
APP_TOKEN=""

if ! command -v startx >/dev/null 2>&1; then
  echo "startx not found; install the xinit package" >&2
  exit 1
fi

if [[ -x /usr/lib/chromium/chromium ]]; then
  CHROMIUM_BIN=/usr/lib/chromium/chromium
else
  CHROMIUM_BIN="$(command -v chromium-browser || command -v chromium || true)"
fi

if [[ -z "${CHROMIUM_BIN}" ]]; then
  echo "Chromium executable not found" >&2
  exit 1
fi

mkdir -p /home/pi/.config/chromium-kiosk
mkdir -p /home/pi/.local/share/icons/hicolor

stop_app() {
  if [[ -z "${APP_PID}" ]]; then
    return
  fi

  kill -- -"${APP_PID}" 2>/dev/null || true
  wait "${APP_PID}" 2>/dev/null || true
  APP_PID=""
}

cleanup() {
  stop_app
}

trap cleanup EXIT INT TERM

startx /usr/bin/openbox-session -- :0 vt1 &

for _ in $(seq 1 20); do
  if [[ -S /tmp/.X11-unix/X0 ]]; then
    break
  fi
  sleep 1
done

if [[ ! -S /tmp/.X11-unix/X0 ]]; then
  echo "X server failed to start on ${DISPLAY}" >&2
  exit 1
fi

unclutter -idle 0.1 -root &

fetch_runtime() {
  if ! curl -fsS "${RUNTIME_URL}" -o "${RUNTIME_PATH}"; then
    cat >"${RUNTIME_PATH}" <<'EOF'
{"mode":"browser","reason":"agent-unreachable","browserUrl":"http://127.0.0.1:4173"}
EOF
  fi
}

read_runtime() {
  python3 - "${RUNTIME_PATH}" <<'PY'
import hashlib
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    payload = json.load(handle)

playlist = payload.get("playlist", [])
token_payload = {
    "mode": payload.get("mode", "browser"),
    "browserUrl": payload.get("browserUrl", "http://127.0.0.1:4173"),
    "manifestVersion": payload.get("manifestVersion", ""),
    "volume": int(payload.get("volume", 0)),
    "playlist": [item.get("localPath", "") for item in playlist],
}

token = hashlib.sha256(json.dumps(token_payload, sort_keys=True).encode("utf-8")).hexdigest()

print(payload.get("mode", "browser"))
print(token)
print(payload.get("browserUrl", "http://127.0.0.1:4173"))
print(int(payload.get("volume", 0)))
for item in playlist:
    print(item.get("localPath", ""))
PY
}

launch_browser() {
  local browser_url="$1"
  setsid "${CHROMIUM_BIN}" \
    --kiosk \
    --no-first-run \
    --no-default-browser-check \
    --noerrdialogs \
    --disable-infobars \
    --disable-extensions \
    --user-data-dir=/home/pi/.config/chromium-kiosk \
    --autoplay-policy=no-user-gesture-required \
    --check-for-update-interval=31536000 \
    --use-gl=egl \
    --ignore-gpu-blocklist \
    --enable-gpu-rasterization \
    "${browser_url}" >/tmp/showroom-chromium.log 2>&1 &
  APP_PID=$!
  APP_MODE="browser"
}

launch_mpv() {
  local volume="$1"
  shift
  local playlist=("$@")

  if ! command -v mpv >/dev/null 2>&1; then
    launch_browser "http://127.0.0.1:4173"
    return
  fi

  printf '%s\n' "${playlist[@]}" >"${PLAYLIST_PATH}"

  local args=(
    --fs
    --no-terminal
    --really-quiet
    --keep-open=no
    --osc=no
    --input-default-bindings=no
    --vo=gpu
    --gpu-context=x11egl
    --hwdec=auto-safe
    --profile=fast
  )

  if [[ "${volume}" -le 0 ]]; then
    args+=(--mute=yes)
  else
    args+=("--volume=${volume}")
  fi

  if [[ "${#playlist[@]}" -eq 1 ]]; then
    local single_args=("${args[@]}")
    single_args+=(--loop-file=inf "${playlist[0]}")
    setsid mpv "${single_args[@]}" >/tmp/showroom-mpv.log 2>&1 &
  else
    args+=(--loop-playlist=inf "--playlist=${PLAYLIST_PATH}")
    setsid mpv "${args[@]}" >/tmp/showroom-mpv.log 2>&1 &
  fi
  APP_PID=$!
  APP_MODE="mpv"
}

while true; do
  fetch_runtime
  mapfile -t runtime_lines < <(read_runtime)

  DESIRED_MODE="${runtime_lines[0]:-browser}"
  DESIRED_TOKEN="${runtime_lines[1]:-browser}"
  BROWSER_URL="${runtime_lines[2]:-http://127.0.0.1:4173}"
  VOLUME="${runtime_lines[3]:-0}"
  PLAYLIST=( "${runtime_lines[@]:4}" )

  if [[ -n "${APP_PID}" ]] && ! kill -0 "${APP_PID}" 2>/dev/null; then
    APP_PID=""
  fi

  if [[ "${DESIRED_MODE}" != "${APP_MODE}" || "${DESIRED_TOKEN}" != "${APP_TOKEN}" || -z "${APP_PID}" ]]; then
    stop_app
    if [[ "${DESIRED_MODE}" == "mpv" && "${#PLAYLIST[@]}" -gt 0 ]]; then
      launch_mpv "${VOLUME}" "${PLAYLIST[@]}"
    else
      launch_browser "${BROWSER_URL}"
    fi
    APP_TOKEN="${DESIRED_TOKEN}"
  fi

  sleep 5
done
