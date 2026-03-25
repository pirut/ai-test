package local

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/jrbussard/showroom-signage/apps/agent/internal/remote"
)

type kioskRuntime struct {
	Mode            string             `json:"mode"`
	Reason          string             `json:"reason,omitempty"`
	BrowserURL      string             `json:"browserUrl"`
	ManifestVersion string             `json:"manifestVersion,omitempty"`
	Volume          int                `json:"volume,omitempty"`
	Asset           *kioskRuntimeAsset `json:"asset,omitempty"`
}

type kioskRuntimeAsset struct {
	AssetID         string `json:"assetId"`
	AssetType       string `json:"assetType"`
	Title           string `json:"title"`
	LocalPath       string `json:"localPath"`
	DurationSeconds int    `json:"durationSeconds,omitempty"`
}

func (s *Server) handleKioskRuntime(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(s.kioskRuntime())
}

func (s *Server) kioskRuntime() kioskRuntime {
	return s.kioskRuntimeAt(time.Now())
}

func (s *Server) kioskRuntimeAt(now time.Time) kioskRuntime {
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

	asset, reason := s.chooseCachedRuntimeAsset(manifest, now)
	if asset == nil {
		runtime.Reason = reason
		return runtime
	}

	runtime.ManifestVersion = manifest.ManifestVersion
	runtime.Volume = manifest.Volume
	runtime.Mode = "mpv"
	runtime.Reason = reason
	runtime.Asset = asset
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

func chooseActivePlaylist(manifest *remote.DeviceManifest) []remote.ManifestPlaylistItem {
	return chooseActivePlaylistAt(manifest, time.Now())
}

func chooseActivePlaylistAt(manifest *remote.DeviceManifest, now time.Time) []remote.ManifestPlaylistItem {
	active := make([]remote.ScheduleWindow, 0, len(manifest.ScheduleWindows))
	for _, window := range manifest.ScheduleWindows {
		startsAt, err := time.Parse(time.RFC3339, window.StartsAt)
		if err != nil {
			continue
		}
		endsAt, err := time.Parse(time.RFC3339, window.EndsAt)
		if err != nil {
			continue
		}
		if !startsAt.After(now) && !endsAt.Before(now) {
			active = append(active, window)
		}
	}

	sort.Slice(active, func(i, j int) bool {
		return active[i].Priority > active[j].Priority
	})

	if len(active) > 0 && len(active[0].Playlist) > 0 {
		return active[0].Playlist
	}
	return manifest.DefaultPlaylist
}

const (
	defaultImageDurationSeconds = 15
	defaultVideoDurationSeconds = 30
)

func (s *Server) chooseCachedRuntimeAsset(manifest *remote.DeviceManifest, now time.Time) (*kioskRuntimeAsset, string) {
	playlist := chooseActivePlaylistAt(manifest, now)
	if len(playlist) == 0 {
		return nil, "empty-playlist"
	}

	item, err := chooseCurrentAsset(playlist, runtimeAnchor(manifest, now), now)
	if err != nil {
		if errors.Is(err, errEmptyPlaylist) {
			return nil, "empty-playlist"
		}
		return nil, "invalid-playlist"
	}

	if item.AssetType != "video" && item.AssetType != "image" {
		return nil, "unsupported-asset-type"
	}
	if !strings.HasPrefix(item.URL, "/assets/") {
		return nil, "non-local-asset"
	}

	localPath := filepath.Join(s.config.StorageRoot, strings.TrimPrefix(item.URL, "/assets/"))
	info, err := os.Stat(localPath)
	if err != nil || info.IsDir() {
		return nil, "missing-cached-asset"
	}

	return &kioskRuntimeAsset{
		AssetID:         item.AssetID,
		AssetType:       item.AssetType,
		Title:           item.Title,
		LocalPath:       localPath,
		DurationSeconds: runtimeDurationSeconds(item),
	}, "cached-local-asset"
}

var errEmptyPlaylist = errors.New("empty playlist")

func chooseCurrentAsset(playlist []remote.ManifestPlaylistItem, anchor time.Time, now time.Time) (remote.ManifestPlaylistItem, error) {
	if len(playlist) == 0 {
		return remote.ManifestPlaylistItem{}, errEmptyPlaylist
	}
	if !anchor.Before(now) {
		return playlist[0], nil
	}

	totalDuration := 0
	for _, item := range playlist {
		totalDuration += runtimeDurationSeconds(item)
	}
	if totalDuration <= 0 {
		return playlist[0], nil
	}

	elapsed := int(now.Sub(anchor).Seconds())
	if elapsed < 0 {
		elapsed = 0
	}
	offset := elapsed % totalDuration
	for _, item := range playlist {
		duration := runtimeDurationSeconds(item)
		if offset < duration {
			return item, nil
		}
		offset -= duration
	}

	return playlist[len(playlist)-1], nil
}

func runtimeAnchor(manifest *remote.DeviceManifest, now time.Time) time.Time {
	if manifest != nil && manifest.GeneratedAt != "" {
		if parsed, err := time.Parse(time.RFC3339, manifest.GeneratedAt); err == nil {
			return parsed
		}
	}
	return now.Truncate(24 * time.Hour)
}

func runtimeDurationSeconds(item remote.ManifestPlaylistItem) int {
	if item.DurationSeconds > 0 {
		return item.DurationSeconds
	}
	if item.AssetType == "image" {
		return defaultImageDurationSeconds
	}
	return defaultVideoDurationSeconds
}
