import { PageHeader } from "@/components/page-header";
import { PlaylistManagerShell } from "@/components/playlist-manager-shell";
import { requireOrgId } from "@/lib/auth";
import {
  listMediaAssets,
  listMediaFolders,
  listPlaylistFolders,
  listPlaylists,
} from "@/lib/backend";

export default async function PlaylistsPage() {
  await requireOrgId();
  const [playlists, mediaAssets, playlistFolders, mediaFolders] = await Promise.all([
    listPlaylists(),
    listMediaAssets(),
    listPlaylistFolders(),
    listMediaFolders(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Playlists"
        description="Put media in order and choose how long each item shows. Screens play their default playlist unless a schedule says otherwise."
      />
      <PlaylistManagerShell
        initialMediaFolders={mediaFolders}
        initialPlaylistFolders={playlistFolders}
        initialPlaylists={playlists}
        mediaAssets={mediaAssets}
      />
    </div>
  );
}
