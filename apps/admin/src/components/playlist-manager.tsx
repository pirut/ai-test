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
import { startTransition, useDeferredValue, useMemo, useState } from "react";
import {
  FolderPlus,
  GripVertical,
  ImageIcon,
  Plus,
  Trash2,
  Video,
} from "lucide-react";
import type { LibraryFolder, MediaAsset, Playlist } from "@showroom/contracts";

import { LibraryFolderTree } from "@/components/library-folder-tree";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFolderMap } from "@/lib/library";
import { cn } from "@/lib/utils";

type QueueItem = {
  id: string;
  assetId: string;
  dwellSeconds: string | null;
};

type ActiveDrag =
  | { type: "asset"; assetId: string }
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
}: {
  isSelected: boolean;
  onSelect: () => void;
  playlist: Playlist;
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
    <div
      className={cn(
        "rounded-md border transition-colors",
        isSelected ? "border-foreground/20 bg-accent" : "border-border hover:bg-accent/45",
        isDragging ? "opacity-40" : "",
      )}
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
    >
      <div className="flex items-center gap-2 px-3 py-3">
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
        <button className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left" onClick={onSelect} type="button">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{playlist.name}</div>
            <div className="text-xs text-muted-foreground">
              {playlist.items.length} item{playlist.items.length !== 1 ? "s" : ""}
            </div>
          </div>
          {playlist.isDefault ? (
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Default
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}

function SourceAssetRow({
  asset,
  folderName,
  onAdd,
}: {
  asset: MediaAsset;
  folderName: string;
  onAdd: () => void;
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
        isDragging ? "opacity-40" : "",
      )}
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
    >
      <div className="grid gap-3 px-3 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
        <button
          aria-label={`Drag ${asset.title}`}
          className="flex size-7 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-background hover:text-foreground"
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>

        <button className="flex min-w-0 items-start gap-3 text-left" onClick={onAdd} type="button">
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
  const activePlaylist =
    activeDrag?.type === "playlist"
      ? playlists.find((playlist) => playlist.id === activeDrag.playlistId) ?? null
      : null;
  const activeAsset =
    activeDrag?.type === "asset"
      ? assets.find((asset) => asset.id === activeDrag.assetId) ?? null
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

  function addAssetToQueue(assetId: string, targetIndex?: number) {
    setQueue((current) => {
      const nextItem = createQueueItem(assetId);
      if (typeof targetIndex !== "number" || targetIndex < 0 || targetIndex > current.length) {
        return [...current, nextItem];
      }

      const next = [...current];
      next.splice(targetIndex, 0, nextItem);
      return next;
    });
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

    setPlaylists((current) =>
      current.map((playlist) =>
        playlist.id === playlistId ? { ...playlist, folderId } : playlist,
      ),
    );
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
      setStatus({ ok: true, text: "Moved playlist." });
      refreshData();
    } catch (error) {
      setPlaylists((current) =>
        current.map((playlist) =>
          playlist.id === playlistId ? { ...playlist, folderId: previousFolderId } : playlist,
        ),
      );
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

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as
      | { type?: string; assetId?: string; playlistId?: string; queueItemId?: string }
      | undefined;

    if (data?.type === "playlist" && data.playlistId) {
      setActiveDrag({ type: "playlist", playlistId: data.playlistId });
      return;
    }

    if (data?.type === "asset" && data.assetId) {
      setActiveDrag({ type: "asset", assetId: data.assetId });
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
      if (overData.type === "queue-root") {
        addAssetToQueue(activeData.assetId);
      } else if (overData.type === "queue-item" && overData.queueItemId) {
        const targetIndex = queue.findIndex((item) => item.id === overData.queueItemId);
        addAssetToQueue(activeData.assetId, targetIndex === -1 ? undefined : targetIndex);
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
      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-medium text-foreground">Playlists</p>
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
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Total
                  </div>
                  <div className="mt-1 text-lg font-semibold text-foreground">
                    {playlists.length}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Default
                  </div>
                  <div className="mt-1 truncate text-sm font-medium text-foreground">
                    {currentDefault?.name ?? "None"}
                  </div>
                </div>
              </div>

              <Input
                onChange={(event) => setPlaylistFolderSearch(event.target.value)}
                placeholder="Find folder"
                value={playlistFolderSearch}
              />

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

              <div className="flex items-center gap-2">
                <Input
                  onChange={(event) => setPlaylistSearch(event.target.value)}
                  placeholder="Search playlists"
                  value={playlistSearch}
                />
                <Button onClick={startNewPlaylist} type="button" variant="outline">
                  <Plus className="size-4" />
                </Button>
              </div>

              <div className="space-y-2">
                {visiblePlaylists.length > 0 ? (
                  visiblePlaylists.map((playlist) => (
                    <PlaylistLibraryRow
                      isSelected={selectedPlaylistId === playlist.id}
                      key={playlist.id}
                      onSelect={() => loadPlaylist(playlist)}
                      playlist={playlist}
                    />
                  ))
                ) : (
                  <div className="rounded-md border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
                    {playlistSearch.trim()
                      ? "No matching playlists in this folder."
                      : "No playlists in this folder."}
                  </div>
                )}
              </div>
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
            </div>
          </section>
        </aside>

        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="playlist-name">Playlist name</Label>
                <Input
                  id="playlist-name"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Main showroom loop"
                  value={name}
                />
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

            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <label className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2">
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

              <div className="text-sm text-muted-foreground">
                Saving into <span className="text-foreground">{selectedPlaylistFolderName}</span>
              </div>
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
                <div>
                  <div className="text-sm font-medium text-foreground">Queue</div>
                  <div className="text-xs text-muted-foreground">
                    {queue.length} item{queue.length !== 1 ? "s" : ""} • {queueDurationLabel}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Drag from the media browser or press Add.
                </div>
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

        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Source media</p>
                  <p className="text-xs text-muted-foreground">{selectedMediaFolderName}</p>
                </div>
                <Input
                  className="w-40"
                  onChange={(event) => setMediaSearch(event.target.value)}
                  placeholder="Search"
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

              <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                {visibleAssets.length} item{visibleAssets.length !== 1 ? "s" : ""} visible
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
                      key={asset.id}
                      onAdd={() => addAssetToQueue(asset.id)}
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
            {activeAsset.title}
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
