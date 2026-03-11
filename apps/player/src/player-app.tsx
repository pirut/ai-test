import { useEffect, useState } from "react";
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

type PlaybackState = {
  manifest: DeviceManifest | null;
  activeItem: ManifestPlaylistItem | null;
  index: number;
  status: "loading" | "ready" | "offline" | "unclaimed";
  playerStatus: PlayerStatus | null;
};

async function loadPlayerStatus() {
  const response = await fetch("/local/status");
  if (!response.ok) {
    throw new Error("Unable to load local status");
  }

  return (await response.json()) as PlayerStatus;
}

async function loadManifest() {
  const response = await fetch("/local/manifest");
  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return deviceManifestSchema.parse(payload.manifest ?? payload);
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
  const [state, setState] = useState<PlaybackState>({
    manifest: null,
    activeItem: null,
    index: 0,
    status: "loading",
    playerStatus: null,
  });

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const [playerStatus, manifest] = await Promise.all([
          loadPlayerStatus(),
          loadManifest(),
        ]);

        if (cancelled) {
          return;
        }

        if (!playerStatus.claimed && !manifest) {
          setState((current) => ({
            ...current,
            manifest: null,
            activeItem: null,
            playerStatus,
            status: "unclaimed",
          }));
          return;
        }

        if (!manifest) {
          setState((current) => ({
            ...current,
            playerStatus,
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
  }, []);

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
          muted={state.manifest.volume === 0}
          onEnded={() =>
            setState((current) => ({
              ...current,
              index: (current.index + 1) % Math.max(playlist.length, 1),
            }))
          }
          playsInline
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
