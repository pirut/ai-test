"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MediaAsset } from "@showroom/contracts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { UploadDropzone } from "@/lib/uploadthing";

async function getMediaMetadata(file: File) {
  if (file.type.startsWith("image/")) {
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const nextImage = new Image();
        nextImage.onload = () => resolve(nextImage);
        nextImage.onerror = () => reject(new Error("Unable to read image metadata"));
        nextImage.src = url;
      });
      return { width: image.naturalWidth, height: image.naturalHeight };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  if (file.type.startsWith("video/")) {
    const url = URL.createObjectURL(file);
    try {
      const video = await new Promise<HTMLVideoElement>((resolve, reject) => {
        const nextVideo = document.createElement("video");
        nextVideo.preload = "metadata";
        nextVideo.onloadedmetadata = () => resolve(nextVideo);
        nextVideo.onerror = () => reject(new Error("Unable to read video metadata"));
        nextVideo.src = url;
      });
      return {
        width: video.videoWidth,
        height: video.videoHeight,
        durationSeconds: Math.ceil(video.duration),
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return {};
}

function prettyBytes(bytes: number) {
  if (bytes <= 0) {
    return "remote";
  }
  return `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;
}

type UploadedFile = {
  fileHash: string | null;
  key: string;
  name: string;
  size: number;
  type: string;
  ufsUrl: string;
};

export function MediaLibraryManager({ initialAssets }: { initialAssets: MediaAsset[] }) {
  const router = useRouter();
  const [assets, setAssets] = useState(initialAssets);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [queuedFile, setQueuedFile] = useState<File | null>(null);
  const [youtubeUrl, setYouTubeUrl] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isImportingYouTube, setIsImportingYouTube] = useState(false);

  async function finalizeUpload(uploaded: UploadedFile) {
    try {
      setIsFinalizing(true);
      setStatus({ ok: true, text: "Finalizing asset…" });
      const metadata = queuedFile ? await getMediaMetadata(queuedFile) : {};
      const finalizeResponse = await fetch("/api/media/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || uploaded.name.replace(/\.[^.]+$/, ""),
          fileName: uploaded.name,
          mimeType: uploaded.type,
          bytes: uploaded.size,
          storagePath: uploaded.key,
          previewUrl: uploaded.ufsUrl,
          checksum: `ut:${uploaded.fileHash ?? uploaded.key}`,
          tags: tags
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
          ...metadata,
        }),
      });

      const finalizePayload = await finalizeResponse.json();
      if (!finalizeResponse.ok) {
        throw new Error(finalizePayload.error ?? "Unable to save media asset");
      }

      const nextAsset = finalizePayload.asset as MediaAsset;
      setAssets((current) => [nextAsset, ...current]);
      setQueuedFile(null);
      setTitle("");
      setTags("");
      setStatus({ ok: true, text: `Uploaded ${nextAsset.title}` });
      router.refresh();
    } catch (error) {
      setStatus({
        ok: false,
        text: error instanceof Error ? error.message : "Upload failed",
      });
    } finally {
      setIsFinalizing(false);
    }
  }

  async function importYouTubeVideo() {
    try {
      setIsImportingYouTube(true);
      setStatus({ ok: true, text: "Registering YouTube source…" });
      const response = await fetch("/api/media/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: youtubeUrl.trim(),
          title: title.trim() || undefined,
          tags: tags
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to import YouTube video");
      }

      const nextAsset = payload.asset as MediaAsset;
      setAssets((current) => [nextAsset, ...current]);
      setYouTubeUrl("");
      setTitle("");
      setTags("");
      setStatus({
        ok: true,
        text: `Imported ${nextAsset.title}. Devices will cache the video locally on next sync.`,
      });
      router.refresh();
    } catch (error) {
      setStatus({
        ok: false,
        text: error instanceof Error ? error.message : "YouTube import failed",
      });
    } finally {
      setIsImportingYouTube(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 xl:grid-cols-[1.15fr_420px]">
        <Card className="border border-border/70 bg-card/95">
          <CardHeader className="border-b border-border/60">
            <CardTitle className="text-[0.92rem] font-semibold">Media ingest</CardTitle>
            <p className="text-[0.78rem] text-muted-foreground">
              Use UploadThing&apos;s dropzone for approved files. Title and tags apply to the next asset you drop.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 pt-5 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[0.8rem] text-muted-foreground" htmlFor="media-title">
                Title
              </Label>
              <Input
                id="media-title"
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Front-window spring reel"
                value={title}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[0.8rem] text-muted-foreground" htmlFor="media-tags">
                Tags
              </Label>
              <Input
                id="media-tags"
                onChange={(event) => setTags(event.target.value)}
                placeholder="spring, hero, launch"
                value={tags}
              />
            </div>
            <div className="md:col-span-2">
              <UploadDropzone
                config={{
                  mode: "auto",
                }}
                appearance={{
                  allowedContent: "text-[0.72rem] font-mono text-muted-foreground",
                  button:
                    "mt-3 h-8 rounded-lg border border-primary/40 bg-primary px-3 text-[0.78rem] font-medium text-primary-foreground hover:bg-primary/90 ut-uploading:cursor-wait ut-readying:opacity-70",
                  container:
                    "rounded-xl border border-dashed border-border bg-gradient-to-br from-card via-card to-muted/35 px-5 py-8 text-card-foreground transition-colors ut-ready:border-primary/30 ut-ready:hover:border-primary/50 ut-ready:hover:bg-primary/5 ut-uploading:border-primary/50",
                  label: "text-sm font-medium tracking-[-0.01em] text-foreground",
                  uploadIcon: "text-primary",
                }}
                content={{
                  allowedContent() {
                    return "JPG, PNG, WEBP, MP4 • Max 256 MB";
                  },
                  button({ isUploading }) {
                    return isUploading ? "Uploading…" : "Choose or drop file";
                  },
                  label({ isDragActive, ready }) {
                    if (!ready) return "Preparing ingest node…";
                    return isDragActive ? "Release to ingest this file" : "Drop showroom media here";
                  },
                }}
                endpoint="mediaUploader"
                input={{
                  tags: tags
                    .split(",")
                    .map((entry) => entry.trim())
                    .filter(Boolean),
                  title: title.trim() || queuedFile?.name.replace(/\.[^.]+$/, "") || undefined,
                }}
                onChange={(files) => {
                  const nextFile = files[0] ?? null;
                  setQueuedFile(nextFile);
                  if (nextFile) {
                    setStatus({ ok: true, text: `Preparing ${nextFile.name}…` });
                  }
                }}
                onClientUploadComplete={(result) => {
                  const uploaded = result[0];
                  if (!uploaded) {
                    setStatus({ ok: false, text: "Upload completed without a returned file." });
                    return;
                  }
                  void finalizeUpload(uploaded);
                }}
                onUploadBegin={(fileName) => {
                  setStatus({ ok: true, text: `Uploading ${fileName}…` });
                }}
                onUploadError={(error) => {
                  setStatus({ ok: false, text: error.message });
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/70 bg-card/95">
          <CardHeader className="border-b border-border/60">
            <CardTitle className="text-[0.92rem] font-semibold">Upload state</CardTitle>
            <p className="text-[0.78rem] text-muted-foreground">
              A live readout for the next media ingest and metadata finalization step.
            </p>
          </CardHeader>
          <CardContent className="flex h-full flex-col gap-4 pt-5">
            <div className="rounded-xl border border-border/70 bg-muted/25 p-4">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-primary">
                Pending file
              </p>
              {queuedFile ? (
                <div className="mt-3 flex flex-col gap-2">
                  <p className="truncate text-sm font-medium text-foreground">{queuedFile.name}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{queuedFile.type || "unknown type"}</Badge>
                    <Badge variant="outline">{prettyBytes(queuedFile.size)}</Badge>
                    <Badge variant="outline">
                      {queuedFile.type.startsWith("video/") ? "video" : "image"}
                    </Badge>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-[0.82rem] text-muted-foreground">
                  No file selected. Drop a file onto the UploadThing dropzone to stage the next asset.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/25 p-4">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-primary">
                Pipeline status
              </p>
              <p
                className={cn(
                  "mt-3 min-h-10 text-[0.8rem] font-mono",
                  status ? (status.ok ? "text-primary" : "text-destructive") : "text-muted-foreground",
                )}
              >
                {status?.text ?? "Idle"}
              </p>
              {isFinalizing ? (
                <p className="mt-2 text-[0.75rem] text-muted-foreground">
                  Persisting metadata and folding the asset into the remote manifest store…
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="border border-border/70 bg-card/95">
        <CardHeader className="border-b border-border/60">
          <CardTitle className="text-[0.92rem] font-semibold">YouTube import</CardTitle>
          <p className="text-[0.78rem] text-muted-foreground">
            Save a YouTube video as a library asset. Devices will resolve the best compatible
            stream during sync, convert it to a local MP4, and play from cache.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 pt-5 md:grid-cols-[1.4fr_1fr_auto]">
          <div className="flex flex-col gap-1.5 md:col-span-3">
            <Label className="text-[0.8rem] text-muted-foreground" htmlFor="youtube-url">
              YouTube URL
            </Label>
            <Input
              id="youtube-url"
              onChange={(event) => setYouTubeUrl(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrl}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[0.8rem] text-muted-foreground" htmlFor="youtube-title">
              Override title
            </Label>
            <Input
              id="youtube-title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Optional"
              value={title}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[0.8rem] text-muted-foreground" htmlFor="youtube-tags">
              Tags
            </Label>
            <Input
              id="youtube-tags"
              onChange={(event) => setTags(event.target.value)}
              placeholder="youtube, campaign"
              value={tags}
            />
          </div>
          <div className="flex items-end">
            <Button
              disabled={!youtubeUrl.trim() || isImportingYouTube || isFinalizing}
              onClick={() => {
                void importYouTubeVideo();
              }}
            >
              {isImportingYouTube ? "Importing…" : "Import video"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {assets.map((asset) => (
          <article
            key={asset.id}
            className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
          >
            <div className="aspect-[16/10] overflow-hidden bg-muted">
              {asset.type === "video" ? (
                <video className="h-full w-full object-cover" muted src={asset.previewUrl} />
              ) : (
                <img alt={asset.title} className="h-full w-full object-cover" src={asset.previewUrl} />
              )}
            </div>
            <div className="flex flex-col gap-1 p-3">
              <p className="truncate text-[0.85rem] font-medium text-card-foreground">{asset.title}</p>
              <p className="truncate text-[0.75rem] text-muted-foreground">{asset.fileName}</p>
              <div className="flex items-center justify-between pt-1 text-[0.72rem] font-mono text-muted-foreground">
                <span>{asset.sourceType === "youtube" ? "youtube" : asset.mimeType}</span>
                <span>{prettyBytes(asset.sizeBytes)}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
