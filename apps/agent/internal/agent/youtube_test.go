package agent

import (
	"context"
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/jrbussard/showroom-signage/apps/agent/internal/config"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/remote"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/state"
)

func TestResolveYouTubeDLBinaryDownloadsAndReusesVerifiedRelease(t *testing.T) {
	t.Parallel()

	payload := []byte("#!/bin/sh\nexit 0\n")
	checksum := fmt.Sprintf("%x", sha256.Sum256(payload))
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests.Add(1)
		_, _ = writer.Write(payload)
	}))
	t.Cleanup(server.Close)

	root := t.TempDir()
	service := &Service{
		config: config.Config{
			StateRoot:               filepath.Join(root, "state"),
			YouTubeDLManagedURL:     server.URL + "/yt-dlp",
			YouTubeDLManagedSHA256:  checksum,
			YouTubeDLManagedVersion: "test-release",
		},
		client: remote.New(server.URL),
	}

	firstPath, err := service.resolveYouTubeDLBinary(context.Background())
	if err != nil {
		t.Fatalf("first resolve: %v", err)
	}
	secondPath, err := service.resolveYouTubeDLBinary(context.Background())
	if err != nil {
		t.Fatalf("second resolve: %v", err)
	}
	if firstPath != secondPath {
		t.Fatalf("managed binary path changed: %q != %q", firstPath, secondPath)
	}
	if requests.Load() != 1 {
		t.Fatalf("download requests = %d, want 1", requests.Load())
	}
	info, err := os.Stat(firstPath)
	if err != nil {
		t.Fatalf("stat managed binary: %v", err)
	}
	if info.Mode().Perm() != 0o755 {
		t.Fatalf("managed binary permissions = %o, want 755", info.Mode().Perm())
	}
}

func TestUserFacingErrorHidesDownloaderDiagnostics(t *testing.T) {
	t.Parallel()

	message := userFacingError(fmt.Errorf("yt-dlp download failed: %s", strings.Repeat("traceback ", 80)))
	if message != "YouTube content could not be prepared. The player will retry automatically." {
		t.Fatalf("unexpected user-facing error: %q", message)
	}
}

func TestUserFacingErrorBoundsUnexpectedErrors(t *testing.T) {
	t.Parallel()

	message := userFacingError(fmt.Errorf("%s", strings.Repeat("x", 400)))
	if len(message) > 242 {
		t.Fatalf("error length = %d, want a bounded message", len(message))
	}
	if !strings.HasSuffix(message, "…") {
		t.Fatalf("expected truncated error, got %q", message)
	}
}

func TestKioskRuntimeCompatibilityIsNoopOffAppliance(t *testing.T) {
	t.Parallel()

	applied, err := ensureKioskRuntimeCompatibility()
	if err != nil {
		t.Fatalf("compatibility check: %v", err)
	}
	if applied {
		t.Fatal("compatibility repair unexpectedly applied off appliance")
	}
}

func TestKioskPlaylistCompatibilityAppendsWithoutRestarting(t *testing.T) {
	t.Parallel()

	legacy := `MPV_ASSET_MAP=/tmp/showroom-mpv-assets.json
token_payload = {
    "manifestVersion": payload.get("manifestVersion", ""),
    "playlist": playlist_paths,
}
launch_browser() {
}
launch_mpv() {
  APP_MODE="mpv"
}
  if [[ "${DESIRED_MODE}" != "${APP_MODE}" ]]; then
  fi
`
	patched := applyKioskPlaylistCompatibility(legacy)
	for _, expected := range []string{
		"MPV_LOADED_PLAYLIST=/tmp/showroom-mpv-loaded.m3u",
		`"playlistId": payload.get("playlistId", "")`,
		"sync_mpv_playlist()",
		`MPV_PLAYLIST_PATH="${playlist_path}"`,
		`if [[ "${sync_status}" == "2" ]]; then`,
	} {
		if !strings.Contains(patched, expected) {
			t.Fatalf("patched kiosk script is missing %q", expected)
		}
	}
	if strings.Contains(patched, `"playlist": playlist_paths`) {
		t.Fatal("playlist contents still force a player restart")
	}
	if strings.Contains(patched, `"manifestVersion": payload.get("manifestVersion", ""),`) {
		t.Fatal("metadata-only manifest versions still force the active video to restart")
	}
	if strings.Contains(patched, "if ! sync_mpv_playlist; then") {
		t.Fatal("a transient MPV IPC error still forces the active video to restart")
	}
}

