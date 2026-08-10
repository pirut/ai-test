package local

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/jrbussard/showroom-signage/apps/agent/internal/config"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/state"
)

type Server struct {
	config config.Config
	store  *state.Store
}

func NewServer(cfg config.Config, store *state.Store) *Server {
	return &Server{config: cfg, store: store}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.handleHealth)
	mux.HandleFunc("/local/manifest", s.handleManifest)
	mux.HandleFunc("/local/status", s.handleStatus)
	mux.HandleFunc("/local/playback", s.handlePlayback)
	mux.HandleFunc("/local/kiosk/runtime", s.handleKioskRuntime)
	mux.HandleFunc("/local/wifi/status", s.handleWiFiStatus)
	mux.HandleFunc("/local/wifi/configure", s.handleWiFiConfigure)
	mux.HandleFunc("/assets/", s.handleAsset)
	mux.HandleFunc("/", s.handlePlayer)
	return mux
}

func (s *Server) handlePlayback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var payload struct {
		AssetID    string `json:"assetId"`
		PlaylistID string `json:"playlistId"`
		State      string `json:"state"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&payload); err != nil {
		http.Error(w, "invalid playback status", http.StatusBadRequest)
		return
	}
	if err := s.store.Update(func(next *state.DeviceState) {
		next.CurrentAssetID = strings.TrimSpace(payload.AssetID)
		next.CurrentPlaylistID = strings.TrimSpace(payload.PlaylistID)
		next.PlayerState = strings.TrimSpace(payload.State)
		next.LastPlayerHeartbeatAt = time.Now().UTC().Format(time.RFC3339)
	}); err != nil {
		http.Error(w, "unable to persist playback status", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	current := s.store.Snapshot()
	if r.URL.Query().Get("deep") == "1" && current.Credential != "" {
		heartbeatAt, err := time.Parse(time.RFC3339, current.LastPlayerHeartbeatAt)
		if err != nil || time.Since(heartbeatAt) > s.config.PlayerStaleAfter {
			http.Error(w, "player heartbeat is stale", http.StatusServiceUnavailable)
			return
		}
	}
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status": "ok",
	})
}

func (s *Server) handleManifest(w http.ResponseWriter, _ *http.Request) {
	path := filepath.Join(s.config.StateRoot, "manifest.json")
	file, err := os.Open(path)
	if err != nil {
		http.Error(w, "manifest not found", http.StatusNotFound)
		return
	}
	defer file.Close()

	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Content-Type", "application/json")
	_, _ = file.WriteTo(w)
}

func (s *Server) handleStatus(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(s.store.PlayerStatus())
}

func (s *Server) handleAsset(w http.ResponseWriter, r *http.Request) {
	assetPath := strings.TrimPrefix(r.URL.Path, "/assets/")
	assetPath = strings.TrimPrefix(assetPath, "/")
	if assetPath == "" {
		http.NotFound(w, r)
		return
	}
	assetPath = strings.TrimPrefix(filepath.Clean("/"+assetPath), "/")

	for _, root := range []string{
		filepath.Join(s.config.PlayerDistPath, "assets"),
		s.config.StorageRoot,
	} {
		path := filepath.Join(root, assetPath)
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			http.ServeFile(w, r, path)
			return
		}
	}

	http.NotFound(w, r)
}

func (s *Server) handlePlayer(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	if path == "/" || path == "/player" || path == "/player/" {
		http.ServeFile(w, r, filepath.Join(s.config.PlayerDistPath, "index.html"))
		return
	}

	http.FileServer(http.Dir(s.config.PlayerDistPath)).ServeHTTP(w, r)
}
