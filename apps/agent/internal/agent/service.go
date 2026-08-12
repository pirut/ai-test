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
	"github.com/jrbussard/showroom-signage/apps/agent/internal/health"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/local"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/remote"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/state"
	"github.com/jrbussard/showroom-signage/apps/agent/internal/systemdnotify"
)

const screenshotPath = "/tmp/showroom-screenshot.jpg"
const credentialRefreshWindow = time.Hour
const initialPlayableAssetTarget = 2
const hydrationBatchSize = 1

func applianceDescriptor() map[string]interface{} {
	return map[string]interface{}{
		"generation":      "showroom-appliance-v2",
		"protocolVersion": 2,
		"capabilities": []string{
			"appliance_telemetry",
			"app_slot_rollback",
			"leased_commands",
			"network_rotation",
			"signed_releases",
			"staged_rollouts",
			"transactional_content",
		},
	}
}

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
	_ = store.Update(func(next *state.DeviceState) {
		releaseRoot := filepath.Clean(filepath.Join(cfg.StateRoot, "..", "releases"))
		if target, linkErr := os.Readlink(filepath.Join(releaseRoot, "agent", "current")); linkErr == nil {
			next.AgentVersion = filepath.Base(target)
		}
		if target, linkErr := os.Readlink(filepath.Join(releaseRoot, "player", "current")); linkErr == nil {
			next.PlayerVersion = filepath.Base(target)
		}
	})

	return &Service{
		config: cfg,
		client: remote.New(cfg.APIBaseURL),
		store:  store,
		start:  time.Now(),
	}, nil
}

func (s *Service) Run(ctx context.Context) error {
	_ = s.store.Update(func(next *state.DeviceState) { next.Health.AgentRestarts++ })
	kioskCompatibilityApplied, kioskCompatibilityErr := ensureKioskRuntimeCompatibility()
	if kioskCompatibilityErr != nil {
		log.Printf("kiosk runtime compatibility failed: %v", kioskCompatibilityErr)
	}
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
	go s.runHealthLoop(ctx)
	go s.runWatchdogLoop(ctx)
	_ = systemdnotify.Ready()
	if kioskCompatibilityApplied {
		go func() {
			time.Sleep(time.Second)
			_ = s.runShell(ctx, "systemctl reset-failed showroom-kiosk.service")
			if err := s.runShell(ctx, "systemctl restart showroom-kiosk.service"); err != nil {
				log.Printf("kiosk compatibility restart failed: %v", err)
			}
		}()
	}

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return httpServer.Shutdown(shutdownCtx)
}

func ensureKioskRuntimeCompatibility() (bool, error) {
	const sourcePath = "/usr/local/bin/showroom-start-kiosk"
	const notifyLine = "systemd-notify --ready --pid=\"$$\""
	const compatibilityPath = "/var/lib/showroom/tools/showroom-start-kiosk-compat"
	const dropInDirectory = "/run/systemd/system/showroom-kiosk.service.d"
	const dropInPath = dropInDirectory + "/10-showroom-readiness.conf"

	source, err := os.ReadFile(sourcePath)
	if err != nil {
		return false, nil
	}
	if !strings.Contains(string(source), notifyLine) {
		return false, nil
	}
	if err := os.MkdirAll(filepath.Dir(compatibilityPath), 0o755); err != nil {
		return false, err
	}
	compatibility := strings.ReplaceAll(string(source), notifyLine, ": # readiness is managed by systemd Type=simple")
	compatibility = applyKioskPlaylistCompatibility(compatibility)
	execStartOutput, _ := exec.Command("systemctl", "show", "showroom-kiosk.service", "--property=ExecStart", "--value").Output()
	existingCompatibility, _ := os.ReadFile(compatibilityPath)
	restartNeeded := !strings.Contains(string(execStartOutput), compatibilityPath) || string(existingCompatibility) != compatibility
	if err := os.WriteFile(compatibilityPath, []byte(compatibility), 0o755); err != nil {
		return false, err
	}
	if err := os.MkdirAll(dropInDirectory, 0o755); err != nil {
		return false, err
	}
	dropIn := "[Service]\nType=simple\nNotifyAccess=none\nExecStart=\nExecStart=" + compatibilityPath + "\n"
	if err := os.WriteFile(dropInPath, []byte(dropIn), 0o644); err != nil {
		return false, err
	}
	command := exec.Command("systemctl", "daemon-reload")
	if output, err := command.CombinedOutput(); err != nil {
		return false, fmt.Errorf("systemctl daemon-reload: %w: %s", err, strings.TrimSpace(string(output)))
	}
	log.Printf("installed runtime compatibility for legacy kiosk readiness handshake")
	return restartNeeded, nil
}

