package agent

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math/rand"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"time"

	"github.com/jrbussard/showroom-signage/apps/agent/internal/remote"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/state"
)

// The cloud link is split into independent loops so that a slow media download
// never delays a command an operator just sent from the dashboard, and a dead
// network never stops heartbeats from resuming the moment it comes back.

const (
	syncMaxBackoff    = 2 * time.Minute
	commandMaxBackoff = time.Minute
	// A screen is only returned to pairing mode after the server has rejected
	// its credential repeatedly over a sustained period. One bad response must
	// never unpair a fleet.
	credentialRejectionsBeforeReset = 5
	credentialRejectionWindow       = 10 * time.Minute
)

// runLoop calls step, then waits for the base interval (or a backoff after
// connectivity failures) or for a trigger, whichever comes first.
func runLoop(ctx context.Context, name string, base time.Duration, maxBackoff time.Duration, trigger <-chan struct{}, step func(context.Context) error) {
	failures := 0
	for {
		if err := step(ctx); err != nil {
			log.Printf("%s failed: %v", name, err)
			if isConnectivityError(err) {
				failures++
			} else {
				failures = 0
			}
		} else {
			failures = 0
		}

		timer := time.NewTimer(backoffDelay(base, failures, maxBackoff))
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		case <-trigger:
			timer.Stop()
		}
	}
}

// backoffDelay doubles the interval for each consecutive failure up to max,
// with jitter so a fleet that lost the same uplink does not reconnect in
// lockstep.
func backoffDelay(base time.Duration, failures int, max time.Duration) time.Duration {
	if base <= 0 {
		base = 15 * time.Second
	}
	delay := base
	for attempt := 0; attempt < failures && delay < max; attempt++ {
		delay *= 2
	}
	if failures > 0 && delay > max {
		delay = max
	}
	spread := int64(delay) / 5
	if spread <= 0 {
		return delay
	}
	return delay - time.Duration(spread/2) + time.Duration(rand.Int63n(spread))
}

// isConnectivityError reports failures worth backing off for: the network is
// down, or the control plane is unavailable or throttling.
func isConnectivityError(err error) bool {
	if err == nil {
		return false
	}
	var httpErr *remote.HTTPError
	if errors.As(err, &httpErr) {
		return httpErr.StatusCode >= 500 || httpErr.StatusCode == 429
	}
	var urlErr *url.Error
	var netErr net.Error
	return errors.As(err, &urlErr) || errors.As(err, &netErr)
}

func (s *Service) requestSync() {
	select {
	case s.syncTrigger <- struct{}{}:
	default:
	}
}

func (s *Service) runSyncLoop(ctx context.Context) {
	runLoop(ctx, "sync", s.config.PollInterval, syncMaxBackoff, s.syncTrigger, s.syncOnce)
}

func (s *Service) runCommandLoop(ctx context.Context) {
	runLoop(ctx, "command poll", s.config.PollInterval, commandMaxBackoff, nil, func(ctx context.Context) error {
		current := s.store.Snapshot()
		if current.Credential == "" {
			return nil
		}
		err := s.processCommands(ctx, current.Credential)
		if err != nil {
			s.noteRequestError(current.Credential, err)
		}
		return err
	})
}

// syncOnce owns pairing, credential refresh and manifest sync. It is the only
// place that changes the device identity, so those transitions never race.
func (s *Service) syncOnce(ctx context.Context) error {
	s.syncMu.Lock()
	defer s.syncMu.Unlock()

	current := s.store.Snapshot()
	if current.Credential == "" {
		if err := s.ensureClaimFlow(ctx, current); err != nil {
			s.recordError(err)
			return err
		}
		return nil
	}

	if err := s.ensureCredentialFresh(ctx, current); err != nil {
		s.recordError(err)
		return err
	}
	current = s.store.Snapshot()
	if current.Credential == "" {
		// The credential was rejected for good and the screen is pairing again.
		s.requestSync()
		return nil
	}

	if err := s.syncManifest(ctx, current.Credential); err != nil {
		s.noteRequestError(current.Credential, err)
		if shouldExposeManifestSyncError(filepath.Join(s.config.StateRoot, "manifest.json")) {
			s.recordError(err)
		} else {
			log.Printf("background manifest hydration failed: %v", err)
			_ = s.store.Update(func(next *state.DeviceState) { next.LastError = "" })
		}
		return err
	}
	_ = s.store.Update(func(next *state.DeviceState) {
		next.LastError = ""
	})
	return nil
}

func shouldExposeManifestSyncError(manifestPath string) bool {
	return !fileExists(manifestPath)
}

