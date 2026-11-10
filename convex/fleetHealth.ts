import { ConvexError, v } from "convex/values";
import {
  type HealthEvent,
  composeAlertEmail,
  crashLoopThreshold,
  crashLoopWindowMs,
  defaultNotifyAfterSeconds,
  detectUnexpectedRestarts,
  healthWindowDays,
  maxAlertRecipients,
  notifyAfterSecondsChoices,
  offlineAfterMs,
  offlineBackfillMs,
  parseAlertRecipients,
  summarizeDeviceHealth,
  summarizeFleetHealth,
} from "@showroom/contracts";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalAction, internalMutation, mutation, query } from "./_generated/server";
import { requireAdmin, requireOrgIdentity } from "./lib";

// Fleet health works entirely from heartbeats screens already send:
//   - a screen that stops checking in gets an "offline" record, closed by its
//     next heartbeat, which is also what uptime is measured from;
//   - software that restarts without being asked gets a "crash" record, and
//     several in a row open a "crash_loop";
//   - offline and crash_loop records are emailed once, then once more when
//     they clear.
// Email stays off until RESEND_API_KEY and SHOWROOM_ALERT_EMAIL_FROM are set
// on the Convex deployment and a workspace admin has listed recipients.

const day = 24 * 60 * 60_000;

function emailConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.SHOWROOM_ALERT_EMAIL_FROM?.trim();
  return apiKey && from ? { apiKey, from } : null;
}

function dashboardUrl() {
  const raw = process.env.SHOWROOM_DASHBOARD_URL?.trim().replace(/\/+$/, "");
  return raw ? `${raw}/dashboard` : null;
}

async function loadAlertRule(ctx: QueryCtx | MutationCtx, orgId: string) {
  return ctx.db
    .query("alertRules")
    .withIndex("by_org", (q) => q.eq("organizationId", orgId))
    .first();
}

function settingsFromRule(rule: Doc<"alertRules"> | null) {
  return {
    enabled: rule?.enabled ?? true,
    recipients: rule?.emailRecipients ?? [],
    notifyAfterSeconds: rule?.notifyAfterSeconds ?? defaultNotifyAfterSeconds,
  };
}

async function recentAlertEvents(ctx: MutationCtx, device: Doc<"devices">) {
  return ctx.db
    .query("alertEvents")
    .withIndex("by_device", (q) => q.eq("deviceId", device._id))
    .order("desc")
    .take(40);
}

/**
 * Called for every heartbeat, before the device row is updated, with the row
 * as it was after the previous heartbeat. Returns fields to merge into that
 * update. It must never fail a heartbeat, so anything unexpected is logged
 * and skipped.
 */
