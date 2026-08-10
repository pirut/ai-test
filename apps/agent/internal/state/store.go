package state

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
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
	CurrentAssetID          string                      `json:"currentAssetId,omitempty"`
	CurrentPlaylistID       string                      `json:"currentPlaylistId,omitempty"`
	CachedAssets            map[string]AssetRecord      `json:"cachedAssets,omitempty"`
	PreviousCachedAssets    map[string]AssetRecord      `json:"previousCachedAssets,omitempty"`
	PreviousManifestVersion string                      `json:"previousManifestVersion,omitempty"`
	LastPlayerHeartbeatAt   string                      `json:"lastPlayerHeartbeatAt,omitempty"`
	PlayerState             string                      `json:"playerState,omitempty"`
	Health                  HealthSnapshot              `json:"health"`
	CompletedCommands       map[string]CompletedCommand `json:"completedCommands,omitempty"`
}

type PlayerStatus struct {
	Claimed         bool   `json:"claimed"`
	DeviceID        string `json:"deviceId,omitempty"`
	ClaimCode       string `json:"claimCode,omitempty"`
	ManifestVersion string `json:"manifestVersion,omitempty"`
	LastSyncAt      string `json:"lastSyncAt,omitempty"`
	LastError       string `json:"lastError,omitempty"`
}

type Store struct {
	path  string
	state DeviceState
	mu    sync.RWMutex
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

	payload, err := os.ReadFile(store.path)
	if err == nil {
		if err := json.Unmarshal(payload, &store.state); err != nil {
			return nil, err
		}
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
	return PlayerStatus{
		Claimed:         current.Credential != "",
		DeviceID:        current.DeviceID,
		ClaimCode:       current.ClaimCode,
		ManifestVersion: current.ManifestVersion,
		LastSyncAt:      current.LastSyncAt,
		LastError:       current.LastError,
	}
}

func (s *Store) saveLocked() error {
	payload, err := json.MarshalIndent(s.state, "", "  ")
	if err != nil {
		return err
	}

	tempPath := s.path + ".tmp"
	if err := os.WriteFile(tempPath, payload, 0o644); err != nil {
		return err
	}

	return os.Rename(tempPath, s.path)
}
