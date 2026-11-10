// Fleet health: when a screen counts as down, what counts as an unexpected
// restart, how uptime is worked out, and what an alert email says. Everything
// here is derived on the server from heartbeats screens already send, so no
// screen needs new software.

/** A screen with no check-in for this long is offline (same as the dashboard pill). */
export const offlineAfterMs = 5 * 60_000;
/** Screens found offline for longer than this when monitoring starts are recorded without an email. */
export const offlineBackfillMs = 60 * 60_000;
/** Default wait before an outage is emailed, so a short network blip stays quiet. */
export const defaultNotifyAfterSeconds = 10 * 60;
export const notifyAfterSecondsChoices = [5 * 60, 10 * 60, 30 * 60, 60 * 60] as const;
/** This many unexpected restarts inside the window is a crash loop. */
export const crashLoopThreshold = 3;
export const crashLoopWindowMs = 30 * 60_000;
/** A restart this soon after an operator asked for one is expected. */
export const expectedRestartWindowMs = 15 * 60_000;
export const healthWindowDays = 7;
export const maxAlertRecipients = 10;

export type AlertType = "offline" | "crash" | "crash_loop";
export type RestartComponent = "player" | "agent";

const restartingCommandTypes = new Set(["restart_player", "reboot_device", "update_release", "update_network"]);

/**
 * Compares two consecutive heartbeats from one screen and reports software
 * that restarted without anyone asking. A reboot or a power cut shows up as an
 * outage instead, because the screen misses check-ins while it is down.
 */
export function detectUnexpectedRestarts(input: {
  now: number;
  previousHeartbeatAt?: number | null;
  previousUptimeSeconds?: number | null;
  uptimeSeconds?: unknown;
  previousPlayerRestarts?: unknown;
  playerRestarts?: unknown;
  /** Commands sent to the screen lately, newest first. */
  recentCommands?: Array<{ commandType: string; queuedAt: number; completedAt?: number | null; pending?: boolean }>;
}): Array<{ component: RestartComponent; count: number }> {
  const restarts: Array<{ component: RestartComponent; count: number }> = [];
  const previousAt = input.previousHeartbeatAt;
  // After a gap there is no telling a crash from someone unplugging the
  // screen overnight; the outage record covers it.
  if (!previousAt || input.now - previousAt >= offlineAfterMs) return restarts;

  const expected = (input.recentCommands ?? []).some(
    (command) =>
      restartingCommandTypes.has(command.commandType) &&
      // An update can take a while to download before it restarts anything.
      (command.pending || input.now - Math.max(command.queuedAt, command.completedAt ?? 0) <= expectedRestartWindowMs),
  );
  if (expected) return restarts;

  // The agent only restarts the player itself after the player stopped
  // responding, so every step of this counter is a player crash or hang.
  if (
    typeof input.playerRestarts === "number" &&
    typeof input.previousPlayerRestarts === "number" &&
    input.playerRestarts > input.previousPlayerRestarts
  ) {
    restarts.push({ component: "player", count: input.playerRestarts - input.previousPlayerRestarts });
  }

  // uptimeSeconds counts from when the agent process started, so it only
  // fails to move forward when the agent itself was restarted. "Not forward"
  // rather than "backwards" catches an agent that dies seconds after every
  // start and so reports the same small uptime each time.
  if (
    typeof input.uptimeSeconds === "number" &&
    typeof input.previousUptimeSeconds === "number" &&
    (input.uptimeSeconds < input.previousUptimeSeconds ||
      (input.uptimeSeconds === input.previousUptimeSeconds && input.now - previousAt >= 5_000))
  ) {
    restarts.push({ component: "agent", count: 1 });
  }
  return restarts;
}

export type HealthEvent = {
  alertType: string;
  openedAt: number;
  resolvedAt?: number | null;
  /** Restarts this record stands for. A crash is at least 1; a crash loop holds the ones folded into it after it opened. */
  count?: number | null;
};

export type DeviceHealthSummary = {
  /** null until the screen has been watched for any time at all. */
  uptimePercent: number | null;
  trackedMs: number;
  downMs: number;
  outages: number;
  restarts: number;
  offlineSince: number | null;
  crashLooping: boolean;
};

