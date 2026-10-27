"use client";

import { useEffect, useState } from "react";
import { FileImage, FileVideo, Link2, Upload, X } from "lucide-react";
import type { MediaAsset } from "@showroom/contracts";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { parseTags, prettyBytes } from "@/lib/media-format";
import { cn } from "@/lib/utils";

export const acceptedUploadTypes = "image/jpeg,image/png,image/webp,video/mp4";

type UploadDraft = {
  assetId: string;
  expiresInSeconds: number;
  storagePath: string;
  uploadUrl: string;
};

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

async function sha256ForFile(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function uploadFile(uploadUrl: string, file: File, onProgress: (percent: number) => void) {
  return new Promise<{ storageId: string }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", uploadUrl);
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onerror = () => reject(new Error(`Network error while uploading ${file.name}`));
    request.onload = () => {
      let payload: { error?: string; storageId?: string } = {};
      try {
        payload = JSON.parse(request.responseText) as typeof payload;
      } catch {
        // The status handling below supplies a useful error for malformed responses.
      }
      if (request.status < 200 || request.status >= 300 || !payload.storageId) {
        reject(new Error(payload.error ?? `Unable to upload ${file.name}`));
        return;
      }
      resolve({ storageId: payload.storageId });
    };
    request.send(file);
  });
}

async function uploadOne(
  file: File,
  options: { title?: string; tags: string[]; folderId: string | null },
  onProgress: (percent: number) => void,
) {
  const checksum = await sha256ForFile(file);
  const draftResponse = await fetch("/api/media/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, mimeType: file.type, bytes: file.size }),
  });
  const draftPayload = (await draftResponse.json()) as { error?: string; upload?: UploadDraft };
  if (!draftResponse.ok || !draftPayload.upload) {
    throw new Error(draftPayload.error ?? `Unable to prepare ${file.name}`);
  }

  const stored = await uploadFile(draftPayload.upload.uploadUrl, file, onProgress);
  const metadata = await getMediaMetadata(file).catch(() => ({}));
  const finalizeResponse = await fetch("/api/media/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: options.title || file.name.replace(/\.[^.]+$/, ""),
      fileName: file.name,
      mimeType: file.type,
      bytes: file.size,
      storageId: stored.storageId,
      storagePath: draftPayload.upload.storagePath,
      previewUrl: draftPayload.upload.uploadUrl.startsWith("/")
        ? URL.createObjectURL(file)
        : `https://storage.invalid/${encodeURIComponent(stored.storageId)}`,
      checksum: `sha256:${checksum}`,
      tags: options.tags,
      folderId: options.folderId,
      ...metadata,
    }),
  });
  const finalizePayload = await finalizeResponse.json();
  if (!finalizeResponse.ok) {
    throw new Error(finalizePayload.error ?? `Unable to save ${file.name}`);
  }
  return finalizePayload.asset as MediaAsset;
}

type Mode = "upload" | "youtube";