func TestKioskPlaybackCompatibilityReportsActualProgress(t *testing.T) {
	t.Parallel()

	legacy := `asset_id = sys.argv[1] or None
try:
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
        client.settimeout(1)
        client.connect(sys.argv[3])
        client.sendall(b'{"command":["get_property","path"]}\n')
        response = json.loads(client.recv(65536).decode("utf-8").splitlines()[0])
    with open(sys.argv[4], "r", encoding="utf-8") as handle:
        asset_id = json.load(handle).get(response.get("data"), asset_id)
except (OSError, ValueError, KeyError):
    pass

payload = json.dumps({
    "assetId": asset_id,
    "playlistId": sys.argv[2] or None,
    "state": "playing",
}).encode("utf-8")
`

	patched := applyKioskPlaylistCompatibility(legacy)
	for _, expected := range []string{
		`"time-pos"`,
		`"positionSeconds": position_seconds`,
		"raise SystemExit(0)",
	} {
		if !strings.Contains(patched, expected) {
			t.Fatalf("patched kiosk progress reporter is missing %q", expected)
		}
	}
}

func TestCloneAssetRecordsDoesNotShareMutableMap(t *testing.T) {
	t.Parallel()

	original := map[string]state.AssetRecord{
		"asset-1": {FileName: "asset-1.mp4", Checksum: "youtube:test"},
	}
	cloned := cloneAssetRecords(original)
	original["asset-2"] = state.AssetRecord{FileName: "asset-2.mp4", Checksum: "youtube:test-2"}
	if _, exists := cloned["asset-2"]; exists {
		t.Fatal("cloned asset records changed with the source map")
	}
}

func TestCachedManifestReusesKnownDurationWithoutFFprobe(t *testing.T) {
	root := t.TempDir()
	stateRoot := filepath.Join(root, "state")
	storageRoot := filepath.Join(root, "cache")
	if err := os.MkdirAll(storageRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(storageRoot, "asset-1.mp4"), []byte("cached-video"), 0o644); err != nil {
		t.Fatal(err)
	}
	store, err := state.Open(stateRoot)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Update(func(next *state.DeviceState) {
		next.CachedAssets["asset-1"] = state.AssetRecord{FileName: "asset-1.mp4", Checksum: "youtube:test"}
	}); err != nil {
		t.Fatal(err)
	}

	t.Setenv("PATH", t.TempDir())
	service := &Service{config: config.Config{StateRoot: stateRoot, StorageRoot: storageRoot}, store: store}
	manifest := &remote.DeviceManifest{
		ManifestVersion: "manifest-1",
		DefaultPlaylist: []remote.ManifestPlaylistItem{{
			AssetID: "asset-1", AssetType: "video", URL: "https://example.test/video", DurationSeconds: 153,
		}},
		AssetChecksums: map[string]string{"asset-1": "youtube:test"},
	}

	_, localManifest, err := service.cacheManifest(context.Background(), manifest)
	if err != nil {
		t.Fatalf("cache unchanged manifest: %v", err)
	}
	if got := localManifest.DefaultPlaylist[0].DurationSeconds; got != 153 {
		t.Fatalf("cached duration = %d, want 153", got)
	}
}

func TestManifestHydrationErrorIsHiddenAfterFirstPlayableManifest(t *testing.T) {
	t.Parallel()

	manifestPath := filepath.Join(t.TempDir(), "manifest.json")
	if !shouldExposeManifestSyncError(manifestPath) {
		t.Fatal("initial sync failure should remain visible before any playable content exists")
	}
	if err := os.WriteFile(manifestPath, []byte("{}"), 0o644); err != nil {
		t.Fatalf("write manifest: %v", err)
	}
	if shouldExposeManifestSyncError(manifestPath) {
		t.Fatal("background hydration failure should not replace a healthy playback state")
	}
}

func TestManifestHydrationBuildsAPlayablePairBeforeLargerBatches(t *testing.T) {
	t.Parallel()

	if got := manifestHydrationDownloadLimit(0); got != 2 {
		t.Fatalf("empty cache download limit = %d, want 2", got)
	}
	if got := manifestHydrationDownloadLimit(1); got != 1 {
		t.Fatalf("single asset download limit = %d, want 1", got)
	}
	if got := manifestHydrationDownloadLimit(2); got != hydrationBatchSize {
		t.Fatalf("playable cache download limit = %d, want %d", got, hydrationBatchSize)
	}
}

func TestManifestPlaylistSizeIncludesScheduledAssets(t *testing.T) {
	t.Parallel()

	manifest := &remote.DeviceManifest{
		DefaultPlaylist: []remote.ManifestPlaylistItem{{AssetID: "default"}},
		ScheduleWindows: []remote.ScheduleWindow{{
			Playlist: []remote.ManifestPlaylistItem{{AssetID: "scheduled-1"}, {AssetID: "scheduled-2"}},
		}},
	}
	if got := manifestPlaylistSize(manifest); got != 3 {
		t.Fatalf("manifest playlist size = %d, want 3", got)
	}
}
