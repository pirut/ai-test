import { PageHeader } from "@/components/page-header";
import { requireOrgId } from "@/lib/auth";
import { listPlaylists } from "@/lib/backend";

export default async function PlaylistsPage() {
  await requireOrgId();
  const playlists = await listPlaylists();

  return (
    <>
      <PageHeader
        title="Playlists"
        description="Ordered media sequences assigned to screens."
      />
      <div className="p-8">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
          {playlists.map((playlist) => (
            <article key={playlist.id} className="flex flex-col rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <p className="text-[0.88rem] font-semibold text-card-foreground">{playlist.name}</p>
                <p className="text-[0.75rem] text-muted-foreground">{playlist.items.length} item{playlist.items.length !== 1 ? "s" : ""}</p>
              </div>
              <div>
                {playlist.items.map((item, i) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-4 px-4 py-2.5 text-sm ${i < playlist.items.length - 1 ? "border-b border-border" : ""}`}
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
        </div>
      </div>
    </>
  );
}
