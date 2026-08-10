package agent

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/jrbussard/showroom-signage/apps/agent/internal/state"
)

type releaseUpdatePayload struct {
	Version         string `json:"version,omitempty"`
	AgentVersion    string `json:"agentVersion,omitempty"`
	AgentURL        string `json:"agentUrl,omitempty"`
	AgentSHA256     string `json:"agentSha256,omitempty"`
	PlayerVersion   string `json:"playerVersion,omitempty"`
	PlayerURL       string `json:"playerUrl,omitempty"`
	PlayerSHA256    string `json:"playerSha256,omitempty"`
	SystemVersion   string `json:"systemVersion,omitempty"`
	SystemURL       string `json:"systemUrl,omitempty"`
	SystemSHA256    string `json:"systemSha256,omitempty"`
	AgentSignature  string `json:"agentSignature,omitempty"`
	PlayerSignature string `json:"playerSignature,omitempty"`
	SystemSignature string `json:"systemSignature,omitempty"`
	SigningKeyID    string `json:"signingKeyId,omitempty"`
}

func (s *Service) applyReleaseUpdate(
	ctx context.Context,
	commandID string,
	raw map[string]interface{},
) error {
	payload, err := parseReleaseUpdatePayload(raw)
	if err != nil {
		return err
	}
	if payload.AgentURL == "" && payload.PlayerURL == "" && payload.SystemURL == "" {
		return fmt.Errorf("update_release requires agentUrl, playerUrl, and/or systemUrl")
	}
	if payload.AgentURL != "" && normalizeSHA256(payload.AgentSHA256) == "" {
		return fmt.Errorf("agentSha256 is required when agentUrl is provided")
	}
	if payload.PlayerURL != "" && normalizeSHA256(payload.PlayerSHA256) == "" {
		return fmt.Errorf("playerSha256 is required when playerUrl is provided")
	}
	if payload.SystemURL != "" && normalizeSHA256(payload.SystemSHA256) == "" {
		return fmt.Errorf("systemSha256 is required when systemUrl is provided")
	}
	if payload.SystemURL != "" {
		return fmt.Errorf("system bundles are not installed live; publish an A/B OS update instead")
	}
	if err := verifyReleaseSignature(payload.AgentSHA256, payload.AgentSignature, s.config.ReleasePublicKey); payload.AgentURL != "" && err != nil {
		return fmt.Errorf("verify agent release signature: %w", err)
	}
	if err := verifyReleaseSignature(payload.PlayerSHA256, payload.PlayerSignature, s.config.ReleasePublicKey); payload.PlayerURL != "" && err != nil {
		return fmt.Errorf("verify player release signature: %w", err)
	}

	workDir := filepath.Join(s.config.StateRoot, "updates", commandID)
	if err := os.RemoveAll(workDir); err != nil {
		return err
	}
	if err := os.MkdirAll(workDir, 0o755); err != nil {
		return err
	}
	defer os.RemoveAll(workDir)

	restartCommands := make([]string, 0, 3)
	pending := pendingUpdate{Version: strings.TrimSpace(payload.Version), CreatedAt: time.Now().UTC().Format(time.RFC3339)}
	committed := false
	previousState := s.store.Snapshot()
	defer func() {
		if committed {
			return
		}
		rollbackPendingSlots(pending)
		_ = s.store.Update(func(next *state.DeviceState) {
			next.AgentVersion = previousState.AgentVersion
			next.PlayerVersion = previousState.PlayerVersion
		})
	}()
	releaseRoot := filepath.Clean(filepath.Join(s.config.StateRoot, "..", "releases"))
	nextAgentVersion := strings.TrimSpace(payload.AgentVersion)
	if nextAgentVersion == "" && payload.AgentURL != "" {
		nextAgentVersion = strings.TrimSpace(payload.Version)
	}
	nextPlayerVersion := strings.TrimSpace(payload.PlayerVersion)
	if nextPlayerVersion == "" && payload.PlayerURL != "" {
		nextPlayerVersion = strings.TrimSpace(payload.Version)
	}
	nextSystemVersion := strings.TrimSpace(payload.SystemVersion)
	if nextSystemVersion == "" && payload.SystemURL != "" {
		nextSystemVersion = strings.TrimSpace(payload.Version)
	}

	if payload.PlayerURL != "" {
		archivePath := filepath.Join(workDir, archiveFileName(payload.PlayerURL, "player-release.tar.gz"))
		if err := s.client.DownloadFile(ctx, payload.PlayerURL, archivePath); err != nil {
			return fmt.Errorf("download player bundle: %w", err)
		}
		if err := verifySHA256(archivePath, payload.PlayerSHA256); err != nil {
			return fmt.Errorf("verify player bundle: %w", err)
		}
		previous, currentLink, err := installVersionedPlayerBundle(archivePath, filepath.Join(releaseRoot, "player"), nextPlayerVersion, filepath.Join(workDir, "player"))
		if err != nil {
			return fmt.Errorf("install player bundle: %w", err)
		}
		pending.Player = &pendingSlot{Previous: previous, CurrentLink: currentLink}
		if strings.TrimSpace(s.config.RestartPlayerCommand) != "" {
			restartCommands = append(restartCommands, s.config.RestartPlayerCommand)
		}
	}

	if payload.AgentURL != "" {
		downloadPath := filepath.Join(workDir, "showroom-agent")
		if err := s.client.DownloadFile(ctx, payload.AgentURL, downloadPath); err != nil {
			return fmt.Errorf("download agent binary: %w", err)
		}
		if err := verifySHA256(downloadPath, payload.AgentSHA256); err != nil {
			return fmt.Errorf("verify agent binary: %w", err)
		}
		previous, currentLink, err := installVersionedAgent(downloadPath, filepath.Join(releaseRoot, "agent"), nextAgentVersion)
		if err != nil {
			return fmt.Errorf("install agent binary: %w", err)
		}
		pending.Agent = &pendingSlot{Previous: previous, CurrentLink: currentLink}
		if strings.TrimSpace(s.config.RestartAgentCommand) != "" {
			restartCommands = append(restartCommands, s.config.RestartAgentCommand)
		}
	}

	if nextAgentVersion != "" || nextPlayerVersion != "" || nextSystemVersion != "" {
		if err := s.store.Update(func(next *state.DeviceState) {
			if nextAgentVersion != "" {
				next.AgentVersion = nextAgentVersion
			}
			if nextPlayerVersion != "" {
				next.PlayerVersion = nextPlayerVersion
			}
			if nextSystemVersion != "" && next.PlayerVersion == "" {
				next.PlayerVersion = nextSystemVersion
			}
		}); err != nil {
			return err
		}
	}

	if len(restartCommands) == 0 {
		return nil
	}
	if err := writeJSONFile(filepath.Join(s.config.StateRoot, "pending-update.json"), pending); err != nil {
		return fmt.Errorf("record pending update: %w", err)
	}
	restartCommands = append(restartCommands, "systemctl restart showroom-update-guard.service")
	if err := scheduleShell(strings.Join(restartCommands, " && "), 5*time.Second); err != nil {
		return err
	}
	committed = true
	return nil
}

