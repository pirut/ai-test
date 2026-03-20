"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import {
  Check,
  ChevronRight,
  FolderPlus,
  GripVertical,
  ImageIcon,
  MoveRight,
  Pencil,
  Trash2,
  Video,
  X,
} from "lucide-react";
import type { LibraryFolder, MediaAsset } from "@showroom/contracts";

import { LibraryFolderTree } from "@/components/library-folder-tree";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFolderMap, getFolderTrail } from "@/lib/library";
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

function formatDimensions(asset: MediaAsset) {
  if (asset.width && asset.height) {
    return `${asset.width}×${asset.height}`;
  }
  return null;
}

type UploadedFile = {
  fileHash: string | null;
  key: string;
  name: string;
  size: number;
  type: string;
  ufsUrl: string;
};

function MediaAssetPreview({
  asset,
  className,
}: {
  asset: MediaAsset;
  className?: string;
}) {
  const showImage = asset.type === "image" || asset.sourceType === "youtube";
  const metaLabel =
    asset.type === "video" && asset.durationSeconds
      ? formatDuration(Math.ceil(asset.durationSeconds))
      : asset.type === "video"
        ? asset.sourceType === "youtube"
          ? "YouTube"
          : "Video"
        : "Image";

  return (
    <div
      className={cn(
        "relative flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/20",
        className,
      )}
    >
      {showImage ? (
        <img
          alt={asset.title}
          className="h-full w-full object-cover"
          decoding="async"
          loading="lazy"
          src={asset.previewUrl}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-secondary/35 text-muted-foreground">
          <Video className="size-4" />
          <span className="text-[10px] font-medium uppercase tracking-[0.16em]">Video</span>
        </div>
      )}
      <div className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-white">
        {asset.type === "video" ? <Video className="size-3" /> : <ImageIcon className="size-3" />}
        <span>{metaLabel}</span>
      </div>
    </div>
  );
}

