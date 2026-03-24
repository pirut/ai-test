package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/jrbussard/showroom-signage/apps/agent/internal/config"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/local"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/remote"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/state"
)

const screenshotPath = "/tmp/showroom-screenshot.jpg"
const credentialRefreshWindow = time.Hour
const youtubeDownloadTimeout = 45 * time.Second

type Service struct {
	config config.Config
	client *remote.Client
	store  *state.Store
	start  time.Time
}

func New(cfg config.Config) (*Service, error) {
	if err := os.MkdirAll(cfg.StorageRoot, 0o755); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(cfg.StateRoot, 0o755); err != nil {
		return nil, err
	}

	store, err := state.Open(cfg.StateRoot)
	if err != nil {
		return nil, err
	}

	return &Service{
		config: cfg,
		client: remote.New(cfg.APIBaseURL),
		store:  store,
		start:  time.Now(),
	}, nil
}

func (s *Service) Run(ctx context.Context) error {
	server := local.NewServer(s.config, s.store)
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

	go s.runPollLoop(ctx)
	go s.runHeartbeatLoop(ctx)
	go s.runScreenshotLoop(ctx)

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return httpServer.Shutdown(shutdownCtx)
}

func (s *Service) runPollLoop(ctx context.Context) {
	if err := s.poll(ctx); err != nil {
		log.Printf("initial poll failed: %v", err)
	}

	ticker := time.NewTicker(s.config.PollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := s.poll(ctx); err != nil {
				log.Printf("poll failed: %v", err)
			}
		}
	}
}

func (s *Service) runHeartbeatLoop(ctx context.Context) {
	ticker := time.NewTicker(s.config.HeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			snapshot := s.store.Snapshot()
			if err := s.maybeSendHeartbeat(ctx, snapshot); err != nil {
				s.recordError(err)
				log.Printf("heartbeat failed: %v", err)
			}
		}
	}
}

func (s *Service) runScreenshotLoop(ctx context.Context) {
	ticker := time.NewTicker(s.config.ScreenshotInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			snapshot := s.store.Snapshot()
			if err := s.maybeUploadScreenshot(ctx, snapshot, false); err != nil {
				s.recordError(err)
				log.Printf("screenshot upload failed: %v", err)
			}
		}
	}
}

func (s *Service) poll(ctx context.Context) error {
	current := s.store.Snapshot()
	if current.Credential == "" {
		if err := s.ensureClaimFlow(ctx, current); err != nil {
			s.recordError(err)
			return err
		}
		return nil
	}

	if err := s.ensureCredentialFresh(ctx, current); err != nil {
		s.recordError(err)
		return err
	}
	current = s.store.Snapshot()

	if err := s.syncManifest(ctx, current.Credential); err != nil {
		s.recordError(err)
	} else {
		_ = s.store.Update(func(next *state.DeviceState) {
			next.LastError = ""
		})
	}

	if err := s.processCommands(ctx, current.Credential); err != nil {
		s.recordError(err)
	}

	return nil
}

func (s *Service) ensureClaimFlow(ctx context.Context, current state.DeviceState) error {
	if current.DeviceSessionID == "" || current.ClaimToken == "" {
		registration, err := s.client.RegisterTemporary(ctx)
		if err != nil {
			return err
		}

		return s.store.Update(func(next *state.DeviceState) {
			next.DeviceSessionID = registration.DeviceSessionID
			next.ClaimCode = registration.ClaimCode
			next.ClaimToken = registration.ClaimToken
			next.LastError = ""
		})
	}

	status, err := s.client.ClaimStatus(ctx, current.DeviceSessionID, current.ClaimToken)
	if err != nil {
		return err
	}
	if !status.Claimed {
		return nil
	}

	if err := s.store.Update(func(next *state.DeviceState) {
		next.DeviceID = status.DeviceID
		next.Credential = status.Credential
		next.CredentialExpiresAt = expiresAtRFC3339(status.ExpiresInSeconds)
		next.ClaimCode = ""
		next.ClaimToken = ""
		next.LastError = ""
	}); err != nil {
		return err
	}

	return s.syncManifest(ctx, status.Credential)
}