export function MediaAddDialog({
  open,
  onOpenChange,
  folderId,
  folderName,
  initialFiles,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId: string | null;
  folderName: string;
  /** Files dropped onto the library before the dialog opened. */
  initialFiles: File[];
  onAdded: (assets: MediaAsset[], message: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ index: number; percent: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (open) {
      setFiles(initialFiles);
      if (initialFiles.length > 0) setMode("upload");
    }
  }, [initialFiles, open]);

  function reset() {
    setFiles([]);
    setTitle("");
    setTags("");
    setYoutubeUrl("");
    setProgress(null);
    setError(null);
  }

  function changeOpen(nextOpen: boolean) {
    if (busy) return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function addFiles(next: File[]) {
    const accepted = next.filter((file) => acceptedUploadTypes.split(",").includes(file.type));
    if (accepted.length < next.length) {
      setError("Some files were skipped. Use JPG, PNG, WEBP or MP4.");
    } else {
      setError(null);
    }
    setFiles((current) => [...current, ...accepted]);
  }

  async function upload() {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    const added: MediaAsset[] = [];
    try {
      for (const [index, file] of files.entries()) {
        setProgress({ index, percent: 0 });
        added.push(
          await uploadOne(
            file,
            { title: files.length === 1 ? title.trim() : undefined, tags: parseTags(tags), folderId },
            (percent) => setProgress({ index, percent }),
          ),
        );
      }
      onAdded(added, `Added ${added.length} file${added.length === 1 ? "" : "s"} to ${folderName}.`);
      reset();
      onOpenChange(false);
    } catch (caught) {
      if (added.length) onAdded(added, `Added ${added.length} of ${files.length} files.`);
      setFiles((current) => current.slice(added.length));
      setError(caught instanceof Error ? caught.message : "Upload failed");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function importYouTube() {
    if (!youtubeUrl.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/media/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: youtubeUrl.trim(),
          title: title.trim() || undefined,
          tags: parseTags(tags),
          folderId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to add YouTube video");
      const asset = payload.asset as MediaAsset;
      onAdded([asset], `Added “${asset.title}” to ${folderName}.`);
      reset();
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add YouTube video");
    } finally {
      setBusy(false);
    }
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add media</DialogTitle>
          <DialogDescription>
            Adding to <span className="font-medium text-foreground">{folderName}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-1 rounded-lg border p-0.5" role="tablist" aria-label="Source">
          {(
            [
              { value: "upload", label: "Upload files", icon: Upload },
              { value: "youtube", label: "YouTube link", icon: Link2 },
            ] as const
          ).map((option) => (
            <Button
              key={option.value}
              aria-selected={mode === option.value}
              disabled={busy}
              onClick={() => {
                setMode(option.value);
                setError(null);
              }}
              role="tab"
              size="sm"
              variant={mode === option.value ? "secondary" : "ghost"}
            >
              <option.icon />
              {option.label}
            </Button>
          ))}
        </div>

        {mode === "upload" ? (
          <FieldGroup className="gap-4">
            <label
              className={cn(
                "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center transition-colors hover:bg-muted/60",
                isDragOver && "border-primary bg-accent",
                busy && "pointer-events-none opacity-60",
              )}
              htmlFor="media-files"
              onDragLeave={() => setIsDragOver(false)}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragOver(true);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragOver(false);
                addFiles(Array.from(event.dataTransfer.files));
              }}
            >
              <Upload className="size-5 text-muted-foreground" />
              <span className="text-sm font-medium">Drop files here or click to choose</span>
              <span className="text-xs text-muted-foreground">JPG, PNG, WEBP or MP4, up to 250 MB each</span>
              <input
                accept={acceptedUploadTypes}
                className="sr-only"
                disabled={busy}
                id="media-files"
                multiple
                onChange={(event) => {
                  addFiles(Array.from(event.target.files ?? []));
                  event.target.value = "";
                }}
                type="file"
              />
            </label>

            {files.length > 0 ? (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">
                  {files.length} file{files.length === 1 ? "" : "s"} · {prettyBytes(totalBytes)}
                </p>
                <ul className="max-h-40 overflow-y-auto rounded-lg border">
                  {files.map((file, index) => {
                    const Icon = file.type.startsWith("video/") ? FileVideo : FileImage;
                    const active = progress?.index === index;
                    const done = progress ? index < progress.index : false;
                    return (
                      <li
                        key={`${file.name}-${index}`}
                        className="relative flex items-center gap-2 border-b px-2.5 py-1.5 last:border-b-0"
                      >
                        {active ? (
                          <span
                            aria-hidden
                            className="absolute inset-y-0 left-0 bg-accent transition-[width]"
                            style={{ width: `${progress.percent}%` }}
                          />
                        ) : null}
                        <Icon className="relative size-4 shrink-0 text-muted-foreground" />
                        <span className="relative min-w-0 flex-1 truncate">{file.name}</span>
                        <span className="relative shrink-0 text-xs text-muted-foreground tabular-nums">
                          {active ? `${progress.percent}%` : done ? "Done" : prettyBytes(file.size)}
                        </span>
                        {!busy ? (
                          <Button
                            aria-label={`Remove ${file.name}`}
                            className="relative"
                            onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                            size="icon-xs"
                            variant="ghost"
                          >
                            <X />
                          </Button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {files.length === 1 ? (
              <Field>
                <FieldLabel htmlFor="upload-title">Title</FieldLabel>
                <Input
                  disabled={busy}
                  id="upload-title"
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={files[0]!.name.replace(/\.[^.]+$/, "")}
                  value={title}
                />
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="upload-tags">Tags</FieldLabel>
              <Input
                disabled={busy}
                id="upload-tags"
                onChange={(event) => setTags(event.target.value)}
                placeholder="Optional, comma separated"
                value={tags}
              />
            </Field>
          </FieldGroup>
        ) : (
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="youtube-url">YouTube link</FieldLabel>
              <Input
                autoFocus
                disabled={busy}
                id="youtube-url"
                onChange={(event) => setYoutubeUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void importYouTube();
                }}
                placeholder="https://www.youtube.com/watch?v=…"
                value={youtubeUrl}
              />
              <FieldDescription>
                Screens download a copy when they sync, so it keeps playing offline.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="youtube-title">Title</FieldLabel>
              <Input
                disabled={busy}
                id="youtube-title"
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Uses the video's title if left blank"
                value={title}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="youtube-tags">Tags</FieldLabel>
              <Input
                disabled={busy}
                id="youtube-tags"
                onChange={(event) => setTags(event.target.value)}
                placeholder="Optional, comma separated"
                value={tags}
              />
            </Field>
          </FieldGroup>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button disabled={busy} onClick={() => changeOpen(false)} variant="outline">
            Cancel
          </Button>
          {mode === "upload" ? (
            <Button disabled={!files.length || busy} onClick={() => void upload()}>
              {busy ? <Spinner /> : <Upload />}
              {busy
                ? `Uploading ${(progress?.index ?? 0) + 1} of ${files.length}`
                : files.length > 1
                  ? `Upload ${files.length} files`
                  : "Upload"}
            </Button>
          ) : (
            <Button disabled={!youtubeUrl.trim() || busy} onClick={() => void importYouTube()}>
              {busy ? <Spinner /> : <Link2 />}
              Add video
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
