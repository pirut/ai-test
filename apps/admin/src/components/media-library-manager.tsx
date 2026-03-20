"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  FolderPlus,
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
import { getFolderChildren, getFolderMap, getFolderTrail } from "@/lib/library";
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

function MediaAssetCard({
  asset,
  isSelected,
  onSelect,
  onToggleSelect,
  selectionBadge,
}: {
  asset: MediaAsset;
  isSelected: boolean;
  onSelect: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onToggleSelect: () => void;
  selectionBadge: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `media-asset:${asset.id}`,
    data: {
      type: "asset",
      assetId: asset.id,
    },
  });

  return (
    <article
      className={cn(
        "relative cursor-grab overflow-hidden rounded-md border border-border bg-background transition-[opacity,border-color,box-shadow] active:cursor-grabbing hover:border-foreground/20",
        isSelected ? "border-foreground/30 shadow-sm ring-1 ring-foreground/12" : "",
        isDragging ? "opacity-40" : "",
      )}
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...attributes}
      {...listeners}
    >
      <button
        className={cn(
          "absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-full border text-xs font-semibold shadow-lg transition-colors",
          isSelected
            ? "border-foreground bg-foreground text-background"
            : "border-white/30 bg-black/55 text-white hover:border-white/50 hover:bg-black/70",
        )}
        onClick={(event) => {
          event.stopPropagation();
          onToggleSelect();
        }}
        type="button"
      >
        {selectionBadge === "check" ? <Check className="size-4" /> : selectionBadge ?? "+"}
      </button>
      <button
        className="block w-full cursor-pointer text-left"
        onClick={onSelect}
        type="button"
      >
        <div className="relative aspect-[16/10] overflow-hidden border-b border-border bg-muted/20">
          {asset.type === "video" && asset.sourceType !== "youtube" ? (
            <video
              className="h-full w-full object-cover"
              muted
              preload="metadata"
              src={`${asset.previewUrl}#t=0.5`}
            />
          ) : (
            <img alt={asset.title} className="h-full w-full object-cover" src={asset.previewUrl} />
          )}
          <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/75 px-2 py-1 text-xs text-white">
            {asset.type === "video" ? (
              <Video className="size-3.5" />
            ) : (
              <ImageIcon className="size-3.5" />
            )}
            <span>
              {asset.type === "video" && asset.durationSeconds
                ? formatDuration(Math.ceil(asset.durationSeconds))
                : asset.type}
            </span>
          </div>
        </div>
        <div className="space-y-2 px-4 py-3">
          <div>
            <div className="truncate text-sm font-medium text-foreground">{asset.title}</div>
            <div className="truncate text-xs text-muted-foreground">
              {asset.fileName} · {prettyBytes(asset.sizeBytes)}
            </div>
          </div>
          {asset.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {asset.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </button>
    </article>
  );
}

