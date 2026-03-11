import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAdmin, requireOrgIdentity, hashValue, randomToken } from "./lib";

export const listScreens = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const { orgId } = await requireOrgIdentity(ctx);
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_org", (q) => q.eq("organizationId", orgId))
      .collect();

    return devices.map((device) => ({
      id: device._id,
      name: device.name ?? "Unnamed screen",
      siteName: device.siteName ?? "Unassigned",
      status: device.status,
      lastHeartbeatAt: new Date(device.lastHeartbeatAt ?? device._creationTime).toISOString(),
      screenshotUrl: device.screenshotUrl ?? null,
      currentPlaylistName: device.currentPlaylistName ?? null,
      manifestVersion: device.manifestVersion ?? null,
    }));
  },
});

export const getScreenDetail = query({
  args: {
    deviceId: v.id("devices"),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const { orgId } = await requireOrgIdentity(ctx);
    const device = await ctx.db.get(args.deviceId);

    if (!device || device.organizationId !== orgId) {
      return null;
    }

    return {
      id: device._id,
      name: device.name ?? "Unnamed screen",
      siteName: device.siteName ?? "Unassigned",
      status: device.status,
      lastHeartbeatAt: new Date(device.lastHeartbeatAt ?? device._creationTime).toISOString(),
      screenshotUrl: device.screenshotUrl ?? null,
      currentPlaylistName: device.currentPlaylistName ?? null,
      manifestVersion: device.manifestVersion ?? null,
      timezone: device.timezone,
      orientation: device.orientation,
      volume: device.volume,
    };
  },
});

export const getLatestScreenshot = query({
  args: {
    deviceId: v.id("devices"),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const { orgId } = await requireOrgIdentity(ctx);
    const device = await ctx.db.get(args.deviceId);
    if (!device || device.organizationId !== orgId) {
      return null;
    }

    const screenshot = await ctx.db
      .query("deviceScreenshots")
      .withIndex("by_device_and_captured_at", (q) => q.eq("deviceId", device._id))
      .order("desc")
      .first();

    if (!screenshot) {
      return null;
    }

    return {
      deviceId: args.deviceId,
      publicUrl: screenshot.publicUrl,
      capturedAt: new Date(screenshot.capturedAt).toISOString(),
      bytes: screenshot.bytes,
    };
  },
});

export const listDeviceCommands = query({
  args: {
    deviceId: v.optional(v.id("devices")),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const { orgId } = await requireOrgIdentity(ctx);
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_org", (q) => q.eq("organizationId", orgId))
      .collect();

    const allowedIds = new Set(devices.map((device) => device._id));
    if (args.deviceId && !allowedIds.has(args.deviceId)) {
      return [];
    }

    const commands = args.deviceId
      ? await ctx.db
          .query("deviceCommands")
          .withIndex("by_device_and_queued_at", (q) => q.eq("deviceId", args.deviceId!))
          .order("desc")
          .take(20)
      : await ctx.db.query("deviceCommands").order("desc").take(50);

    return commands
      .filter((command) => allowedIds.has(command.deviceId))
      .map((command) => ({
        id: command._id,
        deviceId: command.deviceId,
        commandType: command.commandType,
        issuedAt: new Date(command.queuedAt).toISOString(),
        payload: command.payload ?? {},
      }));
  },
});

export const listMediaAssets = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const { orgId } = await requireOrgIdentity(ctx);
    const assets = await ctx.db
      .query("mediaAssets")
      .withIndex("by_org", (q) => q.eq("organizationId", orgId))
      .collect();

    return assets.map((asset) => ({
      id: asset._id,
      title: asset.title,
      type: asset.mediaType,
      mimeType: asset.mimeType,
      fileName: asset.fileName,
      sizeBytes: asset.sizeBytes,
      width: asset.width,
      height: asset.height,
      durationSeconds: asset.durationSeconds,
      storagePath: asset.storagePath,
      previewUrl: asset.previewUrl,
      checksum: asset.checksum,
      tags: asset.tags,
    }));
  },
});

export const listPlaylists = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const { orgId } = await requireOrgIdentity(ctx);
    const playlists = await ctx.db
      .query("playlists")
      .withIndex("by_org", (q) => q.eq("organizationId", orgId))
      .collect();

    const items = await ctx.db.query("playlistItems").collect();
    const assets = await ctx.db.query("mediaAssets").collect();
    const assetMap = new Map(assets.map((asset) => [asset._id, asset]));

    return playlists.map((playlist) => ({
      id: playlist._id,
      name: playlist.name,
      items: items
        .filter((item) => item.playlistId === playlist._id)
        .sort((a, b) => a.itemOrder - b.itemOrder)
        .map((item) => {
          const asset = assetMap.get(item.mediaAssetId);
          if (!asset) {
            throw new ConvexError("Playlist item asset missing");
          }
          return {
            id: item._id,
            order: item.itemOrder,
            dwellSeconds: item.dwellSeconds ?? null,
            asset: {
              id: asset._id,
              title: asset.title,
              type: asset.mediaType,
              mimeType: asset.mimeType,
              fileName: asset.fileName,
              sizeBytes: asset.sizeBytes,
              width: asset.width,
              height: asset.height,
              durationSeconds: asset.durationSeconds,
              storagePath: asset.storagePath,
              previewUrl: asset.previewUrl,
              checksum: asset.checksum,
              tags: asset.tags,
            },
          };
        }),
    }));
  },
});

