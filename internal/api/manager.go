package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/andres/tf9/internal/config"
	"github.com/andres/tf9/internal/report"
	"github.com/andres/tf9/internal/runner"
)

type RunStatus string

const (
	StatusRunning   RunStatus = "running"
	StatusSuccess   RunStatus = "success"
	StatusFailed    RunStatus = "failed"
	StatusDenied    RunStatus = "denied"
	StatusCancelled RunStatus = "cancelled"
)

// RunRequest holds the parameters for a terraform run submitted via the web UI.
type RunRequest struct {
	Repo           string                       `json:"repo"`
	Command        string                       `json:"command"`
	ExtraArgs      []string                     `json:"extraArgs"`
	EnvFilter      string                       `json:"envFilter"`
	Profile        string                       `json:"profile"`
	NonprodOnly    bool                         `json:"nonprodOnly"`
	AutoApprove    bool                         `json:"autoApprove"`
	Parallel       bool                         `json:"parallel"`
	PromotionOrder []string                     `json:"promotionOrder,omitempty"`
	LockIDs        map[string]string            `json:"lockIds,omitempty"`
	ImportAddrs    map[string]runner.ImportSpec `json:"importAddrs,omitempty"`
	Cost           bool                         `json:"cost,omitempty"`
	PlanRunID      string                       `json:"planRunId,omitempty"`
}

// Run represents a single terraform execution.
type Run struct {
	ID             string             `json:"id"`
	StartedAt      time.Time          `json:"startedAt"`
	FinishedAt     *time.Time         `json:"finishedAt,omitempty"`
	Status         RunStatus          `json:"status"`
	Request        RunRequest         `json:"request"`
	ReportPath     string             `json:"reportPath,omitempty"`
	Results        []report.EnvResult `json:"results,omitempty"`
	GitBranch      string             `json:"gitBranch,omitempty"`
	SavedPlanReady bool               `json:"savedPlanReady,omitempty"`

	AwaitingInput bool `json:"awaitingInput"` // true while terraform is blocked on the approval prompt

	mu      sync.RWMutex
	lines   []string
	cancel  context.CancelFunc
	inputCh chan string // receives "yes"/"no" from the frontend when terraform prompts
	denied  bool        // set when the user explicitly sends "no" to the approval gate
	forced  bool        // set by ForceKill so the goroutine's finish logic does not override status
	pgid    int         // current terraform process-group leader PID, for force-kill
}

// setAwaiting records whether terraform is currently blocked on the approval gate.
func (r *Run) setAwaiting(waiting bool) {
	r.mu.Lock()
	r.AwaitingInput = waiting
	r.mu.Unlock()
}

// setPgid records the PID of the currently running terraform process group.
func (r *Run) setPgid(pid int) {
	r.mu.Lock()
	r.pgid = pid
	r.mu.Unlock()
}

// Lines returns output lines from the given offset.
func (r *Run) Lines(offset int) []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if offset >= len(r.lines) {
		return nil
	}
	out := make([]string, len(r.lines)-offset)
	copy(out, r.lines[offset:])
	return out
}

// LineCount returns the current number of captured output lines.
func (r *Run) LineCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.lines)
}

func (r *Run) appendLine(line string) {
	r.mu.Lock()
	r.lines = append(r.lines, line)
	r.mu.Unlock()
}

// SendInput feeds a user response ("yes" or "no") to a run that is waiting
// for terraform interactive approval. Returns false if the run is not waiting.
func (r *Run) SendInput(value string) bool {
	r.mu.RLock()
	ch := r.inputCh
	awaiting := r.AwaitingInput
	r.mu.RUnlock()
	if ch == nil || !awaiting {
		return false
	}
	select {
	case ch <- value:
		r.mu.Lock()
		r.AwaitingInput = false
		if strings.TrimSpace(value) != "yes" {
			r.denied = true
		}
		r.mu.Unlock()
		return true
	default:
		return false
	}
}

