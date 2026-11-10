import crypto from "node:crypto";

import {
  type DashboardStats,
  type DeviceCommand,
  type DeviceCommandResult,
  type DeviceManifest,
  type DeviceSummary,
  type LibraryFolder,
  type MediaAsset,
  type Playlist,
  type ReleaseSummary,
  type ScheduleRecurrence,
  claimStatusResponseSchema,
  commandTypeSchema,
  deviceCommandResultSchema,
  deviceCommandSchema,
  deviceManifestSchema,
  heartbeatPayloadSchema,
  isFleetManagedDevice,
  planReleaseRollout,
  recurringWindowInstant,
  releaseCommandPayloadForDevice,
  releaseVersionPattern,
  requiresFleetManagedDevice,
  supportsSystemBundles,
  libraryFolderKindSchema,
  mockDashboardStats,
  mockDevices,
  mockManifest,
  mockMediaAssets,
  mockMediaFolders,
  mockPlaylist,
  mockPlaylistFolders,
  temporaryRegistrationResponseSchema,
} from "@showroom/contracts";

type ScreenshotRecord = {
  deviceId: string;
  publicUrl: string;
  capturedAt: string;
  bytes: number;
};

type RegistrationRecord = {
  deviceSessionId: string;
  claimCode: string;
  claimToken: string;
  createdAt: string;
  claimedDeviceId?: string;
  credential?: string;
};

type DeviceRecord = DeviceSummary & {
  orgId: string;
  claimCode?: string;
  credential?: string;
  defaultPlaylistId?: string | null;
  timezone: string;
  orientation: 0 | 90 | 180 | 270;
  volume: number;
};

type MockSchedule = {
  id: string;
  label: string;
  startsAt: string;
  endsAt: string;
  recurrence: ScheduleRecurrence | null;
  priority: number;
  playlistId: string;
  targetDeviceId: string | null;
};

type MockState = {
  devices: DeviceRecord[];
  folders: LibraryFolder[];
  mediaAssets: MediaAsset[];
  playlists: Playlist[];
  schedules?: MockSchedule[];
  releases: ReleaseSummary[];
  manifests: Record<string, DeviceManifest>;
  screenshots: ScreenshotRecord[];
  commands: DeviceCommand[];
  // Delivery state per command id; a command with no entry is still queued.
  commandStates?: Record<string, MockCommandState>;
  registrations: RegistrationRecord[];
  // Wrong claim codes per workspace, as timestamps (the real backend's
  // claimFailures table).
  claimFailures?: Record<string, number[]>;
};

// Same limits as convex/admin.ts claimDeviceByCode.
const maxClaimFailures = 10;
const claimLockoutWindowMs = 15 * 60_000;

type MockCommandState = {
  status: "in_progress" | "succeeded" | "failed";
  startedAt: string;
  completedAt: string | null;
  message: string | null;
};

function commandStates() {
  const mockState = state();
  mockState.commandStates ??= {};
  return mockState.commandStates;
}

type FolderKind = LibraryFolder["kind"];

declare global {
  var __showroomMockState: MockState | undefined;
}

function cloneFolder(folder: LibraryFolder): LibraryFolder {
  return { ...folder };
}

function cloneAsset(asset: MediaAsset): MediaAsset {
  return {
    ...asset,
    tags: [...asset.tags],
  };
}

function clonePlaylist(playlist: Playlist): Playlist {
  return {
    ...playlist,
    items: playlist.items.map((item) => ({
      ...item,
      asset: cloneAsset(item.asset),
    })),
  };
}

function ensurePlaylistItemsReferenceCurrentAssets(playlist: Playlist, assets: MediaAsset[]) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  playlist.items = playlist.items
    .map((item) => {
      const asset = byId.get(item.asset.id);
      if (!asset) {
        return null;
      }

      return {
        ...item,
        asset,
      };
    })
    .filter((item): item is Playlist["items"][number] => item !== null);
}

function normalizeFolderParent(parentId?: string | null) {
  return parentId ?? null;
}

function assertFolderKind(folderId: string | null | undefined, kind: FolderKind) {
  if (!folderId) {
    return null;
  }

  const folder = state().folders.find((entry) => entry.id === folderId) ?? null;
  if (!folder || folder.kind !== kind) {
    throw new Error("Folder not found");
  }

  return folder;
}

