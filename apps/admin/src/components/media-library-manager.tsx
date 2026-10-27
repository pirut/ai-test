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
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { startTransition, useDeferredValue, useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  ChevronRight,
  Film,
  Folder,
  FolderInput,
  FolderPlus,
  ImageIcon,
  Images,
  LayoutGrid,
  List,
  MoreHorizontal,
  MoveRight,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  Upload,
  X,
  Youtube,
} from "lucide-react";
import type { LibraryFolder, MediaAsset } from "@showroom/contracts";

import { LibraryFolderTree } from "@/components/library-folder-tree";
import { MediaAddDialog } from "@/components/media-add-dialog";
import { FolderPickerItems, MediaAssetSheet } from "@/components/media-asset-sheet";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getFolderChildren, getFolderMap, getFolderTrail } from "@/lib/library";
import {
  assetKindLabel,
  assetSummary,
  formatDimensions,
  formatDuration,
  parseTags,
  prettyBytes,
} from "@/lib/media-format";
import { cn } from "@/lib/utils";

type TypeFilter = "all" | "image" | "video";
type Layout = "grid" | "list";
type Notice = { ok: boolean; text: string } | null;
type ConfirmRequest = {
  title: string;
  description: string;
  confirmLabel: string;
  run: () => Promise<void>;
} | null;
type FolderDialogRequest =
  | { mode: "create"; parentId: string | null }
  | { mode: "rename"; folder: LibraryFolder }
  | null;

const layoutStorageKey = "media-library-layout";

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function MediaThumb({ asset, className }: { asset: MediaAsset; className?: string }) {
  const [videoFailed, setVideoFailed] = useState(false);
  const isUploadedVideo = asset.type === "video" && asset.sourceType !== "youtube";

  return (
    <div className={cn("relative aspect-video overflow-hidden rounded-md bg-muted", className)}>
      {!isUploadedVideo ? (
        <img
          alt=""
          className="size-full object-cover"
          decoding="async"
          draggable={false}
          loading="lazy"
          src={asset.previewUrl}
        />
      ) : !videoFailed ? (
        <video
          className="size-full object-cover"
          muted
          onError={() => setVideoFailed(true)}
          playsInline
          preload="metadata"
          src={`${asset.previewUrl}#t=0.5`}
        />
      ) : (
        <div className="flex size-full items-center justify-center bg-secondary text-muted-foreground">
          <Film className="size-6" />
        </div>
      )}
    </div>
  );
}

function ThumbBadge({ asset }: { asset: MediaAsset }) {
  if (asset.sourceType === "youtube") {
    return (
      <span className="absolute right-1.5 bottom-1.5 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
        <Youtube className="size-3" />
        {asset.durationSeconds ? formatDuration(asset.durationSeconds) : "YouTube"}
      </span>
    );
  }
  if (asset.type === "video") {
    return (
      <span className="absolute right-1.5 bottom-1.5 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
        <Film className="size-3" />
        {asset.durationSeconds ? formatDuration(asset.durationSeconds) : "Video"}
      </span>
    );
  }
  return null;
}

function useAssetDrag(assetId: string) {
  return useDraggable({ id: `media-asset:${assetId}`, data: { type: "asset", assetId } });
}

