import assert from "node:assert/strict";
import test from "node:test";

import {
  composeAlertEmail,
  detectUnexpectedRestarts,
  formatDuration,
  formatUptimePercent,
  parseAlertRecipients,
  summarizeDeviceHealth,
  summarizeFleetHealth,
} from "@showroom/contracts";

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;
const now = Date.parse("2026-11-10T12:00:00.000Z");

test("a steady screen reports no restarts", () => {
  assert.deepEqual(
    detectUnexpectedRestarts({
      now,
      previousHeartbeatAt: now - 30_000,
      previousUptimeSeconds: 600,
      uptimeSeconds: 630,
      previousPlayerRestarts: 2,
      playerRestarts: 2,
    }),
    [],
  );
});

test("a player restart counter that steps up is a player crash", () => {
  assert.deepEqual(
    detectUnexpectedRestarts({
      now,
      previousHeartbeatAt: now - 30_000,
      previousUptimeSeconds: 600,
      uptimeSeconds: 630,
      previousPlayerRestarts: 2,
      playerRestarts: 4,
    }),
    [{ component: "player", count: 2 }],
  );
});

test("agent uptime going backwards is an agent restart, also on screens with no health report", () => {
  assert.deepEqual(
    detectUnexpectedRestarts({
      now,
      previousHeartbeatAt: now - 40_000,
      previousUptimeSeconds: 86_400,
      uptimeSeconds: 12,
    }),
    [{ component: "agent", count: 1 }],
  );
});

test("an agent that dies right after every start is still caught", () => {
  const reading = { now, previousHeartbeatAt: now - 40_000, previousUptimeSeconds: 1, uptimeSeconds: 1 };
  assert.deepEqual(detectUnexpectedRestarts(reading), [{ component: "agent", count: 1 }]);
  // The same second reported twice in quick succession is not a restart.
  assert.deepEqual(detectUnexpectedRestarts({ ...reading, previousHeartbeatAt: now - 500 }), []);
});

test("a restart someone asked for is not a crash", () => {
  const reading = {
    now,
    previousHeartbeatAt: now - 40_000,
    previousUptimeSeconds: 86_400,
    uptimeSeconds: 12,
  };
  assert.deepEqual(
    detectUnexpectedRestarts({
      ...reading,
      recentCommands: [{ commandType: "reboot_device", queuedAt: now - 2 * minute, completedAt: now - minute }],
    }),
    [],
  );
  // An update that is still downloading was queued a long time ago.
  assert.deepEqual(
    detectUnexpectedRestarts({
      ...reading,
      recentCommands: [{ commandType: "update_release", queuedAt: now - 3 * hour, pending: true }],
    }),
    [],
  );
  // Old or unrelated commands do not excuse it.
  assert.equal(
    detectUnexpectedRestarts({
      ...reading,
      recentCommands: [
        { commandType: "reboot_device", queuedAt: now - 2 * hour, completedAt: now - 2 * hour },
        { commandType: "take_screenshot", queuedAt: now - minute, completedAt: now - minute },
      ],
    }).length,
    1,
  );
});

test("a restart after a gap is left to the outage record", () => {
  assert.deepEqual(
    detectUnexpectedRestarts({
      now,
      previousHeartbeatAt: now - 9 * hour,
      previousUptimeSeconds: 86_400,
      uptimeSeconds: 20,
      previousPlayerRestarts: 0,
      playerRestarts: 1,
    }),
    [],
  );
  // The first heartbeat ever seen has nothing to compare against.
  assert.deepEqual(detectUnexpectedRestarts({ now, uptimeSeconds: 5 }), []);
});

test("uptime counts outages inside the window and clips the ones that straddle it", () => {
  const windowStart = now - 7 * day;
  const summary = summarizeDeviceHealth({
    now,
    windowStart,
    trackedSince: now - 30 * day,
    events: [
      // Started before the window: only the part inside counts.
      { alertType: "offline", openedAt: windowStart - 5 * hour, resolvedAt: windowStart + 2 * hour },
      { alertType: "offline", openedAt: now - 2 * day, resolvedAt: now - 2 * day + 5 * hour },
      // Still down.
      { alertType: "offline", openedAt: now - hour, resolvedAt: null },
      { alertType: "crash", openedAt: now - day, resolvedAt: now - day, count: 2 },
    ],
  });
  assert.equal(summary.downMs, 8 * hour);
  assert.equal(summary.outages, 3);
  assert.equal(summary.restarts, 2);
  assert.equal(summary.offlineSince, now - hour);
  assert.ok(Math.abs(summary.uptimePercent! - (1 - 8 / 168) * 100) < 1e-9);
});

test("a screen paired mid-week is only judged on the time it was watched", () => {
  const summary = summarizeDeviceHealth({
    now,
    windowStart: now - 7 * day,
    trackedSince: now - day,
    events: [{ alertType: "offline", openedAt: now - 6 * hour, resolvedAt: now - 3 * hour }],
  });
  assert.equal(summary.trackedMs, day);
  assert.equal(summary.uptimePercent, 87.5);
});

test("a screen that was dark before monitoring began counts as down, and an unseen one has no figure", () => {
  const dark = summarizeDeviceHealth({
    now,
    windowStart: now - 7 * day,
    events: [{ alertType: "offline", openedAt: now - 20 * day, resolvedAt: null }],
  });
  assert.equal(dark.uptimePercent, 0);
  assert.equal(dark.offlineSince, now - 20 * day);

  const unseen = summarizeDeviceHealth({ now, windowStart: now - 7 * day, events: [] });
  assert.equal(unseen.uptimePercent, null);
  assert.equal(unseen.trackedMs, 0);
});

