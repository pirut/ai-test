package state

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type AssetRecord struct {
	FileName string `json:"fileName"`
	Checksum string `json:"checksum"`
}

type CompletedCommand struct {
	Status      string `json:"status"`
	Message     string `json:"message,omitempty"`
	CompletedAt string `json:"completedAt"`
}

type HealthSnapshot struct {
	CapturedAt           string  `json:"capturedAt"`
	HardwareProfile      string  `json:"hardwareProfile"`
	Model                string  `json:"model,omitempty"`
	SerialNumber         string  `json:"serialNumber,omitempty"`
	OSVersion            string  `json:"osVersion,omitempty"`
	KernelVersion        string  `json:"kernelVersion,omitempty"`
	BootSlot             string  `json:"bootSlot,omitempty"`
	BootReason           string  `json:"bootReason,omitempty"`
	CPUTemperatureC      float64 `json:"cpuTemperatureC,omitempty"`
	Load1                float64 `json:"load1,omitempty"`
	MemoryAvailableBytes int64   `json:"memoryAvailableBytes,omitempty"`
	ThrottledFlags       string  `json:"throttledFlags,omitempty"`
	HDMIConnected        bool    `json:"hdmiConnected"`
	NetworkInterface     string  `json:"networkInterface,omitempty"`
	SSID                 string  `json:"ssid,omitempty"`
	SignalPercent        int     `json:"signalPercent,omitempty"`
	IPAddress            string  `json:"ipAddress,omitempty"`
	PlayerHealthy        bool    `json:"playerHealthy"`
	PlayerHeartbeatAt    string  `json:"playerHeartbeatAt,omitempty"`
	PlayerProgressAt     string  `json:"playerProgressAt,omitempty"`
	AgentRestarts        int     `json:"agentRestarts,omitempty"`
	PlayerRestarts       int     `json:"playerRestarts,omitempty"`
	RollbackCount        int     `json:"rollbackCount,omitempty"`
}

type DeviceState struct {
	DeviceSessionID         string                      `json:"deviceSessionId,omitempty"`
	ClaimCode               string                      `json:"claimCode,omitempty"`
	ClaimToken              string                      `json:"claimToken,omitempty"`
	DeviceID                string                      `json:"deviceId,omitempty"`
	Credential              string                      `json:"credential,omitempty"`
	CredentialExpiresAt     string                      `json:"credentialExpiresAt,omitempty"`
	AgentVersion            string                      `json:"agentVersion,omitempty"`
	PlayerVersion           string                      `json:"playerVersion,omitempty"`
	ManifestVersion         string                      `json:"manifestVersion,omitempty"`
	LastSyncAt              string                      `json:"lastSyncAt,omitempty"`
	LastHeartbeatAt         string                      `json:"lastHeartbeatAt,omitempty"`
	LastScreenshotAt        string                      `json:"lastScreenshotAt,omitempty"`
	LastError               string                      `json:"lastError,omitempty"`
	LastCloudContactAt      string                      `json:"lastCloudContactAt,omitempty"`
	CurrentAssetID          string                      `json:"currentAssetId,omitempty"`
	CurrentPlaylistID       string                      `json:"currentPlaylistId,omitempty"`
	CachedAssets            map[string]AssetRecord      `json:"cachedAssets,omitempty"`
	PreviousCachedAssets    map[string]AssetRecord      `json:"previousCachedAssets,omitempty"`
	PreviousManifestVersion string                      `json:"previousManifestVersion,omitempty"`
	LastPlayerHeartbeatAt   string                      `json:"lastPlayerHeartbeatAt,omitempty"`
	LastPlayerProgressAt    string                      `json:"lastPlayerProgressAt,omitempty"`
	PlayerPositionSeconds   float64                     `json:"playerPositionSeconds,omitempty"`
	PlayerState             string                      `json:"playerState,omitempty"`
	Health                  HealthSnapshot              `json:"health"`
	CompletedCommands       map[string]CompletedCommand `json:"completedCommands,omitempty"`
}

type PlayerStatus struct {
	Claimed            bool   `json:"claimed"`
	DeviceID           string `json:"deviceId,omitempty"`
	ClaimCode          string `json:"claimCode,omitempty"`
	ManifestVersion    string `json:"manifestVersion,omitempty"`
	LastSyncAt         string `json:"lastSyncAt,omitempty"`
	LastError          string `json:"lastError,omitempty"`
	Online             bool   `json:"online"`
	LastCloudContactAt string `json:"lastCloudContactAt,omitempty"`
}

// CloudContactFreshness is how recently the agent must have reached the
// control plane for the screen to count as online.
const CloudContactFreshness = 2 * time.Minute

type Store struct {
	path      string
	state     DeviceState
	mu        sync.RWMutex
	lastSaved []byte
	// lastIdentity is the identity last written to the backup file. The backup
	// is only rewritten when pairing or credentials change, which is rare.
	lastIdentity string
}