function getDescendantFolderIds(folderId: string): Set<string> {
  const descendants = new Set<string>();
  const queue = [folderId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const folder of state().folders) {
      if (folder.parentId === current && !descendants.has(folder.id)) {
        descendants.add(folder.id);
        queue.push(folder.id);
      }
    }
  }

  descendants.delete(folderId);
  return descendants;
}

function sanitizeFolderMove(folderId: string, parentId?: string | null) {
  if (!parentId) {
    return null;
  }

  if (parentId === folderId) {
    throw new Error("A folder cannot contain itself");
  }

  const descendants = getDescendantFolderIds(folderId);
  if (descendants.has(parentId)) {
    throw new Error("A folder cannot be moved into one of its descendants");
  }

  return parentId;
}

function buildState(): MockState {
  const folders = [...mockMediaFolders, ...mockPlaylistFolders].map(cloneFolder);
  const mediaAssets = mockMediaAssets.map(cloneAsset);
  const basePlaylist = clonePlaylist(mockPlaylist);
  ensurePlaylistItemsReferenceCurrentAssets(basePlaylist, mediaAssets);

  const seasonalPlaylist: Playlist = {
    id: "playlist-seasonal-launch",
    folderId: "folder-playlist-seasonal",
    name: "Spring launch loop",
    isDefault: false,
    items: [
      {
        id: "playlist-seasonal-item-1",
        order: 0,
        dwellSeconds: null,
        asset: mediaAssets[0]!,
      },
      {
        id: "playlist-seasonal-item-2",
        order: 1,
        dwellSeconds: 8,
        asset: mediaAssets[1]!,
      },
    ],
  };

  return {
    devices: mockDevices.map((device) => ({
      ...device,
      orgId: "org-demo",
      defaultPlaylistId: basePlaylist.id,
      timezone: "America/New_York",
      orientation: 0,
      volume: 0,
      credential: `demo-${device.id}`,
    })),
    folders,
    mediaAssets,
    playlists: [basePlaylist, seasonalPlaylist],
    schedules: [
      {
        id: "schedule-opening",
        label: "Opening hours",
        startsAt: recurringWindowInstant,
        endsAt: recurringWindowInstant,
        recurrence: { daysOfWeek: [1, 2, 3, 4, 5], startMinute: 9 * 60, endMinute: 17 * 60 },
        priority: 10,
        playlistId: seasonalPlaylist.id,
        targetDeviceId: null,
      },
    ],
    releases: [],
    manifests: {
      [mockManifest.deviceId]: deviceManifestSchema.parse(mockManifest),
    },
    screenshots: mockDevices
      .filter((device) => device.screenshotUrl)
      .map((device) => ({
        deviceId: device.id,
        publicUrl: device.screenshotUrl!,
        capturedAt: device.lastHeartbeatAt,
        bytes: 320_000,
      })),
    commands: [
      {
        id: "cmd-demo-001",
        deviceId: "device-demo-001",
        commandType: "take_screenshot",
        issuedAt: "2026-03-11T09:59:00.000Z",
        payload: {},
      },
      {
        id: "cmd-demo-002",
        deviceId: "device-demo-002",
        commandType: "sync_now",
        issuedAt: "2026-03-11T10:00:00.000Z",
        payload: {},
      },
    ],
    registrations: [],
  };
}

function state() {
  globalThis.__showroomMockState ??= buildState();
  return globalThis.__showroomMockState;
}

function syncPlaylistAssets() {
  for (const playlist of state().playlists) {
    ensurePlaylistItemsReferenceCurrentAssets(playlist, state().mediaAssets);
  }
}

function nextFolderOrder(kind: FolderKind, parentId: string | null) {
  return state().folders.filter(
    (folder) => folder.kind === kind && normalizeFolderParent(folder.parentId) === parentId,
  ).length;
}

export function getDashboardStats(orgId: string): DashboardStats {
  const devices = state().devices.filter((device) => device.orgId === orgId);
  return {
    ...mockDashboardStats,
    online: devices.filter((device) => device.status === "online").length,
    stale: devices.filter((device) => device.status === "stale").length,
    offline: devices.filter((device) => device.status === "offline").length,
    unclaimed: devices.filter((device) => device.status === "unclaimed").length,
    pendingCommands: state().commands.length,
  };
}

export function listDevices(orgId: string) {
  return state().devices.filter((device) => device.orgId === orgId);
}

export function getDevice(orgId: string, deviceId: string) {
  return listDevices(orgId).find((device) => device.id === deviceId) ?? null;
}

