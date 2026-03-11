# Raspberry Pi Image

This folder contains the reproducible image customizations for the showroom player.

## Expected build flow

1. Clone `pi-gen`.
2. Mount this folder as a custom stage.
3. Build a 64-bit Raspberry Pi OS Lite image with the extra packages and systemd units below.

## Runtime pieces

- `showroom-agent.service`: device registration, sync, local HTTP server
- `showroom-kiosk.service`: X11/Openbox/Chromium kiosk session
- `etc/showroom-agent/config.env`: agent environment template
- `boot/network.env.example`: optional boot-partition Wi-Fi file

