"use client";

import { startTransition, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function ClaimDeviceForm() {
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleSubmit(formData: FormData) {
    setStatus({ ok: true, msg: "Claiming…" });
    const response = await fetch("/api/devices/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claimCode: formData.get("claimCode"),
        name: formData.get("name"),
        siteName: formData.get("siteName"),
      }),
    });
    const payload = await response.json();
    setStatus({
      ok: response.ok,
      msg: response.ok ? `Claimed ${payload.deviceId}` : (payload.error ?? "Claim failed"),
    });
  }

  return (
    <div className="rounded-xl border border-white/5 bg-card p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Provisioning
        </p>
        <h2 className="font-heading mt-2 text-xl font-bold text-foreground">Claim a device</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Attach a new screen to this workspace as soon as the Pi reports a claim code.
        </p>
      </div>
      <form
        className="flex flex-col gap-3"
        action={(fd) => startTransition(() => void handleSubmit(fd))}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="claimCode" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Claim code</Label>
          <Input id="claimCode" name="claimCode" placeholder="123456" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Screen name</Label>
          <Input id="name" name="name" placeholder="Front Window" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="siteName" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Site</Label>
          <Input id="siteName" name="siteName" placeholder="Chelsea showroom" required />
        </div>
        <Button type="submit" className="mt-1 w-full">Claim device</Button>
        {status ? (
          <p className={cn("text-[0.8rem] font-mono", status.ok ? "text-primary" : "text-danger")}>
            {status.msg}
          </p>
        ) : null}
      </form>
    </div>
  );
}
