"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

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

const ALL_SCREENS_VALUE = "__all__";
const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hours = String(Math.floor(index / 2)).padStart(2, "0");
  const minutes = index % 2 === 0 ? "00" : "30";
  return `${hours}:${minutes}`;
});
const TIME_OPTION_ITEMS = TIME_OPTIONS.map((option) => ({
  label: option,
  value: option,
}));

function toLocalDateTime(value: string) {
  return value.slice(0, 16);
}

function toDateParts(value: string) {
  if (!value) {
    return { date: "", time: "09:00" };
  }

  const local = toLocalDateTime(value);
  return {
    date: local.slice(0, 10),
    time: local.slice(11, 16),
  };
}

function DateTimeField({
  date,
  id,
  label,
  onDateChange,
  onTimeChange,
  time,
}: {
  date: string;
  id: string;
  label: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  time: string;
}) {
  return (
    <div className="grid gap-2">
      <Label className="text-[0.8rem] text-muted-foreground" htmlFor={`${id}-date`}>
        {label}
      </Label>
      <div className="grid gap-2 sm:grid-cols-[1fr_132px]">
        <Input
          id={`${id}-date`}
          onChange={(event) => onDateChange(event.target.value)}
          type="date"
          value={date}
        />
        <Select
          items={TIME_OPTION_ITEMS}
          onValueChange={(value) => onTimeChange(value ?? "09:00")}
          value={time}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
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
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("17:00");
  const [priority, setPriority] = useState("10");
  const [playlistId, setPlaylistId] = useState(playlists[0]?.id ?? "");
  const [deviceId, setDeviceId] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const playlistOptions = useMemo(
    () =>
      playlists.map((playlist) => ({
        label: playlist.name,
        value: playlist.id,
      })),
    [playlists],
  );
  const deviceOptions = useMemo(
    () => [
      { label: "All screens", value: ALL_SCREENS_VALUE },
      ...devices.map((device) => ({
        label: device.name,
        value: device.id,
      })),
    ],
    [devices],
  );

  async function handleSave() {
    if (!name.trim() || !startDate || !endDate || !playlistId) {
      setStatus({ ok: false, text: "Complete the schedule name, window, and playlist." });
      return;
    }

    const startsAt = new Date(`${startDate}T${startTime}`);
    const endsAt = new Date(`${endDate}T${endTime}`);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      setStatus({ ok: false, text: "Choose a valid start and end window." });
      return;
    }

    if (endsAt <= startsAt) {
      setStatus({ ok: false, text: "Schedule end must be later than the start window." });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
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
      setStartDate("");
      setEndDate("");
      setStartTime("09:00");
      setEndTime("17:00");
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
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <Card className="border border-border/70 bg-card/95">
        <CardHeader className="border-b border-border/60">
          <CardTitle className="text-[0.92rem] font-semibold">Create schedule</CardTitle>
          <p className="text-[0.78rem] text-muted-foreground">
            Compose a window from shadcn-styled date fields and time selectors, then target a playlist and screen scope.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-5">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[0.8rem] text-muted-foreground" htmlFor="schedule-name">
              Name
            </Label>
            <Input
              id="schedule-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="Morning loop"
              value={name}
            />
          </div>

          <DateTimeField
            date={startDate}
            id="schedule-start"
            label="Starts"
            onDateChange={setStartDate}
            onTimeChange={setStartTime}
            time={startTime}
          />

          <DateTimeField
            date={endDate}
            id="schedule-end"
            label="Ends"
            onDateChange={setEndDate}
            onTimeChange={setEndTime}
            time={endTime}
          />

          <div className="flex flex-col gap-1.5">
            <Label className="text-[0.8rem] text-muted-foreground" htmlFor="schedule-priority">
              Priority
            </Label>
            <Input
              id="schedule-priority"
              min="0"
              onChange={(event) => setPriority(event.target.value)}
              type="number"
              value={priority}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[0.8rem] text-muted-foreground">Playlist</Label>
            <Select items={playlistOptions} onValueChange={(value) => setPlaylistId(value ?? "")} value={playlistId}>
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

          <div className="flex flex-col gap-1.5">
            <Label className="text-[0.8rem] text-muted-foreground">Target</Label>
            <Select
              items={deviceOptions}
              onValueChange={(value) => setDeviceId(value === ALL_SCREENS_VALUE ? "" : value ?? "")}
              value={deviceId || ALL_SCREENS_VALUE}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {deviceOptions.map((device) => (
                  <SelectItem key={device.value} value={device.value}>
                    {device.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button disabled={saving} onClick={() => void handleSave()} type="button">
            {saving ? "Saving…" : "Save schedule"}
          </Button>
          {status ? (
            <p className={cn("text-[0.8rem] font-mono", status.ok ? "text-primary" : "text-destructive")}>
              {status.text}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <section className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        {schedules.map((window) => {
          const starts = toDateParts(window.startsAt);
          const ends = toDateParts(window.endsAt);
          return (
            <Card key={window.id} className="border border-border/70 bg-card/95">
              <CardHeader className="border-b border-border/60">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-[0.88rem] font-semibold">{window.label}</CardTitle>
                  <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[0.7rem] text-muted-foreground">
                    P{window.priority}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="divide-y divide-border/60 pt-2">
                {[
                  { label: "Playlist", value: window.playlistName ?? "Unassigned" },
                  { label: "Target", value: window.targetLabel },
                  { label: "Starts", value: `${starts.date} ${starts.time}` },
                  { label: "Ends", value: `${ends.date} ${ends.time}` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono text-[0.8rem] text-foreground">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
