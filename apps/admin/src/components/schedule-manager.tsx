"use client";

import type { ScheduleRecurrence } from "@showroom/contracts";
import { format } from "date-fns";
import { CalendarIcon, Repeat } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ScheduleWeekView } from "@/components/schedule-week-view";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { readApiPayload } from "@/lib/api-response";
import {
  DAY_LONG,
  DAY_SHORT,
  WEEK_DAYS,
  describeDays,
  describeTimes,
  formatMinute,
  minuteToTime,
  recurrencesOverlap,
  timeToMinute,
} from "@/lib/schedule-format";
import { cn } from "@/lib/utils";

type ScheduleSummary = {
  id: string;
  label: string;
  startsAt: string;
  endsAt: string;
  /** Set when the schedule repeats by time of day; startsAt and endsAt are then unused. */
  recurrence?: ScheduleRecurrence | null;
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
  /** False for a paired screen whose software predates repeating schedules. */
  supportsRepeatingSchedules?: boolean;
};

const WEEKDAYS = [1, 2, 3, 4, 5];
const DAY_PRESETS = [
  { label: "Every day", days: [0, 1, 2, 3, 4, 5, 6] },
  { label: "Weekdays", days: WEEKDAYS },
  { label: "Weekends", days: [0, 6] },
];

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
const CLOCK_OPTION_ITEMS = TIME_OPTIONS.map((option) => ({
  label: formatMinute(timeToMinute(option)),
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

type WindowState = "active" | "repeating" | "upcoming" | "ended";

function windowState(window: ScheduleSummary, now: number): WindowState {
  // Whether a repeating schedule is on right now depends on each screen's
  // own clock, so it is not labelled as playing or upcoming here.
  if (window.recurrence) return "repeating";
  if (Date.parse(window.endsAt) <= now) return "ended";
  if (Date.parse(window.startsAt) <= now) return "active";
  return "upcoming";
}

const stateOrder: Record<WindowState, number> = { active: 0, repeating: 1, upcoming: 2, ended: 3 };

/** Other windows that overlap this one on at least one shared screen, highest priority first. */
function overlapsFor(window: ScheduleSummary, all: ScheduleSummary[]) {
  const start = Date.parse(window.startsAt);
  const end = Date.parse(window.endsAt);
  return all
    .filter((other) => other.id !== window.id)
    .filter((other) => {
      if (window.recurrence && other.recurrence) return recurrencesOverlap(window.recurrence, other.recurrence);
      // A dated window against a repeating one is not compared: whether they
      // meet depends on the dates and on each screen's time zone.
      if (window.recurrence || other.recurrence) return false;
      return Date.parse(other.startsAt) < end && start < Date.parse(other.endsAt);
    })
    .filter((other) => !window.targetDeviceId || !other.targetDeviceId || other.targetDeviceId === window.targetDeviceId)
    .sort((a, b) => b.priority - a.priority);
}

export function ScheduleManager({
  initialSchedules,
  playlists,
  devices,
  canEdit = true,
}: {
  initialSchedules: ScheduleSummary[];
  playlists: PlaylistOption[];
  devices: DeviceOption[];
  /** Members can look at schedules; only admins can change them. */
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [schedules, setSchedules] = useState(initialSchedules);
  const [name, setName] = useState("");
  const [repeats, setRepeats] = useState(true);
  const [days, setDays] = useState<number[]>(WEEKDAYS);
  const [dailyStart, setDailyStart] = useState(DEFAULT_START_TIME);
  const [dailyEnd, setDailyEnd] = useState(DEFAULT_END_TIME);
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
  // Screens a weekly schedule is aimed at that cannot follow one yet.
  const needUpdate = useMemo(() => {
    const weekly = schedules.filter((schedule) => schedule.recurrence);
    return devices.filter(
      (device) =>
        device.supportsRepeatingSchedules === false &&
        weekly.some((schedule) => !schedule.targetDeviceId || schedule.targetDeviceId === device.id),
    );
  }, [devices, schedules]);
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

    setRepeats(Boolean(schedule.recurrence));
    if (schedule.recurrence) {
      setDays(schedule.recurrence.daysOfWeek);
      setDailyStart(minuteToTime(schedule.recurrence.startMinute));
      setDailyEnd(minuteToTime(schedule.recurrence.endMinute));
      setStartDate(undefined);
      setEndDate(undefined);
      setStartTime(DEFAULT_START_TIME);
      setEndTime(DEFAULT_END_TIME);
    } else {
      setStartDate(toLocalDate(schedule.startsAt));
      setStartTime(toLocalTime(schedule.startsAt, DEFAULT_START_TIME));
      setEndDate(toLocalDate(schedule.endsAt));
      setEndTime(toLocalTime(schedule.endsAt, DEFAULT_END_TIME));
    }
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
    setRepeats(true);
    setDays(WEEKDAYS);
    setDailyStart(DEFAULT_START_TIME);
    setDailyEnd(DEFAULT_END_TIME);
    setStartDate(undefined);
    setEndDate(undefined);
    setStartTime(DEFAULT_START_TIME);
    setEndTime(DEFAULT_END_TIME);
    setPriority("10");
    setPlaylistId(playlists[0]?.id ?? "");
    setDeviceId("");
  }

  async function handleSave() {
    if (!name.trim() || !playlistId) {
      setStatus({ ok: false, text: "Give the schedule a name and a playlist." });
      return;
    }

    let timing: { startsAt: string; endsAt: string } | { recurrence: ScheduleRecurrence };
    if (repeats) {
      if (!days.length) {
        setStatus({ ok: false, text: "Choose at least one day." });
        return;
      }
      timing = {
        recurrence: {
          daysOfWeek: [...days].sort((a, b) => a - b),
          startMinute: timeToMinute(dailyStart),
          endMinute: timeToMinute(dailyEnd),
        },
      };
    } else {
      if (!startDate || !endDate) {
        setStatus({ ok: false, text: "Choose a start and an end date." });
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
      timing = { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
    }

    setSaving(true);
    try {
      const response = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: editingId ?? undefined,
          name: name.trim(),
          ...timing,
          priority: Number(priority) || 0,
          playlistId,
          deviceId: deviceId || undefined,
        }),
      });

      const payload = await readApiPayload<{ schedule: ScheduleSummary }>(response);
      if (!response.ok || !payload.schedule) {
        throw new Error(payload.error ?? `Could not save the schedule (${response.status}). Try again.`);
      }

      const nextSchedule = payload.schedule;
      setSchedules((current) => [
        nextSchedule,
        ...current.filter((s) => s.id !== nextSchedule.id),
      ]);
      setStatus({ ok: true, text: `Saved "${nextSchedule.label}". Screens pick it up within a minute.` });
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
        const payload = await readApiPayload(response);
        throw new Error(payload.error ?? `Could not delete the schedule (${response.status}). Try again.`);
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
    <div className={cn("grid gap-6", canEdit && "xl:grid-cols-[380px_1fr]")}>
      {canEdit ? (
      <Card className="h-fit xl:sticky xl:top-20">
        <CardHeader className="border-b">
          <CardTitle>
            {editingId ? "Edit schedule" : "Create schedule"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {editingId
              ? "Update the times, playlist, and screens, then save."
              : "Pick when it plays, which playlist, and on which screens."}
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

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium" id="schedule-kind-label">
              When
            </span>
            <div aria-labelledby="schedule-kind-label" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="group">
              {[
                { label: "Every week", value: true },
                { label: "One time", value: false },
              ].map((option) => (
                <Button
                  key={option.label}
                  aria-pressed={repeats === option.value}
                  className={cn("h-8", repeats === option.value && "bg-background shadow-xs hover:bg-background")}
                  onClick={() => setRepeats(option.value)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {repeats ? (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium" id="schedule-days-label">
                  Days
                </span>
                <div aria-labelledby="schedule-days-label" className="grid grid-cols-7 gap-1" role="group">
                  {WEEK_DAYS.map((day) => {
                    const on = days.includes(day);
                    return (
                      <Button
                        key={day}
                        aria-label={DAY_LONG[day]}
                        aria-pressed={on}
                        className="h-9 px-0"
                        onClick={() =>
                          setDays((current) => (on ? current.filter((value) => value !== day) : [...current, day]))
                        }
                        type="button"
                        variant={on ? "default" : "outline"}
                      >
                        {DAY_SHORT[day].slice(0, 2)}
                      </Button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {DAY_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      className="text-primary underline-offset-4 hover:underline"
                      onClick={() => setDays(preset.days)}
                      type="button"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "schedule-daily-start", label: "From", value: dailyStart, set: setDailyStart, fallback: DEFAULT_START_TIME },
                  { id: "schedule-daily-end", label: "Until", value: dailyEnd, set: setDailyEnd, fallback: DEFAULT_END_TIME },
                ].map((field) => (
                  <div key={field.id} className="flex flex-col gap-1.5">
                    <Label className="text-sm" htmlFor={field.id}>
                      {field.label}
                    </Label>
                    <Select
                      items={CLOCK_OPTION_ITEMS}
                      onValueChange={(value) => field.set(value ?? field.fallback)}
                      value={field.value}
                    >
                      <SelectTrigger id={field.id}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CLOCK_OPTION_ITEMS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {dailyStart === dailyEnd
                  ? "Plays all day on the chosen days. "
                  : timeToMinute(dailyEnd) < timeToMinute(dailyStart)
                    ? "Runs past midnight into the next day. "
                    : null}
                Times follow each screen&apos;s own time zone, and keep working when a screen is offline.
              </p>
            </>
          ) : (
            <>
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
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label className="text-sm" htmlFor="schedule-priority">Priority</Label>
            <p className="text-xs text-muted-foreground">
              When schedules overlap, the higher number plays. On a tie, a one-time schedule beats a weekly one.
            </p>
            <Select items={PRIORITY_OPTIONS} onValueChange={(value) => setPriority(value ?? "10")} value={priority}>
              <SelectTrigger id="schedule-priority">
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
            <Label className="text-sm" htmlFor="schedule-playlist">Playlist</Label>
            <Select
              disabled={!hasPlaylists}
              items={playlistOptions}
              onValueChange={(value) => setPlaylistId(value ?? "")}
              value={playlistId || null}
            >
              <SelectTrigger id="schedule-playlist">
                <SelectValue placeholder={hasPlaylists ? "Choose playlist" : "No playlists yet"} />
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
            <Label className="text-sm" htmlFor="schedule-screens">Screens</Label>
            <Select
              items={deviceOptions}
              onValueChange={(value) => setDeviceId(value === ALL_SCREENS_VALUE ? "" : value ?? "")}
              value={deviceId || ALL_SCREENS_VALUE}
            >
              <SelectTrigger id="schedule-screens">
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
            <p className="text-sm text-muted-foreground">
              A schedule needs a playlist to play.{" "}
              <Link className="text-primary underline underline-offset-4" href="/playlists">
                Make a playlist
              </Link>{" "}
              first, then come back.
            </p>
          ) : null}
        </CardContent>
      </Card>
      ) : null}

      <section className="flex min-w-0 flex-col gap-6">
        {needUpdate.length ? (
          <Alert>
            <AlertTitle>
              {needUpdate.length === 1
                ? `${needUpdate[0]!.name} needs a software update for weekly schedules`
                : `${needUpdate.length} screens need a software update for weekly schedules`}
            </AlertTitle>
            <AlertDescription>
              {needUpdate.length === 1 ? "It keeps" : `${needUpdate.map((device) => device.name).join(", ")} keep`} playing
              the default playlist during weekly schedules until updated. One-time schedules work as before.{" "}
              <Link className="underline underline-offset-4" href="/releases">
                Go to Releases
              </Link>
            </AlertDescription>
          </Alert>
        ) : null}
        <ScheduleWeekView
          windows={schedules}
          selectedId={editingId}
          onSelect={(id) => {
            const target = schedules.find((schedule) => schedule.id === id);
            if (target && canEdit) startEditing(target);
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
                          {state === "repeating" ? (
                            <Badge variant="info">
                              <Repeat aria-hidden />
                              Every week
                            </Badge>
                          ) : (
                            <Badge variant={state === "active" ? "success" : state === "upcoming" ? "info" : "secondary"}>
                              {state === "active" ? "Playing now" : state === "upcoming" ? "Upcoming" : "Ended"}
                            </Badge>
                          )}
                          <Badge variant="outline">Priority {window.priority}</Badge>
                        </div>
                      </div>
                      {canEdit ? (
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
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col">
                    <dl className="divide-y">
                      {[
                        { label: "Playlist", value: window.playlistName ?? "Unassigned" },
                        { label: "Screens", value: window.targetLabel },
                        ...(window.recurrence
                          ? [
                              { label: "Days", value: describeDays(window.recurrence.daysOfWeek) },
                              { label: "Time", value: describeTimes(window.recurrence) },
                            ]
                          : [
                              { label: "Starts", value: formatScheduleDateTime(window.startsAt) },
                              { label: "Ends", value: formatScheduleDateTime(window.endsAt) },
                            ]),
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-center justify-between gap-4 py-1.5 text-sm">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="truncate text-right">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    {overlaps.length ? (
                      <p
                        className={cn(
                          "mt-2 text-xs",
                          outranked || overlaps.some((other) => other.priority === window.priority)
                            ? "text-warning"
                            : "text-muted-foreground",
                        )}
                      >
                        {outranked
                          ? `Overlaps "${outranked.label}" (priority ${outranked.priority}), which plays instead while both are on.`
                          : overlaps.some((other) => other.priority === window.priority)
                            ? `Overlaps "${overlaps.find((other) => other.priority === window.priority)!.label}" at the same priority. Give one a higher priority to choose which plays.`
                            : `Overlaps ${overlaps.length} other schedule${overlaps.length === 1 ? "" : "s"}; this one wins on priority.`}
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
              {canEdit
                ? "No schedules yet. Every screen plays its default playlist all the time. Add a schedule to play something different at certain times of day."
                : "No schedules yet. Every screen plays its default playlist all the time."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
