"use client";

import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ScheduleWeekView } from "@/components/schedule-week-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
const DEFAULT_START_TIME = "09:00";
const DEFAULT_END_TIME = "17:00";
const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hours = String(Math.floor(index / 2)).padStart(2, "0");
  const minutes = index % 2 === 0 ? "00" : "30";
  return `${hours}:${minutes}`;
});
const TIME_OPTION_ITEMS = TIME_OPTIONS.map((option) => ({
  label: option,
  value: option,
}));
const PRIORITY_OPTIONS = [0, 5, 10, 20, 30, 40, 50].map((value) => ({
  label: `P${value}`,
  value: String(value),
}));

function toLocalDate(value: string) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toLocalTime(value: string, fallback: string) {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function combineDateAndTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const next = new Date(date);
  next.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return next;
}

function formatScheduleDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return format(date, "MMM d, yyyy h:mm a");
}

function DateTimeField({
  date,
  defaultTime,
  id,
  label,
  onDateChange,
  onTimeChange,
  time,
}: {
  date?: Date;
  defaultTime: string;
  id: string;
  label: string;
  onDateChange: (value: Date | undefined) => void;
  onTimeChange: (value: string) => void;
  time: string;
}) {
  return (
    <div className="grid gap-2">
      <Label className="text-sm" htmlFor={`${id}-date`}>
        {label}
      </Label>
      <div className="grid gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              className={cn(
                "h-10 w-full justify-between rounded-lg border-input bg-background px-3 text-left font-normal shadow-xs hover:bg-accent/60 dark:bg-input/40",
                !date && "text-muted-foreground",
              )}
              id={`${id}-date`}
              variant="outline"
            >
              <span>{date ? format(date, "PPP") : "Pick a date"}</span>
              <CalendarIcon className="size-4 opacity-70" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto overflow-hidden p-0">
            <Calendar
              initialFocus
              mode="single"
              onSelect={onDateChange}
              selected={date}
            />
          </PopoverContent>
        </Popover>
        <Select
          items={TIME_OPTION_ITEMS}
          onValueChange={(value) => onTimeChange(value ?? defaultTime)}
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

type WindowState = "active" | "upcoming" | "ended";

function windowState(window: ScheduleSummary, now: number): WindowState {
  if (Date.parse(window.endsAt) <= now) return "ended";
  if (Date.parse(window.startsAt) <= now) return "active";
  return "upcoming";
}

const stateOrder: Record<WindowState, number> = { active: 0, upcoming: 1, ended: 2 };

