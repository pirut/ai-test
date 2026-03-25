import type { BillingInterval } from "@showroom/contracts";
import { Check } from "lucide-react";

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
    <div className="grid gap-4 xl:grid-cols-3">
      {orderedPlanKeys.map((planKey) => {
        const plan = billingPlans[planKey];
        const isFeatured = planKey === "growth";

        return (
          <article
            key={plan.key}
            className={[
              "relative rounded-2xl border p-6",
              isFeatured
                ? "border-[#9bb6ff]/30 bg-[#0e1219] shadow-[0_0_40px_rgba(122,161,255,0.06)]"
                : "border-white/6 bg-[#0c0e11]",
            ].join(" ")}
          >
            {isFeatured && (
              <div className="absolute -top-3 right-6 rounded-full bg-[linear-gradient(135deg,#b9ccff_0%,#7aa1ff_100%)] px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#082354]">
                Most popular
              </div>
            )}

            <div className="text-[0.7rem] uppercase tracking-[0.2em] text-[#7f8aa6]">
              {plan.name}
            </div>
            <p className="mt-2 text-[0.8rem] leading-6 text-[#8d93a6]">
              {plan.description}
            </p>

            <div className="mt-6">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black tracking-tight text-white">
                  {formatPlanPrice(plan.key, billingInterval)}
                </span>
                <span className="text-[0.8rem] text-[#7f8aa6]">
                  /{billingInterval === "year" ? "yr" : "mo"}
                </span>
              </div>
              {billingInterval === "year" && (
                <div className="mt-1 text-[0.75rem] text-[#9bb6ff]">
                  {formatMonthlyEquivalentPrice(plan.key)}/mo billed annually
                </div>
              )}
            </div>

            <div className="mt-6 space-y-2.5">
              {plan.featureBullets.map((feature) => (
                <div
                  key={feature}
                  className="flex items-start gap-2.5 text-[0.8rem] text-[#b3b9cd]"
                >
                  <Check className="mt-0.5 size-3.5 shrink-0 text-[#7cd39d]" />
                  {feature}
                </div>
              ))}
              <div className="flex items-start gap-2.5 text-[0.8rem] text-[#b3b9cd]">
                <Check className="mt-0.5 size-3.5 shrink-0 text-[#7cd39d]" />
                {formatStorageLimit(plan.storageLimitBytes)} storage
              </div>
              <div className="flex items-start gap-2.5 text-[0.8rem] text-[#b3b9cd]">
                <Check className="mt-0.5 size-3.5 shrink-0 text-[#7cd39d]" />
                {plan.screenshotRetentionDays}-day screenshot retention
              </div>
              <div className="flex items-start gap-2.5 text-[0.8rem] text-[#b3b9cd]">
                <Check className="mt-0.5 size-3.5 shrink-0 text-[#7cd39d]" />
                ${plan.extraScreenPriceCents / 100}/mo per extra screen
              </div>
            </div>

            {showCheckout && (
              <CheckoutButton
                planKey={plan.key}
                billingInterval={billingInterval}
                className={[
                  "mt-8 w-full",
                  isFeatured
                    ? ""
                    : "!bg-white/5 !text-white !shadow-none hover:!bg-white/10",
                ].join(" ")}
                label={isFeatured ? "Start free trial" : "Get started"}
              />
            )}
          </article>
        );
      })}
    </div>
  );
}
