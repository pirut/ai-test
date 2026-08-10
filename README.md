# Showroom Signage

Private Raspberry Pi digital signage stack for small showroom fleets.

## Workspace

- `apps/admin`: Next.js admin dashboard and API routes
- `apps/player`: React/Vite fullscreen kiosk player
- `apps/agent`: Go device agent
- `convex`: Convex schema, queries, mutations, and deployment config
- `packages/contracts`: shared OpenAPI and Zod contracts
- `infra/pi-image`: Raspberry Pi image build and provisioning assets
- `infra/vercel`: deployment configuration and cron notes
- `docs`: operator and provisioning guides

## Quick start

1. Install dependencies:

```bash
npm ci
```

2. Copy the admin environment template:

```bash
cp apps/admin/.env.example apps/admin/.env.local
```

3. Start the admin app:

```bash
npm run dev --workspace @showroom/admin
```

4. Start the player app:

```bash
npm run dev --workspace @showroom/player
```

## Notes

- The admin app supports an explicit local mock mode with `SHOWROOM_MOCK_MODE=true`. It is disabled in production even if the variable is accidentally set.
- The production backend is Convex. Set `NEXT_PUBLIC_CONVEX_URL` and run `npx convex dev` to activate it.
- Clerk Organizations are required for team access.
- Clerk webhook sync is available at `/api/webhooks/clerk` to mirror org and user records into Convex.
- YouTube video sources can be added from the media library; Pi devices resolve and cache them locally with `yt-dlp` and `ffmpeg`.
- Release artifacts must include a valid SHA-256 checksum and Ed25519 signature. The agent refuses unsigned or mismatched updates.
- The control plane is legacy-safe: a device activates leased commands, fleet telemetry retention, network rotation, and rollout eligibility only after its first `showroom-appliance-v2` heartbeat.
- See [`docs/reliability.md`](docs/reliability.md) for player recovery, offline behavior, and release validation.
- See [`docs/fleet-operations.md`](docs/fleet-operations.md) and [`infra/pi-image/README.md`](infra/pi-image/README.md) for A/B OS images, staged rollouts, telemetry retention, network rotation, and fleet recovery.
