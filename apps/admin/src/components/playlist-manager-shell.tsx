import type { LibraryFolder, MediaAsset, Playlist } from "@showroom/contracts";

import { PlaylistManager } from "@/components/playlist-manager";

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
