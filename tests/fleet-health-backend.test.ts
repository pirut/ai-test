import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { mock } from "node:test";

import { convexTest } from "convex-test";

import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

// The fleet health flow end to end against an in-memory Convex: a real
// heartbeat mutation, the real sweep, and the email call captured at fetch.

const modules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/_generated/server.js": () => import("../convex/_generated/server.js"),
  "../convex/admin.ts": () => import("../convex/admin"),
  "../convex/crons.ts": () => import("../convex/crons"),
  "../convex/dashboard.ts": () => import("../convex/dashboard"),
  "../convex/device.ts": () => import("../convex/device"),
  "../convex/fleet.ts": () => import("../convex/fleet"),
  "../convex/fleetHealth.ts": () => import("../convex/fleetHealth"),
  "../convex/maintenance.ts": () => import("../convex/maintenance"),
  "../convex/sync.ts": () => import("../convex/sync"),
};

const minute = 60_000;
const start = Date.parse("2026-11-10T12:00:00.000Z");
const orgId = "org_test";
const credential = "test-credential";
const admin = { subject: "user_1", org_id: orgId, org_role: "org:admin" };

// The in-memory backend nudges its clock a millisecond per commit while the
// test clock is frozen, so times are compared with a little slack.
function near(actual: number | null | undefined, expected: number, slackMs = 100) {
  assert.ok(
    typeof actual === "number" && Math.abs(actual - expected) <= slackMs,
    `expected ${actual} to be within ${slackMs} of ${expected}`,
  );
}

type Sent = { to: string[]; subject: string; text: string };

async function setup(options: { recipients?: string[]; email?: boolean } = {}) {
  mock.timers.enable({ apis: ["Date"], now: start });
  const sent: Sent[] = [];
  mock.method(globalThis, "fetch", async (_url: unknown, init?: { body?: string }) => {
    sent.push(JSON.parse(init?.body ?? "{}"));
    return new Response("{}", { status: 200 });
  });
  if (options.email === false) {
    delete process.env.RESEND_API_KEY;
    delete process.env.SHOWROOM_ALERT_EMAIL_FROM;
  } else {
    process.env.RESEND_API_KEY = "re_test";
    process.env.SHOWROOM_ALERT_EMAIL_FROM = "Alerts <alerts@example.com>";
  }

  const t = convexTest(schema, modules);
  const deviceId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("devices", {
      organizationId: orgId,
      name: "Front Window",
      siteName: "Chelsea",
      status: "offline",
      timezone: "America/New_York",
      orientation: 0,
      volume: 0,
      createdAt: start,
      updatedAt: start,
    });
    await ctx.db.insert("deviceCredentials", {
      deviceId: id,
      version: 1,
      secretHash: createHash("sha256").update(credential).digest("hex"),
      issuedAt: start,
      expiresAt: start + 365 * 24 * 60 * minute,
    });
    return id;
  });
  const recipients = options.recipients ?? ["jr@example.com"];
  if (recipients.length) {
    await t.withIdentity(admin).mutation(api.fleetHealth.saveSettings, {
      enabled: true,
      recipients,
      notifyAfterSeconds: 600,
    });
  }

  let bootedAt = start;
  const at = (offsetMs: number) => mock.timers.setTime(start + offsetMs);
  at(0);
  const heartbeat = (extra: Record<string, unknown> = {}) =>
    t.mutation(api.device.recordHeartbeat, {
      credential,
      payload: {
        deviceId,
        appVersion: "1.0.0",
        agentVersion: "1.0.0",
        uptimeSeconds: Math.round((Date.now() - bootedAt) / 1000),
        storageFreeBytes: 1,
        storageTotalBytes: 2,
        lastSeenAt: new Date().toISOString(),
        ...extra,
      },
    });
  // Scheduled emails start on a real zero-delay timer; let it fire, then wait.
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    await t.finishInProgressScheduledFunctions();
  };
  const restartAgent = () => {
    bootedAt = Date.now();
  };
  const sweep = async () => {
    const result = await t.mutation(internal.fleetHealth.sweep, {});
    await settle();
    return result;
  };
  const events = () => t.run((ctx) => ctx.db.query("alertEvents").collect());
  const device = () => t.run((ctx) => ctx.db.get(deviceId));
  const overview = () => t.withIdentity(admin).query(api.fleetHealth.getOverview, {});
  return { t, at, heartbeat, restartAgent, sweep, settle, events, device, overview, sent, deviceId };
}

test.afterEach(() => {
  mock.timers.reset();
  mock.restoreAll();
});

