const truthy = new Set(["1", "true", "yes", "on"]);

export const env = {
  isMockMode: truthy.has((process.env.SHOWROOM_MOCK_MODE ?? "true").toLowerCase()),
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL,
  convexDeployment: process.env.CONVEX_DEPLOYMENT,
  clerkJwtIssuerDomain: process.env.CLERK_JWT_ISSUER_DOMAIN,
  clerkWebhookSigningSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
  resendApiKey: process.env.RESEND_API_KEY,
  sentryDsn: process.env.SENTRY_DSN,
};

export function hasConvexBackend() {
  return Boolean(env.convexUrl) && !env.isMockMode;
}
