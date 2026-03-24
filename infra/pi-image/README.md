# Raspberry Pi Image

This folder contains the reproducible image customizations for the showroom player.

## Expected build flow

The supported path now is a single wrapper script that prepares artifacts, clones
`pi-gen` on the `arm64` branch when needed, and emits a flashable Raspberry Pi
disk image under `infra/pi-image/out/deploy/`.

```bash
SHOWROOM_FIRST_USER_PASS='choose-a-password' ./infra/pi-image/build-image.sh
```

This produces a bootable Raspberry Pi image artifact such as `.img.xz`. Raspberry
Pi devices do not use ISO images.

If you want to run the steps manually, the wrapper script does this:

1. Run `infra/pi-image/prepare-artifacts.sh` to build:
   - `infra/pi-image/artifacts/showroom-agent`
   - `infra/pi-image/artifacts/player/*`
2. Clone `pi-gen` on the `arm64` branch.
3. Build a 64-bit Raspberry Pi OS Lite image with `infra/pi-image/stage-showroom`
   as a custom stage.

## Runtime pieces

- `showroom-agent.service`: device registration, sync, local HTTP server
- `showroom-kiosk.service`: X11/Openbox/Chromium kiosk session
- `etc/showroom-agent/config.env`: agent environment template
- `boot/network.env.example`: optional build-time Wi-Fi template

## Artifact prep

Use the helper script before running `pi-gen` manually:

```bash
./infra/pi-image/prepare-artifacts.sh
```

It builds the React player bundle and cross-compiles the Go agent for Linux ARM64 into `infra/pi-image/artifacts/`.

For OTA fleet rollouts, use:

```bash
./infra/pi-image/prepare-release-artifacts.sh
```

That produces:
- `infra/pi-image/artifacts/showroom-agent`
- `infra/pi-image/artifacts/player-release.tar.gz`
- `infra/pi-image/artifacts/system-release.tar.gz`

`system-release.tar.gz` is the system-level Pi bundle used by the admin release API for files such as `/usr/local/bin/showroom-start-kiosk`.

## Wi-Fi

By default the kiosk now handles first-time Wi-Fi setup on-screen. If the Pi boots without network access and has not registered yet, the local player shows a form that saves credentials through `nmcli` and retries registration automatically.

The local Wi-Fi flow is offline-first: `showroom-agent.service` and `showroom-kiosk.service` should start without waiting for `network-online.target`, so the on-device browser can render the setup form before the Pi has connectivity.

The image also installs `/etc/X11/Xwrapper.config` with `allowed_users=anybody` so `startx` can launch from the `showroom-kiosk.service` system unit running as `pi`.

The kiosk image installs `/etc/X11/xorg.conf.d/99-modesetting.conf` so Xorg uses
the accelerated modesetting path on the Raspberry Pi, and the default screenshot
command exports `DISPLAY` and `XAUTHORITY` so `showroom-agent` can capture the
active X session.

If you still want to bake Wi-Fi credentials into the image, create `infra/pi-image/boot/network.env` before running `pi-gen`:

```bash
WIFI_SSID=Your Wi-Fi Name
WIFI_PSK=Your Wi-Fi Password
```

The custom stage turns that file into `/boot/firmware/network-config` inside the image. If `network.env` is absent, the stage falls back to `boot/network-config` when present.

## Wrapper script knobs

`infra/pi-image/build-image.sh` accepts these optional environment variables:

- `SHOWROOM_IMAGE_NAME` default `showroom`
- `SHOWROOM_DEPLOY_COMPRESSION` default `xz`
- `SHOWROOM_HOSTNAME_PREFIX` default `showroom`; used to derive unique first-boot hostnames like `showroom-ab12`
- `SHOWROOM_HOSTNAME` optional fixed hostname override; when set, the image keeps that exact hostname
- `SHOWROOM_UNIQUE_HOSTNAME` default `1`; set to `0` to skip first-boot hostname derivation
- `SHOWROOM_TIMEZONE` default `America/New_York`
- `SHOWROOM_WPA_COUNTRY` default `US`
- `SHOWROOM_ENABLE_SSH` default `1`
- `SHOWROOM_PASSWORDLESS_SUDO` default `1`
- `SHOWROOM_SSH_PUBKEY` optional authorized key for the `pi` user
- `PIGEN_DIR` optional existing `pi-gen` checkout to reuse
