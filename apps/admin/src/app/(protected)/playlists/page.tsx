import { requireOrgId } from "@/lib/auth";
import { listPlaylists } from "@/lib/backend";

export default async function PlaylistsPage() {
  await requireOrgId();
  const playlists = await listPlaylists();

  return (
    <div>
      <header className="workspaceHeader">
        <div>
          <p className="eyebrow">Programming</p>
          <h1>Playlists</h1>
          <p>Ordered media tracks with per-item dwell times and screen-safe defaults.</p>
        </div>
      </header>
      <div className="playlistGrid">
        {playlists.map((playlist) => (
          <article className="playlistCard" key={playlist.id}>
            <div className="sectionTitle">
              <span className="eyebrow">Playlist</span>
              <h2>{playlist.name}</h2>
            </div>
            <div className="playlistTrack">
              {playlist.items.map((item) => (
                <div className="playlistTrackItem" key={item.id}>
                  <span>{item.asset.title}</span>
                  <strong>{item.dwellSeconds ?? item.asset.durationSeconds ?? 10}s</strong>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
