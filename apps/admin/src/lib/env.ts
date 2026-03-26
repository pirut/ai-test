const truthy = new Set(["1", "true", "yes", "on"]);

function normalizeEnv(value: string | undefined) {
  return value?.trim();
}

function resolveConvexUrl() {
  return normalizeEnv(process.env.NEXT_PUBLIC_CONVEX_URL);
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
