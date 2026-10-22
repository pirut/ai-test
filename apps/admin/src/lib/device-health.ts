import type { DeviceSummary } from "@showroom/contracts";

export type DeviceStatus = DeviceSummary["status"];
export type IssueSeverity = "critical" | "warning" | "info";
export type DeviceIssue = { label: string; severity: IssueSeverity };

export const statusLabels: Record<DeviceStatus, string> = {
  online: "Online",
  stale: "Delayed",
  offline: "Offline",
  unclaimed: "Unclaimed",
};

export const statusDescriptions: Record<DeviceStatus, string> = {
  online: "Checking in normally",
  stale: "Check-ins are late",
  offline: "Not reporting",
  unclaimed: "Waiting to be paired",
};

// Lower ranks sort first so the screens that need help float to the top.
const statusRank: Record<DeviceStatus, number> = { offline: 0, stale: 1, unclaimed: 2, online: 3 };

const highTemperatureC = 80;
const weakSignalPercent = 25;

/**
 * Everything the operator might need to act on for one screen, most severe
 * first. Health details are only trusted while the screen is reporting, so an
 * offline screen just reports "Offline" instead of stale sensor readings.
 */
export function deviceIssues(device: DeviceSummary): DeviceIssue[] {
  const issues: DeviceIssue[] = [];
  if (device.status === "offline") issues.push({ label: "Offline", severity: "critical" });
  if (device.status === "stale") issues.push({ label: "Check-in delayed", severity: "warning" });

  if (device.status === "online" || device.status === "stale") {
    const health = device.health;
    if (health && !health.playerHealthy) issues.push({ label: "Player stopped", severity: "critical" });
    if (health && !health.hdmiConnected) issues.push({ label: "HDMI disconnected", severity: "critical" });
    if (health?.signalPercent != null && health.signalPercent < weakSignalPercent) {
      issues.push({ label: `Weak Wi-Fi (${health.signalPercent}%)`, severity: "warning" });
    }
    if (health?.cpuTemperatureC != null && health.cpuTemperatureC >= highTemperatureC) {
      issues.push({ label: `Running hot (${health.cpuTemperatureC.toFixed(0)}°C)`, severity: "warning" });
    }
  }

  if (device.status === "online" || device.status === "stale") {
    if (device.lastError) issues.push({ label: "Screen reported an error", severity: "warning" });
    else if (device.contentState === "updating") issues.push({ label: "Updating content", severity: "info" });
  }

  if (device.status !== "unclaimed" && !device.currentPlaylistName) {
    issues.push({ label: "No playlist", severity: "warning" });
  }
  if (device.fleetManagementState === "legacy") {
    issues.push({ label: "Needs appliance update", severity: "info" });
  }
  return issues;
}

/** Issues that interrupt or risk playback. Informational notes don't count. */
export function needsAttention(device: DeviceSummary) {
  return deviceIssues(device).some((issue) => issue.severity !== "info");
}

export function compareByUrgency(a: DeviceSummary, b: DeviceSummary) {
  const byStatus = statusRank[a.status] - statusRank[b.status];
  if (byStatus !== 0) return byStatus;
  const byIssues = deviceIssues(b).length - deviceIssues(a).length;
  if (byIssues !== 0) return byIssues;
  return a.name.localeCompare(b.name);
}

export function countByStatus(devices: DeviceSummary[]) {
  const counts: Record<DeviceStatus, number> = { online: 0, stale: 0, offline: 0, unclaimed: 0 };
  for (const device of devices) counts[device.status] += 1;
  return counts;
}

export const contentStateLabels = {
  current: "Up to date",
  updating: "Updating",
  unknown: "Unknown",
} as const;
