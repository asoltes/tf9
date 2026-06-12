package api

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/andres/tf9/internal/config"
	"github.com/andres/tf9/internal/report"
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

func TestPrepareReviewedApplyUsesPlanMetadata(t *testing.T) {
	config.SetPath(filepath.Join(t.TempDir(), "config.yaml"))
	t.Cleanup(func() { config.SetPath("") })

	plan := &Run{
		ID:             "run-0042",
		Status:         StatusSuccess,
		SavedPlanReady: true,
		StartedAt:      time.Now(),
		Request: RunRequest{
			Command:   "plan",
			Repo:      "platform",
			ExtraArgs: []string{"-refresh=false"},
			Parallel:  true,
		},
		Results: []report.EnvResult{{Env: "dev"}, {Env: "prod"}},
	}
	m := &RunManager{runs: []*Run{plan}}
	for _, target := range []string{"dev", "prod"} {
		path := savedPlanPath(plan.ID, target)
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("plan"), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	got, err := m.PrepareReviewedApply(RunRequest{Command: "apply", PlanRunID: plan.ID})
	if err != nil {
		t.Fatal(err)
	}
	if got.Repo != "platform" || got.EnvFilter != "dev,prod" || got.Parallel || !got.AutoApprove {
		t.Fatalf("unexpected prepared request: %#v", got)
	}
	if len(got.ExtraArgs) != 0 || len(got.PromotionOrder) != 2 {
		t.Fatalf("reviewed apply did not lock plan metadata: %#v", got)
	}
}

func TestPrepareReviewedApplyRejectsMissingPlanID(t *testing.T) {
	if _, err := (&RunManager{}).PrepareReviewedApply(RunRequest{Command: "apply"}); err == nil {
		t.Fatal("expected missing planRunId to be rejected")
	}
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
