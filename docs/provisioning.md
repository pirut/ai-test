# Provisioning

## Flashing

1. Build the image from `infra/pi-image`.
2. Flash the image to an SD card.
3. Boot the Raspberry Pi with HDMI connected.
4. If the device starts offline, use the on-screen Wi-Fi setup form to connect it.

If you prefer to preload Wi-Fi instead, create `infra/pi-image/boot/network.env` before the build so the image includes `/boot/firmware/network-config`.

## Claiming

1. Wait for the claim code screen.
2. Open the admin dashboard.
3. Enter the claim code and assign the screen.
4. The device stores a permanent credential and begins polling for manifests.

## Local cache

- Media cache root: `/var/lib/showroom/cache`
- Device state: `/var/lib/showroom/state`
- Agent config: `/etc/showroom-agent/config.env`
