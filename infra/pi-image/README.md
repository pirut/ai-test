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
- `boot/network.env.example`: optional build-time Wi-Fi template

## Artifact prep

Use the helper script before running `pi-gen`:

```bash
./infra/pi-image/prepare-artifacts.sh
```

It builds the React player bundle and cross-compiles the Go agent for Linux ARM64 into `infra/pi-image/artifacts/`.

## Wi-Fi

By default the kiosk now handles first-time Wi-Fi setup on-screen. If the Pi boots without network access and has not registered yet, the local player shows a form that saves credentials through `nmcli` and retries registration automatically.

If you still want to bake Wi-Fi credentials into the image, create `infra/pi-image/boot/network.env` before running `pi-gen`:

```bash
WIFI_SSID=Your Wi-Fi Name
WIFI_PSK=Your Wi-Fi Password
```

The custom stage turns that file into `/boot/firmware/network-config` inside the image. If `network.env` is absent, the stage falls back to `boot/network-config` when present.
