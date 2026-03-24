package agent

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"crypto/sha256"
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
	Version       string `json:"version,omitempty"`
	AgentVersion  string `json:"agentVersion,omitempty"`
	AgentURL      string `json:"agentUrl,omitempty"`
	AgentSHA256   string `json:"agentSha256,omitempty"`
	PlayerVersion string `json:"playerVersion,omitempty"`
	PlayerURL     string `json:"playerUrl,omitempty"`
	PlayerSHA256  string `json:"playerSha256,omitempty"`
	SystemVersion string `json:"systemVersion,omitempty"`
	SystemURL     string `json:"systemUrl,omitempty"`
	SystemSHA256  string `json:"systemSha256,omitempty"`
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

	workDir := filepath.Join(s.config.StateRoot, "updates", commandID)
	if err := os.RemoveAll(workDir); err != nil {
		return err
	}
	if err := os.MkdirAll(workDir, 0o755); err != nil {
		return err
	}
	defer os.RemoveAll(workDir)

	restartCommands := make([]string, 0, 2)
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
		if err := installPlayerBundle(archivePath, s.config.PlayerDistPath, filepath.Join(workDir, "player")); err != nil {
			return fmt.Errorf("install player bundle: %w", err)
		}
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
		if err := installAgentBinary(downloadPath); err != nil {
			return fmt.Errorf("install agent binary: %w", err)
		}
		if strings.TrimSpace(s.config.RestartAgentCommand) != "" {
			restartCommands = append(restartCommands, s.config.RestartAgentCommand)
		}
	}

	if payload.SystemURL != "" {
		archivePath := filepath.Join(workDir, archiveFileName(payload.SystemURL, "system-release.tar.gz"))
		if err := s.client.DownloadFile(ctx, payload.SystemURL, archivePath); err != nil {
			return fmt.Errorf("download system bundle: %w", err)
		}
		if err := verifySHA256(archivePath, payload.SystemSHA256); err != nil {
			return fmt.Errorf("verify system bundle: %w", err)
		}
		if err := installSystemBundle(archivePath, filepath.Join(workDir, "system")); err != nil {
			return fmt.Errorf("install system bundle: %w", err)
		}
		if strings.TrimSpace(s.config.RestartPlayerCommand) != "" {
			restartCommands = append(restartCommands, s.config.RestartPlayerCommand)
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

	return scheduleShell(strings.Join(restartCommands, " && "), 5*time.Second)
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

func installAgentBinary(downloadPath string) error {
	executablePath, err := os.Executable()
	if err != nil {
		return err
	}

	resolvedPath, err := filepath.EvalSymlinks(executablePath)
	if err == nil {
		executablePath = resolvedPath
	}

	tempPath := executablePath + ".next"
	if err := copyFile(downloadPath, tempPath, 0o755); err != nil {
		return err
	}

	return os.Rename(tempPath, executablePath)
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

func installSystemBundle(archivePath string, workDir string) error {
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

	return filepath.WalkDir(sourceRoot, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		relativePath, err := filepath.Rel(sourceRoot, path)
		if err != nil {
			return err
		}
		if relativePath == "." {
			return nil
		}

		targetPath := filepath.Join(string(filepath.Separator), relativePath)
		if targetPath == "/" {
			return fmt.Errorf("invalid system bundle path")
		}

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
