import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  activateManifestForDevices,
  compileOrgManifests,
  deriveDeviceStatus,
  getDefaultPlaylist,
  serializeAsset,
  serializePlaylist,
} from "./showroom";
import {
  DEVICE_CREDENTIAL_TTL_MS,
  expiresAtFrom,
  hashValue,
  randomToken,
  requireAdmin,
  requireOrgIdentity,
} from "./lib";

async function listOrgPlaylists(ctx: any, orgId: string) {
  return ctx.db
    .query("playlists")
    .withIndex("by_org", (q: any) => q.eq("organizationId", orgId))
    .collect() as Promise<Array<Doc<"playlists">>>;
}

async function listOrgMediaAssets(ctx: any, orgId: string) {
  return ctx.db
    .query("mediaAssets")
    .withIndex("by_org", (q: any) => q.eq("organizationId", orgId))
    .collect() as Promise<Array<Doc<"mediaAssets">>>;
}

async function listOrgDevices(ctx: any, orgId: string) {
  return ctx.db
    .query("devices")
    .withIndex("by_org", (q: any) => q.eq("organizationId", orgId))
    .collect() as Promise<Array<Doc<"devices">>>;
}

async function listOrgFolders(
  ctx: any,
  orgId: string,
  kind?: "media" | "playlist",
) {
  const folders = kind
    ? await ctx.db
        .query("libraryFolders")
        .withIndex("by_org_and_kind", (q: any) =>
          q.eq("organizationId", orgId).eq("kind", kind),
        )
        .collect()
    : await ctx.db
        .query("libraryFolders")
        .withIndex("by_org", (q: any) => q.eq("organizationId", orgId))
        .collect();

  return folders as Array<Doc<"libraryFolders">>;
}

function serializeFolder(folder: Doc<"libraryFolders">) {
  return {
    id: folder._id,
    kind: folder.kind,
    name: folder.name,
    parentId: folder.parentFolderId ?? null,
    order: folder.order,
  };
}

async function assertFolderForKind(
  ctx: any,
  orgId: string,
  folderId: Id<"libraryFolders"> | undefined,
  kind: "media" | "playlist",
) {
  if (!folderId) {
    return null;
  }

  const folder = await ctx.db.get(folderId);
  if (!folder || folder.organizationId !== orgId || folder.kind !== kind) {
    throw new ConvexError("Folder not found");
  }

  return folder;
}

function collectDescendantFolderIds(
  folders: Array<Doc<"libraryFolders">>,
  folderId: Id<"libraryFolders">,
) {
  const descendants = new Set<Id<"libraryFolders">>();
  const queue = [folderId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const folder of folders) {
      if (folder.parentFolderId === current && !descendants.has(folder._id)) {
        descendants.add(folder._id);
        queue.push(folder._id);
      }
    }
  }

  descendants.delete(folderId);
  return descendants;
}

function nextFolderOrder(
  folders: Array<Doc<"libraryFolders">>,
  kind: "media" | "playlist",
  parentFolderId?: Id<"libraryFolders">,
) {
  return folders.filter(
    (folder) => folder.kind === kind && folder.parentFolderId === parentFolderId,
  ).length;
}

function sortPlaylistsForFallback(playlists: Array<Doc<"playlists">>) {
  return [...playlists].sort((a, b) => {
    const createdAtDiff = a.createdAt - b.createdAt;
    if (createdAtDiff !== 0) {
      return createdAtDiff;
    }

    return a.name.localeCompare(b.name);
  });
}

async function assignOrgDefaultPlaylist(
  ctx: any,
  orgId: string,
  playlistId: Id<"playlists">,
) {
  const playlists = await listOrgPlaylists(ctx, orgId);
  const now = Date.now();

  await Promise.all(
    playlists.flatMap((playlist) => {
      if (playlist._id === playlistId) {
        return playlist.isDefault
          ? []
          : [
              ctx.db.patch(playlist._id, {
                isDefault: true,
                updatedAt: now,
              }),
            ];
      }

      return playlist.isDefault
        ? [
            ctx.db.patch(playlist._id, {
              isDefault: false,
              updatedAt: now,
            }),
          ]
        : [];
    }),
  );
}

async function ensureOrgHasDefaultPlaylist(
  ctx: any,
  orgId: string,
  options?: { excludePlaylistId?: Id<"playlists"> },
) {
  const playlists = await listOrgPlaylists(ctx, orgId);
  if (!playlists.length) {
    return null;
  }

  const currentDefault = playlists.find((playlist) => playlist.isDefault);
  if (currentDefault) {
    return currentDefault._id;
  }

  const candidates = options?.excludePlaylistId
    ? playlists.filter((playlist) => playlist._id !== options.excludePlaylistId)
    : playlists;
  const nextDefault = sortPlaylistsForFallback(candidates)[0] ?? sortPlaylistsForFallback(playlists)[0];

  if (!nextDefault) {
    return null;
  }

  await ctx.db.patch(nextDefault._id, {
    isDefault: true,
    updatedAt: Date.now(),
  });

  return nextDefault._id;
}

