"use client";

import { ChevronRight, Folder, FolderOpen, Pencil, Trash2 } from "lucide-react";
import type { LibraryFolder } from "@showroom/contracts";

import { cn } from "@/lib/utils";
import { getFolderChildren } from "@/lib/library";

type DragItemType = "asset" | "playlist";

export function LibraryFolderTree({
  folders,
  selectedFolderId,
  rootLabel,
  onSelect,
  onRename,
  onDelete,
  onDropItem,
}: {
  folders: LibraryFolder[];
  selectedFolderId: string | null;
  rootLabel: string;
  onSelect: (folderId: string | null) => void;
  onRename?: (folder: LibraryFolder) => void;
  onDelete?: (folder: LibraryFolder) => void;
  onDropItem?: (folderId: string | null, dragType: DragItemType, itemId: string) => void;
}) {
  function handleDrop(
    event: React.DragEvent<HTMLButtonElement>,
    folderId: string | null,
  ) {
    const dragType = event.dataTransfer.getData("application/x-showroom-drag-type");
    const itemId = event.dataTransfer.getData("application/x-showroom-item-id");
    if (!dragType || !itemId || !onDropItem) {
      return;
    }

    event.preventDefault();
    onDropItem(folderId, dragType as DragItemType, itemId);
  }

  function FolderNode({
    folder,
    depth,
  }: {
    folder: LibraryFolder;
    depth: number;
  }) {
    const children = getFolderChildren(folders, folder.id);
    const isSelected = selectedFolderId === folder.id;

    return (
      <div>
        <div className="group flex items-center gap-2">
          <button
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-md px-3 text-sm transition-colors",
              isSelected
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
            )}
            onClick={() => onSelect(folder.id)}
            onDragOver={(event) => {
              if (!onDropItem) {
                return;
              }

              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => handleDrop(event, folder.id)}
            style={{ paddingLeft: `${12 + depth * 14}px` }}
            type="button"
          >
            {children.length > 0 ? (
              <ChevronRight className="size-4 text-muted-foreground" />
            ) : (
              <span className="block size-4" />
            )}
            {isSelected ? (
              <FolderOpen className="size-4" />
            ) : (
              <Folder className="size-4" />
            )}
            <span className="truncate">{folder.name}</span>
          </button>
          {(onRename || onDelete) ? (
            <div className="hidden items-center gap-1 pr-1 group-hover:flex">
              {onRename ? (
                <button
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => onRename(folder)}
                  type="button"
                >
                  <Pencil className="size-3.5" />
                </button>
              ) : null}
              {onDelete ? (
                <button
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => onDelete(folder)}
                  type="button"
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {children.length > 0 ? (
          <div className="mt-1 space-y-1">
            {children.map((child) => (
              <FolderNode key={child.id} depth={depth + 1} folder={child} />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md px-3 text-sm transition-colors",
          selectedFolderId === null
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
        )}
        onClick={() => onSelect(null)}
        onDragOver={(event) => {
          if (!onDropItem) {
            return;
          }

          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => handleDrop(event, null)}
        type="button"
      >
        <Folder className="size-4" />
        <span>{rootLabel}</span>
      </button>
      {getFolderChildren(folders, null).map((folder) => (
        <FolderNode key={folder.id} depth={0} folder={folder} />
      ))}
    </div>
  );
}