export function removeScreen(orgId: string, deviceId: string) {
  const device = getDevice(orgId, deviceId);
  if (!device) {
    throw new Error("Screen not found");
  }

  const mockState = state();
  mockState.devices = mockState.devices.filter((entry) => entry.id !== deviceId);
  mockState.screenshots = mockState.screenshots.filter((entry) => entry.deviceId !== deviceId);
  mockState.commands = mockState.commands.filter((entry) => entry.deviceId !== deviceId);
  mockState.registrations = mockState.registrations.filter(
    (entry) => entry.claimedDeviceId !== deviceId,
  );
  delete mockState.manifests[deviceId];

  return {
    removedDeviceId: device.id,
    removedDeviceName: device.name,
  };
}

export function listLibraryFolders(kind: FolderKind) {
  return state().folders
    .filter((folder) => folder.kind === kind)
    .sort((a, b) => {
      const parentDiff = (a.parentId ?? "").localeCompare(b.parentId ?? "");
      if (parentDiff !== 0) {
        return parentDiff;
      }

      const orderDiff = a.order - b.order;
      if (orderDiff !== 0) {
        return orderDiff;
      }

      return a.name.localeCompare(b.name);
    });
}

export function createLibraryFolder(input: {
  kind: FolderKind;
  name: string;
  parentId?: string | null;
}) {
  const kind = libraryFolderKindSchema.parse(input.kind);
  const parentId = normalizeFolderParent(input.parentId);
  if (parentId) {
    assertFolderKind(parentId, kind);
  }

  const folder: LibraryFolder = {
    id: crypto.randomUUID(),
    kind,
    name: input.name.trim(),
    parentId,
    order: nextFolderOrder(kind, parentId),
  };

  state().folders.push(folder);
  return folder;
}

export function updateLibraryFolder(input: {
  folderId: string;
  name?: string;
  parentId?: string | null;
}) {
  const folder = state().folders.find((entry) => entry.id === input.folderId);
  if (!folder) {
    throw new Error("Folder not found");
  }

  if (Object.prototype.hasOwnProperty.call(input, "name") && input.name) {
    folder.name = input.name.trim();
  }

  if (Object.prototype.hasOwnProperty.call(input, "parentId")) {
    const nextParentId = sanitizeFolderMove(folder.id, normalizeFolderParent(input.parentId));
    if (nextParentId) {
      assertFolderKind(nextParentId, folder.kind);
    }
    folder.parentId = nextParentId;
    folder.order = nextFolderOrder(folder.kind, folder.parentId);
  }

  return folder;
}

export function deleteLibraryFolder(folderId: string) {
  const index = state().folders.findIndex((entry) => entry.id === folderId);
  if (index === -1) {
    return;
  }

  const [folder] = state().folders.splice(index, 1);
  if (!folder) {
    return;
  }

  for (const child of state().folders) {
    if (child.parentId === folder.id) {
      child.parentId = folder.parentId;
      child.order = nextFolderOrder(child.kind, child.parentId);
    }
  }

  if (folder.kind === "media") {
    for (const asset of state().mediaAssets) {
      if (asset.folderId === folder.id) {
        asset.folderId = folder.parentId;
      }
    }
  } else {
    for (const playlist of state().playlists) {
      if (playlist.folderId === folder.id) {
        playlist.folderId = folder.parentId;
      }
    }
  }
}

export function listMediaAssets() {
  return state().mediaAssets;
}

export function listPlaylists() {
  return state().playlists;
}

export function setDefaultPlaylist(id: string) {
  let target: Playlist | null = null;
  state().playlists = state().playlists.map((playlist) => {
    const next = {
      ...playlist,
      isDefault: playlist.id === id,
    };

    if (next.isDefault) {
      target = next;
    }

    return next;
  });

  return target;
}

export function listReleases() {
  return state().releases;
}

export function listCommands(deviceId?: string) {
  return state()
    .commands
    .filter((command) => (deviceId ? command.deviceId === deviceId : true))
    .map((command) => {
      const delivery = commandStates()[command.id];
      return {
        ...command,
        status: delivery?.status ?? ("queued" as const),
        startedAt: delivery?.startedAt ?? null,
        completedAt: delivery?.completedAt ?? null,
        message: delivery?.message ?? null,
      };
    });
}

export function latestScreenshot(deviceId: string) {
  return state().screenshots
    .filter((record) => record.deviceId === deviceId)
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0] ?? null;
}

export function createUploadDraft(input: {
  fileName: string;
  mimeType: string;
  bytes: number;
}) {
  const assetId = crypto.randomUUID();
  return {
    assetId,
    uploadUrl: `/api/media/mock-upload/${assetId}`,
    storagePath: `media/org_demo/${assetId}-${input.fileName}`,
    expiresInSeconds: 900,
  };
}

