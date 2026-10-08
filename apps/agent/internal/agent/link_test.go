package agent

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/jrbussard/showroom-signage/apps/agent/internal/config"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/remote"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/state"
)

func newLinkTestService(t *testing.T, handler http.Handler) (*Service, string) {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	stateRoot := t.TempDir()
	store, err := state.Open(stateRoot)
	if err != nil {
		t.Fatal(err)
	}
	return &Service{
		config: config.Config{
			StateRoot:         stateRoot,
			StorageRoot:       t.TempDir(),
			PollInterval:      time.Second,
			HeartbeatInterval: time.Minute,
		},
		client:      remote.New(server.URL),
		store:       store,
		start:       time.Now(),
		now:         time.Now,
		syncTrigger: make(chan struct{}, 1),
	}, stateRoot
}

func TestBackoffDelayGrowsAndCaps(t *testing.T) {
	base := 10 * time.Second
	max := 2 * time.Minute
	if got := backoffDelay(base, 0, max); got < 9*time.Second || got > 11*time.Second {
		t.Fatalf("healthy loop should keep its interval, got %s", got)
	}
	if got := backoffDelay(base, 2, max); got < 36*time.Second || got > 44*time.Second {
		t.Fatalf("expected roughly 40s after two failures, got %s", got)
	}
	if got := backoffDelay(base, 20, max); got > max+max/10 {
		t.Fatalf("backoff exceeded its cap: %s", got)
	}
}

func TestConnectivityErrorsAreDistinguishedFromRejections(t *testing.T) {
	if !isConnectivityError(&remote.HTTPError{StatusCode: http.StatusBadGateway}) {
		t.Fatal("a 502 should back off")
	}
	if isConnectivityError(&remote.HTTPError{StatusCode: http.StatusUnauthorized}) {
		t.Fatal("a rejected credential is not a connectivity failure")
	}
	if isConnectivityError(errors.New("no playable media")) {
		t.Fatal("local failures should not back off the link")
	}
}

func TestExpiredClaimCodeIsReplacedAutomatically(t *testing.T) {
	var registrations int
	service, _ := newLinkTestService(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/device/claim-status":
			w.WriteHeader(http.StatusGone)
			_, _ = w.Write([]byte(`{"error":"Claim session expired"}`))
		case "/api/device/register-temporary":
			registrations++
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"deviceSessionId": "session-2",
				"claimCode":       "NEWCODE",
				"claimToken":      "token-2",
			})
		default:
			http.NotFound(w, r)
		}
	}))
	_ = service.store.Update(func(next *state.DeviceState) {
		next.DeviceSessionID = "session-1"
		next.ClaimCode = "OLDCODE"
		next.ClaimToken = "token-1"
	})

	if err := service.syncOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if registrations != 1 {
		t.Fatalf("expected one re-registration, got %d", registrations)
	}
	if got := service.store.Snapshot().ClaimCode; got != "NEWCODE" {
		t.Fatalf("screen still shows an expired code: %q", got)
	}
}

func TestCredentialExpiredWhileOfflineIsRefreshed(t *testing.T) {
	service, _ := newLinkTestService(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/device/auth/refresh":
			if r.Header.Get("Authorization") != "Bearer old" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"deviceId":         "device-1",
				"credential":       "new",
				"expiresInSeconds": 86400,
			})
		case "/api/device/manifest":
			w.WriteHeader(http.StatusServiceUnavailable)
		default:
			http.NotFound(w, r)
		}
	}))
	_ = service.store.Update(func(next *state.DeviceState) {
		next.DeviceID = "device-1"
		next.Credential = "old"
		next.CredentialExpiresAt = time.Now().Add(-72 * time.Hour).UTC().Format(time.RFC3339)
	})

	_ = service.syncOnce(context.Background())
	if got := service.store.Snapshot().Credential; got != "new" {
		t.Fatalf("expected the credential to be rotated, got %q", got)
	}
}

