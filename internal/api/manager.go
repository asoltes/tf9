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
	StatusRunning        RunStatus = "running"
	StatusSuccess        RunStatus = "success"
	StatusPartialSuccess RunStatus = "partial_success"
	StatusFailed         RunStatus = "failed"
	StatusDenied         RunStatus = "denied"
	StatusCancelled      RunStatus = "cancelled"
)

// FinalRunStatus classifies a completed runner invocation. Mixed target
// outcomes are partial success, while cancellation and denial retain their
// dedicated statuses.
func FinalRunStatus(runErr, contextErr error, denied bool, results []report.EnvResult) RunStatus {
	if contextErr != nil {
		return StatusCancelled
	}
	if denied || errors.Is(runErr, runner.ErrApprovalDenied) {
		return StatusDenied
	}
	if runErr == nil {
		return StatusSuccess
	}
	var succeeded, failed bool
	for _, result := range results {
		if result.Failed {
			failed = true
		} else {
			succeeded = true
		}
	}
	if succeeded && failed {
		return StatusPartialSuccess
	}
	return StatusFailed
}

// RunRequest holds the parameters for a terraform run submitted via the web UI.
type RunRequest struct {
	Repo              string                       `json:"repo"`
	Command           string                       `json:"command"`
	ExtraArgs         []string                     `json:"extraArgs"`
	ResourceAddresses []string                     `json:"resourceAddresses,omitempty"`
	EnvFilter         string                       `json:"envFilter"`
	Profile           string                       `json:"profile"`
	NonprodOnly       bool                         `json:"nonprodOnly"`
	AutoApprove       bool                         `json:"autoApprove"`
	Parallel          bool                         `json:"parallel"`
	PromotionOrder    []string                     `json:"promotionOrder,omitempty"`
	LockIDs           map[string]string            `json:"lockIds,omitempty"`
	ImportAddrs       map[string]runner.ImportSpec `json:"importAddrs,omitempty"`
	PlanRunID         string                       `json:"planRunId,omitempty"`
	Ticket            string                       `json:"ticket,omitempty"`
}

// Run represents a single terraform execution.
type Run struct {
	ID                 string             `json:"id"`
	StartedAt          time.Time          `json:"startedAt"`
	FinishedAt         *time.Time         `json:"finishedAt,omitempty"`
	Status             RunStatus          `json:"status"`
	Request            RunRequest         `json:"request"`
	ReportPath         string             `json:"reportPath,omitempty"`
	Results            []report.EnvResult `json:"results,omitempty"`
	GitBranch          string             `json:"gitBranch,omitempty"`
	SavedPlanReady     bool               `json:"savedPlanReady,omitempty"`
	SavedPlanExpiresAt *time.Time         `json:"savedPlanExpiresAt,omitempty"`
	AppliedByRunID     string             `json:"appliedByRunId,omitempty"` // apply run that consumed this plan's saved plan

	AwaitingInput     bool       `json:"awaitingInput"` // true while terraform is blocked on the approval prompt
	ApprovalExpiresAt *time.Time `json:"approvalExpiresAt,omitempty"`

	mu                  sync.RWMutex
	lines               []string
	cancel              context.CancelFunc
	inputCh             chan string // receives "yes"/"no" from the frontend when terraform prompts
	approvalTimeout     time.Duration
	reviewedPlanTimeout time.Duration
	approvalGeneration  uint64
	denied              bool // set when the user explicitly sends "no" to the approval gate
	forced              bool // set by ForceKill so the goroutine's finish logic does not override status
	pgid                int  // current terraform process-group leader PID, for force-kill
	supervised          bool // true when driven by a detached supervisor process (survives restart)
	supervisorPID       int  // pid of the detached supervisor, for cross-process cancel/kill
	tailOffset          int  // byte offset consumed from the supervisor's output log
}

