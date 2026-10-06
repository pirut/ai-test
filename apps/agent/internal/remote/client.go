package remote

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net"
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
	ID         string                 `json:"id"`
	Label      string                 `json:"label"`
	StartsAt   string                 `json:"startsAt"`
	EndsAt     string                 `json:"endsAt"`
	Priority   int                    `json:"priority"`
	PlaylistID string                 `json:"playlistId,omitempty"`
	Playlist   []ManifestPlaylistItem `json:"playlist"`
}

type DeviceManifest struct {
	ManifestVersion   string                 `json:"manifestVersion"`
	DeviceID          string                 `json:"deviceId"`
	GeneratedAt       string                 `json:"generatedAt"`
	Timezone          string                 `json:"timezone"`
	Orientation       int                    `json:"orientation"`
	Volume            int                    `json:"volume"`
	DefaultPlaylistID string                 `json:"defaultPlaylistId,omitempty"`
	DefaultPlaylist   []ManifestPlaylistItem `json:"defaultPlaylist"`
	ScheduleWindows   []ScheduleWindow       `json:"scheduleWindows"`
	AssetBaseURL      string                 `json:"assetBaseUrl"`
	AssetChecksums    map[string]string      `json:"assetChecksums"`
}

type TemporaryRegistrationResponse struct {
	DeviceSessionID        string `json:"deviceSessionId"`
	ClaimCode              string `json:"claimCode"`
	ClaimToken             string `json:"claimToken"`
	PollingIntervalSeconds int    `json:"pollingIntervalSeconds"`
}

type ClaimStatusResponse struct {
	Claimed          bool   `json:"claimed"`
	DeviceID         string `json:"deviceId"`
	Credential       string `json:"credential"`
	ExpiresInSeconds int    `json:"expiresInSeconds"`
	PollAgainSeconds int    `json:"pollAgainSeconds"`
}

type RefreshAuthResponse struct {
	DeviceID         string `json:"deviceId"`
	Credential       string `json:"credential"`
	ExpiresInSeconds int    `json:"expiresInSeconds"`
}

type DeviceCommand struct {
	ID          string                 `json:"id"`
	DeviceID    string                 `json:"deviceId"`
	CommandType string                 `json:"commandType"`
	IssuedAt    string                 `json:"issuedAt"`
	Payload     map[string]interface{} `json:"payload"`
	LeaseToken  string                 `json:"leaseToken,omitempty"`
}

// HTTPError is returned when the control plane answers with a non-2xx status,
// so callers can tell "the server rejected this" apart from "the network is
// down".
type HTTPError struct {
	Method     string
	Path       string
	StatusCode int
	Body       string
}

func (e *HTTPError) Error() string {
	detail := e.Body
	if detail == "" {
		detail = http.StatusText(e.StatusCode)
	}
	return fmt.Sprintf("%s %s failed: %s", e.Method, e.Path, detail)
}

func statusCode(err error) int {
	var httpErr *HTTPError
	if errors.As(err, &httpErr) {
		return httpErr.StatusCode
	}
	return 0
}

// IsUnauthorized reports whether the server explicitly rejected the device
// credential. Network failures and server errors are never unauthorized.
func IsUnauthorized(err error) bool {
	code := statusCode(err)
	return code == http.StatusUnauthorized || code == http.StatusForbidden
}

// IsClaimSessionExpired reports whether the pairing session no longer exists
// and the device must request a new claim code.
func IsClaimSessionExpired(err error) bool {
	code := statusCode(err)
	return code == http.StatusGone || code == http.StatusNotFound
}

const downloadStallTimeout = 60 * time.Second

type Client struct {
	baseURL    string
	httpClient *http.Client
	// downloadClient has no overall deadline: large videos on slow showroom
	// Wi-Fi legitimately take many minutes. Stalls are caught per read instead.
	downloadClient *http.Client
}

