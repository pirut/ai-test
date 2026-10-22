# Showroom OS (Buildroot)

A single-purpose image for Raspberry Pi 5 screens: the Raspberry Pi kernel and
firmware, the native player (`apps/pi-player`, libmpv on DRM), the Go agent,
NetworkManager for Wi-Fi, and RAUC for A/B OS updates. Nothing else: no
Debian, no X11 or Chromium, no Python, no SSH, no package manager.

**Status: prototype for new screens only.** Nothing here reaches a deployed
screen. The Raspberry Pi OS image in `infra/pi-image` stays the fleet image,
and the agent only offers OS bundle installs when its image config sets
`SHOWROOM_SYSTEM_UPDATE_COMMAND`, which only this image does.

## What is kept from the Raspberry Pi OS image

The appliance layer is reused file for file, so behaviour matches:
`post-build.sh` installs the same scripts and units from
`infra/pi-image/systemd` and `infra/pi-image/config` (agent, kiosk launcher,
first-boot Wi-Fi setup on tty1, recovery screen, update guard, maintenance
console and its sudo rules, watchdog and journal limits). The agent and the
player bundle are the same artifacts `prepare-artifacts.sh` builds for signed
app releases, so app releases install and roll back exactly as today.

Differences, all in `board/rpi5`:

| Area | Raspberry Pi OS image | Showroom OS |
| --- | --- | --- |
| Root filesystem | Debian Trixie on A/B EROFS | Buildroot on A/B EROFS |
| OS updates | Raspberry Pi Connect OTA | Signed RAUC bundle, installed by the agent |
| Boot slot switch | `tryboot` via Connect | `tryboot` via a RAUC backend (`rauc-tryboot-backend`) |
| Persistent state | slot-shared mounts | ext4 data partition, bind mounts in `/etc/fstab` |
| HEVC decode | Raspberry Pi's FFmpeg | the same patches on Buildroot's FFmpeg 6.1.5 (`patches/ffmpeg`) |
| yt-dlp | Python zipapp | standalone arm64 binary, downloaded and checksummed by the agent |
| Legacy Chromium kiosk | fallback | not installed |
| Remote shell | Raspberry Pi Connect | none yet |

## Card layout

| # | Partition | Size | Contents |
| --- | --- | --- | --- |
| 1 | autoboot | 16M FAT | `autoboot.txt`: which boot slot the firmware uses |
| 2 | boot-a | 64M FAT | kernel, DTBs, overlays, `config.txt`, `cmdline.txt` |
| 3 | boot-b | 64M FAT | empty until the first OS update |
| 5 | rootfs-a | 512M EROFS | root filesystem, read-only |
| 6 | rootfs-b | 512M EROFS | empty until the first OS update |
| 7 | data | 256M ext4 | grown to fill the card on first boot |

The raw image is about 1.4 GB (the Raspberry Pi OS image is 18 GB because its
data partition is fixed at 12 GB), so it flashes in about a minute.

## How an OS update works

1. A release carries `systemUrl`, `systemSha256` and `systemSignature`, like
   the agent and player artifacts. The agent checks the Ed25519 signature and
   checksum, then runs `showroom-os-install`, which hands the bundle to RAUC.
   RAUC checks the bundle's own signature (`/etc/rauc/keyring.pem`) and its
   `compatible` string before writing the inactive slot.
2. RAUC's custom backend points the slot's `cmdline.txt` at its own root
   partition and sets it as the `[tryboot]` slot in `autoboot.txt`.
3. The agent reboots through `showroom-reboot`, which uses `reboot "0 tryboot"`.
   The firmware boots the new slot once. A crash or hang there resets through
   the hardware watchdog into the old slot, because the tryboot flag is gone.
4. `showroom-os-commit` waits up to five minutes for the agent, the player and
   `/healthz?deep=1`. Healthy: the slot becomes `[all]` (committed). Not
   healthy: the slot is marked bad and the screen reboots into the old one.
   Either kind of rollback sets `last-boot-reason` and `rollback-count`, which
   heartbeats already report.

The dashboard does not send OS bundles yet (`createRelease` refuses
`systemUrl`), and screens on this image advertise a `system_bundles`
capability so a later server change can target only them.

## Build

```bash
SHOWROOM_IMAGE_VERSION=2026.10.22.1 ./infra/buildroot/build.sh
```

Linux on x86_64 or arm64 with Buildroot's host dependencies (build-essential,
file, wget, cpio, unzip, rsync, bc), plus Node, Go, Rust with the
`aarch64-unknown-linux-gnu` target and `gcc-aarch64-linux-gnu` for the agent
and player. Expect one to two hours and about 25 GB of disk the first time.
`build.sh` clones Buildroot 2026.02.3 (LTS) into `infra/buildroot/.buildroot-*`
and writes to `infra/buildroot/out`; the flash image, the OS bundle and
`SHA256SUMS` end up in `out/images`.

The **Showroom OS (Buildroot) image** workflow runs the same build on pull
requests that touch this directory and uploads the image as an artifact. It
never publishes a release.

## Signing keys

```bash
./infra/buildroot/generate-rauc-keys.sh ~/showroom-rauc
```

`ca.cert.pem` is baked into the image; screens only accept bundles signed
under it. Builds without `SHOWROOM_RAUC_CERT` and `SHOWROOM_RAUC_KEY` make
throwaway keys in `out/rauc-dev-keys`, so their bundles only install on images
from the same build. For production, keep `ca.key.pem` offline and store
`ca.cert.pem`, `signing.cert.pem` and `signing.key.pem` as the repository
secrets `SHOWROOM_RAUC_CA_CERT`, `SHOWROOM_RAUC_SIGNING_CERT` and
`SHOWROOM_RAUC_SIGNING_KEY`, then run the workflow with `signing: production`.

App releases keep using the existing Ed25519 key (`infra/pi-image/release-public.base64`).

## Checks

```bash
sudo ./infra/buildroot/tests/tryboot-backend.sh   # A/B state machine, in a mount namespace
./infra/buildroot/tests/post-image-dry-run.sh     # card layout and signed bundle, with stand-in inputs
./infra/buildroot/tests/check-defconfig.sh        # every defconfig option resolves as written
```

The build itself fails if FFmpeg lost the `hevc_v4l2request` decoder (for
example after a Buildroot bump changes the FFmpeg version under
`patches/ffmpeg/<version>`).

## First hardware test

On one spare Pi 5, not a showroom screen:

1. Flash `showroom-os-rpi5-<version>.img.xz` with Raspberry Pi Imager
   (Use custom, no OS customisation).
2. Wi-Fi setup appears on the screen; pair the screen as usual.
3. Check a 1080p and a 4K HEVC video play smoothly with sound over HDMI, and
   that `vcgencmd get_throttled` and screenshots work in the dashboard.
4. Build a second version with the same keys, download its `.raucb` on the
   maintenance console (Ctrl+Alt+F1) with `curl -o /tmp/os.raucb <url>`,
   install it with `sudo /usr/libexec/showroom/showroom-os-install /tmp/os.raucb`
   and `sudo /usr/libexec/showroom/showroom-reboot`, and confirm the screen
   comes back on the other slot and `sudo rauc status` shows it committed.
5. Pull power during the trial boot of a third version and confirm it comes
   back on the previous slot.

## Moving an existing screen over

A screen cannot switch from Raspberry Pi OS to Showroom OS by OTA: the
partition layout differs, and a failed remote repartition would leave a dead
screen in a showroom. The safe path is a reflash during a visit, one screen at
a time, after the steps above pass. After the reflash the screen pairs like a
new one.
