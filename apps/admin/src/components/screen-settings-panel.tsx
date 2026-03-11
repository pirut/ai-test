"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const ORG_DEFAULT_VALUE = "__org_default__";

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
  const orientationOptions = ["0", "90", "180", "270"].map((option) => ({
    label: `${option}°`,
    value: option,
  }));
  const playlistOptions = [
    { label: "Use org default", value: ORG_DEFAULT_VALUE },
    ...playlists.map((playlist) => ({ label: playlist.name, value: playlist.id })),
  ];

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
        <div className="flex flex-col gap-1.5">
          <Label className="text-[0.8rem] text-muted-foreground" htmlFor="screen-name">Name</Label>
          <Input
            id="screen-name"
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            value={form.name}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-[0.8rem] text-muted-foreground" htmlFor="screen-site">Site</Label>
          <Input
            id="screen-site"
            onChange={(event) => setForm((current) => ({ ...current, siteName: event.target.value }))}
            value={form.siteName}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-[0.8rem] text-muted-foreground" htmlFor="screen-timezone">Timezone</Label>
          <Input
            id="screen-timezone"
            onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
            value={form.timezone}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-[0.8rem] text-muted-foreground">Orientation</Label>
          <Select
            items={orientationOptions}
            onValueChange={(value) => setForm((current) => ({ ...current, orientation: value ?? "0" }))}
            value={form.orientation}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {orientationOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-[0.8rem] text-muted-foreground" htmlFor="screen-volume">Volume</Label>
          <Input
            id="screen-volume"
            max="100"
            min="0"
            onChange={(event) => setForm((current) => ({ ...current, volume: event.target.value }))}
            type="number"
            value={form.volume}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-[0.8rem] text-muted-foreground">Default playlist</Label>
          <Select
            items={playlistOptions}
            onValueChange={(value) =>
              setForm((current) => ({
                ...current,
                defaultPlaylistId: value === ORG_DEFAULT_VALUE ? "" : (value ?? ""),
              }))
            }
            value={form.defaultPlaylistId || ORG_DEFAULT_VALUE}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {playlistOptions.map((playlist) => (
                <SelectItem key={playlist.value} value={playlist.value}>
                  {playlist.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
