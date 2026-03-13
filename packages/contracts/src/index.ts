import { z } from "zod";

export const orientationSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
]);

export const commandTypeSchema = z.enum([
  "sync_now",
  "restart_player",
  "reboot_device",
  "take_screenshot",
  "blank_screen",
  "unblank_screen",
  "update_release",
]);

const sha256Schema = z
  .string()
  .trim()
  .regex(/^(sha256:)?[a-f0-9]{64}$/i, "Expected a SHA-256 hex digest");

export const releaseUpdatePayloadSchema = z
  .object({
    version: z.string().trim().min(1).optional(),
    agentVersion: z.string().trim().min(1).optional(),
    agentUrl: z.string().url().optional(),
    agentSha256: sha256Schema.optional(),
    playerVersion: z.string().trim().min(1).optional(),
    playerUrl: z.string().url().optional(),
    playerSha256: sha256Schema.optional(),
  })
  .refine((value) => Boolean(value.agentUrl || value.playerUrl), {
    message: "Provide at least one release URL",
    path: ["agentUrl"],
  });

export const mediaTypeSchema = z.enum(["image", "video"]);
export const assetSourceTypeSchema = z.enum(["upload", "youtube"]);
export const releaseRolloutStatusSchema = z.enum([
  "queued",
  "in_progress",
  "succeeded",
  "failed",
]);

export const manifestPlaylistItemSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  assetType: mediaTypeSchema,
  sourceType: assetSourceTypeSchema.default("upload"),
  title: z.string(),
  url: z.string(),
  checksum: z.string(),
  durationSeconds: z.number().int().positive().optional(),
});

export const scheduleWindowSchema = z.object({
  id: z.string(),
  label: z.string(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  priority: z.number().int(),
  playlist: z.array(manifestPlaylistItemSchema),
});

export const deviceManifestSchema = z.object({
  manifestVersion: z.string(),
  deviceId: z.string(),
  generatedAt: z.string().datetime(),
  timezone: z.string(),
  orientation: orientationSchema,
  volume: z.number().min(0).max(100),
  defaultPlaylist: z.array(manifestPlaylistItemSchema),
  scheduleWindows: z.array(scheduleWindowSchema),
  assetBaseUrl: z.string(),
  assetChecksums: z.record(z.string()),
});

export const heartbeatPayloadSchema = z.object({
  deviceId: z.string(),
  manifestVersion: z.string().optional(),
  appVersion: z.string(),
  agentVersion: z.string(),
  uptimeSeconds: z.number().int().nonnegative(),
  storageFreeBytes: z.number().int().nonnegative(),
  storageTotalBytes: z.number().int().positive(),
  screenshotRequestedAt: z.string().datetime().optional(),
  currentAssetId: z.string().optional(),
  currentPlaylistId: z.string().optional(),
  lastSeenAt: z.string().datetime(),
});

export const screenshotUploadPayloadSchema = z.object({
  deviceId: z.string(),
  capturedAt: z.string().datetime(),
  mimeType: z.literal("image/jpeg"),
  bytes: z.number().int().positive(),
});

export const deviceCommandSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  commandType: commandTypeSchema,
  issuedAt: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const deviceCommandResultSchema = z.object({
  commandId: z.string(),
  deviceId: z.string(),
  status: z.enum(["queued", "in_progress", "succeeded", "failed"]),
  message: z.string().optional(),
  completedAt: z.string().datetime().optional(),
});

export const temporaryRegistrationResponseSchema = z.object({
  deviceSessionId: z.string(),
  claimCode: z.string().length(6),
  claimToken: z.string(),
  pollingIntervalSeconds: z.number().int().positive(),
});

export const claimStatusResponseSchema = z.object({
  claimed: z.boolean(),
  deviceId: z.string().optional(),
  credential: z.string().optional(),
  pollAgainSeconds: z.number().int().positive(),
});

export const deviceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  siteName: z.string(),
  status: z.enum(["online", "stale", "offline", "unclaimed"]),
  lastHeartbeatAt: z.string(),
  screenshotUrl: z.string().nullable(),
  currentPlaylistName: z.string().nullable(),
  manifestVersion: z.string().nullable(),
});

