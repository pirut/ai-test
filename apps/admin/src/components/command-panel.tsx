"use client";

import { startTransition, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const commands = [
  { value: "sync_now",        label: "Sync now" },
  { value: "take_screenshot", label: "Take screenshot" },
  { value: "restart_player",  label: "Restart player" },
  { value: "reboot_device",   label: "Reboot device" },
];

export function CommandPanel({ deviceId }: { deviceId: string }) {
  const [message, setMessage] = useState<string | null>(null);

  async function issue(commandType: string) {
    setMessage(`Queueing ${commandType}...`);

    const response = await fetch(`/api/devices/${deviceId}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commandType }),
    });

    const payload = await response.json();
    setMessage(
      response.ok
        ? `Queued ${payload.command.commandType}`
        : (payload.error ?? "Command failed")
    );
  }

  return (
    <Card>
      <CardHeader>
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-brand">
          Remote control
        </p>
        <CardTitle className="text-lg">Immediate actions</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          {commands.map((command) => (
            <Button
              key={command.value}
              variant="outline"
              size="sm"
              onClick={() => startTransition(() => void issue(command.value))}
            >
              {command.label}
            </Button>
          ))}
        </div>
        {message ? (
          <p className="font-mono text-[0.82rem] text-brand">{message}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
