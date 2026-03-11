"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { MediaAsset, Playlist } from "@showroom/contracts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dwellByAsset, setDwellByAsset] = useState<Record<string, string>>({});
  const [makeDefault, setMakeDefault] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  function toggleAsset(assetId: string) {
    setSelectedIds((current) =>
      current.includes(assetId)
        ? current.filter((entry) => entry !== assetId)
        : [...current, assetId],
    );
  }

  async function handleSave() {
    if (!name.trim() || selectedIds.length === 0) {
      setStatus({ ok: false, text: "Add a name and at least one media item." });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          makeDefault,
          itemIds: selectedIds.map((mediaAssetId) => {
            const dwell = Number(dwellByAsset[mediaAssetId]);
            return {
              mediaAssetId,
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
      setPlaylists((current) => [nextPlaylist, ...current.filter((item) => item.id !== nextPlaylist.id)]);
      setName("");
      setSelectedIds([]);
      setDwellByAsset({});
      setMakeDefault(false);
      setStatus({ ok: true, text: `Saved ${nextPlaylist.name}` });
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

  return (
    <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-[0.88rem] font-semibold text-foreground">Create playlist</h2>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.8rem] text-muted-foreground">Name</label>
            <Input onChange={(event) => setName(event.target.value)} value={name} />
          </div>
          <label className="flex items-center gap-2 text-[0.8rem] text-muted-foreground">
            <input
              checked={makeDefault}
              className="size-4 rounded border-border bg-background"
              onChange={(event) => setMakeDefault(event.target.checked)}
              type="checkbox"
            />
            Use as default fallback playlist
          </label>
          <Button disabled={saving} onClick={() => void handleSave()} type="button">
            {saving ? "Saving…" : "Save playlist"}
          </Button>
          {status ? (
            <p className={cn("text-[0.8rem] font-mono", status.ok ? "text-primary" : "text-destructive")}>
              {status.text}
            </p>
          ) : null}
        </div>
      </section>

      <div className="flex flex-col gap-6">
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-[0.88rem] font-semibold text-foreground">Source media</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {mediaAssets.map((asset) => (
              <label
                key={asset.id}
                className={cn(
                  "grid gap-2 rounded-lg border p-3 transition-colors",
                  selectedSet.has(asset.id) ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <div className="flex items-center gap-2">
                  <input
                    checked={selectedSet.has(asset.id)}
                    onChange={() => toggleAsset(asset.id)}
                    type="checkbox"
                  />
                  <span className="truncate text-sm font-medium text-foreground">{asset.title}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-[0.75rem] text-muted-foreground">
                  <span>{asset.type}</span>
                  <Input
                    className="h-8 w-24 font-mono"
                    disabled={!selectedSet.has(asset.id) || asset.type === "video"}
                    min="1"
                    onChange={(event) =>
                      setDwellByAsset((current) => ({
                        ...current,
                        [asset.id]: event.target.value,
                      }))
                    }
                    placeholder="10"
                    type="number"
                    value={dwellByAsset[asset.id] ?? ""}
                  />
                </div>
              </label>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
          {playlists.map((playlist) => (
            <article key={playlist.id} className="flex flex-col rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <p className="text-[0.88rem] font-semibold text-card-foreground">{playlist.name}</p>
                <p className="text-[0.75rem] text-muted-foreground">
                  {playlist.items.length} item{playlist.items.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div>
                {playlist.items.map((item, index) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center justify-between gap-4 px-4 py-2.5 text-sm",
                      index < playlist.items.length - 1 && "border-b border-border",
                    )}
                  >
                    <span className="truncate text-[0.82rem] text-foreground">{item.asset.title}</span>
                    <span className="shrink-0 font-mono text-[0.75rem] text-muted-foreground">
                      {item.dwellSeconds ?? item.asset.durationSeconds ?? 10}s
                    </span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