func (s *Service) ensureClaimFlow(ctx context.Context, current state.DeviceState) error {
	if current.DeviceSessionID == "" || current.ClaimToken == "" {
		registration, err := s.client.RegisterTemporary(ctx)
		if err != nil {
			return err
		}
		log.Printf("registered for pairing with claim code %s", registration.ClaimCode)

		return s.store.Update(func(next *state.DeviceState) {
			next.DeviceSessionID = registration.DeviceSessionID
			next.ClaimCode = registration.ClaimCode
			next.ClaimToken = registration.ClaimToken
			next.LastError = ""
			next.LastCloudContactAt = nowRFC3339()
		})
	}

	status, err := s.client.ClaimStatus(ctx, current.DeviceSessionID, current.ClaimToken)
	if remote.IsClaimSessionExpired(err) {
		// The code on screen timed out before anyone used it. Replace it right
		// away so the screen never shows a code that cannot work.
		log.Printf("claim code %s expired; requesting a new one", current.ClaimCode)
		if err := s.store.Update(func(next *state.DeviceState) {
			next.DeviceSessionID = ""
			next.ClaimCode = ""
			next.ClaimToken = ""
		}); err != nil {
			return err
		}
		return s.ensureClaimFlow(ctx, s.store.Snapshot())
	}
	if err != nil {
		return err
	}
	if !status.Claimed {
		return s.store.Update(func(next *state.DeviceState) {
			next.LastCloudContactAt = nowRFC3339()
		})
	}

	log.Printf("screen was claimed as device %s", status.DeviceID)
	if err := s.store.Update(func(next *state.DeviceState) {
		next.DeviceID = status.DeviceID
		next.Credential = status.Credential
		next.CredentialExpiresAt = expiresAtRFC3339(status.ExpiresInSeconds)
		next.DeviceSessionID = ""
		next.ClaimCode = ""
		next.ClaimToken = ""
		next.LastError = ""
		next.LastCloudContactAt = nowRFC3339()
	}); err != nil {
		return err
	}

	// Report in immediately so the dashboard shows the screen online without
	// waiting for the next heartbeat tick. Content follows on the next sync.
	if err := s.maybeSendHeartbeat(ctx, s.store.Snapshot()); err != nil {
		log.Printf("first heartbeat after claim failed: %v", err)
	}
	s.requestSync()
	return nil
}

// ensureCredentialFresh rotates the credential before it expires, or right
// away when another loop saw the server reject it.
func (s *Service) ensureCredentialFresh(ctx context.Context, current state.DeviceState) error {
	if current.Credential == "" {
		return nil
	}

	rejected := s.takeRejectedCredential() == current.Credential
	if _, needsRefresh := credentialNeedsRefresh(current.CredentialExpiresAt); !needsRefresh && !rejected {
		return nil
	}

	refreshed, err := s.client.RefreshAuth(ctx, current.Credential)
	if err != nil {
		if remote.IsUnauthorized(err) {
			return s.noteCredentialRejected(current.Credential, err)
		}
		return err
	}

	s.clearCredentialRejections()
	return s.store.Update(func(next *state.DeviceState) {
		next.DeviceID = refreshed.DeviceID
		next.Credential = refreshed.Credential
		next.CredentialExpiresAt = expiresAtRFC3339(refreshed.ExpiresInSeconds)
		next.LastCloudContactAt = nowRFC3339()
	})
}

// noteRequestError lets any loop flag a rejected credential. The sync loop
// confirms it with a refresh attempt on its next pass before acting on it.
func (s *Service) noteRequestError(credential string, err error) {
	if !remote.IsUnauthorized(err) {
		return
	}
	s.authMu.Lock()
	s.rejectedCredential = credential
	s.authMu.Unlock()
}

func (s *Service) takeRejectedCredential() string {
	s.authMu.Lock()
	defer s.authMu.Unlock()
	rejected := s.rejectedCredential
	s.rejectedCredential = ""
	return rejected
}

func (s *Service) clearCredentialRejections() {
	s.authMu.Lock()
	defer s.authMu.Unlock()
	s.credentialRejections = 0
	s.firstCredentialRejection = time.Time{}
}

func (s *Service) noteCredentialRejected(credential string, cause error) error {
	s.authMu.Lock()
	// Keep retrying the refresh on every pass until it succeeds or the
	// rejection has clearly persisted.
	s.rejectedCredential = credential
	now := s.currentTime()
	if s.credentialRejections == 0 {
		s.firstCredentialRejection = now
	}
	s.credentialRejections++
	count := s.credentialRejections
	sustained := now.Sub(s.firstCredentialRejection) >= credentialRejectionWindow
	s.authMu.Unlock()

	if count < credentialRejectionsBeforeReset || !sustained {
		// Keep the current credential; this may be a blip.
		return fmt.Errorf("device credential was rejected (%d): %w", count, cause)
	}

	s.clearCredentialRejections()
	s.takeRejectedCredential()
	return s.resetToPairing()
}

// resetToPairing returns a screen that was removed from its account to the
// pairing screen, so it stops showing the previous owner's content and can be
// claimed again without re-flashing.
func (s *Service) resetToPairing() error {
	log.Printf("device credential is no longer accepted; returning to pairing mode")
	previous := s.store.Snapshot()
	if err := s.store.Update(func(next *state.DeviceState) {
		next.DeviceID = ""
		next.Credential = ""
		next.CredentialExpiresAt = ""
		next.DeviceSessionID = ""
		next.ClaimCode = ""
		next.ClaimToken = ""
		next.ManifestVersion = ""
		next.PreviousManifestVersion = ""
		next.CurrentAssetID = ""
		next.CurrentPlaylistID = ""
		next.CachedAssets = map[string]state.AssetRecord{}
		next.PreviousCachedAssets = map[string]state.AssetRecord{}
		next.CompletedCommands = map[string]state.CompletedCommand{}
		next.LastError = ""
	}); err != nil {
		return err
	}

	for _, name := range []string{"manifest.json", "manifest.previous.json"} {
		if err := os.Remove(filepath.Join(s.config.StateRoot, name)); err != nil && !os.IsNotExist(err) {
			log.Printf("unable to remove %s: %v", name, err)
		}
	}
	stale := cloneAssetRecords(previous.CachedAssets)
	for id, record := range previous.PreviousCachedAssets {
		stale[id] = record
	}
	s.pruneCachedAssets(stale, nil)
	return nil
}

func nowRFC3339() string {
	return time.Now().UTC().Format(time.RFC3339)
}