test("an outage is recorded, emailed once after the wait, and cleared by the next check-in", async () => {
  const h = await setup();
  await h.heartbeat();
  near((await h.device())?.healthTrackedSince, start);

  // Quiet, but not for long enough to be offline.
  h.at(4 * minute);
  assert.equal((await h.sweep()).wentOffline, 0);

  h.at(6 * minute);
  assert.equal((await h.sweep()).wentOffline, 1);
  let [outage] = await h.events();
  assert.equal(outage.alertType, "offline");
  assert.equal(outage.state, "open");
  // The outage starts at the last check-in, not when it was noticed.
  near(outage.openedAt, start);
  assert.equal((await h.device())?.status, "offline");
  assert.equal(h.sent.length, 0, "no email before the 10 minute wait");

  // Later sweeps neither duplicate the record nor email early.
  h.at(8 * minute);
  await h.sweep();
  assert.equal((await h.events()).length, 1);
  assert.equal(h.sent.length, 0);

  h.at(11 * minute);
  assert.equal((await h.sweep()).emails, 1);
  assert.equal(h.sent.length, 1);
  assert.deepEqual(h.sent[0].to, ["jr@example.com"]);
  assert.equal(h.sent[0].subject, "Front Window is offline");
  assert.match(h.sent[0].text, /no check-in for 11 minutes/);

  h.at(30 * minute);
  await h.sweep();
  assert.equal(h.sent.length, 1, "an outage is announced once");

  const live = await h.overview();
  near(live.devices[0].offlineSince, start);
  assert.equal(live.recent[0].type, "offline");
  assert.equal(live.recent[0].resolvedAt, null);

  h.at(45 * minute);
  h.restartAgent();
  await h.heartbeat();
  [outage] = await h.events();
  assert.equal(outage.state, "resolved");
  near(outage.resolvedAt, start + 45 * minute);
  assert.equal((await h.device())?.status, "online");
  // Coming back from an outage with a fresh agent is not a crash.
  assert.equal((await h.events()).length, 1);

  await h.sweep();
  assert.equal(h.sent.length, 2);
  assert.equal(h.sent[1].subject, "Front Window is back");
  assert.match(h.sent[1].text, /back online after 45 minutes/);

  h.at(60 * minute);
  await h.heartbeat();
  await h.sweep();
  assert.equal(h.sent.length, 2);
  const after = await h.overview();
  assert.equal(after.fleet.outages, 1);
  near(after.devices[0].downMs, 45 * minute);
  near(after.devices[0].uptimePercent, 25, 0.01);
  assert.equal(after.devices[0].offlineSince, null);
});

test("a blip shorter than the wait is recorded but never emailed", async () => {
  const h = await setup();
  await h.heartbeat();
  h.at(6 * minute);
  await h.sweep();
  h.at(7 * minute);
  await h.heartbeat();
  h.at(20 * minute);
  await h.heartbeat();
  await h.sweep();
  assert.equal(h.sent.length, 0);
  const [outage] = await h.events();
  assert.equal(outage.state, "resolved");
  assert.equal(outage.notifyState, undefined);
  assert.equal((await h.overview()).fleet.outages, 1);
});

test("screens already dark when monitoring starts are recorded without an email", async () => {
  const h = await setup();
  await h.t.run(async (ctx) => {
    await ctx.db.patch(h.deviceId, { status: "online", lastHeartbeatAt: start - 3 * 24 * 60 * minute });
  });
  h.at(minute);
  assert.equal((await h.sweep()).wentOffline, 1);
  h.at(30 * minute);
  await h.sweep();
  assert.equal(h.sent.length, 0);
  const overview = await h.overview();
  assert.equal(overview.devices[0].uptimePercent, 0);
  near(overview.devices[0].offlineSince, start - 3 * 24 * 60 * minute);
});

test("nothing is emailed without recipients or without the server email key, and tracking still works", async () => {
  for (const options of [{ recipients: [] }, { email: false }]) {
    const h = await setup(options);
    await h.heartbeat();
    h.at(20 * minute);
    await h.sweep();
    h.at(40 * minute);
    await h.sweep();
    assert.equal(h.sent.length, 0);
    const overview = await h.overview();
    near(overview.devices[0].offlineSince, start);
    assert.equal(overview.settings.emailConfigured, options.email !== false);
    mock.timers.reset();
    mock.restoreAll();
  }
});