export const mediaAssetSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: mediaTypeSchema,
  sourceType: assetSourceTypeSchema.default("upload"),
  sourceUrl: z.string().url().optional(),
  mimeType: z.string(),
  fileName: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSeconds: z.number().positive().optional(),
  storagePath: z.string(),
  previewUrl: z.string(),
  checksum: z.string(),
  tags: z.array(z.string()).default([]),
});

export const playlistItemSchema = z.object({
  id: z.string(),
  order: z.number().int().nonnegative(),
  dwellSeconds: z.number().int().positive().nullable(),
  asset: mediaAssetSchema,
});

export const playlistSchema = z.object({
  id: z.string(),
  name: z.string(),
  isDefault: z.boolean().default(false),
  items: z.array(playlistItemSchema),
});

export const releaseRolloutSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  deviceName: z.string(),
  status: releaseRolloutStatusSchema,
  queuedAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  message: z.string().nullable(),
});

export const releaseSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  notes: z.string().nullable(),
  playerUrl: z.string().url().nullable(),
  playerSha256: z.string().nullable(),
  agentUrl: z.string().url().nullable(),
  agentSha256: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  rolloutSummary: z.object({
    total: z.number().int().nonnegative(),
    queued: z.number().int().nonnegative(),
    inProgress: z.number().int().nonnegative(),
    succeeded: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  latestRollouts: z.array(releaseRolloutSchema),
});

export const dashboardStatsSchema = z.object({
  online: z.number().int().nonnegative(),
  stale: z.number().int().nonnegative(),
  offline: z.number().int().nonnegative(),
  unclaimed: z.number().int().nonnegative(),
  pendingCommands: z.number().int().nonnegative(),
});

export type DeviceManifest = z.infer<typeof deviceManifestSchema>;
export type ManifestPlaylistItem = z.infer<typeof manifestPlaylistItemSchema>;
export type HeartbeatPayload = z.infer<typeof heartbeatPayloadSchema>;
export type ScreenshotUploadPayload = z.infer<typeof screenshotUploadPayloadSchema>;
export type DeviceCommand = z.infer<typeof deviceCommandSchema>;
export type DeviceCommandResult = z.infer<typeof deviceCommandResultSchema>;
export type TemporaryRegistrationResponse = z.infer<typeof temporaryRegistrationResponseSchema>;
export type ClaimStatusResponse = z.infer<typeof claimStatusResponseSchema>;
export type DeviceSummary = z.infer<typeof deviceSummarySchema>;
export type MediaAsset = z.infer<typeof mediaAssetSchema>;
export type Playlist = z.infer<typeof playlistSchema>;
export type DashboardStats = z.infer<typeof dashboardStatsSchema>;
export type ReleaseUpdatePayload = z.infer<typeof releaseUpdatePayloadSchema>;
export type ReleaseSummary = z.infer<typeof releaseSummarySchema>;
export type ReleaseRollout = z.infer<typeof releaseRolloutSchema>;

export const mockMediaAssets: MediaAsset[] = [
  {
    id: "asset-hero-video",
    title: "Showroom hero reel",
    type: "video",
    sourceType: "upload",
    mimeType: "video/mp4",
    fileName: "hero-reel.mp4",
    sizeBytes: 128_000_000,
    width: 1920,
    height: 1080,
    durationSeconds: 24,
    storagePath: "media/org-demo/hero-reel.mp4",
    previewUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
    checksum: "sha256:hero-reel",
    tags: ["launch", "video"],
  },
  {
    id: "asset-feature-poster",
    title: "Feature poster",
    type: "image",
    sourceType: "upload",
    mimeType: "image/webp",
    fileName: "feature-poster.webp",
    sizeBytes: 2_400_000,
    width: 1920,
    height: 1080,
    storagePath: "media/org-demo/feature-poster.webp",
    previewUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80",
    checksum: "sha256:feature-poster",
    tags: ["image", "poster"],
  },
  {
    id: "asset-detail-slide",
    title: "Detail slide",
    type: "image",
    sourceType: "upload",
    mimeType: "image/jpeg",
    fileName: "detail-slide.jpg",
    sizeBytes: 1_200_000,
    width: 1920,
    height: 1080,
    storagePath: "media/org-demo/detail-slide.jpg",
    previewUrl: "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1200&q=80",
    checksum: "sha256:detail-slide",
    tags: ["detail", "image"],
  },
];

