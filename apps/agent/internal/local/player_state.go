package local

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// nativePlayerState is everything the native Pi player needs to decide what to
// draw: the claim/Wi-Fi state for setup screens and the cached playlist with
// absolute paths for playback. Unlike kioskRuntime it never falls back to a
// browser, so images, mixed playlists and partly cached playlists are included.
type nativePlayerState struct {
	Claimed   bool   `json:"claimed"`
	DeviceID  string `json:"deviceId,omitempty"`
	ClaimCode string `json:"claimCode,omitempty"`
	LastError string `json:"lastError,omitempty"`
	// Online is the same value as /local/status: the service answered recently.
	Online          bool               `json:"online"`
	HasManifest     bool               `json:"hasManifest"`
	ManifestVersion string             `json:"manifestVersion,omitempty"`
	PlaylistID      string             `json:"playlistId,omitempty"`
	Volume          int                `json:"volume"`
	Orientation     int                `json:"orientation"`
	StartItemID     string             `json:"startItemId,omitempty"`
	PendingItems    int                `json:"pendingItems"`
	Items           []nativePlayerItem `json:"items"`
	WiFi            *wifiStatus        `json:"wifi,omitempty"`
	// ClaimURL opens the dashboard with the pairing code filled in;
	// ClaimQR is the same link as QR modules for the pairing screen.
	ClaimURL string   `json:"claimUrl,omitempty"`
	ClaimQR  []string `json:"claimQr,omitempty"`
}

type nativePlayerItem struct {
	ID              string `json:"id"`
	AssetID         string `json:"assetId"`
	AssetType       string `json:"assetType"`
	Title           string `json:"title"`
	LocalPath       string `json:"localPath"`
	DurationSeconds int    `json:"durationSeconds,omitempty"`
}

func (s *Server) handlePlayerState(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(s.playerState(s.readWiFiStatus))
}

func (s *Server) playerState(readWiFi func() wifiStatus) nativePlayerState {
	status := s.playerStatus()
	result := nativePlayerState{
		Claimed:   status.Claimed,
		DeviceID:  status.DeviceID,
		ClaimCode: status.ClaimCode,
		LastError: status.LastError,
		Online:    status.Online,
		// Items assigned but not downloaded yet.
		PendingItems: status.PendingItems,
		Items:        []nativePlayerItem{},
	}
	if !status.Claimed {
		result.ClaimURL, result.ClaimQR = s.claimLink(status.ClaimCode)
		// Wi-Fi status shells out to nmcli, so only unpaired screens pay for
		// it: they may need the Wi-Fi setup screen or the network line under
		// the pairing code.
		wifi := readWiFi()
		result.WiFi = &wifi
	}

	manifest, err := s.loadManifest()
	if err != nil || manifest == nil {
		return result
	}

	result.HasManifest = true
	result.ManifestVersion = manifest.ManifestVersion
	result.Volume = manifest.Volume
	result.Orientation = manifest.Orientation

	playlist, playlistID := chooseActivePlaylist(manifest, time.Now())
	result.PlaylistID = playlistID
	current := s.store.Snapshot()
	result.PendingItems = 0
	for _, item := range playlist {
		if item.AssetType != "video" && item.AssetType != "image" {
			result.PendingItems++
			continue
		}
		if !strings.HasPrefix(item.URL, "/assets/") {
			result.PendingItems++
			continue
		}
		localPath := filepath.Join(s.config.StorageRoot, filepath.Clean("/"+strings.TrimPrefix(item.URL, "/assets/")))
		info, err := os.Stat(localPath)
		if err != nil || info.IsDir() {
			result.PendingItems++
			continue
		}
		if result.StartItemID == "" && current.CurrentPlaylistID == playlistID && item.AssetID == current.CurrentAssetID {
			result.StartItemID = item.ID
		}
		result.Items = append(result.Items, nativePlayerItem{
			ID:              item.ID,
			AssetID:         item.AssetID,
			AssetType:       item.AssetType,
			Title:           item.Title,
			LocalPath:       localPath,
			DurationSeconds: item.DurationSeconds,
		})
	}
	// The agent's own count covers items it has not fetched at all yet (they
	// are not in the local manifest), across every playlist on this screen.
	result.PendingItems = max(result.PendingItems, status.PendingItems)
	return result
}
