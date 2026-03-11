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
npm install
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

- The admin app supports a mock mode when database/storage credentials are absent.
- The production backend is Convex. Set `NEXT_PUBLIC_CONVEX_URL` and run `npx convex dev` to activate it.
- Clerk Organizations are required for team access.
- Clerk webhook sync is available at `/api/webhooks/clerk` to mirror org and user records into Convex.
- The Go agent source is included, but this machine does not currently have `go` installed, so the agent is not compiled as part of local verification.