async function recompileAllOrgDevices(ctx: any, orgId: string) {
  const devices = await listOrgDevices(ctx, orgId);
  if (!devices.length) {
    return 0;
  }

  await activateManifestForDevices(ctx, devices);
  return devices.length;
}

async function recompileDevicesById(
  ctx: any,
  orgId: string,
  deviceIds: Iterable<Id<"devices">>,
) {
  const wanted = new Set(deviceIds);
  if (!wanted.size) {
    return 0;
  }

  const devices = (await listOrgDevices(ctx, orgId)).filter((device) => wanted.has(device._id));
  if (!devices.length) {
    return 0;
  }

  await activateManifestForDevices(ctx, devices);
  return devices.length;
}

async function recompileDevicesForPlaylists(
  ctx: any,
  orgId: string,
  playlistIds: Iterable<Id<"playlists">>,
  options?: { forceAll?: boolean },
) {
  const wanted = new Set(playlistIds);
  if (!wanted.size) {
    return 0;
  }
  if (options?.forceAll) {
    return recompileAllOrgDevices(ctx, orgId);
  }

  const [devices, playlists, targets] = await Promise.all([
    listOrgDevices(ctx, orgId),
    listOrgPlaylists(ctx, orgId),
    ctx.db
      .query("scheduleTargets")
      .withIndex("by_org", (q: any) => q.eq("organizationId", orgId))
      .collect() as Promise<Array<Doc<"scheduleTargets">>>,
  ]);

  if (playlists.some((playlist) => playlist.isDefault && wanted.has(playlist._id))) {
    return recompileAllOrgDevices(ctx, orgId);
  }

  if (
    targets.some(
      (target) =>
        wanted.has(target.playlistId) &&
        !target.deviceId &&
        !target.groupId &&
        !target.siteId,
    )
  ) {
    return recompileAllOrgDevices(ctx, orgId);
  }

  const affectedDeviceIds = new Set<Id<"devices">>();
  for (const device of devices) {
    if (device.defaultPlaylistId && wanted.has(device.defaultPlaylistId)) {
      affectedDeviceIds.add(device._id);
    }
  }

  for (const target of targets) {
    if (target.deviceId && wanted.has(target.playlistId)) {
      affectedDeviceIds.add(target.deviceId);
    }
  }

  return recompileDevicesById(ctx, orgId, affectedDeviceIds);
}

async function recompileDevicesForMediaAsset(
  ctx: any,
  orgId: string,
  assetId: Id<"mediaAssets">,
) {
  const items = await ctx.db
    .query("playlistItems")
    .withIndex("by_org", (q: any) => q.eq("organizationId", orgId))
    .collect();

  const playlistIds = new Set<Id<"playlists">>();
  for (const item of items) {
    if (item.mediaAssetId === assetId) {
      playlistIds.add(item.playlistId);
    }
  }

  return recompileDevicesForPlaylists(ctx, orgId, playlistIds);
}

function mergeTags(current: string[], incoming: string[]) {
  return [...new Set([...current, ...incoming])];
}

async function upsertYouTubeAsset(
  ctx: any,
  orgId: string,
  args: {
    title: string;
    sourceUrl: string;
    previewUrl: string;
    fileName: string;
    durationSeconds?: number;
    tags: string[];
    folderId?: Id<"libraryFolders">;
  },
  existingByChecksum?: Map<string, Doc<"mediaAssets">>,
) {
  const checksum = `youtube:${await hashValue(args.sourceUrl)}`;
  let existing = existingByChecksum?.get(checksum);

  if (!existing) {
    const assets = existingByChecksum
      ? [...existingByChecksum.values()]
      : await listOrgMediaAssets(ctx, orgId);
    existing = assets.find((asset) => asset.checksum === checksum) ?? undefined;
  }

  const now = Date.now();
  await assertFolderForKind(ctx, orgId, args.folderId, "media");
  if (existing) {
    await ctx.db.patch(existing._id, {
      folderId: args.folderId ?? existing.folderId,
      title: args.title,
      sourceType: "youtube",
      sourceUrl: args.sourceUrl,
      mimeType: "video/mp4",
      fileName: args.fileName,
      storagePath: `youtube/${orgId}/${args.fileName}`,
      previewUrl: args.previewUrl,
      sizeBytes: 0,
      durationSeconds: args.durationSeconds,
      checksum,
      tags: mergeTags(existing.tags, args.tags),
      updatedAt: now,
    });

    const updated = await ctx.db.get(existing._id);
    if (!updated) {
      throw new ConvexError("YouTube media asset was not found after update");
    }

    existingByChecksum?.set(checksum, updated);
    return updated;
  }

  const assetId = await ctx.db.insert("mediaAssets", {
    organizationId: orgId,
    folderId: args.folderId,
    title: args.title,
    mediaType: "video",
    sourceType: "youtube",
    sourceUrl: args.sourceUrl,
    mimeType: "video/mp4",
    fileName: args.fileName,
    storagePath: `youtube/${orgId}/${args.fileName}`,
    previewUrl: args.previewUrl,
    sizeBytes: 0,
    durationSeconds: args.durationSeconds,
    checksum,
    tags: args.tags,
    createdAt: now,
    updatedAt: now,
  });

  const asset = await ctx.db.get(assetId);
  if (!asset) {
    throw new ConvexError("YouTube media asset was not created");
  }

  existingByChecksum?.set(checksum, asset);
  return asset;
}

