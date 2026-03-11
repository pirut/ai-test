"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
  const hasMedia = mediaAssets.length > 0;

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
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <Card className="border border-border/70 bg-card/95">
        <CardHeader className="border-b border-border/60">
          <CardTitle className="text-[0.92rem] font-semibold">Create playlist</CardTitle>
          <p className="text-[0.78rem] text-muted-foreground">
            Assemble a loop from approved assets. Images can carry dwell overrides, videos play full length.
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
              placeholder="Main showroom loop"
              value={name}
            />
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[0.82rem] font-medium text-foreground">Default fallback</p>
                <p className="text-[0.75rem] text-muted-foreground">
                  Use this playlist whenever no schedule window is active.
                </p>
              </div>
              <Switch checked={makeDefault} onCheckedChange={setMakeDefault} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
            <div>
              <p className="text-[0.82rem] font-medium text-foreground">Selection buffer</p>
              <p className="text-[0.75rem] text-muted-foreground">
                {selectedIds.length} asset{selectedIds.length === 1 ? "" : "s"} staged
              </p>
            </div>
            <Button
              disabled={selectedIds.length === 0}
              onClick={() => {
                setSelectedIds([]);
                setDwellByAsset({});
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Clear
            </Button>
          </div>

          <Button disabled={saving || !hasMedia} onClick={() => void handleSave()} type="button">
            {saving ? "Saving…" : "Save playlist"}
          </Button>
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
        <Card className="border border-border/70 bg-card/95">
          <CardHeader className="border-b border-border/60">
            <CardTitle className="text-[0.92rem] font-semibold">Source media</CardTitle>
            <p className="text-[0.78rem] text-muted-foreground">
              Click a card to include it. Selected assets receive a mint edge and a dwell override field.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 pt-5 md:grid-cols-2">
            {!hasMedia ? (
              <div className="md:col-span-2 rounded-xl border border-dashed border-border/80 bg-muted/15 p-5">
                <p className="text-sm font-medium text-foreground">No approved media yet</p>
                <p className="mt-1 text-[0.78rem] text-muted-foreground">
                  The media picker stays inactive until the library has at least one uploaded asset.
                </p>
              </div>
            ) : null}
            {mediaAssets.map((asset) => {
              const isSelected = selectedSet.has(asset.id);
              const dwellValue = dwellByAsset[asset.id] ?? null;
              const dwellDisabled = !isSelected || asset.type === "video";
              return (
                <button
                  key={asset.id}
                  className={cn(
                    "group flex flex-col gap-3 rounded-xl border p-3 text-left transition-all",
                    isSelected
                      ? "border-primary/70 bg-primary/8 shadow-[0_0_0_1px_rgba(0,217,160,0.2)]"
                      : "border-border/80 bg-muted/15 hover:border-primary/30 hover:bg-muted/25",
                  )}
                  onClick={() => toggleAsset(asset.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Checkbox checked={isSelected} className="pointer-events-none" />
                      <span className="truncate text-sm font-medium text-foreground">{asset.title}</span>
                    </div>
                    <Badge variant="outline">{asset.type}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[0.75rem] text-muted-foreground">
                    <span className="truncate font-mono">{asset.fileName}</span>
                    <span className="font-mono">
                      {asset.type === "video" ? `${asset.durationSeconds ?? 0}s` : "image"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/70 px-3 py-2">
                    <div className="space-y-0.5">
                      <p className="text-[0.76rem] font-medium text-foreground">Image dwell</p>
                      <p className="text-[0.7rem] text-muted-foreground">
                        Override the default image dwell on selected image assets.
                      </p>
                    </div>
                    <div className="w-28" onClick={(event) => event.stopPropagation()}>
                      <Select
                        disabled={dwellDisabled}
                        items={[
                          { label: "Default", value: DWELL_DEFAULT_VALUE },
                          ...DWELL_OPTIONS,
                        ]}
                        onValueChange={(value) =>
                          setDwellByAsset((current) => {
                            if (!value || value === DWELL_DEFAULT_VALUE) {
                              const next = { ...current };
                              delete next[asset.id];
                              return next;
                            }

                            return {
                              ...current,
                              [asset.id]: value,
                            };
                          })
                        }
                        value={dwellValue}
                        >
                        <SelectTrigger className="h-8 font-mono">
                          <SelectValue
                            placeholder={
                              asset.type === "video"
                                ? "Video only"
                                : isSelected
                                  ? "Default"
                                  : "Select item"
                            }
                          />
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
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <section className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
          {playlists.map((playlist) => (
            <Card key={playlist.id} className="border border-border/70 bg-card/95">
              <CardHeader className="border-b border-border/60">
                <CardTitle className="text-[0.88rem] font-semibold">{playlist.name}</CardTitle>
                <p className="text-[0.75rem] text-muted-foreground">
                  {playlist.items.length} item{playlist.items.length !== 1 ? "s" : ""}
                </p>
              </CardHeader>
              <CardContent className="divide-y divide-border/60 pt-2">
                {playlist.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                    <span className="truncate text-[0.82rem] text-foreground">{item.asset.title}</span>
                    <span className="shrink-0 font-mono text-[0.75rem] text-muted-foreground">
                      {item.dwellSeconds ?? item.asset.durationSeconds ?? 10}s
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </div>
  );
}
