import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type DeviceManifest,
  type ManifestPlaylistItem,
  deviceManifestSchema,
} from "@showroom/contracts";
import { CANNOT_REACH, friendlyError, networkName, showOfflineBadge, videoProgressed } from "./screen-text";
import { QrCode, WiFiSetup, type WiFiStatus } from "./wifi-setup";

type PlayerStatus = {
  claimed: boolean;
  deviceId?: string;
  claimCode?: string;
  manifestVersion?: string;
  lastSyncAt?: string;
  lastError?: string;
  /** Dashboard link that adds this screen with its code filled in, as QR modules. */
  claimQr?: string[];
  online?: boolean;
  lastCloudContactAt?: string;
  /** Assigned items not saved on the screen yet. Older agents send nothing. */
  pendingItems?: number;
};

type PlaybackState = {
  manifest: DeviceManifest | null;
  playlist: ManifestPlaylistItem[];
  index: number;
  status: "loading" | "ready" | "offline" | "unclaimed" | "wifi-setup";
  playerStatus: PlayerStatus | null;
  wifiStatus: WiFiStatus | null;
  playbackError: string | null;
  mediaNonce: number;
  /** When the agent first reported this paired screen as out of touch. */
  offlineSince: number | null;
  offlineBadge: boolean;
  /** Wi-Fi setup asked for from the "no pairing code" screen. */
  wifiRequested: boolean;
};

/** A local request that never answers must not block every later refresh. */
function fetchLocal(path: string) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 10_000);
  return fetch(path, { cache: "no-store", signal: controller.signal }).finally(() =>
    window.clearTimeout(timer),
  );
}

async function loadPlayerStatus() {
  const response = await fetchLocal("/local/status");
  if (!response.ok) throw new Error("Unable to load local status");
  return (await response.json()) as PlayerStatus;
}

async function loadManifest() {
  const response = await fetchLocal("/local/manifest");
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Unable to load the local manifest");
  const payload = await response.json();
  return deviceManifestSchema.parse(payload.manifest ?? payload);
}

async function loadWiFiStatus() {
  const response = await fetchLocal("/local/wifi/status");
  if (!response.ok) throw new Error("Unable to load Wi-Fi status");
  return (await response.json()) as WiFiStatus;
}

function chooseActiveWindow(manifest: DeviceManifest, now = Date.now()) {
  return manifest.scheduleWindows
    .filter((window) => {
      const startsAt = Date.parse(window.startsAt);
      const endsAt = Date.parse(window.endsAt);
      return Number.isFinite(startsAt) && Number.isFinite(endsAt) && startsAt <= now && now <= endsAt;
    })
    .sort((a, b) => b.priority - a.priority)[0];
}

export function chooseSchedule(manifest: DeviceManifest, now = Date.now()) {
  const active = chooseActiveWindow(manifest, now);

  return active?.playlist.length ? active.playlist : manifest.defaultPlaylist;
}

export function choosePlaylistId(manifest: DeviceManifest, now = Date.now()) {
  const active = chooseActiveWindow(manifest, now);
  return active?.playlist.length ? active.playlistId : manifest.defaultPlaylistId;
}

export function reconcilePlaylistIndex(
  currentPlaylist: ManifestPlaylistItem[],
  currentIndex: number,
  nextPlaylist: ManifestPlaylistItem[],
) {
  if (!nextPlaylist.length) return 0;
  const currentItem = currentPlaylist[currentIndex % Math.max(currentPlaylist.length, 1)];
  if (!currentItem) return 0;
  const preservedIndex = nextPlaylist.findIndex((item) => item.id === currentItem.id);
  return preservedIndex >= 0 ? preservedIndex : 0;
}

function resultValue<T>(result: PromiseSettledResult<T>) {
  return result.status === "fulfilled" ? result.value : null;
}

function resultError(result: PromiseSettledResult<unknown>) {
  return result.status === "rejected" && result.reason instanceof Error
    ? result.reason.message
    : null;
}

/** Splits a pairing code into two groups so it's easy to read across a room. */
export function formatClaimCode(code: string) {
  const clean = code.replace(/\s+/g, "").toUpperCase();
  if (clean.length !== 6) return clean;
  return `${clean.slice(0, 3)} ${clean.slice(3)}`;
}

function orientationStyle(orientation: DeviceManifest["orientation"]) {
  const sideways = orientation === 90 || orientation === 270;
  return {
    width: sideways ? "100vh" : "100vw",
    height: sideways ? "100vw" : "100vh",
    transform: `translate(-50%, -50%) rotate(${orientation}deg)`,
  };
}

