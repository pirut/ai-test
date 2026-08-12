package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	APIBaseURL              string
	StorageRoot             string
	StateRoot               string
	PlayerDistPath          string
	ListenAddr              string
	PollInterval            time.Duration
	HeartbeatInterval       time.Duration
	ScreenshotInterval      time.Duration
	YouTubeDownloadTimeout  time.Duration
	ScreenshotCommand       string
	YouTubeDLBinary         string
	YouTubeFormat           string
	YouTubeDLManagedURL     string
	YouTubeDLManagedSHA256  string
	YouTubeDLManagedVersion string
	RestartPlayerCommand    string
	RestartAgentCommand     string
	RebootCommand           string
	BlankScreenCommand      string
	UnblankScreenCommand    string
	ReleasePublicKey        string
	HardwareProfile         string
	CacheMinFreeBytes       int64
	CacheMaxBytes           int64
	PlayerHealthInterval    time.Duration
	PlayerStaleAfter        time.Duration
}

func getint64(key string, fallback int64) int64 {
	value := getenv(key, "")
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed < 0 {
		return fallback
	}
	return parsed
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
		APIBaseURL:              getenv("SHOWROOM_API_BASE_URL", "http://localhost:3000"),
		StorageRoot:             getenv("SHOWROOM_STORAGE_ROOT", "/var/lib/showroom/cache"),
		StateRoot:               getenv("SHOWROOM_STATE_ROOT", "/var/lib/showroom/state"),
		PlayerDistPath:          getenv("SHOWROOM_PLAYER_DIST", "/opt/showroom/player"),
		ListenAddr:              getenv("SHOWROOM_LISTEN_ADDR", "127.0.0.1:4173"),
		PollInterval:            getduration("SHOWROOM_POLL_INTERVAL", "15s"),
		HeartbeatInterval:       getduration("SHOWROOM_HEARTBEAT_INTERVAL", "30s"),
		ScreenshotInterval:      getduration("SHOWROOM_SCREENSHOT_INTERVAL", "15m"),
		YouTubeDownloadTimeout:  getduration("SHOWROOM_YOUTUBE_DOWNLOAD_TIMEOUT", "15m"),
		ScreenshotCommand:       getenv("SHOWROOM_SCREENSHOT_COMMAND", "scrot -q 85 -o /tmp/showroom-screenshot.jpg"),
		YouTubeDLBinary:         getenv("SHOWROOM_YTDLP_BINARY", "yt-dlp"),
		YouTubeFormat:           getenv("SHOWROOM_YTDLP_FORMAT", "bestvideo*[height<=2160]+bestaudio/best[height<=2160]/best"),
		YouTubeDLManagedURL:     getenv("SHOWROOM_YTDLP_MANAGED_URL", "https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/yt-dlp"),
		YouTubeDLManagedSHA256:  getenv("SHOWROOM_YTDLP_MANAGED_SHA256", "495be29ff4d9d4e9be7eabdfef225221e5d5282e77f2f505abc6dca80349f3fd"),
		YouTubeDLManagedVersion: getenv("SHOWROOM_YTDLP_MANAGED_VERSION", "2026.07.04"),
		RestartPlayerCommand:    getenv("SHOWROOM_RESTART_PLAYER_COMMAND", "systemctl restart showroom-kiosk.service"),
		RestartAgentCommand:     getenv("SHOWROOM_RESTART_AGENT_COMMAND", "systemctl restart showroom-agent.service"),
		RebootCommand:           getenv("SHOWROOM_REBOOT_COMMAND", "shutdown -r now"),
		BlankScreenCommand:      getenv("SHOWROOM_BLANK_COMMAND", "vcgencmd display_power 0"),
		UnblankScreenCommand:    getenv("SHOWROOM_UNBLANK_COMMAND", "vcgencmd display_power 1"),
		ReleasePublicKey:        getenv("SHOWROOM_RELEASE_PUBLIC_KEY", ""),
		HardwareProfile:         getenv("SHOWROOM_HARDWARE_PROFILE", "rpi5-standard"),
		CacheMinFreeBytes:       getint64("SHOWROOM_CACHE_MIN_FREE_BYTES", 1<<30),
		CacheMaxBytes:           getint64("SHOWROOM_CACHE_MAX_BYTES", 8<<30),
		PlayerHealthInterval:    getduration("SHOWROOM_PLAYER_HEALTH_INTERVAL", "15s"),
		PlayerStaleAfter:        getduration("SHOWROOM_PLAYER_STALE_AFTER", "45s"),
	}
}
