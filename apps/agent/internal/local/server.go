package local

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

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
	mux.HandleFunc("/local/kiosk/runtime", s.handleKioskRuntime)
	mux.HandleFunc("/local/wifi/status", s.handleWiFiStatus)
	mux.HandleFunc("/local/wifi/configure", s.handleWiFiConfigure)
	mux.HandleFunc("/assets/", s.handleAsset)
	mux.HandleFunc("/", s.handlePlayer)
	return mux
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
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

	w.Header().Set("Content-Type", "application/json")
	_, _ = file.WriteTo(w)
}

func (s *Server) handleStatus(w http.ResponseWriter, _ *http.Request) {
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