// lineWriter splits bytes into lines for the Run buffer.
type lineWriter struct {
	run *Run
	buf string
}

func (w *lineWriter) Write(p []byte) (int, error) {
	w.buf += string(p) // keep ANSI codes; frontend parses them for coloring
	for {
		idx := strings.IndexByte(w.buf, '\n')
		if idx == -1 {
			break
		}
		w.run.appendLine(w.buf[:idx])
		w.buf = w.buf[idx+1:]
	}
	return len(p), nil
}

// runRecord is the on-disk representation of a finished Run.
type runRecord struct {
	ID             string             `json:"id"`
	StartedAt      time.Time          `json:"startedAt"`
	FinishedAt     *time.Time         `json:"finishedAt,omitempty"`
	Status         RunStatus          `json:"status"`
	Request        RunRequest         `json:"request"`
	ReportPath     string             `json:"reportPath,omitempty"`
	Results        []report.EnvResult `json:"results,omitempty"`
	Lines          []string           `json:"lines,omitempty"`
	GitBranch      string             `json:"gitBranch,omitempty"`
	SavedPlanReady bool               `json:"savedPlanReady,omitempty"`
}

const (
	maxPersistedRuns  = 200
	maxPersistedLines = 5000 // per run — ~400 KB worst case at 80 B/line

	// defaultRunTimeout bounds how long a single terraform run may execute.
	defaultRunTimeout = 30 * time.Minute
)

// RunManager holds all runs and persists finished ones to disk.
type RunManager struct {
	mu   sync.RWMutex
	runs []*Run
	seq  int
}

// NewRunManager creates a manager and restores history from disk.
func NewRunManager() *RunManager {
	m := &RunManager{}
	m.loadFromDisk()
	return m
}

func (m *RunManager) loadFromDisk() {
	data, err := os.ReadFile(config.RunsFile())
	if err != nil {
		return // no history yet
	}
	var records []runRecord
	if err := json.Unmarshal(data, &records); err != nil {
		slog.Warn("load run history: parse failed, ignoring history", "file", config.RunsFile(), "err", err)
		return
	}
	for _, rec := range records {
		// Derive seq from ID "run-NNNN"
		if n, err := strconv.Atoi(strings.TrimPrefix(rec.ID, "run-")); err == nil && n > m.seq {
			m.seq = n
		}
		status := rec.Status
		finishedAt := rec.FinishedAt
		if status == StatusRunning {
			// Process was killed mid-run — mark as cancelled.
			status = StatusCancelled
			if finishedAt == nil {
				now := time.Now().UTC()
				finishedAt = &now
			}
		}
		run := &Run{
			ID:             rec.ID,
			StartedAt:      rec.StartedAt,
			FinishedAt:     finishedAt,
			Status:         status,
			Request:        rec.Request,
			ReportPath:     rec.ReportPath,
			Results:        rec.Results,
			GitBranch:      rec.GitBranch,
			SavedPlanReady: rec.SavedPlanReady,
			lines:          rec.Lines,
			cancel:         func() {}, // no-op for restored runs
		}
		m.runs = append(m.runs, run)
	}
}

func (m *RunManager) persist() {
	m.mu.RLock()
	snapshot := make([]*Run, len(m.runs))
	copy(snapshot, m.runs)
	m.mu.RUnlock()

	var records []runRecord
	// Walk newest-first, collect finished runs up to the cap.
	for i := len(snapshot) - 1; i >= 0 && len(records) < maxPersistedRuns; i-- {
		r := snapshot[i]
		r.mu.RLock()
		if r.Status == StatusRunning {
			r.mu.RUnlock()
			continue
		}
		lines := r.lines
		if len(lines) > maxPersistedLines {
			lines = lines[len(lines)-maxPersistedLines:]
		}
		rec := runRecord{
			ID:             r.ID,
			StartedAt:      r.StartedAt,
			FinishedAt:     r.FinishedAt,
			Status:         r.Status,
			Request:        r.Request,
			ReportPath:     r.ReportPath,
			Results:        r.Results,
			GitBranch:      r.GitBranch,
			SavedPlanReady: r.SavedPlanReady,
			Lines:          lines,
		}
		r.mu.RUnlock()
		records = append(records, rec)
	}
	// Reverse to store oldest-first so Load restores insertion order.
	for i, j := 0, len(records)-1; i < j; i, j = i+1, j-1 {
		records[i], records[j] = records[j], records[i]
	}

	data, err := json.Marshal(records)
	if err != nil {
		slog.Error("persist runs: marshal failed", "err", err)
		return
	}
	if err := os.WriteFile(config.RunsFile(), data, 0o644); err != nil {
		slog.Error("persist runs: write failed", "file", config.RunsFile(), "err", err)
	}
}

