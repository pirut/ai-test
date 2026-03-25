"use client";

import { startTransition, useState } from "react";
import type { BillingInterval, PlanKey } from "@showroom/contracts";

import { cn } from "@/lib/utils";

export function CheckoutButton({
  planKey,
  billingInterval,
  className,
  label = "Start trial",
}: {
  planKey: PlanKey;
  billingInterval: BillingInterval;
  className?: string;
  label?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <button
      type="button"
      disabled={isLoading}
      className={cn(
        "inline-flex h-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#b9ccff_0%,#7aa1ff_100%)] px-4 text-sm font-semibold text-[#082354] shadow-[0_12px_30px_rgba(94,138,255,0.25)] transition-transform disabled:cursor-not-allowed disabled:opacity-70",
        className,
      )}
      onClick={() =>
        startTransition(async () => {
          setIsLoading(true);
          try {
            const response = await fetch("/api/billing/checkout", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ planKey, billingInterval }),
            });

            const payload = (await response.json()) as {
              checkoutUrl?: string;
              error?: string;
            };

            if (response.status === 401) {
              window.location.href = "/sign-up";
              return;
            }

            if (!response.ok || !payload.checkoutUrl) {
              throw new Error(payload.error ?? "Unable to start checkout");
            }

            window.location.href = payload.checkoutUrl;
          } catch (error) {
            window.alert(error instanceof Error ? error.message : "Unable to start checkout");
          } finally {
            setIsLoading(false);
          }
        })
      }
    >
      {isLoading ? "Starting checkout…" : label}
    </button>
  );
}
