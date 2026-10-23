# Showroom Agent

Go system service for Raspberry Pi devices.

## Responsibilities

- Register unclaimed devices and poll claim status
- Persist device credential and active manifest locally
- Download and verify media into the cache
- Resolve YouTube-backed video assets into cached local MP4 files with `yt-dlp`
- Serve the player bundle and local manifest on `127.0.0.1:4173`
- Serve `/local/player/state` (cached playlist with local paths, claim and
  Wi-Fi state) to the native Pi player in `apps/pi-player`
- First-time Wi-Fi: `/local/wifi/status` (with a cached scan list for
  unclaimed screens), `/local/wifi/networks`, `/local/wifi/configure` (open
  networks need no password) and, with `SHOWROOM_SETUP_HOTSPOT=1`, a setup
  hotspot with a phone page on `10.42.0.1` while an unclaimed screen is offline
- Poll remote commands
- Send heartbeats and screenshot metadata
- Restart Chromium or reboot the Pi on approved commands