export function finalizeMediaUpload(input: {
  title: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  storagePath: string;
  previewUrl: string;
  checksum: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  tags: string[];
  folderId?: string | null;
}) {
  if (input.folderId) {
    assertFolderKind(input.folderId, "media");
  }

  const asset: MediaAsset = {
    id: crypto.randomUUID(),
    folderId: normalizeFolderParent(input.folderId),
    title: input.title,
    type: input.mimeType.startsWith("video/") ? "video" : "image",
    sourceType: "upload",
    mimeType: input.mimeType,
    fileName: input.fileName,
    sizeBytes: input.bytes,
    width: input.width,
    height: input.height,
    durationSeconds: input.durationSeconds,
    storagePath: input.storagePath,
    previewUrl: input.previewUrl,
    checksum: input.checksum,
    tags: input.tags,
  };

  state().mediaAssets.unshift(asset);
  syncPlaylistAssets();
  return asset;
}

export function createYouTubeMediaAsset(input: {
  title: string;
  sourceUrl: string;
  previewUrl: string;
  fileName: string;
  durationSeconds?: number;
  tags: string[];
  folderId?: string | null;
}) {
  const checksum = `youtube:${crypto.createHash("sha256").update(input.sourceUrl).digest("hex")}`;
  const existing = state().mediaAssets.find((asset) => asset.checksum === checksum);
  if (input.folderId) {
    assertFolderKind(input.folderId, "media");
  }

  if (existing) {
    existing.folderId = normalizeFolderParent(input.folderId) ?? existing.folderId;
    existing.title = input.title;
    existing.sourceType = "youtube";
    existing.sourceUrl = input.sourceUrl;
    existing.fileName = input.fileName;
    existing.durationSeconds = input.durationSeconds;
    existing.storagePath = `youtube/org_demo/${input.fileName}`;
    existing.previewUrl = input.previewUrl;
    existing.tags = [...new Set([...existing.tags, ...input.tags])];
    return existing;
  }

  const asset: MediaAsset = {
    id: crypto.randomUUID(),
    folderId: normalizeFolderParent(input.folderId),
    title: input.title,
    type: "video",
    sourceType: "youtube",
    sourceUrl: input.sourceUrl,
    mimeType: "video/mp4",
    fileName: input.fileName,
    sizeBytes: 0,
    durationSeconds: input.durationSeconds,
    storagePath: `youtube/org_demo/${input.fileName}`,
    previewUrl: input.previewUrl,
    checksum,
    tags: input.tags,
  };

  state().mediaAssets.unshift(asset);
  syncPlaylistAssets();
  return asset;
}

export function savePlaylist(input: {
  playlistId?: string;
  name: string;
  itemIds: Array<{
    mediaAssetId: string;
    dwellSeconds?: number;
  }>;
  makeDefault?: boolean;
  folderId?: string | null;
}) {
  if (input.folderId) {
    assertFolderKind(input.folderId, "playlist");
  }

  const items = input.itemIds.map((item, index) => {
    const asset = state().mediaAssets.find((entry) => entry.id === item.mediaAssetId);
    if (!asset) {
      throw new Error("Playlist contains an invalid media asset");
    }

    return {
      id: crypto.randomUUID(),
      order: index,
      dwellSeconds: item.dwellSeconds ?? null,
      asset,
    };
  });

  const existingIndex = input.playlistId
    ? state().playlists.findIndex((playlist) => playlist.id === input.playlistId)
    : -1;
  const existing = existingIndex >= 0 ? state().playlists[existingIndex] : null;
  const shouldBeDefault =
    input.makeDefault ?? existing?.isDefault ?? state().playlists.length === 0;

  const playlist: Playlist = {
    id: existing?.id ?? crypto.randomUUID(),
    folderId:
      normalizeFolderParent(input.folderId) ??
      existing?.folderId ??
      null,
    name: input.name,
    isDefault: shouldBeDefault,
    items,
  };

  if (existingIndex >= 0) {
    state().playlists[existingIndex] = playlist;
  } else {
    state().playlists.unshift(playlist);
  }

  if (shouldBeDefault) {
    state().playlists = state().playlists.map((entry) => ({
      ...entry,
      isDefault: entry.id === playlist.id,
    }));
  } else if (!state().playlists.some((entry) => entry.isDefault)) {
    state().playlists = state().playlists.map((entry, index) => ({
      ...entry,
      isDefault: index === 0,
    }));
  }

  syncPlaylistAssets();
  return state().playlists.find((entry) => entry.id === playlist.id) ?? playlist;
}

