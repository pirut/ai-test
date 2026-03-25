import { ConvexError, v } from "convex/values";

import { internalMutation, mutation, query } from "./_generated/server";
import { requireOrgIdentity } from "./lib";

const TRIAL_DAYS = 14;
const TRIAL_DEVICE_LIMIT = 3;
const BILLING_PRICE_VERSION = "2026-03-launch";

const planConfig = {
  starter: {
    includedScreens: 5,
    extraScreenPriceCents: 1500,
    storageLimitBytes: 100 * 1024 * 1024 * 1024,
    screenshotRetentionDays: 7,
  },
  growth: {
    includedScreens: 25,
    extraScreenPriceCents: 1000,
    storageLimitBytes: 500 * 1024 * 1024 * 1024,
    screenshotRetentionDays: 30,
  },
  scale: {
    includedScreens: 100,
    extraScreenPriceCents: 700,
    storageLimitBytes: 2 * 1024 * 1024 * 1024 * 1024,
    screenshotRetentionDays: 90,
  },
} as const;

type BillingPlanKey = keyof typeof planConfig;

export type BillingCtx = Parameters<typeof requireOrgIdentity>[0];

function serializeDate(value?: number | null) {
  return typeof value === "number" ? new Date(value).toISOString() : null;
}

async function countBillableScreens(ctx: any, orgId: string) {
  const devices = await ctx.db
    .query("devices")
    .withIndex("by_org", (q: any) => q.eq("organizationId", orgId))
    .collect();

  return devices.filter((device: any) => !device.archivedAt && !device.billingExcluded)
    .length;
}

async function getBillingAccountRecord(ctx: any, orgId: string) {
  return ctx.db
    .query("billingAccounts")
    .withIndex("by_org", (q: any) => q.eq("organizationId", orgId))
    .unique();
}

export async function getScreenshotRetentionDaysForOrg(ctx: any, orgId?: string) {
  if (!orgId) {
    return planConfig.starter.screenshotRetentionDays;
  }

  const account = await ensureBillingAccountRecord(ctx, orgId);
  if (!account) {
    return planConfig.starter.screenshotRetentionDays;
  }

  return planConfig[account.planKey as BillingPlanKey].screenshotRetentionDays;
}

async function ensureBillingAccountRecord(ctx: any, orgId: string) {
  const existing = await getBillingAccountRecord(ctx, orgId);
  if (existing) {
    return existing;
  }

  const now = Date.now();
  const billingAccountId = await ctx.db.insert("billingAccounts", {
    organizationId: orgId,
    planKey: "starter",
    subscriptionStatus: "trialing",
    billingInterval: "month",
    trialEndsAt: now + TRIAL_DAYS * 24 * 60 * 60_000,
    cancelAtPeriodEnd: false,
    priceVersion: BILLING_PRICE_VERSION,
    createdAt: now,
    updatedAt: now,
  });

  return ctx.db.get(billingAccountId);
}

