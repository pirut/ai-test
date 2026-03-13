const truthy = new Set(["1", "true", "yes", "on"]);
const PRODUCTION_CONVEX_URL = "https://adorable-yak-207.convex.cloud";

function normalizeEnv(value: string | undefined) {
  return value?.trim();
}

function resolveConvexUrl() {
  const configuredUrl = normalizeEnv(process.env.NEXT_PUBLIC_CONVEX_URL);

  // Vercel is currently configured with the dev Convex URL. Force prod traffic
  // onto the prod deployment so the admin app reads and writes the live data.
  if (
    process.env.NODE_ENV === "production" &&
    configuredUrl?.includes("dapper-trout-275.convex.cloud")
  ) {
    return PRODUCTION_CONVEX_URL;
  }

  return configuredUrl;
}

export const env = {
  isMockMode: truthy.has((process.env.SHOWROOM_MOCK_MODE ?? "true").toLowerCase()),
  convexUrl: resolveConvexUrl(),
  convexDeployment: normalizeEnv(process.env.CONVEX_DEPLOYMENT),
  clerkJwtIssuerDomain: normalizeEnv(process.env.CLERK_JWT_ISSUER_DOMAIN),
  clerkWebhookSigningSecret: normalizeEnv(process.env.CLERK_WEBHOOK_SIGNING_SECRET),
  resendApiKey: normalizeEnv(process.env.RESEND_API_KEY),
  sentryDsn: normalizeEnv(process.env.SENTRY_DSN),
};

export function hasConvexBackend() {
  return Boolean(env.convexUrl) && !env.isMockMode;
}