export function updatePlaylist(input: {
  playlistId: string;
  name?: string;
  folderId?: string | null;
}) {
  const playlist = state().playlists.find((entry) => entry.id === input.playlistId);
  if (!playlist) {
    throw new Error("Playlist not found");
  }

  if (Object.prototype.hasOwnProperty.call(input, "name") && input.name) {
    playlist.name = input.name.trim();
  }

  if (Object.prototype.hasOwnProperty.call(input, "folderId")) {
    if (input.folderId) {
      assertFolderKind(input.folderId, "playlist");
    }
    playlist.folderId = normalizeFolderParent(input.folderId);
  }

  return playlist;
}

export function importYouTubePlaylist(input: {
  makeDefault?: boolean;
  name: string;
  tags: string[];
  videos: Array<{
    durationSeconds?: number;
    fileName: string;
    previewUrl: string;
    sourceUrl: string;
    title: string;
  }>;
  folderId?: string | null;
  assetFolderId?: string | null;
}) {
  const assets = input.videos.map((video) =>
    createYouTubeMediaAsset({
      ...video,
      tags: input.tags,
      folderId: input.assetFolderId,
    }),
  );
  const uniqueAssets = [...new Map(assets.map((asset) => [asset.id, asset])).values()];

  return {
    assets: uniqueAssets,
    playlist: savePlaylist({
      itemIds: assets.map((asset) => ({
        mediaAssetId: asset.id,
      })),
      makeDefault: input.makeDefault,
      name: input.name,
      folderId: input.folderId,
    }),
  };
}

export function createRelease(input: {
  name: string;
  version: string;
  notes?: string;
  playerUrl?: string;
  playerSha256?: string;
  playerSignature?: string;
  agentUrl?: string;
  agentSha256?: string;
  agentSignature?: string;
  systemUrl?: string;
  systemSha256?: string;
  systemSignature?: string;
  signingKeyId?: string;
}) {
  if (!releaseVersionPattern.test(input.version)) {
    throw new Error(
      "Use only letters, numbers, dots, dashes and underscores in the version. Screens reject anything else.",
    );
  }
  const now = new Date().toISOString();
  const release: ReleaseSummary = {
    id: crypto.randomUUID(),
    name: input.name,
    version: input.version,
    notes: input.notes ?? null,
    playerUrl: input.playerUrl ?? null,
    playerSha256: input.playerSha256 ?? null,
    agentUrl: input.agentUrl ?? null,
    agentSha256: input.agentSha256 ?? null,
    systemUrl: input.systemUrl ?? null,
    systemSha256: input.systemSha256 ?? null,
    playerSignature: input.playerSignature ?? null,
    agentSignature: input.agentSignature ?? null,
    systemSignature: input.systemSignature ?? null,
    signingKeyId: input.signingKeyId ?? null,
    rolloutStatus: "draft",
    createdAt: now,
    updatedAt: now,
    rolloutSummary: {
      total: 0,
      queued: 0,
      inProgress: 0,
      succeeded: 0,
      failed: 0,
    },
    latestRollouts: [],
  };

  state().releases.unshift(release);
  return release;
}

