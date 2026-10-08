"use client";

import { startTransition, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const connectionPollMs = 3_000;
// After this long without a first check-in, show troubleshooting tips.
const slowConnectionMs = 90_000;

type Step =
  | { kind: "details"; error: string | null; submitting: boolean }
  | { kind: "waiting"; deviceId: string; name: string; startedAt: number }
  | { kind: "connected"; deviceId: string; name: string };

export function ClaimDeviceForm({
  embedded = false,
  onClaimed,
  onDone,
}: {
  embedded?: boolean;
  onClaimed?: () => void;
  onDone?: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "details", error: null, submitting: false });

  async function handleSubmit(formData: FormData) {
    setStep({ kind: "details", error: null, submitting: true });
    const name = String(formData.get("name") ?? "").trim();
    try {
      const response = await fetch("/api/devices/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimCode: formData.get("claimCode"),
          name,
          siteName: formData.get("siteName"),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStep({ kind: "details", error: payload.error ?? "Could not add the screen", submitting: false });
        return;
      }
      setStep({ kind: "waiting", deviceId: payload.deviceId, name, startedAt: Date.now() });
      onClaimed?.();
    } catch {
      setStep({ kind: "details", error: "Could not reach the server. Try again.", submitting: false });
    }
  }

  return (
    <div className={cn(!embedded && "dashboard-surface rounded-lg p-5")}>
      {!embedded ? <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Provisioning
        </p>
        <h2 className="font-heading mt-2 text-xl font-bold text-foreground">Claim a device</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Attach a new screen to this workspace as soon as the Pi reports a claim code.
        </p>
      </div> : null}

      {step.kind === "details" ? (
        <form
          className="flex flex-col gap-3"
          action={(fd) => startTransition(() => void handleSubmit(fd))}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="claimCode" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Claim code</Label>
            <Input
              id="claimCode"
              name="claimCode"
              placeholder="AB12CD"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={8}
              className="font-mono uppercase tracking-[0.3em]"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Screen name</Label>
            <Input id="name" name="name" placeholder="Front Window" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="siteName" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Site</Label>
            <Input id="siteName" name="siteName" placeholder="Chelsea showroom" required />
          </div>
          <Button type="submit" className="mt-1 w-full" disabled={step.submitting}>
            {step.submitting ? <Spinner data-icon="inline-start" /> : null}
            {step.submitting ? "Adding screen…" : "Add screen"}
          </Button>
          {step.error ? (
            <p role="alert" className="text-[0.8rem] text-danger">{step.error}</p>
          ) : null}
        </form>
      ) : step.kind === "waiting" ? (
        <WaitingForScreen
          step={step}
          onConnected={() => setStep({ kind: "connected", deviceId: step.deviceId, name: step.name })}
        />
      ) : (
        <div className="flex flex-col items-center gap-3 py-4 text-center" aria-live="polite">
          <CheckCircle2 className="size-10 text-primary" aria-hidden />
          <div>
            <p className="font-heading text-lg font-semibold text-foreground">{step.name} is connected</p>
            <p className="mt-1 text-sm text-muted-foreground">
              It is downloading its playlist and will start playing in a moment.
            </p>
          </div>
          <div className="mt-2 flex w-full flex-col gap-2">
            <Button className="w-full" onClick={() => onDone?.()}>Done</Button>
            <Link
              href={`/screens/${step.deviceId}`}
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
              onClick={() => onDone?.()}
            >
              Open screen settings
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function WaitingForScreen({
  step,
  onConnected,
}: {
  step: Extract<Step, { kind: "waiting" }>;
  onConnected: () => void;
}) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      try {
        const response = await fetch(`/api/devices/${step.deviceId}/connection`, { cache: "no-store" });
        if (response.ok) {
          const payload = (await response.json()) as { connected?: boolean };
          if (payload.connected && !cancelled) {
            onConnected();
            return;
          }
        }
      } catch {
        // Keep waiting; the next check retries.
      }
      if (cancelled) return;
      setSlow(Date.now() - step.startedAt >= slowConnectionMs);
      timer = setTimeout(check, connectionPollMs);
    };

    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [onConnected, step.deviceId, step.startedAt]);

  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center" aria-live="polite">
      <Spinner className="size-8 text-primary" />
      <div>
        <p className="font-heading text-lg font-semibold text-foreground">Waiting for {step.name} to connect</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The code on the screen will disappear once it connects. This usually takes a few seconds.
        </p>
      </div>
      {slow ? (
        <div className="mt-2 rounded-md border border-border bg-muted/40 p-3 text-left text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Still waiting?</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Make sure the screen is powered on and connected to the internet.</li>
            <li>If the screen still shows a code, it hasn&apos;t checked in yet. It will finish pairing on its own once it&apos;s online.</li>
            <li>You can close this panel. The screen is already added to your fleet and will show as online when it connects.</li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
