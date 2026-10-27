# Vercel Deployment Notes

- Deploy `apps/admin` as the primary Vercel project.
- Set `NEXT_PUBLIC_CONVEX_URL`, Clerk keys, and `SHOWROOM_MOCK_MODE=false`.
- Use Vercel cron to hit `/api/schedules/compile` every minute if you want the web app to trigger manifest recompilation outside Convex scheduled functions.

- Vercel runs `npm install` inside `apps/admin`, so it only installs that workspace's dependencies. Anything the admin build needs (including CSS packages such as `shadcn`) must be listed in `apps/admin/package.json`, not the root.
- Convex deploys with the site when `CONVEX_DEPLOY_KEY` is set (Production environment only; generate it in the Convex dashboard under the production deployment's Settings). `apps/admin/vercel.json` then runs `npx convex deploy` from the repo root before `next build`. Without the key the build is plain `next build` and Convex must be deployed by hand with `npx convex deploy`.
