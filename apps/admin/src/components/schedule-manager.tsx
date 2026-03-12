"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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
const MONTH_OPTIONS = [
  { label: "January", value: "01" },
  { label: "February", value: "02" },
  { label: "March", value: "03" },
  { label: "April", value: "04" },
  { label: "May", value: "05" },
  { label: "June", value: "06" },
  { label: "July", value: "07" },
  { label: "August", value: "08" },
  { label: "September", value: "09" },
  { label: "October", value: "10" },
  { label: "November", value: "11" },
  { label: "December", value: "12" },
];
const YEAR_OPTIONS = Array.from({ length: 7 }, (_, index) => {
  const year = String(new Date().getFullYear() - 1 + index);
  return { label: year, value: year };
});
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

function toLocalDateTime(value: string) {
  return value.slice(0, 16);
}

function toDateParts(value: string) {
  if (!value) {
    return { day: "", month: "", time: "09:00", year: YEAR_OPTIONS[1]?.value ?? String(new Date().getFullYear()) };
  }

  const local = toLocalDateTime(value);
  return {
    day: local.slice(8, 10),
    month: local.slice(5, 7),
    time: local.slice(11, 16),
    year: local.slice(0, 4),
  };
}

function toDateValue(parts: { day: string; month: string; year: string }) {
  if (!parts.year || !parts.month || !parts.day) {
    return "";
  }

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function clampDayForMonth(day: string, month: string, year: string) {
  if (!day || !month || !year) {
    return "";
  }

  const total = new Date(Number(year), Number(month), 0).getDate();
  return Number(day) > total ? "" : day;
}

function daysInMonth(year: string, month: string) {
  if (!year || !month) {
    return [];
  }

  const total = new Date(Number(year), Number(month), 0).getDate();
  return Array.from({ length: total }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return { label: day, value: day };
  });
}

