import { PageHeader } from "@/components/page-header";
import { PlaylistManagerShell } from "@/components/playlist-manager-shell";
import { ViewOnlyNotice } from "@/components/view-only-notice";
import { getAuthSession, requireOrgId } from "@/lib/auth";
import {
  listMediaAssets,
  listMediaFolders,
  listPlaylistFolders,
  listPlaylists,
} from "@/lib/backend";

export default async function PlaylistsPage() {
  await requireOrgId();
  const [playlists, mediaAssets, playlistFolders, mediaFolders, session] = await Promise.all([
    listPlaylists(),
    listMediaAssets(),
    listPlaylistFolders(),
    listMediaFolders(),
    getAuthSession(),
  ]);
  const canEdit = session.has({ role: "org:admin" });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Playlists"
        description="Put media in order and choose how long each item shows. Screens play their default playlist unless a schedule says otherwise."
      />
      {canEdit ? null : <ViewOnlyNotice what="playlists" />}
      <PlaylistManagerShell
        canEdit={canEdit}
        initialMediaFolders={mediaFolders}
        initialPlaylistFolders={playlistFolders}
        initialPlaylists={playlists}
        mediaAssets={mediaAssets}
      />
    </div>
  );
}
