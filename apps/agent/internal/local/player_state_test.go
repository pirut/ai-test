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

func TestPlayerStateSendsWiFiWhileUnpairedOnly(t *testing.T) {
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

	if err := store.Update(func(next *state.DeviceState) {
		next.ClaimCode = "ABC123"
		next.LastCloudContactAt = time.Now().UTC().Format(time.RFC3339)
	}); err != nil {
		t.Fatal(err)
	}
	result = server.playerState(func() wifiStatus {
		calls++
		return wifiStatus{}
	})
	if calls != 2 || result.WiFi == nil || result.ClaimCode != "ABC123" || !result.Online {
		t.Fatalf("an unpaired screen with a code still needs its network line: %#v", result)
	}

	if err := store.Update(func(next *state.DeviceState) {
		next.ClaimCode = ""
		next.Credential = "credential"
		next.PendingItems = 3
	}); err != nil {
		t.Fatal(err)
	}
	result = server.playerState(func() wifiStatus {
		calls++
		return wifiStatus{}
	})
	if calls != 2 || result.WiFi != nil {
		t.Fatalf("a paired screen must not run nmcli for every poll: %#v", result)
	}
	// Paired, nothing cached yet: the player can say content is downloading.
	if result.HasManifest || result.PendingItems != 3 || !result.Online {
		t.Fatalf("first download is not visible to the player: %#v", result)
	}
	if got := server.store.PlayerStatus().PendingItems; got != 3 {
		t.Fatalf("/local/status pendingItems = %d, want 3", got)
	}
}

func TestCabledScreenCountsAsConnected(t *testing.T) {
	wired := wifiStatusFromDevices(deviceSummary{wired: true, wifi: &networkDevice{name: "wlan0", kind: "wifi"}})
	if !wired.Connected || !wired.Wired || wired.SSID != "" || wired.Interface != "wlan0" {
		t.Fatalf("cabled screen = %+v", wired)
	}
	noRadio := wifiStatusFromDevices(deviceSummary{wired: true})
	if !noRadio.Connected || noRadio.Error != "" {
		t.Fatalf("cabled screen without a radio = %+v", noRadio)
	}
	hotspot := wifiStatusFromDevices(deviceSummary{wifi: &networkDevice{name: "wlan0", connected: true, connection: setupConnectionName}})
	if hotspot.Connected {
		t.Fatalf("hosting the setup hotspot is not being online: %+v", hotspot)
	}
	joined := wifiStatusFromDevices(deviceSummary{wifi: &networkDevice{name: "wlan0", connected: true, connection: "Shop"}})
	if !joined.Connected || joined.SSID != "Shop" || joined.Wired {
		t.Fatalf("joined screen = %+v", joined)
	}
	if offline := wifiStatusFromDevices(deviceSummary{}); offline.Connected || offline.Error == "" {
		t.Fatalf("no network at all = %+v", offline)
	}
}

// A screen that got its pairing code on one network and was then moved has a
// code nobody can use. It must fall back to Wi-Fi setup, not show the code.
func TestStalePairingCodeGivesWayToWiFiSetup(t *testing.T) {
	stateRoot := t.TempDir()
	store, err := state.Open(stateRoot)
	if err != nil {
		t.Fatal(err)
	}
	server := NewServer(config.Config{APIBaseURL: "https://screen.example.com", StateRoot: stateRoot, StorageRoot: t.TempDir()}, store)
	if err := store.Update(func(next *state.DeviceState) {
		next.ClaimCode = "ABC123"
		next.LastCloudContactAt = time.Now().Add(-10 * time.Minute).UTC().Format(time.RFC3339)
	}); err != nil {
		t.Fatal(err)
	}

	result := server.playerState(func() wifiStatus { return wifiStatus{Supported: true} })
	if result.ClaimCode != "" || result.ClaimURL != "" || len(result.ClaimQR) != 0 || result.WiFi == nil {
		t.Fatalf("a dead pairing code is still on screen: %#v", result)
	}
	if !server.needsWiFiSetup() {
		t.Fatal("the setup hotspot would stay closed behind a dead pairing code")
	}

	// The service answers again: the same code is back.
	if err := store.Update(func(next *state.DeviceState) {
		next.LastCloudContactAt = time.Now().UTC().Format(time.RFC3339)
	}); err != nil {
		t.Fatal(err)
	}
	result = server.playerState(func() wifiStatus { return wifiStatus{Supported: true} })
	if result.ClaimCode != "ABC123" || len(result.ClaimQR) == 0 || server.needsWiFiSetup() {
		t.Fatalf("the pairing code did not come back online: %#v", result)
	}

	// A paired screen is never sent back to setup for being offline.
	if err := store.Update(func(next *state.DeviceState) {
		next.Credential = "credential"
		next.ClaimCode = ""
		next.LastCloudContactAt = ""
	}); err != nil {
		t.Fatal(err)
	}
	if server.needsWiFiSetup() {
		t.Fatal("a paired screen asked for Wi-Fi setup")
	}
}