function DateTimeField({
  day,
  id,
  label,
  month,
  onDayChange,
  onMonthChange,
  onTimeChange,
  onYearChange,
  time,
  year,
}: {
  day: string;
  id: string;
  label: string;
  month: string;
  onDayChange: (value: string) => void;
  onMonthChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onYearChange: (value: string) => void;
  time: string;
  year: string;
}) {
  const dayOptions = daysInMonth(year, month);
  const isDayDisabled = dayOptions.length === 0;

  return (
    <div className="grid gap-2">
      <Label className="text-[0.8rem] text-muted-foreground">{label}</Label>
      <div className="grid gap-2">
        <div className="grid gap-2 sm:grid-cols-[1.2fr_0.9fr_0.8fr]">
          <Select items={MONTH_OPTIONS} onValueChange={(value) => onMonthChange(value ?? "")} value={month || null}>
            <SelectTrigger>
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {MONTH_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            disabled={isDayDisabled}
            items={dayOptions}
            onValueChange={(value) => onDayChange(value ?? "")}
            value={day || null}
          >
            <SelectTrigger>
              <SelectValue placeholder={isDayDisabled ? "Pick month first" : "Day"} />
            </SelectTrigger>
            <SelectContent>
              {dayOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select items={YEAR_OPTIONS} onValueChange={(value) => onYearChange(value ?? "")} value={year || null}>
            <SelectTrigger>
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
  const [startMonth, setStartMonth] = useState("");
  const [startDay, setStartDay] = useState("");
  const [startYear, setStartYear] = useState(YEAR_OPTIONS[1]?.value ?? String(new Date().getFullYear()));
  const [startTime, setStartTime] = useState("09:00");
  const [endMonth, setEndMonth] = useState("");
  const [endDay, setEndDay] = useState("");
  const [endYear, setEndYear] = useState(YEAR_OPTIONS[1]?.value ?? String(new Date().getFullYear()));
  const [endTime, setEndTime] = useState("17:00");
  const [priority, setPriority] = useState("10");
  const [playlistId, setPlaylistId] = useState(playlists[0]?.id ?? "");
  const [deviceId, setDeviceId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  function handleStartMonthChange(value: string) {
    setStartMonth(value);
    setStartDay((current) => clampDayForMonth(current, value, startYear));
  }

  function handleStartYearChange(value: string) {
    setStartYear(value);
    setStartDay((current) => clampDayForMonth(current, startMonth, value));
  }

  function handleEndMonthChange(value: string) {
    setEndMonth(value);
    setEndDay((current) => clampDayForMonth(current, value, endYear));
  }

  function handleEndYearChange(value: string) {
    setEndYear(value);
    setEndDay((current) => clampDayForMonth(current, endMonth, value));
  }

  function startEditing(schedule: ScheduleSummary) {
    setEditingId(schedule.id);
    setName(schedule.label);
    setPriority(String(schedule.priority));
    setPlaylistId(schedule.playlistId ?? playlists[0]?.id ?? "");
    setDeviceId(schedule.targetDeviceId ?? "");

    const start = toDateParts(schedule.startsAt);
    const end = toDateParts(schedule.endsAt);
    setStartYear(start.year);
    setStartMonth(start.month);
    setStartDay(start.day);
    setStartTime(start.time);
    setEndYear(end.year);
    setEndMonth(end.month);
    setEndDay(end.day);
    setEndTime(end.time);
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
    setStartMonth("");
    setStartDay("");
    setEndMonth("");
    setEndDay("");
    setStartTime("09:00");
    setEndTime("17:00");
    setPriority("10");
    setDeviceId("");
  }

  async function handleSave() {
    const startDate = toDateValue({ day: startDay, month: startMonth, year: startYear });
    const endDate = toDateValue({ day: endDay, month: endMonth, year: endYear });

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
      <Card className="border border-border/70 bg-card/95">
        <CardHeader className="border-b border-border/60">
          <CardTitle className="text-[0.92rem] font-semibold">
            {editingId ? "Edit schedule" : "Create schedule"}
          </CardTitle>
          <p className="text-[0.78rem] text-muted-foreground">
            {editingId
              ? "Update the window, playlist, and target, then save."
              : "Set a time window, assign a playlist, and choose a target."}
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
            day={startDay}
            id="schedule-start"
            label="Starts"
            month={startMonth}
            onDayChange={setStartDay}
            onMonthChange={handleStartMonthChange}
            onTimeChange={setStartTime}
            onYearChange={handleStartYearChange}
            time={startTime}
            year={startYear}
          />

          <DateTimeField
            day={endDay}
            id="schedule-end"
            label="Ends"
            month={endMonth}
            onDayChange={setEndDay}
            onMonthChange={handleEndMonthChange}
            onTimeChange={setEndTime}
            onYearChange={handleEndYearChange}
            time={endTime}
            year={endYear}
          />

          <div className="flex flex-col gap-1.5">
            <Label className="text-[0.8rem] text-muted-foreground">Priority</Label>
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
            <Label className="text-[0.8rem] text-muted-foreground">Playlist</Label>
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
            <p className={cn("text-[0.8rem] font-mono", status.ok ? "text-primary" : "text-destructive")}>
              {status.text}
            </p>
          ) : !hasPlaylists ? (
            <p className="text-[0.8rem] font-mono text-muted-foreground">
              Create a playlist before building a schedule.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <section>
        {schedules.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            {schedules.map((window) => {
              const starts = toDateParts(window.startsAt);
              const ends = toDateParts(window.endsAt);
              return (
                <Card
                  key={window.id}
                  className={cn(
                    "border bg-card/95 transition-colors",
                    editingId === window.id
                      ? "border-primary/50 bg-primary/5"
                      : "border-border/70",
                  )}
                >
                  <CardHeader className="border-b border-border/60 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <CardTitle className="truncate text-[0.88rem] font-semibold">
                            {window.label}
                          </CardTitle>
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-[0.7rem] text-muted-foreground">
                            P{window.priority}
                          </span>
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
                          className={confirmDeleteId === window.id ? "border-destructive/30 text-destructive hover:bg-destructive/10" : ""}
                          disabled={deleting}
                          onClick={() => void handleDelete(window.id)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          {confirmDeleteId === window.id ? "Confirm?" : "Delete"}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="divide-y divide-border/60 pt-1">
                    {[
                      { label: "Playlist", value: window.playlistName ?? "Unassigned" },
                      { label: "Target", value: window.targetLabel },
                      { label: "Starts", value: `${starts.year}-${starts.month}-${starts.day} ${starts.time}` },
                      { label: "Ends", value: `${ends.year}-${ends.month}-${ends.day} ${ends.time}` },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between gap-4 py-2 text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-mono text-[0.8rem] text-foreground">{value}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/80 bg-muted/10 p-6 text-center">
            <p className="text-[0.85rem] text-muted-foreground">No schedules yet. Create one on the left.</p>
          </div>
        )}
      </section>
    </div>
  );
}