type pendingSlot struct {
	Previous    string `json:"previous"`
	CurrentLink string `json:"currentLink"`
}

type pendingUpdate struct {
	Version   string       `json:"version"`
	CreatedAt string       `json:"createdAt"`
	Agent     *pendingSlot `json:"agent,omitempty"`
	Player    *pendingSlot `json:"player,omitempty"`
}

func rollbackPendingSlots(pending pendingUpdate) {
	for _, slot := range []*pendingSlot{pending.Agent, pending.Player} {
		if slot == nil || slot.Previous == "" || slot.CurrentLink == "" {
			continue
		}
		temp := slot.CurrentLink + ".rollback"
		_ = os.Remove(temp)
		if err := os.Symlink(slot.Previous, temp); err == nil {
			_ = os.Rename(temp, slot.CurrentLink)
		}
	}
}

func verifyReleaseSignature(checksum string, signature string, publicKeyValue string) error {
	checksum = normalizeSHA256(checksum)
	publicKeyValue = strings.TrimSpace(publicKeyValue)
	if publicKeyValue == "" {
		return fmt.Errorf("SHOWROOM_RELEASE_PUBLIC_KEY is not configured")
	}
	publicKey, err := base64.StdEncoding.DecodeString(publicKeyValue)
	if err != nil || len(publicKey) != ed25519.PublicKeySize {
		return fmt.Errorf("release public key must be a base64 Ed25519 public key")
	}
	signatureBytes, err := base64.StdEncoding.DecodeString(strings.TrimSpace(signature))
	if err != nil || len(signatureBytes) != ed25519.SignatureSize {
		return fmt.Errorf("artifact signature is missing or invalid")
	}
	digest, err := hex.DecodeString(checksum)
	if err != nil || len(digest) != sha256.Size {
		return fmt.Errorf("artifact checksum is invalid")
	}
	if !ed25519.Verify(ed25519.PublicKey(publicKey), digest, signatureBytes) {
		return fmt.Errorf("artifact signature does not match")
	}
	return nil
}

