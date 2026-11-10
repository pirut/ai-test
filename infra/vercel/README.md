# Vercel Deployment Notes

- Deploy `apps/admin` as the primary Vercel project.
- Set `NEXT_PUBLIC_CONVEX_URL`, Clerk keys, and `SHOWROOM_MOCK_MODE=false`.
- Use Vercel cron to hit `/api/schedules/compile` every minute if you want the web app to trigger manifest recompilation outside Convex scheduled functions.

- Vercel runs `npm install` inside `apps/admin`, so it only installs that workspace's dependencies. Anything the admin build needs (including CSS packages such as `shadcn`) must be listed in `apps/admin/package.json`, not the root.
- Convex deploys with the site when `CONVEX_DEPLOY_KEY` is set (Production environment only; generate it in the Convex dashboard under the production deployment's Settings). `apps/admin/vercel.json` then runs `npx convex deploy` from the repo root before `next build`. Without the key the build is plain `next build` and Convex must be deployed by hand with `npx convex deploy`.

## Optional settings

- `SHOWROOM_RELEASE_SIGNING_PRIVATE_KEY` and `SHOWROOM_RELEASE_SIGNING_KEY_ID` (Vercel): lets the Releases page sign uploads and URL-based artifacts, including Showroom OS bundles added by URL and SHA-256. Without them, paste a signature for each artifact.
- `SHOWROOM_PLATFORM_ORG_IDS` (Convex): comma-separated Clerk organization ids allowed to publish releases. Unset, every workspace manages its own releases. Set, only those workspaces can, and they get a "Deploy to every workspace" button that rolls a release out to all customers' screens in stages.
- `CLERK_SYNC_SECRET` (the same value on Vercel and Convex): lets the Clerk webhook copy organization records into Convex. Without it the webhook is acknowledged and nothing is copied; workspaces work either way.
- `TAILSCALE_OAUTH_CLIENT_ID` and `TAILSCALE_OAUTH_CLIENT_SECRET`, or `TAILSCALE_AUTH_KEY` (Vercel): remote SSH for screens. Unset, `/api/device/tailscale` answers 404 and screens skip it.

## Showroom OS updates

Add the bundle to a release by URL (`.raucb`, https) with its SHA-256 on the Releases page, using the bundle's own version as the release version. The bundle is only sent to screens running Showroom OS; other screens get the player and agent parts of the same release, or are left out when there are none. A screen counts as updated once it restarts and reports the new version. If it comes back on the old one, or does not come back within 45 minutes, it counts as failed and the rollout pauses.