/** Other windows that overlap this one on at least one shared screen, highest priority first. */
function overlapsFor(window: ScheduleSummary, all: ScheduleSummary[]) {
  const start = Date.parse(window.startsAt);
  const end = Date.parse(window.endsAt);
  return all
    .filter((other) => other.id !== window.id)
    .filter((other) => Date.parse(other.startsAt) < end && start < Date.parse(other.endsAt))
    .filter((other) => !window.targetDeviceId || !other.targetDeviceId || other.targetDeviceId === window.targetDeviceId)
    .sort((a, b) => b.priority - a.priority);
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
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME);
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [endTime, setEndTime] = useState(DEFAULT_END_TIME);
  const [priority, setPriority] = useState("10");
  const [playlistId, setPlaylistId] = useState(playlists[0]?.id ?? "");
  const [deviceId, setDeviceId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const playlistOptions = useMemo(
    () =>
      playlists.map((playlist) => ({
        label: playlist.name,
        value: playlist.id,
      })),
    [playlists],
  );
  const hasPlaylists = playlistOptions.length > 0;
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

  function startEditing(schedule: ScheduleSummary) {
    setEditingId(schedule.id);
    setName(schedule.label);
    setPriority(String(schedule.priority));
    setPlaylistId(schedule.playlistId ?? playlists[0]?.id ?? "");
    setDeviceId(schedule.targetDeviceId ?? "");

    setStartDate(toLocalDate(schedule.startsAt));
    setStartTime(toLocalTime(schedule.startsAt, DEFAULT_START_TIME));
    setEndDate(toLocalDate(schedule.endsAt));
    setEndTime(toLocalTime(schedule.endsAt, DEFAULT_END_TIME));
    setStatus(null);
    setConfirmDeleteId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Auto-clear confirm delete after 3s
  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = setTimeout(() => setConfirmDeleteId(null), 3000);
    return () => clearTimeout(timer);
  }, [confirmDeleteId]);

  function cancelEditing() {
    setEditingId(null);
    setName("");
    setStartDate(undefined);
    setEndDate(undefined);
    setStartTime(DEFAULT_START_TIME);
    setEndTime(DEFAULT_END_TIME);
    setPriority("10");
    setPlaylistId(playlists[0]?.id ?? "");
    setDeviceId("");
  }

  async function handleSave() {
    if (!name.trim() || !startDate || !endDate || !playlistId) {
      setStatus({ ok: false, text: "Complete the schedule name, window, and playlist." });
      return;
    }

    const startsAt = combineDateAndTime(startDate, startTime);
    const endsAt = combineDateAndTime(endDate, endTime);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      setStatus({ ok: false, text: "Choose a valid start and end window." });
      return;
    }

    if (endsAt <= startsAt) {
      setStatus({ ok: false, text: "Schedule end must be later than the start." });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: editingId ?? undefined,
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
      setSchedules((current) => [
        nextSchedule,
        ...current.filter((s) => s.id !== nextSchedule.id),
      ]);
      setStatus({ ok: true, text: `Saved "${nextSchedule.label}"` });
      cancelEditing();
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

  async function handleDelete(scheduleId: string) {
    if (confirmDeleteId !== scheduleId) {
      setConfirmDeleteId(scheduleId);
      return;
    }

    setDeleting(true);
    setConfirmDeleteId(null);
    try {
      const response = await fetch(`/api/schedules/${scheduleId}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? "Unable to delete schedule");
      }

      setSchedules((current) => current.filter((s) => s.id !== scheduleId));
      if (editingId === scheduleId) cancelEditing();
      router.refresh();
    } catch (error) {
      setStatus({
        ok: false,
        text: error instanceof Error ? error.message : "Unable to delete schedule",
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <Card className="h-fit xl:sticky xl:top-20">
        <CardHeader className="border-b">
          <CardTitle>
            {editingId ? "Edit schedule" : "Create schedule"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {editingId
              ? "Update the window, playlist, and target, then save."
              : "Set a time window, assign a playlist, and choose a target."}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-5">
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm" htmlFor="schedule-name">
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
            defaultTime={DEFAULT_START_TIME}
            id="schedule-start"
            label="Starts"
            onDateChange={setStartDate}
            onTimeChange={setStartTime}
            time={startTime}
          />

          <DateTimeField
            date={endDate}
            defaultTime={DEFAULT_END_TIME}
            id="schedule-end"
            label="Ends"
            onDateChange={setEndDate}
            onTimeChange={setEndTime}
            time={endTime}
          />

          <div className="flex flex-col gap-1.5">
            <Label className="text-sm">Priority</Label>
            <p className="text-xs text-muted-foreground">When windows overlap, the higher number plays.</p>
            <Select items={PRIORITY_OPTIONS} onValueChange={(value) => setPriority(value ?? "10")} value={priority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-sm">Playlist</Label>
            <Select
              disabled={!hasPlaylists}
              items={playlistOptions}
              onValueChange={(value) => setPlaylistId(value ?? "")}
              value={playlistId || null}
            >
              <SelectTrigger>
                <SelectValue placeholder={hasPlaylists ? "Choose playlist" : "No playlists available"} />
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
            <Label className="text-sm">Screens</Label>
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

          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={saving || !hasPlaylists}
              onClick={() => void handleSave()}
              type="button"
            >
              {saving ? "Saving…" : editingId ? "Update schedule" : "Save schedule"}
            </Button>
            {editingId ? (
              <Button onClick={cancelEditing} type="button" variant="outline">
                Cancel
              </Button>
            ) : null}
          </div>

          {status ? (
            <p role="status" className={cn("text-xs", status.ok ? "text-signal" : "text-destructive")}>
              {status.text}
            </p>
          ) : !hasPlaylists ? (
            <p className="text-xs text-muted-foreground">
              Create a playlist first, then come back to schedule it.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <section className="flex min-w-0 flex-col gap-6">
        <ScheduleWeekView
          windows={schedules}
          selectedId={editingId}
          onSelect={(id) => {
            const target = schedules.find((schedule) => schedule.id === id);
            if (target) startEditing(target);
          }}
        />
        {schedules.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            {[...schedules]
              .sort((a, b) => {
                return stateOrder[windowState(a, now)] - stateOrder[windowState(b, now)] || Date.parse(a.startsAt) - Date.parse(b.startsAt);
              })
              .map((window) => {
              const state = windowState(window, now);
              const overlaps = state === "ended" ? [] : overlapsFor(window, schedules.filter((other) => windowState(other, now) !== "ended"));
              const outranked = overlaps.find((other) => other.priority > window.priority);
              return (
                <Card
                  key={window.id}
                  className={cn(
                    "transition-colors",
                    editingId === window.id && "border-primary/50 bg-accent/40",
                    state === "ended" && "opacity-60",
                  )}
                  size="sm"
                >
                  <CardHeader className="border-b">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-col gap-1">
                        <CardTitle className="truncate">{window.label}</CardTitle>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={state === "active" ? "success" : state === "upcoming" ? "info" : "secondary"}>
                            {state === "active" ? "Playing now" : state === "upcoming" ? "Upcoming" : "Ended"}
                          </Badge>
                          <Badge variant="outline">Priority {window.priority}</Badge>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          disabled={deleting}
                          onClick={() => startEditing(window)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Edit
                        </Button>
                        <Button
                          className={confirmDeleteId === window.id ? "text-destructive hover:bg-destructive/10" : ""}
                          disabled={deleting}
                          onClick={() => void handleDelete(window.id)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          {confirmDeleteId === window.id ? "Really delete?" : "Delete"}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col">
                    <dl className="divide-y">
                      {[
                        { label: "Playlist", value: window.playlistName ?? "Unassigned" },
                        { label: "Screens", value: window.targetLabel },
                        { label: "Starts", value: formatScheduleDateTime(window.startsAt) },
                        { label: "Ends", value: formatScheduleDateTime(window.endsAt) },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-center justify-between gap-4 py-1.5 text-sm">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="truncate text-right">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    {overlaps.length ? (
                      <p className={cn("mt-2 text-xs", outranked ? "text-warning" : "text-muted-foreground")}>
                        {outranked
                          ? `Overlaps "${outranked.label}" (priority ${outranked.priority}), which plays instead while both are on.`
                          : `Overlaps ${overlaps.length} other window${overlaps.length === 1 ? "" : "s"}; this one wins on priority.`}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No schedules yet. Every screen plays its default playlist all the time. Add a window on the left to play something different at certain times.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
