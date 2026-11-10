"use client";

import { startTransition, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  onConnected,
  onDone,
  initialClaimCode,
  hasDefaultPlaylist,
  idPrefix = "claim",
}: {
  embedded?: boolean;
  onClaimed?: () => void;
  /** Called once the new screen checks in for the first time. */
  onConnected?: (deviceId: string) => void;
  onDone?: () => void;
  /** Filled in when the screen's scan-to-add QR code opened this page. */
  initialClaimCode?: string;
  /** Whether the workspace already has a playlist the new screen will play. */
  hasDefaultPlaylist?: boolean;
  /** Keeps field ids unique when more than one form is on a page. */
  idPrefix?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "details", error: null, submitting: false });
  const fieldId = (name: string) => `${idPrefix}-${name}`;

  // Without a panel to close, "Done" returns to an empty form for the next screen.
  function finish() {
    if (onDone) {
      onDone();
      return;
    }
    setStep({ kind: "details", error: null, submitting: false });
    router.refresh();
  }

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
        setStep({ kind: "details", error: claimErrorMessage(response.status, payload.error), submitting: false });
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
          // Not a form action: React would clear the fields after a wrong
          // code, and the name and site would have to be typed again.
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startTransition(() => void handleSubmit(formData));
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fieldId("code")}>Pairing code</Label>
            <Input
              id={fieldId("code")}
              aria-describedby={fieldId("code-hint")}
              name="claimCode"
              placeholder="AB12CD"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={8}
              className="h-11 text-center font-mono text-lg uppercase tracking-[0.4em]"
              defaultValue={initialClaimCode?.toUpperCase()}
              required
            />
            <p id={fieldId("code-hint")} className="text-xs text-muted-foreground">
              {initialClaimCode
                ? "Filled in from the code you scanned. Check it matches the TV."
                : "Shown in large letters on the screen when it's ready to pair."}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fieldId("name")}>Screen name</Label>
            <Input id={fieldId("name")} name="name" placeholder="Front Window" minLength={2} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fieldId("site")}>Site</Label>
            <Input id={fieldId("site")} name="siteName" placeholder="Chelsea showroom" minLength={2} required />
          </div>
          <Button type="submit" className="mt-1 w-full" disabled={step.submitting}>
            {step.submitting ? <Spinner data-icon="inline-start" /> : null}
            {step.submitting ? "Adding screen…" : "Add screen"}
          </Button>
          {step.error ? (
            <p role="alert" className="text-sm text-destructive">{step.error}</p>
          ) : null}
        </form>
      ) : step.kind === "waiting" ? (
        <WaitingForScreen
          step={step}
          onConnected={() => {
            setStep({ kind: "connected", deviceId: step.deviceId, name: step.name });
            onConnected?.(step.deviceId);
          }}
        />
      ) : (
        <div className="flex flex-col items-center gap-3 py-4 text-center" aria-live="polite">
          <CheckCircle2 className="size-10 text-signal" aria-hidden />
          <div>
            <p className="font-heading text-lg font-semibold text-foreground">{step.name} is connected</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasDefaultPlaylist === false
                ? "It has nothing to play yet. Make a playlist and tick Workspace default, and the screen starts playing it on its own."
                : hasDefaultPlaylist
                  ? "It is downloading the workspace default playlist and starts playing in a moment. Open the screen to pick a different playlist."
                  : "Next, choose what it plays. Open the screen to pick its playlist."}
            </p>
          </div>
          <div className="mt-2 flex w-full flex-col gap-2">
            {hasDefaultPlaylist === false ? (
              <Link href="/playlists" className={cn(buttonVariants(), "w-full")} onClick={() => onDone?.()}>
                Make a playlist
              </Link>
            ) : null}
            <Link
              href={`/screens/${step.deviceId}`}
              className={cn(
                buttonVariants({ variant: hasDefaultPlaylist === false ? "outline" : "default" }),
                "w-full",
              )}
              onClick={() => onDone?.()}
            >
              Open {step.name}
            </Link>
            <Button className="w-full" variant="ghost" onClick={finish}>
              {onDone ? "Done" : "Add another screen"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function claimErrorMessage(status: number, serverMessage?: string) {
  if (status === 401) return "You are signed out. Sign in again, then add the screen.";
  if (status === 403) return "Only workspace admins can add screens. Ask an admin to enter this code.";
  if (status === 429) return serverMessage ?? "Too many wrong codes. Wait 15 minutes, then try again.";
  if (status >= 500) return "Something went wrong on our side. Try again in a moment.";
  return serverMessage ?? "Could not add the screen. Check the code and try again.";
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
