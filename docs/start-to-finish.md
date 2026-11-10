# Digital Curator, start to finish

One path through the whole product: what the operator sets up once, what a
customer does to get a screen playing, and how screens are looked after and
updated afterwards. Each step links to the detailed document for it.

There are two kinds of screen image:

| | Showroom OS | Raspberry Pi OS appliance |
| --- | --- | --- |
| Source | `infra/buildroot` | `infra/pi-image` |
| For | every new screen (Pi 5) | screens deployed before Showroom OS |
| Player | native (`apps/pi-player`) | native, or Chromium (`apps/player`) as fallback |
| OS updates | signed RAUC bundle in a dashboard release | Raspberry Pi Connect OTA |
| Remote shell | Tailscale SSH | Tailscale SSH, OpenSSH, Raspberry Pi Connect |

Both run the same agent (`apps/agent`), pair the same way and take the same
app releases. A screen moves from the older image to Showroom OS by reflash
only.

## Part 1: operator setup (once)

1. **Website.** Deploy `apps/admin` to Vercel with Clerk (Organizations on)
   and Convex. Settings are listed in [`infra/vercel/README.md`](../infra/vercel/README.md)
   and `apps/admin/.env.example`. `CONVEX_DEPLOY_KEY` makes each production
   deploy push the Convex functions too.
2. **App release signing.** Screens only install player and agent builds
   signed with the Ed25519 key whose public half is in
   `infra/pi-image/release-public.base64`. Put the private key in
   `SHOWROOM_RELEASE_SIGNING_PRIVATE_KEY` and its id in
   `SHOWROOM_RELEASE_SIGNING_KEY_ID` on Vercel so the Releases page can sign.
3. **Image publishing.** Run `infra/buildroot/setup-image-publishing.sh --production`
   once. It creates the public images repository and stores the OS signing
   keys as repository secrets. See [`infra/buildroot/README.md`](../infra/buildroot/README.md).
4. **First stable image.** Run the "Showroom OS (Buildroot) image" workflow
   by hand with `signing: production` and `publish_stable`. It publishes the
   flash image at a fixed address and the OS bundle at a versioned one.
5. **Download link.** Set `NEXT_PUBLIC_SHOWROOM_IMAGE_URL` on Vercel to the
   stable image address. Until it is set, the Get started page says the
   download is not available. Never point it at the `dev` channel.
6. **Who may publish releases.** Set `SHOWROOM_PLATFORM_ORG_IDS` on Convex to
   your own Clerk organization id before inviting customers. From then on
   only that workspace sees Releases, and it can roll a release out to every
   workspace's screens.
7. **Remote shell (optional).** Follow "Remote SSH (Tailscale)" in
   [`infra/pi-image/README.md`](../infra/pi-image/README.md) and set the
   Tailscale variables on Vercel. Without them screens simply do not join.

## Part 2: a customer's first screen

1. **Sign up** and create a workspace. A new workspace opens on **Get started**.
2. **Download the image** and write it to a microSD card with Raspberry Pi
   Imager (Raspberry Pi 5, "Use custom", no OS customisation).
3. **Plug in** the card, HDMI, then power. The first start restarts once on
   its own while it grows the storage partition.
4. **Get online.** With a network cable there is nothing to do. For Wi-Fi the
   TV shows a QR code: scanning it joins the screen's own setup hotspot and
   opens a page to pick the network. A USB keyboard works too, on the TV
   itself.
5. **Pair.** Once online the TV shows a 6-character code and a QR code.
   Scanning opens the dashboard with the code filled in; typing the code into
   **Add screen** does the same. The code renews itself if it expires.
6. **Add content.** Upload photos and videos or add YouTube links in
   **Media**, put them in order in **Playlists**, and tick **Workspace
   default** on one playlist. Every screen plays the default unless it has
   its own playlist or a schedule says otherwise.

What the TV shows along the way, in both players:

| Situation | On the TV |
| --- | --- |
| Starting | "Starting player" |
| No network | Wi-Fi setup with the phone QR code |
| Online, no code yet | "Getting a pairing code" |
| Online, service not answering | "Can't reach Digital Curator", keeps retrying |
| Unpaired | pairing code and QR code |
| Paired, nothing assigned | "Waiting for content" |
| Paired, first download | "Downloading your content" |
| Every item fails to play | "Can't play this content" |
| Internet lost while playing | keeps playing saved content, small offline badge |
| Removed from the workspace | clears its content and shows a new pairing code |

## Part 3: day to day

- **Overview** lists screens that need attention; **Screens** shows each
  screen's health, a recent screenshot, what it plays and whether the last
  change has arrived.
- From a screen's page: sync now, refresh the screenshot, restart the player,
  restart the Pi, blank the display, change orientation, volume and time zone,
  move it to new Wi-Fi, or remove it.
- **Schedules** play a different playlist during set hours and then return to
  the default.
- Screens keep playing saved content without internet and catch up when it
  returns. See [`reliability.md`](reliability.md).
- Members can look; only workspace admins can change things.
- With Tailscale set up, an operator can `ssh` to `showroom-<screen id>`.

## Part 4: updates

**Player and agent.** Build and sign with `npm run pi:prepare-release`, then
create a release on the Releases page. Rollout goes to one screen first, then
1%, 5%, 25% and 100%, and pauses if a tenth of a ring fails. Each screen
checks the signature and checksum, switches version, and goes back to the
previous one if the player or agent does not come up healthy.

**Showroom OS.** Publish a stable image build, then add its `.raucb` address
and SHA-256 to a release, using the image version as the release version. The
bundle is sent only to screens running Showroom OS. A screen installs it to
its spare slot, restarts into it once on trial, and keeps it only after the
agent and player pass a health check; otherwise it returns to the previous
system. The rollout counts a screen as updated when it reports the new
version after the restart.

**Raspberry Pi OS appliance.** Operating system updates still go through
Raspberry Pi Connect OTA. See [`fleet-operations.md`](fleet-operations.md).

## Not proven on hardware yet

Checks in this repository run without a Pi. Before relying on a new image for
customers, run these once on a spare Pi 5:

1. Flash, first boot, phone Wi-Fi setup, pairing by QR code.
2. 1080p and 4K HEVC video with sound; a deliberately broken video as the only item.
3. Remove all content from the screen, then remove the screen itself.
4. An app release with a deliberately broken agent (expect an automatic return to the previous one).
5. An OS update from the Releases page, then one with power pulled during the trial boot.