// Start launches a new terraform run in a background goroutine.
func (m *RunManager) Start(req RunRequest, searchRoot, repoLabel, reportDir string) (*Run, error) {
	m.mu.Lock()
	m.seq++
	id := fmt.Sprintf("run-%04d", m.seq)
	ctx, cancel := context.WithTimeout(context.Background(), defaultRunTimeout)

	run := &Run{
		ID:        id,
		StartedAt: time.Now().UTC(),
		Status:    StatusRunning,
		Request:   req,
		cancel:    cancel,
	}
	m.runs = append(m.runs, run)
	m.mu.Unlock()

	savePlanDir := ""
	applyPlanFiles := map[string]string{}
	if req.Command == "plan" {
		savePlanDir = filepath.Join(config.SavedPlanDir(), id)
	} else if req.Command == "apply" && req.PlanRunID != "" {
		for _, target := range resolveTargetDirs(req) {
			applyPlanFiles[target] = savedPlanPath(req.PlanRunID, target)
		}
	}

	slog.Info("run started", "id", id, "command", req.Command, "repo", req.Repo, "envFilter", req.EnvFilter, "parallel", req.Parallel)

	go func() {
		defer cancel()
		defer func() {
			if rec := recover(); rec != nil {
				run.appendLine(fmt.Sprintf("  [PANIC] %v", rec))
				now := time.Now().UTC()
				run.mu.Lock()
				if !run.forced {
					run.FinishedAt = &now
					run.Status = StatusFailed
				}
				run.AwaitingInput = false
				run.mu.Unlock()
				m.persist()
			}
		}()
		lw := &lineWriter{run: run}
		tfArgs := append([]string{}, req.ExtraArgs...)
		if req.Command == "apply" && req.PlanRunID != "" {
			run.appendLine("  [APPROVED] Reviewed plan approved for apply.")
		}

		// Create an input channel when interactive approval is needed.
		needsInteractive := (req.Command == "apply" || req.Command == "destroy" || req.Command == "auto") && !req.AutoApprove
		var inputCh chan string
		if needsInteractive {
			inputCh = make(chan string, 1)
			run.mu.Lock()
			run.inputCh = inputCh
			run.mu.Unlock()
		}

		var explicitTargets []config.RepoTarget
		if req.Repo != "" {
			if rc, err := config.LoadRepoConfig(req.Repo); err == nil && len(rc.Targets) > 0 {
				explicitTargets = rc.Targets
				repos, _ := config.LoadRepos()
				if repoRoot, ok := repos[req.Repo]; ok {
					searchRoot = repoRoot
				}
			}
		}

		run.GitBranch = gitBranch(searchRoot)

		// Resolve Infracost settings when cost estimation is requested. A missing
		// key is non-fatal: warn into the stream and run without cost.
		costEnabled := req.Cost
		var infracostKey, infracostCurrency string
		if costEnabled {
			ic, icErr := config.LoadInfracost()
			if icErr != nil {
				slog.Warn("could not load infracost settings", "err", icErr)
			}
			infracostKey = ic.APIKey
			infracostCurrency = ic.Currency
			if infracostKey == "" {
				costEnabled = false
				run.appendLine("[WARN] cost estimation requested but no Infracost API key is configured — running without cost.")
			}
		}

		baseOpts := runner.Options{
			SearchRoot:      searchRoot,
			RepoLabel:       repoLabel,
			TfArgs:          tfArgs,
			EnvFilter:       req.EnvFilter,
			ProfileOverride: req.Profile,
			NonprodOnly:     req.NonprodOnly,
			ReportDir:       reportDir,
			ExplicitTargets: explicitTargets,
			Output:          io.MultiWriter(lw),
			Ctx:             ctx,
			Parallel:        req.Parallel,
			PromotionOrder:  req.PromotionOrder,
			LockIDs:         req.LockIDs,
			ImportAddrs:     req.ImportAddrs,
			AutoApprove:     req.AutoApprove,
			OnApprovalWait:  run.setAwaiting,
			OnProcStart:     run.setPgid,
			Cost:            costEnabled,
			InfracostKey:    infracostKey,
			Currency:        infracostCurrency,
			SavePlanDir:     savePlanDir,
			ApplyPlanFiles:  applyPlanFiles,
		}

		var results []report.EnvResult
		var reportFilename string
		var err error

		if req.Command == "auto" {
			// Envs whose plan reported no changes — their apply phase is skipped.
			skipApply := map[string]bool{}
			for i, step := range []string{"init", "plan", "apply"} {
				run.appendLine("")
				run.appendLine(fmt.Sprintf("=== auto: step %d/3 — %s ===", i+1, step))
				opts := baseOpts
				opts.TfCommand = step
				opts.Parallel = false // apply must be sequential; keep all steps consistent
				if step == "apply" {
					opts.InputCh = inputCh
					opts.SkipApply = skipApply
				}
				var stepRes []report.EnvResult
				var stepReport string
				stepRes, stepReport, err = runner.Run(opts)
				// After the plan phase, record which envs had no changes so the
				// apply phase can skip them with an explicit "Skipping Apply" note.
				if step == "plan" {
					for _, res := range stepRes {
						if res.NoChanges && !res.Failed {
							skipApply[res.Env] = true
						}
					}
				}
				if lw.buf != "" {
					run.appendLine(lw.buf)
					lw.buf = ""
				}
				if stepRes != nil {
					results = stepRes
				}
				if stepReport != "" {
					reportFilename = stepReport
				}
				if err != nil {
					break
				}
				run.mu.RLock()
				wasDenied := run.denied
				run.mu.RUnlock()
				if wasDenied {
					break
				}
			}
		} else {
			results, reportFilename, err = runner.Run(runner.Options{
				SearchRoot:      searchRoot,
				RepoLabel:       repoLabel,
				TfCommand:       req.Command,
				TfArgs:          tfArgs,
				EnvFilter:       req.EnvFilter,
				ProfileOverride: req.Profile,
				NonprodOnly:     req.NonprodOnly,
				ReportDir:       reportDir,
				ExplicitTargets: explicitTargets,
				Output:          io.MultiWriter(lw),
				Ctx:             ctx,
				Parallel:        req.Parallel,
				PromotionOrder:  req.PromotionOrder,
				LockIDs:         req.LockIDs,
				ImportAddrs:     req.ImportAddrs,
				AutoApprove:     req.AutoApprove,
				InputCh:         inputCh,
				OnApprovalWait:  run.setAwaiting,
				OnProcStart:     run.setPgid,
				Cost:            costEnabled,
				InfracostKey:    infracostKey,
				Currency:        infracostCurrency,
				SavePlanDir:     savePlanDir,
				ApplyPlanFiles:  applyPlanFiles,
			})
		}

		if lw.buf != "" {
			run.appendLine(lw.buf)
		}
		approvalDenied := errors.Is(err, runner.ErrApprovalDenied)
		if err != nil && ctx.Err() == nil && !approvalDenied {
			run.appendLine("  [ERROR] " + err.Error())
		}

		now := time.Now().UTC()
		run.mu.Lock()
		run.AwaitingInput = false
		if !run.forced {
			// A force kill has already finalized the record; don't override it.
			run.FinishedAt = &now
			run.Results = results
			run.ReportPath = reportFilename
			if ctx.Err() != nil {
				run.Status = StatusCancelled
			} else if err != nil {
				if run.denied || approvalDenied {
					run.Status = StatusDenied
				} else {
					run.Status = StatusFailed
				}
			} else {
				run.Status = StatusSuccess
				if req.Command == "plan" && len(results) > 0 {
					run.SavedPlanReady = true
				}
			}
		}
		finalStatus := run.Status
		run.mu.Unlock()

		logFinish := slog.Info
		if err != nil && !approvalDenied {
			logFinish = slog.Warn
		}
		logFinish("run finished", "id", id, "command", req.Command, "status", finalStatus,
			"duration", now.Sub(run.StartedAt), "err", errString(err))

		m.persist()
	}()

	return run, nil
}

