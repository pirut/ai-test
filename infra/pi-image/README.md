# Raspberry Pi Image

This folder contains the reproducible image customizations for the showroom player.

## Expected build flow

1. Clone `pi-gen`.
2. Run `infra/pi-image/prepare-artifacts.sh` from this repo to build:
   - `infra/pi-image/artifacts/showroom-agent`
   - `infra/pi-image/artifacts/player/*`
3. Mount this folder as a custom stage.
4. Build a 64-bit Raspberry Pi OS Lite image with the extra packages and systemd units below.

## Runtime pieces

- `showroom-agent.service`: device registration, sync, local HTTP server
- `showroom-kiosk.service`: X11/Openbox/Chromium kiosk session
- `etc/showroom-agent/config.env`: agent environment template
- `boot/network.env.example`: optional boot-partition Wi-Fi file

## Artifact prep

Use the helper script before running `pi-gen`:

```bash
./infra/pi-image/prepare-artifacts.sh
```

It builds the React player bundle and cross-compiles the Go agent for Linux ARM64 into `infra/pi-image/artifacts/`.
