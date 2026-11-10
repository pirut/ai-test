import assert from "node:assert/strict";
import test from "node:test";

import {
  type DeviceManifest,
  chooseActiveScheduleWindow,
  deviceManifestSchema,
  heartbeatPayloadSchema,
  localClock,
  recurringWindowInstant,
} from "@showroom/contracts";
import { choosePlaylistId } from "../apps/player/src/player-app";
import { savedContent } from "../apps/admin/src/lib/device-health";
import {
  describeDays,
  describeTimes,
  formatMinute,
  minuteToTime,
  recurrencesOverlap,
  timeToMinute,
} from "../apps/admin/src/lib/schedule-format";

type Window = DeviceManifest["scheduleWindows"][number];

function repeating(id: string, priority: number, daysOfWeek: number[], startMinute: number, endMinute: number): Window {
  return {
    id,
    label: id,
    playlistId: id,
    priority,
    startsAt: recurringWindowInstant,
    endsAt: recurringWindowInstant,
    recurrence: { daysOfWeek, startMinute, endMinute },
    playlist: [
      { id, assetId: id, assetType: "image", sourceType: "upload", title: id, url: `/assets/${id}.jpg`, checksum: id },
    ],
  };
}

function manifest(...scheduleWindows: Window[]): DeviceManifest {
  return {
    manifestVersion: "v1",
    deviceId: "device-1",
    generatedAt: "2026-11-01T00:00:00.000Z",
    timezone: "America/New_York",
    orientation: 0,
    volume: 0,
    defaultPlaylistId: "default",
    defaultPlaylist: [],
    scheduleWindows,
    assetBaseUrl: "",
    assetChecksums: {},
  };
}

const playingAt = (value: DeviceManifest, at: string) => choosePlaylistId(value, Date.parse(at));
const everyDay = [0, 1, 2, 3, 4, 5, 6];

// The cases below mirror apps/agent/internal/local/schedule_test.go: the web
// player and the agent must pick the same playlist at the same moment.
test("a weekly schedule follows the screen's time zone, through daylight saving", () => {
  const value = manifest(repeating("open-hours", 10, [1, 2, 3, 4, 5], 9 * 60, 17 * 60));
  for (const [at, want] of [
    ["2026-11-10T13:59:00Z", "default"],
    ["2026-11-10T14:00:00Z", "open-hours"],
    ["2026-11-10T21:59:00Z", "open-hours"],
    ["2026-11-10T22:00:00Z", "default"],
    ["2026-11-14T17:00:00Z", "default"],
    ["2027-07-06T13:00:00Z", "open-hours"],
    ["2027-07-06T12:59:00Z", "default"],
  ] as const) {
    assert.equal(playingAt(value, at), want, at);
  }
});

test("a weekly schedule past midnight belongs to the day it starts on", () => {
  const value = manifest(repeating("late", 10, [5], 22 * 60, 2 * 60));
  for (const [at, want] of [
    ["2026-11-14T03:30:00Z", "late"],
    ["2026-11-14T06:30:00Z", "late"],
    ["2026-11-14T07:00:00Z", "default"],
    ["2026-11-13T06:30:00Z", "default"],
    ["2026-11-15T03:30:00Z", "default"],
  ] as const) {
    assert.equal(playingAt(value, at), want, at);
  }
});

test("equal start and end is all day", () => {
  const value = manifest(repeating("weekend", 10, [0, 6], 0, 0));
  assert.equal(playingAt(value, "2026-11-14T15:00:00Z"), "weekend");
  assert.equal(playingAt(value, "2026-11-16T15:00:00Z"), "default");
});

test("priority wins, then a dated window, then the earlier one", () => {
  const dated: Window = {
    ...repeating("sale", 10, everyDay, 0, 0),
    startsAt: "2026-11-10T00:00:00.000Z",
    endsAt: "2026-11-11T00:00:00.000Z",
    recurrence: undefined,
  };
  const at = "2026-11-10T15:00:00Z";
  assert.equal(playingAt(manifest(repeating("daily", 10, everyDay, 0, 0), dated), at), "sale");
  assert.equal(playingAt(manifest(repeating("daily", 20, everyDay, 0, 0), dated), at), "daily");
  assert.equal(
    playingAt(manifest(repeating("first", 10, everyDay, 0, 0), repeating("second", 10, everyDay, 0, 0)), at),
    "first",
  );
});

test("schedules wait while the clock is behind the manifest", () => {
  const value = manifest(repeating("always", 10, everyDay, 0, 0));
  assert.equal(playingAt(value, "2026-11-10T15:00:00Z"), "always");
  assert.equal(playingAt(value, "2025-01-01T00:00:00Z"), "default");
});

