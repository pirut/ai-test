import { MediaLibraryManager } from "@/components/media-library-manager";
import { PageHeader } from "@/components/page-header";
import { requireOrgId } from "@/lib/auth";
import { listMediaAssets, listMediaFolders } from "@/lib/backend";

export default async function MediaPage() {
  await requireOrgId();
  const [media, folders] = await Promise.all([listMediaAssets(), listMediaFolders()]);

  return (
    <div className="space-y-8">
      <PageHeader title="Media library" />
      <MediaLibraryManager initialAssets={media} initialFolders={folders} />
    </div>
  );
}
