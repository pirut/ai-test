import assert from "node:assert/strict";
import test from "node:test";

import {
  canDeliverClaimedCredential,
  canRefreshCredential,
  credentialRefreshGraceMs,
  credentialRotationGraceMs,
  isCredentialRecordActive,
  planCredentialRotation,
} from "../convex/credentialPolicy";

const now = Date.UTC(2026, 9, 6, 12);
const day = 24 * 60 * 60_000;

test("a screen that was offline past expiry can still refresh its credential", () => {
  const record = { expiresAt: now - 3 * day };
  assert.equal(isCredentialRecordActive(record, now), false);
  assert.equal(canRefreshCredential(record, now), true);
});

test("refresh stops working after the offline grace window", () => {
  const record = { expiresAt: now - credentialRefreshGraceMs - 1 };
  assert.equal(canRefreshCredential(record, now), false);
});

test("revoked credentials can never authenticate or refresh", () => {
  const record = { expiresAt: now + day, revokedAt: now - 1 };
  assert.equal(isCredentialRecordActive(record, now), false);
  assert.equal(canRefreshCredential(record, now), false);
});

test("rotation keeps the previous credential working for a short grace period", () => {
  const plan = planCredentialRotation({ expiresAt: now + day }, now);
  assert.equal(plan.action, "supersede");
  assert.ok(plan.action === "supersede");
  assert.equal(plan.patch.expiresAt, now + credentialRotationGraceMs);

  const superseded = { ...plan.patch };
  assert.equal(isCredentialRecordActive(superseded, now + 60_000), true);
  assert.equal(canRefreshCredential(superseded, now + 60_000), true);
  assert.equal(isCredentialRecordActive(superseded, now + credentialRotationGraceMs), false);
  assert.equal(canRefreshCredential(superseded, now + credentialRotationGraceMs), false);
});

test("rotation deletes credentials that can no longer be used", () => {
  assert.equal(planCredentialRotation({ revokedAt: now - 1 }, now).action, "delete");
  assert.equal(
    planCredentialRotation({ supersededAt: now - credentialRotationGraceMs }, now).action,
    "delete",
  );
  assert.equal(planCredentialRotation({ supersededAt: now - 1 }, now).action, "keep");
});

test("a claimed screen receives its credential even after the pairing code expires", () => {
  assert.equal(
    canDeliverClaimedCredential(
      { claimedDeviceId: "device-1", credential: "secret", credentialExpiresAt: now - day },
      now,
    ),
    true,
  );
  assert.equal(canDeliverClaimedCredential({ claimedDeviceId: undefined }, now), false);
});
