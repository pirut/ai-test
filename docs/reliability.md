# Playback reliability

Showroom is designed to keep the last known-good playlist running when the network or control plane is unavailable.

## Runtime behavior

- The agent downloads content into its local cache and verifies SHA-256 checksums when the manifest supplies a digest.
- A manifest refresh preserves the currently playing item when it still exists. Polling does not restart the playlist.
- Browser playback advances after media errors, retries transient failures, and uses a watchdog to escape stalled video.
- A failed status, Wi-Fi, or manifest request does not discard the other successful responses or the last working playlist.
- The Raspberry Pi supervisor sends the complete cached playlist to `mpv`, rather than only the first item. Mixed image/video playlists use the browser player; all-video playlists may use `mpv` for hardware-accelerated playback.
- YouTube acquisition defaults to a 15-minute timeout with retries. Override it with `SHOWROOM_YOUTUBE_DOWNLOAD_TIMEOUT` when required.

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