func applyKioskPlaylistCompatibility(script string) string {
	if !strings.Contains(script, "MPV_LOADED_PLAYLIST=") {
		script = strings.Replace(script,
			"MPV_ASSET_MAP=/tmp/showroom-mpv-assets.json\n",
			"MPV_ASSET_MAP=/tmp/showroom-mpv-assets.json\nMPV_LOADED_PLAYLIST=/tmp/showroom-mpv-loaded.m3u\n",
			1,
		)
	}
	script = strings.Replace(script,
		`    "playlist": playlist_paths,`,
		`    "playlistId": payload.get("playlistId", ""),`,
		1,
	)
	if !strings.Contains(script, "sync_mpv_playlist()") {
		const syncFunction = `sync_mpv_playlist() {
  [[ "${APP_MODE}" == "mpv" && -S "${MPV_SOCKET}" && -f "${MPV_LOADED_PLAYLIST}" ]] || return 0

  python3 - "${MPV_PLAYLIST_PATH:-/tmp/showroom-mpv-playlist.m3u}" "${MPV_LOADED_PLAYLIST}" "${MPV_SOCKET}" <<'PY'
import json
import os
import socket
import sys

def read_playlist(path):
    with open(path, "r", encoding="utf-8") as handle:
        return [line.strip() for line in handle if line.strip() and not line.startswith("#")]

desired = read_playlist(sys.argv[1])
loaded = read_playlist(sys.argv[2])
if desired[:len(loaded)] != loaded:
    raise SystemExit(2)

with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
    client.settimeout(2)
    client.connect(sys.argv[3])
    for path in desired[len(loaded):]:
        client.sendall((json.dumps({"command": ["loadfile", path, "append"]}) + "\n").encode("utf-8"))
        response = json.loads(client.recv(65536).decode("utf-8").splitlines()[0])
        if response.get("error") != "success":
            raise SystemExit(3)

with open(sys.argv[2] + ".next", "w", encoding="utf-8") as handle:
    handle.write("\n".join(desired) + ("\n" if desired else ""))
os.replace(sys.argv[2] + ".next", sys.argv[2])
PY
}

`
		script = strings.Replace(script, "launch_browser() {\n", syncFunction+"launch_browser() {\n", 1)
	}
	if !strings.Contains(script, "MPV_PLAYLIST_PATH=\"${playlist_path}\"") {
		script = strings.Replace(script,
			"  APP_MODE=\"mpv\"\n}",
			"  APP_MODE=\"mpv\"\n  MPV_PLAYLIST_PATH=\"${playlist_path}\"\n  tail -n +2 \"${playlist_path}\" > \"${MPV_LOADED_PLAYLIST}\"\n}",
			1,
		)
	}
	if !strings.Contains(script, "if ! sync_mpv_playlist; then") {
		const syncCall = `
  if [[ "${DESIRED_MODE}" == "mpv" && "${APP_MODE}" == "mpv" && "${DESIRED_TOKEN}" == "${APP_TOKEN}" && -n "${APP_PID}" ]]; then
    if ! sync_mpv_playlist; then
      APP_TOKEN=""
    fi
  fi
`
		script = strings.Replace(script,
			"\n  if [[ \"${DESIRED_MODE}\" != \"${APP_MODE}\"",
			syncCall+"\n  if [[ \"${DESIRED_MODE}\" != \"${APP_MODE}\"",
			1,
		)
	}
	return script
}

func (s *Service) runWatchdogLoop(ctx context.Context) {
	// Keep watchdog liveness independent from network calls, media downloads,
	// screenshot capture, and player recovery. Any of those can legitimately
	// outlive WatchdogSec on a slow connection.
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	_ = systemdnotify.Watchdog()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			_ = systemdnotify.Watchdog()
		}
	}
}

