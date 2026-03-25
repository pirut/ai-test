import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { syncStripeSubscriptionQuantity } from "@/lib/billing/stripe-subscriptions";
import { claimDevice } from "@/lib/backend";
import { logStructuredEvent } from "@/lib/observability";

const schema = z.object({
  claimCode: z.string().length(6),
  name: z.string().min(2),
  siteName: z.string().min(2),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.has({ role: "org:admin" })) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const payload = schema.parse(await request.json());
  const result = await claimDevice({
    orgId: session.orgId,
    ...payload,
  });

  if (!result) {
    logStructuredEvent("warn", "device.claim.failed", {
      route: "/api/devices/claim",
      orgId: session.orgId,
      claimCode: payload.claimCode,
    });
    return NextResponse.json({ error: "Invalid claim code" }, { status: 404 });
  }

  await syncStripeSubscriptionQuantity(session.orgId).catch(() => null);

  logStructuredEvent("info", "device.claim.succeeded", {
    route: "/api/devices/claim",
    orgId: session.orgId,
    deviceId: result.deviceId,
    siteName: payload.siteName,
  });

  return NextResponse.json(result, { status: 201 });
}
