import crypto from "node:crypto";

import {
  type DashboardStats,
  type DeviceCommand,
  type DeviceCommandResult,
  type DeviceManifest,
  type DeviceSummary,
  type MediaAsset,
  type Playlist,
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
    checksum: `youtube:${crypto.createHash("sha256").update(input.sourceUrl).digest("hex")}`,
    tags: input.tags,
  };

  state().mediaAssets.unshift(asset);
  return asset;
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
