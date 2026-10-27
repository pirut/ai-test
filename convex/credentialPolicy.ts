// Device credential lifecycle rules shared by the device API mutations.
//
// Screens are often powered off or offline for long stretches (closed stores,
// holiday weekends, router outages). A credential that expired while the screen
// was offline must still be exchangeable for a fresh one, otherwise the screen
// can never reach the cloud again without being re-flashed. Removing a screen
// deletes its credentials, which is what actually ends access.

const minute = 60_000;
const day = 24 * 60 * minute;

export const deviceCredentialTtlMs = day;
// How long an expired (but not revoked or superseded) credential may still be
// used to obtain a new one.
export const credentialRefreshGraceMs = 30 * day;
// How long the previous credential keeps working after a rotation. Covers a
// refresh response that was lost in transit and in-flight requests that were
// signed with the old credential.
export const credentialRotationGraceMs = 10 * minute;

export type CredentialRecord = {
  expiresAt?: number;
  revokedAt?: number;
  supersededAt?: number;
};

export function isCredentialRecordActive(record: CredentialRecord, now = Date.now()) {
  if (record.revokedAt) return false;
  if (record.supersededAt && record.supersededAt + credentialRotationGraceMs <= now) return false;
  if (typeof record.expiresAt !== "number") return true;
  return record.expiresAt > now;
}

export function canRefreshCredential(record: CredentialRecord, now = Date.now()) {
  if (record.revokedAt) return false;
  if (record.supersededAt && record.supersededAt + credentialRotationGraceMs <= now) return false;
  if (typeof record.expiresAt !== "number") return true;
  return record.expiresAt + credentialRefreshGraceMs > now;
}

// What to do with each existing credential when a new one is issued: keep the
// ones still inside their rotation grace, supersede the current ones, and drop
// anything that can no longer authenticate so the table stays bounded.
export function planCredentialRotation(record: CredentialRecord, now = Date.now()) {
  if (record.revokedAt) return { action: "delete" as const };
  if (record.supersededAt) {
    return record.supersededAt + credentialRotationGraceMs <= now
      ? { action: "delete" as const }
      : { action: "keep" as const };
  }
  const graceEndsAt = now + credentialRotationGraceMs;
  return {
    action: "supersede" as const,
    patch: {
      supersededAt: now,
      expiresAt:
        typeof record.expiresAt === "number" ? Math.min(record.expiresAt, graceEndsAt) : graceEndsAt,
    },
  };
}

// A claimed registration keeps handing the credential to the screen after the
// pairing code itself expires, so a screen that was claimed seconds before the
// code timed out (or that lost power right after) still finishes pairing.
export function canDeliverClaimedCredential(
  registration: { claimedDeviceId?: unknown; credential?: string; credentialExpiresAt?: number },
  now = Date.now(),
) {
  if (!registration.claimedDeviceId || !registration.credential) return false;
  if (typeof registration.credentialExpiresAt !== "number") return true;
  return registration.credentialExpiresAt + credentialRefreshGraceMs > now;
}
