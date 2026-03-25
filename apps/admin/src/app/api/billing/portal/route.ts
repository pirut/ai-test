import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getBillingAccount } from "@/lib/backend";
import { logStructuredEvent } from "@/lib/observability";
import { absoluteUrl } from "@/lib/site";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export async function POST() {
  const session = await auth();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe is not configured for this deployment." },
      { status: 503 },
    );
  }

  const billingAccount = await getBillingAccount(session.orgId);
  if (!billingAccount.stripeCustomerId) {
    return NextResponse.json(
      { error: "No Stripe customer is attached to this workspace yet." },
      { status: 400 },
    );
  }

  const portalSession = await getStripe().billingPortal.sessions.create({
    customer: billingAccount.stripeCustomerId,
    return_url: absoluteUrl("/billing"),
  });

  logStructuredEvent("info", "billing.portal.session_created", {
    route: "/api/billing/portal",
    orgId: session.orgId,
    stripeCustomerId: billingAccount.stripeCustomerId,
  });

  return NextResponse.json({ portalUrl: portalSession.url });
}
