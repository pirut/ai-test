import type Stripe from "stripe";
import type {
  BillingAccount,
  BillingInterval,
  EntitlementSnapshot,
  PlanKey,
} from "@showroom/contracts";

import {
  getBillingPlan,
  getStripeOveragePriceId,
  getStripePriceId,
  orderedPlanKeys,
} from "@/lib/billing/plans";
import { attachStripeCustomerWebhook, getBillingAccount } from "@/lib/backend";
import { absoluteUrl } from "@/lib/site";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

function allBasePriceIds() {
  return new Set(
    orderedPlanKeys.flatMap((planKey) =>
      (["month", "year"] as BillingInterval[])
        .map((interval) => getStripePriceId(planKey, interval))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function allOveragePriceIds() {
  return new Set(
    orderedPlanKeys.flatMap((planKey) =>
      (["month", "year"] as BillingInterval[])
        .map((interval) => getStripeOveragePriceId(planKey, interval))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function getOverageQuantity(
  planKey: PlanKey,
  activeScreenCount: number,
) {
  return Math.max(0, activeScreenCount - getBillingPlan(planKey).includedScreens);
}

export function getSubscriptionCustomerId(subscription: Stripe.Subscription) {
  return typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
}

export function getSubscriptionBillingEmail(subscription: Stripe.Subscription) {
  if (typeof subscription.customer === "string" || subscription.customer.deleted) {
    return undefined;
  }

  return subscription.customer.email ?? undefined;
}

export function getSubscriptionPeriodBounds(subscription: Stripe.Subscription) {
  const itemPeriods = subscription.items.data
    .map((item) => ({
      start: item.current_period_start,
      end: item.current_period_end,
    }))
    .filter((period) => Number.isFinite(period.start) && Number.isFinite(period.end));

  if (itemPeriods.length === 0) {
    return {
      currentPeriodStart: undefined,
      currentPeriodEnd: undefined,
    };
  }

  return {
    currentPeriodStart: Math.min(...itemPeriods.map((period) => period.start)) * 1000,
    currentPeriodEnd: Math.max(...itemPeriods.map((period) => period.end)) * 1000,
  };
}

async function ensureStripeCustomer(
  orgId: string,
  billingAccount: BillingAccount,
  email?: string,
  name?: string,
) {
  if (billingAccount.stripeCustomerId) {
    return billingAccount.stripeCustomerId;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      organizationId: orgId,
    },
  });

  await attachStripeCustomerWebhook({
    organizationId: orgId,
    stripeCustomerId: customer.id,
    billingEmail: customer.email ?? email,
  });

  return customer.id;
}

export async function createCheckoutSessionForPlan(input: {
  organizationId: string;
  billingAccount: BillingAccount;
  entitlements: EntitlementSnapshot;
  planKey: PlanKey;
  billingInterval: BillingInterval;
  email?: string;
  name?: string;
}) {
  const stripe = getStripe();
  const customer = await ensureStripeCustomer(
    input.organizationId,
    input.billingAccount,
    input.email,
    input.name,
  );
  const basePriceId = getStripePriceId(input.planKey, input.billingInterval);

  if (!basePriceId) {
    throw new Error("Stripe base price is not configured for this plan.");
  }

  const overagePriceId = getStripeOveragePriceId(
    input.planKey,
    input.billingInterval,
  );
  const overageQuantity = getOverageQuantity(
    input.planKey,
    input.entitlements.activeScreenCount,
  );
  const rawTrialEnd =
    input.billingAccount.subscriptionStatus === "trialing" &&
    input.billingAccount.trialEndsAt
      ? Math.floor(new Date(input.billingAccount.trialEndsAt).getTime() / 1000)
      : undefined;
  const trialEnd =
    rawTrialEnd && rawTrialEnd > Math.floor(Date.now() / 1000)
      ? rawTrialEnd
      : undefined;

  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: input.organizationId,
    success_url: absoluteUrl("/billing?checkout=success"),
    cancel_url: absoluteUrl("/billing?checkout=cancelled"),
    line_items: [
      { price: basePriceId, quantity: 1 },
      ...(overagePriceId && overageQuantity > 0
        ? [{ price: overagePriceId, quantity: overageQuantity }]
        : []),
    ],
    subscription_data: {
      trial_end: trialEnd,
      metadata: {
        organizationId: input.organizationId,
        planKey: input.planKey,
        billingInterval: input.billingInterval,
      },
    },
    metadata: {
      organizationId: input.organizationId,
      planKey: input.planKey,
      billingInterval: input.billingInterval,
    },
  });
}

export async function updateStripeSubscriptionPlan(input: {
  billingAccount: BillingAccount;
  entitlements: EntitlementSnapshot;
  planKey: PlanKey;
  billingInterval: BillingInterval;
}) {
  if (!input.billingAccount.stripeSubscriptionId) {
    throw new Error("Stripe subscription is not attached to this workspace.");
  }

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(
    input.billingAccount.stripeSubscriptionId,
  );
  const basePriceId = getStripePriceId(input.planKey, input.billingInterval);

  if (!basePriceId) {
    throw new Error("Stripe base price is not configured for this plan.");
  }

  const overagePriceId = getStripeOveragePriceId(
    input.planKey,
    input.billingInterval,
  );
  const baseItem = subscription.items.data.find((item) =>
    allBasePriceIds().has(item.price.id),
  );
  const overageItem = subscription.items.data.find((item) =>
    allOveragePriceIds().has(item.price.id),
  );
  const overageQuantity = getOverageQuantity(
    input.planKey,
    input.entitlements.activeScreenCount,
  );

  return stripe.subscriptions.update(subscription.id, {
    metadata: {
      organizationId: input.entitlements.organizationId,
      planKey: input.planKey,
      billingInterval: input.billingInterval,
    },
    proration_behavior: "always_invoice",
    items: [
      baseItem
        ? { id: baseItem.id, price: basePriceId, quantity: 1 }
        : { price: basePriceId, quantity: 1 },
      ...(overagePriceId && overageQuantity > 0
        ? [
            overageItem
              ? { id: overageItem.id, price: overagePriceId, quantity: overageQuantity }
              : { price: overagePriceId, quantity: overageQuantity },
          ]
        : overageItem
          ? [{ id: overageItem.id, deleted: true }]
          : []),
    ],
  });
}

export async function syncStripeSubscriptionQuantity(orgId: string) {
  if (!isStripeConfigured()) {
    return null;
  }

  const billingAccount = await getBillingAccount(orgId);
  if (!billingAccount.stripeSubscriptionId || !billingAccount.billingInterval) {
    return null;
  }

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(
    billingAccount.stripeSubscriptionId,
  );
  const overageItem = subscription.items.data.find((item) =>
    allOveragePriceIds().has(item.price.id),
  );
  const overagePriceId = getStripeOveragePriceId(
    billingAccount.planKey,
    billingAccount.billingInterval,
  );
  const overageQuantity = getOverageQuantity(
    billingAccount.planKey,
    billingAccount.activeScreenCount,
  );

  if (!overagePriceId && overageQuantity > 0) {
    return null;
  }

  if (overageItem && overageQuantity === 0) {
    return stripe.subscriptionItems.del(overageItem.id);
  }

  if (overageItem && overagePriceId) {
    return stripe.subscriptionItems.update(overageItem.id, {
      price: overagePriceId,
      quantity: overageQuantity,
    });
  }

  if (overagePriceId && overageQuantity > 0) {
    return stripe.subscriptionItems.create({
      subscription: subscription.id,
      price: overagePriceId,
      quantity: overageQuantity,
    });
  }

  return null;
}
