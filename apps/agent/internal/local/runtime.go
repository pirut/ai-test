package local

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/jrbussard/showroom-signage/apps/agent/internal/remote"
)

type kioskRuntime struct {
	Mode            string              `json:"mode"`
	Reason          string              `json:"reason,omitempty"`
	BrowserURL      string              `json:"browserUrl"`
	ManifestVersion string              `json:"manifestVersion,omitempty"`
	PlaylistID      string              `json:"playlistId,omitempty"`
	Volume          int                 `json:"volume,omitempty"`
	Orientation     int                 `json:"orientation"`
	StartIndex      int                 `json:"startIndex,omitempty"`
	Playlist        []kioskRuntimeAsset `json:"playlist,omitempty"`
}

type kioskRuntimeAsset struct {
	AssetID         string `json:"assetId"`
	Title           string `json:"title"`
	LocalPath       string `json:"localPath"`
	DurationSeconds int    `json:"durationSeconds,omitempty"`
}

func (s *Server) handleKioskRuntime(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(s.kioskRuntime())
}

func (s *Server) kioskRuntime() kioskRuntime {
	runtime := kioskRuntime{
		Mode:       "browser",
		Reason:     "default-browser",
		BrowserURL: "http://" + s.config.ListenAddr,
	}

	status := s.store.PlayerStatus()
	if !status.Claimed {
		runtime.Reason = "device-not-claimed"
		return runtime
	}

	manifest, err := s.loadManifest()
	if err != nil {
		runtime.Reason = "manifest-unavailable"
		return runtime
	}

	playlist, playlistID := chooseActivePlaylist(manifest, time.Now())
	if len(playlist) == 0 {
		runtime.Reason = "empty-playlist"
		return runtime
	}

	runtime.ManifestVersion = manifest.ManifestVersion
	runtime.PlaylistID = playlistID
	runtime.Volume = manifest.Volume
	runtime.Orientation = manifest.Orientation
	current := s.store.Snapshot()
	if current.CurrentPlaylistID == playlistID {
		for index, item := range playlist {
			if item.AssetID == current.CurrentAssetID {
				runtime.StartIndex = index
				break
			}
		}
	}

	assets := make([]kioskRuntimeAsset, 0, len(playlist))
	for _, item := range playlist {
		if item.AssetType != "video" {
			runtime.Reason = "non-video-playlist"
			return runtime
		}
		if !strings.HasPrefix(item.URL, "/assets/") {
			runtime.Reason = "non-local-asset"
			return runtime
		}

		localPath := filepath.Join(s.config.StorageRoot, strings.TrimPrefix(item.URL, "/assets/"))
		info, err := os.Stat(localPath)
		if err != nil || info.IsDir() {
			runtime.Reason = "missing-cached-asset"
			return runtime
		}

		assets = append(assets, kioskRuntimeAsset{
			AssetID:         item.AssetID,
			Title:           item.Title,
			LocalPath:       localPath,
			DurationSeconds: item.DurationSeconds,
		})
	}

	runtime.Mode = "mpv"
	runtime.Reason = "cached-video-playlist"
	runtime.Playlist = assets
	return runtime
}

func (s *Server) loadManifest() (*remote.DeviceManifest, error) {
	path := filepath.Join(s.config.StateRoot, "manifest.json")
	payload, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var manifest remote.DeviceManifest
	if err := json.Unmarshal(payload, &manifest); err == nil && manifest.ManifestVersion != "" {
		return &manifest, nil
	}

	var wrapped struct {
		Manifest remote.DeviceManifest `json:"manifest"`
	}
	if err := json.Unmarshal(payload, &wrapped); err != nil {
		return nil, err
	}
	return &wrapped.Manifest, nil
}
