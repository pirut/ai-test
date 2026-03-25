import assert from "node:assert/strict";
import test from "node:test";

import {
  DEVICE_CREDENTIAL_TTL_MS,
  expiresAtFrom,
  isCredentialRecordActive,
  secondsRemainingUntil,
} from "../convex/lib";

test("credential records expire when their TTL elapses", () => {
  const issuedAt = Date.UTC(2026, 2, 23, 12, 0, 0);
  const expiresAt = expiresAtFrom(issuedAt, DEVICE_CREDENTIAL_TTL_MS);

  assert.equal(isCredentialRecordActive({ expiresAt }, issuedAt), true);
  assert.equal(isCredentialRecordActive({ expiresAt }, expiresAt), false);
  assert.equal(
    isCredentialRecordActive({ expiresAt, revokedAt: issuedAt + 1 }, issuedAt + 2),
    false,
  );
});

test("secondsRemainingUntil never returns a negative value", () => {
  const now = Date.UTC(2026, 2, 23, 12, 0, 0);

  assert.equal(secondsRemainingUntil(now + 1_500, now), 2);
  assert.equal(secondsRemainingUntil(now - 10_000, now), 0);
});
