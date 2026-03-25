package local

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/jrbussard/showroom-signage/apps/agent/internal/config"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/remote"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/state"
)

func TestChooseCurrentAssetRotatesAcrossPlaylist(t *testing.T) {
	anchor := time.Date(2026, 3, 23, 12, 0, 0, 0, time.UTC)
	playlist := []remote.ManifestPlaylistItem{
		{AssetID: "video-1", AssetType: "video", DurationSeconds: 10},
		{AssetID: "image-1", AssetType: "image", DurationSeconds: 5},
	}

	item, err := chooseCurrentAsset(playlist, anchor, anchor.Add(9*time.Second))
	if err != nil {
		t.Fatalf("chooseCurrentAsset returned error: %v", err)
	}
	if item.AssetID != "video-1" {
		t.Fatalf("expected first asset before rollover, got %q", item.AssetID)
	}

	item, err = chooseCurrentAsset(playlist, anchor, anchor.Add(12*time.Second))
	if err != nil {
		t.Fatalf("chooseCurrentAsset returned error: %v", err)
	}
	if item.AssetID != "image-1" {
		t.Fatalf("expected second asset after rollover, got %q", item.AssetID)
	}

	item, err = chooseCurrentAsset(playlist, anchor, anchor.Add(18*time.Second))
	if err != nil {
		t.Fatalf("chooseCurrentAsset returned error: %v", err)
	}
	if item.AssetID != "video-1" {
		t.Fatalf("expected playlist to wrap, got %q", item.AssetID)
	}
}

func TestKioskRuntimeUsesCachedImageAsset(t *testing.T) {
	root := t.TempDir()
	stateRoot := filepath.Join(root, "state")
	storageRoot := filepath.Join(root, "cache")
	if err := os.MkdirAll(stateRoot, 0o755); err != nil {
		t.Fatalf("mkdir state root: %v", err)
	}
	if err := os.MkdirAll(storageRoot, 0o755); err != nil {
		t.Fatalf("mkdir storage root: %v", err)
	}

	store, err := state.Open(stateRoot)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	if err := store.Update(func(current *state.DeviceState) {
		current.Credential = "credential"
		current.DeviceID = "device-1"
	}); err != nil {
		t.Fatalf("update store: %v", err)
	}

	manifest := `{
	  "manifest": {
	    "manifestVersion": "manifest-1",
	    "deviceId": "device-1",
	    "generatedAt": "2026-03-23T12:00:00Z",
	    "volume": 65,
	    "defaultPlaylist": [
	      {
	        "id": "item-1",
	        "assetId": "image-1",
	        "assetType": "image",
	        "title": "Lobby Poster",
	        "url": "/assets/poster.jpg",
	        "checksum": "abc123",
	        "durationSeconds": 7
	      }
	    ],
	    "scheduleWindows": [],
	    "assetBaseUrl": "",
	    "assetChecksums": {}
	  }
	}`
	if err := os.WriteFile(filepath.Join(stateRoot, "manifest.json"), []byte(manifest), 0o644); err != nil {
		t.Fatalf("write manifest: %v", err)
	}
	if err := os.WriteFile(filepath.Join(storageRoot, "poster.jpg"), []byte("image"), 0o644); err != nil {
		t.Fatalf("write asset: %v", err)
	}

	server := NewServer(config.Config{
		ListenAddr:  "127.0.0.1:4173",
		StateRoot:   stateRoot,
		StorageRoot: storageRoot,
	}, store)

	runtime := server.kioskRuntimeAt(time.Date(2026, 3, 23, 12, 0, 3, 0, time.UTC))
	if runtime.Mode != "mpv" {
		t.Fatalf("expected mpv mode, got %q", runtime.Mode)
	}
	if runtime.Reason != "cached-local-asset" {
		t.Fatalf("expected cached-local-asset reason, got %q", runtime.Reason)
	}
	if runtime.Asset == nil {
		t.Fatal("expected asset payload")
	}
	if runtime.Asset.AssetID != "image-1" {
		t.Fatalf("expected image asset, got %q", runtime.Asset.AssetID)
	}
	if runtime.Asset.AssetType != "image" {
		t.Fatalf("expected image asset type, got %q", runtime.Asset.AssetType)
	}
	if runtime.Asset.DurationSeconds != 7 {
		t.Fatalf("expected image duration 7, got %d", runtime.Asset.DurationSeconds)
	}
}

func TestKioskRuntimeFallsBackForMissingCachedAsset(t *testing.T) {
	root := t.TempDir()
	stateRoot := filepath.Join(root, "state")
	storageRoot := filepath.Join(root, "cache")
	if err := os.MkdirAll(stateRoot, 0o755); err != nil {
		t.Fatalf("mkdir state root: %v", err)
	}
	if err := os.MkdirAll(storageRoot, 0o755); err != nil {
		t.Fatalf("mkdir storage root: %v", err)
	}

	store, err := state.Open(stateRoot)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	if err := store.Update(func(current *state.DeviceState) {
		current.Credential = "credential"
	}); err != nil {
		t.Fatalf("update store: %v", err)
	}

	manifest := `{
	  "manifest": {
	    "manifestVersion": "manifest-1",
	    "deviceId": "device-1",
	    "generatedAt": "2026-03-23T12:00:00Z",
	    "volume": 100,
	    "defaultPlaylist": [
	      {
	        "id": "item-1",
	        "assetId": "video-1",
	        "assetType": "video",
	        "title": "Loop",
	        "url": "/assets/missing.mp4",
	        "checksum": "abc123",
	        "durationSeconds": 30
	      }
	    ],
	    "scheduleWindows": [],
	    "assetBaseUrl": "",
	    "assetChecksums": {}
	  }
	}`
	if err := os.WriteFile(filepath.Join(stateRoot, "manifest.json"), []byte(manifest), 0o644); err != nil {
		t.Fatalf("write manifest: %v", err)
	}

	server := NewServer(config.Config{
		ListenAddr:  "127.0.0.1:4173",
		StateRoot:   stateRoot,
		StorageRoot: storageRoot,
	}, store)

	runtime := server.kioskRuntimeAt(time.Date(2026, 3, 23, 12, 0, 1, 0, time.UTC))
	if runtime.Mode != "browser" {
		t.Fatalf("expected browser fallback, got %q", runtime.Mode)
	}
	if runtime.Reason != "missing-cached-asset" {
		t.Fatalf("expected missing-cached-asset reason, got %q", runtime.Reason)
	}
	if runtime.Asset != nil {
		t.Fatal("did not expect asset payload when cache is missing")
	}
}