func (s *Service) ensureCredentialFresh(ctx context.Context, current state.DeviceState) error {
	if current.Credential == "" {
		return nil
	}

	expiresAt, needsRefresh := credentialNeedsRefresh(current.CredentialExpiresAt)
	if !needsRefresh {
		_ = expiresAt
		return nil
	}

	refreshed, err := s.client.RefreshAuth(ctx, current.Credential)
	if err != nil {
		return err
	}

	return s.store.Update(func(next *state.DeviceState) {
		next.DeviceID = refreshed.DeviceID
		next.Credential = refreshed.Credential
		next.CredentialExpiresAt = expiresAtRFC3339(refreshed.ExpiresInSeconds)
	})
}

func (s *Service) syncManifest(ctx context.Context, credential string) error {
	manifest, err := s.client.FetchManifest(ctx, credential)
	if err != nil {
		return err
	}

	cachedAssets, localManifest, err := s.cacheManifest(ctx, manifest)
	if err != nil {
		return err
	}

	manifestPath := filepath.Join(s.config.StateRoot, "manifest.json")
	if err := writeJSONFile(manifestPath, localManifest); err != nil {
		return err
	}

	return s.store.Update(func(next *state.DeviceState) {
		next.DeviceID = manifest.DeviceID
		next.ManifestVersion = manifest.ManifestVersion
		next.LastSyncAt = time.Now().UTC().Format(time.RFC3339)
		next.CachedAssets = cachedAssets
	})
}

func (s *Service) cacheManifest(ctx context.Context, manifest *remote.DeviceManifest) (map[string]state.AssetRecord, *remote.DeviceManifest, error) {
	current := s.store.Snapshot()
	cachedAssets := map[string]state.AssetRecord{}
	for assetID, record := range current.CachedAssets {
		cachedAssets[assetID] = record
	}

	localManifest := *manifest
	localManifest.DefaultPlaylist = clonePlaylist(manifest.DefaultPlaylist)
	localManifest.ScheduleWindows = make([]remote.ScheduleWindow, 0, len(manifest.ScheduleWindows))

	rewrite := func(item remote.ManifestPlaylistItem) (remote.ManifestPlaylistItem, error) {
		fileName := remote.AssetFileName(item)
		destPath := filepath.Join(s.config.StorageRoot, fileName)
		expectedChecksum := manifest.AssetChecksums[item.AssetID]
		existing, ok := cachedAssets[item.AssetID]
		if !ok || existing.Checksum != expectedChecksum || !fileExists(filepath.Join(s.config.StorageRoot, existing.FileName)) {
			var err error
			if item.SourceType == "youtube" || remote.IsYouTubeURL(item.URL) {
				err = s.downloadYouTubeVideo(ctx, item.URL, destPath)
			} else {
				err = s.client.DownloadFile(ctx, item.URL, destPath)
			}
			if err != nil {
				return item, err
			}
			cachedAssets[item.AssetID] = state.AssetRecord{
				FileName: fileName,
				Checksum: expectedChecksum,
			}
		} else {
			fileName = existing.FileName
		}

		item.URL = "/assets/" + fileName
		if item.AssetType == "video" {
			if duration, err := probeMediaDuration(ctx, destPath); err == nil && duration > 0 {
				item.DurationSeconds = duration
			}
		}
		return item, nil
	}

	for index, item := range localManifest.DefaultPlaylist {
		nextItem, err := rewrite(item)
		if err != nil {
			return nil, nil, err
		}
		localManifest.DefaultPlaylist[index] = nextItem
	}

	for _, window := range manifest.ScheduleWindows {
		nextWindow := window
		nextWindow.Playlist = clonePlaylist(window.Playlist)
		for index, item := range nextWindow.Playlist {
			nextItem, err := rewrite(item)
			if err != nil {
				return nil, nil, err
			}
			nextWindow.Playlist[index] = nextItem
		}
		localManifest.ScheduleWindows = append(localManifest.ScheduleWindows, nextWindow)
	}

	return cachedAssets, &localManifest, nil
}

