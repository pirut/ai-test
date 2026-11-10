# Playback reliability

Showroom is designed to keep the last known-good playlist running when the network or control plane is unavailable.

## Runtime behavior

- The agent downloads content into its local cache and verifies SHA-256 checksums when the manifest supplies a digest.
- A manifest refresh preserves the currently playing item when it still exists. Polling does not restart the playlist.
- Browser playback advances after media errors, retries transient failures, and uses a watchdog to escape stalled video.
- A failed status, Wi-Fi, or manifest request does not discard the other successful responses or the last working playlist.
- The Raspberry Pi supervisor sends the complete cached playlist to `mpv`, rather than only the first item. Mixed image/video playlists use the browser player; all-video playlists may use `mpv` for hardware-accelerated playback.
- YouTube acquisition defaults to a 15-minute timeout with retries. Override it with `SHOWROOM_YOUTUBE_DOWNLOAD_TIMEOUT` when required.

## Schedules and offline playback

- A schedule is either one time (a start and an end date) or weekly (days of the week and a start and end time). Weekly times are on each screen's own clock, using the time zone set on the screen's page, so 9:00 is 9:00 in every showroom and follows daylight saving.
- The screen decides what plays, not the server. The saved manifest holds every schedule and the agent picks the active one each time the player asks (`apps/agent/internal/local/schedule.go`; the web player uses the same rules from `packages/contracts`). A screen with no network keeps switching playlists on time.
- Higher priority wins. At equal priority a one-time schedule beats a weekly one, then the earlier one in the list. An end time at or before the start runs past midnight and belongs to the day it started on; equal start and end is all day.
- Media for every schedule is downloaded ahead of time, not when its window opens. After the first two items, the agent fetches the rest back to back instead of one per poll interval, so the whole set is on the card quickly.
- Heartbeats report `sync.savedItems` and `sync.totalItems`. The screen page shows them as "Saved on screen", which is what the screen can play without internet. The last report stays on the page while a screen is offline.
- A weekly schedule is sent with `recurrence` and with `startsAt`/`endsAt` set to 1970. Screens whose software predates weekly schedules read only those two fields, so they never play it at the wrong time: they stay on their default playlist and the Schedules page lists them as needing an update (`sync.repeatingSchedules`).
- Clock: a Pi keeps time from the network. If the clock is more than a day behind the manifest (a screen with no clock battery that booted offline), schedules wait and the default playlist plays until the time is set. A screen that was powered off while offline and has no clock battery resumes from its last saved time, so weekly schedules can run late by however long it was off until it is back online.

## Cloud link

- The agent runs three independent loops: sync (pairing, credential refresh, manifest and media), commands, and heartbeats. A long media download never delays a dashboard command, and commands never wait on a sync.
- Commands are long-polled: the agent asks for commands with `waitSeconds=20`, and the server holds the request on a Convex subscription until a command is queued, so dashboard buttons act within about a second. Against a server that answers immediately, the agent falls back to polling every `SHOWROOM_POLL_INTERVAL`.
- The same long poll wakes when new content is published to the screen, and every answer carries the screen's published `manifestVersion`. When it differs from what the agent plays, the agent syncs at once, so playlist and schedule edits land in seconds. Agents that predate the field ignore it and pick changes up on their regular sync.
- "Sync now" only wakes the sync loop; it never runs a long download inside the command loop, so a restart or blank sent right after it still acts immediately.
- Quick commands (sync, screenshot, restart, reboot) expire after 10 minutes in the queue, so a screen that was offline does not act on stale clicks when it reconnects. Repeat clicks collapse into the command already waiting, and blank/unblank replace each other so the last click wins.
- Heartbeats include `sync.lastSyncAt` and `sync.lastError` (URL query strings removed). The dashboard compares the screen's reported `manifestVersion` with the version last published to it (`desiredManifestVersion`) and shows `contentState` as `current`, `updating` or `unknown`. A heartbeat is also sent right after new content lands or a batch of commands finishes.
- A screen that reports a command as `in_progress` gets a 15-minute lease, so a long release download is not handed out a second time mid-run.
- Connectivity failures (network errors, 5xx, 429) back off exponentially with jitter, capped at 2 minutes for sync and 1 minute for commands, and recover to the normal interval on the first success.
- Device credentials last 24 hours and rotate an hour before expiry. A screen that was powered off or offline past expiry can still exchange its credential for up to 30 days. The previous credential keeps working for 10 minutes after a rotation, so a lost refresh response cannot lock a screen out.
- An expired pairing code is replaced automatically: the claim-status endpoint answers 410 and the agent registers again, so the code on screen always works. A screen claimed just before its code expired still receives its credential.
- When the dashboard removes a screen, the agent only returns to pairing mode after its credential has been rejected at least 5 times over 10 minutes. It then deletes the previous owner's playlist and cached media and shows a fresh pairing code.
- `/local/status` reports `online` (cloud contact within the last 2 minutes). The player shows "Offline · playing saved content" while a paired screen is offline.
- Device state is written atomically with fsync and only when it changes. A backup of the pairing identity lets a screen recover from a corrupted state file instead of crash-looping; if both copies are unreadable, it starts fresh and shows a pairing code.
- A reboot command is reported before the reboot runs, so it is never redelivered and repeated after boot.
- Media downloads have no overall deadline. They are cancelled only after 60 seconds without data and resume from the partial file on the next attempt.

## Release safety

Every player or agent artifact must be paired with a valid SHA-256 digest and Ed25519 signature. The admin API, Convex mutation, shared command contract, and device agent enforce this independently. Downloaded updates are written to a temporary file, synchronized, verified, installed into a version slot, and only then promoted. Operating-system updates use the separate A/B Connect OTA lane.

Release commands are never delivered to a legacy device. A Pi becomes eligible
only after the flashed appliance reports the full generation, protocol, and
capability contract; existing devices continue using the non-leased command
completion shape until then.

## Recovery expectations

The screen should remain on cached content during an internet outage. It can show a small offline indicator, but control-plane errors must not replace active media. If an item fails to decode, playback moves on instead of leaving a blank or frozen display.

## Pre-release checklist

1. Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test:unit`, and `npm run build`.
2. Run `go test ./...` in `apps/agent`.
3. Verify dashboard navigation at desktop and mobile widths.
4. Run a physical Pi soak test with image-only, video-only, mixed, portrait, offline, and corrupt-media playlists.
5. Stage a checksum mismatch and confirm the update is rejected without replacing the working binary.
