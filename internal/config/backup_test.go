package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// writeValid persists a minimal valid config with the given sts_profile marker
// so successive writes differ in content.
func writeValid(t *testing.T, marker string) {
	t.Helper()
	if err := Save(Config{Version: 1, StsProfile: marker}); err != nil {
		t.Fatalf("Save(%q): %v", marker, err)
	}
}

func TestAutoBackupOnWrite(t *testing.T) {
	useTestConfig(t)

	// First write: no prior file exists, so nothing to back up.
	writeValid(t, "one")
	if got := ListBackups(); len(got) != 0 {
		t.Fatalf("after first write: want 0 backups, got %d", len(got))
	}

	// Second write snapshots the "one" state.
	writeValid(t, "two")
	backups := ListBackups()
	if len(backups) != 1 {
		t.Fatalf("after second write: want 1 backup, got %d", len(backups))
	}

	// The backup must contain the pre-change ("one") content.
	data, err := os.ReadFile(filepath.Join(BackupDir(), backups[0].Name))
	if err != nil {
		t.Fatalf("read backup: %v", err)
	}
	if !strings.Contains(string(data), "sts_profile: one") {
		t.Fatalf("backup should hold prior content, got:\n%s", data)
	}
}

func TestBackupDedupesIdenticalContent(t *testing.T) {
	useTestConfig(t)
	writeValid(t, "alpha")
	writeValid(t, "beta") // backs up "alpha" -> 1 backup

	// Force-backup twice with no change in between: the second is a no-op.
	if _, err := BackupNow(); err != nil {
		t.Fatalf("BackupNow 1: %v", err)
	}
	if _, err := BackupNow(); err != nil {
		t.Fatalf("BackupNow 2: %v", err)
	}
	// "alpha" (from the write) + one "beta" snapshot; the duplicate BackupNow skips.
	if got := ListBackups(); len(got) != 2 {
		t.Fatalf("want 2 backups after dedup, got %d", len(got))
	}
}

func TestBackupRingPrunes(t *testing.T) {
	useTestConfig(t)
	// Each write (after the first) snapshots the prior state. Writing
	// maxBackups+5 distinct configs yields maxBackups+4 snapshots, pruned to
	// maxBackups.
	for i := 0; i < maxBackups+5; i++ {
		writeValid(t, "v"+string(rune('a'+i)))
	}
	if got := ListBackups(); len(got) != maxBackups {
		t.Fatalf("want %d backups after pruning, got %d", maxBackups, len(got))
	}
}

func TestRestoreBackupRoundTrip(t *testing.T) {
	useTestConfig(t)
	writeValid(t, "original")
	writeValid(t, "changed") // snapshots "original"

	backups := ListBackups()
	if len(backups) != 1 {
		t.Fatalf("setup: want 1 backup, got %d", len(backups))
	}

	if err := RestoreBackup(backups[0].Name); err != nil {
		t.Fatalf("RestoreBackup: %v", err)
	}

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load after restore: %v", err)
	}
	if cfg.StsProfile != "original" {
		t.Fatalf("restored config sts_profile = %q, want %q", cfg.StsProfile, "original")
	}

	// Restore must have snapshotted the "changed" state first, so it is undoable.
	found := false
	for _, b := range ListBackups() {
		data, err := os.ReadFile(filepath.Join(BackupDir(), b.Name))
		if err == nil && strings.Contains(string(data), "sts_profile: changed") {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("restore should have backed up the replaced (changed) config")
	}
}

func TestRestoreRejectsTraversal(t *testing.T) {
	useTestConfig(t)
	for _, bad := range []string{"../config.yaml", "a/b.yaml", "", "..\\evil"} {
		if err := RestoreBackup(bad); err == nil {
			t.Fatalf("RestoreBackup(%q) should have failed", bad)
		}
	}
}
