import assert from "node:assert/strict";
import test from "node:test";
import { heartbeatPayloadSchema } from "@showroom/contracts";

import {
  authenticateDevice,
  listDevices,
  recordHeartbeat,
  resetMockState,
  seedHeartbeatLoadDevices,
} from "../apps/admin/src/lib/mock-store";
import { runHeartbeatLoadSimulation } from "../apps/admin/src/lib/load-testing/heartbeat-load";

test("heartbeat load simulation supports one-minute cadence for 1000 devices", async () => {
  resetMockState();
  const seeded = seedHeartbeatLoadDevices({
    count: 1_000,
    orgId: "org_heartbeat_load",
  });

  const result = await runHeartbeatLoadSimulation({
    devices: seeded.devices,
    cadenceSeconds: 60,
    concurrency: 50,
    budget: {
      maxFailureRate: 0,
      maxP95LatencyMs: 100,
      maxTotalDurationMs: 10_000,
    },
    sendHeartbeat: async (device, payload) => {
      const authenticated = authenticateDevice(device.credential);
      if (!authenticated) {
        throw new Error("Unauthorized device");
      }

      const heartbeat = recordHeartbeat(
        authenticated.id,
        heartbeatPayloadSchema.parse(payload),
      );
      if (!heartbeat) {
        throw new Error("Heartbeat was not recorded");
      }
    },
  });

  assert.equal(result.failed, 0);
  assert.equal(result.succeeded, 1_000);
  assert.equal(
    listDevices(seeded.orgId).filter((device) => device.status === "online").length,
    1_000,
  );
  assert.equal(result.budgetPassed, true, JSON.stringify(result, null, 2));
  assert.ok(result.achievedRequestsPerSecond >= result.requiredRequestsPerSecond);
});
