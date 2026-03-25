"use client";

import { startTransition, useState } from "react";

import { cn } from "@/lib/utils";

export function CustomerPortalButton({
  className,
}: {
  className?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <button
      type="button"
      disabled={isLoading}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-xl border border-white/10 px-4 text-sm font-medium text-white transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-70",
        className,
      )}
      onClick={() =>
        startTransition(async () => {
          setIsLoading(true);
          try {
            const response = await fetch("/api/billing/portal", {
              method: "POST",
            });
            const payload = (await response.json()) as {
              portalUrl?: string;
              error?: string;
            };

            if (!response.ok || !payload.portalUrl) {
              throw new Error(payload.error ?? "Unable to open billing portal");
            }

            window.location.href = payload.portalUrl;
          } catch (error) {
            window.alert(error instanceof Error ? error.message : "Unable to open billing portal");
          } finally {
            setIsLoading(false);
          }
        })
      }
    >
      {isLoading ? "Opening portal…" : "Open billing portal"}
    </button>
  );
}
