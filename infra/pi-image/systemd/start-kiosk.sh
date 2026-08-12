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
X_PID=""
APP_MODE=""
APP_TOKEN=""
CURRENT_ASSET_ID=""
CURRENT_MANIFEST_VERSION=""
CURRENT_PLAYLIST_ID=""
LAST_PLAYBACK_REPORT=0
MPV_SOCKET=/tmp/showroom-mpv.sock
MPV_ASSET_MAP=/tmp/showroom-mpv-assets.json
MPV_LOADED_PLAYLIST=/tmp/showroom-mpv-loaded.m3u

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

if [[ ! -f /opt/showroom/player/index.html ]] && [[ ! -f /var/lib/showroom/releases/player/current/index.html ]]; then
  echo "Player assets are missing; expected index.html in the built-in or active player release" >&2
  exit 1
fi

for _ in $(seq 1 60); do
  if curl -fsS --max-time 1 http://127.0.0.1:4173/healthz >/dev/null; then
    break
  fi
  sleep 1
done

if ! curl -fsS --max-time 2 http://127.0.0.1:4173/healthz >/dev/null; then
  echo "showroom-agent local player endpoint did not become ready within 60 seconds" >&2
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

  if xrandr --output "${DISPLAY_OUTPUT}" --mode "${DISPLAY_MODE_PRIMARY}" "${rate_args[@]}"; then
    return
  fi

  echo "Display mode ${DISPLAY_MODE_PRIMARY} unavailable on ${DISPLAY_OUTPUT}; trying ${DISPLAY_MODE_FALLBACK}" >&2
  xrandr --output "${DISPLAY_OUTPUT}" --mode "${DISPLAY_MODE_FALLBACK}" "${rate_args[@]}" || true
}

cleanup() {
  stop_app
  if [[ -n "${X_PID}" ]]; then
    kill "${X_PID}" 2>/dev/null || true
    wait "${X_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "Starting X11/Openbox on tty7" >&2
startx /usr/bin/openbox-session -- :0 vt7 -nolisten tcp &
X_PID=$!

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

if ! kill -0 "${X_PID}" 2>/dev/null; then
  echo "X server exited during startup" >&2
  wait "${X_PID}" || true
  exit 1
fi

# Debian trixie installs the classic implementation under this explicit name;
# the historical /usr/bin/unclutter alias is no longer provided.
unclutter-classic -idle 0.1 -root &
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
    "playlistId": payload.get("playlistId", ""),
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
import os
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

sync_mpv_playlist() {
  [[ "${APP_MODE}" == "mpv" && -S "${MPV_SOCKET}" && -f "${MPV_LOADED_PLAYLIST}" ]] || return 0

  python3 - "${MPV_PLAYLIST_PATH:-/tmp/showroom-mpv-playlist.m3u}" "${MPV_LOADED_PLAYLIST}" "${MPV_SOCKET}" <<'PY'
import json
import socket
import sys

def read_playlist(path):
    with open(path, "r", encoding="utf-8") as handle:
        return [line.strip() for line in handle if line.strip() and not line.startswith("#")]

desired = read_playlist(sys.argv[1])
loaded = read_playlist(sys.argv[2])
if desired[:len(loaded)] != loaded:
    raise SystemExit(2)

with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
    client.settimeout(2)
    client.connect(sys.argv[3])
    for path in desired[len(loaded):]:
        client.sendall((json.dumps({"command": ["loadfile", path, "append"]}) + "\n").encode("utf-8"))
        response = json.loads(client.recv(65536).decode("utf-8").splitlines()[0])
        if response.get("error") != "success":
            raise SystemExit(3)

with open(sys.argv[2] + ".next", "w", encoding="utf-8") as handle:
    handle.write("\n".join(desired) + ("\n" if desired else ""))
os.replace(sys.argv[2] + ".next", sys.argv[2])
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
    --disable-session-crashed-bubble \
    --disable-features=TranslateUI \
    --password-store=basic \
    --user-data-dir="${CHROMIUM_PROFILE_DIR}" \
    --autoplay-policy=no-user-gesture-required \
    --check-for-update-interval=31536000 \
    --use-gl=egl \
    --ignore-gpu-blocklist \
    --enable-gpu-rasterization \
    "${browser_url}" &
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
    --msg-level=all=warn
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
  setsid mpv "${args[@]}" &
  APP_PID=$!
  APP_MODE="mpv"
  MPV_PLAYLIST_PATH="${playlist_path}"
  tail -n +2 "${playlist_path}" > "${MPV_LOADED_PLAYLIST}"
}

while true; do
  if ! kill -0 "${X_PID}" 2>/dev/null; then
    echo "X server exited; returning control to systemd" >&2
    wait "${X_PID}" || true
    exit 1
  fi

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

  if [[ "${DESIRED_MODE}" == "mpv" && "${APP_MODE}" == "mpv" && "${DESIRED_TOKEN}" == "${APP_TOKEN}" && -n "${APP_PID}" ]]; then
    if ! sync_mpv_playlist; then
      APP_TOKEN=""
    fi
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
