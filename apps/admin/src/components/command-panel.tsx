"use client";

import { startTransition, useState } from "react";
import { releaseUpdatePayloadSchema } from "@showroom/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const commands = [
  { value: "sync_now",        label: "Sync now" },
  { value: "take_screenshot", label: "Screenshot" },
  { value: "restart_player",  label: "Restart player" },
  { value: "reboot_device",   label: "Reboot device" },
];

export function CommandPanel({ deviceId }: { deviceId: string }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [updateDraft, setUpdateDraft] = useState({
    version: "",
    agentUrl: "",
    agentSha256: "",
    playerUrl: "",
    playerSha256: "",
  });

  async function issue(commandType: string, payload?: Record<string, unknown>) {
    setMessage({ ok: true, text: `Sending ${commandType}…` });
    const response = await fetch(`/api/devices/${deviceId}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commandType, payload }),
    });
    const responseBody = await response.json();
    setMessage({
      ok: response.ok,
      text: response.ok ? `Queued: ${responseBody.command.commandType}` : (responseBody.error ?? "Command failed"),
    });
  }

  async function issueReleaseUpdate() {
    const payload = releaseUpdatePayloadSchema.parse({
      version: updateDraft.version.trim() || undefined,
      agentUrl: updateDraft.agentUrl.trim() || undefined,
      agentSha256: updateDraft.agentSha256.trim() || undefined,
      playerUrl: updateDraft.playerUrl.trim() || undefined,
      playerSha256: updateDraft.playerSha256.trim() || undefined,
    });

    await issue("update_release", payload);
  }

  return (
    <div className="rounded-xl border border-white/5 bg-card p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Controls
        </p>
        <h2 className="font-heading mt-2 text-xl font-bold text-foreground">Remote control</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Commands queue immediately and execute on the device heartbeat loop.
        </p>
      </div>
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
      <div className="mt-4 space-y-2 rounded-xl border border-white/6 bg-[var(--surface-low)] p-4">
        <div>
          <h3 className="text-[0.82rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Release update
          </h3>
          <p className="mt-1 text-[0.8rem] text-muted-foreground">
            Queue a player archive and/or agent binary. SHA-256 values are optional but recommended.
          </p>
        </div>
        <Input
          value={updateDraft.version}
          placeholder="Release version (optional)"
          className="h-8 text-[0.8rem]"
          onChange={(event) =>
            setUpdateDraft((current) => ({ ...current, version: event.target.value }))
          }
        />
        <Input
          value={updateDraft.playerUrl}
          placeholder="Player archive URL (.tar.gz, .tgz, or .zip)"
          className="h-8 text-[0.8rem]"
          onChange={(event) =>
            setUpdateDraft((current) => ({ ...current, playerUrl: event.target.value }))
          }
        />
        <Input
          value={updateDraft.playerSha256}
          placeholder="Player SHA-256 (optional)"
          className="h-8 font-mono text-[0.75rem]"
          onChange={(event) =>
            setUpdateDraft((current) => ({ ...current, playerSha256: event.target.value }))
          }
        />
        <Input
          value={updateDraft.agentUrl}
          placeholder="Agent binary URL"
          className="h-8 text-[0.8rem]"
          onChange={(event) =>
            setUpdateDraft((current) => ({ ...current, agentUrl: event.target.value }))
          }
        />
        <Input
          value={updateDraft.agentSha256}
          placeholder="Agent SHA-256 (optional)"
          className="h-8 font-mono text-[0.75rem]"
          onChange={(event) =>
            setUpdateDraft((current) => ({ ...current, agentSha256: event.target.value }))
          }
        />
        <Button
          variant="secondary"
          size="sm"
          className="w-full text-[0.8rem]"
          onClick={() =>
            startTransition(() => {
              void issueReleaseUpdate().catch((error) => {
                setMessage({
                  ok: false,
                  text: error instanceof Error ? error.message : "Command failed",
                });
              });
            })
          }
        >
          Apply release
        </Button>
      </div>
      {message ? (
        <p className={`mt-3 font-mono text-[0.78rem] ${message.ok ? "text-primary" : "text-danger"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
