package main

import (
	"context"
	"log"
	"os/signal"
	"syscall"

	"github.com/jrbussard/showroom-signage/apps/agent/internal/agent"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/config"
)

func main() {
	cfg := config.Load()
	service, err := agent.New(cfg)
	if err != nil {
		log.Fatal(err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if err := service.Run(ctx); err != nil {
		log.Fatal(err)
	}
}