export const listSchedules = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const { orgId } = await requireOrgIdentity(ctx);
    const schedules = await ctx.db
      .query("schedules")
      .withIndex("by_org", (q) => q.eq("organizationId", orgId))
      .collect();

    return schedules.map((schedule) => ({
      id: schedule._id,
      label: schedule.name,
      startsAt: new Date(schedule.startsAt).toISOString(),
      endsAt: new Date(schedule.endsAt).toISOString(),
      priority: schedule.priority,
    }));
  },
});

export const generateMediaUploadUrl = mutation({
  args: {
    fileName: v.string(),
    mimeType: v.string(),
    bytes: v.number(),
  },
  returns: v.object({
    assetId: v.string(),
    uploadUrl: v.string(),
    storagePath: v.string(),
    expiresInSeconds: v.number(),
  }),
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);
    const uploadUrl = await ctx.storage.generateUploadUrl();
    const assetId = randomToken(16);

    return {
      assetId,
      uploadUrl,
      storagePath: `media/${orgId}/${assetId}-${args.fileName}`,
      expiresInSeconds: 3600,
    };
  },
});

export const claimDeviceByCode = mutation({
  args: {
    claimCode: v.string(),
    name: v.string(),
    siteName: v.string(),
  },
  returns: v.object({
    deviceId: v.id("devices"),
    credential: v.string(),
  }),
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);
    const registration = await ctx.db
      .query("deviceRegistrations")
      .withIndex("by_claim_code", (q) => q.eq("claimCode", args.claimCode))
      .first();

    if (!registration) {
      throw new ConvexError("Invalid claim code");
    }

    const credential = randomToken(32);
    const credentialHash = await hashValue(credential);
    const deviceId =
      registration.claimedDeviceId ??
      (await ctx.db.insert("devices", {
        organizationId: orgId,
        siteName: args.siteName,
        name: args.name,
        claimCode: args.claimCode,
        status: "online",
        timezone: "America/New_York",
        orientation: 0,
        volume: 0,
        manifestVersion: `manifest-${Date.now()}`,
        currentPlaylistName: "Main showroom loop",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastHeartbeatAt: Date.now(),
      }));

    await ctx.db.patch(deviceId, {
      organizationId: orgId,
      siteName: args.siteName,
      name: args.name,
      status: "online",
      updatedAt: Date.now(),
    });

    await ctx.db.insert("deviceCredentials", {
      deviceId,
      version: 1,
      secretHash: credentialHash,
      issuedAt: Date.now(),
    });

    await ctx.db.patch(registration._id, {
      claimedDeviceId: deviceId,
      credential,
    });

    return {
      deviceId,
      credential,
    };
  },
});

export const enqueueDeviceCommand = mutation({
  args: {
    deviceId: v.id("devices"),
    commandType: v.union(
      v.literal("sync_now"),
      v.literal("restart_player"),
      v.literal("reboot_device"),
      v.literal("take_screenshot"),
      v.literal("blank_screen"),
      v.literal("unblank_screen"),
    ),
    payload: v.optional(v.any()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { orgId } = await requireOrgIdentity(ctx);
    const device = await ctx.db.get(args.deviceId);
    if (!device || device.organizationId !== orgId) {
      throw new ConvexError("Device not found");
    }

    const commandId = await ctx.db.insert("deviceCommands", {
      organizationId: orgId,
      deviceId: device._id,
      commandType: args.commandType,
      status: "queued",
      payload: args.payload ?? {},
      queuedAt: Date.now(),
    });

    return {
      id: commandId,
      deviceId: device._id,
      commandType: args.commandType,
      issuedAt: new Date().toISOString(),
      payload: args.payload ?? {},
    };
  },
});

export const compileManifests = mutation({
  args: {},
  returns: v.object({
    affectedDeviceCount: v.number(),
    manifestVersion: v.string(),
  }),
  handler: async (ctx) => {
    const { orgId } = await requireAdmin(ctx);
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_org", (q) => q.eq("organizationId", orgId))
      .collect();

    const manifestVersion = `manifest-${Date.now()}`;

    for (const device of devices) {
      const payload = {
        manifestVersion,
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

      await ctx.db.insert("compiledManifests", {
        organizationId: orgId,
        deviceId: device._id,
        version: manifestVersion,
        payload,
        isActive: true,
        dirty: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await ctx.db.patch(device._id, {
        manifestVersion,
        updatedAt: Date.now(),
      });
    }

    return {
      affectedDeviceCount: devices.length,
      manifestVersion,
    };
  },
});
