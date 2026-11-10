import type { DeviceSummary, Playlist } from "@showroom/contracts";

/**
 * Where a workspace is on the way from "just signed up" to "a video is
 * playing on a TV". Everything is derived from what the workspace already
 * holds, so the guide resumes on any browser and never needs its own record.
 */
export type SetupStepId = "prepare" | "pair" | "content" | "playing";

export const setupStepOrder: SetupStepId[] = ["prepare", "pair", "content", "playing"];

export type ScreenSetupState =
  // No screen is paired yet.
  | "none"
  // Paired, but the screen has not checked in (or stopped checking in).
  | "offline"
  // Checking in with nothing to play.
  | "waiting_for_content"
  // Fetching the content last published to it.
  | "downloading"
  // Reporting, but something stops the content showing.
  | "problem"
  | "playing";

export type SetupDevice = Pick<
  DeviceSummary,
  | "id"
  | "name"
  | "status"
  | "screenshotUrl"
  | "currentPlaylistName"
  | "manifestVersion"
  | "contentState"
  | "lastError"
  | "health"
  | "lastHeartbeatAt"
>;

/** Only what the guide needs, so nothing else about a screen reaches the browser. */
export function toSetupDevice(device: SetupDevice): SetupDevice {
  return {
    id: device.id,
    name: device.name,
    status: device.status,
    screenshotUrl: device.screenshotUrl,
    currentPlaylistName: device.currentPlaylistName,
    manifestVersion: device.manifestVersion,
    contentState: device.contentState,
    lastError: device.lastError,
    health: device.health,
    lastHeartbeatAt: device.lastHeartbeatAt,
  };
}

export type SetupPlaylist = Pick<Playlist, "id" | "name" | "isDefault"> & {
  items: ReadonlyArray<unknown>;
};

export type SetupProgress = {
  hasScreen: boolean;
  hasMedia: boolean;
  hasContent: boolean;
  /** The playlist screens play: the workspace default when it has items. */
  playlist: SetupPlaylist | null;
  /** A playlist with items that could be made the default in one click. */
  candidatePlaylist: SetupPlaylist | null;
  /** The screen the guide follows: the one furthest along. */
  screen: SetupDevice | null;
  screenState: ScreenSetupState;
  /** Plain sentence for the "problem" state. */
  problem: string | null;
  done: Record<SetupStepId, boolean>;
  doneCount: number;
  /** First step that still needs the customer. */
  current: SetupStepId;
  complete: boolean;
};

const stateRank: Record<ScreenSetupState, number> = {
  playing: 5,
  downloading: 4,
  problem: 3,
  waiting_for_content: 2,
  offline: 1,
  none: 0,
};

export function screenSetupState(
  device: SetupDevice,
  hasContent: boolean,
): { state: ScreenSetupState; problem: string | null } {
  if (device.status !== "online" && device.status !== "stale") {
    return { state: "offline", problem: null };
  }
  if (!hasContent) return { state: "waiting_for_content", problem: null };
  if (device.health && !device.health.hdmiConnected) {
    return {
      state: "problem",
      problem: "The screen can't see a TV on its HDMI cable. Check the cable and that the TV is on the right input.",
    };
  }
  if (device.contentState === "updating") return { state: "downloading", problem: null };
  if (device.lastError) return { state: "problem", problem: device.lastError };
  if (device.health && !device.health.playerHealthy) {
    return { state: "problem", problem: "The player on the screen stopped. It restarts on its own within a minute." };
  }
  // Screens on older software never report which content they hold; once
  // they have applied any content version, treat them as playing.
  if (device.contentState === "current" || device.manifestVersion) {
    return { state: "playing", problem: null };
  }
  return { state: "downloading", problem: null };
}

export function setupProgress(input: {
  devices: ReadonlyArray<SetupDevice>;
  mediaCount: number;
  playlists: ReadonlyArray<SetupPlaylist>;
  /** The screen that was just paired in this browser, if any. */
  preferredScreenId?: string | null;
}): SetupProgress {
  const withItems = input.playlists.filter((playlist) => playlist.items.length > 0);
  const defaultPlaylist = withItems.find((playlist) => playlist.isDefault) ?? null;
  // A workspace can also run on per-screen playlists with no default.
  const assignedElsewhere =
    !defaultPlaylist && withItems.length > 0 && input.devices.some((device) => device.currentPlaylistName);
  const hasContent = Boolean(defaultPlaylist) || assignedElsewhere;
  const playlist =
    defaultPlaylist ??
    (assignedElsewhere
      ? withItems.find((entry) => input.devices.some((device) => device.currentPlaylistName === entry.name)) ??
        withItems[0]!
      : null);

  let screen: SetupDevice | null = null;
  let screenState: ScreenSetupState = "none";
  let problem: string | null = null;
  for (const device of input.devices) {
    const next = screenSetupState(device, hasContent);
    const preferred = device.id === input.preferredScreenId;
    if (!screen || preferred || stateRank[next.state] > stateRank[screenState]) {
      screen = device;
      screenState = next.state;
      problem = next.problem;
      if (preferred) break;
    }
  }

  const hasScreen = input.devices.length > 0;
  const done: Record<SetupStepId, boolean> = {
    prepare: hasScreen,
    pair: hasScreen,
    content: hasContent,
    playing: hasScreen && hasContent && screenState === "playing",
  };
  const current = setupStepOrder.find((step) => !done[step]) ?? "playing";

  return {
    hasScreen,
    hasMedia: input.mediaCount > 0,
    hasContent,
    playlist,
    candidatePlaylist: hasContent ? null : withItems[0] ?? null,
    screen,
    screenState,
    problem,
    done,
    doneCount: setupStepOrder.filter((step) => done[step]).length,
    current,
    complete: setupStepOrder.every((step) => done[step]),
  };
}

/**
 * Cheap check for the sidebar, from the screen list alone: a workspace still
 * needs the guide while it has no screen, or no screen has anything to play.
 */
export function needsSetup(devices: ReadonlyArray<Pick<DeviceSummary, "currentPlaylistName">>) {
  return devices.length === 0 || devices.every((device) => !device.currentPlaylistName);
}

/** Pairing codes are short and alphanumeric; anything else is ignored. */
export function parseClaimCode(value: string | string[] | undefined) {
  return typeof value === "string" && /^[A-Za-z0-9]{4,12}$/.test(value) ? value.toUpperCase() : undefined;
}
