import { auth } from "@clerk/nextjs/server";
import {
  type DeviceCommandResult,
  type HeartbeatPayload,
  type LibraryFolder,
  type ScreenshotUploadPayload,
  dashboardStatsSchema,
  deviceManifestSchema,
  deviceSummarySchema,
  libraryFolderSchema,
  mediaAssetSchema,
  playlistSchema,
  releaseSummarySchema,
  temporaryRegistrationResponseSchema,
  claimStatusResponseSchema,
  deviceCommandSchema,
} from "@showroom/contracts";
import { ConvexHttpClient } from "convex/browser";
import type { FunctionReference } from "convex/server";
import { z } from "zod";

import { api } from "@convex-api";
import { env, hasConvexBackend } from "@/lib/env";
import * as mock from "@/lib/mock-store";

const screenshotSchema = z.object({
  deviceId: z.string(),
  publicUrl: z.string(),
  capturedAt: z.string(),
  bytes: z.number(),
});

const uploadDraftSchema = z.object({
  assetId: z.string(),
  uploadUrl: z.string(),
  storagePath: z.string(),
  expiresInSeconds: z.number(),
});

const deviceDetailSchema = deviceSummarySchema.extend({
  timezone: z.string(),
  orientation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  volume: z.number(),
  defaultPlaylistId: z.string().nullable(),
});

const adminCommandSchema = deviceCommandSchema.extend({
  status: z.enum(["queued", "in_progress", "succeeded", "failed"]).optional(),
  completedAt: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
});

const scheduleSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  priority: z.number(),
  playlistId: z.string().nullable(),
  playlistName: z.string().nullable(),
  targetDeviceId: z.string().nullable(),
  targetLabel: z.string(),
});

function publicConvexClient() {
  if (!env.convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is required for Convex mode.");
  }

  return new ConvexHttpClient(env.convexUrl);
}

async function adminConvexClient() {
  if (!env.convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is required for Convex mode.");
  }

  const client = new ConvexHttpClient(env.convexUrl);
  const session = await auth();
  const token = await session
    .getToken({
      template: "convex",
    })
    .catch(() => null);

  if (token) {
    client.setAuth(token);
    return client;
  }

  throw new Error("Unable to mint Clerk token for Convex.");
}

async function convexQuery(
  reference: FunctionReference<"query">,
  args: unknown,
) {
  const client = await adminConvexClient();
  return client.query(reference as never, args as never);
}

async function convexMutation(
  reference: FunctionReference<"mutation">,
  args: unknown,
) {
  const client = await adminConvexClient();
  return client.mutation(reference as never, args as never);
}

async function publicConvexQuery(
  reference: FunctionReference<"query">,
  args: unknown,
) {
  const client = publicConvexClient();
  return client.query(reference as never, args as never);
}

async function publicConvexMutation(
  reference: FunctionReference<"mutation">,
  args: unknown,
) {
  const client = publicConvexClient();
  return client.mutation(reference as never, args as never);
}

export async function getDashboardStats(orgId: string) {
  if (!hasConvexBackend()) {
    return mock.getDashboardStats(orgId);
  }

  const result = await convexQuery(api.dashboard.getOverview, {});
  return dashboardStatsSchema.parse((result as { stats: unknown }).stats);
}

export async function listDevices(orgId: string) {
  if (!hasConvexBackend()) {
    return mock.listDevices(orgId);
  }

  const result = await convexQuery(api.admin.listScreens, {});
  return z.array(deviceSummarySchema).parse(result);
}

export async function getDevice(orgId: string, deviceId: string) {
  if (!hasConvexBackend()) {
    return mock.getDevice(orgId, deviceId);
  }

  const result = await convexQuery(api.admin.getScreenDetail, { deviceId });
  return result ? deviceDetailSchema.parse(result) : null;
}

export async function listCommands(deviceId?: string) {
  if (!hasConvexBackend()) {
    return mock.listCommands(deviceId);
  }

  const result = await convexQuery(api.admin.listDeviceCommands, {
    deviceId: deviceId ?? undefined,
  });
  return z.array(adminCommandSchema).parse(result);
}

export async function latestScreenshot(deviceId: string) {
  if (!hasConvexBackend()) {
    return mock.latestScreenshot(deviceId);
  }

  const result = await convexQuery(api.admin.getLatestScreenshot, { deviceId });
  return result ? screenshotSchema.parse(result) : null;
}

export async function listMediaAssets() {
  if (!hasConvexBackend()) {
    return mock.listMediaAssets();
  }

  const result = await convexQuery(api.admin.listMediaAssets, {});
  return z.array(mediaAssetSchema).parse(result);
}

