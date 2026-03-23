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
  ChevronDown,
  ChevronRight,
  FolderPlus,
  GripVertical,
  Plus,
  Video,
  X,
} from "lucide-react";
import type { LibraryFolder, MediaAsset, Playlist } from "@showroom/contracts";

import { LibraryFolderTree } from "@/components/library-folder-tree";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFolderMap, getFolderTrail } from "@/lib/library";
import { cn } from "@/lib/utils";

/* ── Types ──────────────────────────────────────────── */

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

/* ── Utilities ──────────────────────────────────────── */

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}:${String(s).padStart(2, "0")}`;
  return `0:${String(s).padStart(2, "0")}`;
}

function prettyBytes(bytes: number) {
  if (bytes <= 0) return "remote";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
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
    if (item.asset.type === "video") return sum + Math.ceil(item.asset.durationSeconds ?? 0);
    return sum + (item.dwellSeconds ?? 10);
  }, 0);
}

function getPlaylistRuntimeLabel(items: Playlist["items"]) {
  return formatDuration(getPlaylistRuntimeSeconds(items));
}

function sortPlaylists(playlists: Playlist[]) {
  return [...playlists].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return Number(b.isDefault) - Number(a.isDefault);
    return a.name.localeCompare(b.name);
  });
}

/* ── Sub-components ─────────────────────────────────── */

function AssetThumb({ asset, className }: { asset: MediaAsset; className?: string }) {
  const showImage = asset.type === "image" || asset.sourceType === "youtube";
  return (
    <div
      className={cn(
        "relative flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/5 bg-[var(--surface-high)]",
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
        <Video className="size-4 text-muted-foreground" />
      )}
    </div>
  );
}

function PlaylistRow({
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
      data: { type: "playlist", playlistId: playlist.id },
    });

  return (
    <div
      className={cn(
        "group flex items-center gap-2 border-b border-white/5 px-3 py-2.5 transition-colors last:border-b-0",
        isSelected ? "bg-accent/50" : "hover:bg-accent/30",
        isDragging ? "opacity-40" : "",
      )}
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
    >
      <button
        aria-label={`Drag ${playlist.name}`}
        className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground/40 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>

      <button
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={onSelect}
        type="button"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{playlist.name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>
              {playlist.items.length} item{playlist.items.length !== 1 ? "s" : ""}
            </span>
            <span className="text-muted-foreground/40">&middot;</span>
            <span>{runtimeLabel}</span>
          </div>
        </div>

        {playlist.isDefault ? (
          <Badge className="shrink-0">Default</Badge>
        ) : null}
      </button>
    </div>
  );
}

function MediaRow({
  asset,
  isSelected,
  isInQueue,
  onSelect,
  onToggleSelect,
  onAdd,
  selectionBadge,
}: {
  asset: MediaAsset;
  isSelected: boolean;
  isInQueue: boolean;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  onToggleSelect: () => void;
  onAdd: () => void;
  selectionBadge: string | null;
}) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `asset:${asset.id}`,
      data: { type: "asset", assetId: asset.id },
    });

  const meta =
    asset.type === "video" && asset.durationSeconds
      ? formatDuration(Math.ceil(asset.durationSeconds))
      : prettyBytes(asset.sizeBytes);

  return (
    <div
      className={cn(
        "group flex items-center gap-2 border-b border-white/5 px-3 py-2 transition-colors last:border-b-0",
        isSelected ? "bg-accent/50" : "hover:bg-accent/30",
        isDragging ? "opacity-40" : "",
      )}
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
    >
      <button
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded border text-[10px] font-semibold transition-colors",
          isSelected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-white/10 text-transparent hover:border-white/25",
        )}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect();
        }}
        type="button"
      >
        {selectionBadge === "check" ? <Check className="size-3" /> : (selectionBadge ?? "")}
      </button>

      <button
        aria-label={`Drag ${asset.title}`}
        className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:text-foreground"
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3" />
      </button>

      <button
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        onClick={onSelect}
        type="button"
      >
        <AssetThumb asset={asset} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-foreground">{asset.title}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{asset.type === "video" ? "Video" : "Image"}</span>
            <span className="text-muted-foreground/40">&middot;</span>
            <span>{meta}</span>
            {asset.sourceType === "youtube" ? (
              <>
                <span className="text-muted-foreground/40">&middot;</span>
                <span>YouTube</span>
              </>
            ) : null}
          </div>
        </div>
      </button>

      <Button
        className={cn(
          "shrink-0 transition-opacity",
          isInQueue
            ? "text-primary opacity-100"
            : "opacity-0 group-hover:opacity-100",
        )}
        onClick={(e) => {
          e.stopPropagation();
          onAdd();
        }}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        {isInQueue ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
      </Button>
    </div>
  );
}

function QueueDropZone({ children, isActive }: { children: React.ReactNode; isActive: boolean }) {
  const { isOver, setNodeRef } = useDroppable({
    id: "playlist-queue-root",
    data: { type: "queue-root" },
  });

  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-white/8 bg-background/40 p-3 transition-colors",
        isOver && isActive ? "border-primary/30 bg-accent/30" : "",
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
    data: { type: "queue-item", queueItemId: item.id },
  });

  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-lg border border-white/5 bg-card px-2.5 py-2 transition-colors hover:border-white/10",
        isDragging ? "opacity-40" : "",
      )}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground/50 hover:text-foreground"
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>

      <div className="flex size-6 shrink-0 items-center justify-center rounded bg-white/5 text-[11px] font-medium text-muted-foreground">
        {order + 1}
      </div>

      <AssetThumb asset={asset} className="h-9 w-12" />

      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-foreground">{asset.title}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {asset.type === "video" && asset.durationSeconds
            ? formatDuration(Math.ceil(asset.durationSeconds))
            : `${item.dwellSeconds || "10"}s dwell`}
        </div>
      </div>

      {asset.type === "image" ? (
        <Input
          className="h-7 w-16 text-center text-xs"
          onChange={(e) => onChangeDwell(e.target.value)}
          placeholder="10"
          value={item.dwellSeconds ?? ""}
        />
      ) : null}

      <button
        className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
        onClick={onRemove}
        type="button"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/* ── Main component ─────────────────────────────────── */

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
  const [showYoutubeImport, setShowYoutubeImport] = useState(false);
  const [showMediaFolders, setShowMediaFolders] = useState(true);

  const deferredPlaylistSearch = useDeferredValue(playlistSearch);
  const deferredMediaSearch = useDeferredValue(mediaSearch);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  /* ── Derived ── */

  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const playlistFolderMap = useMemo(() => getFolderMap(playlistFolders), [playlistFolders]);
  const mediaFolderMap = useMemo(() => getFolderMap(mediaFolders), [mediaFolders]);
  const selectedSourceAssetSet = useMemo(
    () => new Set(selectedSourceAssetIds),
    [selectedSourceAssetIds],
  );
  const currentDefault = useMemo(
    () => playlists.find((p) => p.isDefault) ?? null,
    [playlists],
  );

  const playlistFolderCounts = useMemo(() => {
    const m = new Map<string | null, number>();
    for (const p of playlists) {
      const k = p.folderId ?? null;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [playlists]);

  const mediaFolderCounts = useMemo(() => {
    const m = new Map<string | null, number>();
    for (const a of assets) {
      const k = a.folderId ?? null;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [assets]);

  const visiblePlaylists = useMemo(() => {
    const q = deferredPlaylistSearch.trim().toLowerCase();
    return sortPlaylists(playlists).filter((p) => {
      if ((p.folderId ?? null) !== selectedPlaylistFolderId) return false;
      return !q || p.name.toLowerCase().includes(q);
    });
  }, [deferredPlaylistSearch, playlists, selectedPlaylistFolderId]);

  const visibleAssets = useMemo(() => {
    const q = deferredMediaSearch.trim().toLowerCase();
    return assets.filter((a) => {
      if ((a.folderId ?? null) !== selectedMediaFolderId) return false;
      return !q || [a.title, a.fileName, ...a.tags].join(" ").toLowerCase().includes(q);
    });
  }, [assets, deferredMediaSearch, selectedMediaFolderId]);

  const queueDurationLabel = useMemo(() => {
    const total = queue.reduce((sum, item) => {
      const a = assetMap.get(item.assetId);
      if (!a) return sum;
      if (a.type === "video") return sum + Math.ceil(a.durationSeconds ?? 0);
      const d = Number(item.dwellSeconds);
      return sum + (Number.isFinite(d) && d > 0 ? d : 10);
    }, 0);
    return total > 0 ? formatDuration(total) : "0:00";
  }, [assetMap, queue]);

  const playlistFolderTrail = useMemo(
    () =>
      selectedPlaylistFolderId
        ? getFolderTrail(selectedPlaylistFolderId, playlistFolderMap)
        : [],
    [playlistFolderMap, selectedPlaylistFolderId],
  );
  const mediaFolderTrail = useMemo(
    () =>
      selectedMediaFolderId ? getFolderTrail(selectedMediaFolderId, mediaFolderMap) : [],
    [mediaFolderMap, selectedMediaFolderId],
  );

  const activePlaylist =
    activeDrag?.type === "playlist"
      ? playlists.find((p) => p.id === activeDrag.playlistId) ?? null
      : null;
  const activeAsset =
    activeDrag?.type === "asset"
      ? assets.find((a) => a.id === activeDrag.leadAssetId) ?? null
      : null;
  const activeQueueAsset =
    activeDrag?.type === "queue-item"
      ? assetMap.get(
          queue.find((i) => i.id === activeDrag.queueItemId)?.assetId ?? "",
        )
      : null;

  const selectedPlaylistFolderName = selectedPlaylistFolderId
    ? (playlistFolderMap.get(selectedPlaylistFolderId)?.name ?? "Folder")
    : "All playlists";
  const selectedMediaFolderName = selectedMediaFolderId
    ? (mediaFolderMap.get(selectedMediaFolderId)?.name ?? "Folder")
    : "All media";

  const sourceSelectionCount = selectedSourceAssetIds.length;
  const queueAssetIdSet = useMemo(
    () => new Set(queue.map((item) => item.assetId)),
    [queue],
  );

  /* ── Effects ── */

  useEffect(() => {
    const scoped = selectedSourceAssetIds.filter((id) => {
      const a = assetMap.get(id);
      return a ? (a.folderId ?? null) === selectedMediaFolderId : false;
    });
    if (scoped.length !== selectedSourceAssetIds.length) {
      setSelectedSourceAssetIds(scoped);
      setLastSelectedSourceIndex(scoped.length > 0 ? 0 : null);
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
      )
        return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        const ids = visibleAssets.map((a) => a.id);
        setSelectedSourceAssetIds(ids);
        setLastSelectedSourceIndex(ids.length > 0 ? ids.length - 1 : null);
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

  /* ── Helpers ── */

  function refreshData() {
    startTransition(() => router.refresh());
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

  function setSourceSelection(ids: string[]) {
    setSelectedSourceAssetIds(ids);
  }

  function clearSourceSelection() {
    setSourceSelection([]);
    setLastSelectedSourceIndex(null);
  }

  function addAssetsToQueue(assetIds: string[], targetIndex?: number) {
    if (!assetIds.length) return;
    setQueue((current) => {
      const items = assetIds.map((id) => createQueueItem(id));
      if (
        typeof targetIndex !== "number" ||
        targetIndex < 0 ||
        targetIndex > current.length
      )
        return [...current, ...items];
      const next = [...current];
      next.splice(targetIndex, 0, ...items);
      return next;
    });
  }

  function addAssetToQueue(assetId: string, targetIndex?: number) {
    addAssetsToQueue([assetId], targetIndex);
  }

  function updateQueueItem(id: string, updates: Partial<QueueItem>) {
    setQueue((c) => c.map((i) => (i.id === id ? { ...i, ...updates } : i)));
  }

  function removeQueueItem(id: string) {
    setQueue((c) => c.filter((i) => i.id !== id));
  }

  /* ── Folder ops ── */

  async function createFolder(parentId: string | null) {
    const folderName = window.prompt("Folder name");
    if (!folderName?.trim()) return;
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "playlist", name: folderName.trim(), parentId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus({ ok: false, text: data.error ?? "Unable to create folder" });
      return;
    }
    const f = data.folder as LibraryFolder;
    setPlaylistFolders((c) => [...c, f]);
    setSelectedPlaylistFolderId(f.id);
    refreshData();
  }

  async function renameFolder(folder: LibraryFolder) {
    const folderName = window.prompt("Rename folder", folder.name);
    if (!folderName?.trim() || folderName.trim() === folder.name) return;
    const res = await fetch(`/api/folders/${folder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: folderName.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus({ ok: false, text: data.error ?? "Unable to rename folder" });
      return;
    }
    setPlaylistFolders((c) =>
      c.map((e) => (e.id === folder.id ? (data.folder as LibraryFolder) : e)),
    );
    refreshData();
  }

  async function deleteFolder(folder: LibraryFolder) {
    if (
      !window.confirm(
        "Delete this folder? Child folders and playlists will move to the parent.",
      )
    )
      return;
    const res = await fetch(`/api/folders/${folder.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setStatus({ ok: false, text: data.error ?? "Unable to delete folder" });
      return;
    }
    setPlaylistFolders((c) =>
      c
        .filter((e) => e.id !== folder.id)
        .map((e) =>
          e.parentId === folder.id ? { ...e, parentId: folder.parentId } : e,
        ),
    );
    setPlaylists((c) =>
      c.map((p) =>
        p.folderId === folder.id ? { ...p, folderId: folder.parentId } : p,
      ),
    );
    if (selectedPlaylistFolderId === folder.id)
      setSelectedPlaylistFolderId(folder.parentId ?? null);
    refreshData();
  }

  async function movePlaylistToFolder(playlistId: string, folderId: string | null) {
    const prev = playlists.find((p) => p.id === playlistId)?.folderId ?? null;
    const isEditing = selectedPlaylistId === playlistId;
    setPlaylists((c) =>
      c.map((p) => (p.id === playlistId ? { ...p, folderId } : p)),
    );
    if (isEditing) setSelectedPlaylistFolderId(folderId);
    setStatus({ ok: true, text: "Moving playlist\u2026" });
    try {
      const res = await fetch(`/api/playlists/${playlistId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unable to move playlist");
      const next = data.playlist as Playlist;
      setPlaylists((c) => c.map((p) => (p.id === playlistId ? next : p)));
      if (isEditing) setSelectedPlaylistFolderId(next.folderId ?? null);
      setStatus({ ok: true, text: "Moved playlist." });
      refreshData();
    } catch (error) {
      setPlaylists((c) =>
        c.map((p) => (p.id === playlistId ? { ...p, folderId: prev } : p)),
      );
      if (isEditing) setSelectedPlaylistFolderId(prev);
      setStatus({
        ok: false,
        text: error instanceof Error ? error.message : "Unable to move playlist",
      });
    }
  }

  /* ── YouTube import ── */

  async function handleImportYouTubePlaylist() {
    try {
      setIsImportingYouTubePlaylist(true);
      setStatus({ ok: true, text: "Importing YouTube playlist\u2026" });
      const res = await fetch("/api/playlists/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          makeDefault: youtubePlaylistDefault,
          name: youtubePlaylistName.trim() || undefined,
          tags: youtubePlaylistTags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          url: youtubePlaylistUrl.trim(),
          folderId: selectedPlaylistFolderId,
          assetFolderId: selectedMediaFolderId,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error ?? "Unable to import YouTube playlist");
      const pl = data.playlist as Playlist;
      const newAssets = data.assets as MediaAsset[];
      setAssets((c) => [
        ...newAssets,
        ...c.filter((a) => !newAssets.some((n) => n.id === a.id)),
      ]);
      setPlaylists((c) => {
        const rest = c.filter((p) => p.id !== pl.id);
        return [pl, ...rest].map((p) => ({
          ...p,
          isDefault: pl.isDefault ? p.id === pl.id : p.isDefault,
        }));
      });
      loadPlaylist(pl);
      setYoutubePlaylistUrl("");
      setYoutubePlaylistName("");
      setYoutubePlaylistTags("");
      setYoutubePlaylistDefault(false);
      setStatus({
        ok: true,
        text: `Imported "${pl.name}" with ${pl.items.length} videos.`,
      });
      refreshData();
    } catch (error) {
      setStatus({
        ok: false,
        text:
          error instanceof Error
            ? error.message
            : "Unable to import YouTube playlist",
      });
    } finally {
      setIsImportingYouTubePlaylist(false);
    }
  }

  /* ── Save / Delete ── */

  async function handleSave() {
    if (!name.trim() || queue.length === 0) {
      setStatus({ ok: false, text: "Add a name and at least one item." });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playlistId: selectedPlaylistId ?? undefined,
          name: name.trim(),
          folderId: selectedPlaylistFolderId,
          makeDefault,
          itemIds: queue.map((item) => {
            const d = Number(item.dwellSeconds);
            return {
              mediaAssetId: item.assetId,
              dwellSeconds: Number.isFinite(d) && d > 0 ? d : undefined,
            };
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unable to save playlist");
      const pl = data.playlist as Playlist;
      setPlaylists((c) => {
        const rest = c.filter((p) => p.id !== pl.id);
        return [pl, ...rest].map((p) => ({
          ...p,
          isDefault: pl.isDefault ? p.id === pl.id : p.isDefault,
        }));
      });
      loadPlaylist(pl);
      setStatus({ ok: true, text: `Saved "${pl.name}".` });
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
    if (!window.confirm("Delete this playlist?")) return;
    const res = await fetch(`/api/playlists/${playlistId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setStatus({ ok: false, text: data.error ?? "Unable to delete playlist" });
      return;
    }
    setPlaylists((c) => c.filter((p) => p.id !== playlistId));
    if (selectedPlaylistId === playlistId) startNewPlaylist();
    refreshData();
  }

  /* ── Selection ── */

  function handleSourceAssetSelect(
    assetId: string,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    const idx = visibleAssets.findIndex((a) => a.id === assetId);
    if (idx === -1) return;

    if (event.shiftKey && lastSelectedSourceIndex !== null) {
      const s = Math.min(lastSelectedSourceIndex, idx);
      const e = Math.max(lastSelectedSourceIndex, idx);
      setSourceSelection(visibleAssets.slice(s, e + 1).map((a) => a.id));
      setLastSelectedSourceIndex(idx);
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      setSourceSelection(
        selectedSourceAssetSet.has(assetId)
          ? selectedSourceAssetIds.filter((id) => id !== assetId)
          : [...selectedSourceAssetIds, assetId],
      );
      setLastSelectedSourceIndex(idx);
      return;
    }

    setSourceSelection([assetId]);
    setLastSelectedSourceIndex(idx);
  }

  function toggleSourceAssetSelection(assetId: string) {
    const idx = visibleAssets.findIndex((a) => a.id === assetId);
    if (selectedSourceAssetSet.has(assetId)) {
      setSourceSelection(selectedSourceAssetIds.filter((id) => id !== assetId));
      return;
    }
    setSourceSelection([...selectedSourceAssetIds, assetId]);
    if (idx !== -1) setLastSelectedSourceIndex(idx);
  }

  /* ── DnD ── */

  function handleDragStart(event: DragStartEvent) {
    const d = event.active.data.current as
      | {
          type?: string;
          assetId?: string;
          playlistId?: string;
          queueItemId?: string;
        }
      | undefined;
    if (d?.type === "playlist" && d.playlistId) {
      setActiveDrag({ type: "playlist", playlistId: d.playlistId });
    } else if (d?.type === "asset" && d.assetId) {
      const ids = selectedSourceAssetSet.has(d.assetId)
        ? selectedSourceAssetIds
        : [d.assetId];
      setSourceSelection(ids);
      setActiveDrag({ type: "asset", assetIds: ids, leadAssetId: d.assetId });
    } else if (d?.type === "queue-item" && d.queueItemId) {
      setActiveDrag({ type: "queue-item", queueItemId: d.queueItemId });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const active = event.active.data.current as
      | {
          type?: string;
          assetId?: string;
          playlistId?: string;
          queueItemId?: string;
        }
      | undefined;
    const over = event.over?.data.current as
      | {
          type?: string;
          scope?: string;
          folderId?: string | null;
          queueItemId?: string;
        }
      | undefined;

    if (!active || !over) {
      setActiveDrag(null);
      return;
    }

    if (
      active.type === "playlist" &&
      active.playlistId &&
      over.type === "folder" &&
      over.scope === "playlist"
    ) {
      void movePlaylistToFolder(active.playlistId, over.folderId ?? null);
      setActiveDrag(null);
      return;
    }

    if (active.type === "asset" && active.assetId) {
      const ids =
        activeDrag?.type === "asset" ? activeDrag.assetIds : [active.assetId];
      if (over.type === "queue-root") {
        addAssetsToQueue(ids);
      } else if (over.type === "queue-item" && over.queueItemId) {
        const ti = queue.findIndex((i) => i.id === over.queueItemId);
        addAssetsToQueue(ids, ti === -1 ? undefined : ti);
      }
      setActiveDrag(null);
      return;
    }

    if (active.type === "queue-item" && active.queueItemId) {
      const from = queue.findIndex((i) => i.id === active.queueItemId);
      if (from !== -1) {
        if (over.type === "queue-root") {
          setQueue((c) => arrayMove(c, from, c.length - 1));
        } else if (over.type === "queue-item" && over.queueItemId) {
          const to = queue.findIndex((i) => i.id === over.queueItemId);
          if (to !== -1 && to !== from) setQueue((c) => arrayMove(c, from, to));
        }
      }
    }

    setActiveDrag(null);
  }

  /* ── Render ── */

  return (
    <DndContext
      onDragCancel={() => setActiveDrag(null)}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        {/* ──────────── Playlist browser sidebar ──────────── */}
        <aside className="space-y-3 xl:sticky xl:top-[8rem] xl:max-h-[calc(100vh-10rem)] xl:self-start xl:overflow-y-auto xl:pr-1">
          <Card className="gap-0 py-0">
            {/* Header */}
            <div className="border-b border-white/5 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Playlists
                </p>
                <Button onClick={startNewPlaylist} size="sm" type="button">
                  <Plus className="size-3.5" />
                  New
                </Button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                <button
                  className="shrink-0 transition-colors hover:text-foreground"
                  onClick={() => setSelectedPlaylistFolderId(null)}
                  type="button"
                >
                  Root
                </button>
                {playlistFolderTrail.map((folder) => (
                  <span
                    key={folder.id}
                    className="inline-flex min-w-0 items-center gap-1"
                  >
                    <ChevronRight className="size-3 shrink-0 text-muted-foreground/40" />
                    <button
                      className="truncate transition-colors hover:text-foreground"
                      onClick={() => setSelectedPlaylistFolderId(folder.id)}
                      type="button"
                    >
                      {folder.name}
                    </button>
                  </span>
                ))}
              </div>

              <div className="mt-3">
                <Input
                  className="h-8 text-xs"
                  onChange={(e) => setPlaylistSearch(e.target.value)}
                  placeholder="Search playlists\u2026"
                  value={playlistSearch}
                />
              </div>
            </div>

            {/* Folder tree */}
            <div className="border-b border-white/5">
              <div className="flex items-center justify-between px-4 py-1.5">
                <span className="text-[11px] text-muted-foreground">Folders</span>
                <Button
                  onClick={() => void createFolder(selectedPlaylistFolderId)}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <FolderPlus className="size-3.5" />
                </Button>
              </div>
              <div className="px-2 pb-2">
                {activeDrag?.type === "playlist" ? (
                  <div className="mb-2 rounded-md bg-primary/5 px-3 py-2 text-[11px] text-primary">
                    Drop onto a folder to move{" "}
                    <span className="font-medium">{activePlaylist?.name}</span>
                  </div>
                ) : null}
                <LibraryFolderTree
                activeDragType={
                  activeDrag?.type === "playlist" ? "playlist" : null
                }
                droppableScope="playlist"
                folders={playlistFolders}
                itemCounts={playlistFolderCounts}
                onDelete={(folder) => void deleteFolder(folder)}
                onRename={(folder) => void renameFolder(folder)}
                onSelect={setSelectedPlaylistFolderId}
                rootLabel="All playlists"
                selectedFolderId={selectedPlaylistFolderId}
              />
              </div>
            </div>

            {/* Playlist list */}
            <div>
              {visiblePlaylists.length > 0 ? (
                visiblePlaylists.map((playlist) => (
                  <PlaylistRow
                    isSelected={selectedPlaylistId === playlist.id}
                    key={playlist.id}
                    onSelect={() => loadPlaylist(playlist)}
                    playlist={playlist}
                    runtimeLabel={getPlaylistRuntimeLabel(playlist.items)}
                  />
                ))
              ) : (
                <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                  {playlistSearch.trim()
                    ? "No matching playlists."
                    : "No playlists yet."}
                </div>
              )}
            </div>
          </Card>

          {/* YouTube import (collapsible) */}
          <Card className="gap-0 py-0">
            <button
              className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-accent/30"
              onClick={() => setShowYoutubeImport((v) => !v)}
              type="button"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Import YouTube playlist
              </p>
              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform",
                  showYoutubeImport ? "rotate-180" : "",
                )}
              />
            </button>
            {showYoutubeImport ? (
              <div className="space-y-3 border-t border-white/5 px-4 py-4">
                <div className="space-y-1.5">
                  <Label className="text-[11px]" htmlFor="yt-url">
                    Playlist URL
                  </Label>
                  <Input
                    className="h-8 text-xs"
                    id="yt-url"
                    onChange={(e) => setYoutubePlaylistUrl(e.target.value)}
                    placeholder="https://youtube.com/playlist?list=\u2026"
                    value={youtubePlaylistUrl}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px]" htmlFor="yt-name">
                    Name override
                  </Label>
                  <Input
                    className="h-8 text-xs"
                    id="yt-name"
                    onChange={(e) => setYoutubePlaylistName(e.target.value)}
                    placeholder="Optional"
                    value={youtubePlaylistName}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px]" htmlFor="yt-tags">
                    Tags
                  </Label>
                  <Input
                    className="h-8 text-xs"
                    id="yt-tags"
                    onChange={(e) => setYoutubePlaylistTags(e.target.value)}
                    placeholder="youtube, campaign"
                    value={youtubePlaylistTags}
                  />
                </div>
                <label className="flex items-center justify-between rounded-md border border-white/5 bg-[var(--surface-high)] px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Set as default</span>
                  <input
                    checked={youtubePlaylistDefault}
                    className="size-3.5 accent-[var(--primary)]"
                    onChange={(e) => setYoutubePlaylistDefault(e.target.checked)}
                    type="checkbox"
                  />
                </label>
                <Button
                  className="w-full"
                  disabled={
                    !youtubePlaylistUrl.trim() || isImportingYouTubePlaylist
                  }
                  onClick={() => void handleImportYouTubePlaylist()}
                  size="sm"
                  type="button"
                >
                  {isImportingYouTubePlaylist ? "Importing\u2026" : "Import"}
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Saves to {selectedPlaylistFolderName}. Media lands in{" "}
                  {selectedMediaFolderName}.
                </p>
              </div>
            ) : null}
          </Card>
        </aside>

        {/* ──────────── Editor area ──────────── */}
        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
          {/* Queue editor */}
          <Card className="gap-0 py-0">
            <div className="shrink-0 border-b border-white/5 px-5 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {selectedPlaylistId ? "Editing playlist" : "New playlist"}
                </p>
                <div className="flex shrink-0 gap-2">
                  {selectedPlaylistId ? (
                    <Button
                      onClick={startNewPlaylist}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Reset
                    </Button>
                  ) : null}
                  <Button
                    disabled={saving}
                    onClick={() => void handleSave()}
                    size="sm"
                    type="button"
                  >
                    {saving ? "Saving\u2026" : "Save playlist"}
                  </Button>
                </div>
              </div>

              <div className="mt-3 flex gap-3">
                <Input
                  className="flex-1"
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Playlist name"
                  value={name}
                />
                <label className="flex shrink-0 cursor-pointer items-center gap-2.5 rounded-md border border-input bg-[var(--surface-high)] px-3 text-[13px] text-foreground">
                  <input
                    checked={makeDefault}
                    className="size-3.5 accent-[var(--primary)]"
                    onChange={(e) => setMakeDefault(e.target.checked)}
                    type="checkbox"
                  />
                  Fallback
                </label>
              </div>

              {currentDefault && !makeDefault ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Current fallback: {currentDefault.name}
                </p>
              ) : null}

              {status ? (
                <div
                  className={cn(
                    "mt-3 rounded-md border px-3 py-2 text-[13px]",
                    status.ok
                      ? "border-primary/15 bg-primary/5 text-foreground"
                      : "border-destructive/15 bg-destructive/5 text-destructive",
                  )}
                >
                  {status.text}
                </div>
              ) : null}
            </div>

            {/* Queue body */}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <QueueDropZone
                isActive={
                  activeDrag?.type === "asset" ||
                  activeDrag?.type === "queue-item"
                }
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-semibold uppercase tracking-[0.12em]">
                      Queue
                    </span>
                    <span className="text-muted-foreground/40">&middot;</span>
                    <span>
                      {queue.length} item{queue.length !== 1 ? "s" : ""}
                    </span>
                    <span className="text-muted-foreground/40">&middot;</span>
                    <span>{queueDurationLabel}</span>
                  </div>
                  {queue.length > 0 ? (
                    <Button
                      onClick={() => setQueue([])}
                      size="xs"
                      type="button"
                      variant="ghost"
                    >
                      Clear
                    </Button>
                  ) : null}
                </div>

                {queue.length > 0 ? (
                  <SortableContext
                    items={queue.map((i) => `queue:${i.id}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-1.5">
                      {queue.map((item, index) => {
                        const asset = assetMap.get(item.assetId);
                        if (!asset) return null;
                        return (
                          <QueueCard
                            asset={asset}
                            item={item}
                            key={item.id}
                            onChangeDwell={(v) =>
                              updateQueueItem(item.id, {
                                dwellSeconds: v || null,
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
                  <div className="py-10 text-center text-[13px] text-muted-foreground">
                    Drag media here or browse the library to add items.
                  </div>
                )}
              </QueueDropZone>
            </div>

            {selectedPlaylistId ? (
              <div className="shrink-0 border-t border-white/5 px-5 py-3">
                <button
                  className="text-[13px] text-muted-foreground transition-colors hover:text-destructive"
                  onClick={() => void handleDelete(selectedPlaylistId)}
                  type="button"
                >
                  Delete this playlist
                </button>
              </div>
            ) : null}
          </Card>

          {/* ──────────── Media picker ──────────── */}
          <aside className="2xl:sticky 2xl:top-[8rem] 2xl:self-start">
            <Card className="gap-0 py-0 2xl:max-h-[calc(100vh-10rem)]">
              <div className="shrink-0 border-b border-white/5 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Media library
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                  <button
                    className="shrink-0 transition-colors hover:text-foreground"
                    onClick={() => setSelectedMediaFolderId(null)}
                    type="button"
                  >
                    Root
                  </button>
                  {mediaFolderTrail.map((folder) => (
                    <span
                      key={folder.id}
                      className="inline-flex min-w-0 items-center gap-1"
                    >
                      <ChevronRight className="size-3 shrink-0 text-muted-foreground/40" />
                      <button
                        className="truncate transition-colors hover:text-foreground"
                        onClick={() => setSelectedMediaFolderId(folder.id)}
                        type="button"
                      >
                        {folder.name}
                      </button>
                    </span>
                  ))}
                </div>
                <div className="mt-3">
                  <Input
                    className="h-8 text-xs"
                    onChange={(e) => setMediaSearch(e.target.value)}
                    placeholder="Search media\u2026"
                    value={mediaSearch}
                  />
                </div>
              </div>

              {/* Folder tree (collapsible) */}
              <div className="shrink-0 border-b border-white/5">
                <button
                  className="flex w-full items-center justify-between px-4 py-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setShowMediaFolders((v) => !v)}
                  type="button"
                >
                  <span>Folders</span>
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      showMediaFolders ? "rotate-180" : "",
                    )}
                  />
                </button>
                {showMediaFolders ? (
                  <div className="px-2 pb-2">
                    <LibraryFolderTree
                      folders={mediaFolders}
                      itemCounts={mediaFolderCounts}
                      onSelect={setSelectedMediaFolderId}
                      rootLabel="All media"
                      selectedFolderId={selectedMediaFolderId}
                    />
                  </div>
                ) : null}
              </div>

              {/* Selection bar */}
              {visibleAssets.length > 0 || sourceSelectionCount > 0 ? (
                <div className="flex shrink-0 items-center gap-1.5 border-b border-white/5 px-4 py-2">
                  {visibleAssets.length > 0 ? (
                    <Button
                      onClick={() => {
                        const ids = visibleAssets.map((a) => a.id);
                        setSourceSelection(ids);
                        setLastSelectedSourceIndex(
                          ids.length > 0 ? ids.length - 1 : null,
                        );
                      }}
                      size="xs"
                      type="button"
                      variant="ghost"
                    >
                      Select all
                    </Button>
                  ) : null}
                  {sourceSelectionCount > 0 ? (
                    <>
                      <Button
                        onClick={() =>
                          addAssetsToQueue(selectedSourceAssetIds)
                        }
                        size="xs"
                        type="button"
                        variant="ghost"
                      >
                        Add {sourceSelectionCount}
                      </Button>
                      <Button
                        onClick={clearSourceSelection}
                        size="xs"
                        type="button"
                        variant="ghost"
                      >
                        <X className="size-3" />
                      </Button>
                    </>
                  ) : null}
                  <span className="ml-auto text-[10px] text-muted-foreground/50">
                    {visibleAssets.length} asset
                    {visibleAssets.length !== 1 ? "s" : ""}
                  </span>
                </div>
              ) : null}

              {/* Asset list */}
              <div className="min-h-0 flex-1 overflow-y-auto">
                {visibleAssets.length > 0 ? (
                  visibleAssets.map((asset) => (
                    <MediaRow
                      asset={asset}
                      isInQueue={queueAssetIdSet.has(asset.id)}
                      isSelected={selectedSourceAssetSet.has(asset.id)}
                      key={asset.id}
                      onAdd={() => addAssetToQueue(asset.id)}
                      onSelect={(e) => handleSourceAssetSelect(asset.id, e)}
                      onToggleSelect={() =>
                        toggleSourceAssetSelection(asset.id)
                      }
                      selectionBadge={
                        selectedSourceAssetSet.has(asset.id)
                          ? sourceSelectionCount > 1
                            ? String(
                                selectedSourceAssetIds.indexOf(asset.id) + 1,
                              )
                            : "check"
                          : null
                      }
                    />
                  ))
                ) : (
                  <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                    {mediaSearch.trim()
                      ? "No matching media."
                      : "No media in this folder."}
                  </div>
                )}
              </div>
            </Card>
          </aside>
        </div>
      </div>

      <DragOverlay>
        {activePlaylist ? (
          <div className="rounded-lg border border-white/10 bg-card px-3 py-2 text-sm font-medium text-foreground shadow-2xl">
            {activePlaylist.name}
          </div>
        ) : null}
        {activeAsset ? (
          <div className="rounded-lg border border-white/10 bg-card px-3 py-2 text-sm font-medium text-foreground shadow-2xl">
            {activeDrag?.type === "asset" && activeDrag.assetIds.length > 1
              ? `${activeDrag.assetIds.length} media items`
              : activeAsset.title}
          </div>
        ) : null}
        {activeQueueAsset ? (
          <div className="rounded-lg border border-white/10 bg-card px-3 py-2 text-sm font-medium text-foreground shadow-2xl">
            {activeQueueAsset.title}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
