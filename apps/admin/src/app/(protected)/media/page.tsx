import { MediaLibraryManager } from "@/components/media-library-manager";
import { requireOrgId } from "@/lib/auth";
import { listMediaAssets, listMediaFolders } from "@/lib/backend";

export default async function MediaPage() {
  await requireOrgId();
  const [media, folders] = await Promise.all([listMediaAssets(), listMediaFolders()]);

  return <MediaLibraryManager initialAssets={media} initialFolders={folders} />;
}
