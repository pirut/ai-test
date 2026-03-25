"use client";

import { useState } from "react";
import type { BillingInterval } from "@showroom/contracts";

import { PricingGrid } from "@/components/marketing/pricing-grid";
import { cn } from "@/lib/utils";

const intervals: Array<{
  value: BillingInterval;
  label: string;
  badge?: string;
}> = [
  { value: "month", label: "Monthly" },
  { value: "year", label: "Annual", badge: "Save 15%" },
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
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>(defaultInterval);

  return (
    <div className={cn("space-y-8", className)}>
      <div className="flex justify-center">
        <div className="inline-flex rounded-lg border border-white/8 bg-[#0c0e11] p-1">
          {intervals.map((interval) => {
            const isActive = interval.value === billingInterval;
            return (
              <button
                key={interval.value}
                type="button"
                onClick={() => setBillingInterval(interval.value)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-4 py-2 text-[0.8rem] font-medium transition-colors",
                  isActive
                    ? "bg-white text-[#0c0e11]"
                    : "text-[#8d93a6] hover:text-white",
                )}
              >
                {interval.label}
                {interval.badge && (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[0.65rem] font-semibold",
                      isActive
                        ? "bg-[#0c0e11]/10 text-[#0c0e11]"
                        : "bg-[#9bb6ff]/10 text-[#9bb6ff]",
                    )}
                  >
                    {interval.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <PricingGrid billingInterval={billingInterval} showCheckout={showCheckout} />
    </div>
  );
}
