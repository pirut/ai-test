#!/bin/bash
set -euo pipefail

export HOME=/home/pi
export DISPLAY=:0
export XAUTHORITY=/home/pi/.Xauthority

RUNTIME_URL="http://127.0.0.1:4173/local/kiosk/runtime"
RUNTIME_PATH="/tmp/showroom-kiosk-runtime.json"
DISPLAY_OUTPUT="${SHOWROOM_DISPLAY_OUTPUT:-HDMI-1}"
DISPLAY_MODE_PRIMARY="${SHOWROOM_DISPLAY_MODE_PRIMARY:-3840x2160}"
DISPLAY_MODE_FALLBACK="${SHOWROOM_DISPLAY_MODE_FALLBACK:-1920x1080}"
DISPLAY_RATE="${SHOWROOM_DISPLAY_RATE:-}"
HOSTNAME_SHORT="$(hostname -s 2>/dev/null || hostname)"
CHROMIUM_PROFILE_ROOT=/home/pi/.config/chromium-kiosk
CHROMIUM_PROFILE_DIR="${CHROMIUM_PROFILE_ROOT}/${HOSTNAME_SHORT}"
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

mkdir -p "${CHROMIUM_PROFILE_DIR}"
mkdir -p /home/pi/.local/share/icons/hicolor

stop_app() {
  if [[ -z "${APP_PID}" ]]; then
    return
  fi

  kill -- -"${APP_PID}" 2>/dev/null || true
  wait "${APP_PID}" 2>/dev/null || true
  APP_PID=""
}

set_display_mode() {
  if ! command -v xrandr >/dev/null 2>&1; then
    return
  fi

  local rate_args=()
  if [[ -n "${DISPLAY_RATE}" ]]; then
    rate_args=(--rate "${DISPLAY_RATE}")
  fi

  if xrandr --output "${DISPLAY_OUTPUT}" --mode "${DISPLAY_MODE_PRIMARY}" "${rate_args[@]}" >/tmp/showroom-xrandr.log 2>&1; then
    return
  fi

  xrandr --output "${DISPLAY_OUTPUT}" --mode "${DISPLAY_MODE_FALLBACK}" "${rate_args[@]}" >>/tmp/showroom-xrandr.log 2>&1 || true
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
set_display_mode

fetch_runtime() {
  if curl -fsS "${RUNTIME_URL}" -o "${RUNTIME_PATH}.next"; then
    mv "${RUNTIME_PATH}.next" "${RUNTIME_PATH}"
    return
  fi

  rm -f "${RUNTIME_PATH}.next"
  if [[ ! -f "${RUNTIME_PATH}" ]]; then
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

asset = payload.get("asset") or {}
volume = payload.get("volume")
if volume is None:
    volume = 100

token_payload = {
    "mode": payload.get("mode", "browser"),
    "browserUrl": payload.get("browserUrl", "http://127.0.0.1:4173"),
    "manifestVersion": payload.get("manifestVersion", ""),
    "volume": int(volume),
    "assetPath": asset.get("localPath", ""),
    "assetType": asset.get("assetType", ""),
    "durationSeconds": int(asset.get("durationSeconds", 0) or 0),
}

token = hashlib.sha256(json.dumps(token_payload, sort_keys=True).encode("utf-8")).hexdigest()

print(payload.get("mode", "browser"))
print(token)
print(payload.get("browserUrl", "http://127.0.0.1:4173"))
print(int(volume))
print(asset.get("assetType", ""))
print(asset.get("localPath", ""))
print(int(asset.get("durationSeconds", 0) or 0))
PY
}

launch_browser() {
  local browser_url="$1"
  rm -f "${CHROMIUM_PROFILE_DIR}/SingletonCookie" \
        "${CHROMIUM_PROFILE_DIR}/SingletonLock" \
        "${CHROMIUM_PROFILE_DIR}/SingletonSocket"
  setsid "${CHROMIUM_BIN}" \
    --kiosk \
    --no-first-run \
    --no-default-browser-check \
    --noerrdialogs \
    --disable-infobars \
    --disable-extensions \
    --user-data-dir="${CHROMIUM_PROFILE_DIR}" \
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
  local asset_type="$2"
  local asset_path="$3"
  local duration="$4"

  if ! command -v mpv >/dev/null 2>&1; then
    launch_browser "http://127.0.0.1:4173"
    return
  fi

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

  if [[ "${asset_type}" == "image" ]]; then
    if [[ "${duration}" -le 0 ]]; then
      duration=15
    fi
    args+=(--image-display-duration="${duration}" --loop-file=inf "${asset_path}")
  else
    args+=("${asset_path}")
  fi
  setsid mpv "${args[@]}" >/tmp/showroom-mpv.log 2>&1 &
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
  ASSET_TYPE="${runtime_lines[4]:-}"
  ASSET_PATH="${runtime_lines[5]:-}"
  ASSET_DURATION="${runtime_lines[6]:-0}"

  if [[ -n "${APP_PID}" ]] && ! kill -0 "${APP_PID}" 2>/dev/null; then
    APP_PID=""
  fi

  if [[ "${DESIRED_MODE}" != "${APP_MODE}" || "${DESIRED_TOKEN}" != "${APP_TOKEN}" || -z "${APP_PID}" ]]; then
    stop_app
    if [[ "${DESIRED_MODE}" == "mpv" && -n "${ASSET_PATH}" ]]; then
      launch_mpv "${VOLUME}" "${ASSET_TYPE}" "${ASSET_PATH}" "${ASSET_DURATION}"
    else
      launch_browser "${BROWSER_URL}"
    fi
    APP_TOKEN="${DESIRED_TOKEN}"
  fi

  sleep 1
done