// setAwaiting records whether terraform is currently blocked on the approval gate.
func (r *Run) setAwaiting(waiting bool) {
	r.mu.Lock()
	r.approvalGeneration++
	generation := r.approvalGeneration
	r.AwaitingInput = waiting
	r.ApprovalExpiresAt = nil
	timeout := r.approvalTimeout
	if waiting && timeout > 0 {
		expiresAt := time.Now().UTC().Add(timeout)
		r.ApprovalExpiresAt = &expiresAt
	}
	r.mu.Unlock()
	if waiting && timeout > 0 {
		go func() {
			timer := time.NewTimer(timeout)
			defer timer.Stop()
			<-timer.C
			r.expireApproval(generation)
		}()
	}
}

func (r *Run) expireApproval(generation uint64) {
	r.mu.RLock()
	active := r.AwaitingInput && r.approvalGeneration == generation
	r.mu.RUnlock()
	if !active || !r.SendInput("no") {
		return
	}
	r.appendLine("  [DENIED] approval timed out before input was received")
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
	r.mu.Lock()
	if !r.AwaitingInput {
		r.mu.Unlock()
		return false
	}
	supervised := r.supervised
	ch := r.inputCh
	if !supervised && ch == nil {
		r.mu.Unlock()
		return false
	}
	// Optimistically clear the awaiting flag so the UI unsticks immediately.
	r.AwaitingInput = false
	r.ApprovalExpiresAt = nil
	if strings.TrimSpace(value) != "yes" {
		r.denied = true
	}
	id := r.ID
	r.mu.Unlock()

	if supervised {
		// Deliver to the detached supervisor via its approval FIFO.
		if err := writeApprovalInput(id, value); err != nil {
			slog.Warn("could not deliver approval input to supervisor", "id", id, "err", err)
			r.mu.Lock()
			r.AwaitingInput = true
			r.mu.Unlock()
			return false
		}
		return true
	}

	select {
	case ch <- value:
		return true
	default:
		// Could not deliver; restore the awaiting flag.
		r.mu.Lock()
		r.AwaitingInput = true
		r.mu.Unlock()
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
	ID                 string             `json:"id"`
	StartedAt          time.Time          `json:"startedAt"`
	FinishedAt         *time.Time         `json:"finishedAt,omitempty"`
	Status             RunStatus          `json:"status"`
	Request            RunRequest         `json:"request"`
	ReportPath         string             `json:"reportPath,omitempty"`
	Results            []report.EnvResult `json:"results,omitempty"`
	Lines              []string           `json:"lines,omitempty"`
	GitBranch          string             `json:"gitBranch,omitempty"`
	SavedPlanReady     bool               `json:"savedPlanReady,omitempty"`
	SavedPlanExpiresAt *time.Time         `json:"savedPlanExpiresAt,omitempty"`
	AppliedByRunID     string             `json:"appliedByRunId,omitempty"`
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
		run := &Run{
			ID:                 rec.ID,
			StartedAt:          rec.StartedAt,
			FinishedAt:         rec.FinishedAt,
			Status:             rec.Status,
			Request:            rec.Request,
			ReportPath:         rec.ReportPath,
			Results:            rec.Results,
			GitBranch:          rec.GitBranch,
			SavedPlanReady:     rec.SavedPlanReady,
			SavedPlanExpiresAt: rec.SavedPlanExpiresAt,
			AppliedByRunID:     rec.AppliedByRunID,
			lines:              rec.Lines,
			cancel:             func() {}, // replaced below if reattached
		}
		if rec.Status == StatusRunning {
			m.reattachOrFinalize(run)
		}
		m.runs = append(m.runs, run)
	}
}

