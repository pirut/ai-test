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
