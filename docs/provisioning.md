# Provisioning

The full walk-through, from website setup to a playing screen, is in
[`start-to-finish.md`](start-to-finish.md). This page keeps the device-side
details.

## Images

- New screens: Showroom OS (`infra/buildroot`), downloaded from the Get
  started page and written with Raspberry Pi Imager.
- Screens deployed before Showroom OS: the Raspberry Pi OS appliance
  (`infra/pi-image`). To preload Wi-Fi on that image, create
  `infra/pi-image/boot/network.env` before the build.

## First boot

1. Connect HDMI, then power. Showroom OS restarts once while it grows its data partition.
2. Offline screens show Wi-Fi setup: a QR code for the phone setup page, or a USB keyboard on the TV.
3. Online screens show a 6-character pairing code and a QR code that opens the dashboard with the code filled in.
4. After an admin adds the screen, it stores its credential and downloads its playlist.

## Where things live on the screen

| | Showroom OS | Raspberry Pi OS appliance |
| --- | --- | --- |
| Media cache | `/data/showroom/cache` (bind-mounted at `/var/lib/showroom/cache`) | `/var/lib/showroom/cache` |
| Device state | `/var/lib/showroom/state` | `/var/lib/showroom/state` |
| Agent config | `/etc/showroom-agent/config.env` | `/etc/showroom-agent/config.env` |