func savedPlanPath(runID, target string) string {
	return runner.SavedPlanFilePath(filepath.Join(config.SavedPlanDir(), runID), target)
}

// PrepareReviewedApply validates and replaces an apply request with the exact
// target selection and execution metadata from a successful reviewed plan.
func (m *RunManager) PrepareReviewedApply(req RunRequest) (RunRequest, error) {
	if req.PlanRunID == "" {
		return req, fmt.Errorf("apply requires planRunId; review a successful plan and use Apply reviewed plan")
	}
	planRun, ok := m.Get(req.PlanRunID)
	if !ok {
		return req, fmt.Errorf("reviewed plan run %q was not found", req.PlanRunID)
	}
	planRun.mu.RLock()
	defer planRun.mu.RUnlock()
	if planRun.Status != StatusSuccess || planRun.Request.Command != "plan" || !planRun.SavedPlanReady {
		return req, fmt.Errorf("run %q does not have a successful saved plan", req.PlanRunID)
	}
	targets := make([]string, 0, len(planRun.Results))
	for _, result := range planRun.Results {
		if result.Failed {
			continue
		}
		targets = append(targets, result.Env)
	}
	if len(targets) == 0 {
		return req, fmt.Errorf("run %q has no saved plan targets", req.PlanRunID)
	}
	for _, target := range targets {
		if _, err := os.Stat(savedPlanPath(planRun.ID, target)); err != nil {
			return req, fmt.Errorf("saved plan for target %q is unavailable: %w", target, err)
		}
	}
	prepared := planRun.Request
	prepared.Command = "apply"
	prepared.PlanRunID = planRun.ID
	prepared.EnvFilter = strings.Join(targets, ",")
	prepared.PromotionOrder = targets
	prepared.ExtraArgs = nil
	prepared.Parallel = false
	prepared.AutoApprove = true
	prepared.Cost = false
	return prepared, nil
}