export async function trackHeartbeatHealth(
  ctx: MutationCtx,
  device: Doc<"devices">,
  payload: any,
  health: any,
  now: number,
): Promise<{ lastUptimeSeconds?: number; healthTrackedSince?: number }> {
  const fields: { lastUptimeSeconds?: number; healthTrackedSince?: number } = {};
  try {
    const uptimeSeconds = typeof payload?.uptimeSeconds === "number" ? payload.uptimeSeconds : undefined;
    if (uptimeSeconds !== undefined) fields.lastUptimeSeconds = uptimeSeconds;
    if (!device.healthTrackedSince) fields.healthTrackedSince = now;
    if (!device.organizationId) return fields;
    const organizationId = device.organizationId;

    let events: Doc<"alertEvents">[] | null = null;

    // The sweep marked this screen offline; this heartbeat is it coming back.
    if (device.status === "offline" && device.lastHeartbeatAt) {
      events = await recentAlertEvents(ctx, device);
      for (const event of events) {
        if (event.alertType !== "offline" || event.state !== "open") continue;
        await ctx.db.patch(event._id, {
          state: "resolved",
          resolvedAt: now,
          // Only send an all-clear for an outage that was emailed. One that
          // cleared before its email was due stays quiet.
          notifyState: event.notifyState === "sent" ? "recovery_pending" : undefined,
        });
      }
    }

    const reading = {
      now,
      previousHeartbeatAt: device.lastHeartbeatAt,
      previousUptimeSeconds: device.lastUptimeSeconds,
      uptimeSeconds,
      previousPlayerRestarts: device.health?.playerRestarts,
      playerRestarts: health?.playerRestarts,
    };
    if (!detectUnexpectedRestarts(reading).length) return fields;

    const commands = await ctx.db
      .query("deviceCommands")
      .withIndex("by_device_and_queued_at", (q) => q.eq("deviceId", device._id))
      .order("desc")
      .take(10);
    const restarts = detectUnexpectedRestarts({
      ...reading,
      recentCommands: commands.map((command) => ({
        commandType: command.commandType,
        queuedAt: command.queuedAt,
        completedAt: command.completedAt,
        pending: command.status === "queued" || command.status === "in_progress",
      })),
    });
    if (!restarts.length) return fields;

    events ??= await recentAlertEvents(ctx, device);
    const count = restarts.reduce((total, restart) => total + restart.count, 0);
    const openLoop = events.find((event) => event.alertType === "crash_loop" && event.state === "open");
    if (openLoop) {
      // Fold further restarts into the open loop so a screen restarting every
      // minute for a weekend does not write thousands of rows.
      await ctx.db.patch(openLoop._id, {
        metadata: {
          ...(openLoop.metadata ?? {}),
          restarts: (openLoop.metadata?.restarts ?? 0) + count,
          lastCrashAt: now,
        },
      });
      return fields;
    }

    for (const restart of restarts) {
      await ctx.db.insert("alertEvents", {
        organizationId,
        deviceId: device._id,
        alertType: "crash",
        state: "resolved",
        openedAt: now,
        resolvedAt: now,
        metadata: { component: restart.component, restarts: restart.count },
      });
    }
    const recentRestarts = events
      .filter((event) => event.alertType === "crash" && now - event.openedAt <= crashLoopWindowMs)
      .reduce((total, event) => total + Math.max(1, event.metadata?.restarts ?? 1), count);
    if (recentRestarts >= crashLoopThreshold) {
      await ctx.db.insert("alertEvents", {
        organizationId,
        deviceId: device._id,
        alertType: "crash_loop",
        state: "open",
        openedAt: now,
        metadata: { triggerRestarts: recentRestarts, restarts: 0, lastCrashAt: now },
        notifyState: "pending",
      });
    }
  } catch (error) {
    console.error("fleet health tracking skipped for a heartbeat", error);
  }
  return fields;
}

