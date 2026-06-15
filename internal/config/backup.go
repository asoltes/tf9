package config

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// maxBackups bounds the rolling backup ring. Older snapshots are pruned.
const maxBackups = 20

// backupTimeLayout produces sortable, human-readable backup filenames:
// config-20060102-150405.yaml.
const backupTimeLayout = "20060102-150405"

// BackupDir returns the directory holding config.yaml snapshots. It is a sibling
// of config.yaml so it follows the same XDG/override resolution. Target
// directories are validated relative to repository paths, never the config dir,
// so this directory is never scanned as a repo or target.
func BackupDir() string {
	return filepath.Join(filepath.Dir(ConfigPath()), "backups")
}

// BackupInfo describes a single stored snapshot.
type BackupInfo struct {
	Name    string    `json:"name"`
	ModTime time.Time `json:"modTime"`
	Size    int64     `json:"size"`
}

// backupCurrentLocked snapshots the existing config.yaml into BackupDir before
// it is overwritten. It MUST be called with storeMu held and inside the file
// lock (i.e. from writeRawLocked or another locked path). Failures are returned
// so callers can decide whether to log-and-continue; backups are best-effort and
// must never block a write.
//
// No-ops when config.yaml does not yet exist, and skips writing when the current
// content is byte-identical to the most recent backup so repeated no-op saves do
// not churn the ring.
func backupCurrentLocked() error {
	src := ConfigPath()
	data, err := os.ReadFile(src)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read config for backup: %w", err)
	}

	dir := BackupDir()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("create backup dir %s: %w", dir, err)
	}

	// Skip if identical to the newest existing backup.
	if existing := listBackupsLocked(dir); len(existing) > 0 {
		if prev, err := os.ReadFile(filepath.Join(dir, existing[0].Name)); err == nil && string(prev) == string(data) {
			return nil
		}
	}

	name := "config-" + time.Now().Format(backupTimeLayout) + ".yaml"
	dest := filepath.Join(dir, name)
	// Avoid clobbering a same-second backup with differing content.
	for i := 1; ; i++ {
		if _, err := os.Stat(dest); errors.Is(err, os.ErrNotExist) {
			break
		}
		name = fmt.Sprintf("config-%s-%d.yaml", time.Now().Format(backupTimeLayout), i)
		dest = filepath.Join(dir, name)
	}

	if err := os.WriteFile(dest, data, 0o600); err != nil {
		return fmt.Errorf("write backup %s: %w", dest, err)
	}
	pruneBackupsLocked(dir)
	return nil
}

// listBackupsLocked returns snapshots in BackupDir, newest first. Caller holds
// storeMu. A missing directory yields an empty slice, not an error.
func listBackupsLocked(dir string) []BackupInfo {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			slog.Warn("could not read backup dir", "dir", dir, "err", err)
		}
		return nil
	}
	out := make([]BackupInfo, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || !strings.HasPrefix(e.Name(), "config-") || !strings.HasSuffix(e.Name(), ".yaml") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, BackupInfo{Name: e.Name(), ModTime: info.ModTime(), Size: info.Size()})
	}
	// Newest first. ModTime (nanosecond precision on Linux) is the primary key so
	// same-second backups still order correctly; the name breaks exact ties.
	sort.Slice(out, func(i, j int) bool {
		if !out[i].ModTime.Equal(out[j].ModTime) {
			return out[i].ModTime.After(out[j].ModTime)
		}
		return out[i].Name > out[j].Name
	})
	return out
}

// pruneBackupsLocked deletes the oldest snapshots beyond maxBackups.
func pruneBackupsLocked(dir string) {
	backups := listBackupsLocked(dir)
	for _, b := range backups[min(len(backups), maxBackups):] {
		if err := os.Remove(filepath.Join(dir, b.Name)); err != nil {
			slog.Warn("could not prune old backup", "name", b.Name, "err", err)
		}
	}
}

// ListBackups returns stored config snapshots, newest first.
func ListBackups() []BackupInfo {
	storeMu.Lock()
	defer storeMu.Unlock()
	return listBackupsLocked(BackupDir())
}

// BackupNow forces an immediate snapshot of the current config.yaml and returns
// the resulting backup list (newest first).
func BackupNow() ([]BackupInfo, error) {
	storeMu.Lock()
	defer storeMu.Unlock()
	var backups []BackupInfo
	err := withFileLock(func() error {
		if err := backupCurrentLocked(); err != nil {
			return err
		}
		backups = listBackupsLocked(BackupDir())
		return nil
	})
	return backups, err
}

// RestoreBackup overwrites config.yaml with the named snapshot. The current
// config is snapshotted first (so the restore is itself undoable), the backup is
// validated as a parseable, schema-valid config, then written atomically via the
// normal write path. name must be a bare backup filename — path traversal is
// rejected.
func RestoreBackup(name string) error {
	if name == "" || strings.ContainsAny(name, "/\\") || filepath.Base(name) != name {
		return fmt.Errorf("invalid backup name %q", name)
	}
	storeMu.Lock()
	defer storeMu.Unlock()
	return withFileLock(func() error {
		path := filepath.Join(BackupDir(), name)
		data, err := os.ReadFile(path)
		if errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("backup %q not found", name)
		}
		if err != nil {
			return fmt.Errorf("read backup %s: %w", path, err)
		}
		var cfg Config
		if err := yaml.Unmarshal(data, &cfg); err != nil {
			return fmt.Errorf("backup %q is not valid YAML: %w", name, err)
		}
		if err := validate(&cfg); err != nil {
			return fmt.Errorf("backup %q is not a valid config: %w", name, err)
		}
		// Snapshot the about-to-be-replaced config so the restore can be undone.
		if err := backupCurrentLocked(); err != nil {
			slog.Warn("could not back up current config before restore", "err", err)
		}
		return writeRawLocked(data)
	})
}

// DeleteBackup removes the named snapshot from BackupDir. name must be a bare
// backup filename — path traversal is rejected.
func DeleteBackup(name string) error {
	if name == "" || strings.ContainsAny(name, "/\\") || filepath.Base(name) != name {
		return fmt.Errorf("invalid backup name %q", name)
	}
	storeMu.Lock()
	defer storeMu.Unlock()
	return withFileLock(func() error {
		path := filepath.Join(BackupDir(), name)
		if err := os.Remove(path); err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return fmt.Errorf("backup %q not found", name)
			}
			return fmt.Errorf("delete backup %s: %w", path, err)
		}
		return nil
	})
}
