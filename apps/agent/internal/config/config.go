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
	YouTubeExtractorArgs string
	YouTubeCookieFile    string
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
		YouTubeFormat:        getenv("SHOWROOM_YTDLP_FORMAT", "best[protocol=https][vcodec!=none][acodec!=none][height<=2160]/best[ext=mp4][vcodec!=none][acodec!=none][height<=2160]/bestvideo*[protocol=https][height<=2160]+bestaudio[protocol=https]/bestvideo*[height<=2160]+bestaudio/best[height<=2160]/best"),
		YouTubeExtractorArgs: getenv("SHOWROOM_YTDLP_EXTRACTOR_ARGS", "youtube:player_client=tv,mweb,ios,android;formats=incomplete"),
		YouTubeCookieFile:    getenv("SHOWROOM_YTDLP_COOKIE_FILE", "/etc/showroom-agent/youtube.cookies.txt"),
		RestartPlayerCommand: getenv("SHOWROOM_RESTART_PLAYER_COMMAND", "systemctl restart showroom-kiosk.service"),
		RestartAgentCommand:  getenv("SHOWROOM_RESTART_AGENT_COMMAND", "systemctl restart showroom-agent.service"),
		RebootCommand:        getenv("SHOWROOM_REBOOT_COMMAND", "shutdown -r now"),
		BlankScreenCommand:   getenv("SHOWROOM_BLANK_COMMAND", "vcgencmd display_power 0"),
		UnblankScreenCommand: getenv("SHOWROOM_UNBLANK_COMMAND", "vcgencmd display_power 1"),
	}
}
