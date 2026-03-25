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
  appUrl: normalizeEnv(process.env.APP_URL),
  statusPageUrl: normalizeEnv(process.env.STATUS_PAGE_URL),
  supportEmail: normalizeEnv(process.env.SUPPORT_EMAIL),
  salesEmail: normalizeEnv(process.env.SALES_EMAIL),
  legalCompanyName: normalizeEnv(process.env.LEGAL_COMPANY_NAME),
  legalCompanyAddress: normalizeEnv(process.env.LEGAL_COMPANY_ADDRESS),
  legalEmail: normalizeEnv(process.env.LEGAL_EMAIL),
  stripeSecretKey: normalizeEnv(process.env.STRIPE_SECRET_KEY),
  stripeWebhookSecret: normalizeEnv(process.env.STRIPE_WEBHOOK_SECRET),
  stripePriceStarterMonth: normalizeEnv(process.env.STRIPE_PRICE_STARTER_MONTH),
  stripePriceStarterYear: normalizeEnv(process.env.STRIPE_PRICE_STARTER_YEAR),
  stripePriceGrowthMonth: normalizeEnv(process.env.STRIPE_PRICE_GROWTH_MONTH),
  stripePriceGrowthYear: normalizeEnv(process.env.STRIPE_PRICE_GROWTH_YEAR),
  stripePriceScaleMonth: normalizeEnv(process.env.STRIPE_PRICE_SCALE_MONTH),
  stripePriceScaleYear: normalizeEnv(process.env.STRIPE_PRICE_SCALE_YEAR),
  stripeOverageStarterMonth: normalizeEnv(process.env.STRIPE_OVERAGE_STARTER_MONTH),
  stripeOverageStarterYear: normalizeEnv(process.env.STRIPE_OVERAGE_STARTER_YEAR),
  stripeOverageGrowthMonth: normalizeEnv(process.env.STRIPE_OVERAGE_GROWTH_MONTH),
  stripeOverageGrowthYear: normalizeEnv(process.env.STRIPE_OVERAGE_GROWTH_YEAR),
  stripeOverageScaleMonth: normalizeEnv(process.env.STRIPE_OVERAGE_SCALE_MONTH),
  stripeOverageScaleYear: normalizeEnv(process.env.STRIPE_OVERAGE_SCALE_YEAR),
};

export function hasConvexBackend() {
  return Boolean(env.convexUrl) && !env.isMockMode;
}

export function getAppUrl() {
  return env.appUrl ?? "http://localhost:3000";
}
