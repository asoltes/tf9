package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/andres/tf9/internal/config"
	graphdata "github.com/andres/tf9/internal/graph"
	"github.com/andres/tf9/internal/report"
	"github.com/andres/tf9/internal/runner"
)

// Supervised-run artifact filenames, all under config.RunDir(id).
const (
	requestFile = "request.json"
	statusFile  = "status.json"
	metaFile    = "meta.json"
	outputLog   = "output.log"
	inputFifo   = "input.fifo"
)

// superviseParams is the resolved, serializable input to a supervised run.
// The server writes it to request.json before launching the supervisor.
type superviseParams struct {
	ID                  string        `json:"id"`
	Request             RunRequest    `json:"request"`
	SearchRoot          string        `json:"searchRoot"`
	RepoLabel           string        `json:"repoLabel"`
	ReportDir           string        `json:"reportDir"`
	TicketURL           string        `json:"ticketUrl"`
	GitBranch           string        `json:"gitBranch"`
	ApprovalTimeout     time.Duration `json:"approvalTimeout"`
	ReviewedPlanTimeout time.Duration `json:"reviewedPlanTimeout"`
}

// runMeta records the live process identifiers of a supervised run so the
// server can signal or reap the terraform tree even after a restart.
type runMeta struct {
	SupervisorPID int `json:"supervisorPid"`
	Pgid          int `json:"pgid"` // terraform process-group leader
}

// supervisedResult is the terminal outcome the supervisor writes to status.json.
type supervisedResult struct {
	Status             RunStatus          `json:"status"`
	Results            []report.EnvResult `json:"results,omitempty"`
	ReportPath         string             `json:"reportPath,omitempty"`
	FinishedAt         time.Time          `json:"finishedAt"`
	SavedPlanReady     bool               `json:"savedPlanReady,omitempty"`
	SavedPlanExpiresAt *time.Time         `json:"savedPlanExpiresAt,omitempty"`
}

// writeJSONAtomic marshals v and writes it to path via a temp file + rename so
// a reader never observes a partially written document.
func writeJSONAtomic(path string, v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func readJSON(path string, v any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, v)
}

// readInputFifo reads newline-delimited approval values ("yes"/"no") from the
// run's FIFO and forwards each to ch. Opening a FIFO for reading blocks until a
// writer appears and returns EOF when the writer closes, so it reopens in a loop
// to accept successive approvals across the run's lifetime. It exits when the
// context is cancelled.
func readInputFifo(ctx context.Context, path string, ch chan<- string) {
	for {
		if ctx.Err() != nil {
			return
		}
		f, err := os.OpenFile(path, os.O_RDONLY, 0)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			slog.Debug("supervisor: could not open input fifo", "path", path, "err", err)
			time.Sleep(100 * time.Millisecond)
			continue
		}
		buf := make([]byte, 256)
		var acc strings.Builder
		for {
			n, rerr := f.Read(buf)
			if n > 0 {
				acc.Write(buf[:n])
				for {
					s := acc.String()
					idx := strings.IndexByte(s, '\n')
					if idx == -1 {
						break
					}
					value := strings.TrimSpace(s[:idx])
					acc.Reset()
					acc.WriteString(s[idx+1:])
					if value != "" {
						select {
						case ch <- value:
						case <-ctx.Done():
							f.Close()
							return
						}
					}
				}
			}
			if rerr != nil {
				break
			}
		}
		f.Close()
	}
}