/**
 * Uptime for one screen over a window. Time before the screen was first
 * watched is left out rather than counted as up, so a screen paired yesterday
 * is not credited with a perfect week.
 */
export function summarizeDeviceHealth(input: {
  now: number;
  windowStart: number;
  trackedSince?: number | null;
  events: HealthEvent[];
}): DeviceHealthSummary {
  const { now, windowStart } = input;
  const outages = input.events.filter((event) => event.alertType === "offline");
  const earliestOutage = outages.reduce<number | null>(
    (earliest, event) => (earliest === null || event.openedAt < earliest ? event.openedAt : earliest),
    null,
  );
  const known = [input.trackedSince ?? null, earliestOutage].filter((value): value is number => value !== null);
  const start = known.length ? Math.max(windowStart, Math.min(...known)) : null;

  let downMs = 0;
  let outageCount = 0;
  let offlineSince: number | null = null;
  if (start !== null) {
    // Merge overlaps so two records for the same stretch are not counted twice.
    const spans = outages
      .map((event) => [Math.max(event.openedAt, start), Math.min(event.resolvedAt ?? now, now)] as const)
      .filter(([from, to]) => to > from)
      .sort((a, b) => a[0] - b[0]);
    let cursor = start;
    for (const [from, to] of spans) {
      const clippedFrom = Math.max(from, cursor);
      if (to > clippedFrom) {
        downMs += to - clippedFrom;
        cursor = to;
      }
    }
    outageCount = spans.length;
  }
  for (const event of outages) {
    if (event.resolvedAt == null) offlineSince = Math.min(offlineSince ?? event.openedAt, event.openedAt);
  }

  const restarts = input.events
    .filter((event) => (event.alertType === "crash" || event.alertType === "crash_loop") && (event.resolvedAt ?? now) >= windowStart)
    .reduce((total, event) => total + (event.alertType === "crash" ? Math.max(1, event.count ?? 1) : Math.max(0, event.count ?? 0)), 0);
  const trackedMs = start === null ? 0 : Math.max(0, now - start);

  return {
    uptimePercent: trackedMs > 0 ? Math.max(0, Math.min(100, (1 - downMs / trackedMs) * 100)) : null,
    trackedMs,
    downMs,
    outages: outageCount,
    restarts,
    offlineSince,
    crashLooping: input.events.some((event) => event.alertType === "crash_loop" && event.resolvedAt == null),
  };
}

/** Fleet uptime weighs each screen by how long it has been watched. */
export function summarizeFleetHealth(devices: DeviceHealthSummary[]) {
  const trackedMs = devices.reduce((total, device) => total + device.trackedMs, 0);
  const downMs = devices.reduce((total, device) => total + device.downMs, 0);
  return {
    uptimePercent: trackedMs > 0 ? Math.max(0, (1 - downMs / trackedMs) * 100) : null,
    outages: devices.reduce((total, device) => total + device.outages, 0),
    restarts: devices.reduce((total, device) => total + device.restarts, 0),
  };
}

/** "99.95%", never rounding a screen with downtime up to a clean 100%. */
export function formatUptimePercent(percent: number | null | undefined) {
  if (percent == null || !Number.isFinite(percent)) return "No data yet";
  if (percent >= 100) return "100%";
  if (percent >= 99.995) return "99.99%";
  return `${percent >= 99 ? percent.toFixed(2) : percent.toFixed(1)}%`;
}

