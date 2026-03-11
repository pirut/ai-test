"use client";

import { startTransition, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ClaimDeviceForm() {
  const [status, setStatus] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setStatus("Claiming device...");

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
    setStatus(response.ok ? `Claimed ${payload.deviceId}` : (payload.error ?? "Claim failed"));
  }

  return (
    <Card>
      <CardHeader>
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-brand">
          Provisioning
        </p>
        <CardTitle className="text-lg">Claim a screen</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          action={(formData) => startTransition(() => void handleSubmit(formData))}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="claimCode">Claim code</Label>
            <Input id="claimCode" name="claimCode" placeholder="123456" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="name">Screen name</Label>
            <Input id="name" name="name" placeholder="Front Window" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="siteName">Site</Label>
            <Input id="siteName" name="siteName" placeholder="Chelsea showroom" required />
          </div>
          <Button type="submit" className="mt-1">
            Claim device
          </Button>
          {status ? (
            <p className="font-mono text-[0.82rem] text-brand">{status}</p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
