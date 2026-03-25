type CheckStatus = "pass" | "warn" | "fail";

type Check = {
  status: CheckStatus;
  label: string;
  detail: string;
};

function env(name: string) {
  return process.env[name]?.trim() ?? "";
}

function hasPlaceholder(value: string) {
  return (
    value.includes("example.com") ||
    value.includes("localhost") ||
    value.includes("changeme") ||
    value === "http://localhost:3000"
  );
}

function checkRequiredEnv(name: string, label: string) {
  const value = env(name);
  if (!value) {
    return {
      status: "fail",
      label,
      detail: `${name} is missing`,
    } satisfies Check;
  }

  if (hasPlaceholder(value)) {
    return {
      status: "warn",
      label,
      detail: `${name} is set but still points at a placeholder value`,
    } satisfies Check;
  }

  return {
    status: "pass",
    label,
    detail: `${name} is configured`,
  } satisfies Check;
}

function checkBooleanFlag(name: string, expected: string, label: string) {
  const value = env(name);
  if (!value) {
    return {
      status: "warn",
      label,
      detail: `${name} is unset; expected ${expected} for production`,
    } satisfies Check;
  }

  return {
    status: value === expected ? "pass" : "warn",
    label,
    detail:
      value === expected
        ? `${name} is ${expected}`
        : `${name} is ${value}; expected ${expected} for production`,
  } satisfies Check;
}

function printCheck(check: Check) {
  const prefix =
    check.status === "pass" ? "PASS" : check.status === "warn" ? "WARN" : "FAIL";
  console.log(`${prefix}  ${check.label}: ${check.detail}`);
}

const checks: Check[] = [
  checkRequiredEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "Clerk public key"),
  checkRequiredEnv("CLERK_SECRET_KEY", "Clerk secret key"),
  checkRequiredEnv("CLERK_WEBHOOK_SIGNING_SECRET", "Clerk webhook signing secret"),
  checkRequiredEnv("NEXT_PUBLIC_CONVEX_URL", "Convex URL"),
  checkRequiredEnv("CONVEX_DEPLOYMENT", "Convex deployment"),
  checkRequiredEnv("CLERK_JWT_ISSUER_DOMAIN", "Convex auth issuer"),
  checkRequiredEnv("APP_URL", "App URL"),
  checkRequiredEnv("STATUS_PAGE_URL", "Status page URL"),
  checkRequiredEnv("SUPPORT_EMAIL", "Support email"),
  checkRequiredEnv("SALES_EMAIL", "Sales email"),
  checkRequiredEnv("LEGAL_EMAIL", "Legal email"),
  checkRequiredEnv("LEGAL_COMPANY_NAME", "Legal company name"),
  checkRequiredEnv("LEGAL_COMPANY_ADDRESS", "Legal company address"),
  checkRequiredEnv("RESEND_API_KEY", "Resend API key"),
  checkRequiredEnv("STRIPE_SECRET_KEY", "Stripe secret key"),
  checkRequiredEnv("STRIPE_WEBHOOK_SECRET", "Stripe webhook secret"),
  checkRequiredEnv("STRIPE_PRICE_STARTER_MONTH", "Stripe Starter monthly price"),
  checkRequiredEnv("STRIPE_PRICE_STARTER_YEAR", "Stripe Starter annual price"),
  checkRequiredEnv("STRIPE_PRICE_GROWTH_MONTH", "Stripe Growth monthly price"),
  checkRequiredEnv("STRIPE_PRICE_GROWTH_YEAR", "Stripe Growth annual price"),
  checkRequiredEnv("STRIPE_PRICE_SCALE_MONTH", "Stripe Scale monthly price"),
  checkRequiredEnv("STRIPE_PRICE_SCALE_YEAR", "Stripe Scale annual price"),
  checkRequiredEnv("STRIPE_OVERAGE_STARTER_MONTH", "Stripe Starter overage monthly price"),
  checkRequiredEnv("STRIPE_OVERAGE_STARTER_YEAR", "Stripe Starter overage annual price"),
  checkRequiredEnv("STRIPE_OVERAGE_GROWTH_MONTH", "Stripe Growth overage monthly price"),
  checkRequiredEnv("STRIPE_OVERAGE_GROWTH_YEAR", "Stripe Growth overage annual price"),
  checkRequiredEnv("STRIPE_OVERAGE_SCALE_MONTH", "Stripe Scale overage monthly price"),
  checkRequiredEnv("STRIPE_OVERAGE_SCALE_YEAR", "Stripe Scale overage annual price"),
  checkRequiredEnv("SENTRY_DSN", "Sentry server DSN"),
  checkRequiredEnv("NEXT_PUBLIC_SENTRY_DSN", "Sentry browser DSN"),
  checkBooleanFlag("SHOWROOM_MOCK_MODE", "false", "Mock mode"),
];

const optionalChecks: Check[] = [
  checkRequiredEnv("SENTRY_AUTH_TOKEN", "Sentry auth token"),
  checkRequiredEnv("SENTRY_ORG", "Sentry org"),
  checkRequiredEnv("SENTRY_PROJECT", "Sentry project"),
];

console.log("Screen SaaS readiness check\n");
for (const check of checks) {
  printCheck(check);
}

console.log("\nOptional but recommended\n");
for (const check of optionalChecks) {
  printCheck(check);
}

const failed = checks.filter((check) => check.status === "fail").length;
const warned = [...checks, ...optionalChecks].filter((check) => check.status === "warn").length;

console.log(
  `\nSummary: ${checks.length - failed} required checks satisfied, ${failed} failed, ${warned} warnings.`,
);

process.exit(failed > 0 ? 1 : 0);
