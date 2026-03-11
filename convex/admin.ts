import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import {
  compileOrgManifests,
  deriveDeviceStatus,
  getDefaultPlaylist,
  serializeAsset,
  serializePlaylist,
} from "./showroom";
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

    return Promise.all(
      devices.map(async (device) => {
        const defaultPlaylist = device.defaultPlaylistId
          ? await ctx.db.get(device.defaultPlaylistId)
          : await getDefaultPlaylist(ctx, orgId, device);

        return {
          id: device._id,
          name: device.name ?? "Unnamed screen",
          siteName: device.siteName ?? "Unassigned",
          status: deriveDeviceStatus(device),
          lastHeartbeatAt: new Date(device.lastHeartbeatAt ?? device._creationTime).toISOString(),
          screenshotUrl: device.screenshotUrl ?? null,
          currentPlaylistName:
            device.currentPlaylistName ?? defaultPlaylist?.name ?? null,
          manifestVersion: device.manifestVersion ?? null,
        };
      }),
    );
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

    const defaultPlaylist = device.defaultPlaylistId
      ? await ctx.db.get(device.defaultPlaylistId)
      : await getDefaultPlaylist(ctx, orgId, device);

    return {
      id: device._id,
      name: device.name ?? "Unnamed screen",
      siteName: device.siteName ?? "Unassigned",
      status: deriveDeviceStatus(device),
      lastHeartbeatAt: new Date(device.lastHeartbeatAt ?? device._creationTime).toISOString(),
      screenshotUrl: device.screenshotUrl ?? null,
      currentPlaylistName:
        device.currentPlaylistName ?? defaultPlaylist?.name ?? null,
      manifestVersion: device.manifestVersion ?? null,
      timezone: device.timezone,
      orientation: device.orientation,
      volume: device.volume,
      defaultPlaylistId: device.defaultPlaylistId ?? defaultPlaylist?._id ?? null,
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

    const publicUrl =
      screenshot.storageId
        ? (await ctx.storage.getUrl(screenshot.storageId)) ?? screenshot.publicUrl
        : screenshot.publicUrl;

    return {
      deviceId: args.deviceId,
      publicUrl,
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

    let commands;
    if (args.deviceId) {
      commands = await ctx.db
        .query("deviceCommands")
        .withIndex("by_device_and_queued_at", (q) => q.eq("deviceId", args.deviceId!))
        .order("desc")
        .take(20);
    } else {
      commands = await ctx.db.query("deviceCommands").order("desc").take(50);
    }

    return commands
      .filter((command) => allowedIds.has(command.deviceId))
      .map((command) => ({
        id: command._id,
        deviceId: command.deviceId,
        commandType: command.commandType,
        issuedAt: new Date(command.queuedAt).toISOString(),
        payload: command.payload ?? {},
        status: command.status,
        completedAt: command.completedAt ? new Date(command.completedAt).toISOString() : null,
        message: command.resultMessage ?? null,
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

    return Promise.all(assets.map((asset) => serializeAsset(ctx, asset)));
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

    return Promise.all(playlists.map((playlist) => serializePlaylist(ctx, playlist)));
  },
});

export const listSchedules = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const { orgId } = await requireOrgIdentity(ctx);
    const [schedules, targets, playlists, devices] = await Promise.all([
      ctx.db.query("schedules").withIndex("by_org", (q) => q.eq("organizationId", orgId)).collect(),
      ctx.db.query("scheduleTargets").withIndex("by_org", (q) => q.eq("organizationId", orgId)).collect(),
      ctx.db.query("playlists").withIndex("by_org", (q) => q.eq("organizationId", orgId)).collect(),
      ctx.db.query("devices").withIndex("by_org", (q) => q.eq("organizationId", orgId)).collect(),
    ]);

    const playlistMap = new Map(playlists.map((playlist) => [playlist._id, playlist]));
    const deviceMap = new Map(devices.map((device) => [device._id, device]));

    return schedules.map((schedule) => {
      const target = targets.find((row) => row.scheduleId === schedule._id) ?? null;
      const playlist = target ? playlistMap.get(target.playlistId) : null;
      const targetDevice = target?.deviceId ? deviceMap.get(target.deviceId) : null;

      return {
        id: schedule._id,
        label: schedule.name,
        startsAt: new Date(schedule.startsAt).toISOString(),
        endsAt: new Date(schedule.endsAt).toISOString(),
        priority: schedule.priority,
        playlistId: playlist?._id ?? null,
        playlistName: playlist?.name ?? null,
        targetDeviceId: target?.deviceId ?? null,
        targetLabel: targetDevice?.name ?? "All screens",
      };
    });
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

export const finalizeMediaUpload = mutation({
  args: {
    title: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
    bytes: v.number(),
    storageId: v.id("_storage"),
    storagePath: v.string(),
    checksum: v.string(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    tags: v.array(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);
    const previewUrl = (await ctx.storage.getUrl(args.storageId)) ?? "";

    const assetId = await ctx.db.insert("mediaAssets", {
      organizationId: orgId,
      title: args.title,
      mediaType: args.mimeType.startsWith("video/") ? "video" : "image",
      mimeType: args.mimeType,
      fileName: args.fileName,
      storageId: args.storageId,
      storagePath: args.storagePath,
      previewUrl,
      sizeBytes: args.bytes,
      width: args.width,
      height: args.height,
      durationSeconds: args.durationSeconds,
      checksum: args.checksum,
      tags: args.tags,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const asset = await ctx.db.get(assetId);
    if (!asset) {
      throw new ConvexError("Media asset was not created");
    }

    return serializeAsset(ctx, asset);
  },
});

export const savePlaylist = mutation({
  args: {
    playlistId: v.optional(v.id("playlists")),
    name: v.string(),
    itemIds: v.array(
      v.object({
        mediaAssetId: v.id("mediaAssets"),
        dwellSeconds: v.optional(v.number()),
      }),
    ),
    makeDefault: v.optional(v.boolean()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);

    const assets = await Promise.all(args.itemIds.map((item) => ctx.db.get(item.mediaAssetId)));
    for (const asset of assets) {
      if (!asset || asset.organizationId !== orgId) {
        throw new ConvexError("Playlist contains an invalid media asset");
      }
    }

    let playlistId = args.playlistId;
    if (playlistId) {
      const existing = await ctx.db.get(playlistId);
      if (!existing || existing.organizationId !== orgId) {
        throw new ConvexError("Playlist not found");
      }

      await ctx.db.patch(playlistId, {
        name: args.name,
        isDefault: args.makeDefault ?? existing.isDefault,
        updatedAt: Date.now(),
      });
    } else {
      playlistId = await ctx.db.insert("playlists", {
        organizationId: orgId,
        name: args.name,
        description: undefined,
        isDefault: Boolean(args.makeDefault),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    if (args.makeDefault) {
      const allPlaylists = await ctx.db
        .query("playlists")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .collect();
      await Promise.all(
        allPlaylists
          .filter((playlist) => playlist._id !== playlistId && playlist.isDefault)
          .map((playlist) =>
            ctx.db.patch(playlist._id, {
              isDefault: false,
              updatedAt: Date.now(),
            }),
          ),
      );
    }

    const existingItems = await ctx.db
      .query("playlistItems")
      .withIndex("by_playlist_and_order", (q) => q.eq("playlistId", playlistId))
      .collect();
    await Promise.all(existingItems.map((item) => ctx.db.delete(item._id)));

    await Promise.all(
      args.itemIds.map((item, index) =>
        ctx.db.insert("playlistItems", {
          organizationId: orgId,
          playlistId,
          mediaAssetId: item.mediaAssetId,
          itemOrder: index,
          dwellSeconds: item.dwellSeconds,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      ),
    );

    await compileOrgManifests(ctx, orgId);
    const playlist = await ctx.db.get(playlistId);
    if (!playlist) {
      throw new ConvexError("Playlist not found after save");
    }
    return serializePlaylist(ctx, playlist);
  },
});

export const saveSchedule = mutation({
  args: {
    scheduleId: v.optional(v.id("schedules")),
    name: v.string(),
    startsAt: v.string(),
    endsAt: v.string(),
    priority: v.number(),
    playlistId: v.id("playlists"),
    deviceId: v.optional(v.id("devices")),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);
    const playlist = await ctx.db.get(args.playlistId);

    if (!playlist || playlist.organizationId !== orgId) {
      throw new ConvexError("Playlist not found");
    }

    if (args.deviceId) {
      const device = await ctx.db.get(args.deviceId);
      if (!device || device.organizationId !== orgId) {
        throw new ConvexError("Device not found");
      }
    }

    let scheduleId = args.scheduleId;
    if (scheduleId) {
      const existing = await ctx.db.get(scheduleId);
      if (!existing || existing.organizationId !== orgId) {
        throw new ConvexError("Schedule not found");
      }

      await ctx.db.patch(scheduleId, {
        name: args.name,
        timezone: "UTC",
        startsAt: Date.parse(args.startsAt),
        endsAt: Date.parse(args.endsAt),
        priority: args.priority,
        updatedAt: Date.now(),
      });
    } else {
      scheduleId = await ctx.db.insert("schedules", {
        organizationId: orgId,
        name: args.name,
        timezone: "UTC",
        startsAt: Date.parse(args.startsAt),
        endsAt: Date.parse(args.endsAt),
        priority: args.priority,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    const existingTargets = await ctx.db
      .query("scheduleTargets")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", scheduleId))
      .collect();
    await Promise.all(existingTargets.map((target) => ctx.db.delete(target._id)));

    await ctx.db.insert("scheduleTargets", {
      organizationId: orgId,
      scheduleId,
      deviceId: args.deviceId,
      playlistId: args.playlistId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await compileOrgManifests(ctx, orgId);
    const device = args.deviceId ? await ctx.db.get(args.deviceId) : null;

    return {
      id: scheduleId,
      label: args.name,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      priority: args.priority,
      playlistId: args.playlistId,
      playlistName: playlist.name,
      targetDeviceId: args.deviceId ?? null,
      targetLabel: device?.name ?? "All screens",
    };
  },
});

export const updateScreen = mutation({
  args: {
    deviceId: v.id("devices"),
    name: v.string(),
    siteName: v.string(),
    timezone: v.string(),
    orientation: v.union(v.literal(0), v.literal(90), v.literal(180), v.literal(270)),
    volume: v.number(),
    defaultPlaylistId: v.optional(v.union(v.id("playlists"), v.null())),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);
    const device = await ctx.db.get(args.deviceId);
    if (!device || device.organizationId !== orgId) {
      throw new ConvexError("Device not found");
    }

    if (args.defaultPlaylistId) {
      const playlist = await ctx.db.get(args.defaultPlaylistId);
      if (!playlist || playlist.organizationId !== orgId) {
        throw new ConvexError("Playlist not found");
      }
    }

    await ctx.db.patch(args.deviceId, {
      name: args.name,
      siteName: args.siteName,
      timezone: args.timezone,
      orientation: args.orientation,
      volume: args.volume,
      defaultPlaylistId: args.defaultPlaylistId ?? undefined,
      updatedAt: Date.now(),
    });

    await compileOrgManifests(ctx, orgId);
    const updated = await ctx.db.get(args.deviceId);
    if (!updated) {
      throw new ConvexError("Device not found after update");
    }

    const defaultPlaylist = updated.defaultPlaylistId
      ? await ctx.db.get(updated.defaultPlaylistId)
      : await getDefaultPlaylist(ctx, orgId, updated);

    return {
      id: updated._id,
      name: updated.name ?? "Unnamed screen",
      siteName: updated.siteName ?? "Unassigned",
      status: deriveDeviceStatus(updated),
      lastHeartbeatAt: new Date(updated.lastHeartbeatAt ?? updated._creationTime).toISOString(),
      screenshotUrl: updated.screenshotUrl ?? null,
      currentPlaylistName:
        updated.currentPlaylistName ?? defaultPlaylist?.name ?? null,
      manifestVersion: updated.manifestVersion ?? null,
      timezone: updated.timezone,
      orientation: updated.orientation,
      volume: updated.volume,
      defaultPlaylistId: updated.defaultPlaylistId ?? defaultPlaylist?._id ?? null,
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

    if (!registration || registration.claimedDeviceId) {
      throw new ConvexError("Invalid claim code");
    }

    const credential = randomToken(32);
    const credentialHash = await hashValue(credential);
    const defaultPlaylist = await getDefaultPlaylist(ctx, orgId, null);

    const deviceId = await ctx.db.insert("devices", {
      organizationId: orgId,
      siteName: args.siteName,
      name: args.name,
      claimCode: args.claimCode,
      status: "offline",
      timezone: "America/New_York",
      orientation: 0,
      volume: 0,
      defaultPlaylistId: defaultPlaylist?._id,
      currentPlaylistName: defaultPlaylist?.name,
      createdAt: Date.now(),
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

    await compileOrgManifests(ctx, orgId);

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
    const { devices, manifestVersion } = await compileOrgManifests(ctx, orgId);

    return {
      affectedDeviceCount: devices.length,
      manifestVersion,
    };
  },
});
