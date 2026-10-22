"use client";

import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type WeekViewWindow = {
  id: string;
  label: string;
  startsAt: string;
  endsAt: string;
  priority: number;
  playlistId: string | null;
  playlistName: string | null;
  targetLabel: string;
};

const HOUR_PX = 22;
const DAY_MS = 86_400_000;
// Distinct hues that stay readable on both light and dark cards.
const PALETTE = [
  "bg-blue-500/20 border-blue-500/60 text-blue-900 dark:text-blue-100",
  "bg-emerald-500/20 border-emerald-500/60 text-emerald-900 dark:text-emerald-100",
  "bg-amber-500/20 border-amber-500/60 text-amber-900 dark:text-amber-100",
  "bg-violet-500/20 border-violet-500/60 text-violet-900 dark:text-violet-100",
  "bg-rose-500/20 border-rose-500/60 text-rose-900 dark:text-rose-100",
  "bg-cyan-500/20 border-cyan-500/60 text-cyan-900 dark:text-cyan-100",
];

type Segment = {
  window: WeekViewWindow;
  day: number;
  top: number;
  height: number;
  lane: number;
  lanes: number;
};

/** Splits each window into per-day segments for the visible week and packs overlaps into side-by-side lanes. */
function layoutWeek(windows: WeekViewWindow[], weekStart: Date) {
  const segments: Segment[] = [];
  for (let day = 0; day < 7; day += 1) {
    const dayStart = addDays(weekStart, day).getTime();
    const dayEnd = dayStart + DAY_MS;
    const daySegments = windows
      .map((window) => {
        const start = Math.max(Date.parse(window.startsAt), dayStart);
        const end = Math.min(Date.parse(window.endsAt), dayEnd);
        return end > start ? { window, start, end } : null;
      })
      .filter((value): value is NonNullable<typeof value> => value !== null)
      .sort((a, b) => a.start - b.start || b.window.priority - a.window.priority);

    // Greedy lane packing, then widen each cluster of overlapping segments to its lane count.
    const laneEnds: number[] = [];
    const placed = daySegments.map((segment) => {
      let lane = laneEnds.findIndex((end) => end <= segment.start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = segment.end;
      return { ...segment, lane };
    });
    for (const segment of placed) {
      const overlapping = placed.filter((other) => other.start < segment.end && segment.start < other.end);
      segments.push({
        window: segment.window,
        day,
        top: ((segment.start - dayStart) / 3_600_000) * HOUR_PX,
        height: Math.max(((segment.end - segment.start) / 3_600_000) * HOUR_PX, 14),
        lane: segment.lane,
        lanes: Math.max(...overlapping.map((other) => other.lane)) + 1,
      });
    }
  }
  return segments;
}

export function ScheduleWeekView({
  windows,
  onSelect,
  selectedId,
}: {
  windows: WeekViewWindow[];
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const colorFor = useMemo(() => {
    const ids = [...new Set(windows.map((window) => window.playlistId ?? window.id))];
    return (window: WeekViewWindow) => PALETTE[ids.indexOf(window.playlistId ?? window.id) % PALETTE.length];
  }, [windows]);

  const segments = useMemo(() => layoutWeek(windows, weekStart), [windows, weekStart]);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const weekEnd = addDays(weekStart, 7);
  const inWeek = windows.filter(
    (window) => Date.parse(window.startsAt) < weekEnd.getTime() && Date.parse(window.endsAt) > weekStart.getTime(),
  ).length;

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>
          {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}
        </CardTitle>
        <CardDescription>
          {inWeek
            ? "Side-by-side blocks overlap; the higher priority plays. Empty time plays each screen's default playlist."
            : "No schedules this week. Screens play their default playlist."}
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          <Button aria-label="Previous week" size="icon-sm" variant="ghost" onClick={() => setWeekStart((value) => addDays(value, -7))}>
            <ChevronLeft />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            Today
          </Button>
          <Button aria-label="Next week" size="icon-sm" variant="ghost" onClick={() => setWeekStart((value) => addDays(value, 7))}>
            <ChevronRight />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-[3rem_repeat(7,minmax(0,1fr))]">
          <div />
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={cn(
                "pb-2 text-center text-xs font-medium text-muted-foreground",
                now && isSameDay(day, now) && "text-primary",
              )}
            >
              {format(day, "EEE d")}
            </div>
          ))}

          <div className="relative" style={{ height: HOUR_PX * 24 }}>
            {Array.from({ length: 24 }, (_, hour) =>
              hour % 3 === 0 ? (
                <span
                  key={hour}
                  className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
                  style={{ top: hour * HOUR_PX }}
                >
                  {format(new Date(2000, 0, 1, hour), "ha")}
                </span>
              ) : null,
            )}
          </div>

          {days.map((day, dayIndex) => (
            <div
              key={day.toISOString()}
              className="relative border-l"
              style={{
                height: HOUR_PX * 24,
                backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${HOUR_PX * 3}px)`,
              }}
            >
              {segments
                .filter((segment) => segment.day === dayIndex)
                .map((segment) => (
                  <button
                    key={`${segment.window.id}-${dayIndex}`}
                    type="button"
                    onClick={() => onSelect?.(segment.window.id)}
                    title={`${segment.window.label} · ${segment.window.playlistName ?? "No playlist"} · ${segment.window.targetLabel} · P${segment.window.priority}`}
                    className={cn(
                      "absolute overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[11px] leading-tight transition-shadow hover:shadow-md",
                      colorFor(segment.window),
                      selectedId === segment.window.id && "ring-2 ring-ring",
                    )}
                    style={{
                      top: segment.top,
                      height: segment.height,
                      left: `calc(${(segment.lane / segment.lanes) * 100}% + 2px)`,
                      width: `calc(${100 / segment.lanes}% - 4px)`,
                    }}
                  >
                    <span className="block truncate font-medium">{segment.window.label}</span>
                    {segment.height > 30 ? (
                      <span className="block truncate opacity-80">
                        {segment.window.playlistName ?? "No playlist"} · P{segment.window.priority}
                      </span>
                    ) : null}
                  </button>
                ))}
              {now && isSameDay(day, now) ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-danger"
                  style={{ top: ((now.getTime() - day.getTime()) / 3_600_000) * HOUR_PX }}
                />
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
