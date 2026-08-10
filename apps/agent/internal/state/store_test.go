package state

import "testing"

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