func parseReleaseUpdatePayload(raw map[string]interface{}) (*releaseUpdatePayload, error) {
	payloadBytes, err := json.Marshal(raw)
	if err != nil {
		return nil, err
	}

	var payload releaseUpdatePayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return nil, err
	}
	return &payload, nil
}

func verifySHA256(path string, expected string) error {
	expected = normalizeSHA256(expected)
	if expected == "" {
		return nil
	}

	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return err
	}

	actual := hex.EncodeToString(hash.Sum(nil))
	if actual != expected {
		return fmt.Errorf("expected sha256 %s, got %s", expected, actual)
	}

	return nil
}

func normalizeSHA256(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	value = strings.TrimPrefix(value, "sha256:")
	return value
}

func archiveFileName(sourceURL string, fallback string) string {
	parsedURL, err := url.Parse(sourceURL)
	if err != nil {
		return fallback
	}

	name := filepath.Base(parsedURL.Path)
	if strings.HasSuffix(strings.ToLower(name), ".tar.gz") ||
		strings.HasSuffix(strings.ToLower(name), ".tgz") ||
		strings.HasSuffix(strings.ToLower(name), ".zip") {
		return name
	}

	return fallback
}

func releaseVersion(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", fmt.Errorf("release version is required")
	}
	for _, character := range value {
		if (character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z') ||
			(character >= '0' && character <= '9') || character == '.' || character == '-' || character == '_' {
			continue
		}
		return "", fmt.Errorf("release version contains an unsafe character")
	}
	return value, nil
}

func switchCurrentSlot(root string, version string) (string, string, error) {
	currentLink := filepath.Join(root, "current")
	previous, err := os.Readlink(currentLink)
	if err != nil && !os.IsNotExist(err) {
		return "", "", err
	}
	if previous == "" {
		return "", "", fmt.Errorf("current release link is missing at %s", currentLink)
	}
	tempLink := currentLink + ".next"
	_ = os.Remove(tempLink)
	if err := os.Symlink(version, tempLink); err != nil {
		return "", "", err
	}
	if err := os.Rename(tempLink, currentLink); err != nil {
		_ = os.Remove(tempLink)
		return "", "", err
	}
	return previous, currentLink, nil
}

func installVersionedAgent(downloadPath string, root string, rawVersion string) (string, string, error) {
	version, err := releaseVersion(rawVersion)
	if err != nil {
		return "", "", err
	}
	targetDir := filepath.Join(root, version)
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return "", "", err
	}
	target := filepath.Join(targetDir, "showroom-agent")
	if err := copyFile(downloadPath, target+".next", 0o755); err != nil {
		return "", "", err
	}
	if err := os.Rename(target+".next", target); err != nil {
		return "", "", err
	}
	return switchCurrentSlot(root, version)
}

func installVersionedPlayerBundle(archivePath string, root string, rawVersion string, workDir string) (string, string, error) {
	version, err := releaseVersion(rawVersion)
	if err != nil {
		return "", "", err
	}
	target := filepath.Join(root, version)
	if err := installPlayerBundle(archivePath, target, workDir); err != nil {
		return "", "", err
	}
	return switchCurrentSlot(root, version)
}

func installPlayerBundle(archivePath string, targetPath string, workDir string) error {
	extractRoot := filepath.Join(workDir, "extract")
	if err := os.RemoveAll(extractRoot); err != nil {
		return err
	}
	if err := os.MkdirAll(extractRoot, 0o755); err != nil {
		return err
	}

	if err := extractArchive(archivePath, extractRoot); err != nil {
		return err
	}

	sourceRoot, err := resolveExtractedRoot(extractRoot)
	if err != nil {
		return err
	}

	if _, err := os.Stat(filepath.Join(sourceRoot, "index.html")); err != nil {
		return fmt.Errorf("release bundle is missing index.html")
	}

	stagingPath := targetPath + ".next"
	backupPath := targetPath + ".bak"
	if err := os.RemoveAll(stagingPath); err != nil {
		return err
	}
	if err := os.RemoveAll(backupPath); err != nil {
		return err
	}
	if err := os.MkdirAll(stagingPath, 0o755); err != nil {
		return err
	}
	if err := copyDir(sourceRoot, stagingPath); err != nil {
		return err
	}

	hadCurrent := fileExists(targetPath)
	if hadCurrent {
		if err := os.Rename(targetPath, backupPath); err != nil {
			return err
		}
	}

	if err := os.Rename(stagingPath, targetPath); err != nil {
		if hadCurrent {
			_ = os.Rename(backupPath, targetPath)
		}
		return err
	}

	return os.RemoveAll(backupPath)
}