export async function listMediaFolders() {
  if (!hasConvexBackend()) {
    return mock.listLibraryFolders("media");
  }

  return z.array(libraryFolderSchema).parse(
    await convexQuery(api.admin.listLibraryFolders, { kind: "media" }),
  );
}

export async function listPlaylistFolders() {
  if (!hasConvexBackend()) {
    return mock.listLibraryFolders("playlist");
  }

  return z.array(libraryFolderSchema).parse(
    await convexQuery(api.admin.listLibraryFolders, { kind: "playlist" }),
  );
}

export async function listReleases() {
  if (!hasConvexBackend()) {
    return mock.listReleases();
  }

  const result = await convexQuery(api.admin.listReleases, {});
  return z.array(releaseSummarySchema).parse(result);
}

export async function listPlaylists() {
  if (!hasConvexBackend()) {
    return mock.listPlaylists();
  }

  const result = await convexQuery(api.admin.listPlaylists, {});
  return z.array(playlistSchema).parse(result);
}

export async function listSchedules() {
  if (!hasConvexBackend()) {
    return [
      {
        id: "schedule-opening",
        label: "Morning opening",
        startsAt: "2026-03-11T09:00:00.000Z",
        endsAt: "2026-03-11T16:00:00.000Z",
        priority: 10,
        playlistId: "playlist-main-showroom",
        playlistName: "Main showroom loop",
        targetDeviceId: null,
        targetLabel: "All screens",
      },
    ];
  }

  return z.array(scheduleSummarySchema).parse(
    await convexQuery(api.admin.listSchedules, {}),
  );
}

export async function createUploadDraft(input: {
  fileName: string;
  mimeType: string;
  bytes: number;
}) {
  if (!hasConvexBackend()) {
    return mock.createUploadDraft(input);
  }

  const result = await convexMutation(api.admin.generateMediaUploadUrl, input);
  return uploadDraftSchema.parse(result);
}

export async function finalizeMediaUpload(input: {
  title: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  storagePath: string;
  previewUrl: string;
  checksum: string;
  storageId?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  tags: string[];
  folderId?: string | null;
}) {
  if (!hasConvexBackend()) {
    return mock.finalizeMediaUpload(input);
  }

  return mediaAssetSchema.parse(
    await convexMutation(api.admin.finalizeMediaUpload, input),
  );
}

export async function createYouTubeMediaAsset(input: {
  title: string;
  sourceUrl: string;
  previewUrl: string;
  fileName: string;
  durationSeconds?: number;
  tags: string[];
  folderId?: string | null;
}) {
  if (!hasConvexBackend()) {
    return mock.createYouTubeMediaAsset(input);
  }

  return mediaAssetSchema.parse(
    await convexMutation(api.admin.createYouTubeMediaAsset, input),
  );
}

export async function importYouTubePlaylist(input: {
  makeDefault?: boolean;
  name: string;
  tags: string[];
  folderId?: string | null;
  assetFolderId?: string | null;
  videos: Array<{
    durationSeconds?: number;
    fileName: string;
    previewUrl: string;
    sourceUrl: string;
    title: string;
  }>;
}) {
  if (!hasConvexBackend()) {
    return mock.importYouTubePlaylist(input);
  }

  return z
    .object({
      assets: z.array(mediaAssetSchema),
      playlist: playlistSchema,
    })
    .parse(await convexMutation(api.admin.importYouTubePlaylist, input));
}

export async function createRelease(input: {
  name: string;
  version: string;
  notes?: string;
  playerUrl?: string;
  playerSha256?: string;
  agentUrl?: string;
  agentSha256?: string;
}) {
  if (!hasConvexBackend()) {
    return mock.createRelease(input);
  }

  return releaseSummarySchema.parse(await convexMutation(api.admin.createRelease, input));
}

export async function deployRelease(input: {
  releaseId: string;
  deviceIds?: string[];
}) {
  if (!hasConvexBackend()) {
    return mock.deployRelease(input);
  }

  return z
    .object({
      queuedDeviceCount: z.number(),
      releaseId: z.string(),
    })
    .parse(await convexMutation(api.admin.deployRelease, input));
}

export async function claimDevice(input: {
  orgId: string;
  claimCode: string;
  name: string;
  siteName: string;
}) {
  if (!hasConvexBackend()) {
    return mock.claimDevice(input);
  }

  const result = await convexMutation(api.admin.claimDeviceByCode, {
    claimCode: input.claimCode,
    name: input.name,
    siteName: input.siteName,
  });
  return z
    .object({
      deviceId: z.string(),
      credential: z.string(),
    })
    .parse(result);
}

export async function issueCommand(input: {
  deviceId: string;
  commandType: string;
  payload?: Record<string, unknown>;
}) {
  if (!hasConvexBackend()) {
    return mock.issueCommand(input);
  }

  const result = await convexMutation(api.admin.enqueueDeviceCommand, input);
  return deviceCommandSchema.parse(result);
}

