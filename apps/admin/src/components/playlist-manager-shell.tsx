"use client";

import dynamic from "next/dynamic";
import type { MediaAsset, Playlist } from "@showroom/contracts";

const PlaylistManager = dynamic(
  () => import("@/components/playlist-manager").then((module) => module.PlaylistManager),
  {
    loading: () => (
      <div className="rounded-xl border border-border/70 bg-card/95 px-6 py-8 text-sm text-muted-foreground">
        Loading playlists...
      </div>
    ),
    ssr: false,
  },
);

export function PlaylistManagerShell({
  initialPlaylists,
  mediaAssets,
}: {
  initialPlaylists: Playlist[];
  mediaAssets: MediaAsset[];
}) {
  return <PlaylistManager initialPlaylists={initialPlaylists} mediaAssets={mediaAssets} />;
}
