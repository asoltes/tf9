package api

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/andres/tfops/internal/config"
)

// newTestRun appends a fresh running run to the manager and returns it.
func newTestRun(m *RunManager) *Run {
	_, cancel := context.WithCancel(context.Background())
	run := &Run{ID: "run-test", Status: StatusRunning, cancel: cancel}
	m.mu.Lock()
	m.runs = append(m.runs, run)
	m.mu.Unlock()
	return run
}

func TestForceKillFinalizesRunningRun(t *testing.T) {
	// Redirect persistence to a temp file so the test never touches real state.
	config.SetPath(filepath.Join(t.TempDir(), "config.yaml"))

	m := &RunManager{}
	run := newTestRun(m)

	if !m.ForceKill(run.ID) {
		t.Fatal("ForceKill returned false for a running run")
	}

	run.mu.RLock()
	defer run.mu.RUnlock()
	if run.Status != StatusCancelled {
		t.Errorf("status = %q, want %q", run.Status, StatusCancelled)
	}
	if run.FinishedAt == nil {
		t.Error("FinishedAt was not set")
	}
	if !run.forced {
		t.Error("forced flag was not set")
	}
	if run.AwaitingInput {
		t.Error("AwaitingInput should be cleared after force kill")
	}
}

func TestForceKillRejectsFinishedRun(t *testing.T) {
	config.SetPath(filepath.Join(t.TempDir(), "config.yaml"))

	m := &RunManager{}
	run := newTestRun(m)
	run.Status = StatusSuccess // already finished

	if m.ForceKill(run.ID) {
		t.Error("ForceKill returned true for an already-finished run")
	}
}

func TestForceKillUnknownRun(t *testing.T) {
	m := &RunManager{}
	if m.ForceKill("nope") {
		t.Error("ForceKill returned true for an unknown run id")
	}
}