export function PlayerApp() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const refreshInFlightRef = useRef(false);
  const recoveryTimerRef = useRef<number | null>(null);
  const recoveryPendingRef = useRef(false);
  const failureCountsRef = useRef(new Map<string, number>());
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [slowStart, setSlowStart] = useState(false);
  const [state, setState] = useState<PlaybackState>({
    manifest: null,
    playlist: [],
    index: 0,
    status: "loading",
    playerStatus: null,
    wifiStatus: null,
    playbackError: null,
    mediaNonce: 0,
    offlineSince: null,
    offlineBadge: false,
    wifiRequested: false,
  });
  const setWifiRequested = (wifiRequested: boolean) =>
    setState((current) => ({ ...current, wifiRequested }));

  useEffect(() => {
    const timer = window.setTimeout(() => setSlowStart(true), 90_000);
    return () => window.clearTimeout(timer);
  }, []);

  const settingUp = state.status === "wifi-setup" || state.status === "unclaimed";
  const activeItem = state.playlist.length
    ? state.playlist[state.index % state.playlist.length]
    : null;
  const viewportStyle = useMemo(
    () => orientationStyle(state.manifest?.orientation ?? 0),
    [state.manifest?.orientation],
  );

  useEffect(() => {
    const report = () => {
      void fetch("/local/playback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // With nothing to play (setup, pairing, waiting for content) the page
        // still reports in, so the agent does not restart the browser every
        // two minutes while a paired screen waits for its first download.
        body: JSON.stringify(
          activeItem
            ? {
                assetId: activeItem.assetId,
                playlistId: state.manifest ? choosePlaylistId(state.manifest) ?? "default" : "default",
                state: state.playbackError ? "recovering" : "playing",
              }
            : { assetId: "", playlistId: "", state: "idle" },
        ),
      }).catch(() => undefined);
    };
    report();
    const interval = window.setInterval(report, 10_000);
    return () => window.clearInterval(interval);
  }, [activeItem, state.manifest, state.playbackError]);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      if (refreshInFlightRef.current) return;
      refreshInFlightRef.current = true;

      try {
        const [statusResult, manifestResult, wifiResult] = await Promise.allSettled([
          loadPlayerStatus(),
          loadManifest(),
          loadWiFiStatus(),
        ]);
        if (cancelled) return;

        const nextStatus = resultValue(statusResult);
        const fetchedManifest = resultValue(manifestResult);
        const nextWiFi = resultValue(wifiResult);
        const refreshError =
          resultError(manifestResult) ?? resultError(statusResult) ?? resultError(wifiResult);

        setState((previous) => {
          // Without a fresh status (the agent is restarting), keep what was known.
          const offline = nextStatus
            ? nextStatus.claimed && nextStatus.online === false
            : previous.offlineSince !== null;
          const offlineSince = offline ? (previous.offlineSince ?? Date.now()) : null;
          const current: PlaybackState = {
            ...previous,
            offlineSince,
            offlineBadge: showOfflineBadge(offlineSince, Date.now()),
            // The request ends once there is a code to show or the screen is paired.
            wifiRequested:
              previous.wifiRequested && !(nextStatus && (nextStatus.claimed || nextStatus.claimCode)),
          };
          const playerStatus = nextStatus ?? current.playerStatus;
          const wifiStatus = nextWiFi ?? current.wifiStatus;
          const manifest = fetchedManifest ?? current.manifest;

          if (playerStatus && !playerStatus.claimed) {
            // An unpaired screen (new, or removed from its account) shows
            // pairing, never content left over from a previous owner.
            return {
              ...current,
              manifest: null,
              playlist: [],
              index: 0,
              playerStatus,
              wifiStatus,
              status:
                !wifiStatus?.connected && !playerStatus.claimCode ? "wifi-setup" : "unclaimed",
            };
          }

          if (!manifest) {
            return {
              ...current,
              playerStatus,
              wifiStatus,
              status: refreshError ? "loading" : "offline",
            };
          }

          const playlist = fetchedManifest ? chooseSchedule(fetchedManifest) : current.playlist;
          const index = fetchedManifest
            ? reconcilePlaylistIndex(current.playlist, current.index, playlist)
            : current.index;

          return {
            ...current,
            manifest,
            playlist,
            index,
            playerStatus,
            wifiStatus,
            status: fetchedManifest ? "ready" : "offline",
          };
        });
      } finally {
        refreshInFlightRef.current = false;
      }
    };

    void refresh();
    // First-time setup and pairing poll faster so the network list, hotspot
    // details and the switch to playback after pairing show up quickly.
    const interval = window.setInterval(refresh, settingUp ? 5_000 : 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [refreshNonce, settingUp]);

  useEffect(() => {
    if (!activeItem || activeItem.assetType === "video") return;
    const durationSeconds = Math.min(Math.max(activeItem.durationSeconds ?? 10, 1), 86_400);
    const timeout = window.setTimeout(() => {
      setState((current) => ({
        ...current,
        index: current.playlist.length ? (current.index + 1) % current.playlist.length : 0,
        playbackError: null,
      }));
    }, durationSeconds * 1000);
    return () => window.clearTimeout(timeout);
  }, [activeItem]);

  useEffect(() => {
    return () => {
      if (recoveryTimerRef.current !== null) window.clearTimeout(recoveryTimerRef.current);
    };
  }, []);

  const recoverMedia = useCallback((message: string) => {
    if (!activeItem || recoveryPendingRef.current) return;
    recoveryPendingRef.current = true;
    const attempts = (failureCountsRef.current.get(activeItem.id) ?? 0) + 1;
    failureCountsRef.current.set(activeItem.id, attempts);
    setState((current) => ({ ...current, playbackError: message }));

    if (recoveryTimerRef.current !== null) window.clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = window.setTimeout(() => {
      setState((current) => {
        const currentItem = current.playlist[current.index % Math.max(current.playlist.length, 1)];
        if (!currentItem || currentItem.id !== activeItem.id) return current;
        const shouldSkip = current.playlist.length > 1 && attempts >= 2;
        return {
          ...current,
          index: shouldSkip ? (current.index + 1) % current.playlist.length : current.index,
          mediaNonce: current.mediaNonce + 1,
          playbackError: shouldSkip ? null : message,
        };
      });
      recoveryPendingRef.current = false;
    }, Math.min(1_000 * attempts, 5_000));
  }, [activeItem]);

  useEffect(() => {
    if (!activeItem || activeItem.assetType !== "video") return;
    const video = videoRef.current;
    if (!video) return;

    video.volume = Math.min(Math.max((state.manifest?.volume ?? 0) / 100, 0), 1);
    video.muted = (state.manifest?.volume ?? 0) === 0;
    let lastTime = video.currentTime;
    let lastProgressAt = Date.now();

    const markHealthy = () => {
      failureCountsRef.current.delete(activeItem.id);
      recoveryPendingRef.current = false;
      setState((current) =>
        current.playbackError ? { ...current, playbackError: null } : current,
      );
    };

    const start = () => {
      void video.play().catch(() => {
        // Chromium may briefly reject autoplay while a new media element is mounting.
      });
    };
    start();

    const interval = window.setInterval(() => {
      if (videoProgressed(lastTime, video.currentTime)) {
        lastTime = video.currentTime;
        lastProgressAt = Date.now();
        markHealthy();
        return;
      }
      if (video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) start();
      if (!video.ended && Date.now() - lastProgressAt > 20_000) {
        recoverMedia(`Playback stalled on ${activeItem.title}`);
        lastProgressAt = Date.now();
      }
    }, 3_000);

    return () => window.clearInterval(interval);
  }, [activeItem, recoverMedia, state.manifest?.volume, state.mediaNonce]);

  if (state.status === "unclaimed") {
    const claimCode = state.playerStatus?.claimCode;
    const claimQr = state.playerStatus?.claimQr;
    const code = (
      <h1 className="claimCode" aria-label={claimCode ? `Pairing code ${claimCode.split("").join(" ")}` : "Pairing code loading"}>
        {claimCode ? formatClaimCode(claimCode) : "••• •••"}
      </h1>
    );
    // Wi-Fi status knows nothing about a cable: a screen on Ethernet that the
    // agent says is in touch with the service is online.
    const offline = state.wifiStatus?.connected === false && state.playerStatus?.online !== true;
    const network = networkName(state.wifiStatus);
    const statusLine = (
      <p className="statusLine">
        <span className={offline ? "statusDot warn" : "statusDot"} aria-hidden="true" />
        {state.wifiStatus?.connected
          ? `Online${network ? ` via ${network}` : ""}`
          : offline
            ? "Waiting for network"
            : "Online"}
      </p>
    );
    if (!claimCode) {
      // No code: the first moments after boot, or the service has not answered
      // for a while (the agent then holds the code back, since nobody could
      // use it). Say so, and keep Wi-Fi setup one key press away.
      if (state.wifiRequested) {
        return (
          <WiFiSetup
            lastError={state.playerStatus?.lastError}
            onCancel={() => setWifiRequested(false)}
            onSubmitted={() => setRefreshNonce((value) => value + 1)}
            wifiStatus={state.wifiStatus}
          />
        );
      }
      const problem = friendlyError(state.playerStatus?.lastError);
      return (
        <main className="playerRoot">
          <section className="fallbackScreen" aria-live="polite">
            <p className="label">Pair this screen</p>
            <h1>{problem ? "Can't reach Digital Curator" : "Getting a pairing code"}</h1>
            <p>
              {problem
                ? `This screen is ${network ? `on ${network}` : "connected"} but the service is not answering. Check that this network has internet access. The screen keeps retrying.`
                : `${network ? `Online via ${network}. ` : ""}This only takes a moment.`}
            </p>
            {problem && problem !== CANNOT_REACH ? <p className="technicalError">{problem}</p> : null}
            <button autoFocus className="changeWifi" onClick={() => setWifiRequested(true)} type="button">
              Wrong network? Press Enter on a USB keyboard to choose a different Wi-Fi
            </button>
          </section>
        </main>
      );
    }
    return (
      <main className="playerRoot">
        {claimCode && claimQr?.length ? (
          <section className="fallbackScreen pairingScreen claimWithQr" aria-live="polite">
            <div>
              <p className="label">Pair this screen</p>
              {code}
              <ol className="pairingSteps">
                <li><span>1</span>Scan the square with your phone camera</li>
                <li><span>2</span>Sign in to Digital Curator and choose Add screen</li>
                <li><span>3</span>The screen connects on its own</li>
              </ol>
              <p className="pairingAlt">No phone? Open Screens in Digital Curator, choose Add screen and enter the code.</p>
              {statusLine}
            </div>
            <figure className="claimQr">
              <QrCode label="Add this screen in Digital Curator" rows={claimQr} />
              <figcaption>Scan to add this screen</figcaption>
            </figure>
          </section>
        ) : (
          <section className="fallbackScreen pairingScreen" aria-live="polite">
            <p className="label">Pair this screen</p>
            {code}
            <ol className="pairingSteps">
              <li><span>1</span>Open Digital Curator on a phone or computer</li>
              <li><span>2</span>Go to Screens and choose Add screen</li>
              <li><span>3</span>Enter this code. The screen connects on its own</li>
            </ol>
            {statusLine}
          </section>
        )}
      </main>
    );
  }

  if (state.status === "wifi-setup") {
    return (
      <WiFiSetup
        lastError={state.playerStatus?.lastError}
        onSubmitted={() => setRefreshNonce((value) => value + 1)}
        wifiStatus={state.wifiStatus}
      />
    );
  }

  if (!state.manifest || !activeItem) {
    // An empty manifest (all content removed, nothing assigned) is a normal
    // state: no error line, only "choose a playlist".
    // A first download is not "nothing assigned" either.
    const downloading =
      state.status !== "loading" &&
      Boolean(state.playerStatus?.claimed) &&
      (state.playerStatus?.pendingItems ?? 0) > 0;
    const problem =
      state.manifest && !downloading ? null : friendlyError(state.playerStatus?.lastError);
    return (
      <main className="playerRoot">
        <section className="fallbackScreen" aria-live="polite">
          <div className="waitingMark" aria-hidden="true" />
          <p className="label">Screen ready</p>
          <h1>
            {state.status === "loading"
              ? "Starting player"
              : downloading
                ? "Downloading your content"
                : "Waiting for content"}
          </h1>
          <p>
            {downloading
              ? "Your playlist will start as soon as the first item is saved on this screen."
              : state.status !== "loading"
              ? "This screen is paired. Choose a playlist for it in Digital Curator and it will start playing automatically."
              : slowStart
                ? "This is taking longer than usual. If nothing changes in a few minutes, unplug this screen's power and plug it back in."
                : "This only takes a moment."}
          </p>
          {state.status !== "loading" && problem ? <p className="technicalError">{problem}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="playerRoot">
      <div className="playerViewport" style={viewportStyle}>
        {activeItem.assetType === "video" ? (
          <video
            autoPlay
            className="playerMedia"
            controls={false}
            key={`${activeItem.assetId}-${state.manifest.manifestVersion}-${state.mediaNonce}`}
            loop={state.playlist.length === 1}
            muted={state.manifest.volume === 0}
            onCanPlay={(event) => void event.currentTarget.play().catch(() => {})}
            onEnded={() => {
              if (state.playlist.length > 1) {
                setState((current) => ({ ...current, index: (current.index + 1) % current.playlist.length }));
              }
            }}
            onError={() => recoverMedia(`Unable to play ${activeItem.title}`)}
            playsInline
            preload="auto"
            ref={videoRef}
            src={activeItem.url}
          />
        ) : (
          <img
            alt=""
            className="playerMedia"
            key={`${activeItem.assetId}-${state.manifest.manifestVersion}-${state.mediaNonce}`}
            onError={() => recoverMedia(`Unable to display ${activeItem.title}`)}
            onLoad={() => {
              // It displayed: forget earlier failures and drop the badge.
              failureCountsRef.current.delete(activeItem.id);
              setState((current) => (current.playbackError ? { ...current, playbackError: null } : current));
            }}
            src={activeItem.url}
          />
        )}
      </div>

      {state.offlineBadge ? (
        <div className="playerStatus" role="status">Offline · playing saved content</div>
      ) : null}
      {state.playbackError ? (
        <div className="playerStatus playerStatusError" role="alert">Recovering playback…</div>
      ) : null}
    </main>
  );
}