func (s *Service) downloadYouTubeVideo(ctx context.Context, sourceURL string, destPath string) error {
	if strings.TrimSpace(sourceURL) == "" {
		return fmt.Errorf("youtube source url is required")
	}

	if _, err := exec.LookPath(s.config.YouTubeDLBinary); err != nil {
		return fmt.Errorf("yt-dlp binary %q not found in PATH", s.config.YouTubeDLBinary)
	}

	if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
		return err
	}

	destBase := strings.TrimSuffix(destPath, filepath.Ext(destPath))
	outputTemplate := destBase + ".%(ext)s"
	downloadCtx, cancel := context.WithTimeout(ctx, youtubeDownloadTimeout)
	cmd := exec.CommandContext(
		downloadCtx,
		s.config.YouTubeDLBinary,
		"--no-progress",
		"--no-part",
		"--no-playlist",
		"--force-overwrites",
		"--socket-timeout",
		"15",
		"--retries",
		"1",
		"--fragment-retries",
		"1",
		"--file-access-retries",
		"1",
		"--extractor-retries",
		"1",
		"--format",
		s.config.YouTubeFormat,
		"--merge-output-format",
		"mp4",
		"--remux-video",
		"mp4",
		"--output",
		outputTemplate,
		sourceURL,
	)
	defer cancel()

	output, err := cmd.CombinedOutput()
	if err != nil {
		if downloadCtx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("yt-dlp download timed out after %s: %s", youtubeDownloadTimeout, strings.TrimSpace(string(output)))
		}
		return fmt.Errorf("yt-dlp download failed: %s", strings.TrimSpace(string(output)))
	}

	matches, err := filepath.Glob(destBase + ".*")
	if err != nil {
		return err
	}

	for _, match := range matches {
		if match == destPath {
			return nil
		}
	}

	for _, match := range matches {
		if filepath.Ext(match) != ".mp4" {
			continue
		}
		if err := os.Rename(match, destPath); err != nil {
			return err
		}
		return nil
	}

	return fmt.Errorf("yt-dlp completed without producing %s", filepath.Base(destPath))
}

func (s *Service) processCommands(ctx context.Context, credential string) error {
	commands, err := s.client.FetchCommands(ctx, credential)
	if err != nil {
		return err
	}

	for _, command := range commands {
		command := command
		if err := s.executeCommand(ctx, credential, command); err != nil {
			log.Printf("command %s failed: %v", command.CommandType, err)
		}
	}

	return nil
}

func (s *Service) executeCommand(ctx context.Context, credential string, command remote.DeviceCommand) error {
	var err error
	switch command.CommandType {
	case "sync_now":
		err = s.syncManifest(ctx, credential)
	case "take_screenshot":
		err = s.maybeUploadScreenshot(ctx, s.store.Snapshot(), true)
	case "restart_player":
		err = s.runShell(ctx, s.config.RestartPlayerCommand)
	case "reboot_device":
		err = s.runShell(ctx, s.config.RebootCommand)
	case "blank_screen":
		err = s.runShell(ctx, s.config.BlankScreenCommand)
	case "unblank_screen":
		err = s.runShell(ctx, s.config.UnblankScreenCommand)
	case "update_release":
		err = s.applyReleaseUpdate(ctx, command.ID, command.Payload)
	default:
		err = fmt.Errorf("unsupported command: %s", command.CommandType)
	}

	payload := map[string]interface{}{
		"commandId": command.ID,
		"status":    "succeeded",
	}
	if err != nil {
		payload["status"] = "failed"
		payload["message"] = err.Error()
	}
	payload["completedAt"] = time.Now().UTC().Format(time.RFC3339)

	if postErr := s.client.PostCommandResult(ctx, credential, payload); postErr != nil {
		return fmt.Errorf("command result post failed: %w", postErr)
	}

	return err
}

func (s *Service) maybeSendHeartbeat(ctx context.Context, current state.DeviceState) error {
	if current.Credential == "" || current.DeviceID == "" {
		return nil
	}

	if current.LastHeartbeatAt != "" {
		lastHeartbeatAt, err := time.Parse(time.RFC3339, current.LastHeartbeatAt)
		if err == nil && time.Since(lastHeartbeatAt) < s.config.HeartbeatInterval {
			return nil
		}
	}

	freeBytes, totalBytes := diskUsage(s.config.StorageRoot)
	agentVersion := current.AgentVersion
	if agentVersion == "" {
		agentVersion = "agent-v1"
	}
	playerVersion := current.PlayerVersion
	if playerVersion == "" {
		playerVersion = "player-v1"
	}
	payload := map[string]interface{}{
		"deviceId":          current.DeviceID,
		"manifestVersion":   current.ManifestVersion,
		"appVersion":        playerVersion,
		"agentVersion":      agentVersion,
		"uptimeSeconds":     int(time.Since(s.start).Seconds()),
		"storageFreeBytes":  freeBytes,
		"storageTotalBytes": totalBytes,
		"currentAssetId":    current.CurrentAssetID,
		"currentPlaylistId": current.CurrentPlaylistID,
		"lastSeenAt":        time.Now().UTC().Format(time.RFC3339),
	}

	if err := s.client.PostHeartbeat(ctx, current.Credential, payload); err != nil {
		return err
	}

	return s.store.Update(func(next *state.DeviceState) {
		next.LastHeartbeatAt = time.Now().UTC().Format(time.RFC3339)
	})
}