func (s *Service) runHealthLoop(ctx context.Context) {
	interval := s.config.PlayerHealthInterval
	if interval <= 0 {
		interval = 15 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	var lastRecovery time.Time

	collect := func() {
		current := s.store.Snapshot()
		snapshot := health.Collect(ctx, health.Input{
			HardwareProfile:       s.config.HardwareProfile,
			LastPlayerHeartbeatAt: current.LastPlayerHeartbeatAt,
			PlayerStaleAfter:      s.config.PlayerStaleAfter,
			AgentRestarts:         current.Health.AgentRestarts,
			PlayerRestarts:        current.Health.PlayerRestarts,
			RollbackCount:         current.Health.RollbackCount,
		})
		if current.LastPlayerHeartbeatAt == "" {
			// systemd owns first-start recovery. Do not create a restart storm
			// while a newly claimed screen is still downloading its first asset.
			snapshot.PlayerHealthy = true
		}
		if !snapshot.PlayerHealthy && current.Credential != "" && time.Since(lastRecovery) > 2*time.Minute {
			if err := s.runShell(ctx, s.config.RestartPlayerCommand); err != nil {
				log.Printf("player health recovery failed: %v", err)
			} else {
				snapshot.PlayerRestarts++
				lastRecovery = time.Now()
			}
		}
		_ = s.store.Update(func(next *state.DeviceState) { next.Health = snapshot })
	}

	collect()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			collect()
		}
	}
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
	send := func() {
		snapshot := s.store.Snapshot()
		if err := s.maybeSendHeartbeat(ctx, snapshot); err != nil {
			s.recordError(err)
			log.Printf("heartbeat failed: %v", err)
		}
	}
	send()

	ticker := time.NewTicker(s.config.HeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			send()
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
		if shouldExposeManifestSyncError(filepath.Join(s.config.StateRoot, "manifest.json")) {
			s.recordError(err)
		} else {
			log.Printf("background manifest hydration failed: %v", err)
			_ = s.store.Update(func(next *state.DeviceState) { next.LastError = "" })
		}
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

func shouldExposeManifestSyncError(manifestPath string) bool {
	return !fileExists(manifestPath)
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

	if err := s.syncManifest(ctx, status.Credential); err != nil {
		return err
	}
	return s.maybeSendHeartbeat(ctx, s.store.Snapshot())
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

	previousState := s.store.Snapshot()
	previousAssets := previousState.CachedAssets
	cachedAssets, localManifest, err := s.cacheManifest(ctx, manifest)
	if err != nil {
		return err
	}

	manifestPath := filepath.Join(s.config.StateRoot, "manifest.json")
	previousManifestPath := filepath.Join(s.config.StateRoot, "manifest.previous.json")
	if payload, err := os.ReadFile(manifestPath); err == nil {
		if err := os.WriteFile(previousManifestPath+".tmp", payload, 0o644); err == nil {
			_ = os.Rename(previousManifestPath+".tmp", previousManifestPath)
		}
	}
	if err := writeJSONFile(manifestPath, localManifest); err != nil {
		return err
	}

	if err := s.store.Update(func(next *state.DeviceState) {
		next.DeviceID = manifest.DeviceID
		next.ManifestVersion = manifest.ManifestVersion
		next.PreviousManifestVersion = previousState.ManifestVersion
		next.PreviousCachedAssets = previousAssets
		next.LastSyncAt = time.Now().UTC().Format(time.RFC3339)
		next.CachedAssets = cachedAssets
	}); err != nil {
		return err
	}

	retained := make(map[string]state.AssetRecord, len(cachedAssets)+len(previousAssets))
	for id, record := range cachedAssets {
		retained[id] = record
	}
	for id, record := range previousAssets {
		if _, ok := retained[id]; !ok {
			retained[id] = record
		}
	}
	s.pruneCachedAssets(previousState.PreviousCachedAssets, retained)
	return nil
}

func (s *Service) cacheManifest(ctx context.Context, manifest *remote.DeviceManifest) (map[string]state.AssetRecord, *remote.DeviceManifest, error) {
	stateSnapshot := s.store.Snapshot()
	availableAssets := make(map[string]state.AssetRecord, len(stateSnapshot.CachedAssets)+len(stateSnapshot.PreviousCachedAssets))
	for id, record := range stateSnapshot.PreviousCachedAssets {
		availableAssets[id] = record
	}
	for id, record := range stateSnapshot.CachedAssets {
		availableAssets[id] = record
	}
	cachedAssets := map[string]state.AssetRecord{}

	localManifest := *manifest
	localManifest.DefaultPlaylist = []remote.ManifestPlaylistItem{}
	localManifest.ScheduleWindows = make([]remote.ScheduleWindow, 0, len(manifest.ScheduleWindows))
	manifestPath := filepath.Join(s.config.StateRoot, "manifest.json")
	visiblePlayableAssets := localManifestPlaylistSize(manifestPath)
	progressPublished := visiblePlayableAssets >= initialPlayableAssetTarget
	publishProgress := func() error {
		if progressPublished || manifestPlaylistSize(&localManifest) < initialPlayableAssetTarget {
			return nil
		}
		if err := writeJSONFile(manifestPath, &localManifest); err != nil {
			return err
		}
		if err := s.store.Update(func(next *state.DeviceState) {
			next.DeviceID = manifest.DeviceID
			next.ManifestVersion = manifest.ManifestVersion
			next.LastSyncAt = time.Now().UTC().Format(time.RFC3339)
			next.CachedAssets = cloneAssetRecords(cachedAssets)
			next.LastError = ""
		}); err != nil {
			return err
		}
		progressPublished = true
		log.Printf("activated %d verified assets while the remaining playlist hydrates", manifestPlaylistSize(&localManifest))
		return nil
	}

	newDownloads := 0
	downloadLimit := manifestHydrationDownloadLimit(len(availableAssets))
	rewrite := func(item remote.ManifestPlaylistItem) (remote.ManifestPlaylistItem, bool, error) {
		fileName := remote.AssetFileName(item)
		destPath := filepath.Join(s.config.StorageRoot, fileName)
		expectedChecksum := manifest.AssetChecksums[item.AssetID]
		existing, ok := availableAssets[item.AssetID]
		cached := ok && existing.Checksum == expectedChecksum && fileExists(filepath.Join(s.config.StorageRoot, existing.FileName))
		if !cached {
			if newDownloads >= downloadLimit {
				return item, false, nil
			}
			if err := s.ensureCacheBudget(); err != nil {
				return item, false, err
			}
			var err error
			if item.SourceType == "youtube" || remote.IsYouTubeURL(item.URL) {
				err = s.downloadYouTubeVideo(ctx, item.URL, destPath)
			} else {
				err = s.client.DownloadFile(ctx, item.URL, destPath)
			}
			if err != nil {
				return item, false, err
			}
			newDownloads++
		} else {
			fileName = existing.FileName
			destPath = filepath.Join(s.config.StorageRoot, fileName)
		}

		if err := validateCachedAsset(destPath, expectedChecksum); err != nil {
			return item, false, fmt.Errorf("validate cached asset %s: %w", item.AssetID, err)
		}
		cachedAssets[item.AssetID] = state.AssetRecord{
			FileName: fileName,
			Checksum: expectedChecksum,
		}

		item.URL = "/assets/" + fileName
		if item.AssetType == "video" {
			duration, err := probeMediaDuration(ctx, destPath)
			if err != nil {
				return item, false, fmt.Errorf("probe video %s: %w", item.AssetID, err)
			}
			item.DurationSeconds = duration
		}
		return item, true, nil
	}

	failures := 0
	for _, item := range manifest.DefaultPlaylist {
		nextItem, ready, err := rewrite(item)
		if err != nil {
			failures++
			log.Printf("media asset %s was skipped during hydration: %v", item.AssetID, err)
			continue
		}
		if !ready {
			continue
		}
		localManifest.DefaultPlaylist = append(localManifest.DefaultPlaylist, nextItem)
		if err := publishProgress(); err != nil {
			return nil, nil, err
		}
	}

	for _, window := range manifest.ScheduleWindows {
		nextWindow := window
		nextWindow.Playlist = clonePlaylist(window.Playlist)
		nextWindow.Playlist = []remote.ManifestPlaylistItem{}
		for _, item := range window.Playlist {
			nextItem, ready, err := rewrite(item)
			if err != nil {
				failures++
				log.Printf("scheduled media asset %s was skipped during hydration: %v", item.AssetID, err)
				continue
			}
			if !ready {
				continue
			}
			nextWindow.Playlist = append(nextWindow.Playlist, nextItem)
			if err := publishProgress(); err != nil {
				return nil, nil, err
			}
		}
		if len(nextWindow.Playlist) > 0 {
			localManifest.ScheduleWindows = append(localManifest.ScheduleWindows, nextWindow)
		}
	}

	if manifestPlaylistSize(&localManifest) == 0 {
		return nil, nil, fmt.Errorf("no playable media assets were available after %d hydration failures", failures)
	}
	if failures > 0 {
		log.Printf("manifest hydration retained playback after skipping %d unavailable assets", failures)
	}
	return cachedAssets, &localManifest, nil
}

func manifestHydrationDownloadLimit(cachedAssetCount int) int {
	if cachedAssetCount < initialPlayableAssetTarget {
		return initialPlayableAssetTarget - cachedAssetCount
	}
	return hydrationBatchSize
}

func manifestPlaylistSize(manifest *remote.DeviceManifest) int {
	if manifest == nil {
		return 0
	}
	total := len(manifest.DefaultPlaylist)
	for _, window := range manifest.ScheduleWindows {
		total += len(window.Playlist)
	}
	return total
}

func localManifestPlaylistSize(path string) int {
	payload, err := os.ReadFile(path)
	if err != nil {
		return 0
	}
	var manifest remote.DeviceManifest
	if err := json.Unmarshal(payload, &manifest); err != nil {
		return 0
	}
	return manifestPlaylistSize(&manifest)
}

func (s *Service) ensureCacheBudget() error {
	freeBytes, _ := diskUsage(s.config.StorageRoot)
	if s.config.CacheMinFreeBytes > 0 && freeBytes < s.config.CacheMinFreeBytes {
		return fmt.Errorf("media cache has %d bytes free; %d required", freeBytes, s.config.CacheMinFreeBytes)
	}
	if s.config.CacheMaxBytes <= 0 {
		return nil
	}
	var used int64
	_ = filepath.WalkDir(s.config.StorageRoot, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return nil
		}
		if info, infoErr := entry.Info(); infoErr == nil {
			used += info.Size()
		}
		return nil
	})
	if used >= s.config.CacheMaxBytes {
		return fmt.Errorf("media cache reached its %d byte budget", s.config.CacheMaxBytes)
	}
	return nil
}

