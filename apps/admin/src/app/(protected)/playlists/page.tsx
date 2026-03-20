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
    <div className="space-y-8">
      <PageHeader title="Playlists" />
      <PlaylistManagerShell
        initialMediaFolders={mediaFolders}
        initialPlaylistFolders={playlistFolders}
        initialPlaylists={playlists}
        mediaAssets={mediaAssets}
      />
    </div>
  );
}
