# Showroom native player

Rust player for Raspberry Pi screens. It draws images, video and the setup
screens with libmpv straight to the display over DRM/KMS, so a screen needs no
X11, window manager or browser.

The Go agent stays in charge of sync, caching and commands. The player polls
`GET /local/player/state` on the agent's loopback server every 2 seconds and
posts progress to `/local/playback` every 10 seconds and on each new item.

## What it does

- Plays the cached playlist (images and videos, mixed) in one mpv playlist, so
  transitions are gapless and a growing playlist never interrupts the item on
  screen. Items still downloading are skipped until they are cached.
- Applies volume and rotation changes live, without restarting playback.
- Shows the claim code, Wi-Fi setup (typed on a USB keyboard) and
  "waiting for content" screens as mpv OSD overlays.
- Reopens a video that stops advancing for 20 seconds, and skips it after a
  second stall when the playlist has other items.
- Skips files that fail to open or do not open within 30 seconds. When every
  item fails it stops and retries with a growing backoff (5 s to 5 min), or at
  once if the agent sends a different playlist.
- Waits for a TV that is off at boot instead of failing, and restarts itself
  (exit 75, re-run by the launcher) when HDMI reconnects so DRM and HDMI audio
  are probed again.
- Arms a 60 s systemd watchdog (`WATCHDOG_USEC`, `SHOWROOM_PLAYER_WATCHDOG_SEC`)
  and pings it from its main loop, so a hung player is killed and restarted.
- Reports an `idle` heartbeat on setup and waiting screens, so the agent's
  health check does not restart the kiosk while a screen waits for content.
- Writes `$XDG_RUNTIME_DIR/screenshot.jpg` on `SIGUSR1` for the agent's
  screenshot upload (`showroom-screenshot` in the image).

libmpv is loaded with `dlopen` at runtime. If libmpv is missing or mpv cannot
open the DRM display, the player exits with status 78 and
`showroom-kiosk-launch` falls back to the legacy X11/Chromium kiosk. It does
the same when the agent is too old to serve `/local/player/state`, and after
three native crashes within 15 minutes (until the next reboot).

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `SHOWROOM_DISPLAY_MODE` | `1920x1080` | `drm-mode`; `preferred` uses the monitor's native mode |
| `SHOWROOM_DRM_CONNECTOR` | auto | e.g. `HDMI-A-1` |
| `SHOWROOM_DRM_DEVICE` | auto | e.g. `/dev/dri/card1` |
| `SHOWROOM_HWDEC` | `auto-safe` | mpv `hwdec` |
| `SHOWROOM_MPV_VO` | `gpu` | mpv video output (`gpu` uses `gpu-context=drm`) |
| `SHOWROOM_AUDIO_DEVICE` | HDMI with a monitor | mpv `audio-device` |
| `SHOWROOM_AGENT_URL` | `http://127.0.0.1:4173` | agent loopback server |

## Build and test

```bash
cargo test
# arm64 release binary, as packaged into the player bundle:
CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc \
  cargo build --release --target aarch64-unknown-linux-gnu
```

`infra/pi-image/prepare-artifacts.sh` builds it and installs it as
`bin/showroom-player` inside the signed `player-release.tar.gz`, so it ships
and rolls back through the existing app release lane.

To preview a setup screen off-device, render its ASS events:
`cargo run -- --dump-screen claim` (also `wifi`, `waiting`, `downloading`).
