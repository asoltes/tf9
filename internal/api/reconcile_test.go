package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/andres/tf9/internal/config"
)

func gitRun(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=t@e.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=t@e.com",
		"GIT_CONFIG_GLOBAL=/dev/null", "GIT_CONFIG_SYSTEM=/dev/null",
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
}

func gitCommit(t *testing.T, dir, file, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, file), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	gitRun(t, dir, "add", ".")
	gitRun(t, dir, "commit", "-m", "add "+file)
}

// reconcileTestHandler registers a repo "infra" backed by a fresh git repo
// (with main + a behind feature branch) and returns the API handler + repo dir.
func reconcileTestHandler(t *testing.T) (http.Handler, string) {
	t.Helper()
	config.SetPath(filepath.Join(t.TempDir(), "config.yaml"))
	t.Cleanup(func() { config.SetPath("") })

	dir := t.TempDir()
	gitRun(t, dir, "init", "-b", "main")
	gitRun(t, dir, "config", "user.email", "t@e.com")
	gitRun(t, dir, "config", "user.name", "Test")
	gitCommit(t, dir, "base.tf", "base")
	// feature branches off, then main advances → feature is 1 behind.
	gitRun(t, dir, "checkout", "-b", "feature")
	gitRun(t, dir, "checkout", "main")
	gitCommit(t, dir, "m1.tf", "m1")
	gitRun(t, dir, "checkout", "feature")

	if err := config.Update(func(c *config.Config) error {
		c.Repositories = append(c.Repositories, config.Repository{
			Name: "infra", Path: dir, IntegrationBranch: "main",
		})
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	return Handler(NewRunManager(), t.TempDir()), dir
}

func TestReconcileStatusReportsBehind(t *testing.T) {
	handler, _ := reconcileTestHandler(t)
	req := httptest.NewRequest(http.MethodGet, "/api/repos/infra/reconcile", nil)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", res.Code, res.Body.String())
	}
	var body struct {
		IntegrationBranch string `json:"integrationBranch"`
		CurrentBranch     string `json:"currentBranch"`
		Behind            int    `json:"behind"`
		Ahead             int    `json:"ahead"`
		Recommend         string `json:"recommend"`
		BehindCommits     []struct {
			Subject string `json:"Subject"`
		} `json:"behindCommits"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.IntegrationBranch != "main" || body.CurrentBranch != "feature" {
		t.Fatalf("integration=%q current=%q", body.IntegrationBranch, body.CurrentBranch)
	}
	if body.Behind != 1 || body.Ahead != 0 {
		t.Fatalf("behind=%d ahead=%d, want behind=1 ahead=0", body.Behind, body.Ahead)
	}
	if body.Recommend != "rebase" {
		t.Fatalf("recommend=%q, want rebase", body.Recommend)
	}
	if len(body.BehindCommits) != 1 {
		t.Fatalf("behindCommits=%d, want 1", len(body.BehindCommits))
	}
}

func TestPromoteMergesFeatureIntoIntegration(t *testing.T) {
	handler, dir := reconcileTestHandler(t)
	// Give feature a unique commit so promote has something to merge.
	gitCommit(t, dir, "feat.tf", "feat")

	req := httptest.NewRequest(http.MethodPost, "/api/repos/infra/promote", nil)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", res.Code, res.Body.String())
	}
	var body map[string]string
	_ = json.Unmarshal(res.Body.Bytes(), &body)
	// No origin remote configured → push fails; that's expected here. The merge
	// itself must have succeeded (feat.tf reachable from main).
	gitRun(t, dir, "checkout", "main")
	if _, err := os.Stat(filepath.Join(dir, "feat.tf")); err != nil {
		t.Fatalf("feat.tf not on main after promote: %v (resp=%v)", err, body)
	}
}

func TestActiveBranchesEndpoint(t *testing.T) {
	handler, _ := reconcileTestHandler(t)
	req := httptest.NewRequest(http.MethodGet, "/api/repos/infra/active-branches", nil)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", res.Code, res.Body.String())
	}
	var body struct {
		WindowDays int `json:"windowDays"`
		Limit      int `json:"limit"`
		Branches   []struct {
			Name   string `json:"name"`
			Local  bool   `json:"local"`
			Remote bool   `json:"remote"`
		} `json:"branches"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.WindowDays != config.DefaultActiveBranchWindowDays || body.Limit != config.DefaultActiveBranchLimit {
		t.Fatalf("window=%d limit=%d, want defaults", body.WindowDays, body.Limit)
	}
	if len(body.Branches) < 2 {
		t.Fatalf("expected at least main+feature, got %d", len(body.Branches))
	}
	for _, branch := range body.Branches {
		if !branch.Local {
			t.Fatalf("branch %q local=false, want true", branch.Name)
		}
	}
}
