"use client";

import { RectangleHorizontal, RectangleVertical, Volume2, VolumeX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { readApiPayload } from "@/lib/api-response";
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

const orientationOptions = [
  { value: "0", label: "Landscape", icon: RectangleHorizontal, rotate: false },
  { value: "90", label: "Portrait", icon: RectangleVertical, rotate: false },
  { value: "180", label: "Landscape, flipped", icon: RectangleHorizontal, rotate: true },
  { value: "270", label: "Portrait, flipped", icon: RectangleVertical, rotate: true },
] as const;

function supportedTimezones() {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
}

function isValidTimezone(zone: string) {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: zone });
    return zone.trim().length > 0;
  } catch {
    return false;
  }
}

function formFrom(device: ScreenSettings) {
  return {
    name: device.name,
    siteName: device.siteName,
    timezone: device.timezone,
    orientation: String(device.orientation),
    volume: device.volume,
    defaultPlaylistId: device.defaultPlaylistId ?? "",
  };
}

export function ScreenSettingsPanel({
  device,
  playlists,
}: {
  device: ScreenSettings;
  playlists: PlaylistOption[];
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(() => formFrom(device));
  const [form, setForm] = useState(saved);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // Filled after mount so the server and browser render the same markup.
  const [timezones, setTimezones] = useState<string[]>([]);
  useEffect(() => setTimezones(supportedTimezones()), []);

  const playlistOptions = [
    { label: "Workspace default", value: ORG_DEFAULT_VALUE },
    ...playlists.map((playlist) => ({ label: playlist.name, value: playlist.id })),
  ];

  const dirty = (Object.keys(form) as (keyof typeof form)[]).some((key) => form[key] !== saved[key]);
  const nameMissing = !form.name.trim();
  const timezoneInvalid = form.timezone !== saved.timezone && !isValidTimezone(form.timezone);
  const canSave = dirty && !saving && !nameMissing && !timezoneInvalid;

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setStatus(null);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const response = await fetch(`/api/devices/${device.deviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          siteName: form.siteName.trim(),
          timezone: form.timezone,
          orientation: Number(form.orientation),
          volume: form.volume,
          defaultPlaylistId: form.defaultPlaylistId || null,
        }),
      });

      const payload = await readApiPayload<{ device: ScreenSettings }>(response);
      if (!response.ok) {
        throw new Error(payload.error ?? `Could not save settings (${response.status})`);
      }
      if (!payload.device) {
        throw new Error("The screen was updated but the server did not confirm its settings.");
      }

      const next = formFrom(payload.device);
      setSaved(next);
      setForm(next);
      setStatus({ ok: true, text: "Saved. The screen applies changes on its next sync." });
      router.refresh();
    } catch (error) {
      setStatus({
        ok: false,
        text: error instanceof Error ? error.message : "Could not save settings",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Settings</CardTitle>
        <CardDescription>Name, location, what plays by default, and how the picture and sound are set up.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="screen-settings"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave) void handleSave();
          }}
        >
          <FieldGroup className="gap-5">
            <div className="grid gap-5 md:grid-cols-2">
              <Field data-invalid={nameMissing}>
                <FieldLabel htmlFor="screen-name">Screen name</FieldLabel>
                <Input
                  id="screen-name"
                  aria-invalid={nameMissing}
                  onChange={(event) => update("name", event.target.value)}
                  value={form.name}
                />
                {nameMissing ? <FieldError>Give the screen a name.</FieldError> : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="screen-site">Site</FieldLabel>
                <Input
                  id="screen-site"
                  onChange={(event) => update("siteName", event.target.value)}
                  value={form.siteName}
                />
              </Field>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="screen-playlist">Default playlist</FieldLabel>
                <Select
                  items={playlistOptions}
                  onValueChange={(value) =>
                    update("defaultPlaylistId", value === ORG_DEFAULT_VALUE ? "" : value ?? "")
                  }
                  value={form.defaultPlaylistId || ORG_DEFAULT_VALUE}
                >
                  <SelectTrigger id="screen-playlist" className="w-full">
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
                <FieldDescription>Plays whenever no schedule is active.</FieldDescription>
              </Field>
              <Field data-invalid={timezoneInvalid}>
                <FieldLabel htmlFor="screen-timezone">Time zone</FieldLabel>
                <Input
                  id="screen-timezone"
                  aria-invalid={timezoneInvalid}
                  autoComplete="off"
                  list="screen-timezone-options"
                  onChange={(event) => update("timezone", event.target.value)}
                  value={form.timezone}
                />
                <datalist id="screen-timezone-options">
                  {timezones.map((zone) => (
                    <option key={zone} value={zone} />
                  ))}
                </datalist>
                {timezoneInvalid ? (
                  <FieldError>Pick a time zone from the list, like America/New_York.</FieldError>
                ) : (
                  <FieldDescription>Used for schedules on this screen.</FieldDescription>
                )}
              </Field>
            </div>

            <Field>
              <FieldLabel id="screen-orientation-label">Orientation</FieldLabel>
              <div role="radiogroup" aria-labelledby="screen-orientation-label" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {orientationOptions.map((option) => {
                  const selected = form.orientation === option.value;
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => update("orientation", option.value)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        selected
                          ? "border-primary bg-accent text-accent-foreground"
                          : "hover:bg-muted",
                      )}
                    >
                      <Icon className={cn("size-4 shrink-0", option.rotate && "rotate-180")} aria-hidden />
                      <span className="truncate">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel id="screen-volume-label">Volume</FieldLabel>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {form.volume === 0 ? "Muted" : `${form.volume}%`}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <VolumeX className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <Slider
                  aria-labelledby="screen-volume-label"
                  max={100}
                  min={0}
                  onValueChange={(value) => update("volume", Array.isArray(value) ? value[0] ?? 0 : value)}
                  step={1}
                  value={form.volume}
                />
                <Volume2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </div>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-3">
        <p
          role="status"
          className={cn("text-xs", status ? (status.ok ? "text-signal" : "text-destructive") : "text-muted-foreground")}
        >
          {status?.text ?? (dirty ? "You have unsaved changes." : "All changes saved.")}
        </p>
        <div className="flex gap-2">
          {dirty ? (
            <Button type="button" variant="ghost" disabled={saving} onClick={() => { setForm(saved); setStatus(null); }}>
              Discard
            </Button>
          ) : null}
          <Button type="submit" form="screen-settings" disabled={!canSave}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
