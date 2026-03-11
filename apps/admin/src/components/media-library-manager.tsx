"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MediaAsset } from "@showroom/contracts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

async function sha256(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const hex = Array.from(new Uint8Array(digest), (entry) =>
    entry.toString(16).padStart(2, "0"),
  ).join("");
  return `sha256:${hex}`;
}

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
  return `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;
}

export function MediaLibraryManager({ initialAssets }: { initialAssets: MediaAsset[] }) {
  const router = useRouter();
  const [assets, setAssets] = useState(initialAssets);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload() {
    if (!file) {
      setStatus({ ok: false, text: "Choose a file to upload." });
      return;
    }

    setUploading(true);
    setStatus({ ok: true, text: "Preparing upload…" });

    try {
      const uploadDraftResponse = await fetch("/api/media/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          bytes: file.size,
        }),
      });

      const uploadDraftPayload = await uploadDraftResponse.json();
      if (!uploadDraftResponse.ok) {
        throw new Error(uploadDraftPayload.error ?? "Unable to prepare upload");
      }

      const uploadDraft = uploadDraftPayload.upload as {
        uploadUrl: string;
        storagePath: string;
      };

      setStatus({ ok: true, text: "Uploading file…" });
      const uploadResponse = await fetch(uploadDraft.uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Convex storage upload failed");
      }

      const { storageId } = (await uploadResponse.json()) as { storageId: string };
      const [checksum, metadata] = await Promise.all([
        sha256(file),
        getMediaMetadata(file),
      ]);

      setStatus({ ok: true, text: "Finalizing asset…" });
      const finalizeResponse = await fetch("/api/media/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || file.name.replace(/\.[^.]+$/, ""),
          fileName: file.name,
          mimeType: file.type,
          bytes: file.size,
          storageId,
          storagePath: uploadDraft.storagePath,
          checksum,
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
      setFile(null);
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
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="grid gap-4 md:grid-cols-[1.2fr_1fr_1fr_auto]">
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.8rem] text-muted-foreground">File</label>
            <Input
              accept="image/jpeg,image/png,image/webp,video/mp4"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              type="file"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.8rem] text-muted-foreground">Title</label>
            <Input
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Front-window spring reel"
              value={title}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.8rem] text-muted-foreground">Tags</label>
            <Input
              onChange={(event) => setTags(event.target.value)}
              placeholder="spring, hero, launch"
              value={tags}
            />
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={uploading || !file}
              onClick={() => void handleUpload()}
              type="button"
            >
              {uploading ? "Uploading…" : "Upload asset"}
            </Button>
          </div>
        </div>
        {status ? (
          <p className={cn("mt-3 text-[0.8rem] font-mono", status.ok ? "text-primary" : "text-destructive")}>
            {status.text}
          </p>
        ) : null}
      </section>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {assets.map((asset) => (
          <article key={asset.id} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
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
                <span>{asset.mimeType}</span>
                <span>{prettyBytes(asset.sizeBytes)}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
