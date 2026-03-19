"use client";

import dynamic from "next/dynamic";
import type { LibraryFolder, MediaAsset, Playlist } from "@showroom/contracts";

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
  initialPlaylistFolders,
  initialMediaFolders,
}: {
  initialPlaylists: Playlist[];
  mediaAssets: MediaAsset[];
  initialPlaylistFolders: LibraryFolder[];
  initialMediaFolders: LibraryFolder[];
}) {
  return (
    <PlaylistManager
      initialMediaFolders={initialMediaFolders}
      initialPlaylistFolders={initialPlaylistFolders}
      initialPlaylists={initialPlaylists}
      mediaAssets={mediaAssets}
    />
  );
}
