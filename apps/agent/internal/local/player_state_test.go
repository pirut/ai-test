package local

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/jrbussard/showroom-signage/apps/agent/internal/config"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/remote"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/state"
)

func TestPlayerStateIncludesCachedImagesAndVideos(t *testing.T) {
	root := t.TempDir()
	stateRoot := filepath.Join(root, "state")
	storageRoot := filepath.Join(root, "cache")
	for _, dir := range []string{stateRoot, storageRoot} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	for _, name := range []string{"one.mp4", "two.jpg"} {
		if err := os.WriteFile(filepath.Join(storageRoot, name), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	manifest := remote.DeviceManifest{
		ManifestVersion:   "v2",
		DefaultPlaylistID: "playlist-default",
		Orientation:       180,
		Volume:            30,
		DefaultPlaylist: []remote.ManifestPlaylistItem{
			{ID: "item-1", AssetID: "asset-1", AssetType: "video", URL: "/assets/one.mp4"},
			{ID: "item-2", AssetID: "asset-2", AssetType: "image", URL: "/assets/two.jpg", DurationSeconds: 8},
			{ID: "item-3", AssetID: "asset-3", AssetType: "video", URL: "https://example.com/three.mp4"},
			{ID: "item-4", AssetID: "asset-4", AssetType: "video", URL: "/assets/missing.mp4"},
		},
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
	if err := store.Update(func(next *state.DeviceState) {
		next.Credential = "credential"
		next.CurrentPlaylistID = "playlist-default"
		next.CurrentAssetID = "asset-2"
	}); err != nil {
		t.Fatal(err)
	}

	server := NewServer(config.Config{StateRoot: stateRoot, StorageRoot: storageRoot}, store)
	result := server.playerState(func() wifiStatus {
		t.Fatal("wifi status must not be read once a manifest exists")
		return wifiStatus{}
	})
	if !result.Claimed || !result.HasManifest || result.PlaylistID != "playlist-default" {
		t.Fatalf("unexpected state: %#v", result)
	}
	if len(result.Items) != 2 || result.PendingItems != 2 {
		t.Fatalf("expected two cached items and two pending, got %#v", result)
	}
	if result.Items[1].AssetType != "image" || result.Items[1].DurationSeconds != 8 {
		t.Fatalf("image item missing: %#v", result.Items[1])
	}
	if result.Items[0].LocalPath != filepath.Join(storageRoot, "one.mp4") {
		t.Fatalf("unexpected local path %q", result.Items[0].LocalPath)
	}
	if result.StartItemID != "item-2" || result.Volume != 30 || result.Orientation != 180 {
		t.Fatalf("resume or display settings missing: %#v", result)
	}
}

func TestPlayerStateReadsWiFiOnlyBeforeClaimCode(t *testing.T) {
	stateRoot := t.TempDir()
	store, err := state.Open(stateRoot)
	if err != nil {
		t.Fatal(err)
	}
	server := NewServer(config.Config{StateRoot: stateRoot, StorageRoot: t.TempDir()}, store)

	calls := 0
	result := server.playerState(func() wifiStatus {
		calls++
		return wifiStatus{Supported: true}
	})
	if calls != 1 || result.WiFi == nil || result.HasManifest {
		t.Fatalf("expected wifi status before claim code: %#v", result)
	}

	if err := store.Update(func(next *state.DeviceState) { next.ClaimCode = "ABC123" }); err != nil {
		t.Fatal(err)
	}
	result = server.playerState(func() wifiStatus {
		calls++
		return wifiStatus{}
	})
	if calls != 1 || result.WiFi != nil || result.ClaimCode != "ABC123" {
		t.Fatalf("wifi status should be skipped once a claim code exists: %#v", result)
	}
}
