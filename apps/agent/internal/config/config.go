package config

import "os"

type Config struct {
	APIBaseURL     string
	StorageRoot    string
	StateRoot      string
	PlayerDistPath string
	ListenAddr     string
	PollInterval   string
}

func getenv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func Load() Config {
	return Config{
		APIBaseURL:     getenv("SHOWROOM_API_BASE_URL", "http://localhost:3000"),
		StorageRoot:    getenv("SHOWROOM_STORAGE_ROOT", "/var/lib/showroom/cache"),
		StateRoot:      getenv("SHOWROOM_STATE_ROOT", "/var/lib/showroom/state"),
		PlayerDistPath: getenv("SHOWROOM_PLAYER_DIST", "/opt/showroom/player"),
		ListenAddr:     getenv("SHOWROOM_LISTEN_ADDR", "127.0.0.1:4173"),
		PollInterval:   getenv("SHOWROOM_POLL_INTERVAL", "15s"),
	}
}