export function deployRelease(input: {
  releaseId: string;
  deviceIds?: string[];
}) {
  const release = state().releases.find((entry) => entry.id === input.releaseId);
  if (!release) {
    throw new Error("Release not found");
  }

  const active = new Set(
    release.latestRollouts
      .filter((entry) => entry.status === "queued" || entry.status === "in_progress" || entry.status === "waiting")
      .map((entry) => entry.deviceId),
  );
  const plan = planReleaseRollout({
    release,
    releaseOrganizationId: "org-demo",
    devices: state().devices.map((device) => ({
      ...device,
      organizationId: device.orgId,
      lastHeartbeatAt: Date.parse(device.lastHeartbeatAt) || 0,
    })),
    requestedIds: input.deviceIds,
    activeDeviceIds: active,
  });
  if (!plan.ok) {
    throw new Error(plan.error);
  }
  // The mock has no cron to advance rings, so every screen is queued at once.
  const targetDevices = plan.targets.map(({ device, ring, includesSystem }) => ({
    id: crypto.randomUUID(),
    deviceId: device.id,
    deviceName: device.name,
    status: "queued" as const,
    queuedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    message: null,
    ring,
    includesSystem,
  }));

  release.latestRollouts = [...targetDevices, ...release.latestRollouts].slice(0, 8);
  release.rolloutSummary = {
    total: release.rolloutSummary.total + targetDevices.length,
    queued: release.rolloutSummary.queued + targetDevices.length,
    inProgress: release.rolloutSummary.inProgress,
    succeeded: release.rolloutSummary.succeeded,
    failed: release.rolloutSummary.failed,
  };
  release.updatedAt = new Date().toISOString();

  for (const device of targetDevices) {
    state().commands.unshift({
      id: crypto.randomUUID(),
      deviceId: device.deviceId,
      commandType: "update_release",
      issuedAt: device.queuedAt,
      // Same per-screen payload as the real backend: the system bundle only
      // goes to screens that advertise system_bundles.
      payload: JSON.parse(JSON.stringify(
        releaseCommandPayloadForDevice(
          release,
          state().devices.find((entry) => entry.id === device.deviceId)!,
        ) ?? {},
      )),
    });
  }
  release.rolloutStatus = "active";

  return {
    queuedDeviceCount: targetDevices.length,
    releaseId: release.id,
  };
}

export function claimDevice(input: {
  orgId: string;
  claimCode: string;
  name: string;
  siteName: string;
}) {
  const mockState = state();
  const now = Date.now();
  mockState.claimFailures ??= {};
  const recentFailures = (mockState.claimFailures[input.orgId] ?? []).filter(
    (failedAt) => failedAt > now - claimLockoutWindowMs,
  );
  mockState.claimFailures[input.orgId] = recentFailures;
  if (recentFailures.length >= maxClaimFailures) {
    return { error: "too_many_attempts" as const };
  }

  const registration = mockState.registrations.find(
    (entry) => entry.claimCode === input.claimCode,
  );

  // Like the real backend, a code that was already used counts as wrong.
  if (!registration || registration.claimedDeviceId) {
    recentFailures.push(now);
    return { error: "invalid_code" as const };
  }

  const deviceId = crypto.randomUUID();
  const credential = `device_${crypto.randomBytes(12).toString("hex")}`;
  registration.claimedDeviceId = deviceId;
  registration.credential = credential;

  const fallbackPlaylist = state().playlists.find((playlist) => playlist.isDefault) ?? mockPlaylist;
  const device: DeviceRecord = {
    id: deviceId,
    name: input.name,
    siteName: input.siteName,
    status: "online",
    lastHeartbeatAt: new Date().toISOString(),
    screenshotUrl: null,
    currentPlaylistName: fallbackPlaylist.name,
    manifestVersion: mockManifest.manifestVersion,
    orgId: input.orgId,
    claimCode: input.claimCode,
    credential,
    defaultPlaylistId: fallbackPlaylist.id,
    timezone: "America/New_York",
    orientation: 0,
    volume: 0,
    fleetManagementState: "legacy",
    applianceGeneration: null,
    agentProtocolVersion: null,
    capabilities: [],
    applianceActivatedAt: null,
  };

  const existingIndex = state().devices.findIndex((entry) => entry.id === deviceId);
  if (existingIndex >= 0) {
    state().devices[existingIndex] = device;
  } else {
    state().devices.unshift(device);
  }

  state().manifests[deviceId] = {
    ...mockManifest,
    deviceId,
    generatedAt: new Date().toISOString(),
    manifestVersion: `manifest-${Date.now()}`,
  };

  return {
    deviceId,
    credential,
  };
}

export function issueCommand(input: {
  deviceId: string;
  commandType: string;
  payload?: Record<string, unknown>;
}) {
  const device = state().devices.find((entry) => entry.id === input.deviceId);
  if (!device) {
    throw new Error("Device not found");
  }
  const commandType = commandTypeSchema.parse(input.commandType);
  if (requiresFleetManagedDevice(commandType) && !isFleetManagedDevice(device)) {
    throw new Error("Flash this device with the fleet appliance before using this command");
  }
  if (commandType === "update_release" && input.payload?.systemUrl && !supportsSystemBundles(device)) {
    throw new Error("Only screens running Showroom OS can install system updates");
  }
  const command = deviceCommandSchema.parse({
    id: crypto.randomUUID(),
    deviceId: input.deviceId,
    commandType,
    issuedAt: new Date().toISOString(),
    payload: input.payload ?? {},
  });

  state().commands.unshift(command);
  return command;
}

