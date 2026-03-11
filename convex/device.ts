import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { hashValue, randomToken, resolveDeviceByCredential } from "./lib";

export const registerTemporary = mutation({
  args: {},
  returns: v.object({
    deviceSessionId: v.string(),
    claimCode: v.string(),
    claimToken: v.string(),
    pollingIntervalSeconds: v.number(),
  }),
  handler: async (ctx) => {
    const deviceSessionId = randomToken(20);
    const claimCode = randomToken(6).toUpperCase();
    const claimToken = randomToken(32);

    await ctx.db.insert("deviceRegistrations", {
      deviceSessionId,
      claimCode,
      claimTokenHash: await hashValue(claimToken),
      createdAt: Date.now(),
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
    pollAgainSeconds: v.number(),
  }),
  handler: async (ctx, args) => {
    const registration = await ctx.db
      .query("deviceRegistrations")
      .withIndex("by_session", (q) => q.eq("deviceSessionId", args.deviceSessionId))
      .unique();

    if (!registration) {
      throw new ConvexError("Unknown registration");
    }

    const tokenHash = await hashValue(args.claimToken);
    if (registration.claimTokenHash !== tokenHash) {
      throw new ConvexError("Invalid claim token");
    }

    return {
      claimed: Boolean(registration.claimedDeviceId && registration.credential),
      deviceId: registration.claimedDeviceId,
      credential: registration.credential,
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
    const device = await resolveDeviceByCredential(ctx, args.credential);
    if (!device) {
      throw new ConvexError("Unauthorized device");
    }

    const credential = randomToken(32);
    const secretHash = await hashValue(credential);
    const existing = await ctx.db
      .query("deviceCredentials")
      .withIndex("by_device", (q) => q.eq("deviceId", device._id))
      .collect();

    for (const record of existing.filter((entry) => !entry.revokedAt)) {
      await ctx.db.patch(record._id, {
        revokedAt: Date.now(),
      });
    }

    await ctx.db.insert("deviceCredentials", {
      deviceId: device._id,
      version: existing.length + 1,
      secretHash,
      issuedAt: Date.now(),
    });

    return {
      deviceId: device._id,
      credential,
      expiresInSeconds: 86_400,
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
        .withIndex("by_device_and_active", (q) => q.eq("deviceId", device._id))
        .filter((q) => q.eq(q.field("isActive"), true))
        .order("desc")
        .take(1)
    )[0];

    if (manifest) {
      return manifest.payload;
    }

    return {
      manifestVersion: device.manifestVersion ?? `manifest-${device._id}`,
      deviceId: device._id,
      generatedAt: new Date().toISOString(),
      timezone: device.timezone,
      orientation: device.orientation,
      volume: device.volume,
      defaultPlaylist: [],
      scheduleWindows: [],
      assetBaseUrl: "",
      assetChecksums: {},
    };
  },
});

export const pullCommands = query({
  args: {
    credential: v.string(),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const device = await resolveDeviceByCredential(ctx, args.credential);
    if (!device) {
      throw new ConvexError("Unauthorized device");
    }

    const commands = await ctx.db
      .query("deviceCommands")
      .withIndex("by_device_and_status", (q) => q.eq("deviceId", device._id))
      .filter((q) => q.eq(q.field("status"), "queued"))
      .collect();

    return commands.map((command) => ({
      id: command._id,
      deviceId: device._id,
      commandType: command.commandType,
      issuedAt: new Date(command.queuedAt).toISOString(),
      payload: command.payload ?? {},
    }));
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

    await ctx.db.insert("deviceHeartbeats", {
      organizationId: device.organizationId,
      deviceId: device._id,
      manifestVersion: args.payload.manifestVersion,
      uptimeSeconds: args.payload.uptimeSeconds,
      storageFreeBytes: args.payload.storageFreeBytes,
      storageTotalBytes: args.payload.storageTotalBytes,
      currentAssetId: args.payload.currentAssetId,
      currentPlaylistId: args.payload.currentPlaylistId,
      payload: args.payload,
      receivedAt: Date.now(),
    });

    await ctx.db.patch(device._id, {
      status: "online",
      appVersion: args.payload.appVersion,
      agentVersion: args.payload.agentVersion,
      manifestVersion: args.payload.manifestVersion,
      currentPlaylistName: args.payload.currentPlaylistId ?? device.currentPlaylistName,
      lastHeartbeatAt: Date.now(),
      updatedAt: Date.now(),
    });

    return {
      ...args.payload,
      deviceId: device._id,
      receivedAt: new Date().toISOString(),
    };
  },
});

export const recordScreenshot = mutation({
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

    const publicUrl = `https://picsum.photos/seed/${device._id}/1280/720`;
    await ctx.db.insert("deviceScreenshots", {
      organizationId: device.organizationId,
      deviceId: device._id,
      publicUrl,
      capturedAt: Date.parse(args.payload.capturedAt),
      bytes: args.payload.bytes,
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

    await ctx.db.patch(command._id, {
      status: args.payload.status,
      resultMessage: args.payload.message,
      completedAt: args.payload.completedAt
        ? Date.parse(args.payload.completedAt)
        : Date.now(),
    });

    return {
      ...args.payload,
      deviceId: device._id,
    };
  },
});
