import { MediaLibraryManager } from "@/components/media-library-manager";
import { PageHeader } from "@/components/page-header";
import { requireOrgId } from "@/lib/auth";
import { listMediaAssets, listMediaFolders } from "@/lib/backend";

export default async function MediaPage() {
  await requireOrgId();
  const [media, folders] = await Promise.all([listMediaAssets(), listMediaFolders()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Media library"
        description="Images, videos and YouTube links your playlists draw from. Screens download what they need and keep playing it offline."
      />
      <MediaLibraryManager initialAssets={media} initialFolders={folders} />
    </div>
  );
}
