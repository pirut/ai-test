import assert from "node:assert/strict";
import test from "node:test";

import { deviceSummarySchema } from "@showroom/contracts";

import { readApiPayload } from "../apps/admin/src/lib/api-response";
import { serializeScreenDetail } from "../convex/screenSerialization";

test("screen settings mutation serializes the complete managed appliance response", () => {
  const response = serializeScreenDetail({
    _id: "device-1",
    _creationTime: Date.parse("2026-08-12T13:00:00.000Z"),
    organizationId: "org-1",
    name: "Brombal Main Screen",
    siteName: "Brombal Showroom",
    timezone: "America/New_York",
    orientation: 0,
    volume: 75,
    manifestVersion: "manifest-1",
    lastHeartbeatAt: Date.parse("2026-08-12T15:00:00.000Z"),
    applianceGeneration: "showroom-appliance-v2",
    agentProtocolVersion: 2,
    capabilities: [
      "appliance_telemetry",
      "app_slot_rollback",
      "leased_commands",
      "network_rotation",
      "signed_releases",
      "staged_rollouts",
      "transactional_content",
    ],
    applianceActivatedAt: Date.parse("2026-08-12T13:00:00.000Z"),
  } as never, null);
  const parsed = deviceSummarySchema.safeParse(response);

  assert.equal(parsed.success, true);
  assert.equal(response.volume, 75);
  assert.equal(response.fleetManagementState, "managed");
});

test("screen settings reports an empty server error without throwing a JSON parser error", async () => {
  const response = new Response(null, { status: 500 });
  const payload = await readApiPayload(response);

  assert.deepEqual(payload, {});
});

test("screen settings reports malformed JSON as an actionable server response", async () => {
  const response = new Response("not-json", { status: 502 });
  const payload = await readApiPayload(response);

  assert.equal(payload.error, "The server returned an invalid response (502).");
});