function FolderTile({
  count,
  folder,
  isActive,
  label,
  onDelete,
  onOpen,
  onRename,
}: {
  count: number;
  folder: LibraryFolder | null;
  isActive: boolean;
  label?: string;
  onDelete: () => void;
  onOpen: () => void;
  onRename: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `media:${folder?.id ?? "root"}`,
    data: {
      type: "folder",
      scope: "media",
      folderId: folder?.id ?? null,
    },
  });

  return (
    <div
      className={cn(
        "rounded-md border transition-colors",
        isActive ? "border-foreground/20 bg-accent" : "border-border hover:bg-accent/60",
        isOver ? "ring-1 ring-foreground/15" : "",
      )}
      ref={setNodeRef}
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <button className="min-w-0 text-left" onClick={onOpen} type="button">
          <div className="flex items-center gap-3">
            <FolderPlus className="size-4 text-muted-foreground" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                {label ?? folder?.name ?? "Root"}
              </div>
              <div className="text-xs text-muted-foreground">{count} items</div>
            </div>
          </div>
        </button>
        <div className="flex items-center gap-1">
          {folder ? (
            <>
              <button
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                onClick={onRename}
                type="button"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                onClick={onDelete}
                type="button"
              >
                <Trash2 className="size-3.5" />
              </button>
            </>
          ) : null}
        </div>
      </div>
      <button className="w-full px-4 pb-3 pt-2 text-left text-xs text-muted-foreground" onClick={onOpen} type="button">
        {folder ? "Open folder" : "Move or browse root"}
      </button>
    </div>
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
  const [search, setSearch] = useState("");
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );

  const folderMap = useMemo(() => getFolderMap(folders), [folders]);
  const folderTrail = useMemo(
    () => getFolderTrail(selectedFolderId, folderMap),
    [folderMap, selectedFolderId],
  );
  const childFolders = useMemo(
    () => getFolderChildren(folders, selectedFolderId),
    [folders, selectedFolderId],
  );
  const visibleAssets = useMemo(() => {
    const query = search.trim().toLowerCase();
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
  }, [assets, search, selectedFolderId]);
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

  const collisionDetection = useMemo<CollisionDetection>(
    () => (args) => {
      const pointerCollisions = pointerWithin(args);
      return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
    },
    [],
  );

  useEffect(() => {
    const scopedIds = selectedAssetIds.filter((assetId) => {
      const asset = assets.find((entry) => entry.id === assetId);
      return asset ? (asset.folderId ?? null) === selectedFolderId : false;
    });

    if (scopedIds.length !== selectedAssetIds.length) {
      setSelectedAssetIds(scopedIds);
      setFocusedAssetId(scopedIds[0] ?? null);
    } else if (focusedAssetId && !scopedIds.includes(focusedAssetId)) {
      setFocusedAssetId(scopedIds[0] ?? null);
    }
  }, [assets, focusedAssetId, selectedAssetIds, selectedFolderId]);

  function setSelection(assetIds: string[], focusAssetId?: string | null) {
    setSelectedAssetIds(assetIds);
    setFocusedAssetId(focusAssetId ?? assetIds[0] ?? null);
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
      router.refresh();
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
      router.refresh();
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
      setSelection([]);
      setStatus({
        ok: true,
        text: `Deleted ${assetIds.length} asset${assetIds.length !== 1 ? "s" : ""}.`,
      });
      router.refresh();
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
    router.refresh();
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
    router.refresh();
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
    router.refresh();
  }

  async function moveAssetsToFolder(assetIds: string[], folderId: string | null) {
    if (!assetIds.length) {
      return;
    }

    await saveBulkAssetEdit(assetIds, { folderId });
  }

  function handleAssetSelect(assetId: string, event: React.MouseEvent<HTMLButtonElement>) {
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
  }

  function handleDragCancel() {
    setActiveDragAssetIds([]);
  }

  return (
    <DndContext
      collisionDetection={collisionDetection}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_340px]">
        <aside className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-foreground">Folders</p>
                <p className="text-xs text-muted-foreground">
                  Drag assets from the card grid into folders and manage folders here or in the canvas.
                </p>
              </div>
              <Button
                onClick={() => void createFolder(selectedFolderId)}
                size="sm"
                type="button"
                variant="outline"
              >
                <FolderPlus className="size-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-3 p-3">
            <div className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              {activeDragAssets.length > 0 ? (
                <span className="inline-flex items-center gap-2">
                  <MoveRight className="size-3.5" />
                  Drop{" "}
                  <span className="font-medium text-foreground">
                    {activeDragAssets.length === 1
                      ? activeDragLeadAsset?.title
                      : `${activeDragAssets.length} selected assets`}
                  </span>{" "}
                  on a folder
                </span>
              ) : (
                "Use folders for campaigns, seasonal sets, and evergreen content."
              )}
            </div>
            <LibraryFolderTree
              activeDragType={activeDragAssets.length > 0 ? "asset" : null}
              droppableScope="media"
              folders={folders}
              onDelete={(folder) => void deleteFolder(folder)}
              onRename={(folder) => void renameFolder(folder)}
              onSelect={setSelectedFolderId}
              rootLabel="All media"
              selectedFolderId={selectedFolderId}
            />
          </div>
        </aside>

        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <button
                    className="hover:text-foreground"
                    onClick={() => setSelectedFolderId(null)}
                    type="button"
                  >
                    Media
                  </button>
                  {folderTrail.map((folder) => (
                    <span key={folder.id} className="inline-flex items-center gap-2">
                      <span>/</span>
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
                <p className="mt-2 text-base font-medium text-foreground">
                  {selectedFolderId ? folderMap.get(selectedFolderId)?.name : "All media"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="w-full sm:w-64"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search this folder"
                  value={search}
                />
                {selectedFolderId ? (
                  <>
                    <Button
                      onClick={() => {
                        const folder = folderMap.get(selectedFolderId);
                        if (folder) {
                          void renameFolder(folder);
                        }
                      }}
                      type="button"
                      variant="outline"
                    >
                      Rename folder
                    </Button>
                    <Button
                      onClick={() => {
                        const folder = folderMap.get(selectedFolderId);
                        if (folder) {
                          void deleteFolder(folder);
                        }
                      }}
                      type="button"
                      variant="outline"
                    >
                      Delete folder
                    </Button>
                  </>
                ) : null}
                <Button onClick={() => void createFolder(selectedFolderId)} type="button" variant="outline">
                  New folder
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-6 p-5">
            {selectionCount > 0 ? (
              <div className="rounded-xl border border-border bg-accent/40 p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {selectionCount} asset{selectionCount !== 1 ? "s" : ""} selected
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Drag from any selected card to move the whole selection into a folder.
                    </p>
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
                            void saveBulkAssetEdit(
                              selectedAssetIds,
                              {
                                tags: bulkTags
                                  .split(",")
                                  .map((tag) => tag.trim())
                                  .filter(Boolean),
                              },
                            )
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
                    <Button onClick={() => setSelection([])} type="button" variant="outline">
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

            {childFolders.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <FolderTile
                  count={assets.filter((asset) => (asset.folderId ?? null) === null).length}
                  folder={null}
                  isActive={selectedFolderId === null}
                  key="root-folder-tile"
                  label="Root library"
                  onDelete={() => undefined}
                  onOpen={() => setSelectedFolderId(null)}
                  onRename={() => undefined}
                />
                {childFolders.map((folder) => (
                  <FolderTile
                    count={assets.filter((asset) => (asset.folderId ?? null) === folder.id).length}
                    folder={folder}
                    isActive={selectedFolderId === folder.id}
                    key={folder.id}
                    onDelete={() => void deleteFolder(folder)}
                    onOpen={() => setSelectedFolderId(folder.id)}
                    onRename={() => void renameFolder(folder)}
                  />
                ))}
              </div>
            ) : null}

            {visibleAssets.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {visibleAssets.map((asset) => (
                  <MediaAssetCard
                    asset={asset}
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
              <div className="rounded-md border border-dashed border-border px-6 py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  {search
                    ? "No matching assets in this folder."
                    : "This folder is empty. Upload media or drag assets here from another folder."}
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
              <div className="space-y-4 p-4">
                <div className="rounded-md border border-border bg-background px-4 py-3">
                  <div className="text-sm font-medium text-foreground">
                    {selectionCount} assets ready
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Use the bulk bar to tag or delete, or drag the selected cards into another folder.
                  </div>
                </div>
                <div className="space-y-2">
                  {selectedAssets.slice(0, 5).map((asset) => (
                    <div
                      key={asset.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">{asset.title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {asset.folderId ? folderMap.get(asset.folderId)?.name : "Root"}
                        </div>
                      </div>
                    </div>
                  ))}
                  {selectedAssets.length > 5 ? (
                    <div className="text-xs text-muted-foreground">
                      +{selectedAssets.length - 5} more selected assets
                    </div>
                  ) : null}
                </div>
              </div>
            ) : selectedAsset ? (
              <div className="space-y-4 p-4">
                <div className="aspect-[16/10] overflow-hidden rounded-md border border-border bg-muted/30">
                  <img
                    alt={selectedAsset.title}
                    className="h-full w-full object-cover"
                    src={selectedAsset.previewUrl}
                  />
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
                    <dd className="text-foreground">{selectedAsset.type}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Size</dt>
                    <dd className="text-foreground">{prettyBytes(selectedAsset.sizeBytes)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Folder</dt>
                    <dd className="truncate text-foreground">
                      {selectedAsset.folderId ? folderMap.get(selectedAsset.folderId)?.name : "Root"}
                    </dd>
                  </div>
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
                Select an asset to edit details or drag it into a different folder.
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-medium text-foreground">Add media</p>
              <p className="mt-1 text-xs text-muted-foreground">
                New files and imports land in{" "}
                {selectedFolderId ? folderMap.get(selectedFolderId)?.name : "Root"}.
              </p>
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
                      router.refresh();
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
                  <p className={status?.ok ? "text-foreground" : "text-destructive"}>
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
          <div className="rounded-md border border-border bg-card px-3 py-3 text-sm font-medium text-foreground shadow-xl">
            {activeDragAssets.length === 1
              ? activeDragLeadAsset?.title
              : `${activeDragAssets.length} selected assets`}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
