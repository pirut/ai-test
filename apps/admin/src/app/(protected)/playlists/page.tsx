import { PageHeader } from "@/components/page-header";
import { PlaylistManagerShell } from "@/components/playlist-manager-shell";
import { requireOrgId } from "@/lib/auth";
import { listMediaAssets, listPlaylists } from "@/lib/backend";

export default async function PlaylistsPage() {
  await requireOrgId();
  const [playlists, mediaAssets] = await Promise.all([
    listPlaylists(),
    listMediaAssets(),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Playlists"
        description="Assemble ordered playback sequences and designate fallback loops."
      />
      <PlaylistManagerShell initialPlaylists={playlists} mediaAssets={mediaAssets} />
    </div>
  );
}
