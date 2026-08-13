package local

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jrbussard/showroom-signage/apps/agent/internal/config"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/state"
)

func TestDeepHealthRejectsAHeartbeatWithoutPlaybackProgress(t *testing.T) {
	store, err := state.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Update(func(next *state.DeviceState) {
		next.Credential = "credential"
	}); err != nil {
		t.Fatal(err)
	}

	server := NewServer(config.Config{PlayerStaleAfter: 45 * time.Second}, store)
	playback := httptest.NewRequest(http.MethodPost, "/local/playback", strings.NewReader(`{
		"assetId":"asset-1",
		"playlistId":"playlist-1",
		"state":"playing",
		"positionSeconds":12.5
	}`))
	playback.Header.Set("Content-Type", "application/json")
	playbackResponse := httptest.NewRecorder()
	server.Routes().ServeHTTP(playbackResponse, playback)
	if playbackResponse.Code != http.StatusNoContent {
		t.Fatalf("playback status = %d, want %d", playbackResponse.Code, http.StatusNoContent)
	}
	if store.Snapshot().LastPlayerProgressAt == "" {
		t.Fatal("playback position did not establish a progress timestamp")
	}

	if err := store.Update(func(next *state.DeviceState) {
		next.LastPlayerProgressAt = time.Now().UTC().Add(-2 * time.Minute).Format(time.RFC3339)
	}); err != nil {
		t.Fatal(err)
	}
	repeatedPlayback := httptest.NewRequest(http.MethodPost, "/local/playback", strings.NewReader(`{
		"assetId":"asset-1",
		"playlistId":"playlist-1",
		"state":"playing",
		"positionSeconds":12.5
	}`))
	repeatedPlaybackResponse := httptest.NewRecorder()
	server.Routes().ServeHTTP(repeatedPlaybackResponse, repeatedPlayback)
	if repeatedPlaybackResponse.Code != http.StatusNoContent {
		t.Fatalf("repeated playback status = %d, want %d", repeatedPlaybackResponse.Code, http.StatusNoContent)
	}

	healthResponse := httptest.NewRecorder()
	server.Routes().ServeHTTP(healthResponse, httptest.NewRequest(http.MethodGet, "/healthz?deep=1", nil))
	if healthResponse.Code != http.StatusServiceUnavailable {
		t.Fatalf("deep health status = %d, want %d", healthResponse.Code, http.StatusServiceUnavailable)
	}
}
