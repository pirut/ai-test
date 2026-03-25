import { NextResponse } from "next/server";

import { env, hasConvexBackend } from "@/lib/env";

/* ------------------------------------------------------------------ */
/*  Service health checks                                              */
/* ------------------------------------------------------------------ */

type ServiceStatus = {
  name: string;
  status: "operational" | "degraded" | "down";
  latencyMs: number | null;
  detail?: string;
};

async function checkService(
  name: string,
  fn: () => Promise<{ ok: boolean; detail?: string }>,
): Promise<ServiceStatus> {
  const start = performance.now();
  try {
    const result = await fn();
    const latencyMs = Math.round(performance.now() - start);
    return {
      name,
      status: result.ok ? "operational" : "degraded",
      latencyMs,
      detail: result.detail,
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      name,
      status: "down",
      latencyMs,
      detail: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function checkConvex(): Promise<{ ok: boolean; detail?: string }> {
  if (!hasConvexBackend()) {
    return { ok: true, detail: "Mock mode (no backend)" };
  }
  const url = env.convexUrl;
  if (!url) return { ok: false, detail: "No Convex URL configured" };

  // Convex health endpoint
  const response = await fetch(url.replace(/\.cloud$/, ".convex.cloud"), {
    method: "GET",
    signal: AbortSignal.timeout(5000),
  });
  return { ok: response.status < 500 };
}

async function checkClerk(): Promise<{ ok: boolean; detail?: string }> {
  const issuer = env.clerkJwtIssuerDomain;
  if (!issuer) return { ok: true, detail: "Not configured" };

  const wellKnown = `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const response = await fetch(wellKnown, {
    signal: AbortSignal.timeout(5000),
  });
  return { ok: response.ok };
}

async function checkStripe(): Promise<{ ok: boolean; detail?: string }> {
  if (!env.stripeSecretKey) {
    return { ok: true, detail: "Not configured" };
  }

  const response = await fetch("https://api.stripe.com/v1/balance", {
    headers: { Authorization: `Bearer ${env.stripeSecretKey}` },
    signal: AbortSignal.timeout(5000),
  });
  return { ok: response.ok };
}

async function checkResend(): Promise<{ ok: boolean; detail?: string }> {
  if (!env.resendApiKey) {
    return { ok: true, detail: "Not configured" };
  }

  const response = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${env.resendApiKey}` },
    signal: AbortSignal.timeout(5000),
  });
  return { ok: response.ok };
}

/* ------------------------------------------------------------------ */
/*  Route handler                                                      */
/* ------------------------------------------------------------------ */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const checks = await Promise.all([
    checkService("Web app", async () => ({ ok: true })),
    checkService("Database", checkConvex),
    checkService("Authentication", checkClerk),
    checkService("Payments", checkStripe),
    checkService("Email", checkResend),
  ]);

  const allOperational = checks.every((c) => c.status === "operational");
  const anyDown = checks.some((c) => c.status === "down");

  const overall: "operational" | "degraded" | "down" = anyDown
    ? "down"
    : allOperational
      ? "operational"
      : "degraded";

  return NextResponse.json(
    {
      status: overall,
      services: checks,
      checkedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
