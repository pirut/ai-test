import { useEffect, useRef, useState } from "react";
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
  activeItem: ManifestPlaylistItem | null;
  index: number;
  status: "loading" | "ready" | "offline" | "unclaimed" | "wifi-setup";
  playerStatus: PlayerStatus | null;
  wifiStatus: WiFiStatus | null;
};

async function loadPlayerStatus() {
  const response = await fetch("/local/status", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load local status");
  }

  return (await response.json()) as PlayerStatus;
}

async function loadManifest() {
  const response = await fetch("/local/manifest", { cache: "no-store" });
  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return deviceManifestSchema.parse(payload.manifest ?? payload);
}

async function loadWiFiStatus() {
  const response = await fetch("/local/wifi/status", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load Wi-Fi status");
  }

  return (await response.json()) as WiFiStatus;
}

async function configureWiFi(ssid: string, password: string) {
  const response = await fetch("/local/wifi/configure", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ssid, password }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as WiFiStatus;
}

function chooseSchedule(manifest: DeviceManifest) {
  const now = Date.now();
  const active = manifest.scheduleWindows
    .filter((window) => {
      const startsAt = Date.parse(window.startsAt);
      const endsAt = Date.parse(window.endsAt);
      return startsAt <= now && now <= endsAt;
    })
    .sort((a, b) => b.priority - a.priority)[0];

  return active?.playlist.length ? active.playlist : manifest.defaultPlaylist;
}

