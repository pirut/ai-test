# Showroom Agent

Go system service for Raspberry Pi devices.

## Responsibilities

- Register unclaimed devices and poll claim status
- Persist device credential and active manifest locally
- Download and verify media into the cache
- Serve the player bundle and local manifest on `127.0.0.1:4173`
- Poll remote commands
- Send heartbeats and screenshot metadata
- Restart Chromium or reboot the Pi on approved commands

The machine running this repository does not currently have `go` installed, so this package is provided as source only in this scaffold.