test("unexpected restarts are counted, three in a row open a crash loop that emails right away", async () => {
  const h = await setup();
  await h.heartbeat();
  h.at(minute);
  await h.heartbeat();
  assert.equal((await h.events()).length, 0);

  // First unexpected agent restart.
  h.at(2 * minute);
  h.restartAgent();
  await h.heartbeat();
  let events = await h.events();
  assert.deepEqual(events.map((event) => event.alertType), ["crash"]);
  assert.equal(events[0].metadata.component, "agent");
  await h.sweep();
  assert.equal(h.sent.length, 0, "a single restart is logged, not emailed");

  h.at(3 * minute);
  h.restartAgent();
  await h.heartbeat();
  h.at(4 * minute);
  h.restartAgent();
  await h.heartbeat();
  events = await h.events();
  assert.deepEqual(events.map((event) => event.alertType), ["crash", "crash", "crash", "crash_loop"]);
  assert.equal((await h.overview()).devices[0].crashLooping, true);

  await h.sweep();
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].subject, "Front Window keeps restarting");
  assert.match(h.sent[0].text, /3 unexpected restarts in the last 30 minutes/);

  // Further restarts fold into the open loop instead of adding rows.
  h.at(5 * minute);
  h.restartAgent();
  await h.heartbeat();
  events = await h.events();
  assert.equal(events.length, 4);
  assert.equal(events[3].metadata.restarts, 1);
  assert.equal((await h.overview()).devices[0].restarts, 4);

  // Quiet for half an hour: the loop closes and the all-clear goes out.
  for (let offset = 6; offset <= 36; offset += 1) {
    h.at(offset * minute);
    await h.heartbeat();
  }
  await h.sweep();
  events = await h.events();
  assert.equal(events[3].state, "resolved");
  assert.equal(h.sent.length, 2);
  assert.equal(h.sent[1].subject, "Front Window is back");
  assert.match(h.sent[1].text, /stopped restarting/);
  const overview = await h.overview();
  assert.equal(overview.devices[0].crashLooping, false);
  assert.equal(overview.devices[0].uptimePercent, 100);
});

test("a restart the operator asked for is not counted", async () => {
  const h = await setup();
  await h.heartbeat();
  h.at(minute);
  await h.t.run(async (ctx) => {
    await ctx.db.insert("deviceCommands", {
      organizationId: orgId,
      deviceId: h.deviceId,
      commandType: "reboot_device",
      status: "succeeded",
      payload: {},
      queuedAt: Date.now(),
      completedAt: Date.now(),
    });
  });
  h.at(2 * minute);
  h.restartAgent();
  await h.heartbeat();
  assert.equal((await h.events()).length, 0);
});

test("alert settings are admin-only and validated", async () => {
  const h = await setup({ recipients: [] });
  const member = h.t.withIdentity({ subject: "user_2", org_id: orgId, org_role: "org:member" });
  await assert.rejects(
    member.mutation(api.fleetHealth.saveSettings, { enabled: true, recipients: ["a@b.co"], notifyAfterSeconds: 600 }),
    /Admin role required/,
  );
  const asAdmin = h.t.withIdentity(admin);
  await assert.rejects(
    asAdmin.mutation(api.fleetHealth.saveSettings, { enabled: true, recipients: ["nope"], notifyAfterSeconds: 600 }),
    /not a valid email/,
  );
  await assert.rejects(
    asAdmin.mutation(api.fleetHealth.saveSettings, { enabled: true, recipients: ["a@b.co"], notifyAfterSeconds: 7 }),
    /waiting times/,
  );
  await assert.rejects(asAdmin.mutation(api.fleetHealth.sendTestEmail, {}), /Add at least one address/);

  const saved = await asAdmin.mutation(api.fleetHealth.saveSettings, {
    enabled: true,
    recipients: ["A@b.co", "a@b.co", "ops@b.co"],
    notifyAfterSeconds: 1800,
  });
  assert.deepEqual(saved.recipients, ["a@b.co", "ops@b.co"]);
  // Members can read the overview, and another workspace sees none of it.
  assert.equal((await member.query(api.fleetHealth.getOverview, {})).settings.notifyAfterSeconds, 1800);
  const other = h.t.withIdentity({ subject: "user_3", org_id: "org_other", org_role: "org:admin" });
  const foreign = await other.query(api.fleetHealth.getOverview, {});
  assert.equal(foreign.devices.length, 0);
  assert.deepEqual(foreign.settings.recipients, []);

  await asAdmin.mutation(api.fleetHealth.sendTestEmail, {});
  await h.settle();
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0].subject, /^Test: /);
  assert.deepEqual(h.sent[0].to, ["a@b.co", "ops@b.co"]);
});
