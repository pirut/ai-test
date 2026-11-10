import { MediaLibraryManager } from "@/components/media-library-manager";
import { getAuthSession, requireOrgId } from "@/lib/auth";
import { listMediaAssets, listMediaFolders, listPlaylists } from "@/lib/backend";

export default async function MediaPage() {
  await requireOrgId();
  const [media, folders, session, playlists] = await Promise.all([
    listMediaAssets(),
    listMediaFolders(),
    getAuthSession(),
    // Only used to point at the next step; the library works without it.
    listPlaylists().catch(() => null),
  ]);

  return (
    <MediaLibraryManager
      canEdit={session.has({ role: "org:admin" })}
      hasPlaylists={playlists ? playlists.length > 0 : true}
      initialAssets={media}
      initialFolders={folders}
    />
  );
}