// RunSupervisor is the entry point for `tf9 __supervise <id>`. It executes the
// run described by request.json in config.RunDir(id), streaming output to
// output.log and writing the terminal outcome to status.json. It is designed to
// outlive the parent tf9 server: the caller launches it detached (own session).
func RunSupervisor(id string) error {
	dir := config.RunDir(id)

	var params superviseParams
	if err := readJSON(filepath.Join(dir, requestFile), &params); err != nil {
		return fmt.Errorf("read supervised run request: %w", err)
	}

	logFile, err := os.OpenFile(filepath.Join(dir, outputLog), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return fmt.Errorf("open output log: %w", err)
	}
	defer logFile.Close()

	meta := runMeta{SupervisorPID: os.Getpid()}
	if err := writeJSONAtomic(filepath.Join(dir, metaFile), meta); err != nil {
		slog.Warn("supervisor: could not write meta", "id", id, "err", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), defaultRunTimeout)
	defer cancel()

	// Cancel the run gracefully on SIGTERM/SIGINT from the server (Cancel API).
	// Cancelling ctx makes runner.Run forward SIGINT to terraform's process group
	// so it unwinds and releases the state lock, and the run is classified as
	// cancelled (ctx.Err() != nil) rather than failed.
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(sigs)
	go func() {
		select {
		case <-sigs:
			cancel()
		case <-ctx.Done():
		}
	}()

	// Feed approval input from the FIFO into an in-process channel.
	inputCh := make(chan string)
	go readInputFifo(ctx, filepath.Join(dir, inputFifo), inputCh)

	onProcStart := func(pid int) {
		meta.Pgid = pid
		if err := writeJSONAtomic(filepath.Join(dir, metaFile), meta); err != nil {
			slog.Warn("supervisor: could not update meta pgid", "id", id, "err", err)
		}
	}

	res := executeRun(ctx, params, logFile, inputCh, onProcStart, nil)
	if err := writeJSONAtomic(filepath.Join(dir, statusFile), res); err != nil {
		slog.Error("supervisor: could not write status", "id", id, "err", err)
		return err
	}
	slog.Info("supervisor: run finished", "id", id, "status", res.Status)
	return nil
}

