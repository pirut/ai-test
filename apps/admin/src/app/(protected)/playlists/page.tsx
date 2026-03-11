import { PlaylistManager } from "@/components/playlist-manager";
import { PageHeader } from "@/components/page-header";
import { requireOrgId } from "@/lib/auth";
import { listMediaAssets, listPlaylists } from "@/lib/backend";

export default async function PlaylistsPage() {
  await requireOrgId();
  const [playlists, mediaAssets] = await Promise.all([
    listPlaylists(),
    listMediaAssets(),
  ]);

  return (
    <>
      <PageHeader
        title="Playlists"
        description="Ordered media sequences assigned to screens."
      />
      <div className="p-8">
        <PlaylistManager initialPlaylists={playlists} mediaAssets={mediaAssets} />
      </div>
    </>
  );
}
