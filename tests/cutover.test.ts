import assert from "node:assert/strict";
import test from "node:test";

import {
  fleetManagedCapabilities,
  fleetManagedGeneration,
  fleetManagedProtocolVersion,
} from "@showroom/contracts";
import * as mock from "../apps/admin/src/lib/mock-store";

function resetMockFleet() {
  delete (globalThis as typeof globalThis & { __showroomMockState?: unknown }).__showroomMockState;
}

test("a legacy screen becomes fleet-managed only after its appliance heartbeat", () => {
  resetMockFleet();
  assert.throws(
    () => mock.issueCommand({
      deviceId: "device-demo-003",
      commandType: "update_network",
      payload: { ssid: "New showroom", password: "temporary-secret" },
    }),
    /Flash this device/,
  );

  mock.recordHeartbeat("device-demo-003", {
    deviceId: "device-demo-003",
    appVersion: "2.0.0",
    agentVersion: "2.0.0",
    uptimeSeconds: 60,
    storageFreeBytes: 1_000,
    storageTotalBytes: 2_000,
    lastSeenAt: "2026-08-10T12:00:00.000Z",
    appliance: {
      generation: fleetManagedGeneration,
      protocolVersion: fleetManagedProtocolVersion,
      capabilities: [...fleetManagedCapabilities],
    },
  });

  const activated = mock.getDevice("org-demo", "device-demo-003");
  assert.equal(activated?.fleetManagementState, "managed");
  assert.equal(activated?.applianceGeneration, fleetManagedGeneration);
  assert.doesNotThrow(() => mock.issueCommand({
    deviceId: "device-demo-003",
    commandType: "update_network",
    payload: { ssid: "New showroom", password: "temporary-secret" },
  }));
  resetMockFleet();
});

test("deploy-to-all excludes legacy screens", () => {
  resetMockFleet();
  const release = mock.createRelease({
    name: "Managed appliance release",
    version: "2.0.1",
    playerUrl: "https://example.com/player.tar.gz",
    playerSha256: "a".repeat(64),
  });

  const rollout = mock.deployRelease({ releaseId: release.id });
  assert.equal(rollout.queuedDeviceCount, 2);
  assert.equal(
    mock.getCommandsForDevice("device-demo-003").some((command) => command.commandType === "update_release"),
    false,
  );
  resetMockFleet();
});