func (s *Service) maybeUploadScreenshot(ctx context.Context, current state.DeviceState, force bool) error {
	if current.Credential == "" || current.DeviceID == "" {
		return nil
	}

	if !force && current.LastScreenshotAt != "" {
		lastScreenshotAt, err := time.Parse(time.RFC3339, current.LastScreenshotAt)
		if err == nil && time.Since(lastScreenshotAt) < s.config.ScreenshotInterval {
			return nil
		}
	}

	if err := s.captureScreenshot(ctx); err != nil {
		return err
	}

	capturedAt := time.Now().UTC().Format(time.RFC3339)
	if err := s.client.UploadScreenshot(ctx, current.Credential, current.DeviceID, capturedAt, screenshotPath); err != nil {
		return err
	}

	return s.store.Update(func(next *state.DeviceState) {
		next.LastScreenshotAt = capturedAt
	})
}

func (s *Service) captureScreenshot(ctx context.Context) error {
	return s.runShell(ctx, s.config.ScreenshotCommand)
}

func (s *Service) runShell(ctx context.Context, command string) error {
	if strings.TrimSpace(command) == "" {
		return nil
	}

	cmd := exec.CommandContext(ctx, "sh", "-lc", command)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s: %s", command, strings.TrimSpace(string(output)))
	}
	return nil
}

func (s *Service) recordError(err error) {
	if err == nil {
		return
	}

	_ = s.store.Update(func(next *state.DeviceState) {
		next.LastError = err.Error()
	})
}

func clonePlaylist(items []remote.ManifestPlaylistItem) []remote.ManifestPlaylistItem {
	copyItems := make([]remote.ManifestPlaylistItem, len(items))
	copy(copyItems, items)
	return copyItems
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func probeMediaDuration(ctx context.Context, path string) (int, error) {
	if _, err := exec.LookPath("ffprobe"); err != nil {
		return 0, err
	}

	probeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(
		probeCtx,
		"ffprobe",
		"-v",
		"error",
		"-show_entries",
		"format=duration",
		"-of",
		"default=noprint_wrappers=1:nokey=1",
		path,
	)

	output, err := cmd.Output()
	if err != nil {
		return 0, err
	}

	value := strings.TrimSpace(string(output))
	if value == "" {
		return 0, fmt.Errorf("ffprobe returned empty duration")
	}

	seconds, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return 0, err
	}
	if seconds <= 0 {
		return 0, fmt.Errorf("invalid duration %q", value)
	}

	return int(seconds + 0.5), nil
}

func credentialNeedsRefresh(raw string) (time.Time, bool) {
	if strings.TrimSpace(raw) == "" {
		return time.Time{}, true
	}

	expiresAt, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return time.Time{}, true
	}

	return expiresAt, time.Until(expiresAt) <= credentialRefreshWindow
}

func expiresAtRFC3339(expiresInSeconds int) string {
	if expiresInSeconds <= 0 {
		return ""
	}

	return time.Now().UTC().Add(time.Duration(expiresInSeconds) * time.Second).Format(time.RFC3339)
}

func writeJSONFile(path string, value interface{}) error {
	payload, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}

	tempPath := path + ".tmp"
	if err := os.WriteFile(tempPath, payload, 0o644); err != nil {
		return err
	}

	return os.Rename(tempPath, path)
}

func diskUsage(path string) (freeBytes int64, totalBytes int64) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0, 0
	}

	freeBytes = int64(stat.Bavail) * int64(stat.Bsize)
	totalBytes = int64(stat.Blocks) * int64(stat.Bsize)
	return freeBytes, totalBytes
}
