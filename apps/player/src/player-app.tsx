import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type DeviceManifest,
  type ManifestPlaylistItem,
  deviceManifestSchema,
} from "@showroom/contracts";

type PlayerStatus = {
  claimed: boolean;
  deviceId?: string;
  claimCode?: string;
  manifestVersion?: string;
  lastSyncAt?: string;
  lastError?: string;
};

type WiFiStatus = {
  supported: boolean;
  connected: boolean;
  interface?: string;
  ssid?: string;
  error?: string;
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
};

async function loadPlayerStatus() {
  const response = await fetch("/local/status", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load local status");
  return (await response.json()) as PlayerStatus;
}

async function loadManifest() {
  const response = await fetch("/local/manifest", { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Unable to load the local manifest");
  const payload = await response.json();
  return deviceManifestSchema.parse(payload.manifest ?? payload);
}

async function loadWiFiStatus() {
  const response = await fetch("/local/wifi/status", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load Wi-Fi status");
  return (await response.json()) as WiFiStatus;
}

async function configureWiFi(ssid: string, password: string) {
  const response = await fetch("/local/wifi/configure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ssid, password }),
  });
  if (!response.ok) throw new Error(await response.text());
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
  const [wifiForm, setWifiForm] = useState({ ssid: "", password: "" });
  const [wifiSubmission, setWiFiSubmission] = useState<{
    status: "idle" | "saving" | "error" | "success";
    message?: string;
  }>({ status: "idle" });
  const [state, setState] = useState<PlaybackState>({
    manifest: null,
    playlist: [],
    index: 0,
    status: "loading",
    playerStatus: null,
    wifiStatus: null,
    playbackError: null,
    mediaNonce: 0,
  });

  const activeItem = state.playlist.length
    ? state.playlist[state.index % state.playlist.length]
    : null;
  const viewportStyle = useMemo(
    () => orientationStyle(state.manifest?.orientation ?? 0),
    [state.manifest?.orientation],
  );

  useEffect(() => {
    if (!activeItem) return;
    const report = () => {
      void fetch("/local/playback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: activeItem.assetId,
          playlistId: state.manifest ? choosePlaylistId(state.manifest) ?? "default" : "default",
          state: state.playbackError ? "recovering" : "playing",
        }),
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

        setState((current) => {
          const playerStatus = nextStatus ?? current.playerStatus;
          const wifiStatus = nextWiFi ?? current.wifiStatus;
          const manifest = fetchedManifest ?? current.manifest;

          if (!manifest) {
            if (playerStatus && !playerStatus.claimed && !wifiStatus?.connected && !playerStatus.claimCode) {
              return { ...current, playerStatus, wifiStatus, status: "wifi-setup" };
            }
            if (playerStatus && !playerStatus.claimed) {
              return { ...current, playerStatus, wifiStatus, status: "unclaimed" };
            }
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
    const interval = window.setInterval(refresh, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [refreshNonce]);

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
      if (video.currentTime > lastTime + 0.05) {
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
    return (
      <main className="playerRoot">
        <section className="fallbackScreen" aria-live="polite">
          <p className="label">Claim this screen</p>
          <h1 className="claimCode">{state.playerStatus?.claimCode ?? "••••••"}</h1>
          <p>Open Digital Curator, enter this code, and the screen will connect automatically.</p>
        </section>
      </main>
    );
  }

  if (state.status === "wifi-setup") {
    return (
      <main className="playerRoot">
        <section className="setupScreen">
          <div className="setupCard">
            <p className="label">First-time setup</p>
            <h1>Connect to Wi-Fi</h1>
            <p className="setupCopy">Connect this screen to the network to receive its claim code.</p>
            <form
              className="wifiForm"
              onSubmit={async (event) => {
                event.preventDefault();
                setWiFiSubmission({ status: "saving", message: "Connecting…" });
                try {
                  const nextStatus = await configureWiFi(wifiForm.ssid, wifiForm.password);
                  setWiFiSubmission({
                    status: "success",
                    message: nextStatus.connected
                      ? `Connected to ${nextStatus.ssid ?? wifiForm.ssid}. Waiting for claim code…`
                      : "Credentials saved. Waiting for the network…",
                  });
                  window.setTimeout(() => setRefreshNonce((value) => value + 1), 1_500);
                } catch (error) {
                  setWiFiSubmission({
                    status: "error",
                    message: error instanceof Error ? error.message : "Unable to connect to Wi-Fi",
                  });
                }
              }}
            >
              <label className="wifiField">
                <span>Wi-Fi name</span>
                <input
                  autoCapitalize="off"
                  autoComplete="off"
                  autoCorrect="off"
                  onChange={(event) => setWifiForm((current) => ({ ...current, ssid: event.target.value }))}
                  placeholder="Network name"
                  required
                  type="text"
                  value={wifiForm.ssid}
                />
              </label>
              <label className="wifiField">
                <span>Password</span>
                <input
                  autoCapitalize="off"
                  autoComplete="off"
                  autoCorrect="off"
                  onChange={(event) => setWifiForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Wi-Fi password"
                  required
                  type="password"
                  value={wifiForm.password}
                />
              </label>
              <button disabled={wifiSubmission.status === "saving"} type="submit">
                {wifiSubmission.status === "saving" ? "Connecting…" : "Connect screen"}
              </button>
            </form>
            <div className="setupMeta" aria-live="polite">
              <span>{state.wifiStatus?.supported ? "Wireless hardware ready" : "Wireless setup unavailable"}</span>
              {state.playerStatus?.lastError ? <span>{state.playerStatus.lastError}</span> : null}
              {state.wifiStatus?.error ? <span>{state.wifiStatus.error}</span> : null}
              {wifiSubmission.message ? (
                <span className={wifiSubmission.status === "error" ? "setupMessage error" : "setupMessage"}>
                  {wifiSubmission.message}
                </span>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!state.manifest || !activeItem) {
    return (
      <main className="playerRoot">
        <section className="fallbackScreen" aria-live="polite">
          <div className="waitingMark" aria-hidden="true" />
          <p className="label">Screen ready</p>
          <h1>{state.status === "loading" ? "Starting player" : "Waiting for content"}</h1>
          <p>Assign a playlist in Digital Curator. This screen will update automatically.</p>
          {state.playerStatus?.lastError ? <p className="technicalError">{state.playerStatus.lastError}</p> : null}
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
            src={activeItem.url}
          />
        )}
      </div>

      {state.status === "offline" ? (
        <div className="playerStatus" role="status">Offline · playing saved content</div>
      ) : null}
      {state.playbackError ? (
        <div className="playerStatus playerStatusError" role="alert">Recovering playback…</div>
      ) : null}
    </main>
  );
}
