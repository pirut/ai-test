package agent

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/jrbussard/showroom-signage/apps/agent/internal/config"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/local"
)

type Service struct {
	config config.Config
}

func New(cfg config.Config) *Service {
	return &Service{config: cfg}
}

func (s *Service) Run(ctx context.Context) error {
	server := local.NewServer(s.config)
	httpServer := &http.Server{
		Addr:    s.config.ListenAddr,
		Handler: server.Routes(),
	}

	go func() {
		log.Printf("showroom-agent listening on %s", s.config.ListenAddr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("http server error: %v", err)
		}
	}()

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			return httpServer.Shutdown(shutdownCtx)
		case <-ticker.C:
			log.Printf("heartbeat tick to %s", s.config.APIBaseURL)
		}
	}
}