func Open(root string) (*Store, error) {
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, err
	}

	store := &Store{
		path: filepath.Join(root, "device-state.json"),
		state: DeviceState{
			CachedAssets:         map[string]AssetRecord{},
			PreviousCachedAssets: map[string]AssetRecord{},
			CompletedCommands:    map[string]CompletedCommand{},
		},
	}

	if loaded, ok := store.load(); ok {
		store.state = loaded
		if store.state.CachedAssets == nil {
			store.state.CachedAssets = map[string]AssetRecord{}
		}
		if store.state.PreviousCachedAssets == nil {
			store.state.PreviousCachedAssets = map[string]AssetRecord{}
		}
		if store.state.CompletedCommands == nil {
			store.state.CompletedCommands = map[string]CompletedCommand{}
		}
	}

	if err := store.saveLocked(); err != nil {
		return nil, err
	}

	return store, nil
}

// load reads the state file, falling back to the identity backup when the main
// file was corrupted (for example by a power cut mid-write). A screen that
// cannot parse its state must still boot: crash-looping here would leave the
// display dark until someone re-flashes it.
func (s *Store) load() (DeviceState, bool) {
	for _, path := range []string{s.path, s.backupPath()} {
		payload, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var loaded DeviceState
		if err := json.Unmarshal(payload, &loaded); err != nil {
			log.Printf("device state %s is unreadable: %v", path, err)
			continue
		}
		if path != s.path {
			log.Printf("recovered device state from %s", path)
		}
		return loaded, true
	}
	if _, err := os.Stat(s.path); err == nil {
		corruptPath := fmt.Sprintf("%s.corrupt-%d", s.path, time.Now().Unix())
		if err := os.Rename(s.path, corruptPath); err == nil {
			log.Printf("moved unreadable device state to %s and started fresh", corruptPath)
		}
	}
	return DeviceState{}, false
}

func (s *Store) backupPath() string {
	return s.path + ".bak"
}

func (s *Store) Snapshot() DeviceState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	snapshot := s.state
	snapshot.CachedAssets = make(map[string]AssetRecord, len(s.state.CachedAssets))
	for assetID, record := range s.state.CachedAssets {
		snapshot.CachedAssets[assetID] = record
	}
	snapshot.PreviousCachedAssets = make(map[string]AssetRecord, len(s.state.PreviousCachedAssets))
	for assetID, record := range s.state.PreviousCachedAssets {
		snapshot.PreviousCachedAssets[assetID] = record
	}
	snapshot.CompletedCommands = make(map[string]CompletedCommand, len(s.state.CompletedCommands))
	for commandID, result := range s.state.CompletedCommands {
		snapshot.CompletedCommands[commandID] = result
	}
	return snapshot
}

func (s *Store) Update(apply func(*DeviceState)) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	apply(&s.state)
	if s.state.CachedAssets == nil {
		s.state.CachedAssets = map[string]AssetRecord{}
	}
	if s.state.PreviousCachedAssets == nil {
		s.state.PreviousCachedAssets = map[string]AssetRecord{}
	}
	if s.state.CompletedCommands == nil {
		s.state.CompletedCommands = map[string]CompletedCommand{}
	}
	return s.saveLocked()
}

func (s *Store) PlayerStatus() PlayerStatus {
	current := s.Snapshot()
	online := false
	if contactAt, err := time.Parse(time.RFC3339, current.LastCloudContactAt); err == nil {
		online = time.Since(contactAt) < CloudContactFreshness
	}
	return PlayerStatus{
		Claimed:            current.Credential != "",
		DeviceID:           current.DeviceID,
		ClaimCode:          current.ClaimCode,
		ManifestVersion:    current.ManifestVersion,
		LastSyncAt:         current.LastSyncAt,
		LastError:          current.LastError,
		Online:             online,
		LastCloudContactAt: current.LastCloudContactAt,
	}
}

func (s *Store) saveLocked() error {
	payload, err := json.MarshalIndent(s.state, "", "  ")
	if err != nil {
		return err
	}
	if bytes.Equal(payload, s.lastSaved) {
		// Nothing changed. Skipping the write spares the SD card.
		return nil
	}

	if err := WriteFileAtomic(s.path, payload, 0o644); err != nil {
		return err
	}
	s.lastSaved = payload

	identity := s.state.DeviceSessionID + "\x00" + s.state.ClaimToken + "\x00" + s.state.DeviceID + "\x00" + s.state.Credential
	if identity != s.lastIdentity {
		if err := WriteFileAtomic(s.backupPath(), payload, 0o600); err != nil {
			log.Printf("unable to write device state backup: %v", err)
		} else {
			s.lastIdentity = identity
		}
	}
	return nil
}

// WriteFileAtomic replaces path with payload so that a power cut leaves either
// the old or the new content, never a truncated file.
func WriteFileAtomic(path string, payload []byte, perm os.FileMode) error {
	tempPath := path + ".tmp"
	file, err := os.OpenFile(tempPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, perm)
	if err != nil {
		return err
	}
	if _, err := file.Write(payload); err != nil {
		file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := os.Rename(tempPath, path); err != nil {
		return err
	}
	if dir, err := os.Open(filepath.Dir(path)); err == nil {
		_ = dir.Sync()
		_ = dir.Close()
	}
	return nil
}
