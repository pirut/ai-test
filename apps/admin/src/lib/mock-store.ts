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
  claimStatusResponseSchema,
  commandTypeSchema,
  deviceCommandResultSchema,
  deviceCommandSchema,
  deviceManifestSchema,
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
  archivedAt?: string | null;
  timezone: string;
  orientation: 0 | 90 | 180 | 270;
  volume: number;
};

type MockState = {
  devices: DeviceRecord[];
  folders: LibraryFolder[];
  mediaAssets: MediaAsset[];
  playlists: Playlist[];
  releases: ReleaseSummary[];
  manifests: Record<string, DeviceManifest>;
  screenshots: ScreenshotRecord[];
  commands: DeviceCommand[];
  registrations: RegistrationRecord[];
};

type FolderKind = LibraryFolder["kind"];
export type SeededHeartbeatLoadDevice = {
  deviceId: string;
  credential: string;
};

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
      orgId: "org_demo",
      defaultPlaylistId: basePlaylist.id,
      archivedAt: null,
      timezone: "America/New_York",
      orientation: 0,
      volume: 0,
      credential: `demo-${device.id}`,
    })),
    folders,
    mediaAssets,
    playlists: [basePlaylist, seasonalPlaylist],
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

export function resetMockState() {
  globalThis.__showroomMockState = buildState();
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

export function seedHeartbeatLoadDevices(input: {
  count: number;
  orgId?: string;
  siteName?: string;
}) {
  const orgId = input.orgId ?? "org_load_test";
  const siteName = input.siteName ?? "Load test site";
  const createdAt = new Date().toISOString();
  const defaultPlaylistId =
    state().playlists.find((playlist) => playlist.isDefault)?.id ??
    state().playlists[0]?.id ??
    null;
  const currentPlaylistName =
    state().playlists.find((playlist) => playlist.id === defaultPlaylistId)?.name ?? null;
  const devices: SeededHeartbeatLoadDevice[] = [];

  for (let index = 0; index < input.count; index += 1) {
    const suffix = `${index + 1}`.padStart(4, "0");
    const deviceId = `device-load-${suffix}`;
    const credential = `device_${crypto.randomBytes(12).toString("hex")}`;

    state().devices.push({
      id: deviceId,
      name: `Load device ${suffix}`,
      siteName,
      status: "offline",
      lastHeartbeatAt: createdAt,
      screenshotUrl: null,
      currentPlaylistName,
      manifestVersion: null,
      orgId,
      claimCode: undefined,
      credential,
      defaultPlaylistId,
      archivedAt: null,
      timezone: "America/New_York",
      orientation: 0,
      volume: 0,
    });

    devices.push({
      deviceId,
      credential,
    });
  }

  return {
    orgId,
    devices,
  };
}

export function getDevice(orgId: string, deviceId: string) {
  return listDevices(orgId).find((device) => device.id === deviceId) ?? null;
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
    .map((command) => ({
      ...command,
      status: "queued" as const,
      completedAt: null,
      message: null,
    }));
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
  agentUrl?: string;
  agentSha256?: string;
  systemUrl?: string;
  systemSha256?: string;
}) {
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

  const targetDevices = (input.deviceIds?.length
    ? state().devices.filter((device) => input.deviceIds!.includes(device.id))
    : state().devices
  ).map((device) => ({
    id: crypto.randomUUID(),
    deviceId: device.id,
    deviceName: device.name,
    status: "queued" as const,
    queuedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    message: null,
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
      payload: {
        version: release.version,
        playerUrl: release.playerUrl ?? undefined,
        playerSha256: release.playerSha256 ?? undefined,
        agentUrl: release.agentUrl ?? undefined,
        agentSha256: release.agentSha256 ?? undefined,
        systemUrl: release.systemUrl ?? undefined,
        systemSha256: release.systemSha256 ?? undefined,
      },
    });
  }

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
  const registration = state().registrations.find(
    (entry) => entry.claimCode === input.claimCode,
  );

  if (!registration) {
    return null;
  }

  const deviceId = registration.claimedDeviceId ?? crypto.randomUUID();
  const credential = registration.credential ?? `device_${crypto.randomBytes(12).toString("hex")}`;
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
  const command = deviceCommandSchema.parse({
    id: crypto.randomUUID(),
    deviceId: input.deviceId,
    commandType: commandTypeSchema.parse(input.commandType),
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
    device.manifestVersion = version;
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

  return claimStatusResponseSchema.parse({
    claimed: Boolean(registration?.claimedDeviceId && registration?.credential),
    deviceId: registration?.claimedDeviceId,
    credential: registration?.credential,
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

export function getCommandsForDevice(deviceId: string) {
  return state().commands.filter((command) => command.deviceId === deviceId);
}

export function recordHeartbeat(deviceId: string, payload: Record<string, unknown>) {
  const device = state().devices.find((entry) => entry.id === deviceId);
  if (!device) {
    return null;
  }

  const heartbeat = {
    ...payload,
    deviceId,
    receivedAt: new Date().toISOString(),
  };

  device.status = "online";
  device.lastHeartbeatAt = new Date().toISOString();
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
  return deviceCommandResultSchema.parse(result);
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

export function deleteSchedule(id: string) {
  void id;
  // No schedules in mock state.
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