async function buildBillingAccountSnapshot(ctx: any, orgId: string) {
  const account =
    (await getBillingAccountRecord(ctx, orgId)) ??
    {
      organizationId: orgId,
      planKey: "starter",
      subscriptionStatus: "trialing",
      billingInterval: "month",
      trialEndsAt: Date.now() + TRIAL_DAYS * 24 * 60 * 60_000,
      cancelAtPeriodEnd: false,
      priceVersion: BILLING_PRICE_VERSION,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

  const activeScreenCount = await countBillableScreens(ctx, orgId);

  return {
    organizationId: account.organizationId,
    stripeCustomerId: account.stripeCustomerId ?? null,
    stripeSubscriptionId: account.stripeSubscriptionId ?? null,
    planKey: account.planKey,
    subscriptionStatus: account.subscriptionStatus,
    billingInterval: account.billingInterval ?? null,
    trialEndsAt: serializeDate(account.trialEndsAt),
    currentPeriodStart: serializeDate(account.currentPeriodStart),
    currentPeriodEnd: serializeDate(account.currentPeriodEnd),
    cancelAtPeriodEnd: account.cancelAtPeriodEnd,
    billingEmail: account.billingEmail ?? null,
    priceVersion: account.priceVersion,
    activeScreenCount,
    createdAt: new Date(account.createdAt).toISOString(),
    updatedAt: new Date(account.updatedAt).toISOString(),
  };
}

function resolveEntitlementSnapshotFromAccount(account: Awaited<ReturnType<typeof buildBillingAccountSnapshot>>) {
  const plan = planConfig[account.planKey as BillingPlanKey];
  const trialEndsAt = account.trialEndsAt ? new Date(account.trialEndsAt).getTime() : null;
  const isTrialing =
    account.subscriptionStatus === "trialing" &&
    typeof trialEndsAt === "number" &&
    trialEndsAt > Date.now();
  const isReadOnly =
    !isTrialing &&
    (account.subscriptionStatus === "past_due" ||
      account.subscriptionStatus === "canceled" ||
      account.subscriptionStatus === "incomplete" ||
      account.subscriptionStatus === "incomplete_expired" ||
      account.subscriptionStatus === "unpaid" ||
      (account.subscriptionStatus === "trialing" &&
        typeof trialEndsAt === "number" &&
        trialEndsAt <= Date.now()));

  return {
    organizationId: account.organizationId,
    planKey: account.planKey,
    subscriptionStatus: account.subscriptionStatus,
    billingInterval: account.billingInterval,
    activeScreenCount: account.activeScreenCount,
    includedScreens: plan.includedScreens,
    trialDeviceLimit: TRIAL_DEVICE_LIMIT,
    extraScreenPriceCents: plan.extraScreenPriceCents,
    storageLimitBytes: plan.storageLimitBytes,
    screenshotRetentionDays: plan.screenshotRetentionDays,
    isTrialing,
    isReadOnly,
    canClaimDevices:
      !isReadOnly &&
      (!isTrialing || account.activeScreenCount < TRIAL_DEVICE_LIMIT),
    trialEndsAt: account.trialEndsAt,
    currentPeriodEnd: account.currentPeriodEnd,
    cancelAtPeriodEnd: account.cancelAtPeriodEnd,
    billingEmail: account.billingEmail,
  };
}

async function markWebhookProcessed(
  ctx: any,
  provider: string,
  eventId: string,
  eventType: string,
  organizationId?: string,
) {
  const existing = await ctx.db
    .query("billingEvents")
    .withIndex("by_provider_and_event_id", (q: any) =>
      q.eq("provider", provider).eq("eventId", eventId),
    )
    .unique();

  if (existing?.status === "processed") {
    return false;
  }

  if (existing) {
    await ctx.db.patch(existing._id, {
      eventType,
      organizationId,
      status: "processed",
      processedAt: Date.now(),
      error: undefined,
    });
    return true;
  }

  await ctx.db.insert("billingEvents", {
    provider,
    eventId,
    eventType,
    organizationId,
    status: "processed",
    createdAt: Date.now(),
    processedAt: Date.now(),
  });
  return true;
}

export async function assertOrgWriteAllowed(ctx: any, orgId: string) {
  const entitlements = resolveEntitlementSnapshotFromAccount(
    await buildBillingAccountSnapshot(ctx, orgId),
  );

  if (entitlements.isReadOnly) {
    throw new ConvexError("Billing required to modify this workspace");
  }

  return entitlements;
}

export async function assertOrgCanClaimDevice(ctx: any, orgId: string) {
  const entitlements = await assertOrgWriteAllowed(ctx, orgId);
  if (!entitlements.canClaimDevices) {
    throw new ConvexError("Trial limit reached. Add billing to claim more devices.");
  }
  return entitlements;
}

export const ensureOrganizationTrial = mutation({
  args: {
    organizationId: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    await ensureBillingAccountRecord(ctx, args.organizationId);
    return buildBillingAccountSnapshot(ctx, args.organizationId);
  },
});

export const recordExternalWebhookEvent = mutation({
  args: {
    provider: v.string(),
    eventId: v.string(),
    eventType: v.string(),
    organizationId: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("billingEvents")
      .withIndex("by_provider_and_event_id", (q: any) =>
        q.eq("provider", args.provider).eq("eventId", args.eventId),
      )
      .unique();

    if (existing?.status === "processed") {
      return false;
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        eventType: args.eventType,
        organizationId: args.organizationId,
        status: "processing",
        error: undefined,
      });
      return true;
    }

    await ctx.db.insert("billingEvents", {
      provider: args.provider,
      eventId: args.eventId,
      eventType: args.eventType,
      organizationId: args.organizationId,
      status: "processing",
      createdAt: Date.now(),
    });
    return true;
  },
});

export const finalizeExternalWebhookEvent = mutation({
  args: {
    provider: v.string(),
    eventId: v.string(),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("billingEvents")
      .withIndex("by_provider_and_event_id", (q: any) =>
        q.eq("provider", args.provider).eq("eventId", args.eventId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.error ? "failed" : "processed",
        error: args.error,
        processedAt: Date.now(),
      });
    }

    return null;
  },
});

export const getCurrentBillingAccount = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const { orgId } = await requireOrgIdentity(ctx);
    return buildBillingAccountSnapshot(ctx, orgId);
  },
});

export const getCurrentEntitlements = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const { orgId } = await requireOrgIdentity(ctx);
    return resolveEntitlementSnapshotFromAccount(
      await buildBillingAccountSnapshot(ctx, orgId),
    );
  },
});