export function formatDuration(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) {
    return rest && hours < 6 ? `${hours} hr ${rest} min` : `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

const emailPattern = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/** Splits what someone typed into a recipients box. Returns the bad entries too so the form can name them. */
export function parseAlertRecipients(input: string | string[]) {
  const entries = (Array.isArray(input) ? input : input.split(/[\s,;]+/))
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const entry of entries) {
    if (!emailPattern.test(entry) || entry.length > 254) invalid.push(entry);
    else if (!valid.includes(entry)) valid.push(entry);
  }
  return { valid, invalid };
}

export type AlertEmailScreen = { name: string; siteName?: string | null };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function screenLabel(screen: AlertEmailScreen) {
  return screen.siteName && screen.siteName !== "Unassigned" ? `${screen.name} (${screen.siteName})` : screen.name;
}

/**
 * One email per workspace per check, so a site losing its internet sends a
 * single message naming every screen instead of one message each.
 */
export function composeAlertEmail(input: {
  now: number;
  workspaceName?: string | null;
  dashboardUrl?: string | null;
  offline: Array<AlertEmailScreen & { since: number }>;
  crashLooping: Array<AlertEmailScreen & { restarts: number }>;
  recovered: Array<AlertEmailScreen & { downMs?: number | null; kind: "offline" | "crash_loop" }>;
}) {
  const { offline, crashLooping, recovered } = input;
  const problems = offline.length + crashLooping.length;
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

  let subject: string;
  if (offline.length === 1 && problems === 1) subject = `${offline[0].name} is offline`;
  else if (crashLooping.length === 1 && problems === 1) subject = `${crashLooping[0].name} keeps restarting`;
  else if (problems > 0 && crashLooping.length === 0) subject = `${plural(offline.length, "screen")} offline`;
  else if (problems > 0) subject = `${plural(problems, "screen")} need attention`;
  else if (recovered.length === 1) subject = `${recovered[0].name} is back`;
  else subject = `${plural(recovered.length, "screen")} back to normal`;
  if (input.workspaceName) subject += ` · ${input.workspaceName}`;

  const sections: Array<{ heading: string; lines: string[]; note?: string }> = [];
  if (offline.length) {
    sections.push({
      heading: offline.length === 1 ? "Offline" : `Offline (${offline.length})`,
      lines: offline.map((screen) => `${screenLabel(screen)}: no check-in for ${formatDuration(input.now - screen.since)}`),
      note: "A screen that lost its internet keeps playing its saved content, but it can't take changes until it reconnects. Check power and network at the site.",
    });
  }
  if (crashLooping.length) {
    sections.push({
      heading: crashLooping.length === 1 ? "Keeps restarting" : `Keep restarting (${crashLooping.length})`,
      lines: crashLooping.map((screen) => `${screenLabel(screen)}: ${plural(screen.restarts, "unexpected restart")} in the last 30 minutes`),
      note: "Playback is probably being interrupted. Try Reboot from the screen's page; if it keeps happening, check the power supply and the media it is playing.",
    });
  }
  if (recovered.length) {
    sections.push({
      heading: recovered.length === 1 ? "Back to normal" : `Back to normal (${recovered.length})`,
      lines: recovered.map((screen) =>
        screen.kind === "crash_loop"
          ? `${screenLabel(screen)}: stopped restarting`
          : `${screenLabel(screen)}: back online${screen.downMs ? ` after ${formatDuration(screen.downMs)}` : ""}`,
      ),
    });
  }

  const footer = "You get these because you are listed for screen alerts in this workspace. An admin can change who gets them from the dashboard.";
  const text = [
    ...sections.map((section) =>
      [section.heading, ...section.lines.map((line) => `- ${line}`), ...(section.note ? ["", section.note] : [])].join("\n"),
    ),
    ...(input.dashboardUrl ? [`Open the dashboard: ${input.dashboardUrl}`] : []),
    footer,
  ].join("\n\n");

  const html = [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:560px">',
    ...sections.map(
      (section) =>
        `<h2 style="font-size:16px;margin:20px 0 6px">${escapeHtml(section.heading)}</h2>` +
        `<ul style="margin:0;padding-left:20px">${section.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` +
        (section.note ? `<p style="margin:8px 0 0;color:#555">${escapeHtml(section.note)}</p>` : ""),
    ),
    input.dashboardUrl
      ? `<p style="margin:24px 0"><a href="${escapeHtml(input.dashboardUrl)}" style="background:#111;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none">Open the dashboard</a></p>`
      : "",
    `<p style="margin:24px 0 0;font-size:12px;color:#777">${escapeHtml(footer)}</p>`,
    "</div>",
  ].join("");

  return { subject, text, html };
}
