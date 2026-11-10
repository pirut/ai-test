package health

import (
	"os"
	"path/filepath"
	"testing"
)

func TestKernelBootSlotReadsTheRaucSlot(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cmdline")
	previous := kernelCommandLinePath
	kernelCommandLinePath = path
	t.Cleanup(func() { kernelCommandLinePath = previous })

	if err := os.WriteFile(path, []byte("console=tty1 root=PARTUUID=53484f57-06 rauc.slot=B rootwait\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if slot := kernelBootSlot(); slot != "B" {
		t.Fatalf("expected slot B, got %q", slot)
	}

	if err := os.WriteFile(path, []byte("console=tty1 root=/dev/mmcblk0p2\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if slot := kernelBootSlot(); slot != "" {
		t.Fatalf("expected no slot without rauc.slot, got %q", slot)
	}
}

func TestSystemUpdateStateIsTrialOnlyOnThePendingSlot(t *testing.T) {
	cases := []struct {
		boot, pending, want string
	}{
		{"B", "B", "trial"},
		{"A", "B", ""},
		{"A", "", ""},
		{"", "", ""},
	}
	for _, c := range cases {
		if got := systemUpdateState(c.boot, c.pending); got != c.want {
			t.Errorf("boot %q pending %q: expected %q, got %q", c.boot, c.pending, c.want, got)
		}
	}
}
