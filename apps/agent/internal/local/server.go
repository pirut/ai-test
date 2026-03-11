package local

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/jrbussard/showroom-signage/apps/agent/internal/config"
)

type Server struct {
	config config.Config
}

func NewServer(cfg config.Config) *Server {
	return &Server{config: cfg}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.handleHealth)
	mux.HandleFunc("/local/manifest", s.handleManifest)
	mux.Handle("/", http.FileServer(http.Dir(s.config.PlayerDistPath)))
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
	_, _ = io.Copy(w, file)
}
