import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultBillingAccount,
  resolveEntitlements,
} from "../apps/admin/src/lib/billing/entitlements";

test("default billing account starts in a trialing state", () => {
  const account = createDefaultBillingAccount("org_test", Date.UTC(2026, 2, 24));

  assert.equal(account.organizationId, "org_test");
  assert.equal(account.planKey, "starter");
  assert.equal(account.subscriptionStatus, "trialing");
  assert.equal(account.billingInterval, "month");
});

test("trial entitlements stop allowing additional device claims after three screens", () => {
  const now = Date.now();
  const account = createDefaultBillingAccount("org_test", now);

  const withinLimit = resolveEntitlements(account, 2);
  const atLimit = resolveEntitlements(account, 3);

  assert.equal(withinLimit.isTrialing, true);
  assert.equal(withinLimit.canClaimDevices, true);
  assert.equal(atLimit.canClaimDevices, false);
});

test("past due accounts become read-only", () => {
  const account = createDefaultBillingAccount("org_test", Date.UTC(2026, 2, 24));
  account.subscriptionStatus = "past_due";
  account.trialEndsAt = new Date(Date.UTC(2026, 2, 25)).toISOString();

  const entitlements = resolveEntitlements(account, 7);

  assert.equal(entitlements.isReadOnly, true);
  assert.equal(entitlements.canClaimDevices, false);
});