function MediaAssetRow({
  asset,
  isSelected,
  onSelect,
  onToggleSelect,
  selectionBadge,
  dragLabel,
}: {
  asset: MediaAsset;
  isSelected: boolean;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  onToggleSelect: () => void;
  selectionBadge: string | null;
  dragLabel: string;
}) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `media-asset:${asset.id}`,
      data: {
        type: "asset",
        assetId: asset.id,
      },
    });

  return (
    <article
      className={cn(
        "border-b border-border/75 transition-colors last:border-b-0 hover:bg-accent/35",
        isSelected ? "bg-accent/55" : "",
        isDragging ? "opacity-40" : "",
      )}
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
    >
      <div className="grid gap-3 px-3 py-3 md:grid-cols-[auto_minmax(0,1fr)_112px_132px] md:items-center">
        <div className="flex items-start gap-3">
          <button
            className={cn(
              "mt-1 flex size-6 shrink-0 items-center justify-center rounded border text-[11px] font-semibold transition-colors",
              isSelected
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground",
            )}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelect();
            }}
            type="button"
          >
            {selectionBadge === "check" ? <Check className="size-3.5" /> : selectionBadge ?? ""}
          </button>

          <button
            aria-label={dragLabel}
            className="mt-1 flex size-6 shrink-0 items-center justify-center rounded border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-background hover:text-foreground"
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-3.5" />
          </button>

          <button
            className="flex min-w-0 flex-1 items-start gap-3 text-left"
            onClick={onSelect}
            type="button"
          >
            <MediaAssetPreview asset={asset} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-sm font-medium text-foreground">{asset.title}</div>
                {asset.sourceType === "youtube" ? (
                  <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    YouTube
                  </span>
                ) : null}
              </div>
              <div className="truncate text-xs text-muted-foreground">{asset.fileName}</div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground md:hidden">
                <span>{asset.type === "video" ? "Video" : "Image"}</span>
                <span>•</span>
                <span>{prettyBytes(asset.sizeBytes)}</span>
                {asset.type === "video" && asset.durationSeconds ? (
                  <>
                    <span>•</span>
                    <span>{formatDuration(Math.ceil(asset.durationSeconds))}</span>
                  </>
                ) : null}
                {formatDimensions(asset) ? (
                  <>
                    <span>•</span>
                    <span>{formatDimensions(asset)}</span>
                  </>
                ) : null}
              </div>
              {asset.tags.length > 0 ? (
                <div className="mt-2 hidden flex-wrap gap-1 md:flex">
                  {asset.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                  {asset.tags.length > 3 ? (
                    <span className="text-[11px] text-muted-foreground">
                      +{asset.tags.length - 3} more
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </button>
        </div>

        <div className="hidden md:block">
          <div className="text-sm font-medium text-foreground">
            {asset.type === "video" ? "Video" : "Image"}
          </div>
          <div className="text-xs text-muted-foreground">
            {asset.sourceType === "youtube" ? "YouTube" : "Upload"}
          </div>
        </div>

        <div className="hidden md:block">
          <div className="text-sm font-medium text-foreground">{prettyBytes(asset.sizeBytes)}</div>
          <div className="text-xs text-muted-foreground">
            {asset.type === "video" && asset.durationSeconds
              ? formatDuration(Math.ceil(asset.durationSeconds))
              : formatDimensions(asset) ?? "No duration"}
          </div>
        </div>
      </div>
    </article>
  );
}

export function MediaLibraryManager({
  initialAssets,
  initialFolders,
}: {
  initialAssets: MediaAsset[];
  initialFolders: LibraryFolder[];
}) {
  const router = useRouter();
  const [assets, setAssets] = useState(initialAssets);
  const [folders, setFolders] = useState(initialFolders);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [focusedAssetId, setFocusedAssetId] = useState<string | null>(null);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [activeDragAssetIds, setActiveDragAssetIds] = useState<string[]>([]);
  const [activeDropFolderId, setActiveDropFolderId] = useState<string | null | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [folderSearch, setFolderSearch] = useState("");
  const [bulkTags, setBulkTags] = useState("");

  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const [youtubeUrl, setYouTubeUrl] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [youtubeTags, setYoutubeTags] = useState("");
  const [isImportingYouTube, setIsImportingYouTube] = useState(false);

  const deferredSearch = useDeferredValue(search);
  const deferredFolderSearch = useDeferredValue(folderSearch);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );

  const folderMap = useMemo(() => getFolderMap(folders), [folders]);
  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const folderTrail = useMemo(
    () => getFolderTrail(selectedFolderId, folderMap),
    [folderMap, selectedFolderId],
  );
  const folderAssetCounts = useMemo(() => {
    const counts = new Map<string | null, number>();
    for (const asset of assets) {
      const key = asset.folderId ?? null;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [assets]);
  const visibleAssets = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    return assets.filter((asset) => {
      if ((asset.folderId ?? null) !== selectedFolderId) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [asset.title, asset.fileName, ...asset.tags]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [assets, deferredSearch, selectedFolderId]);
  const selectedAssetSet = useMemo(() => new Set(selectedAssetIds), [selectedAssetIds]);
  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedAssetSet.has(asset.id)),
    [assets, selectedAssetSet],
  );
  const selectedAsset =
    assets.find((asset) => asset.id === focusedAssetId) ??
    assets.find((asset) => selectedAssetSet.has(asset.id)) ??
    null;
  const activeDragAssets = useMemo(() => {
    const activeSet = new Set(activeDragAssetIds);
    return assets.filter((asset) => activeSet.has(asset.id));
  }, [activeDragAssetIds, assets]);
  const activeDragLeadAsset = activeDragAssets[0] ?? null;
  const selectionCount = selectedAssetIds.length;
  const activeDropFolderName =
    activeDropFolderId === undefined
      ? null
      : activeDropFolderId === null
        ? "Root library"
        : folderMap.get(activeDropFolderId)?.name ?? "Folder";
  const currentFolderName = selectedFolderId
    ? folderMap.get(selectedFolderId)?.name ?? "Folder"
    : "Root library";
  const currentFolderCount = folderAssetCounts.get(selectedFolderId ?? null) ?? 0;

  const collisionDetection = useMemo<CollisionDetection>(
    () => (args) => {
      const pointerCollisions = pointerWithin(args);
      return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
    },
    [],
  );

  useEffect(() => {
    const scopedIds = selectedAssetIds.filter((assetId) => {
      const asset = assetMap.get(assetId);
      return asset ? (asset.folderId ?? null) === selectedFolderId : false;
    });

    if (scopedIds.length !== selectedAssetIds.length) {
      setSelectedAssetIds(scopedIds);
      setFocusedAssetId(scopedIds[0] ?? null);
    } else if (focusedAssetId && !scopedIds.includes(focusedAssetId)) {
      setFocusedAssetId(scopedIds[0] ?? null);
    }
  }, [assetMap, focusedAssetId, selectedAssetIds, selectedFolderId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable ||
          target.closest("[contenteditable='true']"))
      ) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        const nextIds = visibleAssets.map((asset) => asset.id);
        setSelection(nextIds, nextIds[0] ?? null);
        setLastSelectedIndex(nextIds.length > 0 ? nextIds.length - 1 : null);
        return;
      }

      if (event.key === "Escape" && selectedAssetIds.length > 0) {
        event.preventDefault();
        clearSelection();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedAssetIds.length, visibleAssets]);

  function refreshData() {
    startTransition(() => {
      router.refresh();
    });
  }

  function setSelection(assetIds: string[], focusAssetId?: string | null) {
    setSelectedAssetIds(assetIds);
    setFocusedAssetId(focusAssetId ?? assetIds[0] ?? null);
  }

  function clearSelection() {
    setSelection([]);
    setLastSelectedIndex(null);
  }

  async function finalizeUpload(uploaded: UploadedFile, sourceFile?: File) {
    try {
      setIsFinalizing(true);
      setStatus({ ok: true, text: `Saving "${uploaded.name}"...` });
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
          tags: uploadTags.split(",").map((entry) => entry.trim()).filter(Boolean),
          folderId: selectedFolderId,
          ...metadata,
        }),
      });

      const finalizePayload = await finalizeResponse.json();
      if (!finalizeResponse.ok) {
        throw new Error(finalizePayload.error ?? "Unable to save media asset");
      }

      const nextAsset = finalizePayload.asset as MediaAsset;
      setAssets((current) => [nextAsset, ...current]);
      setSelection([nextAsset.id], nextAsset.id);
      return nextAsset;
    } catch (error) {
      setStatus({
        ok: false,
        text: error instanceof Error ? error.message : "Upload failed",
      });
      return null;
    } finally {
      setIsFinalizing(false);
    }
  }

  async function importYouTubeVideo() {
    try {
      setIsImportingYouTube(true);
      setStatus({ ok: true, text: "Registering YouTube source..." });
      const response = await fetch("/api/media/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: youtubeUrl.trim(),
          title: youtubeTitle.trim() || undefined,
          tags: youtubeTags.split(",").map((entry) => entry.trim()).filter(Boolean),
          folderId: selectedFolderId,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to import YouTube video");
      }

      const nextAsset = payload.asset as MediaAsset;
      setAssets((current) => [nextAsset, ...current]);
      setSelection([nextAsset.id], nextAsset.id);
      setYouTubeUrl("");
      setYoutubeTitle("");
      setYoutubeTags("");
      setStatus({ ok: true, text: `Imported "${nextAsset.title}".` });
      refreshData();
    } catch (error) {
      setStatus({
        ok: false,
        text: error instanceof Error ? error.message : "YouTube import failed",
      });
    } finally {
      setIsImportingYouTube(false);
    }
  }

  async function updateAssetRequest(assetId: string, updates: Partial<MediaAsset>) {
    const response = await fetch(`/api/media/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: updates.title,
        tags: updates.tags,
        folderId: updates.folderId,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to update asset");
    }

    return payload.asset as MediaAsset;
  }

  function applyUpdatedAssets(updatedAssets: MediaAsset[]) {
    const updatedMap = new Map(updatedAssets.map((asset) => [asset.id, asset]));
    setAssets((current) => current.map((asset) => updatedMap.get(asset.id) ?? asset));
  }

  async function saveAssetEdit(assetId: string, updates: Partial<MediaAsset>) {
    try {
      const updatedAsset = await updateAssetRequest(assetId, updates);
      applyUpdatedAssets([updatedAsset]);
      setFocusedAssetId(updatedAsset.id);
      refreshData();
    } catch (error) {
      setStatus({
        ok: false,
        text: error instanceof Error ? error.message : "Unable to update asset",
      });
    }
  }

  async function saveBulkAssetEdit(assetIds: string[], updates: Partial<MediaAsset>) {
    try {
      const updatedAssets = await Promise.all(
        assetIds.map((assetId) => updateAssetRequest(assetId, updates)),
      );
      applyUpdatedAssets(updatedAssets);
      setStatus({
        ok: true,
        text: `Updated ${updatedAssets.length} asset${updatedAssets.length !== 1 ? "s" : ""}.`,
      });
      refreshData();
    } catch (error) {
      setStatus({
        ok: false,
        text: error instanceof Error ? error.message : "Unable to update selected assets",
      });
    }
  }

  async function deleteAssets(assetIds: string[]) {
    if (!assetIds.length) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${assetIds.length} asset${assetIds.length !== 1 ? "s" : ""}?`,
    );
    if (!confirmed) {
      return;
    }

    try {
      await Promise.all(
        assetIds.map(async (assetId) => {
          const response = await fetch(`/api/media/${assetId}`, { method: "DELETE" });
          if (!response.ok) {
            const payload = await response.json();
            throw new Error(payload.error ?? "Unable to delete asset");
          }
        }),
      );
      setAssets((current) => current.filter((asset) => !assetIds.includes(asset.id)));
      clearSelection();
      setStatus({
        ok: true,
        text: `Deleted ${assetIds.length} asset${assetIds.length !== 1 ? "s" : ""}.`,
      });
      refreshData();
    } catch (error) {
      setStatus({
        ok: false,
        text: error instanceof Error ? error.message : "Unable to delete selected assets",
      });
    }
  }

  async function createFolder(parentId: string | null) {
    const name = window.prompt("Folder name");
    if (!name?.trim()) {
      return;
    }

    const response = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "media",
        name: name.trim(),
        parentId,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setStatus({ ok: false, text: payload.error ?? "Unable to create folder" });
      return;
    }

    const nextFolder = payload.folder as LibraryFolder;
    setFolders((current) => [...current, nextFolder]);
    setSelectedFolderId(nextFolder.id);
    refreshData();
  }

  async function renameFolder(folder: LibraryFolder) {
    const name = window.prompt("Rename folder", folder.name);
    if (!name?.trim() || name.trim() === folder.name) {
      return;
    }

    const response = await fetch(`/api/folders/${folder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setStatus({ ok: false, text: payload.error ?? "Unable to rename folder" });
      return;
    }

    const nextFolder = payload.folder as LibraryFolder;
    setFolders((current) =>
      current.map((entry) => (entry.id === folder.id ? nextFolder : entry)),
    );
    refreshData();
  }

  async function deleteFolder(folder: LibraryFolder) {
    if (
      !window.confirm("Delete this folder? Child folders and assets will move to the parent.")
    ) {
      return;
    }

    const response = await fetch(`/api/folders/${folder.id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json();
      setStatus({ ok: false, text: payload.error ?? "Unable to delete folder" });
      return;
    }

    setFolders((current) =>
      current
        .filter((entry) => entry.id !== folder.id)
        .map((entry) =>
          entry.parentId === folder.id ? { ...entry, parentId: folder.parentId } : entry,
        ),
    );
    setAssets((current) =>
      current.map((asset) =>
        asset.folderId === folder.id ? { ...asset, folderId: folder.parentId } : asset,
      ),
    );
    if (selectedFolderId === folder.id) {
      setSelectedFolderId(folder.parentId ?? null);
    }
    refreshData();
  }

  async function moveAssetsToFolder(assetIds: string[], folderId: string | null) {
    if (!assetIds.length) {
      return;
    }

    const previousFolders = new Map(
      assetIds.map((assetId) => [assetId, assetMap.get(assetId)?.folderId ?? null]),
    );

    setAssets((current) =>
      current.map((asset) =>
        previousFolders.has(asset.id) ? { ...asset, folderId } : asset,
      ),
    );
    setStatus({
      ok: true,
      text: `Moving ${assetIds.length} asset${assetIds.length !== 1 ? "s" : ""}...`,
    });

    try {
      const updatedAssets = await Promise.all(
        assetIds.map((assetId) => updateAssetRequest(assetId, { folderId })),
      );
      applyUpdatedAssets(updatedAssets);
      setStatus({
        ok: true,
        text: `Moved ${updatedAssets.length} asset${updatedAssets.length !== 1 ? "s" : ""}.`,
      });
      refreshData();
    } catch (error) {
      setAssets((current) =>
        current.map((asset) =>
          previousFolders.has(asset.id)
            ? { ...asset, folderId: previousFolders.get(asset.id) ?? null }
            : asset,
        ),
      );
      setStatus({
        ok: false,
        text: error instanceof Error ? error.message : "Unable to move selected assets",
      });
    }
  }

  function handleAssetSelect(assetId: string, event: MouseEvent<HTMLButtonElement>) {
    const assetIndex = visibleAssets.findIndex((asset) => asset.id === assetId);
    if (assetIndex === -1) {
      return;
    }

    if (event.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, assetIndex);
      const end = Math.max(lastSelectedIndex, assetIndex);
      const rangeIds = visibleAssets.slice(start, end + 1).map((asset) => asset.id);
      setSelection(rangeIds, assetId);
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      if (selectedAssetSet.has(assetId)) {
        const nextIds = selectedAssetIds.filter((id) => id !== assetId);
        setSelection(nextIds, nextIds[0] ?? null);
      } else {
        setSelection([...selectedAssetIds, assetId], assetId);
      }
      setLastSelectedIndex(assetIndex);
      return;
    }

    setSelection([assetId], assetId);
    setLastSelectedIndex(assetIndex);
  }

  function toggleAssetSelection(assetId: string) {
    const assetIndex = visibleAssets.findIndex((asset) => asset.id === assetId);
    if (selectedAssetSet.has(assetId)) {
      const nextIds = selectedAssetIds.filter((id) => id !== assetId);
      setSelection(nextIds, nextIds[0] ?? null);
      return;
    }

    setSelection([...selectedAssetIds, assetId], assetId);
    if (assetIndex !== -1) {
      setLastSelectedIndex(assetIndex);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { type?: string; assetId?: string } | undefined;
    if (data?.type === "asset" && data.assetId) {
      const nextIds = selectedAssetSet.has(data.assetId) ? selectedAssetIds : [data.assetId];
      setSelection(nextIds, data.assetId);
      setActiveDragAssetIds(nextIds);
    }
  }

  function handleDragOver(event: DragOverEvent | DragEndEvent) {
    const overData = event.over?.data.current as
      | { type?: string; scope?: string; folderId?: string | null }
      | undefined;

    if (overData?.type === "folder" && overData.scope === "media") {
      setActiveDropFolderId(overData.folderId ?? null);
      return;
    }

    setActiveDropFolderId(undefined);
  }

  function handleDragEnd(event: DragEndEvent) {
    const overData = event.over?.data.current as
      | { type?: string; scope?: string; folderId?: string | null }
      | undefined;

    if (
      activeDragAssetIds.length > 0 &&
      overData?.type === "folder" &&
      overData.scope === "media"
    ) {
      void moveAssetsToFolder(activeDragAssetIds, overData.folderId ?? null);
    }

    setActiveDragAssetIds([]);
    setActiveDropFolderId(undefined);
  }

  function handleDragCancel() {
    setActiveDragAssetIds([]);
    setActiveDropFolderId(undefined);
  }

  return (
    <DndContext
      collisionDetection={collisionDetection}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_340px]">
        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-medium text-foreground">Folders</p>
              <Button
                onClick={() => void createFolder(selectedFolderId)}
                size="sm"
                type="button"
                variant="outline"
              >
                <FolderPlus className="size-4" />
              </Button>
            </div>
            <div className="space-y-4 p-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Assets
                  </div>
                  <div className="mt-1 text-lg font-semibold text-foreground">{assets.length}</div>
                </div>
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Folders
                  </div>
                  <div className="mt-1 text-lg font-semibold text-foreground">{folders.length}</div>
                </div>
              </div>

              <Input
                onChange={(event) => setFolderSearch(event.target.value)}
                placeholder="Find folder"
                value={folderSearch}
              />

              {activeDragAssets.length > 0 ? (
                <div className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                  {activeDropFolderName ? (
                    <>
                      Move{" "}
                      <span className="font-medium text-foreground">
                        {activeDragAssets.length === 1
                          ? activeDragLeadAsset?.title
                          : `${activeDragAssets.length} assets`}
                      </span>{" "}
                      to <span className="font-medium text-foreground">{activeDropFolderName}</span>
                    </>
                  ) : (
                    "Drop onto a folder to move the current selection."
                  )}
                </div>
              ) : null}

              <LibraryFolderTree
                activeDragType={activeDragAssetIds.length > 0 ? "asset" : null}
                droppableScope="media"
                folders={folders}
                onDelete={(folder) => void deleteFolder(folder)}
                filterQuery={deferredFolderSearch}
                onRename={(folder) => void renameFolder(folder)}
                onSelect={setSelectedFolderId}
                itemCounts={folderAssetCounts}
                rootLabel="Root library"
                selectedFolderId={selectedFolderId}
              />
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-medium text-foreground">Current folder</p>
            </div>
            <div className="space-y-3 p-4">
              <div>
                <div className="text-sm font-medium text-foreground">{currentFolderName}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {currentFolderCount} item{currentFolderCount !== 1 ? "s" : ""}
                </div>
              </div>
              {selectedFolderId ? (
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => {
                      const folder = folderMap.get(selectedFolderId);
                      if (folder) {
                        void renameFolder(folder);
                      }
                    }}
                    type="button"
                    variant="outline"
                  >
                    <Pencil className="size-4" />
                    Rename
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => {
                      const folder = folderMap.get(selectedFolderId);
                      if (folder) {
                        void deleteFolder(folder);
                      }
                    }}
                    type="button"
                    variant="outline"
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Root items stay visible here until you move them into a folder.
                </p>
              )}
            </div>
          </section>
        </aside>

        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <button
                    className="hover:text-foreground"
                    onClick={() => setSelectedFolderId(null)}
                    type="button"
                  >
                    Root library
                  </button>
                  {folderTrail.map((folder) => (
                    <span key={folder.id} className="inline-flex min-w-0 items-center gap-2">
                      <ChevronRight className="size-4 shrink-0" />
                      <button
                        className="truncate hover:text-foreground"
                        onClick={() => setSelectedFolderId(folder.id)}
                        type="button"
                      >
                        {folder.name}
                      </button>
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-semibold text-foreground">{currentFolderName}</h2>
                  <span className="text-sm text-muted-foreground">
                    {visibleAssets.length} shown
                  </span>
                  {search.trim() ? (
                    <span className="text-sm text-muted-foreground">
                      {currentFolderCount} total in folder
                    </span>
                  ) : null}
                </div>
              </div>

              <Input
                className="w-full xl:w-72"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title, filename, or tags"
                value={search}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {visibleAssets.length > 0 ? (
                <Button
                  onClick={() => {
                    const nextIds = visibleAssets.map((asset) => asset.id);
                    setSelection(nextIds, nextIds[0] ?? null);
                    setLastSelectedIndex(nextIds.length > 0 ? nextIds.length - 1 : null);
                  }}
                  type="button"
                  variant="outline"
                >
                  Select all
                </Button>
              ) : null}
              {selectionCount > 0 ? (
                <Button onClick={clearSelection} type="button" variant="outline">
                  Clear selection
                </Button>
              ) : null}
              <span className="text-xs text-muted-foreground">
                Shift-click ranges. Ctrl/Cmd-click toggles. Ctrl/Cmd+A selects visible.
              </span>
            </div>
          </div>

          {selectionCount > 0 ? (
            <div className="border-b border-border bg-background/40 px-5 py-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="text-sm text-foreground">
                  <span className="font-medium">
                    {selectionCount} asset{selectionCount !== 1 ? "s" : ""} selected
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    • drag from the handle or use the bulk actions here
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selectionCount > 1 ? (
                    <>
                      <Input
                        className="w-full sm:w-56"
                        onChange={(event) => setBulkTags(event.target.value)}
                        placeholder="Replace tags for selection"
                        value={bulkTags}
                      />
                      <Button
                        onClick={() =>
                          void saveBulkAssetEdit(selectedAssetIds, {
                            tags: bulkTags
                              .split(",")
                              .map((tag) => tag.trim())
                              .filter(Boolean),
                          })
                        }
                        type="button"
                        variant="outline"
                      >
                        Apply tags
                      </Button>
                    </>
                  ) : null}
                  {selectedFolderId ? (
                    <Button
                      onClick={() => void moveAssetsToFolder(selectedAssetIds, null)}
                      type="button"
                      variant="outline"
                    >
                      Move to root
                    </Button>
                  ) : null}
                  <Button onClick={clearSelection} type="button" variant="outline">
                    <X className="size-4" />
                    Clear
                  </Button>
                  <Button
                    className="justify-start"
                    onClick={() => void deleteAssets(selectedAssetIds)}
                    type="button"
                    variant="outline"
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="px-5 py-3">
            <div className="hidden border-b border-border/75 pb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground md:grid md:grid-cols-[minmax(0,1fr)_112px_132px] md:pl-[122px]">
              <span>Asset</span>
              <span>Source</span>
              <span>Size</span>
            </div>

            {visibleAssets.length > 0 ? (
              <div>
                {visibleAssets.map((asset) => (
                  <MediaAssetRow
                    asset={asset}
                    dragLabel={`Drag ${asset.title}`}
                    isSelected={selectedAssetSet.has(asset.id)}
                    key={asset.id}
                    onSelect={(event) => handleAssetSelect(asset.id, event)}
                    onToggleSelect={() => toggleAssetSelection(asset.id)}
                    selectionBadge={
                      selectedAssetSet.has(asset.id)
                        ? selectionCount > 1
                          ? String(selectedAssetIds.indexOf(asset.id) + 1)
                          : "check"
                        : null
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border px-6 py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  {search.trim()
                    ? "No matching assets in this folder."
                    : "This folder is empty."}
                </p>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-medium text-foreground">
                {selectionCount > 1 ? "Selection" : "Inspector"}
              </p>
            </div>
            {selectionCount > 1 ? (
              <div className="space-y-3 p-4">
                <div className="rounded-md border border-border bg-background px-3 py-3 text-sm text-muted-foreground">
                  Drag from any selected row to move the full selection.
                </div>
                <div className="space-y-2">
                  {selectedAssets.slice(0, 6).map((asset) => (
                    <div
                      key={asset.id}
                      className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                    >
                      <MediaAssetPreview asset={asset} className="h-11 w-16" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {asset.title}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {asset.folderId ? folderMap.get(asset.folderId)?.name : "Root library"}
                        </div>
                      </div>
                    </div>
                  ))}
                  {selectedAssets.length > 6 ? (
                    <div className="text-xs text-muted-foreground">
                      +{selectedAssets.length - 6} more selected assets
                    </div>
                  ) : null}
                </div>
              </div>
            ) : selectedAsset ? (
              <div className="space-y-4 p-4">
                <div className="aspect-[16/10] overflow-hidden rounded-md border border-border bg-muted/30">
                  {selectedAsset.type === "video" && selectedAsset.sourceType !== "youtube" ? (
                    <video
                      className="h-full w-full object-cover"
                      controls
                      preload="metadata"
                      src={selectedAsset.previewUrl}
                    />
                  ) : (
                    <img
                      alt={selectedAsset.title}
                      className="h-full w-full object-cover"
                      decoding="async"
                      loading="lazy"
                      src={selectedAsset.previewUrl}
                    />
                  )}
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="asset-title">Title</Label>
                    <Input
                      defaultValue={selectedAsset.title}
                      id="asset-title"
                      key={`${selectedAsset.id}-title`}
                      onBlur={(event) => {
                        const nextTitle = event.target.value.trim();
                        if (nextTitle && nextTitle !== selectedAsset.title) {
                          void saveAssetEdit(selectedAsset.id, { title: nextTitle });
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="asset-tags">Tags</Label>
                    <Input
                      defaultValue={selectedAsset.tags.join(", ")}
                      id="asset-tags"
                      key={`${selectedAsset.id}-tags`}
                      onBlur={(event) => {
                        const nextTags = event.target.value
                          .split(",")
                          .map((tag) => tag.trim())
                          .filter(Boolean);
                        if (nextTags.join(",") !== selectedAsset.tags.join(",")) {
                          void saveAssetEdit(selectedAsset.id, { tags: nextTags });
                        }
                      }}
                    />
                  </div>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Type</dt>
                    <dd className="text-foreground">
                      {selectedAsset.type === "video" ? "Video" : "Image"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Source</dt>
                    <dd className="text-foreground">
                      {selectedAsset.sourceType === "youtube" ? "YouTube" : "Upload"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Size</dt>
                    <dd className="text-foreground">{prettyBytes(selectedAsset.sizeBytes)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Folder</dt>
                    <dd className="truncate text-foreground">
                      {selectedAsset.folderId
                        ? folderMap.get(selectedAsset.folderId)?.name
                        : "Root library"}
                    </dd>
                  </div>
                  {formatDimensions(selectedAsset) ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Dimensions</dt>
                      <dd className="text-foreground">{formatDimensions(selectedAsset)}</dd>
                    </div>
                  ) : null}
                </dl>
                <Button
                  className="w-full justify-start"
                  onClick={() => void deleteAssets([selectedAsset.id])}
                  type="button"
                  variant="outline"
                >
                  <Trash2 className="size-4" />
                  Delete asset
                </Button>
              </div>
            ) : (
              <div className="p-4 text-sm text-muted-foreground">
                Select an asset to edit details.
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-medium text-foreground">Add media</p>
            </div>
            <div className="space-y-4 p-4">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="upload-title">Upload title</Label>
                  <Input
                    id="upload-title"
                    onChange={(event) => setUploadTitle(event.target.value)}
                    placeholder="Auto-detect from filename"
                    value={uploadTitle}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="upload-tags">Tags</Label>
                  <Input
                    id="upload-tags"
                    onChange={(event) => setUploadTags(event.target.value)}
                    placeholder="launch, hero"
                    value={uploadTags}
                  />
                </div>
                <UploadDropzone
                  appearance={{
                    allowedContent: "text-xs text-muted-foreground",
                    button:
                      "mt-3 h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground hover:bg-accent",
                    container:
                      "rounded-md border border-dashed border-border bg-background px-4 py-6 text-card-foreground",
                    label: "text-sm font-medium text-foreground",
                    uploadIcon: "text-muted-foreground",
                  }}
                  config={{ mode: "auto" }}
                  content={{
                    allowedContent() {
                      return "JPG, PNG, WEBP, MP4";
                    },
                    button({ isUploading }) {
                      return isUploading ? "Uploading..." : "Choose files";
                    },
                    label({ isDragActive, ready }) {
                      if (!ready) return "Preparing upload...";
                      return isDragActive ? "Release to upload" : "Drop media here";
                    },
                  }}
                  endpoint="mediaUploader"
                  input={{
                    tags: uploadTags.split(",").map((entry) => entry.trim()).filter(Boolean),
                    title:
                      uploadTitle.trim() ||
                      queuedFiles[0]?.name.replace(/\.[^.]+$/, "") ||
                      undefined,
                  }}
                  onChange={(files) => {
                    setQueuedFiles(files);
                    if (files.length > 0) {
                      setUploadProgress(
                        `Selected ${files.length} file${files.length !== 1 ? "s" : ""}`,
                      );
                    }
                  }}
                  onClientUploadComplete={async (result) => {
                    if (!result.length) {
                      setStatus({ ok: false, text: "Upload completed without any files." });
                      return;
                    }

                    let successCount = 0;
                    for (const uploaded of result) {
                      const sourceFile = queuedFiles.find((file) => file.name === uploaded.name);
                      const asset = await finalizeUpload(uploaded, sourceFile);
                      if (asset) {
                        successCount += 1;
                      }
                    }
                    setQueuedFiles([]);
                    setUploadProgress(null);
                    if (successCount > 0) {
                      setUploadTitle("");
                      setUploadTags("");
                      setStatus({
                        ok: true,
                        text: `Uploaded ${successCount} file${successCount !== 1 ? "s" : ""}.`,
                      });
                      refreshData();
                    }
                  }}
                  onUploadError={(error) => {
                    setStatus({ ok: false, text: error.message });
                  }}
                />
              </div>

              <div className="border-t border-border pt-4">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="youtube-url">YouTube URL</Label>
                    <Input
                      id="youtube-url"
                      onChange={(event) => setYouTubeUrl(event.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={youtubeUrl}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="youtube-title">Override title</Label>
                    <Input
                      id="youtube-title"
                      onChange={(event) => setYoutubeTitle(event.target.value)}
                      placeholder="Optional"
                      value={youtubeTitle}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="youtube-tags">Tags</Label>
                    <Input
                      id="youtube-tags"
                      onChange={(event) => setYoutubeTags(event.target.value)}
                      placeholder="youtube, campaign"
                      value={youtubeTags}
                    />
                  </div>
                  <Button
                    className="w-full"
                    disabled={!youtubeUrl.trim() || isImportingYouTube || isFinalizing}
                    onClick={() => void importYouTubeVideo()}
                    type="button"
                  >
                    {isImportingYouTube ? "Importing..." : "Import YouTube video"}
                  </Button>
                </div>
              </div>

              {status || uploadProgress ? (
                <div className="rounded-md border border-border px-3 py-2 text-sm">
                  <p
                    className={
                      status ? (status.ok ? "text-foreground" : "text-destructive") : "text-foreground"
                    }
                  >
                    {status?.text ?? uploadProgress}
                  </p>
                  {isFinalizing ? (
                    <p className="mt-1 text-xs text-muted-foreground">Saving metadata...</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        </aside>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDragAssets.length > 0 ? (
          <div className="min-w-64 rounded-xl border border-foreground/15 bg-card/95 px-4 py-3 text-sm text-foreground shadow-2xl backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-accent text-foreground">
                <MoveRight className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {activeDragAssets.length === 1
                    ? activeDragLeadAsset?.title
                    : `${activeDragAssets.length} selected assets`}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {activeDropFolderName
                    ? `Release to move into ${activeDropFolderName}`
                    : "Drag onto a folder"}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
