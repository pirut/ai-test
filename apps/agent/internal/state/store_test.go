package state

import (
	"os"
	"path/filepath"
	"testing"
)

func TestStoreWritesRestrictedPermissionsAndDefensiveSnapshots(t *testing.T) {
	root := t.TempDir()

	store, err := Open(root)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}

	if err := store.Update(func(next *DeviceState) {
		next.Credential = "secret"
		next.CachedAssets["asset-1"] = AssetRecord{FileName: "asset-1.jpg", Checksum: "abc"}
	}); err != nil {
		t.Fatalf("update store: %v", err)
	}

	info, err := os.Stat(filepath.Join(root, "device-state.json"))
	if err != nil {
		t.Fatalf("stat state file: %v", err)
	}
	if got := info.Mode().Perm(); got != 0o600 {
		t.Fatalf("expected 0600 permissions, got %o", got)
	}

	snapshot := store.Snapshot()
	snapshot.CachedAssets["asset-1"] = AssetRecord{FileName: "changed.jpg", Checksum: "changed"}

	current := store.Snapshot()
	if current.CachedAssets["asset-1"].FileName != "asset-1.jpg" {
		t.Fatalf("snapshot mutation leaked into store state")
	}
}