export function compileManifests(orgId: string) {
  const devices = listDevices(orgId);
  const version = `manifest-${Date.now()}`;
  for (const device of devices) {
    state().manifests[device.id] = {
      ...mockManifest,
      deviceId: device.id,
      generatedAt: new Date().toISOString(),
      manifestVersion: version,
    };
    device.desiredManifestVersion = version;
    device.contentState = device.manifestVersion === version ? "current" : "updating";
  }

  return {
    affectedDeviceCount: devices.length,
    manifestVersion: version,
  };
}

export function registerTemporaryDevice() {
  const claimCode = Math.random().toString().slice(2, 8);
  const registration = temporaryRegistrationResponseSchema.parse({
    deviceSessionId: crypto.randomUUID(),
    claimCode,
    claimToken: crypto.randomBytes(24).toString("hex"),
    pollingIntervalSeconds: 15,
  });

  state().registrations.unshift({
    ...registration,
    createdAt: new Date().toISOString(),
  });

  return registration;
}

export function getClaimStatus(input: { deviceSessionId: string; claimToken: string }) {
  const registration = state().registrations.find(
    (entry) =>
      entry.deviceSessionId === input.deviceSessionId &&
      entry.claimToken === input.claimToken,
  );
  if (!registration) {
    throw new Error("Unknown registration");
  }

  return claimStatusResponseSchema.parse({
    claimed: Boolean(registration.claimedDeviceId && registration.credential),
    deviceId: registration.claimedDeviceId,
    credential: registration.credential,
    pollAgainSeconds: 15,
  });
}

export function refreshDeviceAuth(credential: string) {
  const device = state().devices.find((entry) => entry.credential === credential);
  if (!device) {
    return null;
  }

  const nextCredential = `device_${crypto.randomBytes(12).toString("hex")}`;
  device.credential = nextCredential;
  return {
    deviceId: device.id,
    credential: nextCredential,
    expiresInSeconds: 86_400,
  };
}

export function authenticateDevice(credential: string | null) {
  if (!credential) {
    return null;
  }

  return state().devices.find((entry) => entry.credential === credential) ?? null;
}

export function getManifestForDevice(deviceId: string) {
  return state().manifests[deviceId] ?? null;
}

export function hasQueuedCommands(deviceId: string) {
  const states = commandStates();
  return state().commands.some((command) => command.deviceId === deviceId && !states[command.id]);
}

// Hands queued commands to the screen once, like the Convex claim does.
export function getCommandsForDevice(deviceId: string) {
  const states = commandStates();
  const startedAt = new Date().toISOString();
  const queued = state().commands.filter((command) => command.deviceId === deviceId && !states[command.id]);
  for (const command of queued) {
    states[command.id] = { status: "in_progress", startedAt, completedAt: null, message: null };
  }
  return queued;
}

export function recordHeartbeat(deviceId: string, payload: Record<string, unknown>) {
  const device = state().devices.find((entry) => entry.id === deviceId);
  if (!device) {
    return null;
  }

  const parsedPayload = heartbeatPayloadSchema.parse(payload);
  const heartbeat = {
    ...parsedPayload,
    deviceId,
    receivedAt: new Date().toISOString(),
  };

  device.status = "online";
  device.lastHeartbeatAt = new Date().toISOString();
  if (parsedPayload.manifestVersion) {
    device.manifestVersion = parsedPayload.manifestVersion;
    if (device.desiredManifestVersion) {
      device.contentState = device.desiredManifestVersion === device.manifestVersion ? "current" : "updating";
    }
  }
  if (parsedPayload.sync) {
    device.lastSyncAt = parsedPayload.sync.lastSyncAt ?? device.lastSyncAt ?? null;
    device.lastError = parsedPayload.sync.lastError || null;
    device.savedItems = parsedPayload.sync.savedItems ?? null;
    device.totalItems = parsedPayload.sync.totalItems ?? null;
    device.supportsRepeatingSchedules = parsedPayload.sync.repeatingSchedules === true;
  }
  if (parsedPayload.appliance && isFleetManagedDevice({
    applianceGeneration: parsedPayload.appliance.generation,
    agentProtocolVersion: parsedPayload.appliance.protocolVersion,
    capabilities: parsedPayload.appliance.capabilities,
  })) {
    device.fleetManagementState = "managed";
    device.applianceGeneration = parsedPayload.appliance.generation;
    device.agentProtocolVersion = parsedPayload.appliance.protocolVersion;
    device.capabilities = [...parsedPayload.appliance.capabilities];
    device.applianceActivatedAt ??= new Date().toISOString();
  }
  return heartbeat;
}

