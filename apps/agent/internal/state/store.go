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

type DeviceState struct {
	DeviceSessionID     string                 `json:"deviceSessionId,omitempty"`
	ClaimCode           string                 `json:"claimCode,omitempty"`
	ClaimToken          string                 `json:"claimToken,omitempty"`
	DeviceID            string                 `json:"deviceId,omitempty"`
	Credential          string                 `json:"credential,omitempty"`
	CredentialExpiresAt string                 `json:"credentialExpiresAt,omitempty"`
	AgentVersion        string                 `json:"agentVersion,omitempty"`
	PlayerVersion       string                 `json:"playerVersion,omitempty"`
	ManifestVersion     string                 `json:"manifestVersion,omitempty"`
	LastSyncAt          string                 `json:"lastSyncAt,omitempty"`
	LastHeartbeatAt     string                 `json:"lastHeartbeatAt,omitempty"`
	LastScreenshotAt    string                 `json:"lastScreenshotAt,omitempty"`
	LastError           string                 `json:"lastError,omitempty"`
	CurrentAssetID      string                 `json:"currentAssetId,omitempty"`
	CurrentPlaylistID   string                 `json:"currentPlaylistId,omitempty"`
	CachedAssets        map[string]AssetRecord `json:"cachedAssets,omitempty"`
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
			CachedAssets: map[string]AssetRecord{},
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
	}

	if err := store.saveLocked(); err != nil {
		return nil, err
	}

	return store, nil
}

func (s *Store) Snapshot() DeviceState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	copy := s.state
	copy.CachedAssets = cloneAssetRecords(s.state.CachedAssets)
	return copy
}

func (s *Store) Update(apply func(*DeviceState)) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	apply(&s.state)
	if s.state.CachedAssets == nil {
		s.state.CachedAssets = map[string]AssetRecord{}
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
	if err := os.WriteFile(tempPath, payload, 0o600); err != nil {
		return err
	}

	return os.Rename(tempPath, s.path)
}

func cloneAssetRecords(records map[string]AssetRecord) map[string]AssetRecord {
	if len(records) == 0 {
		return map[string]AssetRecord{}
	}

	copy := make(map[string]AssetRecord, len(records))
	for key, value := range records {
		copy[key] = value
	}
	return copy
}