test("an unknown time zone reads as UTC", () => {
  const value = { ...manifest(repeating("morning", 10, [2], 9 * 60, 10 * 60)), timezone: "Not/AZone" };
  assert.equal(playingAt(value, "2026-11-10T09:30:00Z"), "morning");
  assert.deepEqual(localClock(Date.parse("2026-11-10T00:05:00Z"), "UTC"), { day: 2, minute: 5 });
});

test("screens that predate weekly schedules never play one", () => {
  // They read only startsAt and endsAt, which is all this check uses.
  const [window] = manifest(repeating("open-hours", 10, everyDay, 0, 0)).scheduleWindows;
  const legacy = { ...window!, recurrence: undefined };
  assert.equal(chooseActiveScheduleWindow({ timezone: "UTC", scheduleWindows: [legacy] }, Date.now()), undefined);
});

test("the manifest keeps a weekly schedule and drops a malformed one without failing", () => {
  const value = manifest(repeating("open-hours", 10, [1], 60, 120));
  assert.deepEqual(deviceManifestSchema.parse(value).scheduleWindows[0]?.recurrence, {
    daysOfWeek: [1],
    startMinute: 60,
    endMinute: 120,
  });
  const broken = structuredClone(value) as unknown as { scheduleWindows: Array<{ recurrence: unknown }> };
  broken.scheduleWindows[0]!.recurrence = { daysOfWeek: [9], startMinute: -1, endMinute: 5000 };
  assert.equal(deviceManifestSchema.parse(broken).scheduleWindows[0]?.recurrence, undefined);
});

test("heartbeats carry how much content is saved on the screen", () => {
  const parsed = heartbeatPayloadSchema.parse({
    deviceId: "device-1",
    appVersion: "1",
    agentVersion: "1",
    uptimeSeconds: 1,
    storageFreeBytes: 1,
    storageTotalBytes: 2,
    lastSeenAt: "2026-11-10T15:00:00.000Z",
    sync: { lastSyncAt: "2026-11-10T15:00:00Z", lastError: "", savedItems: 7, totalItems: 8, repeatingSchedules: true },
  });
  assert.equal(parsed.sync?.savedItems, 7);
  assert.equal(parsed.sync?.totalItems, 8);
  assert.equal(parsed.sync?.repeatingSchedules, true);
});

test("saved content is described for the screen page", () => {
  assert.equal(savedContent({ savedItems: 8, totalItems: 8 }).value, "All 8 items saved");
  assert.equal(savedContent({ savedItems: 8, totalItems: 8 }).tone, "good");
  assert.equal(savedContent({ savedItems: 5, totalItems: 8 }).value, "5 of 8 items saved");
  assert.equal(savedContent({ savedItems: 5, totalItems: 8 }).tone, "warn");
  assert.equal(savedContent({ savedItems: 1, totalItems: 1 }).value, "1 item saved");
  assert.equal(savedContent({ savedItems: 0, totalItems: 0 }).tone, "unknown");
  assert.equal(savedContent({}).value, "Unknown");
});

test("weekly schedules are described in plain words", () => {
  assert.equal(describeDays([1, 2, 3, 4, 5]), "Weekdays");
  assert.equal(describeDays([0, 6]), "Weekends");
  assert.equal(describeDays(everyDay), "Every day");
  assert.equal(describeDays([0, 1, 3]), "Mon, Wed, Sun");
  assert.equal(describeTimes({ startMinute: 540, endMinute: 1020 }), "9:00 AM – 5:00 PM");
  assert.equal(describeTimes({ startMinute: 1320, endMinute: 120 }), "10:00 PM – 2:00 AM next day");
  assert.equal(describeTimes({ startMinute: 0, endMinute: 0 }), "All day");
  assert.equal(formatMinute(0), "12:00 AM");
  assert.equal(formatMinute(750), "12:30 PM");
  assert.equal(timeToMinute("09:30"), 570);
  assert.equal(minuteToTime(570), "09:30");
});

test("overlap between weekly schedules is found across midnight and the week's end", () => {
  const rule = (daysOfWeek: number[], startMinute: number, endMinute: number) => ({ daysOfWeek, startMinute, endMinute });
  assert.equal(recurrencesOverlap(rule([1], 540, 720), rule([1], 660, 780)), true);
  assert.equal(recurrencesOverlap(rule([1], 540, 720), rule([1], 720, 780)), false);
  assert.equal(recurrencesOverlap(rule([1], 540, 720), rule([2], 540, 720)), false);
  // Friday 22:00 to 02:00 meets Saturday 01:00 to 03:00.
  assert.equal(recurrencesOverlap(rule([5], 1320, 120), rule([6], 60, 180)), true);
  // Saturday 22:00 to 02:00 meets Sunday 01:00 to 03:00, across the week's end.
  assert.equal(recurrencesOverlap(rule([6], 1320, 120), rule([0], 60, 180)), true);
  assert.equal(recurrencesOverlap(rule([6], 1320, 120), rule([0], 120, 180)), false);
});
