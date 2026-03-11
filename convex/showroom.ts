import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ConvexError } from "convex/values";

type Ctx = QueryCtx | MutationCtx;

type ManifestItem = {
  id: string;
  assetId: string;
  assetType: "image" | "video";
  sourceType: "upload" | "youtube";
  title: string;
  url: string;
  checksum: string;
  durationSeconds?: number;
};

export function deriveDeviceStatus(device: Pick<Doc<"devices">, "status" | "lastHeartbeatAt">) {
  if (device.status === "unclaimed") {
    return "unclaimed" as const;
  }

  if (!device.lastHeartbeatAt) {
    return "offline" as const;
  }

  const ageMs = Date.now() - device.lastHeartbeatAt;
  if (ageMs >= 5 * 60_000) {
    return "offline" as const;
  }
  if (ageMs >= 2 * 60_000) {
    return "stale" as const;
  }
  return "online" as const;
}

export async function serializeAsset(ctx: Ctx, asset: Doc<"mediaAssets">) {
  const previewUrl =
    asset.storageId ? (await ctx.storage.getUrl(asset.storageId)) ?? asset.previewUrl : asset.previewUrl;
  const sourceType = asset.sourceType ?? "upload";

  return {
    id: asset._id,
    title: asset.title,
    type: asset.mediaType,
    sourceType,
    sourceUrl: asset.sourceUrl,
    mimeType: asset.mimeType,
    fileName: asset.fileName,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    durationSeconds: asset.durationSeconds,
    storagePath: asset.storagePath,
    previewUrl,
    checksum: asset.checksum,
    tags: asset.tags,
  };
}

async function getPlaylistAssetMap(ctx: Ctx, playlistId: Id<"playlists">) {
  const items = await ctx.db
    .query("playlistItems")
    .withIndex("by_playlist_and_order", (q) => q.eq("playlistId", playlistId))
    .collect();

  const assets = await Promise.all(items.map((item) => ctx.db.get(item.mediaAssetId)));
  return items.map((item, index) => {
    const asset = assets[index];
    if (!asset) {
      throw new ConvexError("Playlist item asset missing");
    }

    return {
      item,
      asset,
    };
  });
}

export async function serializePlaylist(ctx: Ctx, playlist: Doc<"playlists">) {
  const itemPairs = await getPlaylistAssetMap(ctx, playlist._id);

  return {
    id: playlist._id,
    name: playlist.name,
    items: await Promise.all(
      itemPairs.map(async ({ item, asset }) => ({
        id: item._id,
        order: item.itemOrder,
        dwellSeconds: item.dwellSeconds ?? null,
        asset: await serializeAsset(ctx, asset),
      })),
    ),
  };
}

export async function getDefaultPlaylist(
  ctx: Ctx,
  orgId: string,
  device?: Doc<"devices"> | null,
) {
  if (device?.defaultPlaylistId) {
    const devicePlaylist = await ctx.db.get(device.defaultPlaylistId);
    if (devicePlaylist && devicePlaylist.organizationId === orgId) {
      return devicePlaylist;
    }
  }

  const playlists = await ctx.db
    .query("playlists")
    .withIndex("by_org", (q) => q.eq("organizationId", orgId))
    .collect();

  return playlists.find((playlist) => playlist.isDefault) ?? playlists[0] ?? null;
}

export async function buildManifestPlaylistItems(
  ctx: Ctx,
  playlistId: Id<"playlists"> | undefined,
) {
  if (!playlistId) {
    return [] as ManifestItem[];
  }

  const itemPairs = await getPlaylistAssetMap(ctx, playlistId);
  return Promise.all(
    itemPairs.map(async ({ item, asset }) => {
      const sourceType = asset.sourceType ?? "upload";
      if (sourceType === "youtube" && !asset.sourceUrl) {
        throw new ConvexError(`YouTube asset ${asset._id} is missing sourceUrl`);
      }

      const uploadUrl =
        asset.storageId ? (await ctx.storage.getUrl(asset.storageId)) ?? asset.previewUrl : asset.previewUrl;
      const url = sourceType === "youtube" ? asset.sourceUrl! : uploadUrl;

      return {
        id: item._id,
        assetId: asset._id,
        assetType: asset.mediaType,
        sourceType,
        title: asset.title,
        url,
        checksum: asset.checksum,
        durationSeconds: item.dwellSeconds ?? asset.durationSeconds ?? 10,
      };
    }),
  );
}

