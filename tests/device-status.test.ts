import assert from "node:assert/strict";
import test from "node:test";

import { deriveDeviceStatus } from "../convex/showroom";

test("deriveDeviceStatus respects online, stale, offline, and unclaimed windows", () => {
  const now = Date.now();
  const realNow = Date.now;

  Date.now = () => now;

  try {
    assert.equal(deriveDeviceStatus({ status: "unclaimed", lastHeartbeatAt: undefined }), "unclaimed");
    assert.equal(deriveDeviceStatus({ status: "offline", lastHeartbeatAt: undefined }), "offline");
    assert.equal(deriveDeviceStatus({ status: "online", lastHeartbeatAt: now - 30_000 }), "online");
    assert.equal(deriveDeviceStatus({ status: "online", lastHeartbeatAt: now - 3 * 60_000 }), "stale");
    assert.equal(deriveDeviceStatus({ status: "online", lastHeartbeatAt: now - 6 * 60_000 }), "offline");
  } finally {
    Date.now = realNow;
  }
});