export const sweep = internalMutation({
  args: {},
  returns: v.object({ wentOffline: v.number(), emails: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();

    // 1. Screens whose last check-in is too old. Their stored status is still
    //    "online" (the heartbeat sets it), so this only ever touches screens
    //    at the moment they go quiet.
    const quiet = await ctx.db
      .query("devices")
      .withIndex("by_status_and_last_heartbeat", (q) =>
        q.eq("status", "online").lt("lastHeartbeatAt", now - offlineAfterMs),
      )
      .take(200);
    for (const device of quiet) {
      await ctx.db.patch(device._id, { status: "offline" });
      if (!device.organizationId || !device.lastHeartbeatAt) continue;
      await ctx.db.insert("alertEvents", {
        organizationId: device.organizationId,
        deviceId: device._id,
        alertType: "offline",
        state: "open",
        // The outage started at the last check-in, not when it was noticed.
        openedAt: device.lastHeartbeatAt,
        // A screen that was already dark long before monitoring first ran is
        // recorded for uptime but not announced.
        notifyState: now - device.lastHeartbeatAt > offlineBackfillMs ? undefined : "pending",
      });
    }

    // 2. Crash loops end after a quiet spell.
    const loops = await ctx.db
      .query("alertEvents")
      .withIndex("by_state_and_type", (q) => q.eq("state", "open").eq("alertType", "crash_loop"))
      .take(200);
    for (const loop of loops) {
      if (now - (loop.metadata?.lastCrashAt ?? loop.openedAt) < crashLoopWindowMs) continue;
      await ctx.db.patch(loop._id, {
        state: "resolved",
        resolvedAt: now,
        notifyState: loop.notifyState === "sent" ? "recovery_pending" : undefined,
      });
    }

    // 3. Email what is due, one message per workspace.
    const [pending, recovered] = await Promise.all([
      ctx.db.query("alertEvents").withIndex("by_notify_state", (q) => q.eq("notifyState", "pending")).take(300),
      ctx.db.query("alertEvents").withIndex("by_notify_state", (q) => q.eq("notifyState", "recovery_pending")).take(300),
    ]);
    const byOrg = new Map<string, Doc<"alertEvents">[]>();
    for (const event of [...pending, ...recovered]) {
      byOrg.set(event.organizationId, [...(byOrg.get(event.organizationId) ?? []), event]);
    }

    const config = emailConfig();
    let emails = 0;
    for (const [orgId, events] of byOrg) {
      const settings = settingsFromRule(await loadAlertRule(ctx, orgId));
      const canSend = Boolean(config) && settings.enabled && settings.recipients.length > 0;
      if (!canSend) {
        for (const event of events) await ctx.db.patch(event._id, { notifyState: undefined });
        continue;
      }

      const due = events.filter(
        (event) =>
          event.notifyState === "recovery_pending" ||
          event.alertType === "crash_loop" ||
          now - event.openedAt >= settings.notifyAfterSeconds * 1000,
      );
      if (!due.length) continue;

      const offline = [];
      const crashLooping = [];
      const back = [];
      for (const event of due) {
        const device = await ctx.db.get(event.deviceId);
        if (device) {
          const screen = { name: device.name ?? "Unnamed screen", siteName: device.siteName ?? null };
          if (event.notifyState === "recovery_pending") {
            back.push({
              ...screen,
              kind: event.alertType === "crash_loop" ? ("crash_loop" as const) : ("offline" as const),
              downMs: event.resolvedAt ? event.resolvedAt - event.openedAt : null,
            });
          } else if (event.alertType === "crash_loop") {
            crashLooping.push({ ...screen, restarts: event.metadata?.triggerRestarts ?? crashLoopThreshold });
          } else {
            offline.push({ ...screen, since: event.openedAt });
          }
        }
        await ctx.db.patch(event._id, {
          notifyState: event.notifyState === "recovery_pending" || !device ? undefined : "sent",
        });
      }
      if (!offline.length && !crashLooping.length && !back.length) continue;

      const organization = await ctx.db
        .query("organizations")
        .withIndex("by_clerk_org_id", (q) => q.eq("clerkOrgId", orgId))
        .first();
      const email = composeAlertEmail({
        now,
        workspaceName: organization?.name ?? null,
        dashboardUrl: dashboardUrl(),
        offline,
        crashLooping,
        recovered: back,
      });
      await ctx.scheduler.runAfter(0, internal.fleetHealth.sendEmail, {
        to: settings.recipients,
        ...email,
      });
      emails += 1;
    }

    return { wentOffline: quiet.length, emails };
  },
});

export const sendEmail = internalAction({
  args: {
    to: v.array(v.string()),
    subject: v.string(),
    text: v.string(),
    html: v.string(),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const config = emailConfig();
    if (!config) {
      console.warn("Alert email not sent: RESEND_API_KEY or SHOWROOM_ALERT_EMAIL_FROM is not set");
      return null;
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: args.to,
        subject: args.subject,
        text: args.text,
        html: args.html,
      }),
    });
    if (!response.ok) {
      // Thrown so the failure is visible in the Convex logs.
      throw new Error(`Alert email was rejected (${response.status}): ${(await response.text()).slice(0, 300)}`);
    }
    return null;
  },
});

const eventSummary = v.object({
  id: v.string(),
  deviceId: v.string(),
  deviceName: v.string(),
  type: v.union(v.literal("offline"), v.literal("crash"), v.literal("crash_loop")),
  component: v.union(v.string(), v.null()),
  openedAt: v.number(),
  resolvedAt: v.union(v.number(), v.null()),
  restarts: v.number(),
});

