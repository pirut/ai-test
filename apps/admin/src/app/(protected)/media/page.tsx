import { requireOrgId } from "@/lib/auth";
import { listMediaAssets } from "@/lib/backend";

export default async function MediaPage() {
  await requireOrgId();
  const media = await listMediaAssets();

  return (
    <div>
      <header className="workspaceHeader">
        <div>
          <p className="eyebrow">Library</p>
          <h1>Media assets</h1>
          <p>
            Validate upload formats up front so the Pi never has to guess what
            it can play.
          </p>
        </div>
      </header>
      <div className="mediaGrid">
        {media.map((asset) => (
          <article className="mediaCard" key={asset.id}>
            <div className="mediaPreview">
              <img alt={asset.title} src={asset.previewUrl} />
            </div>
            <div>
              <strong>{asset.title}</strong>
              <p>{asset.fileName}</p>
            </div>
            <div className="screenMetaRow">
              <span>{asset.mimeType}</span>
              <span>{Math.round(asset.sizeBytes / 1024 / 1024)} MB</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
