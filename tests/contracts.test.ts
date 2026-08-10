import assert from "node:assert/strict";
import test from "node:test";

import {
  fleetManagedCapabilities,
  fleetManagedGeneration,
  fleetManagedProtocolVersion,
  deviceCommandResultSchema,
  heartbeatPayloadSchema,
  isFleetManagedDevice,
  requiresFleetManagedDevice,
  releaseUpdatePayloadSchema,
  rolloutRingForIndex,
  shouldPauseRollout,
} from "@showroom/contracts";

const digest = "a".repeat(64);

test("release updates require a checksum for every supplied artifact", () => {
  const unsafe = releaseUpdatePayloadSchema.safeParse({
    playerUrl: "https://example.com/player.tar.gz",
  });
  assert.equal(unsafe.success, false);

  const safe = releaseUpdatePayloadSchema.safeParse({
    playerUrl: "https://example.com/player.tar.gz",
    playerSha256: digest,
    playerSignature: "signed-digest",
    signingKeyId: "production-2026",
  });
  assert.equal(safe.success, true);
});

test("release updates reject checksummed but unsigned artifacts", () => {
  const result = releaseUpdatePayloadSchema.safeParse({
    agentUrl: "https://example.com/agent",
    agentSha256: digest,
    signingKeyId: "production-2026",
  });
  assert.equal(result.success, false);
});

test("fleet rings canary the first device and eventually include the fleet", () => {
  assert.equal(rolloutRingForIndex(0, 100), 0);
  assert.equal(rolloutRingForIndex(1, 100), 1);
  assert.equal(rolloutRingForIndex(5, 100), 2);
  assert.equal(rolloutRingForIndex(99, 100), 3);
});

test("failure gates pause at the configured percentage", () => {
  assert.equal(shouldPauseRollout(1, 10, 10), true);
  assert.equal(shouldPauseRollout(1, 20, 10), false);
  assert.equal(shouldPauseRollout(0, 1, 10), false);
});

test("legacy device heartbeats remain valid but do not activate fleet management", () => {
  const legacyHeartbeat = heartbeatPayloadSchema.parse({
    deviceId: "legacy-pi",
    appVersion: "player-v1",
    agentVersion: "agent-v1",
    uptimeSeconds: 60,
    storageFreeBytes: 1_000,
    storageTotalBytes: 2_000,
    lastSeenAt: "2026-08-10T12:00:00.000Z",
  });

  assert.equal(legacyHeartbeat.appliance, undefined);
  assert.equal(isFleetManagedDevice({}), false);
});

test("a flashed appliance activates only after reporting the complete fleet contract", () => {
  const incomplete = {
    applianceGeneration: fleetManagedGeneration,
    agentProtocolVersion: fleetManagedProtocolVersion,
    capabilities: fleetManagedCapabilities.filter((capability) => capability !== "leased_commands"),
  };
  assert.equal(isFleetManagedDevice(incomplete), false);

  assert.equal(isFleetManagedDevice({
    applianceGeneration: fleetManagedGeneration,
    agentProtocolVersion: fleetManagedProtocolVersion,
    capabilities: [...fleetManagedCapabilities],
  }), true);
});

test("legacy controls stay compatible while fleet-only mutations wait for the flash", () => {
  assert.equal(requiresFleetManagedDevice("sync_now"), false);
  assert.equal(requiresFleetManagedDevice("restart_player"), false);
  assert.equal(requiresFleetManagedDevice("reboot_device"), false);
  assert.equal(requiresFleetManagedDevice("update_network"), true);
  assert.equal(requiresFleetManagedDevice("update_release"), true);
});

test("legacy command completion uses the authenticated device without a redundant device id", () => {
  const result = deviceCommandResultSchema.safeParse({
    commandId: "command-123",
    status: "succeeded",
    completedAt: "2026-08-10T12:00:00.000Z",
  });
  assert.equal(result.success, true);
});