// reattachOrFinalize handles a run that was StatusRunning when this server last
// stopped. If its supervisor is still alive, the run is reattached: a tailer is
// restarted from the current log offset so output keeps streaming and the
// approval gate keeps working. Otherwise the run is finalized from its status
// file (if the supervisor finished while we were down) or marked failed.
func (m *RunManager) reattachOrFinalize(run *Run) {
	dir := config.RunDir(run.ID)

	// A terminal status written by the supervisor wins regardless of liveness.
	if data, err := os.ReadFile(filepath.Join(dir, statusFile)); err == nil {
		var res supervisedResult
		if json.Unmarshal(data, &res) == nil && res.Status != "" {
			run.Status = res.Status
			run.FinishedAt = &res.FinishedAt
			run.Results = res.Results
			run.ReportPath = res.ReportPath
			run.SavedPlanReady = res.SavedPlanReady
			run.SavedPlanExpiresAt = res.SavedPlanExpiresAt
			run.lines = mergeLogLines(dir, run.lines)
			return
		}
	}

	var meta runMeta
	if err := readJSON(filepath.Join(dir, metaFile), &meta); err == nil && supervisorAlive(meta.SupervisorPID) {
		// Live supervisor — reattach and keep streaming.
		run.supervised = true
		run.supervisorPID = meta.SupervisorPID
		run.pgid = meta.Pgid
		if cfg, cerr := config.Load(); cerr == nil {
			run.approvalTimeout = cfg.Web.ApprovalTimeout()
			run.reviewedPlanTimeout = cfg.Web.ReviewedPlanTimeout()
		}
		run.lines = mergeLogLines(dir, run.lines)
		run.tailOffset = logSize(dir)
		// If the run was sitting at the approval gate when the server died, the
		// sentinel is already in the log and the tailer (starting at end-of-log)
		// will not re-emit it — so restore the awaiting state directly.
		if awaitingFromLines(run.lines) {
			run.setAwaiting(true)
		}
		pid := meta.SupervisorPID
		run.cancel = func() { terminateRun(pid) }
		slog.Info("reattaching to live supervised run", "id", run.ID, "supervisorPid", pid, "awaitingInput", run.AwaitingInput)
		go m.tail(run)
		return
	}

	// No status and no live supervisor — the run was lost with the server.
	now := time.Now().UTC()
	run.Status = StatusFailed
	run.FinishedAt = &now
	run.lines = mergeLogLines(dir, run.lines)
	run.lines = append(run.lines, "  [server restarted; run state lost]")
}

// awaitingFromLines reports whether the output ends in an unresolved approval
// gate: the last approval sentinel seen has no clear sentinel after it.
func awaitingFromLines(lines []string) bool {
	awaiting := false
	for _, line := range lines {
		switch strings.TrimSpace(line) {
		case runner.ApprovalSentinel:
			awaiting = true
		case runner.ApprovalClearSentinel:
			awaiting = false
		}
	}
	return awaiting
}

// logSize returns the current size of a run's output log, or 0 if absent.
func logSize(dir string) int {
	info, err := os.Stat(filepath.Join(dir, outputLog))
	if err != nil {
		return 0
	}
	return int(info.Size())
}

