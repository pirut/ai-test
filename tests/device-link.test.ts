import assert from "node:assert/strict";
import test from "node:test";

import { commandQueuePolicy, heartbeatPayloadSchema } from "@showroom/contracts";

import { serializeLinkState } from "../convex/showroom";

test("quick commands expire and collapse repeat clicks", () => {
  for (const type of ["sync_now", "take_screenshot", "restart_player", "reboot_device"] as const) {
    const policy = commandQueuePolicy(type);
    assert.equal(policy.collapseDuplicates, true, type);
    assert.ok(policy.deadlineMs && policy.deadlineMs <= 15 * 60_000, type);
  }
});

test("blank and unblank replace each other and never expire", () => {
  assert.deepEqual(commandQueuePolicy("blank_screen").supersedes, ["unblank_screen"]);
  assert.deepEqual(commandQueuePolicy("unblank_screen").supersedes, ["blank_screen"]);
  assert.equal(commandQueuePolicy("blank_screen").deadlineMs, undefined);
});

test("releases and network changes keep their existing queueing", () => {
  for (const type of ["update_release", "update_network", "update_youtube_auth"] as const) {
    assert.deepEqual(commandQueuePolicy(type), { collapseDuplicates: false, supersedes: [] });
  }
});

test("content state compares published and reported versions", () => {
  const base = { lastSyncAt: undefined, lastAgentError: undefined };
  assert.equal(
    serializeLinkState({ ...base, desiredManifestVersion: "m-2", manifestVersion: "m-2" }).contentState,
    "current",
  );
  assert.equal(
    serializeLinkState({ ...base, desiredManifestVersion: "m-2", manifestVersion: "m-1" }).contentState,
    "updating",
  );
  assert.equal(
    serializeLinkState({ ...base, desiredManifestVersion: undefined, manifestVersion: "m-1" }).contentState,
    "unknown",
  );
});

const heartbeat = {
  deviceId: "device-1",
  appVersion: "player-v1",
  agentVersion: "agent-v1",
  uptimeSeconds: 10,
  storageFreeBytes: 1,
  storageTotalBytes: 2,
  lastSeenAt: "2026-10-22T12:00:00Z",
};

test("heartbeats from older agents without sync state still parse", () => {
  assert.equal(heartbeatPayloadSchema.parse(heartbeat).sync, undefined);
});

test("a malformed sync block never rejects the heartbeat", () => {
  const parsed = heartbeatPayloadSchema.parse({ ...heartbeat, sync: { lastSyncAt: 42 } });
  assert.equal(parsed.sync, undefined);
  assert.deepEqual(
    heartbeatPayloadSchema.parse({ ...heartbeat, sync: { lastSyncAt: "2026-10-22T11:59:00Z", lastError: "" } }).sync,
    { lastSyncAt: "2026-10-22T11:59:00Z", lastError: "" },
  );
});
