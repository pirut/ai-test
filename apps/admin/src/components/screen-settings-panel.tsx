"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ScreenSettings = {
  deviceId: string;
  name: string;
  siteName: string;
  timezone: string;
  orientation: 0 | 90 | 180 | 270;
  volume: number;
  defaultPlaylistId: string | null;
};

type PlaylistOption = {
  id: string;
  name: string;
};

export function ScreenSettingsPanel({
  device,
  playlists,
}: {
  device: ScreenSettings;
  playlists: PlaylistOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: device.name,
    siteName: device.siteName,
    timezone: device.timezone,
    orientation: String(device.orientation),
    volume: String(device.volume),
    defaultPlaylistId: device.defaultPlaylistId ?? "",
  });
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const response = await fetch(`/api/devices/${device.deviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          siteName: form.siteName,
          timezone: form.timezone,
          orientation: Number(form.orientation),
          volume: Number(form.volume),
          defaultPlaylistId: form.defaultPlaylistId || null,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update device");
      }

      setStatus({ ok: true, text: `Saved ${payload.device.name}` });
      router.refresh();
    } catch (error) {
      setStatus({
        ok: false,
        text: error instanceof Error ? error.message : "Unable to update device",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-4 text-[0.88rem] font-semibold text-foreground">Screen settings</h2>
      <div className="grid gap-3">
        <Input
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          value={form.name}
        />
        <Input
          onChange={(event) => setForm((current) => ({ ...current, siteName: event.target.value }))}
          value={form.siteName}
        />
        <Input
          onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
          value={form.timezone}
        />
        <select
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          onChange={(event) =>
            setForm((current) => ({ ...current, orientation: event.target.value }))
          }
          value={form.orientation}
        >
          {[0, 90, 180, 270].map((option) => (
            <option key={option} value={option}>
              {option}°
            </option>
          ))}
        </select>
        <Input
          max="100"
          min="0"
          onChange={(event) => setForm((current) => ({ ...current, volume: event.target.value }))}
          type="number"
          value={form.volume}
        />
        <select
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          onChange={(event) =>
            setForm((current) => ({ ...current, defaultPlaylistId: event.target.value }))
          }
          value={form.defaultPlaylistId}
        >
          <option value="">Use org default</option>
          {playlists.map((playlist) => (
            <option key={playlist.id} value={playlist.id}>
              {playlist.name}
            </option>
          ))}
        </select>
        <Button disabled={saving} onClick={() => void handleSave()} type="button">
          {saving ? "Saving…" : "Save settings"}
        </Button>
        {status ? (
          <p className={cn("text-[0.8rem] font-mono", status.ok ? "text-primary" : "text-destructive")}>
            {status.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
