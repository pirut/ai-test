"use client";

import { useState } from "react";
import type { BillingInterval } from "@showroom/contracts";

import { PricingGrid } from "@/components/marketing/pricing-grid";
import { cn } from "@/lib/utils";

const billingIntervals: Array<{
  value: BillingInterval;
  label: string;
  caption: string;
}> = [
  {
    value: "month",
    label: "Monthly",
    caption: "Start with the standard monthly contract.",
  },
  {
    value: "year",
    label: "Annual",
    caption: "Save 15% with annual billing.",
  },
];

export function PricingShowcase({
  defaultInterval = "month",
  className,
  showCheckout = true,
}: {
  defaultInterval?: BillingInterval;
  className?: string;
  showCheckout?: boolean;
}) {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(defaultInterval);
  const activeInterval =
    billingIntervals.find((interval) => interval.value === billingInterval) ??
    billingIntervals[0]!;

  return (
    <div className={cn("space-y-8", className)}>
      <div className="flex flex-col gap-4 rounded-[28px] border border-white/8 bg-[#11151b]/80 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#9bb6ff]">
            Billing cadence
          </div>
          <p className="mt-2 text-sm leading-7 text-[#c5cad8]">{activeInterval.caption}</p>
        </div>
        <div className="inline-flex rounded-full border border-white/8 bg-[#0d1016] p-1">
          {billingIntervals.map((interval) => {
            const isActive = interval.value === billingInterval;
            return (
              <button
                key={interval.value}
                type="button"
                onClick={() => setBillingInterval(interval.value)}
                className={cn(
                  "inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[linear-gradient(135deg,#b9ccff_0%,#7aa1ff_100%)] text-[#082354]"
                    : "text-[#c5cad8] hover:text-white",
                )}
              >
                {interval.label}
              </button>
            );
          })}
        </div>
      </div>

      <PricingGrid billingInterval={billingInterval} showCheckout={showCheckout} />
    </div>
  );
}
