"use client";

import { startTransition, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function ContactForm() {
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <form
      className="grid gap-4"
      action={(formData) =>
        startTransition(async () => {
          setStatus({ ok: true, message: "Sending…" });

          const response = await fetch("/api/contact", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: formData.get("name"),
              email: formData.get("email"),
              company: formData.get("company"),
              message: formData.get("message"),
            }),
          });

          const payload = (await response.json()) as { ok?: boolean; error?: string };
          setStatus({
            ok: response.ok,
            message: response.ok
              ? "Message sent. We’ll reply by email."
              : (payload.error ?? "Unable to send message"),
          });
        })
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required placeholder="Ada Lovelace" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" required type="email" placeholder="ada@company.com" />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="company">Company</Label>
        <Input id="company" name="company" placeholder="North Studio" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="message">Message</Label>
        <textarea
          id="message"
          name="message"
          required
          rows={6}
          className="w-full rounded-md border border-input bg-[var(--surface-high)] px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          placeholder="Tell us about your fleet, rollout timeline, or support needs."
        />
      </div>
      <Button type="submit" className="w-full sm:w-auto">
        Send message
      </Button>
      {status ? (
        <p className={cn("text-sm", status.ok ? "text-primary" : "text-destructive")}>
          {status.message}
        </p>
      ) : null}
    </form>
  );
}
