import { requireOrgId } from "@/lib/auth";
import { listMediaAssets } from "@/lib/backend";
import { Card, CardContent } from "@/components/ui/card";

export default async function MediaPage() {
  await requireOrgId();
  const media = await listMediaAssets();

  return (
    <div className="flex flex-col gap-8">
      <header className="border-b border-border pb-6">
        <p className="mb-1 flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-brand">
          <span className="inline-block h-px w-4 bg-brand opacity-70" />
          Library
        </p>
        <h1 className="text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold tracking-tight leading-tight">
          Media assets
        </h1>
        <p className="mt-1 text-[0.9rem] text-muted-foreground">
          Validate upload formats up front so the Pi never has to guess what it can play.
        </p>
      </header>

      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
        {media.map((asset) => (
          <Card key={asset.id} className="overflow-hidden gap-0 py-0">
            <div className="aspect-[16/10] bg-muted overflow-hidden">
              <img alt={asset.title} src={asset.previewUrl} className="h-full w-full object-cover" />
            </div>
            <CardContent className="py-3">
              <p className="text-[0.9rem] font-semibold text-card-foreground">{asset.title}</p>
              <p className="text-[0.78rem] text-muted-foreground mt-0.5">{asset.fileName}</p>
              <div className="mt-2 flex items-center justify-between font-mono text-[0.75rem] text-muted-foreground">
                <span>{asset.mimeType}</span>
                <span>{Math.round(asset.sizeBytes / 1024 / 1024)} MB</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