// errString renders err for logging, empty when nil.
func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

// Get returns a run by ID.
func (m *RunManager) Get(id string) (*Run, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, r := range m.runs {
		if r.ID == id {
			return r, true
		}
	}
	return nil, false
}

// List returns a page of runs newest-first along with the total run count.
func (m *RunManager) List(page, limit int) ([]*Run, int) {
	return m.ListFiltered(page, limit, nil)
}

// ListFiltered returns a page of runs newest-first that satisfy the optional
// match predicate, along with the total matching count. Filtering happens
// before pagination so page/total reflect the filtered set. A nil match
// keeps every run.
func (m *RunManager) ListFiltered(page, limit int, match func(*Run) bool) ([]*Run, int) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	ordered := make([]*Run, 0, len(m.runs))
	for i := len(m.runs) - 1; i >= 0; i-- { // newest-first
		r := m.runs[i]
		if match != nil {
			r.mu.RLock()
			ok := match(r)
			r.mu.RUnlock()
			if !ok {
				continue
			}
		}
		ordered = append(ordered, r)
	}
	total := len(ordered)
	if limit <= 0 {
		return ordered, total
	}
	start := (page - 1) * limit
	if start < 0 || start >= total {
		return []*Run{}, total
	}
	end := start + limit
	if end > total {
		end = total
	}
	return ordered[start:end], total
}

