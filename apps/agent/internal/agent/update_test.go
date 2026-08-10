package agent

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"
)

func TestVerifyReleaseSignature(t *testing.T) {
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256([]byte("release"))
	signature := ed25519.Sign(privateKey, digest[:])
	if err := verifyReleaseSignature(
		hex.EncodeToString(digest[:]),
		base64.StdEncoding.EncodeToString(signature),
		base64.StdEncoding.EncodeToString(publicKey),
	); err != nil {
		t.Fatal(err)
	}
	digest[0] ^= 0xff
	if err := verifyReleaseSignature(
		hex.EncodeToString(digest[:]),
		base64.StdEncoding.EncodeToString(signature),
		base64.StdEncoding.EncodeToString(publicKey),
	); err == nil {
		t.Fatal("tampered digest was accepted")
	}
}

func TestVersionedAgentSwitchAndRollback(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "1.0.0"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("1.0.0", filepath.Join(root, "current")); err != nil {
		t.Fatal(err)
	}
	download := filepath.Join(t.TempDir(), "agent")
	if err := os.WriteFile(download, []byte("new-agent"), 0o755); err != nil {
		t.Fatal(err)
	}
	previous, current, err := installVersionedAgent(download, root, "2.0.0")
	if err != nil {
		t.Fatal(err)
	}
	if target, _ := os.Readlink(current); target != "2.0.0" {
		t.Fatalf("current points to %q", target)
	}
	rollbackPendingSlots(pendingUpdate{Agent: &pendingSlot{Previous: previous, CurrentLink: current}})
	if target, _ := os.Readlink(current); target != "1.0.0" {
		t.Fatalf("rollback points to %q", target)
	}
}

func TestSafeArchivePathRejectsTraversal(t *testing.T) {
	if _, err := safeArchivePath(t.TempDir(), "../../etc/shadow"); err == nil {
		t.Fatal("archive traversal was accepted")
	}
}