func resolveExtractedRoot(root string) (string, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return "", err
	}

	if len(entries) == 1 && entries[0].IsDir() {
		return filepath.Join(root, entries[0].Name()), nil
	}

	return root, nil
}

func extractArchive(archivePath string, dest string) error {
	switch {
	case strings.HasSuffix(strings.ToLower(archivePath), ".zip"):
		return extractZipArchive(archivePath, dest)
	case strings.HasSuffix(strings.ToLower(archivePath), ".tar.gz"), strings.HasSuffix(strings.ToLower(archivePath), ".tgz"):
		return extractTarGzArchive(archivePath, dest)
	default:
		return fmt.Errorf("unsupported archive format: %s", archivePath)
	}
}

func extractTarGzArchive(archivePath string, dest string) error {
	file, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer file.Close()

	gzipReader, err := gzip.NewReader(file)
	if err != nil {
		return err
	}
	defer gzipReader.Close()

	tarReader := tar.NewReader(gzipReader)
	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}

		targetPath, err := safeArchivePath(dest, header.Name)
		if err != nil {
			return err
		}

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(targetPath, 0o755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
				return err
			}
			file, err := os.OpenFile(targetPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, fs.FileMode(header.Mode))
			if err != nil {
				return err
			}
			if _, err := io.Copy(file, tarReader); err != nil {
				file.Close()
				return err
			}
			if err := file.Close(); err != nil {
				return err
			}
		}
	}
}

func extractZipArchive(archivePath string, dest string) error {
	reader, err := zip.OpenReader(archivePath)
	if err != nil {
		return err
	}
	defer reader.Close()

	for _, file := range reader.File {
		targetPath, err := safeArchivePath(dest, file.Name)
		if err != nil {
			return err
		}

		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(targetPath, 0o755); err != nil {
				return err
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
			return err
		}

		source, err := file.Open()
		if err != nil {
			return err
		}

		target, err := os.OpenFile(targetPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, file.Mode())
		if err != nil {
			source.Close()
			return err
		}

		if _, err := io.Copy(target, source); err != nil {
			target.Close()
			source.Close()
			return err
		}
		if err := target.Close(); err != nil {
			source.Close()
			return err
		}
		if err := source.Close(); err != nil {
			return err
		}
	}

	return nil
}

func safeArchivePath(dest string, name string) (string, error) {
	cleaned := filepath.Clean(name)
	if cleaned == "." || cleaned == string(filepath.Separator) {
		return dest, nil
	}

	targetPath := filepath.Join(dest, cleaned)
	relativePath, err := filepath.Rel(dest, targetPath)
	if err != nil {
		return "", err
	}
	if strings.HasPrefix(relativePath, "..") {
		return "", fmt.Errorf("archive entry escapes target root: %s", name)
	}
	return targetPath, nil
}

func copyDir(source string, destination string) error {
	return filepath.WalkDir(source, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		relativePath, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		if relativePath == "." {
			return nil
		}

		targetPath := filepath.Join(destination, relativePath)
		info, err := entry.Info()
		if err != nil {
			return err
		}

		if entry.IsDir() {
			return os.MkdirAll(targetPath, info.Mode())
		}

		return copyFile(path, targetPath, info.Mode())
	})
}

func copyFile(source string, destination string, mode fs.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return err
	}

	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()

	output, err := os.OpenFile(destination, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, mode)
	if err != nil {
		return err
	}

	if _, err := io.Copy(output, input); err != nil {
		output.Close()
		return err
	}

	return output.Close()
}

func scheduleShell(command string, delay time.Duration) error {
	command = strings.TrimSpace(command)
	if command == "" {
		return nil
	}

	script := fmt.Sprintf("sleep %d; %s", int(delay.Seconds()), command)
	cmd := exec.Command("sh", "-lc", script)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	return cmd.Start()
}
