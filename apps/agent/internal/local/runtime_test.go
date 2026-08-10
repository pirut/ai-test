package local

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/jrbussard/showroom-signage/apps/agent/internal/config"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/remote"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/state"
)

func TestKioskRuntimeUsesNativePlayerForCachedVideoPlaylist(t *testing.T) {
	root := t.TempDir()
	stateRoot := filepath.Join(root, "state")
	storageRoot := filepath.Join(root, "cache")
	if err := os.MkdirAll(stateRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(storageRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(storageRoot, "one.mp4"), []byte("video"), 0o644); err != nil {
		t.Fatal(err)
	}

	manifest := remote.DeviceManifest{
		ManifestVersion:   "v1",
		DefaultPlaylistID: "playlist-default",
		Orientation:       90,
		Volume:            42,
		DefaultPlaylist: []remote.ManifestPlaylistItem{{
			ID: "item-1", AssetID: "asset-1", AssetType: "video", URL: "/assets/one.mp4",
		}},
	}
	payload, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(stateRoot, "manifest.json"), payload, 0o644); err != nil {
		t.Fatal(err)
	}

	store, err := state.Open(stateRoot)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Update(func(next *state.DeviceState) { next.Credential = "credential" }); err != nil {
		t.Fatal(err)
	}

	server := NewServer(config.Config{ListenAddr: "127.0.0.1:4173", StateRoot: stateRoot, StorageRoot: storageRoot}, store)
	runtime := server.kioskRuntime()
	if runtime.Mode != "mpv" || len(runtime.Playlist) != 1 {
		t.Fatalf("unexpected runtime: %#v", runtime)
	}
	if runtime.Orientation != 90 || runtime.Volume != 42 {
		t.Fatalf("display settings missing from runtime: %#v", runtime)
	}
	if runtime.PlaylistID != "playlist-default" {
		t.Fatalf("playlist identity missing from runtime: %#v", runtime)
	}
}

func TestChooseActivePlaylistUsesHighestPriorityWindow(t *testing.T) {
	now := time.Now().UTC()
	manifest := &remote.DeviceManifest{
		DefaultPlaylist: []remote.ManifestPlaylistItem{{ID: "default"}},
		ScheduleWindows: []remote.ScheduleWindow{
			{ID: "low", StartsAt: now.Add(-time.Hour).Format(time.RFC3339), EndsAt: now.Add(time.Hour).Format(time.RFC3339), Priority: 1, Playlist: []remote.ManifestPlaylistItem{{ID: "low"}}},
			{ID: "high", PlaylistID: "playlist-high", StartsAt: now.Add(-time.Hour).Format(time.RFC3339), EndsAt: now.Add(time.Hour).Format(time.RFC3339), Priority: 10, Playlist: []remote.ManifestPlaylistItem{{ID: "high"}}},
		},
	}
	got, playlistID := chooseActivePlaylist(manifest)
	if len(got) != 1 || got[0].ID != "high" || playlistID != "playlist-high" {
		t.Fatalf("unexpected playlist: %#v %q", got, playlistID)
	}
}
