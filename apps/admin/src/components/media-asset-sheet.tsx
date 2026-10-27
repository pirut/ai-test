"use client";

import { useMemo } from "react";
import { Check, ChevronDown, Folder, Trash2 } from "lucide-react";
import type { LibraryFolder, MediaAsset } from "@showroom/contracts";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getFolderChildren, getFolderMap } from "@/lib/library";
import { assetKindLabel, formatDimensions, formatDuration, parseTags, prettyBytes } from "@/lib/media-format";

/** Folder choices for a "Move to" menu, indented to show nesting. */
export function FolderPickerItems({
  folders,
  currentFolderId,
  onPick,
}: {
  folders: LibraryFolder[];
  currentFolderId?: string | null;
  onPick: (folderId: string | null) => void;
}) {
  const rows = useMemo(() => {
    const out: { folder: LibraryFolder; depth: number }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      for (const folder of getFolderChildren(folders, parentId)) {
        out.push({ folder, depth });
        walk(folder.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [folders]);

  return (
    <DropdownMenuGroup>
      <DropdownMenuItem onClick={() => onPick(null)}>
        <Folder />
        <span className="flex-1">Library (no folder)</span>
        {currentFolderId === null ? <Check /> : null}
      </DropdownMenuItem>
      {rows.map(({ folder, depth }) => (
        <DropdownMenuItem key={folder.id} onClick={() => onPick(folder.id)}>
          <Folder style={{ marginLeft: depth * 12 }} />
          <span className="flex-1 truncate">{folder.name}</span>
          {currentFolderId === folder.id ? <Check /> : null}
        </DropdownMenuItem>
      ))}
    </DropdownMenuGroup>
  );
}

export function MediaAssetSheet({
  asset,
  folders,
  onOpenChange,
  onSave,
  onMove,
  onDelete,
}: {
  asset: MediaAsset | null;
  folders: LibraryFolder[];
  onOpenChange: (open: boolean) => void;
  onSave: (assetId: string, updates: Partial<MediaAsset>) => void;
  onMove: (assetId: string, folderId: string | null) => void;
  onDelete: (assetId: string) => void;
}) {
  const folderMap = useMemo(() => getFolderMap(folders), [folders]);
  const folderName = asset?.folderId ? (folderMap.get(asset.folderId)?.name ?? "Folder") : "Library";

  const facts = asset
    ? [
        ["Type", assetKindLabel(asset)],
        asset.type === "video" && asset.durationSeconds
          ? ["Length", formatDuration(asset.durationSeconds)]
          : null,
        formatDimensions(asset) ? ["Dimensions", formatDimensions(asset)!] : null,
        asset.sourceType !== "youtube" ? ["File size", prettyBytes(asset.sizeBytes)] : null,
        ["File name", asset.fileName],
      ].filter((entry): entry is [string, string] => entry !== null)
    : [];

  return (
    <Sheet open={asset !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {asset ? (
          <>
            <SheetHeader className="pr-12">
              <SheetTitle className="truncate">{asset.title}</SheetTitle>
              <SheetDescription>
                {assetKindLabel(asset)} in {folderName}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-5 px-4 pb-4">
              <div className="aspect-video overflow-hidden rounded-lg border bg-muted">
                {asset.type === "video" && asset.sourceType !== "youtube" ? (
                  <video
                    className="size-full object-contain"
                    controls
                    key={asset.id}
                    preload="metadata"
                    src={asset.previewUrl}
                  />
                ) : (
                  <img alt="" className="size-full object-cover" decoding="async" src={asset.previewUrl} />
                )}
              </div>

              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="asset-title">Title</FieldLabel>
                  <Input
                    defaultValue={asset.title}
                    id="asset-title"
                    key={`${asset.id}-title-${asset.title}`}
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (next && next !== asset.title) onSave(asset.id, { title: next });
                    }}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="asset-tags">Tags</FieldLabel>
                  <Input
                    defaultValue={asset.tags.join(", ")}
                    id="asset-tags"
                    key={`${asset.id}-tags-${asset.tags.join(",")}`}
                    onBlur={(event) => {
                      const next = parseTags(event.target.value);
                      if (next.join(",") !== asset.tags.join(",")) onSave(asset.id, { tags: next });
                    }}
                    placeholder="Comma separated"
                  />
                  <FieldDescription>Changes save when you leave the field.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>Folder</FieldLabel>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button className="w-full justify-between font-normal" variant="outline" />}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Folder className="text-muted-foreground" />
                        <span className="truncate">{folderName}</span>
                      </span>
                      <ChevronDown className="text-muted-foreground" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <FolderPickerItems
                        currentFolderId={asset.folderId ?? null}
                        folders={folders}
                        onPick={(folderId) => {
                          if (folderId !== (asset.folderId ?? null)) onMove(asset.id, folderId);
                        }}
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Field>
              </FieldGroup>

              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
                {facts.map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="truncate text-right">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <SheetFooter className="mt-auto border-t">
              <Button onClick={() => onDelete(asset.id)} variant="destructive">
                <Trash2 />
                Delete from library
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
