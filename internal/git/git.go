package git

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
)

var validSHA = regexp.MustCompile(`^[0-9a-f]{7,40}$`)

// Commit holds basic metadata for a single git commit.
type Commit struct {
	Hash    string
	Subject string
	Author  string
	Date    string
}

// ListBranches returns all local and remote branch names for the repo at repoDir.
// ListBranches returns local branches followed by any remote-only branches
// (those not already checked out locally), all with clean names — no
// "origin/" prefix. Selecting any name and calling git checkout <name>
// is safe: local branches switch directly; remote-only ones use git's DWIM
// to create a local tracking branch automatically.
func ListBranches(repoDir string) ([]string, error) {
	// Local branches.
	localOut, err := exec.Command("git", "-C", repoDir, "branch", "--format=%(refname:short)").Output()
	if err != nil {
		return nil, fmt.Errorf("git branch: %w", err)
	}
	local := map[string]bool{}
	var result []string
	for _, line := range strings.Split(strings.TrimSpace(string(localOut)), "\n") {
		b := strings.TrimSpace(line)
		if b != "" {
			local[b] = true
			result = append(result, b)
		}
	}

	// Remote branches — strip the "remote/" prefix and skip HEAD aliases.
	remoteOut, remoteErr := exec.Command("git", "-C", repoDir, "branch", "-r", "--format=%(refname:short)").Output()
	if remoteErr != nil {
		slog.Warn("git: list remote branches failed", "dir", repoDir, "err", remoteErr)
	}
	for _, line := range strings.Split(strings.TrimSpace(string(remoteOut)), "\n") {
		raw := strings.TrimSpace(line)
		if raw == "" {
			continue
		}
		// Strip leading "<remote>/" (e.g. "origin/") to get clean branch name.
		name := raw
		if idx := strings.IndexByte(raw, '/'); idx >= 0 {
			name = raw[idx+1:]
		}
		// Skip HEAD alias and anything already present as a local branch.
		if name == "HEAD" || local[name] {
			continue
		}
		local[name] = true // prevent duplicates from multiple remotes
		result = append(result, name)
	}
	return result, nil
}

// CreateWorktree creates a git worktree for branch at worktreePath and returns
// the resolved path.
func CreateWorktree(ctx context.Context, repoDir, branch, worktreePath string) (string, error) {
	// --detach avoids "branch already checked out" errors when the branch is in use
	// by the main worktree or another existing worktree.
	cmd := exec.CommandContext(ctx, "git", "-C", repoDir, "worktree", "add", "--detach", worktreePath, branch)
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("git worktree add: %w\n%s", err, buf.String())
	}
	return worktreePath, nil
}

// RemoveWorktree removes a git worktree by path.
func RemoveWorktree(repoDir, worktreePath string) error {
	cmd := exec.Command("git", "-C", repoDir, "worktree", "remove", "--force", worktreePath)
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("git worktree remove: %w\n%s", err, buf.String())
	}
	return nil
}

// RebaseOnto rebases the current branch in repoDir onto baseBranch.
// Returns combined stdout+stderr output.
func RebaseOnto(ctx context.Context, repoDir, baseBranch string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", "-C", repoDir, "rebase", baseBranch)
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	err := cmd.Run()
	output := buf.String()
	if err != nil {
		return output, fmt.Errorf("git rebase: %w", err)
	}
	return output, nil
}

// CherryPick applies the given commits onto the current branch in repoDir.
// Returns combined stdout+stderr output.
func CherryPick(ctx context.Context, repoDir string, commits []string) (string, error) {
	if len(commits) == 0 {
		return "", fmt.Errorf("no commits specified")
	}
	for _, c := range commits {
		if !validSHA.MatchString(c) {
			return "", fmt.Errorf("invalid commit hash %q: must be 7-40 hex characters", c)
		}
	}
	args := append([]string{"-C", repoDir, "cherry-pick"}, commits...)
	cmd := exec.CommandContext(ctx, "git", args...)
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	err := cmd.Run()
	output := buf.String()
	if err != nil {
		return output, fmt.Errorf("git cherry-pick: %w", err)
	}
	return output, nil
}

// CommitPatch returns the metadata, file summary, and patch for a commit.
func CommitPatch(ctx context.Context, repoDir, commit string) (string, error) {
	if !validSHA.MatchString(commit) {
		return "", fmt.Errorf("invalid commit hash %q: must be 7-40 hex characters", commit)
	}
	cmd := exec.CommandContext(ctx, "git", "-C", repoDir, "show",
		"--no-ext-diff", "--no-color", "--format=fuller", "--stat", "--patch", commit)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("git show: %w", err)
	}
	return string(out), nil
}

// Fetch runs `git fetch origin` in repoDir.
func Fetch(ctx context.Context, repoDir string) error {
	cmd := exec.CommandContext(ctx, "git", "-C", repoDir, "fetch", "origin")
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("git fetch: %w\n%s", err, buf.String())
	}
	return nil
}