func (s *Service) downloadYouTubeVideo(ctx context.Context, sourceURL string, destPath string) error {
	if strings.TrimSpace(sourceURL) == "" {
		return fmt.Errorf("youtube source url is required")
	}

	youTubeDLBinary, err := s.resolveYouTubeDLBinary(ctx)
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
		return err
	}

	destBase := strings.TrimSuffix(destPath, filepath.Ext(destPath))
	outputTemplate := destBase + ".%(ext)s"
	downloadTimeout := s.config.YouTubeDownloadTimeout
	if downloadTimeout <= 0 {
		downloadTimeout = 15 * time.Minute
	}
	downloadCtx, cancel := context.WithTimeout(ctx, downloadTimeout)
	cmd := exec.CommandContext(
		downloadCtx,
		youTubeDLBinary,
		"--no-cache-dir",
		"--no-progress",
		"--no-part",
		"--no-playlist",
		"--force-overwrites",
		"--socket-timeout",
		"15",
		"--retries",
		"3",
		"--fragment-retries",
		"3",
		"--file-access-retries",
		"3",
		"--extractor-retries",
		"3",
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
	toolCacheRoot := filepath.Join(s.config.StorageRoot, ".tool-cache")
	cmd.Env = append(os.Environ(),
		"HOME="+toolCacheRoot,
		"XDG_CACHE_HOME="+toolCacheRoot,
		"PYTHONPYCACHEPREFIX="+filepath.Join(toolCacheRoot, "python"),
	)
	defer cancel()

	output, err := cmd.CombinedOutput()
	if err != nil {
		if downloadCtx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("yt-dlp download timed out after %s: %s", downloadTimeout, strings.TrimSpace(string(output)))
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

func (s *Service) resolveYouTubeDLBinary(ctx context.Context) (string, error) {
	version := strings.TrimSpace(s.config.YouTubeDLManagedVersion)
	url := strings.TrimSpace(s.config.YouTubeDLManagedURL)
	checksum := normalizeSHA256(s.config.YouTubeDLManagedSHA256)
	if version == "" || url == "" || checksum == "" {
		binary, err := exec.LookPath(s.config.YouTubeDLBinary)
		if err != nil {
			return "", fmt.Errorf("yt-dlp binary %q not found in PATH", s.config.YouTubeDLBinary)
		}
		return binary, nil
	}

	toolsRoot := filepath.Clean(filepath.Join(s.config.StateRoot, "..", "tools"))
	binaryPath := filepath.Join(toolsRoot, "yt-dlp-"+version)
	if verifySHA256(binaryPath, checksum) == nil {
		if err := os.Chmod(binaryPath, 0o755); err != nil {
			return "", err
		}
		return binaryPath, nil
	}

	if err := os.MkdirAll(toolsRoot, 0o755); err != nil {
		return "", err
	}
	tempPath := binaryPath + ".download"
	_ = os.Remove(tempPath)
	if err := s.client.DownloadFile(ctx, url, tempPath); err != nil {
		return "", fmt.Errorf("download managed yt-dlp %s: %w", version, err)
	}
	defer os.Remove(tempPath)
	if err := verifySHA256(tempPath, checksum); err != nil {
		return "", fmt.Errorf("verify managed yt-dlp %s: %w", version, err)
	}
	if err := os.Chmod(tempPath, 0o755); err != nil {
		return "", err
	}
	if err := os.Rename(tempPath, binaryPath); err != nil {
		return "", err
	}
	return binaryPath, nil
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
	if completed, ok := s.store.Snapshot().CompletedCommands[command.ID]; ok {
		return s.client.PostCommandResult(ctx, credential, map[string]interface{}{
			"commandId": command.ID, "status": completed.Status, "message": completed.Message,
			"completedAt": completed.CompletedAt, "leaseToken": command.LeaseToken,
		})
	}
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
	case "update_network":
		ssid, _ := command.Payload["ssid"].(string)
		password, _ := command.Payload["password"].(string)
		priority := 100
		if rawPriority, ok := command.Payload["priority"].(float64); ok {
			priority = int(rawPriority)
		}
		if strings.TrimSpace(ssid) == "" || password == "" {
			err = fmt.Errorf("update_network requires ssid and password")
		} else {
			err = local.ConfigureWiFi(ctx, ssid, password, priority)
		}
	default:
		err = fmt.Errorf("unsupported command: %s", command.CommandType)
	}

	payload := map[string]interface{}{
		"commandId": command.ID,
		"status":    "succeeded",
	}
	if command.LeaseToken != "" {
		payload["leaseToken"] = command.LeaseToken
	}
	if err != nil {
		payload["status"] = "failed"
		payload["message"] = err.Error()
	}
	payload["completedAt"] = time.Now().UTC().Format(time.RFC3339)
	completed := state.CompletedCommand{Status: payload["status"].(string), CompletedAt: payload["completedAt"].(string)}
	if message, ok := payload["message"].(string); ok {
		completed.Message = message
	}
	if storeErr := s.store.Update(func(next *state.DeviceState) {
		next.CompletedCommands[command.ID] = completed
		if len(next.CompletedCommands) > 500 {
			for id := range next.CompletedCommands {
				if id != command.ID {
					delete(next.CompletedCommands, id)
					break
				}
			}
		}
	}); storeErr != nil {
		return storeErr
	}

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
		"appliance":         applianceDescriptor(),
		"health":            current.Health,
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

	message := userFacingError(err)
	_ = s.store.Update(func(next *state.DeviceState) {
		next.LastError = message
	})
}

func userFacingError(err error) string {
	message := strings.TrimSpace(err.Error())
	lower := strings.ToLower(message)
	if strings.Contains(lower, "yt-dlp") || strings.Contains(lower, "youtube") {
		return "YouTube content could not be prepared. The player will retry automatically."
	}
	const maxLength = 240
	if len(message) > maxLength {
		return strings.TrimSpace(message[:maxLength-1]) + "…"
	}
	return message
}

func clonePlaylist(items []remote.ManifestPlaylistItem) []remote.ManifestPlaylistItem {
	copyItems := make([]remote.ManifestPlaylistItem, len(items))
	copy(copyItems, items)
	return copyItems
}

func cloneAssetRecords(records map[string]state.AssetRecord) map[string]state.AssetRecord {
	copyRecords := make(map[string]state.AssetRecord, len(records))
	for assetID, record := range records {
		copyRecords[assetID] = record
	}
	return copyRecords
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func validateCachedAsset(path string, expectedChecksum string) error {
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	if info.IsDir() || info.Size() == 0 {
		return fmt.Errorf("cached file is empty or invalid")
	}

	normalized := normalizeSHA256(expectedChecksum)
	if len(normalized) == 64 {
		if err := verifySHA256(path, normalized); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) pruneCachedAssets(previous, active map[string]state.AssetRecord) {
	activeFiles := make(map[string]struct{}, len(active))
	for _, record := range active {
		activeFiles[record.FileName] = struct{}{}
	}

	for _, record := range previous {
		if _, keep := activeFiles[record.FileName]; keep {
			continue
		}
		path := filepath.Join(s.config.StorageRoot, record.FileName)
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			log.Printf("unable to prune stale cached asset %s: %v", record.FileName, err)
		}
	}
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
