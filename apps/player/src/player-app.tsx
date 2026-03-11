import { useEffect, useState } from "react";
import {
  type DeviceManifest,
  type ManifestPlaylistItem,
  deviceManifestSchema,
  mockManifest,
} from "@showroom/contracts";

type PlaybackState = {
  manifest: DeviceManifest;
  activeItem: ManifestPlaylistItem | null;
  index: number;
  status: "loading" | "ready" | "offline";
};

async function loadManifest() {
  const response = await fetch("/local/manifest");
  if (!response.ok) {
    throw new Error("Unable to load manifest");
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
    manifest: mockManifest,
    activeItem: mockManifest.defaultPlaylist[0] ?? null,
    index: 0,
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const manifest = await loadManifest();
        if (cancelled) {
          return;
        }

        const playlist = chooseSchedule(manifest);
        setState({
          manifest,
          activeItem: playlist[0] ?? null,
          index: 0,
          status: "ready",
        });
      } catch {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            status: "offline",
          }));
        }
      }
    };

    void refresh();
    const interval = window.setInterval(refresh, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const playlist = chooseSchedule(state.manifest);
    if (!playlist.length) {
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

  const playlist = chooseSchedule(state.manifest);

  return (
    <main className="playerRoot" style={{ rotate: `${state.manifest.orientation}deg` }}>
      <div className="playerOverlay">
        <span>{state.status === "ready" ? "LIVE MANIFEST" : "OFFLINE CACHE"}</span>
        <span>{state.manifest.manifestVersion}</span>
      </div>
      {state.activeItem ? (
        state.activeItem.assetType === "video" ? (
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
        )
      ) : (
        <section className="fallbackScreen">
          <p className="label">No content assigned</p>
          <h1>Waiting for first manifest</h1>
          <p>Claim this screen in the admin dashboard to start playback.</p>
        </section>
      )}
    </main>
  );
}

