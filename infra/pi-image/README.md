# Raspberry Pi appliance image

The supported fleet image is a 64-bit Raspberry Pi OS Trixie appliance built with
the Raspberry Pi Foundation's `rpi-image-gen`. It uses two immutable EROFS system
slots, a persistent data partition, `tryboot` rollback, NetworkManager, hardware
and systemd watchdogs, and Raspberry Pi Connect OTA support.

This replaces the legacy `pi-gen` image path. Existing devices need one final
reflash to gain the A/B partition table; app, content, configuration, and future
OS updates are remote after that.

The image agent advertises the `showroom-appliance-v2` capability contract in
its first heartbeat. That heartbeat activates fleet management for only that Pi;
devices still running the old image remain in legacy-compatible mode and are
excluded from network rotation, new telemetry retention, and release rollouts.

## Build

Run on a supported Debian/Ubuntu arm64 builder (a Pi 5, arm64 CI runner, or arm64
Linux VM):

```bash
export SHOWROOM_DEVICE_LAYER=rpi5
./infra/pi-image/build-appliance-image.sh
```

The production public verification key is committed at
`release-public.base64`. Override `SHOWROOM_RELEASE_PUBLIC_KEY` only when
intentionally rotating the signing key.

The builder pins `rpi-image-gen` to v2.7.0 by default. Set
`SHOWROOM_RPI_IMAGE_GEN_VERSION` deliberately when upgrading it. The generated
work directory contains the flashable `.img`, A/B OTA `update.tar.zst`, SBOM, and
vulnerability report when the upstream build completes.

The Linux builder needs at least 2 GB RAM and roughly 30 GB free disk for this
partition layout. Set `SHOWROOM_INSTALL_BUILD_DEPS=1` on a disposable CI runner
to let the official upstream dependency installer use `sudo`; provision stable
builders ahead of time and leave it unset there.

Supported device layers are `rpi4`, `rpi5`, `cm4`, and `cm5`. Use the CM image
only for the matching Compute Module hardware profile.

For a fleet, omit `SHOWROOM_CONNECT_AUTH_KEY` and register a unique Connect for
Organisations device identity during factory provisioning. The identity is tied
to the Pi's firmware/OTP key, can be pre-created without billing, and keeps the
organisation management token off both the image and device. An embedded auth
key is supported only for a one-off or small commissioning batch.

## Signing keys

Generate a release key once:

```bash
./infra/pi-image/generate-release-signing-key.sh
```

Store the private PEM in the dashboard deployment secret
`SHOWROOM_RELEASE_SIGNING_PRIVATE_KEY`, store its ID in
`SHOWROOM_RELEASE_SIGNING_KEY_ID`, and bake only the base64 public key into the
image. A device rejects unsigned or mismatched app artifacts before changing its
active symlink.

## Persistent state

`/var/lib/showroom` and the kiosk Chromium profile are slot-shared. Device
identity, credentials, cached media, the last two content generations, app slots,
and rollback markers survive OS slot changes. Journals are bounded to protect
flash endurance.

## OS OTA

Publish `update.tar.zst` through Raspberry Pi Connect OTA. Connect OTA and
`tryboot` manage the OS-slot commit or rollback, so a failed boot returns to the
previous slot. The separate Showroom update guard validates and rolls back
agent/player application slots. App releases continue through the dashboard
release center.

## First boot

If no network is available, the local player presents Wi-Fi setup. The dashboard
can later stage replacement credentials; NetworkManager retains old profiles as
fallbacks. Connect provides break-glass remote shell access without exposing SSH
to the public internet.
