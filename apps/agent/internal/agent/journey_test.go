package agent

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jrbussard/showroom-signage/apps/agent/internal/config"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/remote"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/state"
)

// manifestServer serves one manifest, 404s the asset path "/media/missing"
// and records the last heartbeat.
type manifestServer struct {
	mu        sync.Mutex
	manifest  map[string]interface{}
	heartbeat map[string]interface{}
}

func (m *manifestServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	m.mu.Lock()
	defer m.mu.Unlock()
	switch {
	case r.URL.Path == "/api/device/manifest":
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"manifest": m.manifest})
	case r.URL.Path == "/api/device/heartbeat":
		m.heartbeat = map[string]interface{}{}
		_ = json.NewDecoder(r.Body).Decode(&m.heartbeat)
		_, _ = w.Write([]byte(`{}`))
	case strings.HasPrefix(r.URL.Path, "/media/ok"):
		_, _ = w.Write([]byte("image-bytes"))
	default:
		http.NotFound(w, r)
	}
}

func (m *manifestServer) lastSyncError() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	sync, _ := m.heartbeat["sync"].(map[string]interface{})
	message, _ := sync["lastError"].(string)
	return message
}

func pairForTest(t *testing.T, service *Service) {
	t.Helper()
	if err := service.store.Update(func(next *state.DeviceState) {
		next.DeviceID = "device-1"
		next.Credential = "credential"
		next.CredentialExpiresAt = time.Now().Add(12 * time.Hour).UTC().Format(time.RFC3339)
	}); err != nil {
		t.Fatal(err)
	}
}