test("overlapping outage records are not counted twice", () => {
  const summary = summarizeDeviceHealth({
    now,
    windowStart: now - 7 * day,
    trackedSince: now - 7 * day,
    events: [
      { alertType: "offline", openedAt: now - 4 * hour, resolvedAt: now - 2 * hour },
      { alertType: "offline", openedAt: now - 3 * hour, resolvedAt: now - hour },
    ],
  });
  assert.equal(summary.downMs, 3 * hour);
});

test("a crash loop adds the restarts folded into it and flags the screen while open", () => {
  const summary = summarizeDeviceHealth({
    now,
    windowStart: now - 7 * day,
    trackedSince: now - 7 * day,
    events: [
      { alertType: "crash", openedAt: now - 20 * minute, resolvedAt: now - 20 * minute, count: 1 },
      { alertType: "crash", openedAt: now - 15 * minute, resolvedAt: now - 15 * minute, count: 1 },
      { alertType: "crash", openedAt: now - 10 * minute, resolvedAt: now - 10 * minute, count: 1 },
      { alertType: "crash_loop", openedAt: now - 10 * minute, resolvedAt: null, count: 4 },
    ],
  });
  assert.equal(summary.restarts, 7);
  assert.equal(summary.crashLooping, true);
  assert.equal(summary.uptimePercent, 100);
});

test("fleet uptime weighs screens by how long they were watched", () => {
  const week = summarizeDeviceHealth({ now, windowStart: now - 7 * day, trackedSince: now - 7 * day, events: [] });
  const newcomer = summarizeDeviceHealth({
    now,
    windowStart: now - 7 * day,
    trackedSince: now - day,
    events: [{ alertType: "offline", openedAt: now - 12 * hour, resolvedAt: null }],
  });
  const fleet = summarizeFleetHealth([week, newcomer]);
  assert.equal(fleet.outages, 1);
  assert.ok(Math.abs(fleet.uptimePercent! - (1 - 12 / (8 * 24)) * 100) < 1e-9);
  assert.equal(summarizeFleetHealth([]).uptimePercent, null);
});

test("uptime never rounds downtime up to a clean 100%", () => {
  assert.equal(formatUptimePercent(100), "100%");
  assert.equal(formatUptimePercent(99.999), "99.99%");
  assert.equal(formatUptimePercent(99.86), "99.86%");
  assert.equal(formatUptimePercent(87.52), "87.5%");
  assert.equal(formatUptimePercent(null), "No data yet");
});

test("durations read naturally", () => {
  assert.equal(formatDuration(20_000), "1 minute");
  assert.equal(formatDuration(12 * minute), "12 minutes");
  assert.equal(formatDuration(95 * minute), "1 hr 35 min");
  assert.equal(formatDuration(9 * hour + 10 * minute), "9 hours");
  assert.equal(formatDuration(3 * day), "3 days");
});

test("recipients are split, lowercased, de-duplicated and checked", () => {
  assert.deepEqual(parseAlertRecipients("JR@Example.com, ops@example.com\njr@example.com; nope"), {
    valid: ["jr@example.com", "ops@example.com"],
    invalid: ["nope"],
  });
  assert.deepEqual(parseAlertRecipients(["a@b.co", "bad@", "<x@y.z>"]).invalid, ["bad@", "<x@y.z>"]);
  assert.deepEqual(parseAlertRecipients("  "), { valid: [], invalid: [] });
});

test("one screen offline makes a short, specific email", () => {
  const email = composeAlertEmail({
    now,
    workspaceName: "Chelsea",
    dashboardUrl: "https://example.com/dashboard",
    offline: [{ name: "Front Window", siteName: "Chelsea showroom", since: now - 12 * minute }],
    crashLooping: [],
    recovered: [],
  });
  assert.equal(email.subject, "Front Window is offline · Chelsea");
  assert.match(email.text, /Front Window \(Chelsea showroom\): no check-in for 12 minutes/);
  assert.match(email.text, /https:\/\/example\.com\/dashboard/);
  assert.match(email.html, /Open the dashboard/);
});

test("a site-wide outage is one email naming every screen", () => {
  const email = composeAlertEmail({
    now,
    offline: [
      { name: "A", since: now - 10 * minute },
      { name: "B", since: now - 11 * minute },
    ],
    crashLooping: [{ name: "C", restarts: 3 }],
    recovered: [{ name: "D", kind: "offline", downMs: 45 * minute }],
  });
  assert.equal(email.subject, "3 screens need attention");
  for (const line of ["- A: no check-in", "- B: no check-in", "- C: 3 unexpected restarts", "- D: back online after 45 minutes"]) {
    assert.ok(email.text.includes(line), line);
  }
  // No link when the site address is not configured.
  assert.doesNotMatch(email.html, /href=/);
});

test("recovery emails say what came back, and screen names cannot inject markup", () => {
  const back = composeAlertEmail({
    now,
    offline: [],
    crashLooping: [],
    recovered: [{ name: "Lobby <b>TV</b>", kind: "crash_loop" }],
  });
  assert.equal(back.subject, "Lobby <b>TV</b> is back");
  assert.match(back.text, /stopped restarting/);
  assert.doesNotMatch(back.html, /<b>TV<\/b>/);
});