const deviceSummary = v.object({
  deviceId: v.string(),
  uptimePercent: v.union(v.number(), v.null()),
  downMs: v.number(),
  outages: v.number(),
  restarts: v.number(),
  offlineSince: v.union(v.number(), v.null()),
  crashLooping: v.boolean(),
});

function isHealthEventType(type: string): type is "offline" | "crash" | "crash_loop" {
  return type === "offline" || type === "crash" || type === "crash_loop";
}

function toHealthEvent(event: Doc<"alertEvents">): HealthEvent {
  return {
    alertType: event.alertType,
    openedAt: event.openedAt,
    resolvedAt: event.resolvedAt ?? null,
    // A crash record carries how many restarts it stands for; a loop carries
    // the ones folded into it after it opened.
    count: event.alertType === "crash" ? Math.max(1, event.metadata?.restarts ?? 1) : event.metadata?.restarts ?? 0,
  };
}

export const getOverview = query({
  args: {},
  returns: v.object({
    windowDays: v.number(),
    monitoringSince: v.union(v.number(), v.null()),
    fleet: v.object({
      uptimePercent: v.union(v.number(), v.null()),
      outages: v.number(),
      restarts: v.number(),
    }),
    devices: v.array(deviceSummary),
    recent: v.array(eventSummary),
    settings: v.object({
      enabled: v.boolean(),
      recipients: v.array(v.string()),
      notifyAfterSeconds: v.number(),
      emailConfigured: v.boolean(),
    }),
  }),
  handler: async (ctx) => {
    const { orgId } = await requireOrgIdentity(ctx);
    const now = Date.now();
    const windowStart = now - healthWindowDays * day;

    const [devices, open, closed, rule] = await Promise.all([
      ctx.db.query("devices").withIndex("by_org", (q) => q.eq("organizationId", orgId)).take(2_000),
      ctx.db
        .query("alertEvents")
        .withIndex("by_org_and_resolved_at", (q) => q.eq("organizationId", orgId).eq("resolvedAt", undefined))
        .take(2_000),
      ctx.db
        .query("alertEvents")
        .withIndex("by_org_and_resolved_at", (q) => q.eq("organizationId", orgId).gte("resolvedAt", windowStart))
        .order("desc")
        .take(4_000),
      loadAlertRule(ctx, orgId),
    ]);

    const events = [...open, ...closed].filter((event) => isHealthEventType(event.alertType));
    const byDevice = new Map<string, Doc<"alertEvents">[]>();
    for (const event of events) {
      byDevice.set(event.deviceId, [...(byDevice.get(event.deviceId) ?? []), event]);
    }

    const watched = devices.filter((device) => device.status !== "unclaimed");
    const summaries = watched.map((device) => ({
      deviceId: device._id as string,
      ...summarizeDeviceHealth({
        now,
        windowStart,
        trackedSince: device.healthTrackedSince ?? null,
        events: (byDevice.get(device._id) ?? []).map(toHealthEvent),
      }),
    }));
    const names = new Map(devices.map((device) => [device._id as string, device.name ?? "Unnamed screen"]));
    const tracked = watched
      .map((device) => device.healthTrackedSince)
      .filter((value): value is number => typeof value === "number");
    const settings = settingsFromRule(rule);

    return {
      windowDays: healthWindowDays,
      monitoringSince: tracked.length ? Math.min(...tracked) : null,
      fleet: summarizeFleetHealth(summaries),
      devices: summaries.map((summary) => ({
        deviceId: summary.deviceId,
        uptimePercent: summary.uptimePercent,
        downMs: summary.downMs,
        outages: summary.outages,
        restarts: summary.restarts,
        offlineSince: summary.offlineSince,
        crashLooping: summary.crashLooping,
      })),
      recent: events
        .filter((event) => names.has(event.deviceId))
        .sort((a, b) => (b.resolvedAt ?? now) - (a.resolvedAt ?? now) || b.openedAt - a.openedAt)
        .slice(0, 12)
        .map((event) => ({
          id: event._id as string,
          deviceId: event.deviceId as string,
          deviceName: names.get(event.deviceId) ?? "Unnamed screen",
          type: event.alertType as "offline" | "crash" | "crash_loop",
          component: typeof event.metadata?.component === "string" ? event.metadata.component : null,
          openedAt: event.openedAt,
          resolvedAt: event.resolvedAt ?? null,
          restarts:
            event.alertType === "crash_loop"
              ? (event.metadata?.triggerRestarts ?? 0) + (event.metadata?.restarts ?? 0)
              : Math.max(1, event.metadata?.restarts ?? 1),
        })),
      settings: { ...settings, emailConfigured: Boolean(emailConfig()) },
    };
  },
});

