import { MediaLibraryManager } from "@/components/media-library-manager";
import { PageHeader } from "@/components/page-header";
import { requireOrgId } from "@/lib/auth";
import { listMediaAssets } from "@/lib/backend";

export default async function MediaPage() {
  await requireOrgId();
  const media = await listMediaAssets();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Media library"
        description={`${media.length} asset${media.length !== 1 ? "s" : ""} available for playlists and scheduled playback.`}
      />
      <MediaLibraryManager initialAssets={media} />
    </div>
  );
}
