//go:build unix

package api

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/andres/tf9/internal/config"
	"github.com/andres/tf9/internal/report"
)

// writeRunArtifacts seeds a run directory with the given output log and an
// optional terminal status, returning the run id.
func writeRunArtifacts(t *testing.T, id, output string, status *supervisedResult, meta *runMeta) {
	t.Helper()
	dir := config.RunDir(id)
	if output != "" {
		if err := os.WriteFile(filepath.Join(dir, outputLog), []byte(output), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if status != nil {
		if err := writeJSONAtomic(filepath.Join(dir, statusFile), status); err != nil {
			t.Fatal(err)
		}
	}
	if meta != nil {
		if err := writeJSONAtomic(filepath.Join(dir, metaFile), meta); err != nil {
			t.Fatal(err)
		}
	}
}

// seedRunsFile writes a runs.json containing a single running supervised run so
// NewRunManager's loadFromDisk path exercises reconciliation.
func seedRunsFile(t *testing.T, id string) {
	t.Helper()
	recs := []runRecord{{
		ID:        id,
		StartedAt: time.Now().UTC().Add(-time.Minute),
		Status:    StatusRunning,
		Request:   RunRequest{Command: "apply", Repo: "infra"},
	}}
	data, err := json.Marshal(recs)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(config.RunsFile(), data, 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestReattachFinalizesFromStatusFile(t *testing.T) {
	config.SetPath(filepath.Join(t.TempDir(), "config.yaml"))
	t.Cleanup(func() { config.SetPath("") })

	id := "run-0007"
	finished := time.Now().UTC()
	writeRunArtifacts(t, id, "line one\nline two\n", &supervisedResult{
		Status:     StatusSuccess,
		FinishedAt: finished,
		Results:    []report.EnvResult{{Env: "dev"}},
		ReportPath: "tf9-apply-x.html",
	}, &runMeta{SupervisorPID: 999999}) // dead pid; status file wins anyway
	seedRunsFile(t, id)

	m := NewRunManager()
	run, ok := m.Get(id)
	if !ok {
		t.Fatal("run not loaded")
	}
	run.mu.RLock()
	defer run.mu.RUnlock()
	if run.Status != StatusSuccess {
		t.Fatalf("status = %q, want success (status file should win)", run.Status)
	}
	if run.ReportPath != "tf9-apply-x.html" {
		t.Fatalf("reportPath = %q, want from status file", run.ReportPath)
	}
	if len(run.lines) != 2 || run.lines[0] != "line one" {
		t.Fatalf("lines = %#v, want output log contents", run.lines)
	}
}

func TestReattachOrphansDeadSupervisor(t *testing.T) {
	config.SetPath(filepath.Join(t.TempDir(), "config.yaml"))
	t.Cleanup(func() { config.SetPath("") })

	id := "run-0008"
	// Output log present, no status file, supervisor pid dead → orphaned.
	writeRunArtifacts(t, id, "partial output\n", nil, &runMeta{SupervisorPID: 999999})
	seedRunsFile(t, id)

	m := NewRunManager()
	run, ok := m.Get(id)
	if !ok {
		t.Fatal("run not loaded")
	}
	run.mu.RLock()
	defer run.mu.RUnlock()
	if run.Status != StatusFailed {
		t.Fatalf("status = %q, want failed for orphaned run", run.Status)
	}
	if run.FinishedAt == nil {
		t.Fatal("FinishedAt should be set for orphaned run")
	}
	last := run.lines[len(run.lines)-1]
	if last != "  [server restarted; run state lost]" {
		t.Fatalf("last line = %q, want lost-state note", last)
	}
}

func TestTailMirrorsLogAndFinalizes(t *testing.T) {
	config.SetPath(filepath.Join(t.TempDir(), "config.yaml"))
	t.Cleanup(func() { config.SetPath("") })

	id := "run-0009"
	dir := config.RunDir(id)
	// Start with one line and no status; the tailer should pick it up and then
	// finalize once status.json appears.
	if err := os.WriteFile(filepath.Join(dir, outputLog), []byte("first\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	m := &RunManager{}
	run := &Run{
		ID:            id,
		Status:        StatusRunning,
		supervised:    true,
		supervisorPID: os.Getpid(), // alive: ourselves, so it never orphans
		cancel:        func() {},
	}
	m.mu.Lock()
	m.runs = append(m.runs, run)
	m.mu.Unlock()

	done := make(chan struct{})
	go func() { m.tail(run); close(done) }()

	// Append a second line, then write the terminal status.
	time.Sleep(250 * time.Millisecond)
	f, err := os.OpenFile(filepath.Join(dir, outputLog), os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	f.WriteString("second\n")
	f.Close()
	time.Sleep(250 * time.Millisecond)
	writeRunArtifacts(t, id, "", &supervisedResult{Status: StatusSuccess, FinishedAt: time.Now().UTC()}, nil)

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("tailer did not finalize")
	}

	run.mu.RLock()
	defer run.mu.RUnlock()
	if run.Status != StatusSuccess {
		t.Fatalf("status = %q, want success", run.Status)
	}
	if len(run.lines) != 2 || run.lines[1] != "second" {
		t.Fatalf("lines = %#v, want both log lines mirrored", run.lines)
	}
}