export async function compileManifests(orgId: string) {
  if (!hasConvexBackend()) {
    return mock.compileManifests(orgId);
  }

  return z
    .object({
      affectedDeviceCount: z.number(),
      manifestVersion: z.string(),
    })
    .parse(await convexMutation(api.admin.compileManifests, {}));
}

export async function savePlaylist(input: {
  playlistId?: string;
  name: string;
  folderId?: string | null;
  itemIds: Array<{
    mediaAssetId: string;
    dwellSeconds?: number;
  }>;
  makeDefault?: boolean;
}) {
  if (!hasConvexBackend()) {
    return mock.savePlaylist(input);
  }

  return playlistSchema.parse(await convexMutation(api.admin.savePlaylist, input));
}

export async function updatePlaylist(input: {
  playlistId: string;
  name?: string;
  folderId?: string | null;
}) {
  if (!hasConvexBackend()) {
    return mock.updatePlaylist(input);
  }

  return playlistSchema.parse(await convexMutation(api.admin.updatePlaylist, input));
}

export async function setDefaultPlaylist(playlistId: string) {
  if (!hasConvexBackend()) {
    return mock.setDefaultPlaylist(playlistId);
  }

  return playlistSchema.parse(
    await convexMutation(api.admin.setDefaultPlaylist, { playlistId: playlistId as never }),
  );
}

export async function saveSchedule(input: {
  scheduleId?: string;
  name: string;
  startsAt: string;
  endsAt: string;
  priority: number;
  playlistId: string;
  deviceId?: string;
}) {
  if (!hasConvexBackend()) {
    return {
      id: "schedule-opening",
      label: input.name,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      priority: input.priority,
      playlistId: input.playlistId,
      playlistName: "Mock playlist",
      targetDeviceId: input.deviceId ?? null,
      targetLabel: input.deviceId ?? "All screens",
    };
  }

  return scheduleSummarySchema.parse(
    await convexMutation(api.admin.saveSchedule, input),
  );
}

export async function updateScreen(input: {
  deviceId: string;
  name: string;
  siteName: string;
  timezone: string;
  orientation: 0 | 90 | 180 | 270;
  volume: number;
  defaultPlaylistId?: string | null;
}) {
  if (!hasConvexBackend()) {
    return mock.getDevice("org-demo", input.deviceId);
  }

  return deviceDetailSchema.parse(await convexMutation(api.admin.updateScreen, input));
}

export async function registerTemporaryDevice() {
  if (!hasConvexBackend()) {
    return mock.registerTemporaryDevice();
  }

  return temporaryRegistrationResponseSchema.parse(
    await publicConvexMutation(api.device.registerTemporary, {}),
  );
}

export async function getClaimStatus(input: {
  deviceSessionId: string;
  claimToken: string;
}) {
  if (!hasConvexBackend()) {
    return mock.getClaimStatus(input);
  }

  return claimStatusResponseSchema.parse(
    await publicConvexQuery(api.device.getClaimStatus, input),
  );
}

export async function refreshDeviceAuth(credential: string | null) {
  if (!credential) {
    return null;
  }

  if (!hasConvexBackend()) {
    return mock.refreshDeviceAuth(credential);
  }

  return z
    .object({
      deviceId: z.string(),
      credential: z.string(),
      expiresInSeconds: z.number(),
    })
    .parse(await publicConvexMutation(api.device.refreshAuth, { credential }));
}

export async function getManifestForCredential(credential: string | null) {
  if (!credential) {
    return null;
  }

  if (!hasConvexBackend()) {
    const device = mock.authenticateDevice(credential);
    return device ? mock.getManifestForDevice(device.id) : null;
  }

  const result = await publicConvexQuery(api.device.getManifest, { credential });
  return result ? deviceManifestSchema.parse(result) : null;
}

export async function getCommandsForCredential(credential: string | null) {
  if (!credential) {
    return null;
  }

  if (!hasConvexBackend()) {
    const device = mock.authenticateDevice(credential);
    return device ? mock.getCommandsForDevice(device.id) : null;
  }

  return z
    .array(deviceCommandSchema)
    .parse(await publicConvexMutation(api.device.claimCommands, { credential }));
}

export async function recordHeartbeatForCredential(
  credential: string | null,
  payload: HeartbeatPayload,
) {
  if (!credential) {
    return null;
  }

  if (!hasConvexBackend()) {
    const device = mock.authenticateDevice(credential);
    return device ? mock.recordHeartbeat(device.id, payload) : null;
  }

  return await publicConvexMutation(api.device.recordHeartbeat, {
    credential,
    payload,
  });
}

