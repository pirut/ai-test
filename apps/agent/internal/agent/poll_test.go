package agent

import (
	"testing"
	"time"

	"github.com/jrbussard/showroom-signage/apps/agent/internal/config"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/state"
)

func TestSyncPaceIsFastOnlyWhileUnpaired(t *testing.T) {
	store, err := state.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	service := &Service{config: config.Config{PollInterval: 15 * time.Second}, store: store}

	if base, backoff := service.syncPace(); base != pairingCodePollInterval || backoff != pairingMaxBackoff {
		t.Fatalf("waiting for a pairing code: pace = %v, %v", base, backoff)
	}
	_ = store.Update(func(next *state.DeviceState) { next.ClaimCode = "K7Q2XM" })
	if base, _ := service.syncPace(); base != pairingClaimPollInterval {
		t.Fatalf("showing a pairing code: interval = %v", base)
	}
	_ = store.Update(func(next *state.DeviceState) {
		next.ClaimCode = ""
		next.Credential = "credential"
	})
	if base, backoff := service.syncPace(); base != 15*time.Second || backoff != syncMaxBackoff {
		t.Fatalf("paired screen: pace = %v, %v, want the configured interval and normal backoff", base, backoff)
	}

	service.config.PollInterval = 2 * time.Second
	_ = store.Update(func(next *state.DeviceState) { next.Credential = "" })
	if base, _ := service.syncPace(); base != 2*time.Second {
		t.Fatalf("a shorter configured interval must win: interval = %v", base)
	}
}

func TestRequestSyncNeverBlocks(t *testing.T) {
	service := &Service{syncTrigger: make(chan struct{}, 1)}
	service.requestSync()
	service.requestSync()
	if len(service.syncTrigger) != 1 {
		t.Fatalf("pending triggers = %d", len(service.syncTrigger))
	}
}
