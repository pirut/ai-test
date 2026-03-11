# Showroom Agent

Go system service for Raspberry Pi devices.

## Responsibilities

- Register unclaimed devices and poll claim status
- Persist device credential and active manifest locally
- Download and verify media into the cache
- Resolve YouTube-backed video assets into cached local MP4 files with `yt-dlp`
- Serve the player bundle and local manifest on `127.0.0.1:4173`
- Poll remote commands
- Send heartbeats and screenshot metadata
- Restart Chromium or reboot the Pi on approved commands
