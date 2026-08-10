import { ConvexError, v } from "convex/values";
import { isFleetManagedDevice } from "@showroom/contracts";

import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { buildManifestForDevice } from "./showroom";

const claimRegistrationTtlMs = 15 * 60_000;
const deviceCredentialTtlMs = 24 * 60 * 60_000;

function healthIssues(health: any) {
  if (!health || typeof health !== "object") return [] as string[];
  const issues: string[] = [];
  if (health.playerHealthy === false) issues.push("player_unhealthy");
  if (health.hdmiConnected === false) issues.push("hdmi_disconnected");
  if (typeof health.cpuTemperatureC === "number" && health.cpuTemperatureC >= 80) issues.push("cpu_hot");
  if (typeof health.signalPercent === "number" && health.signalPercent < 25) issues.push("wifi_weak");
  if (typeof health.throttledFlags === "string" && !/(?:^|=)0x0+$/i.test(health.throttledFlags)) issues.push("power_or_thermal_throttling");
  return issues;
}

async function hashValue(value: string) {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(buffer))
    .map((entry) => entry.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(length = 24) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnopqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function expiresAtFrom(now: number, ttlMs: number) {
  return now + ttlMs;
}

function secondsRemainingUntil(expiresAt: number, now: number) {
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}

function isCredentialRecordActive(
  record: { expiresAt?: number; revokedAt?: number },
  now = Date.now(),
) {
  if (record.revokedAt) {
    return false;
  }
  if (typeof record.expiresAt !== 'number') {
    return true;
  }
  return record.expiresAt > now;
}

async function resolveDeviceByCredential(
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

export const registerTemporary = mutation({
  args: {},
  returns: v.object({
    deviceSessionId: v.string(),
    claimCode: v.string(),
    claimToken: v.string(),
    pollingIntervalSeconds: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const deviceSessionId = randomToken(20);
    const claimCode = randomToken(6).toUpperCase();
    const claimToken = randomToken(32);

    await ctx.db.insert("deviceRegistrations", {
      deviceSessionId,
      claimCode,
      claimTokenHash: await hashValue(claimToken),
      createdAt: now,
      expiresAt: expiresAtFrom(now, claimRegistrationTtlMs),
    });

    return {
      deviceSessionId,
      claimCode,
      claimToken,
      pollingIntervalSeconds: 15,
    };
  },
});

export const getClaimStatus = query({
  args: {
    deviceSessionId: v.string(),
    claimToken: v.string(),
  },
  returns: v.object({
    claimed: v.boolean(),
    deviceId: v.optional(v.id("devices")),
    credential: v.optional(v.string()),
    expiresInSeconds: v.optional(v.number()),
    pollAgainSeconds: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const registration = await ctx.db
      .query("deviceRegistrations")
      .withIndex("by_session", (q) => q.eq("deviceSessionId", args.deviceSessionId))
      .unique();

    if (!registration) {
      throw new ConvexError("Unknown registration");
    }
    if (typeof registration.expiresAt === "number" && registration.expiresAt <= now) {
      throw new ConvexError("Claim session expired");
    }

    const tokenHash = await hashValue(args.claimToken);
    if (registration.claimTokenHash !== tokenHash) {
      throw new ConvexError("Invalid claim token");
    }

    let expiresInSeconds: number | undefined;
    if (registration.credential && registration.credentialExpiresAt) {
      expiresInSeconds = secondsRemainingUntil(registration.credentialExpiresAt, now);
    }

    return {
      claimed: Boolean(registration.claimedDeviceId && registration.credential),
      deviceId: registration.claimedDeviceId,
      credential: registration.credential,
      expiresInSeconds,
      pollAgainSeconds: 15,
    };
  },
});

export const refreshAuth = mutation({
  args: {
    credential: v.string(),
  },
  returns: v.object({
    deviceId: v.id("devices"),
    credential: v.string(),
    expiresInSeconds: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const device = await resolveDeviceByCredential(ctx, args.credential);
    if (!device) {
      throw new ConvexError("Unauthorized device");
    }

    const credential = randomToken(32);
    const secretHash = await hashValue(credential);
    const expiresAt = expiresAtFrom(now, deviceCredentialTtlMs);
    const existing = await ctx.db
      .query("deviceCredentials")
      .withIndex("by_device", (q) => q.eq("deviceId", device._id))
      .collect();

    for (const record of existing.filter((entry) => !entry.revokedAt)) {
      await ctx.db.patch(record._id, {
        revokedAt: now,
      });
    }

    await ctx.db.insert("deviceCredentials", {
      deviceId: device._id,
      version: existing.length + 1,
      secretHash,
      issuedAt: now,
      expiresAt,
    });

    return {
      deviceId: device._id,
      credential,
      expiresInSeconds: secondsRemainingUntil(expiresAt, now),
    };
  },
});

export const getManifest = query({
  args: {
    credential: v.string(),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const device = await resolveDeviceByCredential(ctx, args.credential);
    if (!device) {
      return null;
    }

    const manifest = (
      await ctx.db
        .query("compiledManifests")
        .withIndex("by_device_and_active", (q) =>
          q.eq("deviceId", device._id).eq("isActive", true),
        )
        .order("desc")
        .take(1)
    )[0];

    if (manifest) {
      return manifest.payload;
    }

    return buildManifestForDevice(
      ctx,
      device,
      device.manifestVersion ?? `manifest-${device._id}`,
    );
  },
});

export const claimCommands = mutation({
  args: {
    credential: v.string(),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const device = await resolveDeviceByCredential(ctx, args.credential);
    if (!device) {
      throw new ConvexError("Unauthorized device");
    }

    const now = Date.now();
    const queued = await ctx.db
      .query("deviceCommands")
      .withIndex("by_device_and_status", (q) => q.eq("deviceId", device._id).eq("status", "queued"))
      .order("asc")
      .take(10);

    if (!isFleetManagedDevice(device)) {
      await Promise.all(
        queued.map(async (command) => {
          await ctx.db.patch(command._id, {
            status: "in_progress",
            startedAt: now,
          });
          const rollout = await ctx.db
            .query("releaseRollouts")
            .withIndex("by_command", (q) => q.eq("commandId", command._id))
            .unique();
          if (rollout) {
            await ctx.db.patch(rollout._id, {
              status: "in_progress",
              startedAt: now,
              updatedAt: now,
            });
          }
        }),
      );
      return queued.map((command) => ({
        id: command._id,
        deviceId: device._id,
        commandType: command.commandType,
        issuedAt: new Date(command.queuedAt).toISOString(),
        payload: command.payload ?? {},
      }));
    }

    const leased = await ctx.db
      .query("deviceCommands")
      .withIndex("by_device_and_status", (q) => q.eq("deviceId", device._id).eq("status", "in_progress"))
      .order("asc")
      .take(10);
    const reclaimable = leased.filter((command) => (command.leaseExpiresAt ?? 0) <= now && (command.attempts ?? 0) < (command.maxAttempts ?? 5));
    const commands = [...reclaimable, ...queued].slice(0, 10);

    const startedAt = now;
    const claimed = await Promise.all(
      commands.map(async (command) => {
        if (command.deadlineAt && command.deadlineAt <= now) {
          await ctx.db.patch(command._id, { status: "failed", completedAt: now, resultMessage: "Command expired before delivery" });
          return null;
        }
        const attempts = (command.attempts ?? 0) + 1;
        if (attempts > (command.maxAttempts ?? 5)) {
          await ctx.db.patch(command._id, { status: "failed", completedAt: now, resultMessage: "Command retry limit exceeded" });
          return null;
        }
        const leaseToken = randomToken(24);
        await ctx.db.patch(command._id, {
          status: "in_progress",
          startedAt: command.startedAt ?? startedAt,
          attempts,
          leaseToken,
          leaseExpiresAt: now + 2 * 60_000,
        });
        return { command, leaseToken };
      }),
    );
    const activeClaims = claimed.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    await Promise.all(
      activeClaims.map(async ({ command }) => {
        const rollout = await ctx.db
          .query("releaseRollouts")
          .withIndex("by_command", (q) => q.eq("commandId", command._id))
          .unique();
        if (rollout) {
          await ctx.db.patch(rollout._id, {
            status: "in_progress",
            startedAt,
            updatedAt: startedAt,
          });
        }
      }),
    );

    return activeClaims.map(({ command, leaseToken }) => ({
      id: command._id,
      deviceId: device._id,
      commandType: command.commandType,
      issuedAt: new Date(command.queuedAt).toISOString(),
      payload: command.payload ?? {},
      leaseToken,
    }));
  },
});

export const generateScreenshotUploadUrl = mutation({
  args: {
    credential: v.string(),
  },
  returns: v.object({
    uploadUrl: v.string(),
  }),
  handler: async (ctx, args) => {
    const device = await resolveDeviceByCredential(ctx, args.credential);
    if (!device) {
      throw new ConvexError("Unauthorized device");
    }

    return {
      uploadUrl: await ctx.storage.generateUploadUrl(),
    };
  },
});

export const recordHeartbeat = mutation({
  args: {
    credential: v.string(),
    payload: v.any(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const device = await resolveDeviceByCredential(ctx, args.credential);
    if (!device) {
      throw new ConvexError("Unauthorized device");
    }

    const now = Date.now();
    const reportedAppliance = args.payload.appliance;
    const reportedManaged = isFleetManagedDevice({
      applianceGeneration: reportedAppliance?.generation,
      agentProtocolVersion: reportedAppliance?.protocolVersion,
      capabilities: reportedAppliance?.capabilities,
    });
    const managed = reportedManaged || isFleetManagedDevice(device);
    const applianceGeneration = reportedManaged
      ? reportedAppliance.generation
      : device.applianceGeneration;
    const agentProtocolVersion = reportedManaged
      ? reportedAppliance.protocolVersion
      : device.agentProtocolVersion;
    const capabilities = reportedManaged
      ? reportedAppliance.capabilities
      : device.capabilities;
    const health = managed ? args.payload.health : undefined;
    await ctx.db.insert("deviceHeartbeats", {
      organizationId: device.organizationId,
      deviceId: device._id,
      manifestVersion: args.payload.manifestVersion,
      uptimeSeconds: args.payload.uptimeSeconds,
      storageFreeBytes: args.payload.storageFreeBytes,
      storageTotalBytes: args.payload.storageTotalBytes,
      currentAssetId: args.payload.currentAssetId,
      currentPlaylistId: args.payload.currentPlaylistId,
      applianceGeneration,
      agentProtocolVersion,
      payload: args.payload,
      health,
      receivedAt: now,
    });

    const previousIssues = managed ? healthIssues(device.health) : [];
    const currentIssues = managed ? healthIssues(health) : [];
    if (managed && previousIssues.join(",") !== currentIssues.join(",")) {
      await ctx.db.insert("deviceDiagnostics", {
        organizationId: device.organizationId,
        deviceId: device._id,
        level: currentIssues.length ? "warning" : "info",
        source: "health",
        message: currentIssues.length
          ? `Health issues detected: ${currentIssues.join(", ")}`
          : "Device health recovered",
        metadata: { previousIssues, currentIssues, health },
        applianceGeneration,
        occurredAt: now,
      });
      const openHealthAlert = (await ctx.db
        .query("alertEvents")
        .withIndex("by_device", (q) => q.eq("deviceId", device._id))
        .order("desc")
        .take(20))
        .find((event) => event.alertType === "appliance_health" && event.state === "open");
      if (currentIssues.length && !openHealthAlert) {
        await ctx.db.insert("alertEvents", {
          organizationId: device.organizationId ?? "unclaimed",
          deviceId: device._id,
          alertType: "appliance_health",
          state: "open",
          openedAt: now,
          metadata: { issues: currentIssues, health },
        });
      } else if (!currentIssues.length && openHealthAlert) {
        await ctx.db.patch(openHealthAlert._id, {
          state: "resolved",
          resolvedAt: now,
          metadata: { recoveredHealth: health },
        });
      }
    }

    await ctx.db.patch(device._id, {
      status: "online",
      appVersion: args.payload.appVersion,
      agentVersion: args.payload.agentVersion,
      manifestVersion: args.payload.manifestVersion,
      currentAssetId: args.payload.currentAssetId,
      applianceGeneration,
      agentProtocolVersion,
      capabilities,
      applianceActivatedAt: reportedManaged
        ? device.applianceActivatedAt ?? now
        : device.applianceActivatedAt,
      health: managed ? health ?? device.health : device.health,
      lastHealthAt: managed && health ? now : device.lastHealthAt,
      hardwareProfile: managed
        ? health?.hardwareProfile ?? device.hardwareProfile
        : device.hardwareProfile,
      currentPlaylistName: await resolveCurrentPlaylistName(
        ctx,
        device.organizationId,
        args.payload.currentPlaylistId,
      ) ?? device.currentPlaylistName,
      lastHeartbeatAt: now,
      updatedAt: now,
    });

    return {
      ...args.payload,
      deviceId: device._id,
      receivedAt: new Date().toISOString(),
    };
  },
});

async function resolveCurrentPlaylistName(
  ctx: MutationCtx,
  orgId: string | undefined,
  playlistId: string | undefined,
) {
  if (!orgId || !playlistId) {
    return null;
  }

  const normalizedId = ctx.db.normalizeId("playlists", playlistId);
  if (!normalizedId) return null;
  const record = await ctx.db.get(normalizedId);
  return record?.organizationId === orgId ? record.name : null;
}

export const recordScreenshot = mutation({
  args: {
    credential: v.string(),
    payload: v.object({
      capturedAt: v.string(),
      mimeType: v.string(),
      bytes: v.number(),
      storageId: v.optional(v.id("_storage")),
    }),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const device = await resolveDeviceByCredential(ctx, args.credential);
    if (!device) {
      throw new ConvexError("Unauthorized device");
    }

    const publicUrl = args.payload.storageId
      ? (await ctx.storage.getUrl(args.payload.storageId)) ?? device.screenshotUrl ?? ""
      : device.screenshotUrl ?? "";

    await ctx.db.insert("deviceScreenshots", {
      organizationId: device.organizationId,
      deviceId: device._id,
      storageId: args.payload.storageId,
      publicUrl,
      capturedAt: Date.parse(args.payload.capturedAt),
      bytes: args.payload.bytes,
      applianceGeneration: device.applianceGeneration,
      createdAt: Date.now(),
    });

    await ctx.db.patch(device._id, {
      screenshotUrl: publicUrl,
      updatedAt: Date.now(),
    });

    return {
      deviceId: device._id,
      publicUrl,
      capturedAt: args.payload.capturedAt,
      bytes: args.payload.bytes,
    };
  },
});

export const recordCommandResult = mutation({
  args: {
    credential: v.string(),
    payload: v.object({
      commandId: v.id("deviceCommands"),
      status: v.union(
        v.literal("queued"),
        v.literal("in_progress"),
        v.literal("succeeded"),
        v.literal("failed"),
      ),
      message: v.optional(v.string()),
      completedAt: v.optional(v.string()),
      leaseToken: v.optional(v.string()),
    }),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const device = await resolveDeviceByCredential(ctx, args.credential);
    if (!device) {
      throw new ConvexError("Unauthorized device");
    }

    const command = await ctx.db.get(args.payload.commandId);
    if (!command || command.deviceId !== device._id) {
      throw new ConvexError("Command not found");
    }
    if (command.leaseToken && args.payload.leaseToken !== command.leaseToken) {
      throw new ConvexError("Command lease is no longer valid");
    }

    await ctx.db.patch(command._id, {
      status: args.payload.status,
      startedAt:
        args.payload.status === "in_progress"
          ? Date.now()
          : command.startedAt,
      resultMessage: args.payload.message,
      completedAt:
        args.payload.status === "succeeded" || args.payload.status === "failed"
          ? args.payload.completedAt
            ? Date.parse(args.payload.completedAt)
            : Date.now()
          : command.completedAt,
      leaseExpiresAt: undefined,
      payload:
        command.commandType === "update_network" && args.payload.status !== "in_progress"
          ? { redacted: true, ssid: command.payload?.ssid }
          : command.payload,
    });

    const rollout = await ctx.db
      .query("releaseRollouts")
      .withIndex("by_command", (q) => q.eq("commandId", command._id))
      .unique();
    if (rollout) {
      await ctx.db.patch(rollout._id, {
        status: args.payload.status,
        startedAt:
          args.payload.status === "in_progress"
            ? Date.now()
            : rollout.startedAt,
        completedAt:
          args.payload.status === "succeeded" || args.payload.status === "failed"
            ? args.payload.completedAt
              ? Date.parse(args.payload.completedAt)
              : Date.now()
            : rollout.completedAt,
        message: args.payload.message,
        updatedAt: Date.now(),
      });
    }

    return {
      ...args.payload,
      deviceId: device._id,
    };
  },
});
