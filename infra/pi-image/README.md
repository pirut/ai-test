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

Run on a supported Debian/Ubuntu arm64 builder (a Pi 5 or arm64 Linux VM):

```bash
export SHOWROOM_DEVICE_LAYER=rpi5
./infra/pi-image/build-appliance-image.sh
```

Production image builds are intentionally local/manual. The GitHub workflow is
available only through `workflow_dispatch` for emergency use; pushes and
schedules do not build or publish appliance images.

On an Apple silicon development Mac, build the pinned local ARM64 toolchain and
run the image build in a privileged container so loop devices and filesystem
creation work normally:

```bash
colima start --cpu 6 --memory 8 --disk 40 --arch aarch64 --vm-type vz --mount-type virtiofs

docker build \
  --file infra/pi-image/local-build/Dockerfile \
  --tag showroom-pi-builder:local \
  .

docker run --rm --privileged \
  --volume "$PWD:/source:ro" \
  showroom-pi-builder:local \
  bash -lc 'set -euo pipefail
    rsync -a --exclude .git --exclude node_modules --exclude infra/pi-image/out /source/ /build/ai-test/
    cd /build/ai-test
    npm ci
    SHOWROOM_IMAGE_VERSION=YYYY.MM.DD.N \
    SHOWROOM_DEVICE_LAYER=rpi5 \
    SHOWROOM_RPI_IMAGE_GEN_DIR=/opt/rpi-image-gen \
    SHOWROOM_INSTALL_BUILD_DEPS=0 \
    ./infra/pi-image/build-appliance-image.sh'
```

Keep at least 40 GiB allocated to the local Linux VM and 5 GiB free on the Mac.
The raw image is sparse, but rpi-image-gen temporarily creates compressed flash,
provisioning, manifest, and A/B update assets before the final XZ is written.

Copy `infra/pi-image/out/release-rpi5` out of the container before removing it,
then independently run `xz -t` and compare the artifact's SHA-256 digest with
`SHA256SUMS.sha256` before publishing it.

The production public verification key is committed at
`release-public.base64`. Override `SHOWROOM_RELEASE_PUBLIC_KEY` only when
intentionally rotating the signing key.

The builder pins `rpi-image-gen` to v2.7.0 by default. Set
`SHOWROOM_RPI_IMAGE_GEN_VERSION` deliberately when upgrading it. The release
directory contains a Raspberry Pi Imager-ready `.img.xz`, its SHA-256 checksum,
the separately checksummed A/B OTA archive, the package manifest, build
configuration, and SBOM when the upstream build completes.

The image overlay currently replaces v2.7.0's `slot-shared-generator`. Upstream
v2.7.0 creates mount units for every shared path but activates only the last
one. The replacement activates every generated unit and is covered by the
source and generated-root validation. Re-audit and remove the override only
after a pinned upstream release contains the equivalent fix.

Every build runs source-contract checks, validates the prepared overlay, mounts
and inspects both generated EROFS system slots plus the persistent partition,
verifies systemd units and account/device permissions, tests the compressed XZ
stream, and verifies the published SHA-256 digest. The permanent GitHub Release
also includes `appliance-validation.txt`; creating a release does not enqueue an
OTA or contact deployed devices.

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
flash endurance. The persistent journal retains agent, kiosk, X11 startup, and
boot failure context across reboot and A/B rollback, with a 256 MB ceiling and
14-day retention policy.

## OS OTA

Publish `update.tar.zst` through Raspberry Pi Connect OTA. Connect OTA and
`tryboot` manage the OS-slot commit or rollback, so a failed boot returns to the
previous slot. The separate Showroom update guard validates and rolls back
agent/player application slots. App releases continue through the dashboard
release center.

## First boot

Before the agent or player can start on a fresh flash, tty1 presents a full-screen
NetworkManager Wi-Fi selector. A technician chooses the SSID and enters its
password locally; no site or fleet Wi-Fi password is embedded in the image. The
appliance verifies a default route and the Digital Curator control plane before
continuing into enrollment. Ethernet or an already provisioned connection passes
the same check automatically. The completion marker and root-only NetworkManager
profiles live on the persistent partition, so the prompt does not recur after an
A/B update or a temporary outage.

The Pi 5 image uses NetworkManager with `wpa_supplicant`, not `iwd`. Raspberry
Pi's BCM43455 firmware delegates WPA3/SAE authentication in a way that is known
to fail with `iwd`; `wpa_supplicant` uses the supported path. To intentionally
replace a deployed screen's Wi-Fi connection from the physical console, run:

```bash
sudo showroom-network-setup
```

The dashboard can later stage replacement credentials; NetworkManager retains
old profiles as fallbacks. Connect provides break-glass remote shell access
without exposing SSH to the public internet.

The kiosk runs on tty7. Tty1 automatically logs into the locked, non-root
`showroom-maint` physical-console account, so a failed kiosk never leaves a
technician at an unusable password prompt. No maintenance password is embedded
in the fleet image, the account is denied SSH access, and SSH password and root
login remain disabled. Its passwordless sudo policy is limited to service
recovery, relevant logs, NetworkManager, diagnostics, Connect status, and safe
power operations; it does not grant `NOPASSWD: ALL`.

After the kiosk reaches its bounded restart limit, the appliance switches to a
recovery screen with identity, enrollment, network, failure, and Raspberry Pi
Connect information. It retries the kiosk every 15 minutes without creating a
tight permanent restart loop. At any physical-console shell, run:

```bash
showroom-diagnostics
sudo systemctl restart showroom-agent.service
sudo systemctl reset-failed showroom-kiosk.service
sudo systemctl restart showroom-kiosk.service
sudo showroom-network-setup
sudo -u pi rpi-connect status
```

Use Ctrl+Alt+F1 for recovery and Ctrl+Alt+F7 for a healthy kiosk.
