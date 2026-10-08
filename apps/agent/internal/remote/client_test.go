package remote

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestAssetFileNameUsesMP4ForYouTube(t *testing.T) {
	item := ManifestPlaylistItem{AssetID: "asset-1", URL: "https://youtu.be/example", SourceType: "youtube"}
	if got := AssetFileName(item); got != "asset-1.mp4" {
		t.Fatalf("unexpected file name %q", got)
	}
}

func TestIsYouTubeURLRejectsLookalikeHosts(t *testing.T) {
	if IsYouTubeURL("https://youtube.com.evil.example/watch?v=1") {
		t.Fatal("lookalike host was accepted")
	}
	if !IsYouTubeURL("https://www.youtube.com/watch?v=1") {
		t.Fatal("canonical YouTube host was rejected")
	}
}

func TestHTTPErrorsAreClassified(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/device/manifest":
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"Unauthorized device"}`))
		case "/api/device/claim-status":
			w.WriteHeader(http.StatusGone)
		default:
			w.WriteHeader(http.StatusBadGateway)
		}
	}))
	defer server.Close()
	client := New(server.URL)

	_, err := client.FetchManifest(context.Background(), "credential")
	if !IsUnauthorized(err) {
		t.Fatalf("expected an unauthorized error, got %v", err)
	}
	_, err = client.ClaimStatus(context.Background(), "session", "token")
	if !IsClaimSessionExpired(err) {
		t.Fatalf("expected an expired claim session, got %v", err)
	}
	_, err = client.FetchCommands(context.Background(), "credential", 0)
	if IsUnauthorized(err) || IsClaimSessionExpired(err) {
		t.Fatalf("a 502 must not look like a rejection: %v", err)
	}
}

func TestDownloadRestartsAfterInvalidResumeRange(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Range") != "" {
			w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
			return
		}
		_, _ = w.Write([]byte("fresh"))
	}))
	defer server.Close()
	dest := filepath.Join(t.TempDir(), "asset.mp4")
	if err := os.WriteFile(dest+".part", []byte("stale partial bytes"), 0o644); err != nil {
		t.Fatal(err)
	}
	client := New(server.URL)

	if err := client.DownloadFile(context.Background(), server.URL+"/asset.mp4", dest); err == nil {
		t.Fatal("expected the stale range attempt to fail")
	}
	if err := client.DownloadFile(context.Background(), server.URL+"/asset.mp4", dest); err != nil {
		t.Fatalf("download did not recover from a stale partial file: %v", err)
	}
	if payload, _ := os.ReadFile(dest); string(payload) != "fresh" {
		t.Fatalf("unexpected content %q", payload)
	}
}

func TestFetchCommandsRequestsLongPoll(t *testing.T) {
	var query string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		query = r.URL.RawQuery
		_, _ = w.Write([]byte(`{"commands":[]}`))
	}))
	defer server.Close()

	if _, err := New(server.URL).FetchCommands(context.Background(), "credential", 20*time.Second); err != nil {
		t.Fatal(err)
	}
	if query != "waitSeconds=20" {
		t.Fatalf("expected a long-poll request, got query %q", query)
	}
}
