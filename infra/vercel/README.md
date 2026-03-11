# Vercel Deployment Notes

- Deploy `apps/admin` as the primary Vercel project.
- Set `NEXT_PUBLIC_CONVEX_URL`, Clerk keys, and `SHOWROOM_MOCK_MODE=false`.
- Use Vercel cron to hit `/api/schedules/compile` every minute if you want the web app to trigger manifest recompilation outside Convex scheduled functions.

