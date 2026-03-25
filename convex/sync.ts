import { v } from "convex/values";

import { mutation } from "./_generated/server";

const TRIAL_DAYS = 14;
const BILLING_PRICE_VERSION = "2026-03-launch";

async function ensureOrgBillingAccount(ctx: any, organizationId: string) {
  const existing = await ctx.db
    .query("billingAccounts")
    .withIndex("by_org", (q: any) => q.eq("organizationId", organizationId))
    .unique();

  if (existing) {
    return existing._id;
  }

  return ctx.db.insert("billingAccounts", {
    organizationId,
    planKey: "starter",
    subscriptionStatus: "trialing",
    billingInterval: "month",
    trialEndsAt: Date.now() + TRIAL_DAYS * 24 * 60 * 60_000,
    cancelAtPeriodEnd: false,
    priceVersion: BILLING_PRICE_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export const upsertOrganizationFromClerk = mutation({
  args: {
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.string(),
    metadata: v.optional(v.any()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        slug: args.slug,
        metadata: args.metadata ?? {},
        updatedAt: Date.now(),
      });
      await ensureOrgBillingAccount(ctx, args.clerkOrgId);
      return existing._id;
    }

    const organizationId = await ctx.db.insert("organizations", {
      clerkOrgId: args.clerkOrgId,
      name: args.name,
      slug: args.slug,
      metadata: args.metadata ?? {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ensureOrgBillingAccount(ctx, args.clerkOrgId);
    return organizationId;
  },
});

export const deleteOrganizationFromClerk = mutation({
  args: {
    clerkOrgId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    const billingAccount = await ctx.db
      .query("billingAccounts")
      .withIndex("by_org", (q) => q.eq("organizationId", args.clerkOrgId))
      .unique();
    if (billingAccount) {
      await ctx.db.delete(billingAccount._id);
    }

    return null;
  },
});

export const upsertUserFromClerk = mutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .collect();

    for (const user of users) {
      await ctx.db.patch(user._id, {
        email: args.email,
        firstName: args.firstName,
        lastName: args.lastName,
        updatedAt: Date.now(),
      });
    }

    return null;
  },
});

export const deleteUserFromClerk = mutation({
  args: {
    clerkUserId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .collect();

    for (const user of users) {
      await ctx.db.delete(user._id);
    }

    return null;
  },
});