func readLocalManifest(t *testing.T, stateRoot string) remote.DeviceManifest {
	t.Helper()
	payload, err := os.ReadFile(filepath.Join(stateRoot, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	var manifest remote.DeviceManifest
	if err := json.Unmarshal(payload, &manifest); err != nil {
		t.Fatal(err)
	}
	return manifest
}

// Removing every playlist from a screen must clear the screen. It used to be
// treated as a failed sync, so the removed content played on forever.
func TestEmptyManifestClearsTheScreen(t *testing.T) {
	backend := &manifestServer{}
	service, stateRoot := newLinkTestService(t, backend)
	pairForTest(t, service)
	backend.manifest = map[string]interface{}{
		"manifestVersion": "v1",
		"deviceId":        "device-1",
		"defaultPlaylist": []map[string]interface{}{
			{"id": "item-1", "assetId": "asset1", "assetType": "image", "url": "http://" + serverHost(t, service) + "/media/ok.jpg"},
		},
	}
	if err := service.syncOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := len(readLocalManifest(t, stateRoot).DefaultPlaylist); got != 1 {
		t.Fatalf("first sync cached %d items, want 1", got)
	}

	backend.mu.Lock()
	backend.manifest = map[string]interface{}{"manifestVersion": "v2", "deviceId": "device-1", "defaultPlaylist": []interface{}{}}
	backend.mu.Unlock()
	if err := service.syncOnce(context.Background()); err != nil {
		t.Fatalf("an empty manifest is not an error: %v", err)
	}
	local := readLocalManifest(t, stateRoot)
	if local.ManifestVersion != "v2" || len(local.DefaultPlaylist) != 0 {
		t.Fatalf("removed content is still scheduled: %+v", local)
	}
	current := service.store.Snapshot()
	if current.ManifestVersion != "v2" || current.LastError != "" || current.SyncError != "" {
		t.Fatalf("state after clearing: version=%q lastError=%q syncError=%q", current.ManifestVersion, current.LastError, current.SyncError)
	}
}

// serverHost is the test control plane's host:port, which also serves media.
func serverHost(t *testing.T, service *Service) string {
	t.Helper()
	return strings.TrimPrefix(service.config.APIBaseURL, "http://")
}

// An item that will not download must reach the dashboard even though the
// screen keeps playing the rest, and must stay reported while it backs off.
func TestItemThatWillNotDownloadIsReportedToTheDashboard(t *testing.T) {
	backend := &manifestServer{}
	service, stateRoot := newLinkTestService(t, backend)
	service.heartbeatTrigger = make(chan struct{}, 1)
	pairForTest(t, service)
	host := serverHost(t, service)
	backend.manifest = map[string]interface{}{
		"manifestVersion": "v1",
		"deviceId":        "device-1",
		"defaultPlaylist": []map[string]interface{}{
			{"id": "item-1", "assetId": "asset1", "assetType": "image", "url": "http://" + host + "/media/ok.jpg"},
			{"id": "item-2", "assetId": "asset2", "assetType": "image", "url": "http://" + host + "/media/missing.jpg?token=secret"},
		},
	}

	for pass := 1; pass <= 2; pass++ {
		if err := service.syncOnce(context.Background()); err != nil {
			t.Fatalf("pass %d: %v", pass, err)
		}
		current := service.store.Snapshot()
		if !strings.HasPrefix(current.SyncError, "1 of 2 items are not on the screen yet") {
			t.Fatalf("pass %d: sync error = %q", pass, current.SyncError)
		}
		if current.LastError != "" {
			t.Fatalf("pass %d: a background failure reached the screen: %q", pass, current.LastError)
		}
	}
	if got := len(readLocalManifest(t, stateRoot).DefaultPlaylist); got != 1 {
		t.Fatalf("playable items = %d, want 1", got)
	}

	if err := service.sendHeartbeat(context.Background(), service.store.Snapshot(), true); err != nil {
		t.Fatal(err)
	}
	reported := backend.lastSyncError()
	if !strings.HasPrefix(reported, "1 of 2 items") || strings.Contains(reported, "secret") {
		t.Fatalf("dashboard was told %q", reported)
	}

	// The item is fixed: the report clears.
	service.hydrationFailures = map[string]hydrationFailure{}
	backend.mu.Lock()
	backend.manifest["defaultPlaylist"] = []map[string]interface{}{
		{"id": "item-1", "assetId": "asset1", "assetType": "image", "url": "http://" + host + "/media/ok.jpg"},
		{"id": "item-2", "assetId": "asset2", "assetType": "image", "url": "http://" + host + "/media/ok2.jpg"},
	}
	backend.mu.Unlock()
	if err := service.syncOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := service.store.Snapshot().SyncError; got != "" {
		t.Fatalf("sync error did not clear: %q", got)
	}
}

// When nothing new can be fetched the screen keeps its old content and shows
// no error, but the dashboard must still hear about it.
func TestFailedSyncBehindWorkingContentIsReported(t *testing.T) {
	backend := &manifestServer{}
	service, stateRoot := newLinkTestService(t, backend)
	pairForTest(t, service)
	if err := os.WriteFile(filepath.Join(stateRoot, "manifest.json"), []byte(`{"manifestVersion":"v0"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	backend.manifest = map[string]interface{}{
		"manifestVersion": "v1",
		"deviceId":        "device-1",
		"defaultPlaylist": []map[string]interface{}{
			{"id": "item-1", "assetId": "asset1", "assetType": "image", "url": "http://" + serverHost(t, service) + "/media/missing.jpg"},
		},
	}
	if err := service.syncOnce(context.Background()); err == nil {
		t.Fatal("expected the sync to fail")
	}
	current := service.store.Snapshot()
	if current.LastError != "" {
		t.Fatalf("screen shows %q over working content", current.LastError)
	}
	if !strings.HasPrefix(current.SyncError, "1 of 1 items are not on the screen yet") {
		t.Fatalf("sync error = %q", current.SyncError)
	}
}

func TestFreeCacheSpaceKeepsPlayingAndIncomingMedia(t *testing.T) {
	stateRoot := t.TempDir()
	storageRoot := t.TempDir()
	store, err := state.Open(stateRoot)
	if err != nil {
		t.Fatal(err)
	}
	_ = store.Update(func(next *state.DeviceState) {
		next.CachedAssets["playing"] = state.AssetRecord{FileName: "playing.mp4"}
		next.PreviousCachedAssets["old"] = state.AssetRecord{FileName: "old.mp4"}
	})
	files := []string{"playing.mp4", "old.mp4", "gone.mp4.part", "gone.f137.mp4", "incoming.mp4.part", "admitted.jpg"}
	for _, name := range files {
		if err := os.WriteFile(filepath.Join(storageRoot, name), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.MkdirAll(filepath.Join(storageRoot, ".tool-cache"), 0o755); err != nil {
		t.Fatal(err)
	}
	service := &Service{config: config.Config{StateRoot: stateRoot, StorageRoot: storageRoot}, store: store}
	manifest := &remote.DeviceManifest{DefaultPlaylist: []remote.ManifestPlaylistItem{{AssetID: "incoming"}}}
	service.freeCacheSpace(manifest, map[string]state.AssetRecord{"admitted": {FileName: "admitted.jpg"}})

	for name, want := range map[string]bool{
		"playing.mp4": true, "incoming.mp4.part": true, "admitted.jpg": true, ".tool-cache": true,
		"old.mp4": false, "gone.mp4.part": false, "gone.f137.mp4": false,
	} {
		if got := fileExists(filepath.Join(storageRoot, name)); got != want {
			t.Errorf("%s kept = %v, want %v", name, got, want)
		}
	}
}

// A Pi has no battery clock. If it boots with the clock behind the last
// heartbeat, heartbeats must still go out.
func TestHeartbeatIsSentWhenTheClockWentBackwards(t *testing.T) {
	backend := &manifestServer{}
	service, _ := newLinkTestService(t, backend)
	pairForTest(t, service)
	_ = service.store.Update(func(next *state.DeviceState) {
		next.LastHeartbeatAt = time.Now().Add(48 * time.Hour).UTC().Format(time.RFC3339)
		next.Health.CapturedAt = time.Now().UTC().Format(time.RFC3339)
	})
	if err := service.sendHeartbeat(context.Background(), service.store.Snapshot(), false); err != nil {
		t.Fatal(err)
	}
	backend.mu.Lock()
	defer backend.mu.Unlock()
	if backend.heartbeat == nil {
		t.Fatal("heartbeat was skipped because the last one is dated in the future")
	}
}

func TestErrorsAreWordedForPeople(t *testing.T) {
	offline := userFacingError(&url.Error{Op: "Post", URL: "https://screen.example.com/api/device/register-temporary", Err: errors.New("dial tcp: lookup screen.example.com: no such host")})
	if !strings.HasPrefix(offline, "No internet connection") {
		t.Fatalf("offline error = %q", offline)
	}
	down := userFacingError(&remote.HTTPError{Method: "GET", Path: "/api/device/manifest", StatusCode: http.StatusBadGateway})
	if !strings.Contains(down, "not answering") {
		t.Fatalf("server error = %q", down)
	}
	signed := userFacingError(errors.New("download failed for https://cdn.example.com/a.mp4?token=secret: 404 Not Found"))
	if strings.Contains(signed, "secret") || !strings.Contains(signed, "https://cdn.example.com/a.mp4") {
		t.Fatalf("signed url leaked or was lost: %q", signed)
	}
}

// The first download must be visible to the players before anything is
// playable, or a new screen looks like it has no content assigned.
func TestFirstDownloadIsCountedAsPending(t *testing.T) {
	backend := &manifestServer{}
	service, _ := newLinkTestService(t, backend)
	pairForTest(t, service)
	host := serverHost(t, service)
	backend.manifest = map[string]interface{}{
		"manifestVersion": "v1",
		"deviceId":        "device-1",
		"defaultPlaylist": []map[string]interface{}{
			{"id": "item-1", "assetId": "asset1", "assetType": "image", "url": "http://" + host + "/media/missing-1.jpg"},
			{"id": "item-2", "assetId": "asset2", "assetType": "image", "url": "http://" + host + "/media/missing-2.jpg"},
		},
	}
	if err := service.syncOnce(context.Background()); err == nil {
		t.Fatal("expected the sync to fail")
	}
	if got := service.store.PlayerStatus().PendingItems; got != 2 {
		t.Fatalf("pending items = %d, want 2", got)
	}

	service.hydrationFailures = map[string]hydrationFailure{}
	backend.mu.Lock()
	backend.manifest["defaultPlaylist"] = []map[string]interface{}{
		{"id": "item-1", "assetId": "asset1", "assetType": "image", "url": "http://" + host + "/media/ok-1.jpg"},
		{"id": "item-2", "assetId": "asset2", "assetType": "image", "url": "http://" + host + "/media/ok-2.jpg"},
	}
	backend.mu.Unlock()
	if err := service.syncOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := service.store.PlayerStatus().PendingItems; got != 0 {
		t.Fatalf("pending items after download = %d, want 0", got)
	}
}

func TestPairingPollClearsAnOldConnectionError(t *testing.T) {
	service, _ := newLinkTestService(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"claimed": false, "pollAgainSeconds": 15})
	}))
	_ = service.store.Update(func(next *state.DeviceState) {
		next.DeviceSessionID = "session-1"
		next.ClaimCode = "ABC123"
		next.ClaimToken = "token-1"
		next.LastError = "No internet connection. Check the network; the screen will keep trying."
	})
	if err := service.syncOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := service.store.Snapshot().LastError; got != "" {
		t.Fatalf("the pairing screen still shows %q", got)
	}
}
