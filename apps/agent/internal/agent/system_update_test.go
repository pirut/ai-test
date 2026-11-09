package agent

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/jrbussard/showroom-signage/apps/agent/internal/config"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/remote"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/state"
)

type signedBundle struct {
	server    *httptest.Server
	sha256    string
	signature string
	publicKey string
}

func serveSignedBundle(t *testing.T, body []byte) signedBundle {
	t.Helper()
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(body)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(body)
	}))
	t.Cleanup(server.Close)
	return signedBundle{
		server:    server,
		sha256:    hex.EncodeToString(digest[:]),
		signature: base64.StdEncoding.EncodeToString(ed25519.Sign(privateKey, digest[:])),
		publicKey: base64.StdEncoding.EncodeToString(publicKey),
	}
}

func newUpdateTestService(t *testing.T, cfg config.Config) *Service {
	t.Helper()
	root := t.TempDir()
	cfg.StateRoot = filepath.Join(root, "state")
	store, err := state.Open(cfg.StateRoot)
	if err != nil {
		t.Fatal(err)
	}
	return &Service{config: cfg, client: remote.New("http://127.0.0.1:1"), store: store}
}

// A fake OS installer that records the bundle it was given, or fails.
func writeInstaller(t *testing.T, exitCode int) (string, string) {
	t.Helper()
	dir := t.TempDir()
	received := filepath.Join(dir, "received")
	script := filepath.Join(dir, "install")
	content := fmt.Sprintf("#!/bin/sh\ncp \"$1\" %s\necho installing \"$1\"\nexit %d\n", received, exitCode)
	if err := os.WriteFile(script, []byte(content), 0o755); err != nil {
		t.Fatal(err)
	}
	return script, received
}

func systemPayload(bundle signedBundle) map[string]interface{} {
	return map[string]interface{}{
		"version":         "2026.10.22.1",
		"systemUrl":       bundle.server.URL + "/showroom-os.raucb",
		"systemSha256":    bundle.sha256,
		"systemSignature": bundle.signature,
	}
}

func TestSystemBundleRejectedWithoutInstaller(t *testing.T) {
	bundle := serveSignedBundle(t, []byte("bundle"))
	service := newUpdateTestService(t, config.Config{ReleasePublicKey: bundle.publicKey})
	err := service.applyReleaseUpdate(context.Background(), "cmd-1", systemPayload(bundle))
	if err == nil || !strings.Contains(err.Error(), "not installed live") {
		t.Fatalf("expected the existing refusal, got %v", err)
	}
}

func TestSystemBundleInstalledWhenSignedAndConfigured(t *testing.T) {
	body := []byte("rauc bundle bytes")
	bundle := serveSignedBundle(t, body)
	installer, received := writeInstaller(t, 0)
	service := newUpdateTestService(t, config.Config{
		ReleasePublicKey:    bundle.publicKey,
		SystemUpdateCommand: installer,
	})
	if err := service.applyReleaseUpdate(context.Background(), "cmd-2", systemPayload(bundle)); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(received)
	if err != nil {
		t.Fatalf("installer did not run: %v", err)
	}
	if string(got) != string(body) {
		t.Fatalf("installer got %q", got)
	}
}

func TestSystemBundleWithBadSignatureNeverReachesInstaller(t *testing.T) {
	bundle := serveSignedBundle(t, []byte("bundle"))
	other := serveSignedBundle(t, []byte("other"))
	installer, received := writeInstaller(t, 0)
	service := newUpdateTestService(t, config.Config{
		ReleasePublicKey:    other.publicKey,
		SystemUpdateCommand: installer,
	})
	err := service.applyReleaseUpdate(context.Background(), "cmd-3", systemPayload(bundle))
	if err == nil || !strings.Contains(err.Error(), "verify system release signature") {
		t.Fatalf("expected a signature error, got %v", err)
	}
	if _, statErr := os.Stat(received); statErr == nil {
		t.Fatal("installer ran for an unverified bundle")
	}
}

func TestSystemBundleInstallFailureIsReported(t *testing.T) {
	bundle := serveSignedBundle(t, []byte("bundle"))
	installer, _ := writeInstaller(t, 1)
	service := newUpdateTestService(t, config.Config{
		ReleasePublicKey:    bundle.publicKey,
		SystemUpdateCommand: installer,
	})
	err := service.applyReleaseUpdate(context.Background(), "cmd-4", systemPayload(bundle))
	if err == nil || !strings.Contains(err.Error(), "install system bundle") || !strings.Contains(err.Error(), "installing") {
		t.Fatalf("expected the installer's output in the error, got %v", err)
	}
}

func TestDownloadResumingContinuesAfterDroppedConnections(t *testing.T) {
	body := []byte(strings.Repeat("showroom-os-bundle-", 20))
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := 0
		if value := r.Header.Get("Range"); value != "" {
			if _, err := fmt.Sscanf(value, "bytes=%d-", &start); err != nil {
				t.Errorf("bad range %q", value)
			}
			w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, len(body)-1, len(body)))
			w.Header().Set("Content-Length", fmt.Sprint(len(body)-start))
			w.WriteHeader(http.StatusPartialContent)
		} else {
			w.Header().Set("Content-Length", fmt.Sprint(len(body)))
		}
		end := start + 64
		if end >= len(body) {
			_, _ = w.Write(body[start:])
			return
		}
		_, _ = w.Write(body[start:end])
		w.(http.Flusher).Flush()
		panic(http.ErrAbortHandler)
	}))
	t.Cleanup(server.Close)

	service := newUpdateTestService(t, config.Config{})
	destination := filepath.Join(t.TempDir(), "bundle.raucb")
	if err := service.downloadResuming(context.Background(), server.URL, destination); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(destination)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(body) {
		t.Fatalf("downloaded %d bytes, want %d", len(got), len(body))
	}
}
