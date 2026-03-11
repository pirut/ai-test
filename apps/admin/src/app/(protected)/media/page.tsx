import { MediaLibraryManager } from "@/components/media-library-manager";
import { PageHeader } from "@/components/page-header";
import { requireOrgId } from "@/lib/auth";
import { listMediaAssets } from "@/lib/backend";

export default async function MediaPage() {
  await requireOrgId();
  const media = await listMediaAssets();

  return (
    <>
      <PageHeader
        title="Media"
        description={`${media.length} asset${media.length !== 1 ? "s" : ""} in library`}
      />
      <div className="p-8">
        <MediaLibraryManager initialAssets={media} />
      </div>
    </>
  );
}
