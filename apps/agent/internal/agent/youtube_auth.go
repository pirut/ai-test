package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type youtubeAuthUpdatePayload struct {
	Cookies string `json:"cookies"`
	SyncNow *bool  `json:"syncNow,omitempty"`
}

func (s *Service) applyYouTubeAuthUpdate(
	ctx context.Context,
	credential string,
	raw map[string]interface{},
) error {
	payload, err := parseYouTubeAuthUpdatePayload(raw)
	if err != nil {
		return err
	}
	if strings.TrimSpace(payload.Cookies) == "" {
		return fmt.Errorf("update_youtube_auth requires cookies")
	}

	cookieFile := strings.TrimSpace(s.config.YouTubeCookieFile)
	if cookieFile == "" {
		return fmt.Errorf("youtube cookie file path is not configured")
	}

	if err := os.MkdirAll(filepath.Dir(cookieFile), 0o755); err != nil {
		return err
	}

	normalized := normalizeCookiePayload(payload.Cookies)
	tempPath := cookieFile + ".tmp"
	if err := os.WriteFile(tempPath, []byte(normalized), 0o600); err != nil {
		return err
	}
	if err := os.Rename(tempPath, cookieFile); err != nil {
		return err
	}

	shouldSync := payload.SyncNow == nil || *payload.SyncNow
	if shouldSync {
		if err := s.syncManifest(ctx, credential); err != nil {
			return fmt.Errorf("youtube auth updated, but sync failed: %w", err)
		}
	}

	return nil
}

func parseYouTubeAuthUpdatePayload(raw map[string]interface{}) (*youtubeAuthUpdatePayload, error) {
	payloadBytes, err := json.Marshal(raw)
	if err != nil {
		return nil, err
	}

	var payload youtubeAuthUpdatePayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return nil, err
	}
	return &payload, nil
}

func normalizeCookiePayload(value string) string {
	normalized := strings.ReplaceAll(value, "\r\n", "\n")
	normalized = strings.TrimSpace(normalized)
	if normalized == "" {
		return ""
	}
	return normalized + "\n"
}
