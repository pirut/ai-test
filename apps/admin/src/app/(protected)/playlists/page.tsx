import { requireOrgId } from "@/lib/auth";
import { listPlaylists } from "@/lib/backend";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PlaylistsPage() {
  await requireOrgId();
  const playlists = await listPlaylists();

  return (
    <div className="flex flex-col gap-8">
      <header className="border-b border-border pb-6">
        <p className="mb-1 flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-brand">
          <span className="inline-block h-px w-4 bg-brand opacity-70" />
          Programming
        </p>
        <h1 className="text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold tracking-tight leading-tight">
          Playlists
        </h1>
        <p className="mt-1 text-[0.9rem] text-muted-foreground">
          Ordered media tracks with per-item dwell times and screen-safe defaults.
        </p>
      </header>

      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
        {playlists.map((playlist) => (
          <Card key={playlist.id}>
            <CardHeader>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-brand">
                Playlist
              </p>
              <CardTitle>{playlist.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                {playlist.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-4 py-2 text-[0.85rem]">
                    <span className="text-muted-foreground">{item.asset.title}</span>
                    <strong className="font-mono text-[0.82rem] text-card-foreground">
                      {item.dwellSeconds ?? item.asset.durationSeconds ?? 10}s
                    </strong>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