function MediaCard({
  asset,
  folderLabel,
  isSelected,
  selectionMode,
  onActivate,
  onToggle,
}: {
  asset: MediaAsset;
  folderLabel: string | null;
  isSelected: boolean;
  selectionMode: boolean;
  onActivate: (event: MouseEvent<HTMLButtonElement>) => void;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useAssetDrag(asset.id);

  return (
    <li
      className={cn(
        "group relative flex min-w-0 flex-col gap-2 rounded-lg p-1.5 transition-colors",
        isSelected ? "bg-accent" : "hover:bg-muted/60",
        isDragging && "opacity-40",
      )}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role={undefined}
      tabIndex={undefined}
    >
      <button
        aria-label={`Open ${asset.title}`}
        className="flex min-w-0 flex-col gap-2 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={onActivate}
        type="button"
      >
        <div
          className={cn(
            "relative w-full rounded-md",
            isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-accent",
          )}
        >
          <MediaThumb asset={asset} />
          <ThumbBadge asset={asset} />
        </div>
        <div className="min-w-0 px-0.5">
          <p className="truncate text-sm font-medium">{asset.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {folderLabel ? `${folderLabel} · ` : ""}
            {assetSummary(asset)}
          </p>
        </div>
      </button>
      <Checkbox
        aria-label={`Select ${asset.title}`}
        checked={isSelected}
        className={cn(
          "absolute top-3 left-3 size-5 rounded-md border-white/80 bg-black/30 shadow-sm backdrop-blur transition-opacity data-[state=checked]:border-primary",
          isSelected || selectionMode
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        )}
        onCheckedChange={onToggle}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      />
    </li>
  );
}

function MediaRow({
  asset,
  folderLabel,
  isSelected,
  onActivate,
  onToggle,
}: {
  asset: MediaAsset;
  folderLabel: string | null;
  isSelected: boolean;
  onActivate: (event: MouseEvent<HTMLButtonElement>) => void;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useAssetDrag(asset.id);
  const length =
    asset.type === "video" && asset.durationSeconds
      ? formatDuration(asset.durationSeconds)
      : (formatDimensions(asset) ?? "—");

  return (
    <TableRow
      className={cn(isSelected && "bg-accent hover:bg-accent", isDragging && "opacity-40")}
      data-state={isSelected ? "selected" : undefined}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role={undefined}
      tabIndex={undefined}
    >
      <TableCell className="w-10 pl-4">
        <Checkbox
          aria-label={`Select ${asset.title}`}
          checked={isSelected}
          onCheckedChange={onToggle}
          onPointerDown={(event) => event.stopPropagation()}
        />
      </TableCell>
      <TableCell>
        <button
          className="flex min-w-0 items-center gap-3 text-left hover:underline"
          onClick={onActivate}
          type="button"
        >
          <span className="relative w-20 shrink-0">
            <MediaThumb asset={asset} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{asset.title}</span>
            <span className="truncate text-xs text-muted-foreground">
              {folderLabel ?? asset.tags.join(", ")}
            </span>
          </span>
        </button>
      </TableCell>
      <TableCell className="hidden text-muted-foreground sm:table-cell">{assetKindLabel(asset)}</TableCell>
      <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">{length}</TableCell>
      <TableCell className="hidden pr-4 text-right text-muted-foreground tabular-nums md:table-cell">
        {asset.sourceType === "youtube" ? "—" : prettyBytes(asset.sizeBytes)}
      </TableCell>
    </TableRow>
  );
}

function FolderTile({
  folder,
  count,
  onOpen,
  dragActive,
}: {
  folder: LibraryFolder;
  count: number;
  onOpen: () => void;
  dragActive: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `media-tile:${folder.id}`,
    data: { type: "folder", scope: "media", folderId: folder.id },
  });

  return (
    <li ref={setNodeRef}>
      <button
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
          dragActive && "border-dashed",
          isOver && dragActive && "border-primary bg-accent",
        )}
        onClick={onOpen}
        type="button"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Folder className="size-4" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{folder.name}</span>
          <span className="text-xs text-muted-foreground">{plural(count, "file")}</span>
        </span>
      </button>
    </li>
  );
}

