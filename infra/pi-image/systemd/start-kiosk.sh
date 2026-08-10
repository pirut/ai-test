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
CURRENT_ASSET_ID=""
CURRENT_MANIFEST_VERSION=""
CURRENT_PLAYLIST_ID=""
LAST_PLAYBACK_REPORT=0
MPV_SOCKET=/tmp/showroom-mpv.sock
MPV_ASSET_MAP=/tmp/showroom-mpv-assets.json

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
import os
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    payload = json.load(handle)

volume = payload.get("volume")
if volume is None:
    volume = 100
orientation = int(payload.get("orientation", 0) or 0)
playlist = payload.get("playlist") or []
playlist_paths = [item.get("localPath", "") for item in playlist if item.get("localPath")]
playlist_path = "/tmp/showroom-mpv-playlist.m3u"
asset_map_path = "/tmp/showroom-mpv-assets.json"

if payload.get("mode") == "mpv" and playlist_paths:
    next_path = playlist_path + ".next"
    with open(next_path, "w", encoding="utf-8") as handle:
        handle.write("#EXTM3U\n")
        for path in playlist_paths:
            handle.write(path.replace("\n", "") + "\n")
    os.replace(next_path, playlist_path)
    next_map = asset_map_path + ".next"
    with open(next_map, "w", encoding="utf-8") as handle:
        json.dump({item.get("localPath", ""): item.get("assetId") or item.get("id") for item in playlist if item.get("localPath")}, handle)
    os.replace(next_map, asset_map_path)

token_payload = {
    "mode": payload.get("mode", "browser"),
    "browserUrl": payload.get("browserUrl", "http://127.0.0.1:4173"),
    "manifestVersion": payload.get("manifestVersion", ""),
    "volume": int(volume),
    "orientation": orientation,
    "playlist": playlist_paths,
}

token = hashlib.sha256(json.dumps(token_payload, sort_keys=True).encode("utf-8")).hexdigest()

print(payload.get("mode", "browser"))
print(token)
print(payload.get("browserUrl", "http://127.0.0.1:4173"))
print(int(volume))
print(orientation)
print(playlist_path if playlist_paths else "")
print(payload.get("manifestVersion", ""))
print((playlist[0].get("assetId") or playlist[0].get("id") or "") if playlist else "")
print(payload.get("playlistId", ""))
PY
}

report_playback() {
  if [[ "${APP_MODE}" != "mpv" ]]; then return; fi
  local now
  now="$(date +%s)"
  if (( now - LAST_PLAYBACK_REPORT < 10 )); then return; fi
  LAST_PLAYBACK_REPORT="${now}"
  python3 - "${CURRENT_ASSET_ID}" "${CURRENT_PLAYLIST_ID}" "${MPV_SOCKET}" "${MPV_ASSET_MAP}" <<'PY' >/dev/null 2>&1 || true
import json
import socket
import sys
import urllib.request

asset_id = sys.argv[1] or None
try:
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
        client.settimeout(1)
        client.connect(sys.argv[3])
        client.sendall(b'{"command":["get_property","path"]}\n')
        response = json.loads(client.recv(65536).decode("utf-8").splitlines()[0])
    with open(sys.argv[4], "r", encoding="utf-8") as handle:
        asset_id = json.load(handle).get(response.get("data"), asset_id)
except (OSError, ValueError, KeyError):
    pass

payload = json.dumps({
    "assetId": asset_id,
    "playlistId": sys.argv[2] or None,
    "state": "playing",
}).encode("utf-8")
request = urllib.request.Request(
    "http://127.0.0.1:4173/local/playback",
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST",
)
urllib.request.urlopen(request, timeout=2).read()
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
  local orientation="$2"
  local playlist_path="$3"

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
    --loop-playlist=inf
    --audio-display=no
    "--input-ipc-server=${MPV_SOCKET}"
    "--video-rotate=${orientation}"
    "--playlist=${playlist_path}"
  )

  if [[ "${volume}" -le 0 ]]; then
    args+=(--mute=yes)
  else
    args+=("--volume=${volume}")
  fi

  rm -f "${MPV_SOCKET}"
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
  ORIENTATION="${runtime_lines[4]:-0}"
  PLAYLIST_PATH="${runtime_lines[5]:-}"
  CURRENT_MANIFEST_VERSION="${runtime_lines[6]:-}"
  CURRENT_ASSET_ID="${runtime_lines[7]:-}"
  CURRENT_PLAYLIST_ID="${runtime_lines[8]:-${CURRENT_MANIFEST_VERSION}}"

  if [[ -n "${APP_PID}" ]] && ! kill -0 "${APP_PID}" 2>/dev/null; then
    APP_PID=""
  fi

  if [[ "${DESIRED_MODE}" != "${APP_MODE}" || "${DESIRED_TOKEN}" != "${APP_TOKEN}" || -z "${APP_PID}" ]]; then
    stop_app
    if [[ "${DESIRED_MODE}" == "mpv" && -n "${PLAYLIST_PATH}" ]]; then
      launch_mpv "${VOLUME}" "${ORIENTATION}" "${PLAYLIST_PATH}"
    else
      launch_browser "${BROWSER_URL}"
    fi
    APP_TOKEN="${DESIRED_TOKEN}"
  fi

  report_playback

  sleep 1
done
