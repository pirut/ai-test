import type {
  BillingAccount,
  EntitlementSnapshot,
  PlanKey,
  SubscriptionStatus,
} from "@showroom/contracts";

import {
  BILLING_PRICE_VERSION,
  TRIAL_DEVICE_LIMIT,
  getBillingPlan,
} from "@/lib/billing/plans";

const READ_ONLY_STATUSES = new Set<SubscriptionStatus>([
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
]);

export function isReadOnlyStatus(status: SubscriptionStatus) {
  return READ_ONLY_STATUSES.has(status);
}

export function createDefaultBillingAccount(
  organizationId: string,
  now = Date.now(),
): BillingAccount {
  const createdAt = new Date(now).toISOString();
  const trialEndsAt = new Date(now + 14 * 24 * 60 * 60_000).toISOString();

  return {
    organizationId,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    planKey: "starter",
    subscriptionStatus: "trialing",
    billingInterval: "month",
    trialEndsAt,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    billingEmail: null,
    priceVersion: BILLING_PRICE_VERSION,
    activeScreenCount: 0,
    createdAt,
    updatedAt: createdAt,
  };
}

export function resolveEntitlements(
  billingAccount: BillingAccount | null,
  activeScreenCount = 0,
): EntitlementSnapshot {
  const account =
    billingAccount ??
    createDefaultBillingAccount("org_unknown");
  const plan = getBillingPlan(account.planKey as PlanKey);
  const trialEndsAt = account.trialEndsAt
    ? new Date(account.trialEndsAt).getTime()
    : null;
  const isTrialing =
    account.subscriptionStatus === "trialing" &&
    trialEndsAt !== null &&
    trialEndsAt > Date.now();
  const isReadOnly =
    !isTrialing && isReadOnlyStatus(account.subscriptionStatus);
  const canClaimDevices =
    !isReadOnly &&
    (!isTrialing || activeScreenCount < TRIAL_DEVICE_LIMIT);

  return {
    organizationId: account.organizationId,
    planKey: account.planKey,
    subscriptionStatus: account.subscriptionStatus,
    billingInterval: account.billingInterval,
    activeScreenCount,
    includedScreens: plan.includedScreens,
    trialDeviceLimit: TRIAL_DEVICE_LIMIT,
    extraScreenPriceCents: plan.extraScreenPriceCents,
    storageLimitBytes: plan.storageLimitBytes,
    screenshotRetentionDays: plan.screenshotRetentionDays,
    isTrialing,
    isReadOnly,
    canClaimDevices,
    trialEndsAt: account.trialEndsAt,
    currentPeriodEnd: account.currentPeriodEnd,
    cancelAtPeriodEnd: account.cancelAtPeriodEnd,
    billingEmail: account.billingEmail,
  };
}
