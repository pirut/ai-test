"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { MediaAsset, Playlist } from "@showroom/contracts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const DWELL_OPTIONS = [5, 10, 15, 20, 30, 45, 60].map((value) => ({
  label: `${value}s`,
  value: String(value),
}));
const DWELL_DEFAULT_VALUE = "__default__";

type QueueItem = {
  assetId: string;
  dwellSeconds: string | null;
};

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}:${String(s).padStart(2, "0")}`;
  return `0:${String(s).padStart(2, "0")}`;
}

export function PlaylistManager({
  initialPlaylists,
  mediaAssets,
}: {
  initialPlaylists: Playlist[];
  mediaAssets: MediaAsset[];
}) {
  const router = useRouter();
  const [playlists, setPlaylists] = useState(initialPlaylists);
  const [name, setName] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [makeDefault, setMakeDefault] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const assetMap = useMemo(() => new Map(mediaAssets.map((a) => [a.id, a])), [mediaAssets]);
  const selectedSet = useMemo(() => new Set(queue.map((i) => i.assetId)), [queue]);
  const hasMedia = mediaAssets.length > 0;
  const isEditing = editingId !== null;

  function toggleAsset(assetId: string) {
    setQueue((current) => {
      if (current.some((i) => i.assetId === assetId)) {
        return current.filter((i) => i.assetId !== assetId);
      }
      return [...current, { assetId, dwellSeconds: null }];
    });
  }

  function moveItem(index: number, direction: "up" | "down") {
    setQueue((current) => {
      const next = [...current];
      const swapIdx = direction === "up" ? index - 1 : index + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return next;
      [next[index], next[swapIdx]] = [next[swapIdx]!, next[index]!];
      return next;
    });
  }

  function setDwell(assetId: string, value: string | null) {
    setQueue((current) =>
      current.map((i) => (i.assetId === assetId ? { ...i, dwellSeconds: value } : i)),
    );
  }

  function startEditing(playlist: Playlist) {
    setEditingId(playlist.id);
    setName(playlist.name);
    setMakeDefault(false);
    setQueue(
      [...playlist.items]
        .sort((a, b) => a.order - b.order)
        .map((item) => ({
          assetId: item.asset.id,
          dwellSeconds: item.dwellSeconds ? String(item.dwellSeconds) : null,
        })),
    );
    setStatus(null);
    setConfirmDeleteId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = setTimeout(() => setConfirmDeleteId(null), 3000);
    return () => clearTimeout(timer);
  }, [confirmDeleteId]);

  function cancelEditing() {
    setEditingId(null);
    setName("");
    setQueue([]);
    setMakeDefault(false);
  }

  async function handleSave() {
    if (!name.trim() || queue.length === 0) {
      setStatus({ ok: false, text: "Add a name and at least one media item." });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playlistId: editingId ?? undefined,
          name: name.trim(),
          makeDefault,
          itemIds: queue.map(({ assetId, dwellSeconds }) => {
            const dwell = Number(dwellSeconds);
            return {
              mediaAssetId: assetId,
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
      setPlaylists((current) => [
        nextPlaylist,
        ...current.filter((p) => p.id !== nextPlaylist.id),
      ]);
      setStatus({ ok: true, text: `Saved "${nextPlaylist.name}"` });
      cancelEditing();
      router.refresh();
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
    if (confirmDeleteId !== playlistId) {
      setConfirmDeleteId(playlistId);
      return;
    }

    setDeleting(true);
    setConfirmDeleteId(null);
    try {
      const response = await fetch(`/api/playlists/${playlistId}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? "Unable to delete playlist");
      }

      setPlaylists((current) => current.filter((p) => p.id !== playlistId));
      if (editingId === playlistId) cancelEditing();
      router.refresh();
    } catch (error) {
      setStatus({
        ok: false,
        text: error instanceof Error ? error.message : "Unable to delete playlist",
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      {/* Create / Edit panel */}
      <Card className="border border-border/70 bg-card/95">
        <CardHeader className="border-b border-border/60">
          <CardTitle className="text-[0.92rem] font-semibold">
            {isEditing ? "Edit playlist" : "Create playlist"}
          </CardTitle>
          <p className="text-[0.78rem] text-muted-foreground">
            {isEditing
              ? "Reorder items, update dwell times, then save."
              : "Select media below, arrange the queue, and save."}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-5">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[0.8rem] text-muted-foreground" htmlFor="playlist-name">
              Name
            </Label>
            <Input
              id="playlist-name"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim() && queue.length > 0) void handleSave();
              }}
              placeholder="Main showroom loop"
              value={name}
            />
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[0.82rem] font-medium text-foreground">Default fallback</p>
                <p className="text-[0.75rem] text-muted-foreground">
                  Use whenever no schedule window is active.
                </p>
              </div>
              <Switch checked={makeDefault} onCheckedChange={setMakeDefault} />
            </div>
          </div>

          {/* Ordered queue */}
          {queue.length > 0 ? (
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <p className="mb-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-primary">
                Queue · {queue.length} item{queue.length !== 1 ? "s" : ""}
              </p>
              <div className="flex flex-col gap-1.5">
                {queue.map((item, index) => {
                  const asset = assetMap.get(item.assetId);
                  if (!asset) return null;
                  return (
                    <div
                      key={item.assetId}
                      className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-2 py-1.5"
                    >
                      {/* Reorder arrows */}
                      <div className="flex flex-col">
                        <button
                          aria-label="Move up"
                          className="flex h-4 w-4 items-center justify-center text-[0.6rem] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-25"
                          disabled={index === 0}
                          onClick={() => moveItem(index, "up")}
                          type="button"
                        >
                          ▲
                        </button>
                        <button
                          aria-label="Move down"
                          className="flex h-4 w-4 items-center justify-center text-[0.6rem] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-25"
                          disabled={index === queue.length - 1}
                          onClick={() => moveItem(index, "down")}
                          type="button"
                        >
                          ▼
                        </button>
                      </div>

                      <span className="flex-1 truncate text-[0.8rem] font-medium text-foreground">
                        {asset.title}
                      </span>

                      {/* Dwell / duration */}
                      {asset.type === "image" ? (
                        <div
                          className="w-24 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Select
                            items={[{ label: "Default", value: DWELL_DEFAULT_VALUE }, ...DWELL_OPTIONS]}
                            value={item.dwellSeconds ?? DWELL_DEFAULT_VALUE}
                            onValueChange={(value) =>
                              setDwell(
                                item.assetId,
                                !value || value === DWELL_DEFAULT_VALUE ? null : value,
                              )
                            }
                          >
                            <SelectTrigger className="h-7 text-[0.75rem] font-mono">
                              <SelectValue placeholder="Default" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={DWELL_DEFAULT_VALUE}>Default</SelectItem>
                              {DWELL_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <span className="shrink-0 font-mono text-[0.72rem] text-muted-foreground">
                          {asset.durationSeconds
                            ? formatDuration(Math.ceil(asset.durationSeconds))
                            : "video"}
                        </span>
                      )}

                      {/* Remove */}
                      <button
                        aria-label="Remove"
                        className="ml-0.5 shrink-0 text-muted-foreground/60 transition-colors hover:text-destructive"
                        onClick={() => toggleAsset(item.assetId)}
                        type="button"
                      >
                        <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M3 3l10 10M13 3L3 13" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 py-3">
              <p className="text-[0.8rem] text-muted-foreground">
                Click media cards below to add them to the queue.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={saving || !name.trim() || queue.length === 0}
              onClick={() => void handleSave()}
              type="button"
            >
              {saving ? "Saving…" : isEditing ? "Update playlist" : "Save playlist"}
            </Button>
            {isEditing ? (
              <Button onClick={cancelEditing} type="button" variant="outline">
                Cancel
              </Button>
            ) : null}
          </div>

          {status ? (
            <p className={cn("text-[0.8rem] font-mono", status.ok ? "text-primary" : "text-destructive")}>
              {status.text}
            </p>
          ) : !hasMedia ? (
            <p className="text-[0.8rem] font-mono text-muted-foreground">
              Upload media before building a playlist.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6">
        {/* Source media */}
        <Card className="border border-border/70 bg-card/95">
          <CardHeader className="border-b border-border/60">
            <CardTitle className="text-[0.92rem] font-semibold">Source media</CardTitle>
            <p className="text-[0.78rem] text-muted-foreground">
              Click a card to add or remove it from the queue.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 pt-5 md:grid-cols-2">
            {!hasMedia ? (
              <div className="md:col-span-2 rounded-xl border border-dashed border-border/80 bg-muted/15 p-5">
                <p className="text-sm font-medium text-foreground">No media yet</p>
                <p className="mt-1 text-[0.78rem] text-muted-foreground">
                  Upload assets on the Media page first.
                </p>
              </div>
            ) : null}
            {mediaAssets.map((asset) => {
              const isSelected = selectedSet.has(asset.id);
              return (
                <button
                  key={asset.id}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
                    isSelected
                      ? "border-primary/70 bg-primary/8 shadow-[0_0_0_1px_rgba(0,217,160,0.2)]"
                      : "border-border/80 bg-muted/15 hover:border-primary/30 hover:bg-muted/25",
                  )}
                  onClick={() => toggleAsset(asset.id)}
                  type="button"
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => {}}
                    className="pointer-events-none shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{asset.title}</p>
                    <p className="truncate font-mono text-[0.72rem] text-muted-foreground">
                      {asset.fileName}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {asset.type === "video"
                      ? asset.durationSeconds
                        ? formatDuration(Math.ceil(asset.durationSeconds))
                        : "video"
                      : "image"}
                  </Badge>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Existing playlists */}
        {playlists.length > 0 ? (
          <section>
            <h2 className="mb-3 text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Saved playlists
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
              {playlists.map((playlist) => (
                <Card key={playlist.id} className={cn(
                  "border bg-card/95 transition-colors",
                  editingId === playlist.id
                    ? "border-primary/50 bg-primary/5"
                    : "border-border/70",
                )}>
                  <CardHeader className="border-b border-border/60 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-[0.88rem] font-semibold">
                          {playlist.name}
                        </CardTitle>
                        <p className="mt-0.5 text-[0.75rem] text-muted-foreground">
                          {playlist.items.length} item{playlist.items.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          disabled={deleting}
                          onClick={() => startEditing(playlist)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Edit
                        </Button>
                        <Button
                          className={confirmDeleteId === playlist.id ? "border-destructive/30 text-destructive hover:bg-destructive/10" : ""}
                          disabled={deleting}
                          onClick={() => void handleDelete(playlist.id)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          {confirmDeleteId === playlist.id ? "Confirm?" : "Delete"}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="divide-y divide-border/60 pt-1">
                    {[...playlist.items]
                      .sort((a, b) => a.order - b.order)
                      .map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[0.72rem] font-mono text-muted-foreground/60 w-4 shrink-0 text-center">
                              {item.order + 1}
                            </span>
                            <span className="truncate text-[0.82rem] text-foreground">
                              {item.asset.title}
                            </span>
                          </div>
                          <span className="shrink-0 font-mono text-[0.75rem] text-muted-foreground">
                            {item.asset.type === "video"
                              ? item.asset.durationSeconds
                                ? formatDuration(Math.ceil(item.asset.durationSeconds))
                                : "video"
                              : item.dwellSeconds
                                ? `${item.dwellSeconds}s`
                                : "default"}
                          </span>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ) : (
          <div className="rounded-xl border border-dashed border-border/80 bg-muted/10 p-6 text-center">
            <p className="text-[0.85rem] text-muted-foreground">No playlists yet. Create one above.</p>
          </div>
        )}
      </div>
    </div>
  );
}
