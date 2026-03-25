import Stripe from "stripe";

import { env } from "@/lib/env";

let stripeClient: Stripe | null = null;

export function isStripeConfigured() {
  return Boolean(env.stripeSecretKey);
}

export function getStripe() {
  if (!env.stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  stripeClient ??= new Stripe(env.stripeSecretKey, {
    apiVersion: "2026-02-25.clover",
  });

  return stripeClient;
}
