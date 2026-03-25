import type Stripe from "stripe";
import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  applyStripeSubscriptionWebhook,
  getBillingAccount,
  getEntitlementSnapshot,
} from "@/lib/backend";
import {
  createCheckoutSessionForPlan,
  getSubscriptionBillingEmail,
  getSubscriptionCustomerId,
  getSubscriptionPeriodBounds,
  updateStripeSubscriptionPlan,
} from "@/lib/billing/stripe-subscriptions";
import { getStripeOveragePriceId, getStripePriceId } from "@/lib/billing/plans";
import { logStructuredEvent } from "@/lib/observability";
import { isStripeConfigured } from "@/lib/stripe";

const schema = z.object({
  planKey: z.enum(["starter", "growth", "scale"]),
  billingInterval: z.enum(["month", "year"]),
});

function normalizeSubscriptionStatus(
  status: string,
): "trialing" | "active" | "past_due" | "canceled" | "incomplete" | "incomplete_expired" | "unpaid" {
  return status === "paused" ? "past_due" : (status as never);
}

function getCustomerId(subscription: Stripe.Subscription) {
  return getSubscriptionCustomerId(subscription);
}

export async function POST(request: Request) {
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

  const payload = schema.parse(await request.json());
  if (!getStripePriceId(payload.planKey, payload.billingInterval)) {
    return NextResponse.json(
      { error: "Stripe price IDs are missing for this plan." },
      { status: 503 },
    );
  }

  if (!getStripeOveragePriceId(payload.planKey, payload.billingInterval)) {
    return NextResponse.json(
      { error: "Stripe overage price IDs are missing for this plan." },
      { status: 503 },
    );
  }

  const [billingAccount, entitlements, user] = await Promise.all([
    getBillingAccount(session.orgId),
    getEntitlementSnapshot(session.orgId),
    currentUser(),
  ]);

  logStructuredEvent("info", "billing.checkout.requested", {
    route: "/api/billing/checkout",
    orgId: session.orgId,
    planKey: payload.planKey,
    billingInterval: payload.billingInterval,
    hasExistingSubscription: Boolean(billingAccount.stripeSubscriptionId),
  });

  if (billingAccount.stripeSubscriptionId) {
    const subscription = await updateStripeSubscriptionPlan({
      billingAccount,
      entitlements,
      planKey: payload.planKey,
      billingInterval: payload.billingInterval,
    });
    const period = getSubscriptionPeriodBounds(subscription);

    await applyStripeSubscriptionWebhook({
      providerEventId: `manual-update:${subscription.id}:${period.currentPeriodEnd ?? Date.now()}`,
      eventType: "subscription.updated",
      organizationId: session.orgId,
      stripeCustomerId: getCustomerId(subscription),
      stripeSubscriptionId: subscription.id,
      planKey: payload.planKey,
      subscriptionStatus: normalizeSubscriptionStatus(subscription.status),
      billingInterval: payload.billingInterval,
      billingEmail:
        getSubscriptionBillingEmail(subscription) ??
        billingAccount.billingEmail ??
        user?.primaryEmailAddress?.emailAddress,
      trialEndsAt: subscription.trial_end ? subscription.trial_end * 1000 : undefined,
      currentPeriodStart: period.currentPeriodStart,
      currentPeriodEnd: period.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });

    logStructuredEvent("info", "billing.subscription.updated", {
      route: "/api/billing/checkout",
      orgId: session.orgId,
      stripeSubscriptionId: subscription.id,
      planKey: payload.planKey,
      billingInterval: payload.billingInterval,
    });

    return NextResponse.json({ checkoutUrl: "/billing?updated=1" });
  }

  const checkoutSession = await createCheckoutSessionForPlan({
    organizationId: session.orgId,
    billingAccount,
    entitlements,
    planKey: payload.planKey,
    billingInterval: payload.billingInterval,
    email: user?.primaryEmailAddress?.emailAddress,
    name: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || undefined,
  });

  logStructuredEvent("info", "billing.checkout.session_created", {
    route: "/api/billing/checkout",
    orgId: session.orgId,
    planKey: payload.planKey,
    billingInterval: payload.billingInterval,
    checkoutSessionId: checkoutSession.id,
  });

  return NextResponse.json({ checkoutUrl: checkoutSession.url }, { status: 201 });
}