async function savePlaylistRecord(
  ctx: any,
  orgId: string,
  args: {
    playlistId?: Id<"playlists">;
    name: string;
    folderId?: Id<"libraryFolders">;
    itemIds: Array<{
      mediaAssetId: Id<"mediaAssets">;
      dwellSeconds?: number;
    }>;
    makeDefault?: boolean;
  },
) {
  const assets = await Promise.all(args.itemIds.map((item) => ctx.db.get(item.mediaAssetId)));
  for (const asset of assets) {
    if (!asset || asset.organizationId !== orgId) {
      throw new ConvexError("Playlist contains an invalid media asset");
    }
  }

  await assertFolderForKind(ctx, orgId, args.folderId, "playlist");

  let playlistId = args.playlistId;
  let existing: Doc<"playlists"> | null = null;
  if (playlistId) {
    existing = await ctx.db.get(playlistId);
    if (!existing || existing.organizationId !== orgId) {
      throw new ConvexError("Playlist not found");
    }

    const shouldBeDefault = args.makeDefault ?? existing.isDefault;
    await ctx.db.patch(playlistId, {
      folderId: args.folderId ?? existing.folderId,
      name: args.name,
      isDefault: shouldBeDefault,
      updatedAt: Date.now(),
    });
  } else {
    const orgPlaylists = await listOrgPlaylists(ctx, orgId);
    const shouldBeDefault = args.makeDefault ?? orgPlaylists.length === 0;
    playlistId = await ctx.db.insert("playlists", {
      organizationId: orgId,
      folderId: args.folderId,
      name: args.name,
      description: undefined,
      isDefault: shouldBeDefault,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  const nextIsDefault = args.makeDefault ?? existing?.isDefault ?? false;
  if (!playlistId) {
    throw new ConvexError("Playlist id was not created");
  }

  if (nextIsDefault) {
    await assignOrgDefaultPlaylist(ctx, orgId, playlistId);
  } else {
    await ensureOrgHasDefaultPlaylist(ctx, orgId, {
      excludePlaylistId: playlistId,
    });
  }

  const existingItems = await ctx.db
    .query("playlistItems")
    .withIndex("by_playlist_and_order", (q: any) => q.eq("playlistId", playlistId))
    .collect();
  await Promise.all(existingItems.map((item: Doc<"playlistItems">) => ctx.db.delete(item._id)));

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

  await recompileDevicesForPlaylists(ctx, orgId, [playlistId], {
    forceAll: nextIsDefault || existing?.isDefault,
  });

  const playlist = await ctx.db.get(playlistId);
  if (!playlist) {
    throw new ConvexError("Playlist not found after save");
  }

  return {
    ...(await serializePlaylist(ctx, playlist)),
    isDefault: playlist.isDefault,
  };
}

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

export const listLibraryFolders = query({
  args: {
    kind: v.union(v.literal("media"), v.literal("playlist")),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const { orgId } = await requireOrgIdentity(ctx);
    const folders = await listOrgFolders(ctx, orgId, args.kind);
    return folders.map(serializeFolder);
  },
});

export const listReleases = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const { orgId } = await requireOrgIdentity(ctx);
    const [releases, devices, rollouts] = await Promise.all([
      ctx.db
        .query("releases")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .order("desc")
        .collect(),
      ctx.db
        .query("devices")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .collect(),
      ctx.db
        .query("releaseRollouts")
        .withIndex("by_org_and_queued_at", (q) => q.eq("organizationId", orgId))
        .order("desc")
        .collect(),
    ]);

    const deviceNameById = new Map(
      devices.map((device) => [device._id, device.name ?? device.siteName ?? "Unnamed screen"]),
    );

    return releases.map((release) => {
      const releaseRollouts = rollouts.filter((entry) => entry.releaseId === release._id);

      return {
        id: release._id,
        name: release.name,
        version: release.version,
        notes: release.notes ?? null,
        playerUrl: release.playerUrl ?? null,
        playerSha256: release.playerSha256 ?? null,
        agentUrl: release.agentUrl ?? null,
        agentSha256: release.agentSha256 ?? null,
        systemUrl: release.systemUrl ?? null,
        systemSha256: release.systemSha256 ?? null,
        createdAt: new Date(release.createdAt).toISOString(),
        updatedAt: new Date(release.updatedAt).toISOString(),
        rolloutSummary: {
          total: releaseRollouts.length,
          queued: releaseRollouts.filter((entry) => entry.status === "queued").length,
          inProgress: releaseRollouts.filter((entry) => entry.status === "in_progress").length,
          succeeded: releaseRollouts.filter((entry) => entry.status === "succeeded").length,
          failed: releaseRollouts.filter((entry) => entry.status === "failed").length,
        },
        latestRollouts: releaseRollouts.slice(0, 8).map((entry) => ({
          id: entry._id,
          deviceId: entry.deviceId,
          deviceName: deviceNameById.get(entry.deviceId) ?? "Unknown screen",
          status: entry.status,
          queuedAt: new Date(entry.queuedAt).toISOString(),
          startedAt: entry.startedAt ? new Date(entry.startedAt).toISOString() : null,
          completedAt: entry.completedAt ? new Date(entry.completedAt).toISOString() : null,
          message: entry.message ?? null,
        })),
      };
    });
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

    return Promise.all(
      playlists.map(async (playlist) => ({
        ...(await serializePlaylist(ctx, playlist)),
        isDefault: playlist.isDefault,
      })),
    );
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

export const createLibraryFolder = mutation({
  args: {
    kind: v.union(v.literal("media"), v.literal("playlist")),
    name: v.string(),
    parentId: v.optional(v.union(v.id("libraryFolders"), v.null())),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);
    const parentId = args.parentId ?? undefined;
    if (parentId) {
      await assertFolderForKind(ctx, orgId, parentId, args.kind);
    }

    const folders = await listOrgFolders(ctx, orgId, args.kind);
    const folderId = await ctx.db.insert("libraryFolders", {
      organizationId: orgId,
      kind: args.kind,
      name: args.name,
      parentFolderId: parentId,
      order: nextFolderOrder(folders, args.kind, parentId),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const folder = await ctx.db.get(folderId);
    if (!folder) {
      throw new ConvexError("Folder not found after create");
    }

    return serializeFolder(folder);
  },
});

export const updateLibraryFolder = mutation({
  args: {
    folderId: v.id("libraryFolders"),
    name: v.optional(v.string()),
    parentId: v.optional(v.union(v.id("libraryFolders"), v.null())),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);
    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.organizationId !== orgId) {
      throw new ConvexError("Folder not found");
    }

    const allFolders = await listOrgFolders(ctx, orgId);
    const patch: Partial<Doc<"libraryFolders">> = {};

    if (typeof args.name === "string") {
      patch.name = args.name;
    }

    if (Object.prototype.hasOwnProperty.call(args, "parentId")) {
      const nextParentId = args.parentId ?? undefined;
      if (nextParentId) {
        const parent = await assertFolderForKind(ctx, orgId, nextParentId, folder.kind);
        if (!parent) {
          throw new ConvexError("Folder not found");
        }
      }

      if (nextParentId === folder._id) {
        throw new ConvexError("A folder cannot contain itself");
      }

      const descendants = collectDescendantFolderIds(allFolders, folder._id);
      if (nextParentId && descendants.has(nextParentId)) {
        throw new ConvexError("A folder cannot be moved into one of its descendants");
      }

      patch.parentFolderId = nextParentId;
      patch.order = nextFolderOrder(allFolders, folder.kind, nextParentId);
    }

    patch.updatedAt = Date.now();
    await ctx.db.patch(folder._id, patch);

    const updated = await ctx.db.get(folder._id);
    if (!updated) {
      throw new ConvexError("Folder not found after update");
    }

    return serializeFolder(updated);
  },
});

export const finalizeMediaUpload = mutation({
  args: {
    title: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
    bytes: v.number(),
    storageId: v.optional(v.id("_storage")),
    storagePath: v.string(),
    previewUrl: v.string(),
    checksum: v.string(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    tags: v.array(v.string()),
    folderId: v.optional(v.id("libraryFolders")),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);
    await assertFolderForKind(ctx, orgId, args.folderId, "media");

    const assetId = await ctx.db.insert("mediaAssets", {
      organizationId: orgId,
      folderId: args.folderId,
      title: args.title,
      mediaType: args.mimeType.startsWith("video/") ? "video" : "image",
      sourceType: "upload",
      mimeType: args.mimeType,
      fileName: args.fileName,
      storageId: args.storageId,
      storagePath: args.storagePath,
      previewUrl: args.previewUrl,
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

export const createYouTubeMediaAsset = mutation({
  args: {
    title: v.string(),
    sourceUrl: v.string(),
    previewUrl: v.string(),
    fileName: v.string(),
    durationSeconds: v.optional(v.number()),
    tags: v.array(v.string()),
    folderId: v.optional(v.id("libraryFolders")),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);
    const asset = await upsertYouTubeAsset(ctx, orgId, args);
    return serializeAsset(ctx, asset);
  },
});

export const importYouTubePlaylist = mutation({
  args: {
    makeDefault: v.optional(v.boolean()),
    name: v.string(),
    tags: v.array(v.string()),
    folderId: v.optional(v.id("libraryFolders")),
    assetFolderId: v.optional(v.id("libraryFolders")),
    videos: v.array(
      v.object({
        durationSeconds: v.optional(v.number()),
        fileName: v.string(),
        previewUrl: v.string(),
        sourceUrl: v.string(),
        title: v.string(),
      }),
    ),
  },
  returns: v.object({
    assets: v.array(v.any()),
    playlist: v.any(),
  }),
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);
    if (!args.videos.length) {
      throw new ConvexError("Playlist import requires at least one video");
    }

    const assetByChecksum = new Map(
      (await listOrgMediaAssets(ctx, orgId)).map((asset) => [asset.checksum, asset]),
    );
    const assets = [];
    for (const video of args.videos) {
      assets.push(
        await upsertYouTubeAsset(
          ctx,
          orgId,
          {
            ...video,
            tags: args.tags,
            folderId: args.assetFolderId,
          },
          assetByChecksum,
        ),
      );
    }

    const playlist = await savePlaylistRecord(ctx, orgId, {
      itemIds: assets.map((asset) => ({
        mediaAssetId: asset._id,
      })),
      makeDefault: args.makeDefault,
      name: args.name,
      folderId: args.folderId,
    });
    const uniqueAssets = [...new Map(assets.map((asset) => [asset._id, asset])).values()];

    return {
      assets: await Promise.all(uniqueAssets.map((asset) => serializeAsset(ctx, asset))),
      playlist,
    };
  },
});

export const createRelease = mutation({
  args: {
    name: v.string(),
    version: v.string(),
    notes: v.optional(v.string()),
    playerUrl: v.optional(v.string()),
    playerSha256: v.optional(v.string()),
    agentUrl: v.optional(v.string()),
    agentSha256: v.optional(v.string()),
    systemUrl: v.optional(v.string()),
    systemSha256: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx);
    if (!args.playerUrl && !args.agentUrl && !args.systemUrl) {
      throw new ConvexError("Provide a player URL, agent URL, and/or system bundle URL");
    }

    const releaseId = await ctx.db.insert("releases", {
      organizationId: identity.orgId,
      name: args.name,
      version: args.version,
      notes: args.notes,
      playerUrl: args.playerUrl,
      playerSha256: args.playerSha256,
      agentUrl: args.agentUrl,
      agentSha256: args.agentSha256,
      systemUrl: args.systemUrl,
      systemSha256: args.systemSha256,
      createdByUserId: identity.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return {
      id: releaseId,
      name: args.name,
      version: args.version,
      notes: args.notes ?? null,
      playerUrl: args.playerUrl ?? null,
      playerSha256: args.playerSha256 ?? null,
      agentUrl: args.agentUrl ?? null,
      agentSha256: args.agentSha256 ?? null,
      systemUrl: args.systemUrl ?? null,
      systemSha256: args.systemSha256 ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      rolloutSummary: {
        total: 0,
        queued: 0,
        inProgress: 0,
        succeeded: 0,
        failed: 0,
      },
      latestRollouts: [],
    };
  },
});

export const generateReleaseArtifactUploadUrl = mutation({
  args: {
    fileName: v.string(),
    mimeType: v.string(),
    bytes: v.number(),
  },
  returns: v.object({
    uploadUrl: v.string(),
    expiresInSeconds: v.number(),
  }),
  handler: async (ctx, _args) => {
    await requireAdmin(ctx);

    return {
      uploadUrl: await ctx.storage.generateUploadUrl(),
      expiresInSeconds: 3600,
    };
  },
});

export const publishReleaseArtifacts = mutation({
  args: {
    name: v.string(),
    version: v.string(),
    notes: v.optional(v.string()),
    deployToAll: v.optional(v.boolean()),
    deviceIds: v.optional(v.array(v.id("devices"))),
    player: v.optional(
      v.object({
        fileName: v.string(),
        sha256: v.string(),
        storageId: v.id("_storage"),
      }),
    ),
    agent: v.optional(
      v.object({
        fileName: v.string(),
        sha256: v.string(),
        storageId: v.id("_storage"),
      }),
    ),
    system: v.optional(
      v.object({
        fileName: v.string(),
        sha256: v.string(),
        storageId: v.id("_storage"),
      }),
    ),
  },
  returns: v.object({
    release: v.any(),
    rollout: v.optional(
      v.object({
        queuedDeviceCount: v.number(),
        releaseId: v.id("releases"),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx);
    if (!args.player && !args.agent && !args.system) {
      throw new ConvexError("Provide a player artifact, agent artifact, and/or system bundle");
    }

    const playerUrl = args.player
      ? await ctx.storage.getUrl(args.player.storageId)
      : null;
    const agentUrl = args.agent
      ? await ctx.storage.getUrl(args.agent.storageId)
      : null;
    const systemUrl = args.system
      ? await ctx.storage.getUrl(args.system.storageId)
      : null;

    if (args.player && !playerUrl) {
      throw new ConvexError("Unable to resolve player artifact URL");
    }
    if (args.agent && !agentUrl) {
      throw new ConvexError("Unable to resolve agent artifact URL");
    }
    if (args.system && !systemUrl) {
      throw new ConvexError("Unable to resolve system artifact URL");
    }

    const now = Date.now();
    const releaseId = await ctx.db.insert("releases", {
      organizationId: identity.orgId,
      name: args.name,
      version: args.version,
      notes: args.notes,
      playerUrl: playerUrl ?? undefined,
      playerSha256: args.player?.sha256,
      agentUrl: agentUrl ?? undefined,
      agentSha256: args.agent?.sha256,
      systemUrl: systemUrl ?? undefined,
      systemSha256: args.system?.sha256,
      createdAt: now,
      updatedAt: now,
      createdByUserId: identity.userId,
    });

    const release = await ctx.db.get(releaseId);
    if (!release) {
      throw new ConvexError("Release was not created");
    }

    let rollout:
      | {
          queuedDeviceCount: number;
          releaseId: Id<"releases">;
        }
      | undefined;

    if (args.deployToAll || (args.deviceIds && args.deviceIds.length > 0)) {
      const orgDevices = await ctx.db
        .query("devices")
        .withIndex("by_org", (q) => q.eq("organizationId", identity.orgId))
        .collect();

      const requestedIds = args.deviceIds?.length ? new Set(args.deviceIds) : null;
      const targetDevices = requestedIds
        ? orgDevices.filter((device) => requestedIds.has(device._id))
        : orgDevices;

      if (!targetDevices.length) {
        throw new ConvexError("No target devices selected");
      }

      for (const device of targetDevices) {
        const commandId = await ctx.db.insert("deviceCommands", {
          organizationId: identity.orgId,
          deviceId: device._id,
          commandType: "update_release",
          status: "queued",
          payload: {
            version: release.version,
            agentVersion: release.agentUrl ? release.version : undefined,
            agentUrl: release.agentUrl,
            agentSha256: release.agentSha256,
            playerVersion: release.playerUrl ? release.version : undefined,
            playerUrl: release.playerUrl,
            playerSha256: release.playerSha256,
            systemVersion: release.systemUrl ? release.version : undefined,
            systemUrl: release.systemUrl,
            systemSha256: release.systemSha256,
          },
          queuedAt: now,
        });

        await ctx.db.insert("releaseRollouts", {
          organizationId: identity.orgId,
          releaseId: release._id,
          deviceId: device._id,
          commandId,
          status: "queued",
          queuedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }

      rollout = {
        queuedDeviceCount: targetDevices.length,
        releaseId: release._id,
      };
    }

    return {
      release: {
        id: release._id,
        name: release.name,
        version: release.version,
        notes: release.notes ?? null,
        playerUrl: release.playerUrl ?? null,
        playerSha256: release.playerSha256 ?? null,
        agentUrl: release.agentUrl ?? null,
        agentSha256: release.agentSha256 ?? null,
        systemUrl: release.systemUrl ?? null,
        systemSha256: release.systemSha256 ?? null,
        createdAt: new Date(release.createdAt).toISOString(),
        updatedAt: new Date(release.updatedAt).toISOString(),
        rolloutSummary: {
          total: rollout?.queuedDeviceCount ?? 0,
          queued: rollout?.queuedDeviceCount ?? 0,
          inProgress: 0,
          succeeded: 0,
          failed: 0,
        },
        latestRollouts: [],
      },
      rollout,
    };
  },
});

export const deployRelease = mutation({
  args: {
    releaseId: v.id("releases"),
    deviceIds: v.optional(v.array(v.id("devices"))),
  },
  returns: v.object({
    queuedDeviceCount: v.number(),
    releaseId: v.id("releases"),
  }),
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);
    const release = await ctx.db.get(args.releaseId);
    if (!release || release.organizationId !== orgId) {
      throw new ConvexError("Release not found");
    }

    const orgDevices = await ctx.db
      .query("devices")
      .withIndex("by_org", (q) => q.eq("organizationId", orgId))
      .collect();

    const requestedIds = args.deviceIds?.length ? new Set(args.deviceIds) : null;
    const targetDevices = requestedIds
      ? orgDevices.filter((device) => requestedIds.has(device._id))
      : orgDevices;

    if (!targetDevices.length) {
      throw new ConvexError("No target devices selected");
    }

    const now = Date.now();
    for (const device of targetDevices) {
      const commandId = await ctx.db.insert("deviceCommands", {
        organizationId: orgId,
        deviceId: device._id,
        commandType: "update_release",
        status: "queued",
        payload: {
          version: release.version,
          agentVersion: release.agentUrl ? release.version : undefined,
          agentUrl: release.agentUrl,
          agentSha256: release.agentSha256,
          playerVersion: release.playerUrl ? release.version : undefined,
          playerUrl: release.playerUrl,
          playerSha256: release.playerSha256,
          systemVersion: release.systemUrl ? release.version : undefined,
          systemUrl: release.systemUrl,
          systemSha256: release.systemSha256,
        },
        queuedAt: now,
      });

      await ctx.db.insert("releaseRollouts", {
        organizationId: orgId,
        releaseId: release._id,
        deviceId: device._id,
        commandId,
        status: "queued",
        queuedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(release._id, {
      updatedAt: now,
    });

    return {
      queuedDeviceCount: targetDevices.length,
      releaseId: release._id,
    };
  },
});

export const savePlaylist = mutation({
  args: {
    playlistId: v.optional(v.id("playlists")),
    name: v.string(),
    folderId: v.optional(v.union(v.id("libraryFolders"), v.null())),
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
    return savePlaylistRecord(ctx, orgId, {
      ...args,
      folderId: args.folderId ?? undefined,
    });
  },
});

export const updatePlaylist = mutation({
  args: {
    playlistId: v.id("playlists"),
    name: v.optional(v.string()),
    folderId: v.optional(v.union(v.id("libraryFolders"), v.null())),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);
    const playlist = await ctx.db.get(args.playlistId);
    if (!playlist || playlist.organizationId !== orgId) {
      throw new ConvexError("Playlist not found");
    }

    await assertFolderForKind(ctx, orgId, args.folderId ?? undefined, "playlist");
    await ctx.db.patch(args.playlistId, {
      name: args.name ?? playlist.name,
      folderId: args.folderId === null ? undefined : args.folderId ?? playlist.folderId,
      updatedAt: Date.now(),
    });

    const updated = await ctx.db.get(args.playlistId);
    if (!updated) {
      throw new ConvexError("Playlist not found after update");
    }

    return {
      ...(await serializePlaylist(ctx, updated)),
      isDefault: updated.isDefault,
    };
  },
});

export const setDefaultPlaylist = mutation({
  args: {
    playlistId: v.id("playlists"),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);
    const playlist = await ctx.db.get(args.playlistId);
    if (!playlist || playlist.organizationId !== orgId) {
      throw new ConvexError("Playlist not found");
    }

    await assignOrgDefaultPlaylist(ctx, orgId, args.playlistId);
    await recompileAllOrgDevices(ctx, orgId);

    const updated = await ctx.db.get(args.playlistId);
    if (!updated) {
      throw new ConvexError("Playlist not found after update");
    }

    return {
      ...(await serializePlaylist(ctx, updated)),
      isDefault: updated.isDefault,
    };
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

    const affectedDeviceIds = new Set<Id<"devices">>();
    for (const target of existingTargets) {
      if (target.deviceId) {
        affectedDeviceIds.add(target.deviceId);
      }
    }
    if (args.deviceId) {
      affectedDeviceIds.add(args.deviceId);
    }

    if (
      !args.deviceId ||
      existingTargets.some((target) => !target.deviceId && !target.groupId && !target.siteId)
    ) {
      await recompileAllOrgDevices(ctx, orgId);
    } else {
      await recompileDevicesById(ctx, orgId, affectedDeviceIds);
    }
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

    await recompileDevicesById(ctx, orgId, [args.deviceId]);
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

    if (!registration || registration.claimedDeviceId || registration.expiresAt <= Date.now()) {
      throw new ConvexError("Invalid claim code");
    }

    const credential = randomToken(32);
    const credentialHash = await hashValue(credential);
    const issuedAt = Date.now();
    const expiresAt = expiresAtFrom(issuedAt, DEVICE_CREDENTIAL_TTL_MS);
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
      issuedAt,
      expiresAt,
    });

    await ctx.db.patch(registration._id, {
      claimedDeviceId: deviceId,
      credential,
      credentialExpiresAt: expiresAt,
    });

    await recompileDevicesById(ctx, orgId, [deviceId]);

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
      v.literal("update_release"),
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

export const deleteLibraryFolder = mutation({
  args: {
    folderId: v.id("libraryFolders"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);
    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.organizationId !== orgId) {
      throw new ConvexError("Folder not found");
    }

    const [folders, assets, playlists] = await Promise.all([
      listOrgFolders(ctx, orgId),
      listOrgMediaAssets(ctx, orgId),
      listOrgPlaylists(ctx, orgId),
    ]);

    await Promise.all(
      folders
        .filter((entry) => entry.parentFolderId === folder._id)
        .map((entry) =>
          ctx.db.patch(entry._id, {
            parentFolderId: folder.parentFolderId,
            updatedAt: Date.now(),
          }),
        ),
    );

    if (folder.kind === "media") {
      await Promise.all(
        assets
          .filter((asset) => asset.folderId === folder._id)
          .map((asset) =>
            ctx.db.patch(asset._id, {
              folderId: folder.parentFolderId,
              updatedAt: Date.now(),
            }),
          ),
      );
    } else {
      await Promise.all(
        playlists
          .filter((playlist) => playlist.folderId === folder._id)
          .map((playlist) =>
            ctx.db.patch(playlist._id, {
              folderId: folder.parentFolderId,
              updatedAt: Date.now(),
            }),
          ),
      );
    }

    await ctx.db.delete(folder._id);
    return null;
  },
});

export const deletePlaylist = mutation({
  args: {
    playlistId: v.id("playlists"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);
    const playlist = await ctx.db.get(args.playlistId);
    if (!playlist || playlist.organizationId !== orgId) {
      throw new ConvexError("Playlist not found");
    }

    const items = await ctx.db
      .query("playlistItems")
      .withIndex("by_playlist_and_order", (q) => q.eq("playlistId", args.playlistId))
      .collect();
    await Promise.all(items.map((item) => ctx.db.delete(item._id)));

    const targets = await ctx.db
      .query("scheduleTargets")
      .withIndex("by_org", (q) => q.eq("organizationId", orgId))
      .collect();
    await Promise.all(
      targets.filter((t) => t.playlistId === args.playlistId).map((t) => ctx.db.delete(t._id)),
    );

    const affectedDeviceIds = new Set<Id<"devices">>();
    const devices = await listOrgDevices(ctx, orgId);
    for (const device of devices) {
      if (device.defaultPlaylistId === args.playlistId) {
        affectedDeviceIds.add(device._id);
        await ctx.db.patch(device._id, {
          defaultPlaylistId: undefined,
          updatedAt: Date.now(),
        });
      }
    }

    const usedGlobally = targets.some(
      (target) =>
        target.playlistId === args.playlistId &&
        !target.deviceId &&
        !target.groupId &&
        !target.siteId,
    );
    for (const target of targets) {
      if (target.playlistId === args.playlistId && target.deviceId) {
        affectedDeviceIds.add(target.deviceId);
      }
    }

    await ctx.db.delete(args.playlistId);
    if (playlist.isDefault) {
      await ensureOrgHasDefaultPlaylist(ctx, orgId, {
        excludePlaylistId: args.playlistId,
      });
    }
    if (playlist.isDefault || usedGlobally) {
      await recompileAllOrgDevices(ctx, orgId);
    } else {
      await recompileDevicesById(ctx, orgId, affectedDeviceIds);
    }
    return null;
  },
});

export const deleteSchedule = mutation({
  args: {
    scheduleId: v.id("schedules"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule || schedule.organizationId !== orgId) {
      throw new ConvexError("Schedule not found");
    }

    const targets = await ctx.db
      .query("scheduleTargets")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
      .collect();
    await Promise.all(targets.map((t) => ctx.db.delete(t._id)));

    const affectedDeviceIds = new Set<Id<"devices">>();
    for (const target of targets) {
      if (target.deviceId) {
        affectedDeviceIds.add(target.deviceId);
      }
    }

    await ctx.db.delete(args.scheduleId);
    if (targets.some((target) => !target.deviceId && !target.groupId && !target.siteId)) {
      await recompileAllOrgDevices(ctx, orgId);
    } else {
      await recompileDevicesById(ctx, orgId, affectedDeviceIds);
    }
    return null;
  },
});

export const deleteMediaAsset = mutation({
  args: {
    assetId: v.id("mediaAssets"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.organizationId !== orgId) {
      throw new ConvexError("Media asset not found");
    }

    const items = await ctx.db
      .query("playlistItems")
      .withIndex("by_org", (q) => q.eq("organizationId", orgId))
      .collect();
    const affectedPlaylistIds = new Set<Id<"playlists">>();
    for (const item of items) {
      if (item.mediaAssetId === args.assetId) {
        affectedPlaylistIds.add(item.playlistId);
      }
    }
    await Promise.all(
      items.filter((i) => i.mediaAssetId === args.assetId).map((i) => ctx.db.delete(i._id)),
    );

    await ctx.db.delete(args.assetId);
    await recompileDevicesForPlaylists(ctx, orgId, affectedPlaylistIds);
    return null;
  },
});

export const updateMediaAsset = mutation({
  args: {
    assetId: v.id("mediaAssets"),
    title: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    folderId: v.optional(v.union(v.id("libraryFolders"), v.null())),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { orgId } = await requireAdmin(ctx);
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.organizationId !== orgId) {
      throw new ConvexError("Media asset not found");
    }

    await assertFolderForKind(ctx, orgId, args.folderId ?? undefined, "media");

    await ctx.db.patch(args.assetId, {
      title: args.title ?? asset.title,
      tags: args.tags ?? asset.tags,
      folderId: args.folderId === null ? undefined : args.folderId ?? asset.folderId,
      updatedAt: Date.now(),
    });

    const updated = await ctx.db.get(args.assetId);
    await recompileDevicesForMediaAsset(ctx, orgId, args.assetId);
    return serializeAsset(ctx, updated!);
  },
});
