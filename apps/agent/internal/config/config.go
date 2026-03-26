package config

import (
	"os"
	"time"
)

type Config struct {
	APIBaseURL           string
	StorageRoot          string
	StateRoot            string
	PlayerDistPath       string
	ListenAddr           string
	PollInterval         time.Duration
	HeartbeatInterval    time.Duration
	ScreenshotInterval   time.Duration
	ScreenshotCommand    string
	YouTubeDLBinary      string
	YouTubeFormat        string
	RestartPlayerCommand string
	RestartAgentCommand  string
	RebootCommand        string
	BlankScreenCommand   string
	UnblankScreenCommand string
}

func getenv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func getduration(key string, fallback string) time.Duration {
	value := getenv(key, fallback)
	duration, err := time.ParseDuration(value)
	if err != nil {
		parsedFallback, _ := time.ParseDuration(fallback)
		return parsedFallback
	}
	return duration
}

func Load() Config {
	return Config{
		APIBaseURL:           getenv("SHOWROOM_API_BASE_URL", "http://localhost:3000"),
		StorageRoot:          getenv("SHOWROOM_STORAGE_ROOT", "/var/lib/showroom/cache"),
		StateRoot:            getenv("SHOWROOM_STATE_ROOT", "/var/lib/showroom/state"),
		PlayerDistPath:       getenv("SHOWROOM_PLAYER_DIST", "/opt/showroom/player"),
		ListenAddr:           getenv("SHOWROOM_LISTEN_ADDR", "127.0.0.1:4173"),
		PollInterval:         getduration("SHOWROOM_POLL_INTERVAL", "15s"),
		HeartbeatInterval:    getduration("SHOWROOM_HEARTBEAT_INTERVAL", "30s"),
		ScreenshotInterval:   getduration("SHOWROOM_SCREENSHOT_INTERVAL", "15m"),
		ScreenshotCommand:    getenv("SHOWROOM_SCREENSHOT_COMMAND", "scrot -q 85 -o /tmp/showroom-screenshot.jpg"),
		YouTubeDLBinary:      getenv("SHOWROOM_YTDLP_BINARY", "yt-dlp"),
		YouTubeFormat:        getenv("SHOWROOM_YTDLP_FORMAT", "bestvideo*[height<=2160]+bestaudio/best[height<=2160]/best"),
		RestartPlayerCommand: getenv("SHOWROOM_RESTART_PLAYER_COMMAND", "systemctl restart showroom-kiosk.service"),
		RestartAgentCommand:  getenv("SHOWROOM_RESTART_AGENT_COMMAND", "systemctl restart showroom-agent.service"),
		RebootCommand:        getenv("SHOWROOM_REBOOT_COMMAND", "shutdown -r now"),
		BlankScreenCommand:   getenv("SHOWROOM_BLANK_COMMAND", "vcgencmd display_power 0"),
		UnblankScreenCommand: getenv("SHOWROOM_UNBLANK_COMMAND", "vcgencmd display_power 1"),
	}
}