export function recordScreenshot(input: {
  deviceId: string;
  capturedAt: string;
  publicUrl: string;
  bytes: number;
}) {
  state().screenshots.unshift(input);
  const device = state().devices.find((entry) => entry.id === input.deviceId);
  if (device) {
    device.screenshotUrl = input.publicUrl;
  }
  return input;
}

export function recordCommandResult(result: DeviceCommandResult) {
  const parsed = deviceCommandResultSchema.parse(result);
  const states = commandStates();
  const previous = states[parsed.commandId];
  if (parsed.status !== "queued") {
    const finished = parsed.status === "succeeded" || parsed.status === "failed";
    states[parsed.commandId] = {
      status: parsed.status,
      startedAt: previous?.startedAt ?? new Date().toISOString(),
      completedAt: finished ? parsed.completedAt ?? new Date().toISOString() : null,
      message: parsed.message ?? null,
    };
  }
  return parsed;
}

export function deletePlaylist(id: string) {
  const idx = state().playlists.findIndex((playlist) => playlist.id === id);
  if (idx === -1) {
    return;
  }

  const [removed] = state().playlists.splice(idx, 1);
  if (!removed?.isDefault || state().playlists.length === 0) {
    return;
  }

  state().playlists = state().playlists.map((playlist, index) => ({
    ...playlist,
    isDefault: index === 0,
  }));
}

function serializeSchedule(schedule: MockSchedule) {
  const playlist = state().playlists.find((entry) => entry.id === schedule.playlistId);
  const device = schedule.targetDeviceId
    ? state().devices.find((entry) => entry.id === schedule.targetDeviceId)
    : null;
  return {
    ...schedule,
    playlistId: playlist?.id ?? null,
    playlistName: playlist?.name ?? null,
    targetLabel: device?.name ?? "All screens",
  };
}

export function listSchedules() {
  return (state().schedules ?? []).map(serializeSchedule);
}

export function saveSchedule(input: {
  scheduleId?: string;
  name: string;
  startsAt?: string;
  endsAt?: string;
  recurrence?: ScheduleRecurrence;
  priority: number;
  playlistId: string;
  deviceId?: string;
}) {
  if (!state().playlists.some((playlist) => playlist.id === input.playlistId)) {
    throw new Error("Playlist not found");
  }
  if (!input.recurrence && !(Date.parse(input.endsAt ?? "") > Date.parse(input.startsAt ?? ""))) {
    throw new Error("The schedule's end must be later than its start");
  }
  const schedules = (state().schedules ??= []);
  const schedule: MockSchedule = {
    id: input.scheduleId ?? `schedule-${crypto.randomUUID()}`,
    label: input.name,
    startsAt: input.recurrence ? recurringWindowInstant : input.startsAt!,
    endsAt: input.recurrence ? recurringWindowInstant : input.endsAt!,
    recurrence: input.recurrence ?? null,
    priority: input.priority,
    playlistId: input.playlistId,
    targetDeviceId: input.deviceId ?? null,
  };
  const index = schedules.findIndex((entry) => entry.id === schedule.id);
  if (index >= 0) schedules[index] = schedule;
  else schedules.unshift(schedule);
  return serializeSchedule(schedule);
}

export function deleteSchedule(id: string) {
  state().schedules = (state().schedules ?? []).filter((schedule) => schedule.id !== id);
}

export function deleteMediaAsset(id: string) {
  const idx = state().mediaAssets.findIndex((asset) => asset.id === id);
  if (idx === -1) {
    return;
  }

  state().mediaAssets.splice(idx, 1);
  for (const playlist of state().playlists) {
    playlist.items = playlist.items.filter((item) => item.asset.id !== id);
  }
}

export function updateMediaAsset(input: {
  assetId: string;
  title?: string;
  tags?: string[];
  folderId?: string | null;
}) {
  const asset = state().mediaAssets.find((entry) => entry.id === input.assetId);
  if (!asset) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(input, "title") && input.title) {
    asset.title = input.title.trim();
  }

  if (Object.prototype.hasOwnProperty.call(input, "tags") && input.tags) {
    asset.tags = input.tags;
  }

  if (Object.prototype.hasOwnProperty.call(input, "folderId")) {
    if (input.folderId) {
      assertFolderKind(input.folderId, "media");
    }
    asset.folderId = normalizeFolderParent(input.folderId);
  }

  syncPlaylistAssets();
  return asset;
}
