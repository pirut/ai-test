package agent

import (
	"testing"
	"time"

	"github.com/jrbussard/showroom-signage/apps/agent/internal/config"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/state"
)

func TestPollDelayIsFastOnlyWhileUnpaired(t *testing.T) {
	store, err := state.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	service := &Service{config: config.Config{PollInterval: 15 * time.Second}, store: store}

	if got := service.pollDelay(); got != pairingCodePollInterval {
		t.Fatalf("waiting for a pairing code: delay = %v", got)
	}
	_ = store.Update(func(next *state.DeviceState) { next.ClaimCode = "K7Q2XM" })
	if got := service.pollDelay(); got != pairingClaimPollInterval {
		t.Fatalf("showing a pairing code: delay = %v", got)
	}
	_ = store.Update(func(next *state.DeviceState) {
		next.ClaimCode = ""
		next.Credential = "credential"
	})
	if got := service.pollDelay(); got != 15*time.Second {
		t.Fatalf("paired screen: delay = %v, want the configured interval", got)
	}

	service.config.PollInterval = 2 * time.Second
	_ = store.Update(func(next *state.DeviceState) { next.Credential = "" })
	if got := service.pollDelay(); got != 2*time.Second {
		t.Fatalf("a shorter configured interval must win: delay = %v", got)
	}
}

func TestPollNowNeverBlocks(t *testing.T) {
	service := &Service{pollTrigger: make(chan struct{}, 1)}
	service.pollNow()
	service.pollNow()
	if len(service.pollTrigger) != 1 {
		t.Fatalf("pending triggers = %d", len(service.pollTrigger))
	}
}