// executeRun runs the terraform orchestration for a single web run, writing all
// output to out and consuming approval input from inputCh. It mirrors the
// auto-sequence and single-command behavior previously embedded in
// RunManager.Start's goroutine. It never panics out — a panic is captured into a
// failed result.
func executeRun(ctx context.Context, p superviseParams, out io.Writer, inputCh <-chan string, onProcStart func(int), onWait func(bool)) (res supervisedResult) {
	req := p.Request
	now := func() time.Time { return time.Now().UTC() }

	defer func() {
		if rec := recover(); rec != nil {
			fmt.Fprintf(out, "  [PANIC] %v\n", rec)
			res = supervisedResult{Status: StatusFailed, FinishedAt: now()}
		}
	}()

	// Interpose an approval channel so we can enforce the approval timeout
	// (auto-deny) and track explicit denials, exactly as the in-process path did.
	needsInteractive := (req.Command == "apply" || req.Command == "destroy" || req.Command == "auto") && !req.AutoApprove
	var runnerInput chan string
	var denied bool
	var deniedMu sync.Mutex
	onApprovalWait := func(bool) {}
	if needsInteractive {
		runnerInput = make(chan string, 1)
		var gen uint64
		var genMu sync.Mutex
		onApprovalWait = func(waiting bool) {
			if onWait != nil {
				onWait(waiting)
			}
			genMu.Lock()
			gen++
			myGen := gen
			genMu.Unlock()
			if !waiting || p.ApprovalTimeout <= 0 {
				return
			}
			go func() {
				timer := time.NewTimer(p.ApprovalTimeout)
				defer timer.Stop()
				select {
				case <-timer.C:
					genMu.Lock()
					stillWaiting := myGen == gen
					genMu.Unlock()
					if stillWaiting {
						select {
						case runnerInput <- "no":
							deniedMu.Lock()
							denied = true
							deniedMu.Unlock()
							fmt.Fprintln(out, "  [DENIED] approval timed out before input was received")
						default:
						}
					}
				case <-ctx.Done():
				}
			}()
		}
		go func() {
			for {
				select {
				case v, ok := <-inputCh:
					if !ok {
						return
					}
					select {
					case runnerInput <- v:
						if strings.TrimSpace(v) != "yes" {
							deniedMu.Lock()
							denied = true
							deniedMu.Unlock()
						}
					default:
					}
				case <-ctx.Done():
					return
				}
			}
		}()
	}

	savePlanDir := ""
	applyPlanFiles := map[string]string{}
	if req.Command == "plan" {
		savePlanDir = filepath.Join(config.SavedPlanDir(), p.ID)
	} else if req.Command == "apply" && req.PlanRunID != "" {
		for _, target := range resolveTargetDirs(req) {
			applyPlanFiles[target] = savedPlanPath(req.PlanRunID, target)
		}
	}

	tfArgs := append([]string{}, req.ExtraArgs...)
	if req.Command == "apply" && req.PlanRunID != "" {
		fmt.Fprintln(out, "  [APPROVED] Reviewed plan approved for apply.")
	}

	var explicitTargets []config.RepoTarget
	searchRoot := p.SearchRoot
	if req.Repo != "" {
		if rc, err := config.LoadRepoConfig(req.Repo); err == nil && len(rc.Targets) > 0 {
			explicitTargets = rc.Targets
			repos, _ := config.LoadRepos()
			if repoRoot, ok := repos[req.Repo]; ok {
				searchRoot = repoRoot
			}
		}
	}

	targetGroups := make(map[string]string)
	for _, target := range explicitTargets {
		group := strings.TrimSpace(target.Group)
		if group == "" {
			group = strings.Split(strings.Trim(target.Directory, "/"), "/")[0]
		}
		if group == "" {
			group = target.Name
		}
		targetGroups[target.Name] = group
	}
	var graphMu sync.Mutex
	onGraphReady := func(target, dir, planFile, command, output string, env []string) error {
		targetGraph, err := graphdata.Extract(planFile, dir, p.RepoLabel, targetGroups[target], target, command, output, env)
		if err != nil {
			return err
		}
		graphMu.Lock()
		defer graphMu.Unlock()
		return graphdata.SaveTarget(graphPath(p.ID), p.ID, p.RepoLabel, targetGroups[target], target, targetGraph)
	}

	baseOpts := runner.Options{
		SearchRoot:        searchRoot,
		RepoLabel:         p.RepoLabel,
		Ticket:            req.Ticket,
		TicketURL:         p.TicketURL,
		TfArgs:            tfArgs,
		ResourceAddresses: req.ResourceAddresses,
		EnvFilter:         req.EnvFilter,
		ProfileOverride:   req.Profile,
		NonprodOnly:       req.NonprodOnly,
		ReportDir:         p.ReportDir,
		ExplicitTargets:   explicitTargets,
		Output:            out,
		Ctx:               ctx,
		Parallel:          req.Parallel,
		PromotionOrder:    req.PromotionOrder,
		LockIDs:           req.LockIDs,
		ImportAddrs:       req.ImportAddrs,
		AutoApprove:       req.AutoApprove,
		OnApprovalWait:    onApprovalWait,
		OnProcStart:       onProcStart,
		SavePlanDir:       savePlanDir,
		ApplyPlanFiles:    applyPlanFiles,
		OnGraphReady:      onGraphReady,
	}

	var results []report.EnvResult
	var reportFilename string
	var runErr error

	if req.Command == "auto" {
		skipApply := map[string]bool{}
		for i, step := range []string{"init", "plan", "apply"} {
			fmt.Fprintln(out, "")
			fmt.Fprintf(out, "=== auto: step %d/3 — %s ===\n", i+1, step)
			opts := baseOpts
			opts.TfCommand = step
			opts.Parallel = false
			if step == "apply" {
				opts.InputCh = runnerInput
				opts.SkipApply = skipApply
			}
			var stepRes []report.EnvResult
			var stepReport string
			stepRes, stepReport, runErr = runner.Run(opts)
			if step == "plan" {
				for _, r := range stepRes {
					if r.NoChanges && !r.Failed {
						skipApply[r.Env] = true
					}
				}
			}
			if stepRes != nil {
				results = stepRes
			}
			if stepReport != "" {
				reportFilename = stepReport
			}
			if runErr != nil {
				break
			}
			deniedMu.Lock()
			wasDenied := denied
			deniedMu.Unlock()
			if wasDenied {
				break
			}
		}
	} else {
		opts := baseOpts
		opts.TfCommand = req.Command
		opts.InputCh = runnerInput
		results, reportFilename, runErr = runner.Run(opts)
	}

	approvalDenied := errors.Is(runErr, runner.ErrApprovalDenied)
	if runErr != nil && ctx.Err() == nil && !approvalDenied {
		fmt.Fprintln(out, "  [ERROR] "+runErr.Error())
	}

	deniedMu.Lock()
	wasDenied := denied
	deniedMu.Unlock()

	finishedAt := now()
	res = supervisedResult{
		Results:    results,
		ReportPath: reportFilename,
		FinishedAt: finishedAt,
		Status:     FinalRunStatus(runErr, ctx.Err(), wasDenied || approvalDenied, results),
	}
	if res.Status == StatusSuccess && req.Command == "plan" && len(results) > 0 {
		res.SavedPlanReady = true
		expiresAt := finishedAt.Add(p.ReviewedPlanTimeout)
		res.SavedPlanExpiresAt = &expiresAt
	}
	return res
}
