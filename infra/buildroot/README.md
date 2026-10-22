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
requests that touch this directory and on `main`, smoke-tests the root
filesystem and uploads the image as an artifact. Once publishing is set up
(below) it also puts every development build on the dev channel.

Rebuilding in the same output directory is incremental: after the first build,
`SHOWROOM_SKIP_ARTIFACTS=1 ./infra/buildroot/build.sh` takes a few minutes for
a change to the overlay, the board scripts or one package
(`make -C infra/buildroot/.buildroot-2026.02.3 O=$PWD/infra/buildroot/out <package>-rebuild all`).

## Iterating without reflashing

Flash a test screen once with a development image; after that nothing needs a
card reader.

| Change | Loop | Time |
| --- | --- | --- |
| Player or agent | `./infra/pi-image/dev-push.sh root@<test screen>` builds them and swaps them in over SSH | seconds |
| Anything in the image | push to a branch; CI builds, smoke-tests and publishes to the dev channel; the test screen installs it into its spare slot, health-checks it and keeps it or falls back | CI time, then about 5 minutes |
| Field release | manual workflow run with `signing: production` and `publish_stable` | CI time |

**Development images** are CI builds signed with the development keys. They
carry `/etc/showroom/os-channel.env`, so `showroom-os-follow` checks the dev
channel every few minutes and installs any new build through RAUC, exactly
like an OS update (A/B slot, trial boot, `showroom-os-commit`). A build that
does not come up healthy falls back and is never retried. Their
`PRETTY_NAME` ends in "dev". Field images have no channel and only trust the
production key, so they can never install a development bundle.

`dev-push.sh` only touches test screens: development images, or a screen
where someone ran `sudo touch /var/lib/showroom/dev-device`. It installs the
build as a `dev-<time>` release beside the signed ones, so the next signed
release replaces it; `dev-push.sh <screen> --revert` goes back at once. It
needs SSH to the screen (Tailscale SSH, or any SSH on a bench screen).

**Smoke test.** `tests/rootfs-smoke.py <image>` checks a built root filesystem
without hardware: every binary's libraries and loader, glibc symbol versions
of the agent and player (built outside Buildroot), the programs of every
systemd unit, script interpreters, enabled units and the links to the built-in
agent and player. It runs in CI before anything is published.

### Setting up publishing (once)

```bash
./infra/buildroot/setup-image-publishing.sh            # images repo, dev keys, publishing token
./infra/buildroot/setup-image-publishing.sh --production   # also the production keys
```

It creates the public images repository (`pirut/showroom-os`), stores the
development signing keys and a token that can write to that repository as
secrets of this repository. The next CI build publishes to
`https://github.com/pirut/showroom-os/releases/tag/dev`; flash
`showroom-os-rpi5-dev.img.xz` from there onto the test screen. Stable releases
appear at
`https://github.com/pirut/showroom-os/releases/latest/download/showroom-os-rpi5.img.xz`.

## Signing keys

```bash
./infra/buildroot/generate-rauc-keys.sh ~/showroom-rauc
```

`ca.cert.pem` is baked into the image; screens only accept bundles signed
under it. Local builds without `SHOWROOM_RAUC_CERT` and `SHOWROOM_RAUC_KEY`
make throwaway keys in `out/rauc-dev-keys`, so their bundles only install on
images from the same output directory. CI uses the development keys from the
`SHOWROOM_RAUC_DEV_*` secrets, or the production keys (`SHOWROOM_RAUC_CA_CERT`,
`SHOWROOM_RAUC_SIGNING_CERT`, `SHOWROOM_RAUC_SIGNING_KEY`) for a manual run
with `signing: production`; `setup-image-publishing.sh` creates both. Keep the
production `ca.key.pem` offline.

App releases keep using the existing Ed25519 key (`infra/pi-image/release-public.base64`).

## Checks

```bash
sudo ./infra/buildroot/tests/tryboot-backend.sh   # A/B state machine, in a mount namespace
./infra/buildroot/tests/post-image-dry-run.sh     # card layout and signed bundle, with stand-in inputs
./infra/buildroot/tests/check-defconfig.sh        # every defconfig option resolves as written
./infra/buildroot/tests/os-follow.sh              # development OS channel follower
./infra/buildroot/tests/rootfs-smoke.py out/images/rootfs.erofs   # a built image
```

The build itself fails if FFmpeg lost the `hevc_v4l2request` decoder (for
example after a Buildroot bump changes the FFmpeg version under
`patches/ffmpeg/<version>`).

## First hardware test

On one spare Pi 5, not a showroom screen:

1. Flash `showroom-os-rpi5-dev.img.xz` from the dev channel with Raspberry Pi Imager
   (Use custom, no OS customisation).
2. Wi-Fi setup appears on the screen; pair the screen as usual.
3. Check a 1080p and a 4K HEVC video play smoothly with sound over HDMI, and
   that `vcgencmd get_throttled` and screenshots work in the dashboard.
4. Use a development image from the dev channel. Push any change to a
   branch; within a few minutes of the build finishing the screen installs it,
   comes back on the other slot, and `sudo rauc status` shows it committed.
5. Pull power during the trial boot of a later build and confirm it comes
   back on the previous slot (and does not retry that build).

## Moving an existing screen over

A screen cannot switch from Raspberry Pi OS to Showroom OS by OTA: the
partition layout differs, and a failed remote repartition would leave a dead
screen in a showroom. The safe path is a reflash during a visit, one screen at
a time, after the steps above pass. After the reflash the screen pairs like a
new one.
