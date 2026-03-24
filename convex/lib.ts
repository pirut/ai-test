import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export const CLAIM_REGISTRATION_TTL_MS = 15 * 60_000;
export const DEVICE_CREDENTIAL_TTL_MS = 24 * 60 * 60_000;

export async function hashValue(value: string) {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(buffer))
    .map((entry) => entry.toString(16).padStart(2, "0"))
    .join("");
}

export function randomToken(length = 24) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnopqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function expiresAtFrom(now: number, ttlMs: number) {
  return now + ttlMs;
}

export function secondsRemainingUntil(expiresAt: number, now: number) {
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}

export function isCredentialRecordActive(
  record: { expiresAt?: number; revokedAt?: number },
  now = Date.now(),
) {
  if (record.revokedAt) {
    return false;
  }
  if (typeof record.expiresAt !== "number") {
    return true;
  }
  return record.expiresAt > now;
}

function extractClaim(identity: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = identity[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function extractOrgClaims(identity: Record<string, unknown>) {
  const compactOrg =
    identity.o && typeof identity.o === "object"
      ? (identity.o as Record<string, unknown>)
      : null;

  const orgId =
    extractClaim(identity, ["orgId", "org_id", "organization_id"]) ??
    (compactOrg && typeof compactOrg.id === "string" ? compactOrg.id : null);

  const rawRole =
    extractClaim(identity, ["orgRole", "org_role", "role"]) ??
    (compactOrg && typeof compactOrg.rol === "string" ? compactOrg.rol : null) ??
    "org:member";

  const role =
    rawRole === "admin"
      ? "org:admin"
      : rawRole === "member"
        ? "org:member"
        : rawRole;

  return { orgId, role };
}

export async function requireOrgIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Authentication required");
  }

  const claims = identity as unknown as Record<string, unknown>;
  const { orgId, role } = extractOrgClaims(claims);

  if (!orgId) {
    throw new ConvexError("Organization context required");
  }

  return {
    orgId,
    role,
    userId: identity.subject,
    email: typeof claims.email === "string" ? claims.email : "",
  };
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const identity = await requireOrgIdentity(ctx);
  if (identity.role !== "org:admin") {
    throw new ConvexError("Admin role required");
  }
  return identity;
}

export async function resolveDeviceByCredential(
  ctx: QueryCtx | MutationCtx,
  credential: string,
) {
  const now = Date.now();
  const secretHash = await hashValue(credential);
  const record = await ctx.db
    .query("deviceCredentials")
    .withIndex("by_secret_hash", (q) => q.eq("secretHash", secretHash))
    .unique();

  if (!record || !isCredentialRecordActive(record, now)) {
    return null;
  }

  return ctx.db.get(record.deviceId);
}
