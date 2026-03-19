"use client";

import { useDroppable } from "@dnd-kit/core";
import { ChevronRight, Folder, FolderOpen, Pencil, Trash2 } from "lucide-react";
import type { LibraryFolder } from "@showroom/contracts";

import { cn } from "@/lib/utils";
import { getFolderChildren } from "@/lib/library";

export type FolderTreeDragType = "asset" | "playlist";
export type FolderTreeScope = "media" | "playlist";

function FolderDropRow({
  children,
  droppableScope,
  activeDragType,
  folderId,
  isSelected,
}: {
  children: React.ReactNode;
  droppableScope?: FolderTreeScope;
  activeDragType?: FolderTreeDragType | null;
  folderId: string | null;
  isSelected: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `${droppableScope ?? "none"}:${folderId ?? "root"}`,
    disabled: !droppableScope,
    data: droppableScope
      ? {
          type: "folder",
          scope: droppableScope,
          folderId,
        }
      : undefined,
  });

  return (
    <div
      className={cn(
        "rounded-md transition-colors",
        isOver && activeDragType
          ? "bg-accent ring-1 ring-foreground/15"
          : isSelected
            ? "bg-accent"
            : "",
      )}
      ref={setNodeRef}
    >
      {children}
    </div>
  );
}

export function LibraryFolderTree({
  folders,
  selectedFolderId,
  rootLabel,
  onSelect,
  onRename,
  onDelete,
  droppableScope,
  activeDragType,
}: {
  folders: LibraryFolder[];
  selectedFolderId: string | null;
  rootLabel: string;
  onSelect: (folderId: string | null) => void;
  onRename?: (folder: LibraryFolder) => void;
  onDelete?: (folder: LibraryFolder) => void;
  droppableScope?: FolderTreeScope;
  activeDragType?: FolderTreeDragType | null;
}) {
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
          <FolderDropRow
            activeDragType={activeDragType ?? null}
            droppableScope={droppableScope}
            folderId={folder.id}
            isSelected={isSelected}
          >
            <button
              className={cn(
                "flex h-9 w-full items-center gap-2 rounded-md px-3 text-sm transition-colors",
                isSelected
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onSelect(folder.id)}
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
          </FolderDropRow>
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

  const rootSelected = selectedFolderId === null;

  return (
    <div className="space-y-1">
      <FolderDropRow
        activeDragType={activeDragType ?? null}
        droppableScope={droppableScope}
        folderId={null}
        isSelected={rootSelected}
      >
        <button
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md px-3 text-sm transition-colors",
            rootSelected
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onSelect(null)}
          type="button"
        >
          <Folder className="size-4" />
          <span>{rootLabel}</span>
        </button>
      </FolderDropRow>
      {getFolderChildren(folders, null).map((folder) => (
        <FolderNode key={folder.id} depth={0} folder={folder} />
      ))}
    </div>
  );
}