export async function recordScreenshotForCredential(
  credential: string | null,
  payload: Omit<ScreenshotUploadPayload, "deviceId"> & {
    deviceId?: string;
    storageId?: string;
  },
) {
  if (!credential) {
    return null;
  }

  if (!hasConvexBackend()) {
    const device = mock.authenticateDevice(credential);
    return device
      ? mock.recordScreenshot({
          deviceId: device.id,
          capturedAt: payload.capturedAt,
          bytes: payload.bytes,
          publicUrl: `https://picsum.photos/seed/${device.id}/1280/720`,
        })
      : null;
  }

  return screenshotSchema.parse(
    await publicConvexMutation(api.device.recordScreenshot, {
      credential,
      payload,
    }),
  );
}

export async function generateDeviceScreenshotUploadUrl(credential: string | null) {
  if (!credential) {
    return null;
  }

  if (!hasConvexBackend()) {
    return {
      uploadUrl: "/api/device/mock-screenshot-upload",
    };
  }

  return z
    .object({
      uploadUrl: z.string(),
    })
    .parse(
      await publicConvexMutation(api.device.generateScreenshotUploadUrl, {
        credential,
      }),
    );
}

export async function recordCommandResultForCredential(
  credential: string | null,
  payload: DeviceCommandResult,
) {
  if (!credential) {
    return null;
  }

  if (!hasConvexBackend()) {
    return mock.recordCommandResult(payload);
  }

  return await publicConvexMutation(api.device.recordCommandResult, {
    credential,
    payload,
  });
}

export async function deletePlaylist(id: string) {
  if (!hasConvexBackend()) {
    mock.deletePlaylist(id);
    return;
  }

  await convexMutation(api.admin.deletePlaylist, { playlistId: id as never });
}

export async function deleteSchedule(id: string) {
  if (!hasConvexBackend()) {
    mock.deleteSchedule(id);
    return;
  }

  await convexMutation(api.admin.deleteSchedule, { scheduleId: id as never });
}

export async function deleteMediaAsset(id: string) {
  if (!hasConvexBackend()) {
    mock.deleteMediaAsset(id);
    return;
  }

  await convexMutation(api.admin.deleteMediaAsset, { assetId: id as never });
}

export async function updateMediaAsset(input: {
  assetId: string;
  title?: string;
  tags?: string[];
  folderId?: string | null;
}) {
  if (!hasConvexBackend()) {
    return mock.updateMediaAsset(input);
  }

  return mediaAssetSchema.parse(
    await convexMutation(api.admin.updateMediaAsset, {
      assetId: input.assetId as never,
      title: input.title,
      tags: input.tags,
      folderId: input.folderId,
    }),
  );
}

export async function createLibraryFolder(input: {
  kind: LibraryFolder["kind"];
  name: string;
  parentId?: string | null;
}) {
  if (!hasConvexBackend()) {
    return mock.createLibraryFolder(input);
  }

  return libraryFolderSchema.parse(await convexMutation(api.admin.createLibraryFolder, input));
}

export async function updateLibraryFolder(input: {
  folderId: string;
  name?: string;
  parentId?: string | null;
}) {
  if (!hasConvexBackend()) {
    return mock.updateLibraryFolder(input);
  }

  return libraryFolderSchema.parse(await convexMutation(api.admin.updateLibraryFolder, input));
}

export async function deleteLibraryFolder(folderId: string) {
  if (!hasConvexBackend()) {
    mock.deleteLibraryFolder(folderId);
    return;
  }

  await convexMutation(api.admin.deleteLibraryFolder, { folderId: folderId as never });
}

export async function upsertOrganizationFromClerkWebhook(input: {
  clerkOrgId: string;
  name: string;
  slug: string;
  metadata: Record<string, unknown>;
}) {
  if (!hasConvexBackend()) {
    return input;
  }

  return convexMutation(api.sync.upsertOrganizationFromClerk, input);
}

export async function deleteOrganizationFromClerkWebhook(input: {
  clerkOrgId: string;
}) {
  if (!hasConvexBackend()) {
    return input;
  }

  return convexMutation(api.sync.deleteOrganizationFromClerk, input);
}

export async function upsertUserFromClerkWebhook(input: {
  clerkUserId: string;
  email: string;
  firstName?: string;
  lastName?: string;
}) {
  if (!hasConvexBackend()) {
    return input;
  }

  return convexMutation(api.sync.upsertUserFromClerk, input);
}

export async function deleteUserFromClerkWebhook(input: {
  clerkUserId: string;
}) {
  if (!hasConvexBackend()) {
    return input;
  }

  return convexMutation(api.sync.deleteUserFromClerk, input);
}
