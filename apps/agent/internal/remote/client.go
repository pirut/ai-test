package remote

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type ManifestPlaylistItem struct {
	ID              string `json:"id"`
	AssetID         string `json:"assetId"`
	AssetType       string `json:"assetType"`
	SourceType      string `json:"sourceType,omitempty"`
	Title           string `json:"title"`
	URL             string `json:"url"`
	Checksum        string `json:"checksum"`
	DurationSeconds int    `json:"durationSeconds,omitempty"`
}

type ScheduleWindow struct {
	ID        string                 `json:"id"`
	Label     string                 `json:"label"`
	StartsAt  string                 `json:"startsAt"`
	EndsAt    string                 `json:"endsAt"`
	Priority  int                    `json:"priority"`
	Playlist  []ManifestPlaylistItem `json:"playlist"`
}

type DeviceManifest struct {
	ManifestVersion string                 `json:"manifestVersion"`
	DeviceID        string                 `json:"deviceId"`
	GeneratedAt     string                 `json:"generatedAt"`
	Timezone        string                 `json:"timezone"`
	Orientation     int                    `json:"orientation"`
	Volume          int                    `json:"volume"`
	DefaultPlaylist []ManifestPlaylistItem `json:"defaultPlaylist"`
	ScheduleWindows []ScheduleWindow       `json:"scheduleWindows"`
	AssetBaseURL    string                 `json:"assetBaseUrl"`
	AssetChecksums  map[string]string      `json:"assetChecksums"`
}

type TemporaryRegistrationResponse struct {
	DeviceSessionID         string `json:"deviceSessionId"`
	ClaimCode               string `json:"claimCode"`
	ClaimToken              string `json:"claimToken"`
	PollingIntervalSeconds  int    `json:"pollingIntervalSeconds"`
}

type ClaimStatusResponse struct {
	Claimed          bool   `json:"claimed"`
	DeviceID         string `json:"deviceId"`
	Credential       string `json:"credential"`
	PollAgainSeconds int    `json:"pollAgainSeconds"`
}

type DeviceCommand struct {
	ID          string                 `json:"id"`
	DeviceID    string                 `json:"deviceId"`
	CommandType string                 `json:"commandType"`
	IssuedAt    string                 `json:"issuedAt"`
	Payload     map[string]interface{} `json:"payload"`
}

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func New(baseURL string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{
			Timeout: 45 * time.Second,
		},
	}
}

func (c *Client) RegisterTemporary(ctx context.Context) (*TemporaryRegistrationResponse, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/device/register-temporary", nil)
	if err != nil {
		return nil, err
	}

	var payload TemporaryRegistrationResponse
	if err := c.doJSON(request, &payload); err != nil {
		return nil, err
	}
	return &payload, nil
}

func (c *Client) ClaimStatus(ctx context.Context, sessionID string, claimToken string) (*ClaimStatusResponse, error) {
	body, err := json.Marshal(map[string]string{
		"deviceSessionId": sessionID,
		"claimToken":      claimToken,
	})
	if err != nil {
		return nil, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/device/claim-status", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")

	var payload ClaimStatusResponse
	if err := c.doJSON(request, &payload); err != nil {
		return nil, err
	}
	return &payload, nil
}

func (c *Client) FetchManifest(ctx context.Context, credential string) (*DeviceManifest, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/device/manifest", nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+credential)

	var payload struct {
		Manifest DeviceManifest `json:"manifest"`
	}
	if err := c.doJSON(request, &payload); err != nil {
		return nil, err
	}
	return &payload.Manifest, nil
}

func (c *Client) FetchCommands(ctx context.Context, credential string) ([]DeviceCommand, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/device/commands", nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+credential)

	var payload struct {
		Commands []DeviceCommand `json:"commands"`
	}
	if err := c.doJSON(request, &payload); err != nil {
		return nil, err
	}
	return payload.Commands, nil
}

func (c *Client) PostHeartbeat(ctx context.Context, credential string, payload map[string]interface{}) error {
	return c.postAuthenticatedJSON(ctx, credential, "/api/device/heartbeat", payload, nil)
}

func (c *Client) PostCommandResult(ctx context.Context, credential string, payload map[string]interface{}) error {
	return c.postAuthenticatedJSON(ctx, credential, "/api/device/command-result", payload, nil)
}

func (c *Client) UploadScreenshot(ctx context.Context, credential string, deviceID string, capturedAt string, filePath string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("deviceId", deviceID); err != nil {
		return err
	}
	if err := writer.WriteField("capturedAt", capturedAt); err != nil {
		return err
	}

	part, err := writer.CreateFormFile("file", filepath.Base(filePath))
	if err != nil {
		return err
	}
	if _, err := io.Copy(part, file); err != nil {
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/device/screenshot", &body)
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+credential)
	request.Header.Set("Content-Type", writer.FormDataContentType())

	response, err := c.httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode >= 400 {
		payload, _ := io.ReadAll(response.Body)
		return fmt.Errorf("screenshot upload failed: %s", strings.TrimSpace(string(payload)))
	}

	return nil
}

func (c *Client) DownloadFile(ctx context.Context, sourceURL string, destPath string) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, sourceURL, nil)
	if err != nil {
		return err
	}

	response, err := c.httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode >= 400 {
		return fmt.Errorf("download failed for %s: %s", sourceURL, response.Status)
	}

	if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
		return err
	}

	tempPath := destPath + ".tmp"
	file, err := os.Create(tempPath)
	if err != nil {
		return err
	}

	if _, err := io.Copy(file, response.Body); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}

	return os.Rename(tempPath, destPath)
}

func AssetFileName(item ManifestPlaylistItem) string {
	if item.SourceType == "youtube" || IsYouTubeURL(item.URL) {
		return item.AssetID + ".mp4"
	}

	extension := ".bin"
	if parsed, err := url.Parse(item.URL); err == nil {
		extension = filepath.Ext(parsed.Path)
	}
	if extension == "" {
		if item.AssetType == "video" {
			extension = ".mp4"
		} else {
			extension = ".jpg"
		}
	}
	return item.AssetID + extension
}

func IsYouTubeURL(rawURL string) bool {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return false
	}

	host := strings.ToLower(strings.TrimPrefix(parsed.Hostname(), "www."))
	return host == "youtube.com" || host == "m.youtube.com" || host == "youtu.be" || host == "music.youtube.com"
}

func (c *Client) postAuthenticatedJSON(ctx context.Context, credential string, path string, payload interface{}, out interface{}) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+credential)
	request.Header.Set("Content-Type", "application/json")

	return c.doJSON(request, out)
}

func (c *Client) doJSON(request *http.Request, out interface{}) error {
	response, err := c.httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode >= 400 {
		payload, _ := io.ReadAll(response.Body)
		return fmt.Errorf("%s %s failed: %s", request.Method, request.URL.Path, strings.TrimSpace(string(payload)))
	}

	if out == nil {
		return nil
	}

	return json.NewDecoder(response.Body).Decode(out)
}
