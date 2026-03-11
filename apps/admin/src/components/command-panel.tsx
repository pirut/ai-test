"use client";

import { startTransition, useState } from "react";

const commands = [
  { value: "sync_now", label: "Sync now" },
  { value: "take_screenshot", label: "Take screenshot" },
  { value: "restart_player", label: "Restart player" },
  { value: "reboot_device", label: "Reboot device" },
];

export function CommandPanel({ deviceId }: { deviceId: string }) {
  const [message, setMessage] = useState<string | null>(null);

  async function issue(commandType: string) {
    setMessage(`Queueing ${commandType}...`);

    const response = await fetch(`/api/devices/${deviceId}/commands`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ commandType }),
    });

    const payload = await response.json();
    setMessage(response.ok ? `Queued ${payload.command.commandType}` : payload.error ?? "Command failed");
  }

  return (
    <section className="panel">
      <div className="sectionTitle">
        <span className="eyebrow">Remote control</span>
        <h2>Immediate actions</h2>
      </div>
      <div className="buttonGrid">
        {commands.map((command) => (
          <button
            key={command.value}
            type="button"
            onClick={() => startTransition(() => void issue(command.value))}
          >
            {command.label}
          </button>
        ))}
      </div>
      {message ? <p className="formStatus">{message}</p> : null}
    </section>
  );
}

