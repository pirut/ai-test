"use client";

import { startTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-0.5 text-[0.88rem] font-semibold text-foreground">Claim a device</h2>
      <p className="mb-4 text-[0.8rem] text-muted-foreground">Provision a new Pi as it comes online.</p>
      <form
        className="flex flex-col gap-3"
        action={(fd) => startTransition(() => void handleSubmit(fd))}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="claimCode" className="text-[0.8rem]">Claim code</Label>
          <Input id="claimCode" name="claimCode" placeholder="123456" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name" className="text-[0.8rem]">Screen name</Label>
          <Input id="name" name="name" placeholder="Front Window" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="siteName" className="text-[0.8rem]">Site</Label>
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

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
