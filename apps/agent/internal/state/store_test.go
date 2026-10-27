package state

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSnapshotDoesNotExposeMutableCacheMap(t *testing.T) {
	store, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Update(func(next *DeviceState) {
		next.CachedAssets["asset-1"] = AssetRecord{FileName: "one.mp4", Checksum: "digest"}
	}); err != nil {
		t.Fatal(err)
	}

	snapshot := store.Snapshot()
	delete(snapshot.CachedAssets, "asset-1")

	if _, ok := store.Snapshot().CachedAssets["asset-1"]; !ok {
		t.Fatal("mutating a snapshot changed the store")
	}
}

func TestStorePersistsCredentialExpiry(t *testing.T) {
	root := t.TempDir()
	store, err := Open(root)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Update(func(next *DeviceState) {
		next.CredentialExpiresAt = "2026-08-11T12:00:00Z"
	}); err != nil {
		t.Fatal(err)
	}

	reopened, err := Open(root)
	if err != nil {
		t.Fatal(err)
	}
	if got := reopened.Snapshot().CredentialExpiresAt; got != "2026-08-11T12:00:00Z" {
		t.Fatalf("unexpected credential expiry %q", got)
	}
}

func TestStoreRecoversPairingFromBackupWhenStateIsCorrupt(t *testing.T) {
	root := t.TempDir()
	store, err := Open(root)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Update(func(next *DeviceState) {
		next.DeviceID = "device-1"
		next.Credential = "secret"
	}); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "device-state.json"), []byte(`{"deviceId":`), 0o644); err != nil {
		t.Fatal(err)
	}

	reopened, err := Open(root)
	if err != nil {
		t.Fatalf("corrupt state must not stop the agent: %v", err)
	}
	if got := reopened.Snapshot(); got.DeviceID != "device-1" || got.Credential != "secret" {
		t.Fatalf("pairing was not recovered: %+v", got)
	}
}

func TestStoreStartsFreshWhenStateAndBackupAreUnreadable(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "device-state.json"), nil, 0o644); err != nil {
		t.Fatal(err)
	}

	store, err := Open(root)
	if err != nil {
		t.Fatalf("empty state must not stop the agent: %v", err)
	}
	if store.Snapshot().Credential != "" {
		t.Fatal("expected a fresh, unpaired state")
	}
	matches, _ := filepath.Glob(filepath.Join(root, "device-state.json.corrupt-*"))
	if len(matches) != 1 {
		t.Fatalf("expected the unreadable state to be kept for diagnosis, got %v", matches)
	}
}

func TestPlayerStatusReportsCloudConnectivity(t *testing.T) {
	store, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if store.PlayerStatus().Online {
		t.Fatal("a screen that never reached the cloud is not online")
	}
	_ = store.Update(func(next *DeviceState) {
		next.LastCloudContactAt = time.Now().UTC().Format(time.RFC3339)
	})
	if !store.PlayerStatus().Online {
		t.Fatal("recent cloud contact should report online")
	}
	_ = store.Update(func(next *DeviceState) {
		next.LastCloudContactAt = time.Now().Add(-CloudContactFreshness - time.Minute).UTC().Format(time.RFC3339)
	})
	if store.PlayerStatus().Online {
		t.Fatal("stale cloud contact should report offline")
	}
}
