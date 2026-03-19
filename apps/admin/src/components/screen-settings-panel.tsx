"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
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
    volume: device.volume,
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
          volume: form.volume,
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
    <Card className="border border-white/5 bg-card/95">
      <CardHeader className="border-b border-white/5">
        <CardTitle className="font-heading text-xl font-bold">System settings</CardTitle>
        <p className="text-sm text-muted-foreground">
          Update the device identity, playback defaults, rotation, and audio ceiling.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 pt-5">
        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground" htmlFor="screen-name">
            Name
          </Label>
          <Input
            id="screen-name"
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            value={form.name}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground" htmlFor="screen-site">
            Site
          </Label>
          <Input
            id="screen-site"
            onChange={(event) => setForm((current) => ({ ...current, siteName: event.target.value }))}
            value={form.siteName}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground" htmlFor="screen-timezone">
            Timezone
          </Label>
          <Input
            id="screen-timezone"
            onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
            value={form.timezone}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Orientation</Label>
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
            <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Default playlist</Label>
            <Select
              items={playlistOptions}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  defaultPlaylistId: value === ORG_DEFAULT_VALUE ? "" : value ?? "",
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
        </div>

        <div className="rounded-xl border border-white/6 bg-[var(--surface-low)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Volume</Label>
              <p className="text-[0.8rem] text-muted-foreground">
                Use the slider to set the playback ceiling for this screen.
              </p>
            </div>
            <span className="rounded-full border border-white/6 px-2 py-0.5 font-mono text-[0.78rem] text-foreground">
              {form.volume}%
            </span>
          </div>
          <div className="mt-4">
            <Slider
              max={100}
              min={0}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  volume: Array.isArray(value) ? value[0] ?? 0 : value,
                }))
              }
              step={1}
              value={form.volume}
            />
          </div>
        </div>

        <Button disabled={saving} onClick={() => void handleSave()} type="button">
          {saving ? "Saving…" : "Save settings"}
        </Button>
        {status ? (
          <p className={cn("text-[0.8rem] font-mono", status.ok ? "text-primary" : "text-destructive")}>
            {status.text}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
