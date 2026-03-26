import type { BillingInterval } from "@showroom/contracts";

import { CheckoutButton } from "@/components/marketing/checkout-button";
import {
  formatMonthlyEquivalentPrice,
  formatPlanPrice,
  formatStorageLimit,
  orderedPlanKeys,
  billingPlans,
} from "@/lib/billing/plans";

export function PricingGrid({
  billingInterval = "month",
  showCheckout = true,
}: {
  billingInterval?: BillingInterval;
  showCheckout?: boolean;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      {orderedPlanKeys.map((planKey) => {
        const plan = billingPlans[planKey];
        const isFeatured = planKey === "growth";

        return (
          <article
            key={plan.key}
            className={[
              "rounded-[28px] border p-6",
              isFeatured
                ? "border-[#9bb6ff]/40 bg-[linear-gradient(180deg,#131925_0%,#0e1118_100%)] shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
                : "border-white/8 bg-[#11151b]",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-[#9bb6ff]">
                  {plan.name}
                </div>
                <p className="mt-3 text-sm leading-7 text-[#c5cad8]">{plan.description}</p>
              </div>
              {isFeatured ? (
                <div className="rounded-full border border-[#9bb6ff]/30 bg-[#9bb6ff]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d8e3ff]">
                  Best fit
                </div>
              ) : null}
            </div>

            <div className="mt-8">
              <div className="text-4xl font-black tracking-tight text-white">
                {formatPlanPrice(plan.key, billingInterval)}
              </div>
              <div className="mt-2 text-sm text-[#9ca3b7]">
                per {billingInterval === "year" ? "year" : "month"}
              </div>
              {billingInterval === "year" ? (
                <div className="mt-2 text-xs uppercase tracking-[0.18em] text-[#9bb6ff]">
                  {formatMonthlyEquivalentPrice(plan.key)}/mo billed annually
                </div>
              ) : null}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-white/4 p-4 text-sm text-[#dbe4ff]">
                {plan.includedScreens} screens included, ${plan.extraScreenPriceCents / 100} per extra
                screen/month.
              </div>
              <div className="rounded-2xl bg-white/4 p-4 text-sm text-[#dbe4ff]">
                {formatStorageLimit(plan.storageLimitBytes)} storage and {plan.screenshotRetentionDays}-day screenshot retention.
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {plan.featureBullets.map((feature) => (
                <div key={feature} className="rounded-2xl bg-[#0d1016] px-4 py-3 text-sm text-white">
                  {feature}
                </div>
              ))}
            </div>

            {showCheckout ? (
              <CheckoutButton
                planKey={plan.key}
                billingInterval={billingInterval}
                className="mt-8 w-full"
              />
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
