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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {media.map((asset) => (
            <article key={asset.id} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
              <div className="aspect-[16/10] overflow-hidden bg-muted">
                <img alt={asset.title} src={asset.previewUrl} className="h-full w-full object-cover" />
              </div>
              <div className="flex flex-col gap-1 p-3">
                <p className="text-[0.85rem] font-medium text-card-foreground truncate">{asset.title}</p>
                <p className="text-[0.75rem] text-muted-foreground truncate">{asset.fileName}</p>
                <div className="flex items-center justify-between pt-1 text-[0.72rem] font-mono text-muted-foreground">
                  <span>{asset.mimeType}</span>
                  <span>{Math.round(asset.sizeBytes / 1024 / 1024)} MB</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
