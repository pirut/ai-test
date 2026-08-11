import assert from "node:assert/strict";
import test from "node:test";

import * as mock from "../apps/admin/src/lib/mock-store";

function resetMockFleet() {
  delete (globalThis as typeof globalThis & { __showroomMockState?: unknown }).__showroomMockState;
}

test("removing a screen clears its mock fleet records", () => {
  resetMockFleet();
  assert.ok(mock.getDevice("org-demo", "device-demo-001"));
  assert.ok(mock.getCommandsForDevice("device-demo-001").length > 0);

  const result = mock.removeScreen("org-demo", "device-demo-001");

  assert.equal(result.removedDeviceId, "device-demo-001");
  assert.equal(mock.getDevice("org-demo", "device-demo-001"), null);
  assert.deepEqual(mock.getCommandsForDevice("device-demo-001"), []);
  assert.equal(mock.latestScreenshot("device-demo-001"), null);
  resetMockFleet();
});

test("screen removal is scoped to the active organization", () => {
  resetMockFleet();
  assert.throws(
    () => mock.removeScreen("org-someone-else", "device-demo-001"),
    /Screen not found/,
  );
  assert.ok(mock.getDevice("org-demo", "device-demo-001"));
  resetMockFleet();
});
