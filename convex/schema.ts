import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const statusValidator = v.union(
  v.literal("online"),
  v.literal("stale"),
  v.literal("offline"),
  v.literal("unclaimed"),
);

const commandTypeValidator = v.union(
  v.literal("sync_now"),
  v.literal("restart_player"),
  v.literal("reboot_device"),
  v.literal("take_screenshot"),
  v.literal("blank_screen"),
  v.literal("unblank_screen"),
  v.literal("update_release"),
);

const commandStatusValidator = v.union(
  v.literal("queued"),
  v.literal("in_progress"),
  v.literal("succeeded"),
  v.literal("failed"),
);

const releaseRolloutStatusValidator = v.union(
  v.literal("queued"),
  v.literal("in_progress"),
  v.literal("succeeded"),
  v.literal("failed"),
);

export default defineSchema({
  organizations: defineTable({
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.string(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_org_id", ["clerkOrgId"])
    .index("by_slug", ["slug"]),

  users: defineTable({
    organizationId: v.string(),
    clerkUserId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org_and_clerk_user", ["organizationId", "clerkUserId"]),

  sites: defineTable({
    organizationId: v.string(),
    name: v.string(),
    timezone: v.string(),
    address: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org", ["organizationId"]),

  screenGroups: defineTable({
    organizationId: v.string(),
    siteId: v.optional(v.id("sites")),
    name: v.string(),
    description: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org", ["organizationId"]),

  devices: defineTable({
    organizationId: v.optional(v.string()),
    siteName: v.optional(v.string()),
    groupName: v.optional(v.string()),
    name: v.optional(v.string()),
    defaultPlaylistId: v.optional(v.id("playlists")),
    serialNumber: v.optional(v.string()),
    claimCode: v.optional(v.string()),
    claimTokenHash: v.optional(v.string()),
    claimExpiresAt: v.optional(v.number()),
    status: statusValidator,
    timezone: v.string(),
    orientation: v.number(),
    volume: v.number(),
    manifestVersion: v.optional(v.string()),
    lastHeartbeatAt: v.optional(v.number()),
    lastSeenIp: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    agentVersion: v.optional(v.string()),
    screenshotUrl: v.optional(v.string()),
    currentPlaylistName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_claim_code", ["claimCode"])
    .index("by_org", ["organizationId"])
    .index("by_org_and_status", ["organizationId", "status"]),

  deviceCredentials: defineTable({
    deviceId: v.id("devices"),
    version: v.number(),
    secretHash: v.string(),
    issuedAt: v.number(),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_secret_hash", ["secretHash"])
    .index("by_device", ["deviceId"]),

  deviceRegistrations: defineTable({
    deviceSessionId: v.string(),
    claimCode: v.string(),
    claimTokenHash: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    claimedDeviceId: v.optional(v.id("devices")),
    credential: v.optional(v.string()),
    credentialExpiresAt: v.optional(v.number()),
  })
    .index("by_session", ["deviceSessionId"])
    .index("by_claim_code", ["claimCode"]),

  deviceHeartbeats: defineTable({
    organizationId: v.optional(v.string()),
    deviceId: v.id("devices"),
    manifestVersion: v.optional(v.string()),
    uptimeSeconds: v.number(),
    storageFreeBytes: v.number(),
    storageTotalBytes: v.number(),
    currentAssetId: v.optional(v.string()),
    currentPlaylistId: v.optional(v.string()),
    payload: v.any(),
    receivedAt: v.number(),
  }).index("by_device_and_received_at", ["deviceId", "receivedAt"]),

  deviceScreenshots: defineTable({
    organizationId: v.optional(v.string()),
    deviceId: v.id("devices"),
    storageId: v.optional(v.id("_storage")),
    publicUrl: v.string(),
    capturedAt: v.number(),
    bytes: v.number(),
    createdAt: v.number(),
  }).index("by_device_and_captured_at", ["deviceId", "capturedAt"]),

  libraryFolders: defineTable({
    organizationId: v.string(),
    kind: v.union(v.literal("media"), v.literal("playlist")),
    name: v.string(),
    parentFolderId: v.optional(v.id("libraryFolders")),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_org_and_kind", ["organizationId", "kind"])
    .index("by_parent", ["parentFolderId"]),

  mediaAssets: defineTable({
    organizationId: v.string(),
    folderId: v.optional(v.id("libraryFolders")),
    title: v.string(),
    mediaType: v.union(v.literal("image"), v.literal("video")),
    sourceType: v.optional(v.union(v.literal("upload"), v.literal("youtube"))),
    sourceUrl: v.optional(v.string()),
    mimeType: v.string(),
    fileName: v.string(),
    storageId: v.optional(v.id("_storage")),
    storagePath: v.string(),
    previewUrl: v.string(),
    sizeBytes: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    checksum: v.string(),
    tags: v.array(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org", ["organizationId"]),

  releases: defineTable({
    organizationId: v.string(),
    name: v.string(),
    version: v.string(),
    notes: v.optional(v.string()),
    playerUrl: v.optional(v.string()),
    playerSha256: v.optional(v.string()),
    agentUrl: v.optional(v.string()),
    agentSha256: v.optional(v.string()),
    systemUrl: v.optional(v.string()),
    systemSha256: v.optional(v.string()),
    createdByUserId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org", ["organizationId"]),

  releaseRollouts: defineTable({
    organizationId: v.string(),
    releaseId: v.id("releases"),
    deviceId: v.id("devices"),
    commandId: v.id("deviceCommands"),
    status: releaseRolloutStatusValidator,
    queuedAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    message: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org_and_queued_at", ["organizationId", "queuedAt"])
    .index("by_release_and_queued_at", ["releaseId", "queuedAt"])
    .index("by_command", ["commandId"])
    .index("by_device_and_queued_at", ["deviceId", "queuedAt"]),

  playlists: defineTable({
    organizationId: v.string(),
    folderId: v.optional(v.id("libraryFolders")),
    name: v.string(),
    description: v.optional(v.string()),
    isDefault: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org", ["organizationId"]),

  playlistItems: defineTable({
    organizationId: v.string(),
    playlistId: v.id("playlists"),
    mediaAssetId: v.id("mediaAssets"),
    itemOrder: v.number(),
    dwellSeconds: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_playlist_and_order", ["playlistId", "itemOrder"])
    .index("by_org", ["organizationId"]),

  schedules: defineTable({
    organizationId: v.string(),
    name: v.string(),
    timezone: v.string(),
    startsAt: v.number(),
    endsAt: v.number(),
    priority: v.number(),
    fallbackPlaylistId: v.optional(v.id("playlists")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org", ["organizationId"]),

  scheduleTargets: defineTable({
    organizationId: v.string(),
    scheduleId: v.id("schedules"),
    deviceId: v.optional(v.id("devices")),
    groupId: v.optional(v.id("screenGroups")),
    siteId: v.optional(v.id("sites")),
    playlistId: v.id("playlists"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_schedule", ["scheduleId"])
    .index("by_org", ["organizationId"]),

  compiledManifests: defineTable({
    organizationId: v.optional(v.string()),
    deviceId: v.id("devices"),
    version: v.string(),
    payload: v.any(),
    isActive: v.boolean(),
    dirty: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_device_and_active", ["deviceId", "isActive"]),

  deviceCommands: defineTable({
    organizationId: v.optional(v.string()),
    deviceId: v.id("devices"),
    commandType: commandTypeValidator,
    status: commandStatusValidator,
    payload: v.any(),
    queuedAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    resultMessage: v.optional(v.string()),
  })
    .index("by_device_and_queued_at", ["deviceId", "queuedAt"])
    .index("by_device_and_status", ["deviceId", "status"]),

  activityLogs: defineTable({
    organizationId: v.string(),
    actorUserId: v.optional(v.string()),
    actorDeviceId: v.optional(v.id("devices")),
    action: v.string(),
    subjectType: v.string(),
    subjectId: v.string(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_org", ["organizationId"]),

  alertRules: defineTable({
    organizationId: v.string(),
    name: v.string(),
    staleAfterSeconds: v.number(),
    offlineAfterSeconds: v.number(),
    notifyAfterSeconds: v.number(),
    emailRecipients: v.array(v.string()),
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org", ["organizationId"]),

  alertEvents: defineTable({
    organizationId: v.string(),
    alertRuleId: v.id("alertRules"),
    deviceId: v.id("devices"),
    alertType: v.string(),
    state: v.string(),
    openedAt: v.number(),
    resolvedAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  }).index("by_device", ["deviceId"]),
});