func TestRemovedScreenReturnsToPairingOnlyAfterSustainedRejection(t *testing.T) {
	var mu sync.Mutex
	service, stateRoot := newLinkTestService(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		switch r.URL.Path {
		case "/api/device/auth/refresh":
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"Unauthorized device"}`))
		case "/api/device/register-temporary":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"deviceSessionId": "session-1",
				"claimCode":       "PAIRME",
				"claimToken":      "token-1",
			})
		default:
			http.NotFound(w, r)
		}
	}))
	clock := time.Now()
	service.now = func() time.Time { return clock }
	manifestPath := filepath.Join(stateRoot, "manifest.json")
	if err := os.WriteFile(manifestPath, []byte(`{}`), 0o644); err != nil {
		t.Fatal(err)
	}
	cachedPath := filepath.Join(service.config.StorageRoot, "asset-1.mp4")
	if err := os.WriteFile(cachedPath, []byte("video"), 0o644); err != nil {
		t.Fatal(err)
	}
	_ = service.store.Update(func(next *state.DeviceState) {
		next.DeviceID = "device-1"
		next.Credential = "revoked"
		next.CredentialExpiresAt = time.Now().Add(time.Hour).UTC().Format(time.RFC3339)
		next.CachedAssets["asset-1"] = state.AssetRecord{FileName: "asset-1.mp4"}
	})
	service.noteRequestError("revoked", &remote.HTTPError{StatusCode: http.StatusUnauthorized})

	for attempt := 0; attempt < credentialRejectionsBeforeReset; attempt++ {
		_ = service.syncOnce(context.Background())
		if service.store.Snapshot().Credential == "" {
			t.Fatalf("screen unpaired after only %d quick rejections", attempt+1)
		}
	}

	clock = clock.Add(credentialRejectionWindow)
	_ = service.syncOnce(context.Background())
	current := service.store.Snapshot()
	if current.Credential != "" || current.DeviceID != "" {
		t.Fatalf("removed screen kept its identity: %+v", current)
	}
	if fileExists(manifestPath) || fileExists(cachedPath) {
		t.Fatal("removed screen kept the previous owner's content")
	}

	_ = service.syncOnce(context.Background())
	if got := service.store.Snapshot().ClaimCode; got != "PAIRME" {
		t.Fatalf("expected a fresh pairing code, got %q", got)
	}
}

func TestRebootIsReportedBeforeItRuns(t *testing.T) {
	var reported bool
	service, _ := newLinkTestService(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/device/command-result" {
			reported = true
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{}`))
			return
		}
		http.NotFound(w, r)
	}))
	marker := filepath.Join(t.TempDir(), "rebooted")
	service.config.RebootCommand = "touch " + marker

	if err := service.executeCommand(context.Background(), "credential", remote.DeviceCommand{ID: "cmd-1", CommandType: "reboot_device"}); err != nil {
		t.Fatal(err)
	}
	if !reported {
		t.Fatal("reboot result was not reported")
	}
	if !fileExists(marker) {
		t.Fatal("reboot command did not run")
	}
	if _, ok := service.store.Snapshot().CompletedCommands["cmd-1"]; !ok {
		t.Fatal("reboot result was not persisted for redelivery")
	}
}

func TestCommandPollingKeepsTheLineOpenOnlyWhenTheServerLongPolls(t *testing.T) {
	base := 15 * time.Second
	if got := nextCommandPollDelay(base, 0, 0, nil, commandLongPollWait); got != 0 {
		t.Fatalf("a held request should be followed immediately, got %s", got)
	}
	if got := nextCommandPollDelay(base, 0, 2, nil, time.Millisecond); got != 0 {
		t.Fatalf("delivered commands should be followed immediately, got %s", got)
	}
	if got := nextCommandPollDelay(base, 0, 0, nil, 50*time.Millisecond); got < base*9/10 {
		t.Fatalf("a server without long polling must not be hammered, got %s", got)
	}
	if got := nextCommandPollDelay(base, 3, 0, &remote.HTTPError{StatusCode: http.StatusBadGateway}, time.Millisecond); got < 50*time.Second {
		t.Fatalf("failures should back off, got %s", got)
	}
}
