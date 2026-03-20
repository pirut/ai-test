"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
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
  Pencil,
  Plus,
  Trash2,
  Video,
  X,
} from "lucide-react";
import type { LibraryFolder, MediaAsset, Playlist } from "@showroom/contracts";

import { LibraryFolderTree } from "@/components/library-folder-tree";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFolderMap, getFolderTrail } from "@/lib/library";
import { cn } from "@/lib/utils";

type QueueItem = {
  id: string;
  assetId: string;
  dwellSeconds: string | null;
};

type ActiveDrag =
  | { type: "asset"; assetIds: string[]; leadAssetId: string }
  | { type: "playlist"; playlistId: string }
  | { type: "queue-item"; queueItemId: string }
  | null;

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}:${String(s).padStart(2, "0")}`;
  return `0:${String(s).padStart(2, "0")}`;
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

function createQueueItem(assetId: string, dwellSeconds?: number | null): QueueItem {
  return {
    id: crypto.randomUUID(),
    assetId,
    dwellSeconds: dwellSeconds ? String(dwellSeconds) : null,
  };
}

function getPlaylistRuntimeSeconds(items: Playlist["items"]) {
  return items.reduce((sum, item) => {
    if (item.asset.type === "video") {
      return sum + Math.ceil(item.asset.durationSeconds ?? 0);
    }

    return sum + (item.dwellSeconds ?? 10);
  }, 0);
}

function getPlaylistRuntimeLabel(items: Playlist["items"]) {
  return formatDuration(getPlaylistRuntimeSeconds(items));
}

function sortPlaylists(playlists: Playlist[]) {
  return [...playlists].sort((a, b) => {
    if (a.isDefault !== b.isDefault) {
      return Number(b.isDefault) - Number(a.isDefault);
    }

    return a.name.localeCompare(b.name);
  });
}

function AssetPreview({
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
        "relative flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/20",
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

function PlaylistLibraryRow({
  isSelected,
  onSelect,
  playlist,
  runtimeLabel,
}: {
  isSelected: boolean;
  onSelect: () => void;
  playlist: Playlist;
  runtimeLabel: string;
}) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `playlist:${playlist.id}`,
      data: {
        type: "playlist",
        playlistId: playlist.id,
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
      <div className="grid gap-3 px-3 py-3 lg:grid-cols-[auto_minmax(0,1fr)_96px_72px_80px] lg:items-center">
        <button
          aria-label={`Drag ${playlist.name}`}
          className="flex size-7 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-background hover:text-foreground"
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>

        <button
          className="flex min-w-0 items-center justify-between gap-3 text-left"
          onClick={onSelect}
          type="button"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{playlist.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground lg:hidden">
              <span>{runtimeLabel}</span>
              <span>•</span>
              <span>
                {playlist.items.length} item{playlist.items.length !== 1 ? "s" : ""}
              </span>
              {playlist.isDefault ? (
                <>
                  <span>•</span>
                  <span>Default</span>
                </>
              ) : null}
            </div>
          </div>
        </button>

        <div className="hidden text-xs text-muted-foreground lg:block">{runtimeLabel}</div>
        <div className="hidden text-xs text-muted-foreground lg:block">
          {playlist.items.length}
        </div>
        <div className="hidden justify-self-end lg:block">
          {playlist.isDefault ? (
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Default
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function SourceAssetRow({
  asset,
  folderName,
  isSelected,
  onSelect,
  onToggleSelect,
  onAdd,
  selectionBadge,
}: {
  asset: MediaAsset;
  folderName: string;
  isSelected: boolean;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  onToggleSelect: () => void;
  onAdd: () => void;
  selectionBadge: string | null;
}) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `asset:${asset.id}`,
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
      <div className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex items-start gap-2 pt-1">
            <button
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded border text-[11px] font-semibold transition-colors",
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
              aria-label={`Drag ${asset.title}`}
              className="flex size-6 shrink-0 items-center justify-center rounded border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-background hover:text-foreground"
              ref={setActivatorNodeRef}
              type="button"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-3.5" />
            </button>
          </div>

          <button
            className="flex min-w-0 flex-1 items-start gap-3 text-left"
            onClick={onSelect}
            type="button"
          >
            <AssetPreview asset={asset} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-sm font-medium text-foreground">{asset.title}</div>
                {asset.sourceType === "youtube" ? (
                  <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    YouTube
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>{asset.type === "video" ? "Video" : "Image"}</span>
                <span>•</span>
                <span>{prettyBytes(asset.sizeBytes)}</span>
                {asset.type === "video" && asset.durationSeconds ? (
                  <>
                    <span>•</span>
                    <span>{formatDuration(Math.ceil(asset.durationSeconds))}</span>
                  </>
                ) : null}
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">{folderName}</div>
            </div>
          </button>
        </div>

        <Button
          onClick={(event) => {
            event.stopPropagation();
            onAdd();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          Add
        </Button>
      </div>
    </article>
  );
}

function QueueRoot({
  children,
  isActive,
}: {
  children: React.ReactNode;
  isActive: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: "playlist-queue-root",
    data: {
      type: "queue-root",
    },
  });

  return (
    <div
      className={cn(
        "space-y-3 rounded-md border border-dashed border-border bg-background/40 p-3 transition-colors",
        isOver && isActive ? "border-foreground/25 bg-accent/30" : "",
      )}
      ref={setNodeRef}
    >
      {children}
    </div>
  );
}

function QueueCard({
  asset,
  item,
  order,
  onChangeDwell,
  onRemove,
}: {
  asset: MediaAsset;
  item: QueueItem;
  order: number;
  onChangeDwell: (value: string) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `queue:${item.id}`,
    data: {
      type: "queue-item",
      queueItemId: item.id,
    },
  });

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card transition-colors",
        isDragging ? "opacity-40" : "",
      )}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="grid gap-3 px-3 py-3 md:grid-cols-[auto_auto_minmax(0,1fr)_96px_auto] md:items-center">
        <button
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          type="button"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>

        <div className="hidden md:flex h-8 w-8 items-center justify-center rounded-md bg-background text-xs font-medium text-muted-foreground">
          {order + 1}
        </div>

        <div className="flex min-w-0 items-start gap-3">
          <AssetPreview asset={asset} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">{asset.title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>{asset.type === "video" ? "Video" : "Image"}</span>
              {asset.type === "video" && asset.durationSeconds ? (
                <>
                  <span>•</span>
                  <span>{formatDuration(Math.ceil(asset.durationSeconds))}</span>
                </>
              ) : null}
              {asset.type === "image" ? (
                <>
                  <span>•</span>
                  <span>{item.dwellSeconds || "10"}s dwell</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {asset.type === "image" ? (
          <Input
            className="h-8 w-24"
            onChange={(event) => onChangeDwell(event.target.value)}
            placeholder="10"
            value={item.dwellSeconds ?? ""}
          />
        ) : (
          <div className="hidden md:block text-xs text-muted-foreground">Fixed runtime</div>
        )}

        <button
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={onRemove}
          type="button"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function PlaylistManager({
  initialPlaylists,
  mediaAssets,
  initialPlaylistFolders,
  initialMediaFolders,
}: {
  initialPlaylists: Playlist[];
  mediaAssets: MediaAsset[];
  initialPlaylistFolders: LibraryFolder[];
  initialMediaFolders: LibraryFolder[];
}) {
  const router = useRouter();
  const [playlists, setPlaylists] = useState(initialPlaylists);
  const [assets, setAssets] = useState(mediaAssets);
  const [playlistFolders, setPlaylistFolders] = useState(initialPlaylistFolders);
  const [mediaFolders] = useState(initialMediaFolders);
  const [selectedPlaylistFolderId, setSelectedPlaylistFolderId] = useState<string | null>(null);
  const [selectedMediaFolderId, setSelectedMediaFolderId] = useState<string | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [playlistSearch, setPlaylistSearch] = useState("");
  const [mediaSearch, setMediaSearch] = useState("");
  const [playlistFolderSearch, setPlaylistFolderSearch] = useState("");
  const [mediaFolderSearch, setMediaFolderSearch] = useState("");
  const [name, setName] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [makeDefault, setMakeDefault] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedSourceAssetIds, setSelectedSourceAssetIds] = useState<string[]>([]);
  const [lastSelectedSourceIndex, setLastSelectedSourceIndex] = useState<number | null>(null);
  const [youtubePlaylistUrl, setYoutubePlaylistUrl] = useState("");
  const [youtubePlaylistName, setYoutubePlaylistName] = useState("");
  const [youtubePlaylistTags, setYoutubePlaylistTags] = useState("");
  const [youtubePlaylistDefault, setYoutubePlaylistDefault] = useState(false);
  const [isImportingYouTubePlaylist, setIsImportingYouTubePlaylist] = useState(false);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null);

  const deferredPlaylistSearch = useDeferredValue(playlistSearch);
  const deferredMediaSearch = useDeferredValue(mediaSearch);
  const deferredPlaylistFolderSearch = useDeferredValue(playlistFolderSearch);
  const deferredMediaFolderSearch = useDeferredValue(mediaFolderSearch);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );

  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const playlistFolderMap = useMemo(() => getFolderMap(playlistFolders), [playlistFolders]);
  const mediaFolderMap = useMemo(() => getFolderMap(mediaFolders), [mediaFolders]);
  const selectedSourceAssetSet = useMemo(
    () => new Set(selectedSourceAssetIds),
    [selectedSourceAssetIds],
  );
  const currentDefault = useMemo(
    () => playlists.find((playlist) => playlist.isDefault) ?? null,
    [playlists],
  );
  const playlistFolderCounts = useMemo(() => {
    const counts = new Map<string | null, number>();
    for (const playlist of playlists) {
      const key = playlist.folderId ?? null;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [playlists]);
  const mediaFolderCounts = useMemo(() => {
    const counts = new Map<string | null, number>();
    for (const asset of assets) {
      const key = asset.folderId ?? null;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [assets]);
  const visiblePlaylists = useMemo(() => {
    const query = deferredPlaylistSearch.trim().toLowerCase();
    return sortPlaylists(playlists).filter((playlist) => {
      if ((playlist.folderId ?? null) !== selectedPlaylistFolderId) {
        return false;
      }

      if (!query) {
        return true;
      }

      return playlist.name.toLowerCase().includes(query);
    });
  }, [deferredPlaylistSearch, playlists, selectedPlaylistFolderId]);
  const visibleAssets = useMemo(() => {
    const query = deferredMediaSearch.trim().toLowerCase();
    return assets.filter((asset) => {
      if ((asset.folderId ?? null) !== selectedMediaFolderId) {
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
  }, [assets, deferredMediaSearch, selectedMediaFolderId]);
  const queueDurationLabel = useMemo(() => {
    const totalSeconds = queue.reduce((sum, item) => {
      const asset = assetMap.get(item.assetId);
      if (!asset) {
        return sum;
      }

      if (asset.type === "video") {
        return sum + Math.ceil(asset.durationSeconds ?? 0);
      }

      const dwell = Number(item.dwellSeconds);
      return sum + (Number.isFinite(dwell) && dwell > 0 ? dwell : 10);
    }, 0);

    return totalSeconds > 0 ? formatDuration(totalSeconds) : "0:00";
  }, [assetMap, queue]);
  const playlistFolderTrail = useMemo(
    () =>
      selectedPlaylistFolderId ? getFolderTrail(selectedPlaylistFolderId, playlistFolderMap) : [],
    [playlistFolderMap, selectedPlaylistFolderId],
  );
  const mediaFolderTrail = useMemo(
    () => (selectedMediaFolderId ? getFolderTrail(selectedMediaFolderId, mediaFolderMap) : []),
    [mediaFolderMap, selectedMediaFolderId],
  );
  const activePlaylist =
    activeDrag?.type === "playlist"
      ? playlists.find((playlist) => playlist.id === activeDrag.playlistId) ?? null
      : null;
  const activeAsset =
    activeDrag?.type === "asset"
      ? assets.find((asset) => asset.id === activeDrag.leadAssetId) ?? null
      : null;
  const activeQueueAsset =
    activeDrag?.type === "queue-item"
      ? assetMap.get(queue.find((item) => item.id === activeDrag.queueItemId)?.assetId ?? "")
      : null;
  const selectedPlaylistFolderName = selectedPlaylistFolderId
    ? playlistFolderMap.get(selectedPlaylistFolderId)?.name ?? "Folder"
    : "Root playlists";
  const selectedMediaFolderName = selectedMediaFolderId
    ? mediaFolderMap.get(selectedMediaFolderId)?.name ?? "Folder"
    : "Root media";
  const currentPlaylistFolderCount = playlistFolderCounts.get(selectedPlaylistFolderId ?? null) ?? 0;
  const currentMediaFolderCount = mediaFolderCounts.get(selectedMediaFolderId ?? null) ?? 0;
  const sourceSelectionCount = selectedSourceAssetIds.length;

  useEffect(() => {
    const scopedIds = selectedSourceAssetIds.filter((assetId) => {
      const asset = assetMap.get(assetId);
      return asset ? (asset.folderId ?? null) === selectedMediaFolderId : false;
    });

    if (scopedIds.length !== selectedSourceAssetIds.length) {
      setSelectedSourceAssetIds(scopedIds);
      setLastSelectedSourceIndex(scopedIds.length > 0 ? 0 : null);
    }
  }, [assetMap, selectedMediaFolderId, selectedSourceAssetIds]);

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
        setSelectedSourceAssetIds(nextIds);
        setLastSelectedSourceIndex(nextIds.length > 0 ? nextIds.length - 1 : null);
        return;
      }

      if (event.key === "Escape" && selectedSourceAssetIds.length > 0) {
        event.preventDefault();
        clearSourceSelection();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedSourceAssetIds.length, visibleAssets]);

  function refreshData() {
    startTransition(() => {
      router.refresh();
    });
  }

  function loadPlaylist(playlist: Playlist) {
    setSelectedPlaylistId(playlist.id);
    setSelectedPlaylistFolderId(playlist.folderId ?? null);
    setName(playlist.name);
    setMakeDefault(playlist.isDefault);
    setQueue(
      [...playlist.items]
        .sort((a, b) => a.order - b.order)
        .map((item) => createQueueItem(item.asset.id, item.dwellSeconds)),
    );
    setStatus(null);
  }

  function startNewPlaylist() {
    setSelectedPlaylistId(null);
    setName("");
    setQueue([]);
    setMakeDefault(false);
    setStatus(null);
  }

  function setSourceSelection(assetIds: string[]) {
    setSelectedSourceAssetIds(assetIds);
  }

  function clearSourceSelection() {
    setSourceSelection([]);
    setLastSelectedSourceIndex(null);
  }

  function addAssetsToQueue(assetIds: string[], targetIndex?: number) {
    if (!assetIds.length) {
      return;
    }

    setQueue((current) => {
      const nextItems = assetIds.map((assetId) => createQueueItem(assetId));
      if (typeof targetIndex !== "number" || targetIndex < 0 || targetIndex > current.length) {
        return [...current, ...nextItems];
      }

      const next = [...current];
      next.splice(targetIndex, 0, ...nextItems);
      return next;
    });
  }

  function addAssetToQueue(assetId: string, targetIndex?: number) {
    addAssetsToQueue([assetId], targetIndex);
  }

  function updateQueueItem(queueItemId: string, updates: Partial<QueueItem>) {
    setQueue((current) =>
      current.map((item) => (item.id === queueItemId ? { ...item, ...updates } : item)),
    );
  }

  function removeQueueItem(queueItemId: string) {
    setQueue((current) => current.filter((item) => item.id !== queueItemId));
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
        kind: "playlist",
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
    setPlaylistFolders((current) => [...current, nextFolder]);
    setSelectedPlaylistFolderId(nextFolder.id);
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
    setPlaylistFolders((current) =>
      current.map((entry) => (entry.id === folder.id ? nextFolder : entry)),
    );
    refreshData();
  }

  async function deleteFolder(folder: LibraryFolder) {
    const confirmed = window.confirm(
      "Delete this folder? Child folders and playlists will move to the parent.",
    );
    if (!confirmed) {
      return;
    }

    const response = await fetch(`/api/folders/${folder.id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json();
      setStatus({ ok: false, text: payload.error ?? "Unable to delete folder" });
      return;
    }

    setPlaylistFolders((current) =>
      current
        .filter((entry) => entry.id !== folder.id)
        .map((entry) =>
          entry.parentId === folder.id ? { ...entry, parentId: folder.parentId } : entry,
        ),
    );
    setPlaylists((current) =>
      current.map((playlist) =>
        playlist.folderId === folder.id ? { ...playlist, folderId: folder.parentId } : playlist,
      ),
    );
    if (selectedPlaylistFolderId === folder.id) {
      setSelectedPlaylistFolderId(folder.parentId ?? null);
    }
    refreshData();
  }

  async function movePlaylistToFolder(playlistId: string, folderId: string | null) {
    const previousFolderId =
      playlists.find((playlist) => playlist.id === playlistId)?.folderId ?? null;
    const movingSelectedPlaylist = selectedPlaylistId === playlistId;

    setPlaylists((current) =>
      current.map((playlist) =>
        playlist.id === playlistId ? { ...playlist, folderId } : playlist,
      ),
    );
    if (movingSelectedPlaylist) {
      setSelectedPlaylistFolderId(folderId);
    }
    setStatus({ ok: true, text: "Moving playlist..." });

    try {
      const response = await fetch(`/api/playlists/${playlistId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to move playlist");
      }

      const nextPlaylist = payload.playlist as Playlist;
      setPlaylists((current) =>
        current.map((playlist) => (playlist.id === playlistId ? nextPlaylist : playlist)),
      );
      if (movingSelectedPlaylist) {
        setSelectedPlaylistFolderId(nextPlaylist.folderId ?? null);
      }
      setStatus({ ok: true, text: "Moved playlist." });
      refreshData();
    } catch (error) {
      setPlaylists((current) =>
        current.map((playlist) =>
          playlist.id === playlistId ? { ...playlist, folderId: previousFolderId } : playlist,
        ),
      );
      if (movingSelectedPlaylist) {
        setSelectedPlaylistFolderId(previousFolderId);
      }
      setStatus({
        ok: false,
        text: error instanceof Error ? error.message : "Unable to move playlist",
      });
    }
  }

  async function handleImportYouTubePlaylist() {
    try {
      setIsImportingYouTubePlaylist(true);
      setStatus({ ok: true, text: "Importing YouTube playlist..." });
      const response = await fetch("/api/playlists/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          makeDefault: youtubePlaylistDefault,
          name: youtubePlaylistName.trim() || undefined,
          tags: youtubePlaylistTags
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
          url: youtubePlaylistUrl.trim(),
          folderId: selectedPlaylistFolderId,
          assetFolderId: selectedMediaFolderId,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to import YouTube playlist");
      }

      const nextPlaylist = payload.playlist as Playlist;
      const nextAssets = payload.assets as MediaAsset[];

      setAssets((current) => [
        ...nextAssets,
        ...current.filter((asset) => !nextAssets.some((nextAsset) => nextAsset.id === asset.id)),
      ]);
      setPlaylists((current) => {
        const remaining = current.filter((playlist) => playlist.id !== nextPlaylist.id);
        const merged = [nextPlaylist, ...remaining].map((playlist) => ({
          ...playlist,
          isDefault: nextPlaylist.isDefault ? playlist.id === nextPlaylist.id : playlist.isDefault,
        }));
        return merged;
      });

      loadPlaylist(nextPlaylist);
      setYoutubePlaylistUrl("");
      setYoutubePlaylistName("");
      setYoutubePlaylistTags("");
      setYoutubePlaylistDefault(false);
      setStatus({
        ok: true,
        text: `Imported "${nextPlaylist.name}" with ${nextPlaylist.items.length} videos.`,
      });
      refreshData();
    } catch (error) {
      setStatus({
        ok: false,
        text: error instanceof Error ? error.message : "Unable to import YouTube playlist",
      });
    } finally {
      setIsImportingYouTubePlaylist(false);
    }
  }

  async function handleSave() {
    if (!name.trim() || queue.length === 0) {
      setStatus({ ok: false, text: "Add a name and at least one item." });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playlistId: selectedPlaylistId ?? undefined,
          name: name.trim(),
          folderId: selectedPlaylistFolderId,
          makeDefault,
          itemIds: queue.map((item) => {
            const dwell = Number(item.dwellSeconds);
            return {
              mediaAssetId: item.assetId,
              dwellSeconds: Number.isFinite(dwell) && dwell > 0 ? dwell : undefined,
            };
          }),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save playlist");
      }

      const nextPlaylist = payload.playlist as Playlist;
      setPlaylists((current) => {
        const remaining = current.filter((playlist) => playlist.id !== nextPlaylist.id);
        const merged = [nextPlaylist, ...remaining].map((playlist) => ({
          ...playlist,
          isDefault: nextPlaylist.isDefault ? playlist.id === nextPlaylist.id : playlist.isDefault,
        }));
        return merged;
      });
      loadPlaylist(nextPlaylist);
      setStatus({ ok: true, text: `Saved "${nextPlaylist.name}".` });
      refreshData();
    } catch (error) {
      setStatus({
        ok: false,
        text: error instanceof Error ? error.message : "Unable to save playlist",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(playlistId: string) {
    const confirmed = window.confirm("Delete this playlist?");
    if (!confirmed) {
      return;
    }

    const response = await fetch(`/api/playlists/${playlistId}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json();
      setStatus({ ok: false, text: payload.error ?? "Unable to delete playlist" });
      return;
    }

    setPlaylists((current) => current.filter((playlist) => playlist.id !== playlistId));
    if (selectedPlaylistId === playlistId) {
      startNewPlaylist();
    }
    refreshData();
  }

  function handleSourceAssetSelect(assetId: string, event: MouseEvent<HTMLButtonElement>) {
    const assetIndex = visibleAssets.findIndex((asset) => asset.id === assetId);
    if (assetIndex === -1) {
      return;
    }

    if (event.shiftKey && lastSelectedSourceIndex !== null) {
      const start = Math.min(lastSelectedSourceIndex, assetIndex);
      const end = Math.max(lastSelectedSourceIndex, assetIndex);
      setSourceSelection(visibleAssets.slice(start, end + 1).map((asset) => asset.id));
      setLastSelectedSourceIndex(assetIndex);
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      if (selectedSourceAssetSet.has(assetId)) {
        const nextIds = selectedSourceAssetIds.filter((id) => id !== assetId);
        setSourceSelection(nextIds);
      } else {
        setSourceSelection([...selectedSourceAssetIds, assetId]);
      }
      setLastSelectedSourceIndex(assetIndex);
      return;
    }

    setSourceSelection([assetId]);
    setLastSelectedSourceIndex(assetIndex);
  }

  function toggleSourceAssetSelection(assetId: string) {
    const assetIndex = visibleAssets.findIndex((asset) => asset.id === assetId);
    if (selectedSourceAssetSet.has(assetId)) {
      setSourceSelection(selectedSourceAssetIds.filter((id) => id !== assetId));
      return;
    }

    setSourceSelection([...selectedSourceAssetIds, assetId]);
    if (assetIndex !== -1) {
      setLastSelectedSourceIndex(assetIndex);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as
      | { type?: string; assetId?: string; playlistId?: string; queueItemId?: string }
      | undefined;

    if (data?.type === "playlist" && data.playlistId) {
      setActiveDrag({ type: "playlist", playlistId: data.playlistId });
      return;
    }

    if (data?.type === "asset" && data.assetId) {
      const assetIds = selectedSourceAssetSet.has(data.assetId)
        ? selectedSourceAssetIds
        : [data.assetId];
      setSourceSelection(assetIds);
      setActiveDrag({ type: "asset", assetIds, leadAssetId: data.assetId });
      return;
    }

    if (data?.type === "queue-item" && data.queueItemId) {
      setActiveDrag({ type: "queue-item", queueItemId: data.queueItemId });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeData = event.active.data.current as
      | { type?: string; assetId?: string; playlistId?: string; queueItemId?: string }
      | undefined;
    const overData = event.over?.data.current as
      | { type?: string; scope?: string; folderId?: string | null; queueItemId?: string }
      | undefined;

    if (!activeData || !overData) {
      setActiveDrag(null);
      return;
    }

    if (
      activeData.type === "playlist" &&
      activeData.playlistId &&
      overData.type === "folder" &&
      overData.scope === "playlist"
    ) {
      void movePlaylistToFolder(activeData.playlistId, overData.folderId ?? null);
      setActiveDrag(null);
      return;
    }

    if (activeData.type === "asset" && activeData.assetId) {
      const draggedAssetIds =
        activeDrag?.type === "asset" ? activeDrag.assetIds : [activeData.assetId];
      if (overData.type === "queue-root") {
        addAssetsToQueue(draggedAssetIds);
      } else if (overData.type === "queue-item" && overData.queueItemId) {
        const targetIndex = queue.findIndex((item) => item.id === overData.queueItemId);
        addAssetsToQueue(draggedAssetIds, targetIndex === -1 ? undefined : targetIndex);
      }
      setActiveDrag(null);
      return;
    }

    if (activeData.type === "queue-item" && activeData.queueItemId) {
      const fromIndex = queue.findIndex((item) => item.id === activeData.queueItemId);
      if (fromIndex === -1) {
        setActiveDrag(null);
        return;
      }

      if (overData.type === "queue-root") {
        setQueue((current) => arrayMove(current, fromIndex, current.length - 1));
      } else if (overData.type === "queue-item" && overData.queueItemId) {
        const toIndex = queue.findIndex((item) => item.id === overData.queueItemId);
        if (toIndex !== -1 && toIndex !== fromIndex) {
          setQueue((current) => arrayMove(current, fromIndex, toIndex));
        }
      }
    }

    setActiveDrag(null);
  }

  function handleDragCancel() {
    setActiveDrag(null);
  }

  return (
    <DndContext
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_380px]">
        <aside className="space-y-5">
          <section className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-medium text-foreground">Playlist folders</p>
              <Button
                onClick={() => void createFolder(selectedPlaylistFolderId)}
                size="sm"
                type="button"
                variant="outline"
              >
                <FolderPlus className="size-4" />
              </Button>
            </div>
            <div className="space-y-4 p-3">
              <Input
                onChange={(event) => setPlaylistFolderSearch(event.target.value)}
                placeholder="Find folder"
                value={playlistFolderSearch}
              />

              {activeDrag?.type === "playlist" ? (
                <div className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                  Drop <span className="font-medium text-foreground">{activePlaylist?.name ?? "playlist"}</span> onto a folder to move it.
                </div>
              ) : null}

              <LibraryFolderTree
                activeDragType={activeDrag?.type === "playlist" ? "playlist" : null}
                droppableScope="playlist"
                folders={playlistFolders}
                filterQuery={deferredPlaylistFolderSearch}
                itemCounts={playlistFolderCounts}
                onDelete={(folder) => void deleteFolder(folder)}
                onRename={(folder) => void renameFolder(folder)}
                onSelect={setSelectedPlaylistFolderId}
                rootLabel="Root playlists"
                selectedFolderId={selectedPlaylistFolderId}
              />
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-medium text-foreground">Current folder</p>
            </div>
            <div className="space-y-3 p-4">
              <div>
                <div className="text-sm font-medium text-foreground">{selectedPlaylistFolderName}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {currentPlaylistFolderCount} playlist{currentPlaylistFolderCount !== 1 ? "s" : ""}
                </div>
              </div>
              {selectedPlaylistFolderId ? (
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => {
                      const folder = playlistFolderMap.get(selectedPlaylistFolderId);
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
                      const folder = playlistFolderMap.get(selectedPlaylistFolderId);
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
                  Root playlists stay visible here until you move them into a folder.
                </p>
              )}
            </div>
          </section>
        </aside>

        <div className="space-y-5">
          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <button
                      className="hover:text-foreground"
                      onClick={() => setSelectedPlaylistFolderId(null)}
                      type="button"
                    >
                      Root playlists
                    </button>
                    {playlistFolderTrail.map((folder) => (
                      <span key={folder.id} className="inline-flex min-w-0 items-center gap-2">
                        <ChevronRight className="size-4 shrink-0" />
                        <button
                          className="truncate hover:text-foreground"
                          onClick={() => setSelectedPlaylistFolderId(folder.id)}
                          type="button"
                        >
                          {folder.name}
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <h2 className="text-lg font-semibold text-foreground">{selectedPlaylistFolderName}</h2>
                    <span className="text-sm text-muted-foreground">{visiblePlaylists.length} shown</span>
                    {playlistSearch.trim() ? (
                      <span className="text-sm text-muted-foreground">
                        {currentPlaylistFolderCount} total in folder
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex w-full gap-2 xl:w-auto">
                  <Input
                    className="flex-1 xl:w-72"
                    onChange={(event) => setPlaylistSearch(event.target.value)}
                    placeholder="Search playlists"
                    value={playlistSearch}
                  />
                  <Button onClick={startNewPlaylist} type="button" variant="outline">
                    <Plus className="size-4" />
                    New
                  </Button>
                </div>
              </div>
            </div>

            <div className="px-5 py-3">
              <div className="hidden border-b border-border/75 pb-2 text-xs font-medium text-muted-foreground lg:grid lg:grid-cols-[minmax(0,1fr)_96px_72px_80px] lg:pl-10">
                <span>Playlist</span>
                <span>Runtime</span>
                <span>Items</span>
                <span className="justify-self-end">Status</span>
              </div>

              {visiblePlaylists.length > 0 ? (
                <div>
                  {visiblePlaylists.map((playlist) => (
                    <PlaylistLibraryRow
                      isSelected={selectedPlaylistId === playlist.id}
                      key={playlist.id}
                      onSelect={() => loadPlaylist(playlist)}
                      playlist={playlist}
                      runtimeLabel={getPlaylistRuntimeLabel(playlist.items)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
                  {playlistSearch.trim()
                    ? "No matching playlists in this folder."
                    : "No playlists in this folder."}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-foreground">
                    {selectedPlaylistId ? "Edit playlist" : "New playlist"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Saving into <span className="text-foreground">{selectedPlaylistFolderName}</span>
                  </div>
                </div>

                <div className="flex shrink-0 gap-2">
                  <Button disabled={saving} onClick={() => void handleSave()} type="button">
                    {saving ? "Saving..." : "Save playlist"}
                  </Button>
                  <Button onClick={startNewPlaylist} type="button" variant="outline">
                    Reset
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-1.5">
                  <Label htmlFor="playlist-name">Playlist name</Label>
                  <Input
                    id="playlist-name"
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Main showroom loop"
                    value={name}
                  />
                </div>

                <label className="flex items-center justify-between gap-4 rounded-md border border-border bg-background px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-foreground">Fallback playlist</div>
                    <div className="text-xs text-muted-foreground">
                      {currentDefault
                        ? `Current default: ${currentDefault.name}`
                        : "No fallback playlist yet"}
                    </div>
                  </div>
                  <input
                    checked={makeDefault}
                    className="size-4 accent-[var(--primary)]"
                    onChange={(event) => setMakeDefault(event.target.checked)}
                    type="checkbox"
                  />
                </label>
              </div>

              {status ? (
                <div
                  className={cn(
                    "mt-4 rounded-md border border-border px-3 py-2 text-sm",
                    status.ok ? "text-foreground" : "text-destructive",
                  )}
                >
                  {status.text}
                </div>
              ) : null}
            </div>

            <div className="space-y-4 p-5">
              <QueueRoot isActive={activeDrag?.type === "asset" || activeDrag?.type === "queue-item"}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-sm font-medium text-foreground">Queue</div>
                    <span className="text-xs text-muted-foreground">
                      {queue.length} item{queue.length !== 1 ? "s" : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">{queueDurationLabel}</span>
                  </div>
                  {queue.length > 0 ? (
                    <Button onClick={() => setQueue([])} type="button" variant="outline">
                      Clear queue
                    </Button>
                  ) : null}
                </div>

                {queue.length > 0 ? (
                  <SortableContext
                    items={queue.map((item) => `queue:${item.id}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {queue.map((item, index) => {
                        const asset = assetMap.get(item.assetId);
                        if (!asset) {
                          return null;
                        }

                        return (
                          <QueueCard
                            asset={asset}
                            item={item}
                            key={item.id}
                            onChangeDwell={(value) =>
                              updateQueueItem(item.id, {
                                dwellSeconds: value || null,
                              })
                            }
                            onRemove={() => removeQueueItem(item.id)}
                            order={index}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                ) : (
                  <div className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                    Drop media here to build the playlist.
                  </div>
                )}
              </QueueRoot>

              {selectedPlaylistId ? (
                <Button
                  className="justify-start"
                  onClick={() => void handleDelete(selectedPlaylistId)}
                  type="button"
                  variant="outline"
                >
                  <Trash2 className="size-4" />
                  Delete playlist
                </Button>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-4">
              <div className="space-y-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <button
                      className="hover:text-foreground"
                      onClick={() => setSelectedMediaFolderId(null)}
                      type="button"
                    >
                      Root media
                    </button>
                    {mediaFolderTrail.map((folder) => (
                      <span key={folder.id} className="inline-flex min-w-0 items-center gap-2">
                        <ChevronRight className="size-4 shrink-0" />
                        <button
                          className="truncate hover:text-foreground"
                          onClick={() => setSelectedMediaFolderId(folder.id)}
                          type="button"
                        >
                          {folder.name}
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <h2 className="text-lg font-semibold text-foreground">{selectedMediaFolderName}</h2>
                    <span className="text-sm text-muted-foreground">{visibleAssets.length} shown</span>
                    {mediaSearch.trim() ? (
                      <span className="text-sm text-muted-foreground">
                        {currentMediaFolderCount} total in folder
                      </span>
                    ) : null}
                  </div>
                </div>

                <Input
                  onChange={(event) => setMediaSearch(event.target.value)}
                  placeholder="Search media"
                  value={mediaSearch}
                />
              </div>
            </div>

            <div className="space-y-4 p-3">
              <Input
                onChange={(event) => setMediaFolderSearch(event.target.value)}
                placeholder="Find folder"
                value={mediaFolderSearch}
              />

              <LibraryFolderTree
                filterQuery={deferredMediaFolderSearch}
                folders={mediaFolders}
                itemCounts={mediaFolderCounts}
                onSelect={setSelectedMediaFolderId}
                rootLabel="Root media"
                selectedFolderId={selectedMediaFolderId}
              />

              <div className="flex flex-wrap items-center gap-2">
                {visibleAssets.length > 0 ? (
                  <Button
                    onClick={() => {
                      const nextIds = visibleAssets.map((asset) => asset.id);
                      setSourceSelection(nextIds);
                      setLastSelectedSourceIndex(nextIds.length > 0 ? nextIds.length - 1 : null);
                    }}
                    type="button"
                    variant="outline"
                  >
                    Select all
                  </Button>
                ) : null}
                {sourceSelectionCount > 0 ? (
                  <Button
                    onClick={() => addAssetsToQueue(selectedSourceAssetIds)}
                    type="button"
                    variant="outline"
                  >
                    Add selected
                  </Button>
                ) : null}
                {sourceSelectionCount > 0 ? (
                  <Button onClick={clearSourceSelection} type="button" variant="outline">
                    <X className="size-4" />
                    Clear
                  </Button>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  Shift-click ranges. Ctrl/Cmd-click toggles. Ctrl/Cmd+A selects visible.
                </span>
              </div>

              {visibleAssets.length > 0 ? (
                <div>
                  {visibleAssets.map((asset) => (
                    <SourceAssetRow
                      asset={asset}
                      folderName={
                        asset.folderId
                          ? mediaFolderMap.get(asset.folderId)?.name ?? "Folder"
                          : "Root media"
                      }
                      isSelected={selectedSourceAssetSet.has(asset.id)}
                      key={asset.id}
                      onAdd={() => addAssetToQueue(asset.id)}
                      onSelect={(event) => handleSourceAssetSelect(asset.id, event)}
                      onToggleSelect={() => toggleSourceAssetSelection(asset.id)}
                      selectionBadge={
                        selectedSourceAssetSet.has(asset.id)
                          ? sourceSelectionCount > 1
                            ? String(selectedSourceAssetIds.indexOf(asset.id) + 1)
                            : "check"
                          : null
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
                  {mediaSearch.trim()
                    ? "No matching media in this folder."
                    : "No media in this folder."}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-medium text-foreground">Import YouTube playlist</p>
            </div>
            <div className="space-y-3 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="youtube-playlist-url">Playlist URL</Label>
                <Input
                  id="youtube-playlist-url"
                  onChange={(event) => setYoutubePlaylistUrl(event.target.value)}
                  placeholder="https://www.youtube.com/playlist?list=..."
                  value={youtubePlaylistUrl}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="youtube-playlist-name">Override name</Label>
                <Input
                  id="youtube-playlist-name"
                  onChange={(event) => setYoutubePlaylistName(event.target.value)}
                  placeholder="Optional"
                  value={youtubePlaylistName}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="youtube-playlist-tags">Tags</Label>
                <Input
                  id="youtube-playlist-tags"
                  onChange={(event) => setYoutubePlaylistTags(event.target.value)}
                  placeholder="youtube, campaign"
                  value={youtubePlaylistTags}
                />
              </div>
              <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span>Set as default</span>
                <input
                  checked={youtubePlaylistDefault}
                  className="size-4 accent-[var(--primary)]"
                  onChange={(event) => setYoutubePlaylistDefault(event.target.checked)}
                  type="checkbox"
                />
              </label>
              <Button
                className="w-full"
                disabled={!youtubePlaylistUrl.trim() || isImportingYouTubePlaylist}
                onClick={() => void handleImportYouTubePlaylist()}
                type="button"
              >
                {isImportingYouTubePlaylist ? "Importing..." : "Import playlist"}
              </Button>
              <div className="text-xs text-muted-foreground">
                Playlist saves to {selectedPlaylistFolderName}. Imported videos land in {selectedMediaFolderName}.
              </div>
            </div>
          </section>
        </aside>
      </div>

      <DragOverlay>
        {activePlaylist ? (
          <div className="rounded-md border border-border bg-card px-3 py-3 text-sm font-medium text-foreground shadow-xl">
            {activePlaylist.name}
          </div>
        ) : null}
        {activeAsset ? (
          <div className="rounded-md border border-border bg-card px-3 py-3 text-sm font-medium text-foreground shadow-xl">
            {activeDrag?.type === "asset" && activeDrag.assetIds.length > 1
              ? `${activeDrag.assetIds.length} media items`
              : activeAsset.title}
          </div>
        ) : null}
        {activeQueueAsset ? (
          <div className="rounded-md border border-border bg-card px-3 py-3 text-sm font-medium text-foreground shadow-xl">
            {activeQueueAsset.title}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