// gitBranch returns the current git branch name for the repo at dir.
// Returns an empty string if dir is not a git repo or git is unavailable.
func gitBranch(dir string) string {
	out, err := exec.Command("git", "-C", dir, "rev-parse", "--abbrev-ref", "HEAD").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// AppendCLIRun records a completed CLI-initiated run in the shared run history
// file so it appears in the web UI alongside server-initiated runs.
// Safe to call when no web server is running — writes directly to disk.
func AppendCLIRun(req RunRequest, startedAt, finishedAt time.Time, status RunStatus, lines []string, reportPath, branch string) {
	// Read existing records (best-effort; start fresh if unreadable).
	var records []runRecord
	if data, err := os.ReadFile(config.RunsFile()); err == nil {
		if err := json.Unmarshal(data, &records); err != nil {
			slog.Warn("append cli run: existing history unreadable, starting fresh", "file", config.RunsFile(), "err", err)
			records = nil
		}
	}

	// Deduplicate: if this CLI run was already appended (e.g. retry), skip.
	id := fmt.Sprintf("run-cli-%s", startedAt.UTC().Format("20060102-150405"))
	for _, r := range records {
		if r.ID == id {
			return
		}
	}

	if len(lines) > maxPersistedLines {
		lines = lines[len(lines)-maxPersistedLines:]
	}
	fin := finishedAt
	records = append(records, runRecord{
		ID:         id,
		StartedAt:  startedAt,
		FinishedAt: &fin,
		Status:     status,
		Request:    req,
		ReportPath: reportPath,
		GitBranch:  branch,
		Lines:      lines,
	})

	// Trim oldest entries beyond the cap.
	if len(records) > maxPersistedRuns {
		records = records[len(records)-maxPersistedRuns:]
	}

	data, err := json.Marshal(records)
	if err != nil {
		slog.Error("append cli run: marshal failed", "err", err)
		return
	}
	if err := os.MkdirAll(filepath.Dir(config.RunsFile()), 0o755); err != nil {
		slog.Error("append cli run: mkdir failed", "dir", filepath.Dir(config.RunsFile()), "err", err)
		return
	}
	if err := os.WriteFile(config.RunsFile(), data, 0o644); err != nil {
		slog.Error("append cli run: write failed", "file", config.RunsFile(), "err", err)
	}
}

// Cancel stops a running run.
func (m *RunManager) Cancel(id string) bool {
	run, ok := m.Get(id)
	if !ok {
		return false
	}
	run.mu.RLock()
	isRunning := run.Status == StatusRunning
	run.mu.RUnlock()
	if isRunning {
		run.cancel()
		return true
	}
	return false
}

// ForceKill unconditionally finalizes a running run: it marks the record as
// cancelled immediately (so the UI always unsticks, even if the goroutine is
// wedged or dead), cancels the context, and best-effort SIGKILLs the terraform
// process group. Returns false if the run is unknown or already finished.
func (m *RunManager) ForceKill(id string) bool {
	run, ok := m.Get(id)
	if !ok {
		return false
	}
	run.mu.Lock()
	if run.Status != StatusRunning {
		run.mu.Unlock()
		return false
	}
	now := time.Now().UTC()
	run.forced = true
	run.Status = StatusCancelled
	run.FinishedAt = &now
	run.AwaitingInput = false
	pgid := run.pgid
	cancel := run.cancel
	run.mu.Unlock()

	run.appendLine("  [force-killed] run terminated by user")
	if cancel != nil {
		cancel()
	}
	runner.KillProcessGroup(pgid)
	m.persist()
	return true
}
