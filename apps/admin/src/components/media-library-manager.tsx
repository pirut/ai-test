"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}:${String(s).padStart(2, "0")}`;
  return `0:${String(s).padStart(2, "0")}`;
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

  // Upload section state (separate from YouTube)
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // YouTube section state (independent)
  const [youtubeUrl, setYouTubeUrl] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [youtubeTags, setYoutubeTags] = useState("");
  const [isImportingYouTube, setIsImportingYouTube] = useState(false);
  const [youtubeStatus, setYoutubeStatus] = useState<{ ok: boolean; text: string } | null>(null);

  // Per-asset inline edit state
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTags, setEditTags] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = setTimeout(() => setConfirmDeleteId(null), 3000);
    return () => clearTimeout(timer);
  }, [confirmDeleteId]);

  async function finalizeUpload(uploaded: UploadedFile, sourceFile?: File) {
    try {
      setIsFinalizing(true);
      setStatus({ ok: true, text: `Finalizing "${uploaded.name}"…` });
      const metadata = sourceFile ? await getMediaMetadata(sourceFile) : {};
      const finalizeResponse = await fetch("/api/media/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: uploadTitle.trim() || uploaded.name.replace(/\.[^.]+$/, ""),
          fileName: uploaded.name,
          mimeType: uploaded.type,
          bytes: uploaded.size,
          storagePath: uploaded.key,
          previewUrl: uploaded.ufsUrl,
          checksum: `ut:${uploaded.fileHash ?? uploaded.key}`,
          tags: uploadTags
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
      return nextAsset;
    } catch (error) {
      setStatus({
        ok: false,
        text: error instanceof Error ? error.message : "Upload failed",
      });
      return null;
    }
  }

  async function importYouTubeVideo() {
    try {
      setIsImportingYouTube(true);
      setYoutubeStatus({ ok: true, text: "Registering YouTube source…" });
      const response = await fetch("/api/media/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: youtubeUrl.trim(),
          title: youtubeTitle.trim() || undefined,
          tags: youtubeTags
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
      setYoutubeTitle("");
      setYoutubeTags("");
      setYoutubeStatus({
        ok: true,
        text: `Imported "${nextAsset.title}". Devices will cache on next sync.`,
      });
      router.refresh();
    } catch (error) {
      setYoutubeStatus({
        ok: false,
        text: error instanceof Error ? error.message : "YouTube import failed",
      });
    } finally {
      setIsImportingYouTube(false);
    }
  }

  function startEditingAsset(asset: MediaAsset) {
    setEditingAssetId(asset.id);
    setEditTitle(asset.title);
    setEditTags(asset.tags.join(", "));
    setConfirmDeleteId(null);
  }

  function cancelEditingAsset() {
    setEditingAssetId(null);
    setEditTitle("");
    setEditTags("");
  }

  async function saveAssetEdit(assetId: string) {
    if (!editTitle.trim()) return;
    setIsSavingEdit(true);
    try {
      const response = await fetch(`/api/media/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          tags: editTags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update asset");
      }

      const updatedAsset = payload.asset as MediaAsset;
      setAssets((current) => current.map((a) => (a.id === assetId ? updatedAsset : a)));
      cancelEditingAsset();
      router.refresh();
    } catch (error) {
      setStatus({
        ok: false,
        text: error instanceof Error ? error.message : "Unable to update asset",
      });
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function deleteAsset(assetId: string) {
    if (confirmDeleteId !== assetId) {
      setConfirmDeleteId(assetId);
      return;
    }

    setIsDeleting(true);
    setConfirmDeleteId(null);
    try {
      const response = await fetch(`/api/media/${assetId}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? "Unable to delete asset");
      }

      setAssets((current) => current.filter((a) => a.id !== assetId));
      if (editingAssetId === assetId) cancelEditingAsset();
      router.refresh();
    } catch (error) {
      setStatus({
        ok: false,
        text: error instanceof Error ? error.message : "Unable to delete asset",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Upload section */}
      <Card className="border border-border/70 bg-card/95">
        <CardHeader className="border-b border-border/60">
          <CardTitle className="text-[0.92rem] font-semibold">Upload media</CardTitle>
          <p className="text-[0.78rem] text-muted-foreground">
            Drop files onto the zone below. You can upload multiple files at once.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 pt-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[0.8rem] text-muted-foreground" htmlFor="upload-title">
                Title (optional)
              </Label>
              <Input
                id="upload-title"
                onChange={(event) => setUploadTitle(event.target.value)}
                placeholder="Auto-detected from filename"
                value={uploadTitle}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[0.8rem] text-muted-foreground" htmlFor="upload-tags">
                Tags
              </Label>
              <Input
                id="upload-tags"
                onChange={(event) => setUploadTags(event.target.value)}
                placeholder="spring, hero, launch"
                value={uploadTags}
              />
            </div>
          </div>
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
                return "JPG, PNG, WEBP, MP4 · Max 256 MB per file";
              },
              button({ isUploading }) {
                return isUploading ? "Uploading…" : "Choose or drop files";
              },
              label({ isDragActive, ready }) {
                if (!ready) return "Preparing upload…";
                return isDragActive ? "Release to upload" : "Drop media files here";
              },
            }}
            endpoint="mediaUploader"
            input={{
              tags: uploadTags
                .split(",")
                .map((entry) => entry.trim())
                .filter(Boolean),
              title: uploadTitle.trim() || queuedFiles[0]?.name.replace(/\.[^.]+$/, "") || undefined,
            }}
            onChange={(files) => {
              setQueuedFiles(files);
              if (files.length > 0) {
                setUploadProgress(`Selected ${files.length} file${files.length !== 1 ? "s" : ""}`);
                setStatus({ ok: true, text: `Preparing ${files.length} file${files.length !== 1 ? "s" : ""}…` });
              }
            }}
            onClientUploadComplete={async (result) => {
              if (!result.length) {
                setStatus({ ok: false, text: "Upload completed without any returned files." });
                return;
              }

              setIsFinalizing(true);
              let successCount = 0;
              for (const uploaded of result) {
                const sourceFile = queuedFiles.find((f) => f.name === uploaded.name);
                const asset = await finalizeUpload(uploaded, sourceFile);
                if (asset) successCount++;
              }
              setQueuedFiles([]);
              setUploadProgress(null);
              setIsFinalizing(false);
              if (successCount > 0) {
                setUploadTitle("");
                setUploadTags("");
                setStatus({
                  ok: true,
                  text: `Uploaded ${successCount} file${successCount !== 1 ? "s" : ""} successfully`,
                });
                router.refresh();
              }
            }}
            onUploadBegin={(fileName) => {
              setStatus({ ok: true, text: `Uploading ${fileName}…` });
            }}
            onUploadError={(error) => {
              setStatus({ ok: false, text: error.message });
            }}
          />
          {(status || uploadProgress) ? (
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
              <p
                className={cn(
                  "text-[0.78rem] font-mono",
                  status ? (status.ok ? "text-primary" : "text-destructive") : "text-muted-foreground",
                )}
              >
                {status?.text ?? uploadProgress ?? "Idle"}
              </p>
              {isFinalizing ? (
                <p className="mt-1 text-[0.72rem] text-muted-foreground">
                  Persisting metadata…
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* YouTube import - completely separate */}
      <Card className="border border-border/70 bg-card/95">
        <CardHeader className="border-b border-border/60">
          <CardTitle className="text-[0.92rem] font-semibold">YouTube import</CardTitle>
          <p className="text-[0.78rem] text-muted-foreground">
            Save a YouTube video as a library asset. Devices resolve and cache the stream locally on sync.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-5">
          <div className="flex flex-col gap-1.5">
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
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[0.8rem] text-muted-foreground" htmlFor="yt-title">
                Override title
              </Label>
              <Input
                id="yt-title"
                onChange={(event) => setYoutubeTitle(event.target.value)}
                placeholder="Optional"
                value={youtubeTitle}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[0.8rem] text-muted-foreground" htmlFor="yt-tags">
                Tags
              </Label>
              <Input
                id="yt-tags"
                onChange={(event) => setYoutubeTags(event.target.value)}
                placeholder="youtube, campaign"
                value={youtubeTags}
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
          </div>
          {youtubeStatus ? (
            <p
              className={cn(
                "text-[0.78rem] font-mono",
                youtubeStatus.ok ? "text-primary" : "text-destructive",
              )}
            >
              {youtubeStatus.text}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Asset grid */}
      {assets.length > 0 ? (
        <section>
          <h2 className="mb-3 text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Library · {assets.length} asset{assets.length !== 1 ? "s" : ""}
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {assets.map((asset) => {
              const isEditing = editingAssetId === asset.id;
              return (
                <article
                  key={asset.id}
                  className={cn(
                    "flex flex-col overflow-hidden rounded-xl border bg-card transition-colors",
                    isEditing ? "border-primary/50" : "border-border",
                  )}
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                    {asset.type === "video" && asset.sourceType !== "youtube" && asset.mimeType.startsWith("video/") ? (
                      <video
                        className="h-full w-full object-cover"
                        muted
                        preload="metadata"
                        src={`${asset.previewUrl}#t=0.5`}
                      />
                    ) : (
                      <img
                        alt={asset.title}
                        className="h-full w-full object-cover"
                        src={asset.previewUrl}
                      />
                    )}
                    {/* Type + duration overlay */}
                    <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1">
                      {asset.type === "video" && asset.durationSeconds ? (
                        <span className="rounded bg-black/70 px-1.5 py-0.5 text-[0.65rem] font-mono text-white">
                          {formatDuration(Math.ceil(asset.durationSeconds))}
                        </span>
                      ) : null}
                      <span className="rounded bg-black/70 px-1.5 py-0.5 text-[0.65rem] font-mono uppercase text-white">
                        {asset.sourceType === "youtube" ? "yt" : asset.type}
                      </span>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="flex flex-col gap-2 p-3">
                      <Input
                        autoFocus
                        className="h-7 text-[0.82rem]"
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && editTitle.trim()) void saveAssetEdit(asset.id);
                          if (e.key === "Escape") cancelEditingAsset();
                        }}
                        placeholder="Title"
                        value={editTitle}
                      />
                      <Input
                        className="h-7 text-[0.78rem]"
                        onChange={(e) => setEditTags(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && editTitle.trim()) void saveAssetEdit(asset.id);
                          if (e.key === "Escape") cancelEditingAsset();
                        }}
                        placeholder="Tags (comma separated)"
                        value={editTags}
                      />
                      <div className="flex gap-1.5">
                        <Button
                          className="flex-1"
                          disabled={isSavingEdit || !editTitle.trim()}
                          onClick={() => void saveAssetEdit(asset.id)}
                          size="sm"
                          type="button"
                        >
                          {isSavingEdit ? "Saving…" : "Save"}
                        </Button>
                        <Button
                          onClick={cancelEditingAsset}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 p-3">
                      <p className="truncate text-[0.85rem] font-medium text-card-foreground">
                        {asset.title}
                      </p>
                      <p className="truncate text-[0.72rem] text-muted-foreground">
                        {asset.fileName} · {prettyBytes(asset.sizeBytes)}
                      </p>
                      {asset.tags.length > 0 ? (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {asset.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[0.65rem] px-1.5 py-0">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-1.5 flex items-center gap-1">
                        <Button
                          className="flex-1"
                          onClick={() => startEditingAsset(asset)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Rename
                        </Button>
                        <Button
                          className={cn(
                            "flex-1 text-[0.75rem]",
                            confirmDeleteId === asset.id
                              ? "border-destructive/30 text-destructive hover:bg-destructive/10"
                              : "",
                          )}
                          disabled={isDeleting}
                          onClick={() => void deleteAsset(asset.id)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          {confirmDeleteId === asset.id ? "Confirm?" : "Delete"}
                        </Button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="rounded-xl border border-dashed border-border/80 bg-muted/10 p-8 text-center">
          <p className="text-[0.85rem] text-muted-foreground">No assets yet. Upload or import a video above.</p>
        </div>
      )}
    </div>
  );
}
