/**
 * Words for the on-screen states. The native player (apps/pi-player,
 * screens.rs) has the same table; change both together.
 */

export const CANNOT_REACH = "Can't reach Digital Curator. Check this screen's internet connection.";
export const NO_WIFI = "Wi-Fi isn't available on this screen. Connect an Ethernet cable instead.";

const CONNECTIVITY_MARKERS = [
  "dial tcp",
  "no such host",
  "name resolution",
  "connection refused",
  "connection reset",
  "network is unreachable",
  "no route to host",
  "timeout",
  "deadline exceeded",
  "tls",
  "x509",
  "certificate",
  "unexpected eof",
];

/** Whether an agent error only says the service could not be reached. */
export function isConnectivityError(raw: string) {
  const lower = raw.toLowerCase();
  return CONNECTIVITY_MARKERS.some((marker) => lower.includes(marker)) || lower.endsWith(": eof");
}

/**
 * Turns the agent's last error into a line a customer can act on. Returns null
 * when the screen already says what to do. Unknown errors pass through, for a
 * photo to support.
 */
export function friendlyError(raw: string | null | undefined) {
  const text = (raw ?? "").trim();
  const lower = text.toLowerCase();
  if (!text) return null;
  if (lower.includes("not on the screen yet")) {
    return "Some content couldn't be downloaded. This screen will keep trying.";
  }
  if (lower.includes("no playable media assets")) {
    // "after 0 hydration failures" is a screen with nothing assigned yet.
    return lower.includes("after 0 ")
      ? null
      : "Some content couldn't be downloaded. This screen will keep trying.";
  }
  if (lower.includes("youtube")) return text;
  if (lower.includes("media cache")) {
    return "This screen is out of storage for new content. Use a smaller playlist.";
  }
  if (lower.includes("credential")) return null;
  if (isConnectivityError(text)) return CANNOT_REACH;
  return text;
}

/**
 * Whether a video moved since `last`: forward, or back to an earlier point (a
 * single video loops in place, so its clock starts over).
 */
export function videoProgressed(last: number, now: number) {
  return now > last + 0.05 || now + 0.5 < last;
}

/**
 * What the screen is connected through, for "Online via …": the Wi-Fi name,
 * or the cable on a wired screen (which has no name to show).
 */
export function networkName(wifi: { connected: boolean; ssid?: string; wired?: boolean } | null | undefined) {
  if (!wifi?.connected) return null;
  return wifi.ssid || (wifi.wired ? "a network cable" : null);
}

/** How long the agent must report "offline" before the screen says so. */
export const OFFLINE_BADGE_AFTER_MS = 30_000;

/**
 * The agent counts as online for two minutes after its last contact and has
 * none yet right after a boot, so "Offline" shows only once it has lasted.
 */
export function showOfflineBadge(offlineSince: number | null, now: number) {
  return offlineSince !== null && now - offlineSince >= OFFLINE_BADGE_AFTER_MS;
}
