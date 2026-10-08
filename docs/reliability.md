# Playback reliability

Showroom is designed to keep the last known-good playlist running when the network or control plane is unavailable.

## Runtime behavior

- The agent downloads content into its local cache and verifies SHA-256 checksums when the manifest supplies a digest.
- A manifest refresh preserves the currently playing item when it still exists. Polling does not restart the playlist.
- Browser playback advances after media errors, retries transient failures, and uses a watchdog to escape stalled video.
- A failed status, Wi-Fi, or manifest request does not discard the other successful responses or the last working playlist.
- The Raspberry Pi supervisor sends the complete cached playlist to `mpv`, rather than only the first item. Mixed image/video playlists use the browser player; all-video playlists may use `mpv` for hardware-accelerated playback.
- YouTube acquisition defaults to a 15-minute timeout with retries. Override it with `SHOWROOM_YOUTUBE_DOWNLOAD_TIMEOUT` when required.

## Cloud link

- The agent runs three independent loops: sync (pairing, credential refresh, manifest and media), commands, and heartbeats. A long media download never delays a dashboard command, and commands never wait on a sync.
- Commands are long-polled: the agent asks for commands with `waitSeconds=20`, and the server holds the request on a Convex subscription until a command is queued, so dashboard buttons act within about a second. Against a server that answers immediately, the agent falls back to polling every `SHOWROOM_POLL_INTERVAL`.
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
