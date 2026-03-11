"use client";

import { startTransition, useState } from "react";
import { Button } from "@/components/ui/button";

const commands = [
  { value: "sync_now",        label: "Sync now" },
  { value: "take_screenshot", label: "Screenshot" },
  { value: "restart_player",  label: "Restart player" },
  { value: "reboot_device",   label: "Reboot device" },
];

export function CommandPanel({ deviceId }: { deviceId: string }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function issue(commandType: string) {
    setMessage({ ok: true, text: `Sending ${commandType}…` });
    const response = await fetch(`/api/devices/${deviceId}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commandType }),
    });
    const payload = await response.json();
    setMessage({
      ok: response.ok,
      text: response.ok ? `Queued: ${payload.command.commandType}` : (payload.error ?? "Command failed"),
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-0.5 text-[0.88rem] font-semibold text-foreground">Remote control</h2>
      <p className="mb-4 text-[0.8rem] text-muted-foreground">Commands are queued and picked up on next heartbeat.</p>
      <div className="grid grid-cols-2 gap-2">
        {commands.map((cmd) => (
          <Button
            key={cmd.value}
            variant="outline"
            size="sm"
            className="text-[0.82rem]"
            onClick={() => startTransition(() => void issue(cmd.value))}
          >
            {cmd.label}
          </Button>
        ))}
      </div>
      {message ? (
        <p className={`mt-3 font-mono text-[0.78rem] ${message.ok ? "text-primary" : "text-danger"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
