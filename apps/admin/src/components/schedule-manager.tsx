"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ScheduleSummary = {
  id: string;
  label: string;
  startsAt: string;
  endsAt: string;
  priority: number;
  playlistId: string | null;
  playlistName: string | null;
  targetDeviceId: string | null;
  targetLabel: string;
};

type PlaylistOption = {
  id: string;
  name: string;
};

type DeviceOption = {
  id: string;
  name: string;
};

function toLocalDateTime(value: string) {
  return value.slice(0, 16);
}

export function ScheduleManager({
  initialSchedules,
  playlists,
  devices,
}: {
  initialSchedules: ScheduleSummary[];
  playlists: PlaylistOption[];
  devices: DeviceOption[];
}) {
  const router = useRouter();
  const [schedules, setSchedules] = useState(initialSchedules);
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [priority, setPriority] = useState("10");
  const [playlistId, setPlaylistId] = useState(playlists[0]?.id ?? "");
  const [deviceId, setDeviceId] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim() || !startsAt || !endsAt || !playlistId) {
      setStatus({ ok: false, text: "Complete the schedule name, window, and playlist." });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          priority: Number(priority) || 0,
          playlistId,
          deviceId: deviceId || undefined,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save schedule");
      }

      const nextSchedule = payload.schedule as ScheduleSummary;
      setSchedules((current) => [nextSchedule, ...current.filter((item) => item.id !== nextSchedule.id)]);
      setName("");
      setStartsAt("");
      setEndsAt("");
      setPriority("10");
      setDeviceId("");
      setStatus({ ok: true, text: `Saved ${nextSchedule.label}` });
      router.refresh();
    } catch (error) {
      setStatus({
        ok: false,
        text: error instanceof Error ? error.message : "Unable to save schedule",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-[0.88rem] font-semibold text-foreground">Create schedule</h2>
        <div className="flex flex-col gap-3">
          <Input onChange={(event) => setName(event.target.value)} placeholder="Morning loop" value={name} />
          <Input onChange={(event) => setStartsAt(event.target.value)} type="datetime-local" value={startsAt} />
          <Input onChange={(event) => setEndsAt(event.target.value)} type="datetime-local" value={endsAt} />
          <Input min="0" onChange={(event) => setPriority(event.target.value)} type="number" value={priority} />
          <select
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            onChange={(event) => setPlaylistId(event.target.value)}
            value={playlistId}
          >
            {playlists.map((playlist) => (
              <option key={playlist.id} value={playlist.id}>
                {playlist.name}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            onChange={(event) => setDeviceId(event.target.value)}
            value={deviceId}
          >
            <option value="">All screens</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
          <Button disabled={saving} onClick={() => void handleSave()} type="button">
            {saving ? "Saving…" : "Save schedule"}
          </Button>
          {status ? (
            <p className={cn("text-[0.8rem] font-mono", status.ok ? "text-primary" : "text-destructive")}>
              {status.text}
            </p>
          ) : null}
        </div>
      </section>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        {schedules.map((window) => (
          <article key={window.id} className="flex flex-col rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[0.88rem] font-semibold text-card-foreground">{window.label}</p>
                <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[0.7rem] text-muted-foreground">
                  P{window.priority}
                </span>
              </div>
            </div>
            <div>
              {[
                { label: "Playlist", value: window.playlistName ?? "Unassigned" },
                { label: "Target", value: window.targetLabel },
                { label: "Starts", value: toLocalDateTime(window.startsAt) },
                { label: "Ends", value: toLocalDateTime(window.endsAt) },
              ].map(({ label, value }, index, array) => (
                <div
                  key={label}
                  className={cn(
                    "flex items-center justify-between gap-4 px-4 py-2.5 text-sm",
                    index < array.length - 1 && "border-b border-border",
                  )}
                >
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono text-[0.8rem] text-foreground">{value}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