// mergeLogLines replaces persisted lines with the fuller on-disk output log when
// one exists (the supervisor's log is authoritative and may contain output
// produced after the last persist). Falls back to the persisted lines.
func mergeLogLines(dir string, persisted []string) []string {
	data, err := os.ReadFile(filepath.Join(dir, outputLog))
	if err != nil {
		return persisted
	}
	lines := strings.Split(strings.TrimSuffix(string(data), "\n"), "\n")
	if len(lines) == 1 && lines[0] == "" {
		return persisted
	}
	return lines
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
		// Skip in-flight runs unless they are supervised: a supervised run must be
		// persisted as running so a restart can rediscover and reattach to it. Its
		// output lives in the supervisor's output log, so we omit Lines here.
		if r.Status == StatusRunning && !r.supervised {
			r.mu.RUnlock()
			continue
		}
		lines := r.lines
		if len(lines) > maxPersistedLines {
			lines = lines[len(lines)-maxPersistedLines:]
		}
		rec := runRecord{
			ID:                 r.ID,
			StartedAt:          r.StartedAt,
			FinishedAt:         r.FinishedAt,
			Status:             r.Status,
			Request:            r.Request,
			ReportPath:         r.ReportPath,
			Results:            r.Results,
			GitBranch:          r.GitBranch,
			SavedPlanReady:     r.SavedPlanReady,
			SavedPlanExpiresAt: r.SavedPlanExpiresAt,
			AppliedByRunID:     r.AppliedByRunID,
			Lines:              lines,
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

// Start launches a new terraform run. On unix the run is executed by a detached
// supervisor process so it survives this server being killed/restarted; the
// server tails the supervisor's output log and reattaches on startup. On
// platforms without the supervisor it falls back to running in-process.
func (m *RunManager) Start(req RunRequest, searchRoot, repoLabel, reportDir string, web config.WebConfig) (*Run, error) {
	m.mu.Lock()
	m.seq++
	id := fmt.Sprintf("run-%04d", m.seq)
	m.mu.Unlock()

	params := superviseParams{
		ID:                  id,
		Request:             req,
		SearchRoot:          searchRoot,
		RepoLabel:           repoLabel,
		ReportDir:           reportDir,
		TicketURL:           web.TicketURLFor(req.Ticket),
		GitBranch:           gitBranch(searchRoot),
		ApprovalTimeout:     web.ApprovalTimeout(),
		ReviewedPlanTimeout: web.ReviewedPlanTimeout(),
		ParallelWorkers:     web.EffectiveParallelWorkers(),
	}

	if supervisorSupported {
		return m.startSupervised(id, params)
	}
	return m.startInProcess(id, params)
}

// startSupervised launches a detached supervisor for the run and starts a tailer
// that mirrors its output log into the in-memory Run so SSE and the UI work
// unchanged.
func (m *RunManager) startSupervised(id string, params superviseParams) (*Run, error) {
	run := &Run{
		ID:                  id,
		StartedAt:           time.Now().UTC(),
		Status:              StatusRunning,
		Request:             params.Request,
		GitBranch:           params.GitBranch,
		approvalTimeout:     params.ApprovalTimeout,
		reviewedPlanTimeout: params.ReviewedPlanTimeout,
		supervised:          true,
		cancel:              func() {},
	}

	m.mu.Lock()
	m.runs = append(m.runs, run)
	m.mu.Unlock()

	// Persist immediately as running so a restart that happens before completion
	// can discover and reattach to this run.
	m.persist()

	pid, err := launchSupervisor(id, params)
	if err != nil {
		now := time.Now().UTC()
		run.mu.Lock()
		run.Status = StatusFailed
		run.FinishedAt = &now
		run.mu.Unlock()
		run.appendLine("  [ERROR] could not launch run supervisor: " + err.Error())
		m.persist()
		return run, nil
	}
	run.mu.Lock()
	run.supervisorPID = pid
	run.cancel = func() { terminateRun(pid) }
	run.mu.Unlock()

	slog.Info("supervised run started", "id", id, "command", params.Request.Command, "repo", params.Request.Repo, "supervisorPid", pid)
	go m.tail(run)
	return run, nil
}

// startInProcess runs the orchestration in a goroutine within this server
// process (non-unix fallback). Output is buffered in memory only and the run
// does not survive a server restart.
func (m *RunManager) startInProcess(id string, params superviseParams) (*Run, error) {
	ctx, cancel := context.WithTimeout(context.Background(), defaultRunTimeout)
	run := &Run{
		ID:                  id,
		StartedAt:           time.Now().UTC(),
		Status:              StatusRunning,
		Request:             params.Request,
		GitBranch:           params.GitBranch,
		cancel:              cancel,
		approvalTimeout:     params.ApprovalTimeout,
		reviewedPlanTimeout: params.ReviewedPlanTimeout,
	}

	req := params.Request
	needsInteractive := (req.Command == "apply" || req.Command == "destroy" || req.Command == "auto") && !req.AutoApprove
	if needsInteractive {
		run.inputCh = make(chan string, 1)
	}

	m.mu.Lock()
	m.runs = append(m.runs, run)
	m.mu.Unlock()

	go func() {
		defer cancel()
		lw := &lineWriter{run: run}
		var inCh <-chan string
		if run.inputCh != nil {
			inCh = run.inputCh
		}
		res := executeRun(ctx, params, lw, inCh, run.setPgid, run.setAwaiting)
		if lw.buf != "" {
			run.appendLine(lw.buf)
		}
		run.mu.Lock()
		run.AwaitingInput = false
		run.ApprovalExpiresAt = nil
		if !run.forced {
			run.FinishedAt = &res.FinishedAt
			run.Results = res.Results
			run.ReportPath = res.ReportPath
			run.Status = res.Status
			run.SavedPlanReady = res.SavedPlanReady
			run.SavedPlanExpiresAt = res.SavedPlanExpiresAt
		}
		run.mu.Unlock()
		m.persist()
	}()

	return run, nil
}

func savedPlanPath(runID, target string) string {
	return runner.SavedPlanFilePath(filepath.Join(config.SavedPlanDir(), runID), target)
}

func graphPath(runID string) string {
	return filepath.Join(config.SavedPlanDir(), runID, "graph.json")
}

// tail mirrors a supervised run's on-disk output log into the in-memory Run
// (so SSE streaming works unchanged) and finalizes the Run when the supervisor
// writes status.json. It is safe to start from any byte offset, so it both
// follows a freshly launched run and reattaches to one already in progress after
// a server restart. It returns when the run is finalized.
func (m *RunManager) tail(run *Run) {
	dir := config.RunDir(run.ID)
	logPath := filepath.Join(dir, outputLog)
	statusPath := filepath.Join(dir, statusFile)

	run.mu.RLock()
	offset := int64(run.tailOffset)
	run.mu.RUnlock()

	var carry string
	poll := time.NewTicker(200 * time.Millisecond)
	defer poll.Stop()

	for {
		// Drain any new bytes from the log.
		if f, err := os.Open(logPath); err == nil {
			if _, serr := f.Seek(offset, io.SeekStart); serr == nil {
				buf := make([]byte, 32*1024)
				for {
					n, rerr := f.Read(buf)
					if n > 0 {
						offset += int64(n)
						carry += string(buf[:n])
						for {
							idx := strings.IndexByte(carry, '\n')
							if idx == -1 {
								break
							}
							m.ingestLine(run, carry[:idx])
							carry = carry[idx+1:]
						}
					}
					if rerr != nil {
						break
					}
				}
			}
			f.Close()
		}

		// Finalize when the supervisor has written its terminal status.
		if data, err := os.ReadFile(statusPath); err == nil {
			var res supervisedResult
			if jerr := json.Unmarshal(data, &res); jerr == nil {
				if carry != "" {
					m.ingestLine(run, carry)
					carry = ""
				}
				run.mu.Lock()
				run.tailOffset = int(offset)
				if !run.forced {
					run.FinishedAt = &res.FinishedAt
					run.Results = res.Results
					run.ReportPath = res.ReportPath
					run.Status = res.Status
					run.SavedPlanReady = res.SavedPlanReady
					run.SavedPlanExpiresAt = res.SavedPlanExpiresAt
				}
				run.AwaitingInput = false
				run.ApprovalExpiresAt = nil
				finalStatus := run.Status
				run.mu.Unlock()
				slog.Info("supervised run finalized", "id", run.ID, "status", finalStatus)
				m.persist()
				return
			}
		}

		// Detect a dead supervisor with no status — an orphaned run.
		run.mu.RLock()
		supPID := run.supervisorPID
		forced := run.forced
		run.mu.RUnlock()
		if forced {
			return
		}
		if supPID > 0 && !supervisorAlive(supPID) {
			// Give the status file a brief grace window in case the supervisor is
			// mid-write, then re-check before declaring the run orphaned.
			time.Sleep(300 * time.Millisecond)
			if _, err := os.Stat(statusPath); err == nil {
				continue
			}
			m.ingestLine(run, "  [ERROR] run supervisor exited without recording a result")
			now := time.Now().UTC()
			run.mu.Lock()
			if !run.forced {
				run.Status = StatusFailed
				run.FinishedAt = &now
				run.AwaitingInput = false
				run.ApprovalExpiresAt = nil
			}
			run.mu.Unlock()
			slog.Warn("supervised run orphaned", "id", run.ID, "supervisorPid", supPID)
			m.persist()
			return
		}

		<-poll.C
	}
}

// ingestLine records one output line into the Run and updates approval state
// when it observes the approval sentinels emitted by the runner.
func (m *RunManager) ingestLine(run *Run, line string) {
	run.appendLine(line)
	switch strings.TrimSpace(line) {
	case runner.ApprovalSentinel:
		run.setAwaiting(true)
	case runner.ApprovalClearSentinel:
		run.mu.Lock()
		run.AwaitingInput = false
		run.ApprovalExpiresAt = nil
		run.mu.Unlock()
	}
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
	if planRun.SavedPlanExpiresAt != nil && !time.Now().UTC().Before(*planRun.SavedPlanExpiresAt) {
		return req, fmt.Errorf("reviewed plan from run %q has expired; run plan again", req.PlanRunID)
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
	if ticket := strings.TrimSpace(req.Ticket); ticket != "" {
		prepared.Ticket = ticket
	}
	prepared.Command = "apply"
	prepared.PlanRunID = planRun.ID
	prepared.EnvFilter = strings.Join(targets, ",")
	prepared.PromotionOrder = targets
	prepared.ExtraArgs = nil
	prepared.Parallel = req.Parallel
	prepared.AutoApprove = true
	return prepared, nil
}

// MarkPlanConsumed clears the saved-plan availability on a reviewed plan run
// once its plan has been applied, so the "Apply reviewed plan" action no longer
// appears for it and the same plan cannot be applied twice. It records the apply
// run id on the plan for bidirectional traceability.
func (m *RunManager) MarkPlanConsumed(planRunID, applyRunID string) {
	run, ok := m.Get(planRunID)
	if !ok {
		return
	}
	run.mu.Lock()
	run.SavedPlanReady = false
	run.SavedPlanExpiresAt = nil
	run.AppliedByRunID = applyRunID
	run.mu.Unlock()
	m.persist()
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
func AppendCLIRun(req RunRequest, startedAt, finishedAt time.Time, status RunStatus, lines []string, reportPath, branch string) string {
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
			return id
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
		return ""
	}
	if err := os.MkdirAll(filepath.Dir(config.RunsFile()), 0o755); err != nil {
		slog.Error("append cli run: mkdir failed", "dir", filepath.Dir(config.RunsFile()), "err", err)
		return ""
	}
	if err := os.WriteFile(config.RunsFile(), data, 0o644); err != nil {
		slog.Error("append cli run: write failed", "file", config.RunsFile(), "err", err)
		return ""
	}
	return id
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
	run.ApprovalExpiresAt = nil
	pgid := run.pgid
	cancel := run.cancel
	supervised := run.supervised
	supPID := run.supervisorPID
	run.mu.Unlock()

	run.appendLine("  [force-killed] run terminated by user")
	if cancel != nil {
		cancel()
	}
	if supervised {
		// The server never received OnProcStart for a detached run, so recover the
		// terraform process group from the supervisor's meta file. Kill the whole
		// terraform tree and the supervisor itself.
		var meta runMeta
		if readJSON(filepath.Join(config.RunDir(id), metaFile), &meta) == nil && meta.Pgid > 0 {
			pgid = meta.Pgid
		}
		killTerraformGroup(pgid)
		killSupervisor(supPID)
	} else {
		runner.KillProcessGroup(pgid)
	}
	m.persist()
	return true
}
