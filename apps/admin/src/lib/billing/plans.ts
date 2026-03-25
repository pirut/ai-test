import type { BillingInterval, PlanKey } from "@showroom/contracts";

import { env } from "@/lib/env";

export const BILLING_PRICE_VERSION = "2026-03-launch";
export const TRIAL_DAYS = 14;
export const TRIAL_DEVICE_LIMIT = 3;

export type BillingPlan = {
  key: PlanKey;
  name: string;
  description: string;
  monthlyPriceCents: number;
  annualPriceCents: number;
  includedScreens: number;
  extraScreenPriceCents: number;
  storageLimitBytes: number;
  screenshotRetentionDays: number;
  supportLabel: string;
  featureBullets: string[];
};

function gb(value: number) {
  return value * 1024 * 1024 * 1024;
}

export const billingPlans: Record<PlanKey, BillingPlan> = {
  starter: {
    key: "starter",
    name: "Starter",
    description: "Launch a small signage fleet with self-serve onboarding.",
    monthlyPriceCents: 9900,
    annualPriceCents: 101000,
    includedScreens: 5,
    extraScreenPriceCents: 1500,
    storageLimitBytes: gb(100),
    screenshotRetentionDays: 7,
    supportLabel: "Email support",
    featureBullets: [
      "5 included screens",
      "100 GB media storage",
      "7-day screenshot retention",
      "Email support",
    ],
  },
  growth: {
    key: "growth",
    name: "Growth",
    description: "Operate multi-location fleets with higher limits and priority support.",
    monthlyPriceCents: 29900,
    annualPriceCents: 305000,
    includedScreens: 25,
    extraScreenPriceCents: 1000,
    storageLimitBytes: gb(500),
    screenshotRetentionDays: 30,
    supportLabel: "Priority email support",
    featureBullets: [
      "25 included screens",
      "500 GB media storage",
      "30-day screenshot retention",
      "Alerts and releases",
    ],
  },
  scale: {
    key: "scale",
    name: "Scale",
    description: "Run large fleets with higher storage and onboarding support.",
    monthlyPriceCents: 79900,
    annualPriceCents: 815000,
    includedScreens: 100,
    extraScreenPriceCents: 700,
    storageLimitBytes: gb(2048),
    screenshotRetentionDays: 90,
    supportLabel: "Onboarding help",
    featureBullets: [
      "100 included screens",
      "2 TB media storage",
      "90-day screenshot retention",
      "Onboarding help",
    ],
  },
};

export const orderedPlanKeys: PlanKey[] = ["starter", "growth", "scale"];

export function getBillingPlan(planKey: PlanKey) {
  return billingPlans[planKey];
}

export function getPlanPriceCents(
  planKey: PlanKey,
  billingInterval: BillingInterval,
) {
  const plan = getBillingPlan(planKey);
  return billingInterval === "year" ? plan.annualPriceCents : plan.monthlyPriceCents;
}

export function formatPlanPrice(
  planKey: PlanKey,
  billingInterval: BillingInterval,
) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(getPlanPriceCents(planKey, billingInterval) / 100);
}

export function formatMonthlyEquivalentPrice(planKey: PlanKey) {
  const monthlyEquivalent = Math.round(getBillingPlan(planKey).annualPriceCents / 12);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(monthlyEquivalent / 100);
}

export function formatStorageLimit(storageLimitBytes: number) {
  const terabytes = storageLimitBytes / (1024 * 1024 * 1024 * 1024);
  if (terabytes >= 1) {
    return `${terabytes.toFixed(terabytes >= 2 ? 0 : 1)} TB`;
  }

  const gigabytes = storageLimitBytes / (1024 * 1024 * 1024);
  return `${gigabytes.toFixed(0)} GB`;
}

export function getStripePriceId(
  planKey: PlanKey,
  billingInterval: BillingInterval,
) {
  const priceMap: Record<PlanKey, Record<BillingInterval, string | undefined>> = {
    starter: {
      month: env.stripePriceStarterMonth,
      year: env.stripePriceStarterYear,
    },
    growth: {
      month: env.stripePriceGrowthMonth,
      year: env.stripePriceGrowthYear,
    },
    scale: {
      month: env.stripePriceScaleMonth,
      year: env.stripePriceScaleYear,
    },
  };

  return priceMap[planKey][billingInterval] ?? null;
}

export function getStripeOveragePriceId(
  planKey: PlanKey,
  billingInterval: BillingInterval,
) {
  const priceMap: Record<PlanKey, Record<BillingInterval, string | undefined>> = {
    starter: {
      month: env.stripeOverageStarterMonth,
      year: env.stripeOverageStarterYear,
    },
    growth: {
      month: env.stripeOverageGrowthMonth,
      year: env.stripeOverageGrowthYear,
    },
    scale: {
      month: env.stripeOverageScaleMonth,
      year: env.stripeOverageScaleYear,
    },
  };

  return priceMap[planKey][billingInterval] ?? null;
}
