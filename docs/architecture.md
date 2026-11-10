# Architecture

The platform is split into four cooperating runtimes. [`start-to-finish.md`](start-to-finish.md) follows a screen through all of them.

- Admin cloud app on Next.js for operators and Clerk-authenticated control flows.
- Convex backend for persistent data, file upload URLs, schedules, commands, and device sync state.
- Raspberry Pi device agent responsible for claim, sync, caching, external video resolution, screenshots, and command execution.
- Local player that renders the active manifest from locally cached assets: the native Rust player (libmpv on DRM), with a Chromium player as fallback on the older image.

## Control flow

1. Unclaimed devices register temporarily and receive a claim code.
2. An authenticated org admin claims the device from the admin app.
3. The backend compiles a manifest whenever assignments change.
4. Devices long-poll for commands and are told when their manifest changed.
5. Devices cache assets locally before activating a new manifest, including resolving YouTube sources into local MP4 files.
6. Devices push heartbeats and screenshots back to the cloud.
7. Signed app releases, and on Showroom OS signed OS bundles, roll out in stages from the Releases page.