export function PlayerApp() {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [wifiForm, setWifiForm] = useState({
    ssid: "",
    password: "",
  });
  const [wifiSubmission, setWiFiSubmission] = useState<{
    status: "idle" | "saving" | "error" | "success";
    message?: string;
  }>({
    status: "idle",
  });
  const [state, setState] = useState<PlaybackState>({
    manifest: null,
    activeItem: null,
    index: 0,
    status: "loading",
    playerStatus: null,
    wifiStatus: null,
  });

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const [playerStatus, manifest, wifiStatus] = await Promise.all([
          loadPlayerStatus(),
          loadManifest(),
          loadWiFiStatus(),
        ]);

        if (cancelled) {
          return;
        }

        if (!playerStatus.claimed && !manifest && !wifiStatus.connected && !playerStatus.claimCode) {
          setState((current) => ({
            ...current,
            manifest: null,
            activeItem: null,
            playerStatus,
            wifiStatus,
            status: "wifi-setup",
          }));
          return;
        }

        if (!playerStatus.claimed && !manifest) {
          setState((current) => ({
            ...current,
            manifest: null,
            activeItem: null,
            playerStatus,
            wifiStatus,
            status: "unclaimed",
          }));
          return;
        }

        if (!manifest) {
          setState((current) => ({
            ...current,
            playerStatus,
            wifiStatus,
            status: "offline",
          }));
          return;
        }

        const playlist = chooseSchedule(manifest);
        setState({
          manifest,
          activeItem: playlist[0] ?? null,
          index: 0,
          status: "ready",
          playerStatus,
          wifiStatus,
        });
      } catch {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            status: current.manifest ? "offline" : "loading",
          }));
        }
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
    if (!state.manifest) {
      return;
    }

    const playlist = chooseSchedule(state.manifest);
    if (!playlist.length) {
      setState((current) => ({ ...current, activeItem: null }));
      return;
    }

    const currentItem = playlist[state.index % playlist.length];
    setState((current) => ({
      ...current,
      activeItem: currentItem,
    }));

    if (currentItem.assetType === "video") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setState((current) => ({
        ...current,
        index: (current.index + 1) % playlist.length,
      }));
    }, (currentItem.durationSeconds ?? 10) * 1000);

    return () => window.clearTimeout(timeout);
  }, [state.index, state.manifest]);

  useEffect(() => {
    if (!state.manifest || state.activeItem?.assetType !== "video") {
      return;
    }

    const getVideo = () =>
      videoRef.current ?? document.querySelector<HTMLVideoElement>("video.playerMedia");

    const video = getVideo();
    if (!video) {
      return;
    }

    const playlist = chooseSchedule(state.manifest);
    if (playlist.length !== 1) {
      return;
    }

    video.loop = true;
    video.onended = () => {
      video.currentTime = 0;
      void video.play().catch(() => {});
    };

    if (video.ended) {
      video.currentTime = 0;
      void video.play().catch(() => {});
    }

    const interval = window.setInterval(() => {
      const currentVideo = getVideo();
      if (!currentVideo) {
        return;
      }

      currentVideo.loop = true;
      currentVideo.onended = () => {
        currentVideo.currentTime = 0;
        void currentVideo.play().catch(() => {});
      };

      const nearEnd =
        Number.isFinite(currentVideo.duration) &&
        currentVideo.duration > 0 &&
        currentVideo.currentTime >= currentVideo.duration - 0.25;

      if (currentVideo.ended || (nearEnd && currentVideo.paused)) {
        currentVideo.currentTime = 0;
        void currentVideo.play().catch(() => {});
        return;
      }

      if (currentVideo.paused && currentVideo.readyState >= 2) {
        void currentVideo.play().catch(() => {});
      }
    }, 1000);

    return () => {
      window.clearInterval(interval);
      const currentVideo = getVideo();
      if (currentVideo) {
        currentVideo.onended = null;
      }
    };
  }, [state.activeItem, state.manifest]);

  if (state.status === "unclaimed") {
    return (
      <main className="playerRoot">
        <section className="fallbackScreen">
          <p className="label">Claim this screen</p>
          <h1>{state.playerStatus?.claimCode ?? "......"}</h1>
          <p>Open Signal Room, claim this code, and the player will switch automatically.</p>
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
            <p className="setupCopy">
              Enter the network name and password. Once the device gets online it will fetch a
              claim code automatically.
            </p>
            <form
              className="wifiForm"
              onSubmit={async (event) => {
                event.preventDefault();
                setWiFiSubmission({ status: "saving", message: "Connecting..." });

                try {
                  const nextStatus = await configureWiFi(wifiForm.ssid, wifiForm.password);
                  setWiFiSubmission({
                    status: "success",
                    message: nextStatus.connected
                      ? `Connected to ${nextStatus.ssid ?? wifiForm.ssid}. Waiting for claim code...`
                      : "Credentials saved. Waiting for network...",
                  });
                  window.setTimeout(() => {
                    setRefreshNonce((value) => value + 1);
                  }, 1500);
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
                  onChange={(event) =>
                    setWifiForm((current) => ({ ...current, ssid: event.target.value }))
                  }
                  placeholder="Cornerstone Companies"
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
                  onChange={(event) =>
                    setWifiForm((current) => ({ ...current, password: event.target.value }))
                  }
                  placeholder="Enter Wi-Fi password"
                  type="password"
                  value={wifiForm.password}
                />
              </label>
              <button disabled={wifiSubmission.status === "saving"} type="submit">
                {wifiSubmission.status === "saving" ? "Connecting..." : "Connect"}
              </button>
            </form>
            <div className="setupMeta">
              <span>
                {state.wifiStatus?.supported ? "Wireless hardware detected" : "Wireless setup unavailable"}
              </span>
              {state.playerStatus?.lastError ? <span>{state.playerStatus.lastError}</span> : null}
              {state.wifiStatus?.error ? <span>{state.wifiStatus.error}</span> : null}
              {wifiSubmission.message ? (
                <span
                  className={
                    wifiSubmission.status === "error" ? "setupMessage error" : "setupMessage"
                  }
                >
                  {wifiSubmission.message}
                </span>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!state.manifest || !state.activeItem) {
    return (
      <main className="playerRoot">
        <section className="fallbackScreen">
          <p className="label">Waiting for content</p>
          <h1>No active manifest</h1>
          <p>The device is online but no playlist has been assigned yet.</p>
        </section>
      </main>
    );
  }

  const playlist = chooseSchedule(state.manifest);

  return (
    <main className="playerRoot" style={{ rotate: `${state.manifest.orientation}deg` }}>
      <div className="playerOverlay">
        <span>{state.status === "ready" ? "LIVE CACHE" : "OFFLINE CACHE"}</span>
        <span>{state.manifest.manifestVersion}</span>
      </div>
      {state.activeItem.assetType === "video" ? (
        <video
          autoPlay
          className="playerMedia"
          controls={false}
          key={`${state.activeItem.assetId}-${state.manifest.manifestVersion}`}
          loop={playlist.length === 1}
          muted={state.manifest.volume === 0}
          onEnded={(event) => {
            if (playlist.length <= 1) {
              event.currentTarget.currentTime = 0;
              void event.currentTarget.play().catch(() => {});
              return;
            }

            setState((current) => ({
              ...current,
              index: (current.index + 1) % playlist.length,
            }));
          }}
          onLoadedMetadata={(event) => {
            if (playlist.length === 1) {
              event.currentTarget.loop = true;
            }
          }}
          playsInline
          ref={videoRef}
          src={state.activeItem.url}
        />
      ) : (
        <img
          alt={state.activeItem.title}
          className="playerMedia"
          src={state.activeItem.url}
        />
      )}
    </main>
  );
}