export const applyStripeSubscriptionWebhook = mutation({
  args: {
    providerEventId: v.string(),
    eventType: v.string(),
    organizationId: v.string(),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    planKey: v.union(v.literal("starter"), v.literal("growth"), v.literal("scale")),
    subscriptionStatus: v.union(
      v.literal("trialing"),
      v.literal("active"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("incomplete"),
      v.literal("incomplete_expired"),
      v.literal("unpaid"),
    ),
    billingInterval: v.optional(v.union(v.literal("month"), v.literal("year"))),
    billingEmail: v.optional(v.string()),
    trialEndsAt: v.optional(v.number()),
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const shouldApply = await markWebhookProcessed(
      ctx,
      "stripe",
      args.providerEventId,
      args.eventType,
      args.organizationId,
    );

    if (!shouldApply) {
      return buildBillingAccountSnapshot(ctx, args.organizationId);
    }

    const existing = await ensureBillingAccountRecord(ctx, args.organizationId);
    if (!existing) {
      throw new ConvexError("Billing account not found");
    }

    await ctx.db.patch(existing._id, {
      stripeCustomerId: args.stripeCustomerId ?? existing.stripeCustomerId,
      stripeSubscriptionId:
        args.stripeSubscriptionId ?? existing.stripeSubscriptionId,
      planKey: args.planKey,
      subscriptionStatus: args.subscriptionStatus,
      billingInterval: args.billingInterval ?? existing.billingInterval,
      billingEmail: args.billingEmail ?? existing.billingEmail,
      trialEndsAt: args.trialEndsAt ?? existing.trialEndsAt,
      currentPeriodStart: args.currentPeriodStart,
      currentPeriodEnd: args.currentPeriodEnd,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      updatedAt: Date.now(),
      priceVersion: BILLING_PRICE_VERSION,
    });

    return buildBillingAccountSnapshot(ctx, args.organizationId);
  },
});

export const attachStripeCustomer = mutation({
  args: {
    organizationId: v.string(),
    stripeCustomerId: v.string(),
    billingEmail: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const existing = await ensureBillingAccountRecord(ctx, args.organizationId);
    if (!existing) {
      throw new ConvexError("Billing account not found");
    }

    await ctx.db.patch(existing._id, {
      stripeCustomerId: args.stripeCustomerId,
      billingEmail: args.billingEmail ?? existing.billingEmail,
      updatedAt: Date.now(),
    });

    return buildBillingAccountSnapshot(ctx, args.organizationId);
  },
});

export const rollupUsageSnapshots = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const organizations = await ctx.db.query("organizations").collect();
    const day = new Date().toISOString().slice(0, 10);

    for (const org of organizations) {
      const [billableScreens, assets, screenshots, heartbeats, existing] =
        await Promise.all([
          countBillableScreens(ctx, org.clerkOrgId),
          ctx.db
            .query("mediaAssets")
            .withIndex("by_org", (q: any) => q.eq("organizationId", org.clerkOrgId))
            .collect(),
          ctx.db
            .query("deviceScreenshots")
            .withIndex("by_org_and_captured_at", (q: any) =>
              q.eq("organizationId", org.clerkOrgId),
            )
            .collect(),
          ctx.db
            .query("deviceHeartbeats")
            .withIndex("by_org_and_received_at", (q: any) =>
              q.eq("organizationId", org.clerkOrgId),
            )
            .collect(),
          ctx.db
            .query("usageDailySnapshots")
            .withIndex("by_org_and_day", (q: any) =>
              q.eq("organizationId", org.clerkOrgId).eq("day", day),
            )
            .unique(),
        ]);

      const payload = {
        billableScreens,
        assetBytes: assets.reduce((sum: number, asset: any) => sum + asset.sizeBytes, 0),
        screenshotBytes: screenshots.reduce(
          (sum: number, screenshot: any) => sum + screenshot.bytes,
          0,
        ),
        heartbeatCount: heartbeats.length,
        updatedAt: Date.now(),
      };

      if (existing) {
        await ctx.db.patch(existing._id, payload);
      } else {
        await ctx.db.insert("usageDailySnapshots", {
          organizationId: org.clerkOrgId,
          day,
          createdAt: Date.now(),
          ...payload,
        });
      }
    }

    return null;
  },
});

export const cleanupExpiredOperationalData = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const heartbeatCutoff = now - 7 * 24 * 60 * 60_000;

    const [heartbeats, screenshots, accounts] = await Promise.all([
      ctx.db.query("deviceHeartbeats").collect(),
      ctx.db.query("deviceScreenshots").collect(),
      ctx.db.query("billingAccounts").collect(),
    ]);

    const retentionByOrg = new Map(
      accounts.map((account: any) => [
        account.organizationId,
        planConfig[account.planKey as BillingPlanKey].screenshotRetentionDays,
      ]),
    );

    for (const heartbeat of heartbeats) {
      if (heartbeat.receivedAt < heartbeatCutoff) {
        await ctx.db.delete(heartbeat._id);
      }
    }

    for (const screenshot of screenshots) {
      const retentionDays =
        retentionByOrg.get(screenshot.organizationId) ??
        planConfig.starter.screenshotRetentionDays;
      const cutoff = now - retentionDays * 24 * 60 * 60_000;

      if (
        (typeof screenshot.expiresAt === "number" && screenshot.expiresAt <= now) ||
        screenshot.capturedAt < cutoff
      ) {
        await ctx.db.delete(screenshot._id);
      }
    }

    return null;
  },
});