export const mockPlaylist: Playlist = {
  id: "playlist-main-showroom",
  name: "Main showroom loop",
  isDefault: true,
  items: [
    {
      id: "item-1",
      order: 0,
      dwellSeconds: null,
      asset: mockMediaAssets[0],
    },
    {
      id: "item-2",
      order: 1,
      dwellSeconds: 12,
      asset: mockMediaAssets[1],
    },
    {
      id: "item-3",
      order: 2,
      dwellSeconds: 10,
      asset: mockMediaAssets[2],
    },
  ],
};

export const mockManifest: DeviceManifest = {
  manifestVersion: "manifest-2026-03-11T10:00:00Z",
  deviceId: "device-demo-001",
  generatedAt: "2026-03-11T10:00:00.000Z",
  timezone: "America/New_York",
  orientation: 0,
  volume: 0,
  defaultPlaylist: mockPlaylist.items.map((item) => ({
    id: item.id,
    assetId: item.asset.id,
    assetType: item.asset.type,
    sourceType: item.asset.sourceType,
    title: item.asset.title,
    url: item.asset.previewUrl,
    checksum: item.asset.checksum,
    durationSeconds:
      item.dwellSeconds ?? item.asset.durationSeconds ?? 10,
  })),
  scheduleWindows: [
    {
      id: "schedule-opening",
      label: "Morning opening",
      startsAt: "2026-03-11T09:00:00.000Z",
      endsAt: "2026-03-11T16:00:00.000Z",
      priority: 10,
      playlist: [],
    },
  ],
  assetBaseUrl: "http://127.0.0.1:4173/assets",
  assetChecksums: Object.fromEntries(
    mockPlaylist.items.map((item) => [item.asset.id, item.asset.checksum]),
  ),
};

export const mockDevices: DeviceSummary[] = [
  {
    id: "device-demo-001",
    name: "Front Window",
    siteName: "Chelsea showroom",
    status: "online",
    lastHeartbeatAt: "2026-03-11T10:02:00.000Z",
    screenshotUrl: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1200&q=80",
    currentPlaylistName: mockPlaylist.name,
    manifestVersion: mockManifest.manifestVersion,
  },
  {
    id: "device-demo-002",
    name: "Product Wall",
    siteName: "Chelsea showroom",
    status: "stale",
    lastHeartbeatAt: "2026-03-11T09:58:12.000Z",
    screenshotUrl: "https://images.unsplash.com/photo-1497366412874-3415097a27e7?auto=format&fit=crop&w=1200&q=80",
    currentPlaylistName: "Accessories focus",
    manifestVersion: "manifest-2026-03-11T09:30:00Z",
  },
  {
    id: "device-demo-003",
    name: "Entry Totem",
    siteName: "Chelsea showroom",
    status: "offline",
    lastHeartbeatAt: "2026-03-11T09:42:55.000Z",
    screenshotUrl: null,
    currentPlaylistName: null,
    manifestVersion: null,
  },
];

export const mockDashboardStats: DashboardStats = {
  online: 1,
  stale: 1,
  offline: 1,
  unclaimed: 0,
  pendingCommands: 2,
};

export const acceptedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
]);

export const maxMediaBytes = 250 * 1024 * 1024;