export async function buildManifestForDevice(
  ctx: Ctx,
  device: Doc<"devices">,
  manifestVersion: string,
) {
  const orgId = device.organizationId;
  if (!orgId) {
    throw new ConvexError("Cannot compile manifest for an unclaimed device");
  }

  const defaultPlaylist = await getDefaultPlaylist(ctx, orgId, device);
  const defaultPlaylistItems = await buildManifestPlaylistItems(
    ctx,
    defaultPlaylist?._id,
  );

  const schedules = await ctx.db
    .query("schedules")
    .withIndex("by_org", (q) => q.eq("organizationId", orgId))
    .collect();
  const targetRows = await ctx.db
    .query("scheduleTargets")
    .withIndex("by_org", (q) => q.eq("organizationId", orgId))
    .collect();

  const relevantTargets = targetRows.filter((target) => {
    if (target.deviceId) {
      return target.deviceId === device._id;
    }

    return !target.groupId && !target.siteId;
  });

  const scheduleWindows = await Promise.all(
    relevantTargets.map(async (target) => {
      const schedule = schedules.find((entry) => entry._id === target.scheduleId);
      if (!schedule) {
        return null;
      }

      return {
        id: schedule._id,
        label: schedule.name,
        startsAt: new Date(schedule.startsAt).toISOString(),
        endsAt: new Date(schedule.endsAt).toISOString(),
        priority: schedule.priority,
        playlist: await buildManifestPlaylistItems(ctx, target.playlistId),
      };
    }),
  );

  const assetChecksums = Object.fromEntries(
    [...defaultPlaylistItems, ...scheduleWindows.flatMap((window) => window?.playlist ?? [])].map(
      (item) => [item.assetId, item.checksum],
    ),
  );

  return {
    manifestVersion,
    deviceId: device._id,
    generatedAt: new Date().toISOString(),
    timezone: device.timezone,
    orientation: device.orientation as 0 | 90 | 180 | 270,
    volume: device.volume,
    defaultPlaylist: defaultPlaylistItems,
    scheduleWindows: scheduleWindows.filter(
      (window): window is NonNullable<typeof window> => window !== null,
    ),
    assetBaseUrl: "",
    assetChecksums,
  };
}

export async function activateManifestForDevice(
  ctx: MutationCtx,
  device: Doc<"devices">,
  manifestVersion: string,
) {
  const activeManifests = await ctx.db
    .query("compiledManifests")
    .withIndex("by_device_and_active", (q) => q.eq("deviceId", device._id))
    .collect();

  await Promise.all(
    activeManifests
      .filter((manifest) => manifest.isActive)
      .map((manifest) =>
        ctx.db.patch(manifest._id, {
          isActive: false,
          updatedAt: Date.now(),
        }),
      ),
  );

  const payload = await buildManifestForDevice(ctx, device, manifestVersion);

  await ctx.db.insert("compiledManifests", {
    organizationId: device.organizationId,
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

  return payload;
}

export async function compileOrgManifests(ctx: MutationCtx, orgId: string) {
  const devices = await ctx.db
    .query("devices")
    .withIndex("by_org", (q) => q.eq("organizationId", orgId))
    .collect();

  const manifestVersion = `manifest-${Date.now()}`;
  for (const device of devices) {
    await activateManifestForDevice(ctx, device, manifestVersion);
  }

  return {
    devices,
    manifestVersion,
  };
}