function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{request?.title}</DialogTitle>
          <DialogDescription>{request?.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button disabled={busy} onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              if (!request) return;
              setBusy(true);
              try {
                await request.run();
              } finally {
                setBusy(false);
                onClose();
              }
            }}
            variant="destructive"
          >
            {busy ? <Spinner /> : <Trash2 />}
            {request?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FolderNameDialog({
  request,
  parentName,
  onClose,
  onSubmit,
}: {
  request: FolderDialogRequest;
  parentName: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(request?.mode === "rename" ? request.folder.name : "");
  }, [request]);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSubmit(name.trim());
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{request?.mode === "rename" ? "Rename folder" : "New folder"}</DialogTitle>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="folder-name">Name</FieldLabel>
          <Input
            autoFocus
            id="folder-name"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
            }}
            value={name}
          />
          {request?.mode === "create" ? <FieldDescription>Inside {parentName}.</FieldDescription> : null}
        </Field>
        <DialogFooter>
          <Button disabled={busy} onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={busy || !name.trim()} onClick={() => void submit()}>
            {busy ? <Spinner /> : null}
            {request?.mode === "rename" ? "Rename" : "Create folder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TagsDialog({
  count,
  open,
  onClose,
  onSubmit,
}: {
  count: number;
  open: boolean;
  onClose: () => void;
  onSubmit: (tags: string[]) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const tags = parseTags(value);
    if (!tags.length) return;
    setBusy(true);
    try {
      await onSubmit(tags);
      setValue("");
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add tags to {plural(count, "file")}</DialogTitle>
          <DialogDescription>Existing tags are kept.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="bulk-tags">Tags</FieldLabel>
          <Input
            autoFocus
            id="bulk-tags"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
            }}
            placeholder="spring, window"
            value={value}
          />
        </Field>
        <DialogFooter>
          <Button disabled={busy} onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={busy || !parseTags(value).length} onClick={() => void submit()}>
            {busy ? <Spinner /> : <Tag />}
            Add tags
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [detailsAssetId, setDetailsAssetId] = useState<string | null>(null);
  const [activeDragAssetIds, setActiveDragAssetIds] = useState<string[]>([]);
  const [activeDropFolderId, setActiveDropFolderId] = useState<string | null | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [folderSearch, setFolderSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [layout, setLayout] = useState<Layout>("grid");
  const [notice, setNotice] = useState<Notice>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest>(null);
  const [folderDialog, setFolderDialog] = useState<FolderDialogRequest>(null);
  const [tagsOpen, setTagsOpen] = useState(false);

  const deferredSearch = useDeferredValue(search);
  const deferredFolderSearch = useDeferredValue(folderSearch);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(layoutStorageKey);
      if (stored === "grid" || stored === "list") setLayout(stored);
    } catch {
      // Storage can be unavailable; grid is a fine default.
    }
  }, []);

  function changeLayout(next: Layout) {
    setLayout(next);
    try {
      window.localStorage.setItem(layoutStorageKey, next);
    } catch {
      // Not persisted this time.
    }
  }

  useEffect(() => {
    if (!notice?.ok) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

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
  const nestedCount = useMemo(() => {
    const cache = new Map<string, number>();
    const count = (folderId: string): number => {
      const cached = cache.get(folderId);
      if (cached !== undefined) return cached;
      let total = folderAssetCounts.get(folderId) ?? 0;
      for (const child of getFolderChildren(folders, folderId)) total += count(child.id);
      cache.set(folderId, total);
      return total;
    };
    return count;
  }, [folderAssetCounts, folders]);

  const query = deferredSearch.trim().toLowerCase();
  const isSearching = query.length > 0;
  // Search spans the whole library; browsing shows one folder at a time.
  const scopedAssets = useMemo(
    () =>
      assets.filter((asset) =>
        isSearching
          ? [asset.title, asset.fileName, ...asset.tags].join(" ").toLowerCase().includes(query)
          : (asset.folderId ?? null) === selectedFolderId,
      ),
    [assets, isSearching, query, selectedFolderId],
  );
  const typeCounts = useMemo(
    () => ({
      all: scopedAssets.length,
      image: scopedAssets.filter((asset) => asset.type === "image").length,
      video: scopedAssets.filter((asset) => asset.type === "video").length,
    }),
    [scopedAssets],
  );
  const visibleAssets = useMemo(
    () => (typeFilter === "all" ? scopedAssets : scopedAssets.filter((asset) => asset.type === typeFilter)),
    [scopedAssets, typeFilter],
  );
  const childFolders = isSearching ? [] : getFolderChildren(folders, selectedFolderId);

  const selectedAssetSet = useMemo(() => new Set(selectedAssetIds), [selectedAssetIds]);
  const selectionCount = selectedAssetIds.length;
  const detailsAsset = detailsAssetId ? (assetMap.get(detailsAssetId) ?? null) : null;
  const activeDragAssets = useMemo(() => {
    const activeSet = new Set(activeDragAssetIds);
    return assets.filter((asset) => activeSet.has(asset.id));
  }, [activeDragAssetIds, assets]);
  const activeDropFolderName =
    activeDropFolderId === undefined
      ? null
      : activeDropFolderId === null
        ? "Library"
        : (folderMap.get(activeDropFolderId)?.name ?? "Folder");
  const currentFolder = selectedFolderId ? (folderMap.get(selectedFolderId) ?? null) : null;
  const currentFolderName = currentFolder?.name ?? "Library";

  const collisionDetection = useMemo<CollisionDetection>(
    () => (args) => {
      const pointerCollisions = pointerWithin(args);
      return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
    },
    [],
  );

  // Keep the selection to what's on screen, so bulk actions never touch hidden files.
  useEffect(() => {
    const visibleIds = new Set(visibleAssets.map((asset) => asset.id));
    if (selectedAssetIds.some((id) => !visibleIds.has(id))) {
      setSelectedAssetIds((current) => current.filter((id) => visibleIds.has(id)));
    }
  }, [selectedAssetIds, visibleAssets]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable ||
          target.closest("[role='dialog']"))
      ) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectedAssetIds(visibleAssets.map((asset) => asset.id));
        setLastSelectedIndex(visibleAssets.length ? visibleAssets.length - 1 : null);
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

  function clearSelection() {
    setSelectedAssetIds([]);
    setLastSelectedIndex(null);
  }

  function openFolder(folderId: string | null) {
    setSelectedFolderId(folderId);
    setSearch("");
    clearSelection();
  }

  function folderLabelFor(asset: MediaAsset) {
    if (!isSearching) return null;
    return asset.folderId ? (folderMap.get(asset.folderId)?.name ?? "Folder") : "Library";
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
      applyUpdatedAssets([await updateAssetRequest(assetId, updates)]);
      setNotice({ ok: true, text: "Saved." });
      refreshData();
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : "Unable to save changes" });
    }
  }

  async function addTagsToSelection(tags: string[]) {
    try {
      const updatedAssets = await Promise.all(
        selectedAssetIds.map((assetId) => {
          const existing = assetMap.get(assetId)?.tags ?? [];
          return updateAssetRequest(assetId, { tags: Array.from(new Set([...existing, ...tags])) });
        }),
      );
      applyUpdatedAssets(updatedAssets);
      setNotice({ ok: true, text: `Tagged ${plural(updatedAssets.length, "file")}.` });
      refreshData();
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : "Unable to tag files" });
    }
  }

  function requestDeleteAssets(assetIds: string[]) {
    if (!assetIds.length) return;
    const single = assetIds.length === 1 ? assetMap.get(assetIds[0]!) : null;
    setConfirmRequest({
      title: single ? `Delete “${single.title}”?` : `Delete ${plural(assetIds.length, "file")}?`,
      description:
        "This also removes them from any playlists that use them. Screens stop showing them after their next sync. This can't be undone.",
      confirmLabel: "Delete",
      run: async () => {
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
          if (detailsAssetId && assetIds.includes(detailsAssetId)) setDetailsAssetId(null);
          setNotice({ ok: true, text: `Deleted ${plural(assetIds.length, "file")}.` });
          refreshData();
        } catch (error) {
          setNotice({ ok: false, text: error instanceof Error ? error.message : "Unable to delete files" });
        }
      },
    });
  }

  async function submitFolderDialog(name: string) {
    if (!folderDialog) return;
    if (folderDialog.mode === "create") {
      const response = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "media", name, parentId: folderDialog.parentId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setNotice({ ok: false, text: payload.error ?? "Unable to create folder" });
        return;
      }
      const nextFolder = payload.folder as LibraryFolder;
      setFolders((current) => [...current, nextFolder]);
      openFolder(nextFolder.id);
    } else {
      const { folder } = folderDialog;
      if (name === folder.name) return;
      const response = await fetch(`/api/folders/${folder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setNotice({ ok: false, text: payload.error ?? "Unable to rename folder" });
        return;
      }
      const nextFolder = payload.folder as LibraryFolder;
      setFolders((current) => current.map((entry) => (entry.id === folder.id ? nextFolder : entry)));
    }
    refreshData();
  }

  function requestDeleteFolder(folder: LibraryFolder) {
    const parentName = folder.parentId ? (folderMap.get(folder.parentId)?.name ?? "its parent") : "Library";
    setConfirmRequest({
      title: `Delete the “${folder.name}” folder?`,
      description: `Its files and subfolders move up to ${parentName}. Nothing is deleted from your playlists.`,
      confirmLabel: "Delete folder",
      run: async () => {
        const response = await fetch(`/api/folders/${folder.id}`, { method: "DELETE" });
        if (!response.ok) {
          const payload = await response.json();
          setNotice({ ok: false, text: payload.error ?? "Unable to delete folder" });
          return;
        }
        setFolders((current) =>
          current
            .filter((entry) => entry.id !== folder.id)
            .map((entry) => (entry.parentId === folder.id ? { ...entry, parentId: folder.parentId } : entry)),
        );
        setAssets((current) =>
          current.map((asset) =>
            asset.folderId === folder.id ? { ...asset, folderId: folder.parentId } : asset,
          ),
        );
        if (selectedFolderId === folder.id) setSelectedFolderId(folder.parentId ?? null);
        setNotice({ ok: true, text: `Deleted “${folder.name}”.` });
        refreshData();
      },
    });
  }

  async function moveAssetsToFolder(assetIds: string[], folderId: string | null) {
    if (!assetIds.length) return;

    const previousFolders = new Map(
      assetIds.map((assetId) => [assetId, assetMap.get(assetId)?.folderId ?? null]),
    );
    const destination = folderId ? (folderMap.get(folderId)?.name ?? "folder") : "Library";

    setAssets((current) =>
      current.map((asset) => (previousFolders.has(asset.id) ? { ...asset, folderId } : asset)),
    );

    try {
      const updatedAssets = await Promise.all(
        assetIds.map((assetId) => updateAssetRequest(assetId, { folderId })),
      );
      applyUpdatedAssets(updatedAssets);
      setNotice({ ok: true, text: `Moved ${plural(updatedAssets.length, "file")} to ${destination}.` });
      refreshData();
    } catch (error) {
      setAssets((current) =>
        current.map((asset) =>
          previousFolders.has(asset.id)
            ? { ...asset, folderId: previousFolders.get(asset.id) ?? null }
            : asset,
        ),
      );
      setNotice({ ok: false, text: error instanceof Error ? error.message : "Unable to move files" });
    }
  }

  function toggleAsset(assetId: string) {
    const index = visibleAssets.findIndex((asset) => asset.id === assetId);
    setSelectedAssetIds((current) =>
      current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId],
    );
    if (index !== -1) setLastSelectedIndex(index);
  }

  // A plain click opens details. Once something is selected, or with Shift/Cmd/Ctrl, clicks select instead.
  function handleActivate(assetId: string, event: MouseEvent<HTMLButtonElement>) {
    const index = visibleAssets.findIndex((asset) => asset.id === assetId);
    if (index === -1) return;

    if (event.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const range = visibleAssets.slice(start, end + 1).map((asset) => asset.id);
      setSelectedAssetIds((current) => Array.from(new Set([...current, ...range])));
      return;
    }

    if (event.metaKey || event.ctrlKey || event.shiftKey || selectionCount > 0) {
      toggleAsset(assetId);
      return;
    }

    setDetailsAssetId(assetId);
    setLastSelectedIndex(index);
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { type?: string; assetId?: string } | undefined;
    if (data?.type === "asset" && data.assetId) {
      setActiveDragAssetIds(selectedAssetSet.has(data.assetId) ? selectedAssetIds : [data.assetId]);
    }
  }

  function handleDragOver(event: DragOverEvent | DragEndEvent) {
    const overData = event.over?.data.current as
      | { type?: string; scope?: string; folderId?: string | null }
      | undefined;
    setActiveDropFolderId(
      overData?.type === "folder" && overData.scope === "media" ? (overData.folderId ?? null) : undefined,
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const overData = event.over?.data.current as
      | { type?: string; scope?: string; folderId?: string | null }
      | undefined;

    if (activeDragAssetIds.length > 0 && overData?.type === "folder" && overData.scope === "media") {
      const target = overData.folderId ?? null;
      const moving = activeDragAssetIds.filter((id) => (assetMap.get(id)?.folderId ?? null) !== target);
      void moveAssetsToFolder(moving, target);
    }

    setActiveDragAssetIds([]);
    setActiveDropFolderId(undefined);
  }

  function handleDragCancel() {
    setActiveDragAssetIds([]);
    setActiveDropFolderId(undefined);
  }

  function openAddDialog(files: File[] = []) {
    setDroppedFiles(files);
    setAddOpen(true);
  }

  const dragActive = activeDragAssetIds.length > 0;
  const allVisibleSelected = visibleAssets.length > 0 && selectionCount === visibleAssets.length;
  const filterOptions: { value: TypeFilter; label: string; icon: typeof Images }[] = [
    { value: "all", label: "All", icon: Images },
    { value: "image", label: "Images", icon: ImageIcon },
    { value: "video", label: "Videos", icon: Film },
  ];

  const folderMenu = currentFolder ? (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button aria-label={`Folder actions for ${currentFolder.name}`} size="icon" variant="outline" />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => setFolderDialog({ mode: "create", parentId: currentFolder.id })}>
            <FolderPlus />
            New subfolder
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setFolderDialog({ mode: "rename", folder: currentFolder })}>
            <Pencil />
            Rename
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => requestDeleteFolder(currentFolder)} variant="destructive">
            <Trash2 />
            Delete folder
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  let emptyState: React.ReactNode = null;
  if (visibleAssets.length === 0) {
    if (assets.length === 0) {
      emptyState = (
        <Empty className="border py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Images />
            </EmptyMedia>
            <EmptyTitle>No media yet</EmptyTitle>
            <EmptyDescription>
              Upload photos and videos, or add a YouTube link. You can also drag files onto this page.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => openAddDialog()}>
              <Plus />
              Add media
            </Button>
          </EmptyContent>
        </Empty>
      );
    } else if (isSearching || typeFilter !== "all") {
      emptyState = (
        <Empty className="border py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>No matches</EmptyTitle>
            <EmptyDescription>
              {isSearching ? "Nothing in the library matches that search." : `No ${typeFilter}s here.`}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              onClick={() => {
                setSearch("");
                setTypeFilter("all");
              }}
              variant="outline"
            >
              Clear filters
            </Button>
          </EmptyContent>
        </Empty>
      );
    } else if (childFolders.length === 0) {
      emptyState = (
        <Empty className="border py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Folder />
            </EmptyMedia>
            <EmptyTitle>This folder is empty</EmptyTitle>
            <EmptyDescription>Add media here, or drag files in from another folder.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => openAddDialog()} variant="outline">
              <Plus />
              Add media
            </Button>
          </EmptyContent>
        </Empty>
      );
    }
  }

  return (
    <DndContext
      id="media-library-dnd"
      collisionDetection={collisionDetection}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Media library"
          description="Images, videos and YouTube links your playlists draw from. Screens download what they need and keep playing it offline."
          action={
            <Button onClick={() => openAddDialog()} size="lg">
              <Plus />
              Add media
            </Button>
          }
        />

        <div className="grid items-start gap-4 lg:grid-cols-[232px_minmax(0,1fr)]">
          <Card className="gap-2 py-3 lg:sticky lg:top-20" size="sm">
            <div className="flex items-center justify-between px-3">
              <p className="text-sm font-medium">Folders</p>
              <Button
                aria-label="New folder"
                onClick={() => setFolderDialog({ mode: "create", parentId: selectedFolderId })}
                size="icon-sm"
                title="New folder"
                variant="ghost"
              >
                <FolderPlus />
              </Button>
            </div>
            <div className="flex flex-col gap-2 px-1.5">
              {folders.length > 8 ? (
                <Input
                  className="mx-1.5 w-auto"
                  onChange={(event) => setFolderSearch(event.target.value)}
                  placeholder="Find folder"
                  value={folderSearch}
                />
              ) : null}
              <LibraryFolderTree
                activeDragType={dragActive ? "asset" : null}
                droppableScope="media"
                filterQuery={deferredFolderSearch}
                folders={folders}
                itemCounts={folderAssetCounts}
                onDelete={requestDeleteFolder}
                onRename={(folder) => setFolderDialog({ mode: "rename", folder })}
                onSelect={openFolder}
                rootLabel="Library"
                // Nothing is highlighted while search results span every folder.
                selectedFolderId={isSearching ? "" : selectedFolderId}
              />
            </div>
          </Card>

          <Card
            className="relative min-h-[28rem] gap-0 py-0"
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsFileDragOver(false);
            }}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes("Files")) {
                event.preventDefault();
                setIsFileDragOver(true);
              }
            }}
            onDrop={(event) => {
              if (!event.dataTransfer.files.length) return;
              event.preventDefault();
              setIsFileDragOver(false);
              openAddDialog(Array.from(event.dataTransfer.files));
            }}
          >
            <CardHeader className="flex flex-col gap-3 border-b py-3">
              <div className="flex w-full items-center gap-3">
                <div className="min-w-0 flex-1">
                  {isSearching ? (
                    <h2 className="truncate text-base font-semibold">
                      Results for “{deferredSearch.trim()}”
                    </h2>
                  ) : (
                    <nav aria-label="Folder path" className="flex min-w-0 items-center gap-1 text-base">
                      {folderTrail.length > 0 ? (
                        <>
                          <button
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            onClick={() => openFolder(null)}
                            type="button"
                          >
                            Library
                          </button>
                          {folderTrail.slice(0, -1).map((folder) => (
                            <span key={folder.id} className="flex min-w-0 items-center gap-1">
                              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                              <button
                                className="truncate text-muted-foreground hover:text-foreground"
                                onClick={() => openFolder(folder.id)}
                                type="button"
                              >
                                {folder.name}
                              </button>
                            </span>
                          ))}
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        </>
                      ) : null}
                      <h2 className="truncate font-semibold">{currentFolderName}</h2>
                    </nav>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {isSearching
                      ? `${plural(scopedAssets.length, "file")} across the library`
                      : [
                          childFolders.length ? plural(childFolders.length, "folder") : null,
                          plural(scopedAssets.length, "file"),
                        ]
                          .filter(Boolean)
                          .join(", ")}
                  </p>
                </div>
                {!isSearching ? folderMenu : null}
              </div>

              {selectionCount > 0 ? (
                <div
                  aria-label="Selection actions"
                  className="flex min-h-9 w-full flex-wrap items-center gap-2 rounded-lg bg-accent px-2 py-1 text-accent-foreground"
                  role="toolbar"
                >
                  <span className="ml-1 text-sm font-medium">{selectionCount} selected</span>
                  <Button
                    className="mr-auto"
                    onClick={() =>
                      allVisibleSelected
                        ? clearSelection()
                        : setSelectedAssetIds(visibleAssets.map((asset) => asset.id))
                    }
                    size="sm"
                    variant="ghost"
                  >
                    {allVisibleSelected ? "Select none" : `Select all ${visibleAssets.length}`}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>
                      <FolderInput />
                      Move to
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <FolderPickerItems
                        folders={folders}
                        onPick={(folderId) => {
                          void moveAssetsToFolder(
                            selectedAssetIds.filter(
                              (id) => (assetMap.get(id)?.folderId ?? null) !== folderId,
                            ),
                            folderId,
                          );
                          clearSelection();
                        }}
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button onClick={() => setTagsOpen(true)} size="sm" variant="outline">
                    <Tag />
                    Add tags
                  </Button>
                  <Button
                    onClick={() => requestDeleteAssets(selectedAssetIds)}
                    size="sm"
                    variant="destructive"
                  >
                    <Trash2 />
                    Delete
                  </Button>
                  <Button
                    aria-label="Clear selection"
                    onClick={clearSelection}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <X />
                  </Button>
                </div>
              ) : (
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                  <InputGroup className="sm:max-w-xs">
                    <InputGroupInput
                      aria-label="Search the library"
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search all media"
                      value={search}
                    />
                    <InputGroupAddon>
                      <Search />
                    </InputGroupAddon>
                    {search ? (
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton
                          aria-label="Clear search"
                          onClick={() => setSearch("")}
                          size="icon-xs"
                        >
                          <X />
                        </InputGroupButton>
                      </InputGroupAddon>
                    ) : null}
                  </InputGroup>
                  <div className="flex flex-1 items-center gap-2">
                    <div className="flex items-center gap-1" role="group" aria-label="Filter by type">
                      {filterOptions.map((option) => (
                        <button
                          key={option.value}
                          aria-pressed={typeFilter === option.value}
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                            typeFilter === option.value
                              ? "border-primary/40 bg-accent text-accent-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                          onClick={() => setTypeFilter(option.value)}
                          type="button"
                        >
                          {option.label}
                          <span className="tabular-nums opacity-70">{typeCounts[option.value]}</span>
                        </button>
                      ))}
                    </div>
                    <div
                      className="ml-auto flex items-center gap-1 rounded-lg border p-0.5"
                      role="group"
                      aria-label="Layout"
                    >
                      <Button
                        aria-label="Grid view"
                        aria-pressed={layout === "grid"}
                        onClick={() => changeLayout("grid")}
                        size="icon-sm"
                        variant={layout === "grid" ? "secondary" : "ghost"}
                      >
                        <LayoutGrid />
                      </Button>
                      <Button
                        aria-label="List view"
                        aria-pressed={layout === "list"}
                        onClick={() => changeLayout("list")}
                        size="icon-sm"
                        variant={layout === "list" ? "secondary" : "ghost"}
                      >
                        <List />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardHeader>

            <CardContent
              className={cn(
                "flex flex-col gap-4 py-4",
                layout === "list" && visibleAssets.length > 0 && "px-0 pb-0",
              )}
            >
              {childFolders.length > 0 && typeFilter === "all" ? (
                <ul
                  className={cn(
                    "grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
                    layout === "list" && visibleAssets.length > 0 && "px-4",
                  )}
                >
                  {childFolders.map((folder) => (
                    <FolderTile
                      count={nestedCount(folder.id)}
                      dragActive={dragActive}
                      folder={folder}
                      key={folder.id}
                      onOpen={() => openFolder(folder.id)}
                    />
                  ))}
                </ul>
              ) : null}

              {emptyState}

              {visibleAssets.length > 0 && layout === "grid" ? (
                <ul className="-mx-1.5 grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {visibleAssets.map((asset) => (
                    <MediaCard
                      asset={asset}
                      folderLabel={folderLabelFor(asset)}
                      isSelected={selectedAssetSet.has(asset.id)}
                      key={asset.id}
                      onActivate={(event) => handleActivate(asset.id, event)}
                      onToggle={() => toggleAsset(asset.id)}
                      selectionMode={selectionCount > 0}
                    />
                  ))}
                </ul>
              ) : null}

              {visibleAssets.length > 0 && layout === "list" ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 pl-4">
                        <Checkbox
                          aria-label="Select all"
                          checked={allVisibleSelected ? true : selectionCount > 0 ? "indeterminate" : false}
                          onCheckedChange={() =>
                            allVisibleSelected
                              ? clearSelection()
                              : setSelectedAssetIds(visibleAssets.map((asset) => asset.id))
                          }
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden sm:table-cell">Type</TableHead>
                      <TableHead className="hidden md:table-cell">Length / size</TableHead>
                      <TableHead className="hidden pr-4 text-right md:table-cell">File size</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleAssets.map((asset) => (
                      <MediaRow
                        asset={asset}
                        folderLabel={folderLabelFor(asset)}
                        isSelected={selectedAssetSet.has(asset.id)}
                        key={asset.id}
                        onActivate={(event) => handleActivate(asset.id, event)}
                        onToggle={() => toggleAsset(asset.id)}
                      />
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>

            {isFileDragOver ? (
              <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-background/90 text-center">
                <Upload className="size-6 text-primary" />
                <p className="text-sm font-medium">Drop to add to {currentFolderName}</p>
              </div>
            ) : null}
          </Card>
        </div>
      </div>

      {notice ? (
        <div
          className={cn(
            "fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-lg border bg-popover px-3 py-2 text-sm shadow-lg",
            !notice.ok && "border-destructive/40 text-destructive",
          )}
          role="status"
        >
          <span>{notice.text}</span>
          <Button aria-label="Dismiss" onClick={() => setNotice(null)} size="icon-xs" variant="ghost">
            <X />
          </Button>
        </div>
      ) : null}

      <DragOverlay dropAnimation={null}>
        {activeDragAssets.length > 0 ? (
          <div className="flex min-w-56 items-center gap-3 rounded-lg border bg-popover px-3 py-2 text-sm shadow-xl">
            <span className="flex size-8 items-center justify-center rounded-md bg-accent">
              <MoveRight className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">
                {activeDragAssets.length === 1
                  ? activeDragAssets[0]!.title
                  : plural(activeDragAssets.length, "file")}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {activeDropFolderName
                  ? `Release to move to ${activeDropFolderName}`
                  : "Drop on a folder to move"}
              </span>
            </span>
          </div>
        ) : null}
      </DragOverlay>

      <MediaAddDialog
        folderId={selectedFolderId}
        folderName={currentFolderName}
        initialFiles={droppedFiles}
        onAdded={(added, message) => {
          setAssets((current) => [...added, ...current]);
          setNotice({ ok: true, text: message });
          refreshData();
        }}
        onOpenChange={setAddOpen}
        open={addOpen}
      />
      <MediaAssetSheet
        asset={detailsAsset}
        folders={folders}
        onDelete={(assetId) => requestDeleteAssets([assetId])}
        onMove={(assetId, folderId) => void moveAssetsToFolder([assetId], folderId)}
        onOpenChange={(open) => !open && setDetailsAssetId(null)}
        onSave={(assetId, updates) => void saveAssetEdit(assetId, updates)}
      />
      <ConfirmDialog onClose={() => setConfirmRequest(null)} request={confirmRequest} />
      <FolderNameDialog
        onClose={() => setFolderDialog(null)}
        onSubmit={submitFolderDialog}
        parentName={
          folderDialog?.mode === "create" && folderDialog.parentId
            ? (folderMap.get(folderDialog.parentId)?.name ?? "Library")
            : "Library"
        }
        request={folderDialog}
      />
      <TagsDialog
        count={selectionCount}
        onClose={() => setTagsOpen(false)}
        onSubmit={addTagsToSelection}
        open={tagsOpen}
      />
    </DndContext>
  );
}
