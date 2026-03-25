import type Stripe from "stripe";
import { NextResponse } from "next/server";

import { applyStripeSubscriptionWebhook } from "@/lib/backend";
import { orderedPlanKeys, getStripePriceId } from "@/lib/billing/plans";
import {
  getSubscriptionCustomerId,
  getSubscriptionPeriodBounds,
} from "@/lib/billing/stripe-subscriptions";
import { env } from "@/lib/env";
import { logStructuredEvent } from "@/lib/observability";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

function resolvePlanKey(
  subscription: Stripe.Subscription,
): "starter" | "growth" | "scale" {
  const planKey = subscription.metadata.planKey;
  if (planKey === "starter" || planKey === "growth" || planKey === "scale") {
    return planKey;
  }

  const priceId = subscription.items.data[0]?.price.id;
  for (const candidate of orderedPlanKeys) {
    for (const interval of ["month", "year"] as const) {
      if (getStripePriceId(candidate, interval) === priceId) {
        return candidate;
      }
    }
  }

  return "starter";
}

function normalizeSubscriptionStatus(
  status: string,
): "trialing" | "active" | "past_due" | "canceled" | "incomplete" | "incomplete_expired" | "unpaid" {
  return status === "paused" ? "past_due" : (status as never);
}

async function syncSubscription(
  providerEventId: string,
  eventType: string,
  subscription: Stripe.Subscription,
  billingEmail?: string,
) {
  const organizationId =
    subscription.metadata.organizationId ??
    subscription.metadata.orgId;

  if (!organizationId) {
    return;
  }

  const billingInterval = subscription.metadata.billingInterval === "year" ? "year" : "month";
  const period = getSubscriptionPeriodBounds(subscription);

  await applyStripeSubscriptionWebhook({
    providerEventId,
    eventType,
    organizationId,
    stripeCustomerId: getSubscriptionCustomerId(subscription),
    stripeSubscriptionId: subscription.id,
    planKey: resolvePlanKey(subscription),
    subscriptionStatus: normalizeSubscriptionStatus(subscription.status),
    billingInterval,
    billingEmail,
    trialEndsAt: subscription.trial_end ? subscription.trial_end * 1000 : undefined,
    currentPeriodStart: period.currentPeriodStart,
    currentPeriodEnd: period.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}

export async function POST(request: Request) {
  if (!isStripeConfigured() || !env.stripeWebhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhook secrets are not configured." },
      { status: 503 },
    );
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, env.stripeWebhookSecret);
  } catch (error) {
    logStructuredEvent("warn", "billing.webhook.invalid_signature", {
      route: "/api/webhooks/stripe",
      message: error instanceof Error ? error.message : "Invalid webhook",
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid webhook" },
      { status: 400 },
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && session.subscription) {
        const subscription = await getStripe().subscriptions.retrieve(
          String(session.subscription),
        );
        await syncSubscription(
          event.id,
          event.type,
          subscription,
          session.customer_details?.email ?? undefined,
        );
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      let billingEmail: string | undefined;
      if (typeof subscription.customer === "string") {
        const customer = await getStripe().customers.retrieve(subscription.customer);
        if (!customer.deleted) {
          billingEmail = customer.email ?? undefined;
        }
      }

      await syncSubscription(event.id, event.type, subscription, billingEmail);
      break;
    }
    default:
      break;
  }

  logStructuredEvent("info", "billing.webhook.processed", {
    route: "/api/webhooks/stripe",
    eventId: event.id,
    eventType: event.type,
  });

  return NextResponse.json({ received: true });
}