// BehindCount returns the number of commits in the upstream that are not in
// HEAD (i.e. how far behind the local branch is). If no upstream is configured
// the command will fail — in that case 0, nil is returned.
func BehindCount(ctx context.Context, repoDir string) (int, error) {
	cmd := exec.CommandContext(ctx, "git", "-C", repoDir, "rev-list", "--count", "HEAD..@{u}")
	out, err := cmd.Output()
	if err != nil {
		slog.Debug("git: behind-count unavailable (no upstream?)", "dir", repoDir, "err", err)
		return 0, nil // no upstream configured or other non-fatal error
	}
	n, err := strconv.Atoi(strings.TrimSpace(string(out)))
	if err != nil {
		return 0, fmt.Errorf("parse behind count: %w", err)
	}
	return n, nil
}

// Pull runs `git pull --ff-only` in repoDir and returns combined stdout+stderr.
func Pull(ctx context.Context, repoDir string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", "-C", repoDir, "pull", "--ff-only")
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	err := cmd.Run()
	output := buf.String()
	if err != nil {
		return output, fmt.Errorf("git pull: %w", err)
	}
	return output, nil
}

// FileDiff describes a single file that changed between two git refs.
type FileDiff struct {
	Path   string `json:"path"`
	Status string `json:"status"` // "added" | "modified" | "deleted" | "renamed"
}

// DiffSummary returns the .tf and .tfvars files that differ between base and head,
// using `git diff --name-status base..head`. No shell interpolation — all args are
// passed as exec array elements.
func DiffSummary(ctx context.Context, repoDir, base, head string) ([]FileDiff, error) {
	cmd := exec.CommandContext(ctx, "git", "-C", repoDir, "diff", "--name-status",
		base+".."+head, "--", "*.tf", "*.tfvars")
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git diff: %w", err)
	}
	var files []FileDiff
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 2)
		if len(parts) != 2 {
			continue
		}
		statusCode := strings.ToUpper(strings.TrimSpace(parts[0]))
		path := strings.TrimSpace(parts[1])
		var status string
		switch {
		case statusCode == "A":
			status = "added"
		case statusCode == "D":
			status = "deleted"
		case strings.HasPrefix(statusCode, "R"):
			status = "renamed"
			// Renamed lines are tab-separated: R<score>\told\tnew — use the new path.
			if renamed := strings.SplitN(parts[1], "\t", 2); len(renamed) == 2 {
				path = strings.TrimSpace(renamed[1])
			}
		default:
			status = "modified"
		}
		files = append(files, FileDiff{Path: path, Status: status})
	}
	return files, nil
}

// WorkingDirFile describes a single entry from `git status --porcelain=v1`.
type WorkingDirFile struct {
	XY   string `json:"xy"` // two-char porcelain code, e.g. "M ", " M", "??"
	Path string `json:"path"`
}

// WorkingDirStatus runs `git status --porcelain=v1` in repoDir and returns the
// list of changed/untracked files. Returns an empty slice when clean.
func WorkingDirStatus(ctx context.Context, repoDir string) ([]WorkingDirFile, error) {
	cmd := exec.CommandContext(ctx, "git", "-C", repoDir, "status", "--porcelain=v1")
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git status: %w", err)
	}
	var files []WorkingDirFile
	for _, line := range strings.Split(string(out), "\n") {
		if len(line) < 4 {
			continue
		}
		xy := line[:2]
		if xy == "!!" {
			continue // skip ignored files
		}
		files = append(files, WorkingDirFile{XY: xy, Path: line[3:]})
	}
	return files, nil
}

// Checkout runs `git checkout branch` in repoDir and returns combined stdout+stderr.
func Checkout(ctx context.Context, repoDir, branch string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", "-C", repoDir, "checkout", branch)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), err
	}
	return string(out), nil
}

// Merge runs `git merge --no-edit branchName` in repoDir and returns combined
// stdout+stderr for display. No shell interpolation.
func Merge(ctx context.Context, repoDir, branchName string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", "-C", repoDir, "merge", "--no-edit", branchName)
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	err := cmd.Run()
	output := buf.String()
	if err != nil {
		return output, fmt.Errorf("git merge: %w", err)
	}
	return output, nil
}

// ListCommitsBetween returns the commits reachable from head but not from base,
// using `git log --format=...  base..head`.
func ListCommitsBetween(repoDir, base, head string) ([]Commit, error) {
	// %H = full hash, %s = subject, %an = author name, %ai = author date ISO
	cmd := exec.Command("git", "-C", repoDir, "log",
		"--format=%H\x1f%s\x1f%an\x1f%ai",
		base+".."+head)
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git log: %w", err)
	}
	var commits []Commit
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\x1f", 4)
		if len(parts) != 4 {
			continue
		}
		commits = append(commits, Commit{
			Hash:    parts[0],
			Subject: parts[1],
			Author:  parts[2],
			Date:    parts[3],
		})
	}
	return commits, nil
}
