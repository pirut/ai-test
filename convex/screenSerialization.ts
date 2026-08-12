import { isFleetManagedDevice } from "@showroom/contracts";

import type { Doc } from "./_generated/dataModel";
import * as showroom from "./showroom";

export function serializeScreenDetail(
  device: Doc<"devices">,
  defaultPlaylist: Doc<"playlists"> | null,
) {
  return {
    id: device._id,
    name: device.name ?? "Unnamed screen",
    siteName: device.siteName ?? "Unassigned",
    status: showroom.deriveDeviceStatus(device),
    lastHeartbeatAt: new Date(device.lastHeartbeatAt ?? device._creationTime).toISOString(),
    screenshotUrl: device.screenshotUrl ?? null,
    currentPlaylistName: device.currentPlaylistName ?? defaultPlaylist?.name ?? null,
    manifestVersion: device.manifestVersion ?? null,
    desiredAgentVersion: device.desiredAgentVersion ?? null,
    desiredPlayerVersion: device.desiredPlayerVersion ?? null,
    agentVersion: device.agentVersion ?? null,
    appVersion: device.appVersion ?? null,
    releaseChannel: device.releaseChannel ?? null,
    hardwareProfile: device.hardwareProfile ?? null,
    currentAssetId: device.currentAssetId ?? null,
    fleetManagementState: isFleetManagedDevice(device) ? "managed" as const : "legacy" as const,
    applianceGeneration: device.applianceGeneration ?? null,
    agentProtocolVersion: device.agentProtocolVersion ?? null,
    capabilities: device.capabilities ?? [],
    applianceActivatedAt: device.applianceActivatedAt
      ? new Date(device.applianceActivatedAt).toISOString()
      : null,
    health: device.health ?? null,
    timezone: device.timezone,
    orientation: device.orientation,
    volume: device.volume,
    defaultPlaylistId: device.defaultPlaylistId ?? defaultPlaylist?._id ?? null,
  };
}
