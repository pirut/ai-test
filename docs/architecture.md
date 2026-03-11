# Architecture

The platform is split into three cooperating runtimes:

- Admin cloud app on Next.js for operators and Clerk-authenticated control flows.
- Convex backend for persistent data, file upload URLs, schedules, commands, and device sync state.
- Raspberry Pi device agent responsible for claim, sync, caching, external video resolution, screenshots, and command execution.
- Local kiosk player that renders the active manifest in Chromium from locally cached assets.

## Control flow

1. Unclaimed devices register temporarily and receive a claim code.
2. An authenticated org admin claims the device from the admin app.
3. The backend compiles a manifest whenever assignments change.
4. Devices poll for manifests and commands.
5. Devices cache assets locally before activating a new manifest, including resolving YouTube sources into local MP4 files.
6. Devices push heartbeats and screenshots back to the cloud.