function normalizeSettings(input: { enabled: boolean; recipients: string[]; notifyAfterSeconds: number }) {
  const { valid, invalid } = parseAlertRecipients(input.recipients);
  if (invalid.length) {
    throw new ConvexError(`${invalid[0]} is not a valid email address`);
  }
  if (valid.length > maxAlertRecipients) {
    throw new ConvexError(`Alerts can go to at most ${maxAlertRecipients} addresses`);
  }
  if (!(notifyAfterSecondsChoices as readonly number[]).includes(input.notifyAfterSeconds)) {
    throw new ConvexError("Pick one of the listed waiting times");
  }
  return { enabled: input.enabled, recipients: valid, notifyAfterSeconds: input.notifyAfterSeconds };
}

export const saveSettings = mutation({
  args: {
    enabled: v.boolean(),
    recipients: v.array(v.string()),
    notifyAfterSeconds: v.number(),
  },
  returns: v.object({
    enabled: v.boolean(),
    recipients: v.array(v.string()),
    notifyAfterSeconds: v.number(),
    emailConfigured: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx);
    const settings = normalizeSettings(args);
    const now = Date.now();
    const rule = await loadAlertRule(ctx, identity.orgId);
    const fields = {
      enabled: settings.enabled,
      emailRecipients: settings.recipients,
      notifyAfterSeconds: settings.notifyAfterSeconds,
      updatedAt: now,
    };
    if (rule) {
      await ctx.db.patch(rule._id, fields);
    } else {
      await ctx.db.insert("alertRules", {
        organizationId: identity.orgId,
        name: "Screen alerts",
        staleAfterSeconds: 120,
        offlineAfterSeconds: offlineAfterMs / 1000,
        createdAt: now,
        ...fields,
      });
    }
    return { ...settings, emailConfigured: Boolean(emailConfig()) };
  },
});

export const sendTestEmail = mutation({
  args: {},
  returns: v.object({ sentTo: v.array(v.string()) }),
  handler: async (ctx) => {
    const identity = await requireAdmin(ctx);
    if (!emailConfig()) {
      throw new ConvexError("Alert email is not set up on the server yet");
    }
    const settings = settingsFromRule(await loadAlertRule(ctx, identity.orgId));
    if (!settings.recipients.length) {
      throw new ConvexError("Add at least one address and save before sending a test");
    }
    const now = Date.now();
    const email = composeAlertEmail({
      now,
      dashboardUrl: dashboardUrl(),
      offline: [{ name: "Example screen", siteName: "Test alert", since: now - settings.notifyAfterSeconds * 1000 }],
      crashLooping: [],
      recovered: [],
    });
    await ctx.scheduler.runAfter(0, internal.fleetHealth.sendEmail, {
      to: settings.recipients,
      subject: `Test: ${email.subject}`,
      text: `This is a test of screen alerts. Nothing is wrong.\n\n${email.text}`,
      html: `<p style="font-family:sans-serif"><strong>This is a test of screen alerts. Nothing is wrong.</strong></p>${email.html}`,
    });
    return { sentTo: settings.recipients };
  },
});
