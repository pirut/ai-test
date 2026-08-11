"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CommandDefinition = {
  value: "sync_now" | "take_screenshot" | "restart_player" | "reboot_device";
  label: string;
  adminOnly: boolean;
  confirm?: boolean;
};

const commands: readonly CommandDefinition[] = [
  { value: "sync_now", label: "Sync content", adminOnly: false },
  { value: "take_screenshot", label: "Refresh preview", adminOnly: false },
  { value: "restart_player", label: "Restart player", adminOnly: true },
  { value: "reboot_device", label: "Reboot screen", adminOnly: true, confirm: true },
];

export function CommandPanel({
  deviceId,
  canAdmin,
  fleetManagementState,
}: {
  deviceId: string;
  canAdmin: boolean;
  fleetManagementState: "legacy" | "managed";
}) {
  const isManaged = fleetManagementState === "managed";
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [confirmCommand, setConfirmCommand] = useState<string | null>(null);
  const [network, setNetwork] = useState({ ssid: "", password: "" });

  useEffect(() => {
    if (!confirmCommand) return;
    const timeout = window.setTimeout(() => setConfirmCommand(null), 4_000);
    return () => window.clearTimeout(timeout);
  }, [confirmCommand]);

  async function issue(commandType: string, payload?: Record<string, unknown>) {
    setSending(commandType);
    setMessage({ ok: true, text: "Sending command…" });
    try {
      const response = await fetch(`/api/devices/${deviceId}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandType, payload }),
      });
      const responseBody = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseBody?.error ?? "Command failed");
      setMessage({ ok: true, text: `${responseBody.command.commandType} queued successfully.` });
      if (commandType === "update_network") {
        setNetwork((current) => ({ ...current, password: "" }));
      }
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : "Unable to queue command",
      });
    } finally {
      setSending(null);
      setConfirmCommand(null);
    }
  }

  return (
    <div className="dashboard-surface rounded-lg p-5">
      <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Controls</p>
        <h2 className="font-heading mt-2 text-xl font-bold text-foreground">Remote control</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Commands are queued safely and report their result in the command log.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {commands.filter((command) => canAdmin || !command.adminOnly).map((command) => {
          const awaitingConfirmation = confirmCommand === command.value;
          return (
            <Button
              key={command.value}
              className="text-[0.82rem]"
              disabled={sending !== null}
              onClick={() => {
                if (command.confirm && !awaitingConfirmation) {
                  setConfirmCommand(command.value);
                  setMessage({ ok: false, text: "Select reboot again to confirm." });
                  return;
                }
                void issue(command.value);
              }}
              size="sm"
              variant={awaitingConfirmation ? "destructive" : "outline"}
            >
              {sending === command.value
                ? "Sending…"
                : awaitingConfirmation
                  ? "Confirm reboot"
                  : command.label}
            </Button>
          );
        })}
      </div>

      {canAdmin ? (
        <div className="mt-4 space-y-3 rounded-md border border-border bg-[var(--surface-low)] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Stage replacement Wi-Fi</p>
            <p className="mt-1 text-[0.8rem] leading-5 text-muted-foreground">
              {isManaged
                ? "The Pi saves the new network before switching; the password is redacted after delivery."
                : "Available after this device reports its first heartbeat from the fleet appliance."}
            </p>
          </div>
          <Input
            aria-label="Wi-Fi network name"
            disabled={!isManaged}
            placeholder="SSID"
            value={network.ssid}
            onChange={(event) => setNetwork((current) => ({ ...current, ssid: event.target.value }))}
          />
          <Input
            aria-label="Wi-Fi password"
            disabled={!isManaged}
            placeholder="Password"
            type="password"
            value={network.password}
            onChange={(event) => setNetwork((current) => ({ ...current, password: event.target.value }))}
          />
          <Button
            className="w-full"
            disabled={!isManaged || sending !== null || !network.ssid.trim() || network.password.length < 8}
            onClick={() => void issue("update_network", { ...network, priority: 100 })}
            size="sm"
            variant="outline"
          >
            {sending === "update_network" ? "Staging…" : "Stage network"}
          </Button>
          <div className="border-t border-border pt-3">
          <p className="text-sm font-medium text-foreground">Software releases</p>
          <p className="mt-1 text-[0.8rem] leading-5 text-muted-foreground">
            {isManaged
              ? "Signed player and agent updates are managed from the release center."
              : "This legacy device is excluded from release rollouts until it is flashed."}
          </p>
          <Link className="mt-2 inline-flex text-[0.8rem] font-semibold text-primary hover:underline" href="/releases">
            Open release center
          </Link>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className={`mt-3 font-mono text-[0.78rem] ${message.ok ? "text-primary" : "text-danger"}`} role="status">
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