func New(baseURL string) *Client {
	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   15 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSHandshakeTimeout:   15 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
		IdleConnTimeout:       90 * time.Second,
		MaxIdleConns:          4,
		ForceAttemptHTTP2:     true,
	}
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{
			Timeout:   45 * time.Second,
			Transport: transport,
		},
		downloadClient: &http.Client{
			Transport: transport,
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

func (c *Client) RefreshAuth(ctx context.Context, credential string) (*RefreshAuthResponse, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/device/auth/refresh", nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+credential)

	var payload RefreshAuthResponse
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
		return newHTTPError(request, response)
	}

	return nil
}

func (c *Client) DownloadFile(ctx context.Context, sourceURL string, destPath string) error {
	if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
		return err
	}
	partialPath := destPath + ".part"
	partialSize := int64(0)
	if info, err := os.Stat(partialPath); err == nil {
		partialSize = info.Size()
	}
	downloadCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	request, err := http.NewRequestWithContext(downloadCtx, http.MethodGet, sourceURL, nil)
	if err != nil {
		return err
	}
	if partialSize > 0 {
		request.Header.Set("Range", fmt.Sprintf("bytes=%d-", partialSize))
	}

	response, err := c.downloadClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode == http.StatusRequestedRangeNotSatisfiable {
		// The partial file no longer matches the source (it changed or the
		// partial is already complete). Start over on the next attempt instead
		// of failing forever on the same stale range.
		_ = os.Remove(partialPath)
		return fmt.Errorf("download for %s restarted after an invalid resume range", sourceURL)
	}
	if response.StatusCode >= 400 {
		return fmt.Errorf("download failed for %s: %s", sourceURL, response.Status)
	}

	flags := os.O_CREATE | os.O_WRONLY
	if response.StatusCode == http.StatusPartialContent && partialSize > 0 {
		flags |= os.O_APPEND
	} else {
		flags |= os.O_TRUNC
		partialSize = 0
	}
	file, err := os.OpenFile(partialPath, flags, 0o644)
	if err != nil {
		return err
	}

	body := newStallReader(response.Body, downloadStallTimeout, cancel)
	written, err := io.Copy(file, body)
	body.Stop()
	if err != nil {
		file.Close()
		if body.Stalled() {
			return fmt.Errorf("download for %s stalled for %s; it will resume on the next attempt", sourceURL, downloadStallTimeout)
		}
		return err
	}
	if written == 0 && partialSize == 0 {
		file.Close()
		return fmt.Errorf("download returned an empty file for %s", sourceURL)
	}
	if err := file.Sync(); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}

	return os.Rename(partialPath, destPath)
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
		return newHTTPError(request, response)
	}

	if out == nil {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 64<<10))
		return nil
	}

	return json.NewDecoder(response.Body).Decode(out)
}

func newHTTPError(request *http.Request, response *http.Response) *HTTPError {
	payload, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
	return &HTTPError{
		Method:     request.Method,
		Path:       request.URL.Path,
		StatusCode: response.StatusCode,
		Body:       strings.TrimSpace(string(payload)),
	}
}

// stallReader cancels a download when no bytes arrive for the stall timeout,
// so a dead connection cannot hang hydration indefinitely.
type stallReader struct {
	reader  io.Reader
	timer   *time.Timer
	timeout time.Duration
	stalled chan struct{}
}

func newStallReader(reader io.Reader, timeout time.Duration, cancel context.CancelFunc) *stallReader {
	stalled := make(chan struct{})
	return &stallReader{
		reader:  reader,
		timeout: timeout,
		stalled: stalled,
		timer: time.AfterFunc(timeout, func() {
			close(stalled)
			cancel()
		}),
	}
}

func (r *stallReader) Read(p []byte) (int, error) {
	n, err := r.reader.Read(p)
	if n > 0 {
		r.timer.Reset(r.timeout)
	}
	return n, err
}

func (r *stallReader) Stop() {
	r.timer.Stop()
}

func (r *stallReader) Stalled() bool {
	select {
	case <-r.stalled:
		return true
	default:
		return false
	}
}
