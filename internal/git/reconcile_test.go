package git

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// gitEnv returns a deterministic environment so commits have stable identity
// and no user config interferes.
func gitEnv() []string {
	return append(os.Environ(),
		"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@example.com",
		"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@example.com",
		"GIT_CONFIG_GLOBAL=/dev/null", "GIT_CONFIG_SYSTEM=/dev/null",
	)
}

func run(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
	cmd.Env = gitEnv()
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return string(out)
}

func commit(t *testing.T, dir, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	run(t, dir, "add", name)
	run(t, dir, "commit", "-m", "add "+name)
}

// initRepo creates a repo with an initial commit on branch "main".
func initRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	run(t, dir, "init", "-b", "main")
	commit(t, dir, "base.tf", "base")
	return dir
}

func TestAheadBehindAndIsAncestor(t *testing.T) {
	ctx := context.Background()
	dir := initRepo(t)

	// feature diverges: main gets one commit, feature gets two.
	run(t, dir, "checkout", "-b", "feature")
	commit(t, dir, "f1.tf", "f1")
	commit(t, dir, "f2.tf", "f2")
	run(t, dir, "checkout", "main")
	commit(t, dir, "m1.tf", "m1")

	ahead, behind, err := AheadBehind(ctx, dir, "main", "feature")
	if err != nil {
		t.Fatal(err)
	}
	if ahead != 2 || behind != 1 {
		t.Fatalf("ahead=%d behind=%d, want ahead=2 behind=1", ahead, behind)
	}

	// main's tip is NOT an ancestor of feature (diverged).
	anc, err := IsAncestor(ctx, dir, "main", "feature")
	if err != nil {
		t.Fatal(err)
	}
	if anc {
		t.Fatal("expected main NOT to be ancestor of diverged feature")
	}

	// The merge-base IS an ancestor of feature.
	base := initialCommit(t, dir)
	anc, err = IsAncestor(ctx, dir, base, "feature")
	if err != nil {
		t.Fatal(err)
	}
	if !anc {
		t.Fatal("expected base commit to be ancestor of feature")
	}
}

func initialCommit(t *testing.T, dir string) string {
	t.Helper()
	out := run(t, dir, "rev-list", "--max-parents=0", "HEAD")
	return out[:len(out)-1] // strip newline
}

func TestAheadBehindRejectsFlagInjection(t *testing.T) {
	if _, _, err := AheadBehind(context.Background(), initRepo(t), "-x", "main"); err == nil {
		t.Fatal("expected error for ref starting with '-'")
	}
}

func TestActiveBranchesWindowAndLimit(t *testing.T) {
	ctx := context.Background()
	dir := initRepo(t)
	run(t, dir, "checkout", "-b", "recent-a")
	commit(t, dir, "a.tf", "a")
	run(t, dir, "checkout", "-b", "recent-b")
	commit(t, dir, "b.tf", "b")

	// All branches are recent; window large.
	branches, err := ActiveBranches(ctx, dir, 30, 10)
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, b := range branches {
		names[b.Name] = true
		if !b.Local {
			t.Fatalf("branch %q local=false, want true", b.Name)
		}
	}
	if !names["main"] || !names["recent-a"] || !names["recent-b"] {
		t.Fatalf("missing branches: %#v", names)
	}

	// Limit caps the count.
	limited, err := ActiveBranches(ctx, dir, 30, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(limited) != 1 {
		t.Fatalf("limit=1 returned %d branches", len(limited))
	}

	// A zero-day window excludes everything (no commit is newer than "now").
	none, err := ActiveBranches(ctx, dir, 0, 10)
	if err != nil {
		t.Fatal(err)
	}
	// windowDays<=0 disables the filter, so this should return all branches.
	if len(none) == 0 {
		t.Fatal("windowDays<=0 should disable filter and return branches")
	}
}
