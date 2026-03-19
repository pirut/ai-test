import crypto from "node:crypto";

import {
  type DashboardStats,
  type DeviceCommand,
  type DeviceCommandResult,
  type DeviceManifest,
  type DeviceSummary,
  type MediaAsset,
  type Playlist,
  type ReleaseSummary,
  claimStatusResponseSchema,
  commandTypeSchema,
  deviceCommandResultSchema,
  deviceCommandSchema,
  deviceManifestSchema,
  mockDashboardStats,
  mockDevices,
  mockManifest,
  mockMediaAssets,
  mockPlaylist,
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

type MockState = {
  devices: DeviceRecord[];
  mediaAssets: MediaAsset[];
  playlists: Playlist[];
  releases: ReleaseSummary[];
  manifests: Record<string, DeviceManifest>;
  screenshots: ScreenshotRecord[];
  commands: DeviceCommand[];
  registrations: RegistrationRecord[];
};

declare global {
  // eslint-disable-next-line no-var
  var __showroomMockState: MockState | undefined;
}

function buildState(): MockState {
  return {
    devices: mockDevices.map((device) => ({
      ...device,
      orgId: "org_demo",
      defaultPlaylistId: mockPlaylist.id,
      timezone: "America/New_York",
      orientation: 0,
      volume: 0,
      credential: `demo-${device.id}`,
    })),
    mediaAssets: mockMediaAssets,
    playlists: [mockPlaylist],
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
  const draft = {
    assetId,
    uploadUrl: `/api/media/mock-upload/${assetId}`,
    storagePath: `media/org_demo/${assetId}-${input.fileName}`,
    expiresInSeconds: 900,
  };

  return draft;
}

export function createYouTubeMediaAsset(input: {
  title: string;
  sourceUrl: string;
  previewUrl: string;
  fileName: string;
  durationSeconds?: number;
  tags: string[];
}) {
  const checksum = `youtube:${crypto.createHash("sha256").update(input.sourceUrl).digest("hex")}`;
  const existing = state().mediaAssets.find((asset) => asset.checksum === checksum);
  if (existing) {
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
}) {
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

  return state().playlists.find((entry) => entry.id === playlist.id) ?? playlist;
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
}) {
  const assets = input.videos.map((video) =>
    createYouTubeMediaAsset({
      ...video,
      tags: input.tags,
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

  const device: DeviceRecord = {
    id: deviceId,
    name: input.name,
    siteName: input.siteName,
    status: "online",
    lastHeartbeatAt: new Date().toISOString(),
    screenshotUrl: null,
    currentPlaylistName: mockPlaylist.name,
    manifestVersion: mockManifest.manifestVersion,
    orgId: input.orgId,
    claimCode: input.claimCode,
    credential,
    defaultPlaylistId: mockPlaylist.id,
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

export function deleteSchedule(_id: string) {
  // No schedules in mock state — nothing to remove
}

export function deleteMediaAsset(id: string) {
  const idx = state().mediaAssets.findIndex((a) => a.id === id);
  if (idx !== -1) state().mediaAssets.splice(idx, 1);
}

export function updateMediaAsset(id: string, title: string, tags: string[]) {
  const asset = state().mediaAssets.find((a) => a.id === id);
  if (!asset) return null;
  asset.title = title;
  asset.tags = tags;
  return asset;
}
