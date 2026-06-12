package runner

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/andres/tf9/internal/aws"
	"github.com/andres/tf9/internal/config"
	"github.com/andres/tf9/internal/report"
)

// ErrApprovalDenied indicates that Terraform reached its approval prompt and
// the user explicitly declined the apply or destroy operation.
var ErrApprovalDenied = errors.New("terraform approval denied")

// Options configures a terraform run.
// ImportSpec holds the resource address and ID required by `terraform import`.
type ImportSpec struct {
	Addr string // e.g. aws_instance.example
	ID   string // e.g. i-1234567890abcdef0
}

type Options struct {
	SearchRoot      string
	RepoLabel       string
	TfCommand       string
	TfArgs          []string
	EnvFilter       string
	Skip            []string // exact dir/target names to exclude
	ProfileOverride string
	ProfileMappings []config.ProfileMapping // ordered dir→profile pairs; slice order = execution order for --recursive
	Recursive       bool                    // when true, always scan subdirs even if SearchRoot has .tf files
	NonprodOnly     bool
	ReportDir       string                // "" = config default; "-" = disable
	Output          io.Writer             // nil → os.Stdout
	Ctx             context.Context       // nil → context.Background()
	ExplicitTargets []config.RepoTarget   // if set, bypass collectDirs; SearchRoot is repo root
	Parallel        bool                  // run all envs concurrently
	PromotionOrder  []string              // if set, execute envs in this order (sequential only)
	LockIDs         map[string]string     // target name → lock id, used by force-unlock
	ImportAddrs     map[string]ImportSpec // target name → import spec, used by import
	AutoApprove     bool                  // add -auto-approve; false = interactive approval via InputCh
	InputCh         <-chan string         // receives "yes" or "no" when terraform prompts for input
	OnApprovalWait  func(bool)            // called with true when blocked on approval, false when released
	OnProcStart     func(pid int)         // called with each terraform child PID (process-group leader)
	SkipApply       map[string]bool       // env labels whose apply is skipped (no plan changes); auto mode
	Stdin           io.Reader             // if set, wired to terraform's stdin (CLI interactive mode)
	Cost            bool                  // run infracost cost estimation after each target succeeds
	InfracostKey    string                // Infracost API key (passed via env to infracost, never logged)
	Currency        string                // currency code for cost estimates (default USD)
	SavePlanDir     string                // directory for per-target terraform plan -out files
	ApplyPlanFiles  map[string]string     // target label → reviewed plan path for terraform apply
}

// ApprovalSentinel is emitted as a line to the output stream when terraform
// is waiting for interactive approval. The frontend detects this and shows
// an inline approval prompt.
const ApprovalSentinel = "__TF9_APPROVAL__"

// ApprovalClearSentinel is emitted when terraform is no longer blocked on the
// approval prompt (input received or the run was cancelled). The frontend uses
// it to hide the approval bar reliably.
const ApprovalClearSentinel = "__TF9_APPROVAL_CLEAR__"

const approvalAcceptedLine = "  [APPROVED] Approval accepted."

// buildArgs assembles the terraform argument list for a single target.
//
// For "force-unlock" the command is `force-unlock -force <lockID>`; if lockID
// is empty the target is skipped. For "import" the command is
// `import -input=false <addr> <id>`; if either addr or id is empty the target
// is skipped. All other commands pass standard flags then tfArgs.
func buildArgs(cmd string, tfArgs []string, lockID string, imp ImportSpec, autoApprove bool) (args []string, skip bool) {
	if cmd == "force-unlock" {
		if lockID == "" {
			return nil, true
		}
		return []string{"force-unlock", "-force", lockID}, false
	}
	if cmd == "import" {
		if imp.Addr == "" || imp.ID == "" {
			return nil, true
		}
		return []string{"import", "-input=false", imp.Addr, imp.ID}, false
	}
	args = []string{cmd}
	switch cmd {
	case "plan", "init":
		args = append(args, "-input=false")
	case "apply":
		// Only disable input when auto-approving. Interactive apply must leave
		// input enabled so terraform can present its "Enter a value:" approval
		// prompt and read the user's "yes" from stdin — with -input=false the
		// prompt is shown but never reads stdin, so the run hangs forever.
		if autoApprove {
			args = append(args, "-input=false")
		}
	}
	if autoApprove && (cmd == "apply" || cmd == "destroy") {
		args = append(args, "-auto-approve")
	}
	args = append(args, tfArgs...)
	return args, false
}

// approvalMonitor wraps an io.Writer, detects terraform's "Enter a value:"
// prompt, emits ApprovalSentinel to the stream, then blocks until the caller
// provides input via InputCh (or the context is cancelled).
type approvalMonitor struct {
	out     io.Writer
	stdinW  io.WriteCloser
	inputCh <-chan string
	ctx     context.Context
	onWait  func(bool)
	buf     []byte
	done    bool
}

func (m *approvalMonitor) Write(p []byte) (int, error) {
	n, err := m.out.Write(p)
	if err != nil || m.done {
		return n, err
	}
	m.buf = append(m.buf, p...)
	if len(m.buf) > 256 {
		m.buf = m.buf[len(m.buf)-256:]
	}
	if bytes.Contains(m.buf, []byte("Enter a value:")) {
		m.done = true
		m.buf = nil
		// Flush a newline so the pending partial line becomes a line in the stream,
		// then emit the sentinel on its own line.
		m.out.Write([]byte("\n" + ApprovalSentinel + "\n")) //nolint:errcheck
		if m.onWait != nil {
			m.onWait(true)
		}
		select {
		case input := <-m.inputCh:
			m.stdinW.Write([]byte(input + "\n")) //nolint:errcheck
			if strings.TrimSpace(input) == "yes" {
				m.out.Write([]byte("\n" + approvalAcceptedLine + "\n")) //nolint:errcheck
			}
		case <-m.ctx.Done():
		}
		m.stdinW.Close() //nolint:errcheck
		if m.onWait != nil {
			m.onWait(false)
		}
		// Emit the clear sentinel so the frontend hides the approval bar exactly
		// when terraform is no longer blocked on input.
		m.out.Write([]byte("\n" + ApprovalClearSentinel + "\n")) //nolint:errcheck
	}
	return n, err
}

type targetMeta struct {
	profile   string
	accountID string
	region    string
}

func (o Options) out() io.Writer {
	if o.Output != nil {
		return o.Output
	}
	return os.Stdout
}

func (o Options) ctx() context.Context {
	if o.Ctx != nil {
		return o.Ctx
	}
	return context.Background()
}

// headless returns true when running outside a terminal (e.g. from the web UI).
func (o Options) headless() bool { return o.Output != nil }

// terminalFile reports whether r is backed by a real controlling terminal and
// returns the underlying *os.File. Used to decide whether an interactive
// terraform should be foregrounded so it can read its approval prompt from the
// TTY (a piped or /dev/null stdin returns false and keeps the default wiring).
func terminalFile(r io.Reader) (*os.File, bool) {
	f, ok := r.(*os.File)
	if !ok || f == nil {
		return nil, false
	}
	return f, isTerminal(f.Fd())
}

type envResult struct {
	env     string
	profile string
	applied bool
	failed  bool
	summary *planSummary
	output  string
	cost    *report.CostEstimate
}

type planSummary struct {
	add, change, destroy int
	noChanges            bool
}

var (
	rePlan      = regexp.MustCompile(`Plan:\s+(\d+) to add,\s+(\d+) to change,\s+(\d+) to destroy`)
	reNoChanges = regexp.MustCompile(`No changes\.`)
	reANSI      = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)
)

const (
	ansiGreen  = "\033[32m"
	ansiYellow = "\033[33m"
	ansiRed    = "\033[31m"
	ansiDim    = "\033[2m"
	ansiBold   = "\033[1m"
	ansiReset  = "\033[0m"
)

// isTTY reports whether w is an interactive terminal.
func isTTY(w io.Writer) bool {
	f, ok := w.(*os.File)
	if !ok {
		return false
	}
	fi, err := f.Stat()
	if err != nil {
		return false
	}
	return fi.Mode()&os.ModeCharDevice != 0
}

// clr wraps text in the given ANSI color code when color output is enabled.
func clr(enabled bool, code, text string) string {
	if !enabled || code == "" {
		return text
	}
	return code + text + ansiReset
}

// padRight pads s to at least width display columns, stripping ANSI codes
// when measuring the visual length so colors don't break column alignment.
func padRight(s string, width int) string {
	visual := len(reANSI.ReplaceAllString(s, ""))
	if visual >= width {
		return s
	}
	return s + strings.Repeat(" ", width-visual)
}

// teeWriter writes to the primary output and captures ANSI-stripped text.
type teeWriter struct {
	out     io.Writer
	summary *planSummary
	capture strings.Builder
	lineBuf strings.Builder
}

func (w *teeWriter) Write(p []byte) (int, error) {
	n, err := w.out.Write(p)
	w.capture.Write(p) // keep ANSI codes for rich rendering in reports
	clean := reANSI.ReplaceAll(p, nil)
	w.lineBuf.Write(clean)
	for {
		s := w.lineBuf.String()
		idx := strings.IndexByte(s, '\n')
		if idx == -1 {
			break
		}
		w.parseLine(s[:idx])
		w.lineBuf.Reset()
		w.lineBuf.WriteString(s[idx+1:])
	}
	return n, err
}

func (w *teeWriter) parseLine(line string) {
	if m := rePlan.FindStringSubmatch(line); m != nil {
		w.summary.add, _ = strconv.Atoi(m[1])
		w.summary.change, _ = strconv.Atoi(m[2])
		w.summary.destroy, _ = strconv.Atoi(m[3])
	} else if reNoChanges.MatchString(line) {
		w.summary.noChanges = true
	}
}

// Run executes the terraform command across matching environments and returns
// per-environment results and the saved report filename (basename only).
// CLI callers can ignore the first two return values.
func Run(opts Options) ([]report.EnvResult, string, error) {
	var dirs []string
	var metaFor map[string]targetMeta
	var labelFor map[string]string
	if len(opts.ExplicitTargets) > 0 {
		dirs, metaFor, labelFor = resolveExplicitTargets(opts)
	} else {
		var err2 error
		dirs, metaFor, err2 = collectDirs(opts)
		labelFor = make(map[string]string)
		if err2 != nil {
			return nil, "", err2
		}
	}
	if len(dirs) == 0 {
		filter := ""
		if opts.EnvFilter != "" {
			filter = fmt.Sprintf(" (filter: %s)", opts.EnvFilter)
		}
		return nil, "", fmt.Errorf("no matching Terraform directories found in %s%s", opts.SearchRoot, filter)
	}

	targetLabel := opts.EnvFilter
	if targetLabel == "" {
		if opts.NonprodOnly {
			targetLabel = "nonprod only"
		} else {
			names := make([]string, 0, len(dirs))
			for _, dir := range dirs {
				names = append(names, envLabel(labelFor, dir))
			}
			targetLabel = "all (" + strings.Join(names, " → ") + ")"
		}
	}

	cmdDisplay := opts.TfCommand
	if len(opts.TfArgs) > 0 {
		cmdDisplay += " " + strings.Join(opts.TfArgs, " ")
	}
	out := opts.out()
	fmt.Fprintf(out, "Running: terraform %s | target: %s", cmdDisplay, targetLabel)
	if opts.RepoLabel != "" {
		fmt.Fprintf(out, " | repo: %s", opts.RepoLabel)
	}
	if opts.ProfileOverride != "" {
		fmt.Fprintf(out, " | profile: %s (override)", opts.ProfileOverride)
	}
	fmt.Fprintln(out)
	fmt.Fprintln(out)

	if len(opts.PromotionOrder) > 0 {
		dirs = reorderDirs(dirs, labelFor, opts.PromotionOrder)
	}

	if opts.Parallel && (opts.TfCommand == "apply" || opts.TfCommand == "destroy") {
		return nil, "", fmt.Errorf("parallel execution is not allowed for %q — apply/destroy must run sequentially in promotion order", opts.TfCommand)
	}

	if err := ensureSessions(opts.ctx(), dirs, metaFor, opts.ProfileOverride, !opts.headless()); err != nil {
		return nil, "", err
	}

	isPlan := opts.TfCommand == "plan"
	runAt := time.Now().UTC()
	var results []envResult
	var failed []string
	var deniedTarget string
	ctx := opts.ctx()

	// force-unlock always runs sequentially regardless of the Parallel flag.
	runParallelMode := opts.Parallel && opts.TfCommand != "force-unlock"
	if runParallelMode {
		results, failed = runParallel(ctx, dirs, metaFor, labelFor, opts, cmdDisplay, out, isPlan)
	}

	for _, dir := range dirs {
		if runParallelMode {
			break
		}
		if ctx.Err() != nil {
			break
		}
		env := envLabel(labelFor, dir)
		meta := resolvedMeta(metaFor[dir], opts.ProfileOverride)
		profile := meta.profile

		if profile == "" {
			fmt.Fprintf(out, "==> Skipping %s (no AWS profile mapped and AWS_PROFILE not set)\n", env)
			continue
		}

		// Auto mode: when the plan phase reported no changes for this env, skip the
		// apply entirely and emit an explicit no-change section so the UI settles it
		// as done rather than re-planning and prompting for an empty apply.
		if opts.SkipApply[env] {
			fmt.Fprintln(out, "════════════════════════════════════════")
			fmt.Fprintf(out, "  ENV: %s  |  PROFILE: %s\n", env, profile)
			fmt.Fprintf(out, "  CMD: terraform %s (skipped)\n", cmdDisplay)
			fmt.Fprintln(out, "════════════════════════════════════════")
			fmt.Fprintln(out, "No changes. Your infrastructure matches the configuration. Skipping Apply")
			results = append(results, envResult{env: env, profile: profile, summary: &planSummary{noChanges: true}})
			if opts.ReportDir != "-" {
				writeLiveReport(results, opts, runAt)
			}
			fmt.Fprintln(out)
			continue
		}

		args, skip := buildArgs(opts.TfCommand, opts.TfArgs, opts.LockIDs[env], opts.ImportAddrs[env], opts.AutoApprove)
		if skip {
			fmt.Fprintf(out, "==> Skipping %s (no lock id / import spec provided)\n", env)
			continue
		}
		savedPlanFile := ""
		if opts.TfCommand == "plan" {
			savedPlanFile = SavedPlanFilePath(opts.SavePlanDir, env)
			if savedPlanFile != "" {
				if err := os.MkdirAll(filepath.Dir(savedPlanFile), 0o700); err != nil {
					return nil, "", fmt.Errorf("create saved plan directory for %s: %w", env, err)
				}
				args = append(args, "-out="+savedPlanFile)
			}
		} else if opts.TfCommand == "apply" {
			savedPlanFile = opts.ApplyPlanFiles[env]
			if savedPlanFile != "" {
				if _, err := os.Stat(savedPlanFile); err != nil {
					return nil, "", fmt.Errorf("reviewed plan for %s is unavailable: %w", env, err)
				}
				args = []string{"apply", "-input=false", savedPlanFile}
			}
		}

		// When cost estimation is requested, capture a plan to a temp file so
		// infracost can compute the cost diff from it afterwards.
		//   - plan:    add -out to the plan we're already running.
		//   - destroy: generate a separate destroy plan BEFORE teardown (while the
		//     resources still exist) so infracost reflects cost falling to ~$0
		//     with a negative diff. A directory breakdown can't show this because
		//     infracost parses the (unchanged) HCL, not the deployed state.
		costPlanFile := ""
		if opts.Cost && opts.TfCommand == "plan" {
			costPlanFile = savedPlanFile
			if costPlanFile == "" {
				costPlanFile = costPlanPath()
				args = append(args, "-out="+costPlanFile)
			}
		} else if opts.Cost && opts.TfCommand == "destroy" {
			costPlanFile = costPlanPath()
			if err := generateDestroyPlan(ctx, dir, meta, costPlanFile); err != nil {
				fmt.Fprintf(out, "  [WARN] could not capture destroy plan for cost: %v\n", err)
				slog.Warn("destroy cost plan failed", "env", env, "err", err)
				costPlanFile = ""
			}
		}

		fmt.Fprintln(out, "════════════════════════════════════════")
		fmt.Fprintf(out, "  ENV: %s  |  PROFILE: %s\n", env, profile)
		fmt.Fprintf(out, "  CMD: terraform %s\n", cmdDisplay)
		fmt.Fprintln(out, "════════════════════════════════════════")

		slog.Info("target started", "env", env, "profile", profile, "command", opts.TfCommand, "dir", dir)
		targetStart := time.Now()

		cmd := exec.CommandContext(ctx, "terraform", args...)
		cmd.Dir = dir
		cmd.Env = terraformEnv(meta)

		summary := &planSummary{}
		tw := &teeWriter{out: out, summary: summary}

		needsInteractive := !opts.AutoApprove && (opts.TfCommand == "apply" || opts.TfCommand == "destroy") && opts.InputCh != nil
		usedForeground := false
		// stdinWriteEnd is the parent's handle to terraform's stdin for the web
		// approval gate. It must be an *os.File (real pipe) — not an io.Pipe — so
		// exec passes the fd directly and does NOT spawn a stdin-copy goroutine.
		// With io.Pipe, cmd.Wait() blocks until that goroutine reaches EOF, which
		// never happens for a no-changes apply (terraform never reads stdin and
		// the prompt that closes the pipe never fires) — hanging the promotion.
		var stdinReadEnd, stdinWriteEnd *os.File
		if needsInteractive {
			stdinR, stdinW, perr := os.Pipe()
			if perr != nil {
				fmt.Fprintf(out, "  [FAILED] %s — could not create stdin pipe: %v\n", env, perr)
				slog.Error("target failed to create stdin pipe", "env", env, "err", perr)
				failed = append(failed, env)
				results = append(results, envResult{env: env, profile: profile, failed: true, summary: summary})
				continue
			}
			stdinReadEnd, stdinWriteEnd = stdinR, stdinW
			cmd.Stdin = stdinR
			am := &approvalMonitor{out: tw, stdinW: stdinW, inputCh: opts.InputCh, ctx: ctx, onWait: opts.OnApprovalWait}
			cmd.Stdout = am
			cmd.Stderr = am
			setProcGroup(cmd)
		} else if f, ok := terminalFile(opts.Stdin); ok {
			// Interactive CLI against a real terminal: terraform must read its
			// own "Enter a value:" approval prompt from the controlling TTY.
			// Put terraform in the terminal's FOREGROUND process group (Setpgid +
			// Foreground + Ctty) — without this it lands in a background group and
			// the kernel stops it with SIGTTIN the moment it reads stdin, so the
			// prompt hangs no matter what the user types.
			cmd.Stdin = f
			cmd.Stdout = tw
			cmd.Stderr = tw
			setForegroundTTY(cmd, 0) // child stdin (fd 0) is the controlling TTY
			usedForeground = true
		} else {
			if opts.Stdin != nil {
				cmd.Stdin = opts.Stdin
			}
			cmd.Stdout = tw
			cmd.Stderr = tw
			setProcGroup(cmd)
		}

		// Send SIGINT to the whole process group on context cancel so terraform
		// (and its provider plugins) can release the state lock gracefully. If the
		// process does not exit within WaitDelay, exec escalates to SIGKILL.
		cmd.WaitDelay = 10 * time.Second
		cmd.Cancel = func() error { return signalGroup(cmd.Process.Pid, syscall.SIGINT) }

		if err := cmd.Start(); err != nil {
			fmt.Fprintf(out, "  [FAILED] %s — %v\n", env, err)
			slog.Error("target failed to start terraform", "env", env, "profile", profile, "err", err)
			if stdinReadEnd != nil {
				stdinReadEnd.Close()
			}
			if stdinWriteEnd != nil {
				stdinWriteEnd.Close()
			}
			failed = append(failed, env)
			results = append(results, envResult{env: env, profile: profile, failed: true, summary: summary})
			continue
		}
		// The child holds its own dup of the read end now; release the parent's.
		if stdinReadEnd != nil {
			stdinReadEnd.Close()
		}
		if opts.OnProcStart != nil {
			opts.OnProcStart(cmd.Process.Pid)
		}

		exitCode := 0
		if err := cmd.Wait(); err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				exitCode = exitErr.ExitCode()
			} else if ctx.Err() != nil {
				exitCode = 1
			} else {
				exitCode = 1
			}
		}
		// Release the stdin write end. For an apply that prompted, the monitor
		// already closed it after sending the approval; for a no-changes apply
		// (no prompt) this is where it gets closed. Double Close is harmless.
		if stdinWriteEnd != nil {
			stdinWriteEnd.Close()
		}
		if usedForeground {
			// Reclaim the terminal foreground so Ctrl+C reaches tf9 (not the
			// now-dead terraform process group) if the user wants to abort further
			// targets.
			restoreTerminalForeground()
		}

		slog.Info("target finished", "env", env, "profile", profile, "command", opts.TfCommand, "exitCode", exitCode, "duration", time.Since(targetStart))

		res := envResult{env: env, profile: profile, output: tw.capture.String()}
		res.summary = summary
		res.applied = exitCode == 0 && opts.TfCommand == "apply"
		if exitCode == 0 && opts.Stdin != nil && approvalPromptShown(res.output) {
			fmt.Fprintln(out, approvalAcceptedLine)
		}

		if exitCode != 0 {
			if costPlanFile != "" && costPlanFile != savedPlanFile {
				if err := os.Remove(costPlanFile); err != nil && !os.IsNotExist(err) {
					slog.Debug("could not remove cost plan file", "file", costPlanFile, "err", err)
				}
			}
			if approvalWasDenied(tw.capture.String()) {
				fmt.Fprintf(out, "  [DENIED] %s\n", env)
				results = append(results, res)
				deniedTarget = env
				if opts.ReportDir != "-" {
					writeLiveReport(results, opts, runAt)
				}
				fmt.Fprintln(out)
				fmt.Fprintf(out, "  Stopping promotion — approval denied for %s.\n", env)
				break
			}
			fmt.Fprintf(out, "  [FAILED] %s\n", env)
			failed = append(failed, env)
			res.failed = true
			results = append(results, res)
			if opts.ReportDir != "-" {
				writeLiveReport(results, opts, runAt)
			}
			if opts.TfCommand == "apply" && opts.EnvFilter == "" {
				fmt.Fprintln(out)
				fmt.Fprintf(out, "  Stopping promotion — fix %s before continuing.\n", env)
				break
			}
		} else {
			if opts.Cost && summary != nil && !summary.noChanges {
				if cost, cerr := runInfracost(ctx, dir, costPlanFile, meta, opts); cerr != nil {
					fmt.Fprintf(out, "  [WARN] cost estimation failed for %s: %v\n", env, cerr)
					slog.Warn("infracost failed", "env", env, "err", cerr)
				} else {
					res.cost = cost
					fmt.Fprintf(out, "  Cost: %s %.2f/mo", cost.Currency, cost.TotalMonthly)
					if cost.HasDiff {
						fmt.Fprintf(out, " (%+.2f)", cost.DiffMonthly)
					}
					fmt.Fprintln(out)
				}
			}
			if costPlanFile != "" && costPlanFile != savedPlanFile {
				if err := os.Remove(costPlanFile); err != nil && !os.IsNotExist(err) {
					slog.Debug("could not remove cost plan file", "file", costPlanFile, "err", err)
				}
			}
			results = append(results, res)
			if opts.ReportDir != "-" {
				writeLiveReport(results, opts, runAt)
			}
		}
		fmt.Fprintln(out)
	}

	if isPlan {
		printPlanSummary(out, results)
	}

	final := toReportResults(results)

	var reportFilename string
	if opts.ReportDir != "-" {
		if path, err := report.Generate(final, report.Options{
			Command:   opts.TfCommand,
			RepoLabel: opts.RepoLabel,
			RunAt:     runAt,
			OutputDir: opts.ReportDir,
		}); err != nil {
			fmt.Fprintf(os.Stderr, "  [WARN] Could not save HTML report: %v\n", err)
			slog.Warn("could not save HTML report", "dir", opts.ReportDir, "command", opts.TfCommand, "err", err)
		} else {
			reportFilename = filepath.Base(path)
			fmt.Fprintf(out, "  Report saved: %s\n\n", path)
		}
		liveFile := filepath.Join(opts.ReportDir, liveFilename(opts.TfCommand))
		if err := os.Remove(liveFile); err != nil && !os.IsNotExist(err) {
			slog.Debug("could not remove live report file", "file", liveFile, "err", err)
		}
	}

	if len(failed) > 0 {
		return final, reportFilename, fmt.Errorf("FAILED: %s", strings.Join(failed, " "))
	}
	if deniedTarget != "" {
		return final, reportFilename, fmt.Errorf("%w: %s", ErrApprovalDenied, deniedTarget)
	}
	return final, reportFilename, nil
}

func approvalWasDenied(output string) bool {
	clean := reANSI.ReplaceAllString(output, "")
	return strings.Contains(clean, "Apply cancelled.") || strings.Contains(clean, "Destroy cancelled.")
}

func approvalPromptShown(output string) bool {
	clean := reANSI.ReplaceAllString(output, "")
	return strings.Contains(clean, "Enter a value:")
}

func liveFilename(cmd string) string {
	return "tf9-" + sanitizeCmd(cmd) + "-live.html"
}

func sanitizeCmd(cmd string) string {
	return strings.ReplaceAll(cmd, "-", "_")
}

func writeLiveReport(results []envResult, opts Options, runAt time.Time) {
	if _, err := report.Generate(toReportResults(results), report.Options{
		Command:   opts.TfCommand,
		RepoLabel: opts.RepoLabel,
		RunAt:     runAt,
		OutputDir: opts.ReportDir,
		Filename:  liveFilename(opts.TfCommand),
		IsLive:    true,
	}); err != nil {
		slog.Debug("could not write live report", "command", opts.TfCommand, "err", err)
	}
}

func toReportResults(results []envResult) []report.EnvResult {
	rr := make([]report.EnvResult, len(results))
	for i, r := range results {
		rr[i] = report.EnvResult{
			Env:     r.env,
			Profile: r.profile,
			Applied: r.applied,
			Failed:  r.failed,
			Output:  reportOutput(r.output),
			Cost:    r.cost,
		}
		if r.summary != nil {
			rr[i].Add = r.summary.add
			rr[i].Change = r.summary.change
			rr[i].Destroy = r.summary.destroy
			rr[i].NoChanges = r.summary.noChanges
		}
	}
	return rr
}

func reportOutput(output string) string {
	lines := strings.Split(output, "\n")
	filtered := lines[:0]
	for _, line := range lines {
		switch strings.TrimSpace(reANSI.ReplaceAllString(line, "")) {
		case ApprovalSentinel, ApprovalClearSentinel, strings.TrimSpace(approvalAcceptedLine):
			continue
		default:
			filtered = append(filtered, line)
		}
	}
	return strings.Join(filtered, "\n")
}

func printPlanSummary(out io.Writer, results []envResult) {
	if len(results) == 0 {
		return
	}
	color := isTTY(out)

	maxEnv := len("ENVIRONMENT")
	for _, r := range results {
		if len(r.env) > maxEnv {
			maxEnv = len(r.env)
		}
	}

	// Column widths (visual, not including ANSI codes).
	const addW, changeW, destroyW = 5, 7, 8
	totalW := maxEnv + 3 + addW + 3 + changeW + 3 + destroyW + 3 + 14
	rule := strings.Repeat("─", totalW)

	fmt.Fprintln(out)
	fmt.Fprintf(out, "  %s\n", clr(color, ansiBold, "PLAN SUMMARY"))
	fmt.Fprintf(out, "  %s\n", rule)
	fmt.Fprintf(out, "  %-*s   %-*s   %-*s   %-*s   %s\n",
		maxEnv, "ENVIRONMENT",
		addW, "ADD",
		changeW, "CHANGE",
		destroyW, "DESTROY",
		"APPLIED",
	)
	fmt.Fprintf(out, "  %s\n", rule)

	for _, r := range results {
		addTxt := clr(color, ansiDim, "-")
		changeTxt := clr(color, ansiDim, "-")
		destroyTxt := clr(color, ansiDim, "-")
		appliedTxt, appliedCode := "False", ansiDim

		if r.applied {
			appliedTxt, appliedCode = "True", ansiGreen
		}
		if r.summary != nil && !r.summary.noChanges {
			addTxt = clr(color, ansiGreen, fmt.Sprintf("+%d", r.summary.add))
			changeTxt = clr(color, ansiYellow, fmt.Sprintf("~%d", r.summary.change))
			destroyTxt = clr(color, ansiRed, fmt.Sprintf("-%d", r.summary.destroy))
		}

		fmt.Fprintf(out, "  %-*s   %s   %s   %s   %s\n",
			maxEnv, r.env,
			padRight(addTxt, addW),
			padRight(changeTxt, changeW),
			padRight(destroyTxt, destroyW),
			clr(color, appliedCode, appliedTxt),
		)
	}
	fmt.Fprintf(out, "  %s\n", rule)
	fmt.Fprintln(out)
}

// envLabel returns the configured display name or the directory basename.
func envLabel(labelFor map[string]string, dir string) string {
	if l := labelFor[dir]; l != "" {
		return l
	}
	return filepath.Base(dir)
}

// isSkipped returns true if name appears in the skip list.
func isSkipped(name string, skip []string) bool {
	for _, s := range skip {
		if s == name {
			return true
		}
	}
	return false
}

// resolveExplicitTargets converts per-repo targets into ordered directories.
func resolveExplicitTargets(opts Options) ([]string, map[string]targetMeta, map[string]string) {
	metaFor := make(map[string]targetMeta)
	labelFor := make(map[string]string)
	var dirs []string
	for _, t := range opts.ExplicitTargets {
		name := t.Name
		if name == "" {
			name = filepath.Base(t.Directory)
		}
		if !matchEnvFilter(name, opts.EnvFilter) {
			continue
		}
		if opts.NonprodOnly && strings.HasPrefix(name, "prod") {
			continue
		}
		if isSkipped(name, opts.Skip) {
			continue
		}
		if t.Disabled {
			continue
		}
		abs := filepath.Join(opts.SearchRoot, t.Directory)
		if !isValidTfDir(abs) {
			continue
		}
		dirs = append(dirs, abs)
		metaFor[abs] = targetMeta{profile: t.AWSProfile, accountID: t.AccountID, region: t.Region}
		labelFor[abs] = name
	}
	return dirs, metaFor, labelFor
}

// mappingProfile returns the AWS profile configured for dirName in the ordered
// mappings slice, or "" if no entry matches.
func mappingProfile(mappings []config.ProfileMapping, dirName string) string {
	for _, m := range mappings {
		if m.Dir == dirName {
			return m.Profile
		}
	}
	return ""
}

func collectDirs(opts Options) ([]string, map[string]targetMeta, error) {
	metaFor := make(map[string]targetMeta)
	var dirs []string

	// If SearchRoot itself is a Terraform directory, use it directly rather
	// than scanning its children. This lets `tf9 plan` work from inside any
	// terraform module without a configured repo.
	// --recursive bypasses this so subdirectories are always scanned.
	if !opts.Recursive && isValidTfDir(opts.SearchRoot) {
		name := filepath.Base(opts.SearchRoot)
		if matchEnvFilter(name, opts.EnvFilter) && !(opts.NonprodOnly && strings.HasPrefix(name, "prod")) && !isSkipped(name, opts.Skip) {
			prof := opts.ProfileOverride
			if prof == "" {
				prof = mappingProfile(opts.ProfileMappings, name)
			}
			metaFor[opts.SearchRoot] = targetMeta{profile: prof}
			return []string{opts.SearchRoot}, metaFor, nil
		}
		return nil, metaFor, nil
	}

	entries, err := os.ReadDir(opts.SearchRoot)
	if err != nil {
		return nil, nil, fmt.Errorf("cannot read %s: %w", opts.SearchRoot, err)
	}

	// Build a set of valid candidate dirs for quick lookup.
	validDirs := make(map[string]struct{})
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		candidate := filepath.Join(opts.SearchRoot, entry.Name())
		if !isValidTfDir(candidate) {
			continue
		}
		if !matchEnvFilter(entry.Name(), opts.EnvFilter) {
			continue
		}
		if opts.NonprodOnly && strings.HasPrefix(entry.Name(), "prod") {
			continue
		}
		if isSkipped(entry.Name(), opts.Skip) {
			continue
		}
		validDirs[entry.Name()] = struct{}{}
	}

	// When profile mappings are set, emit dirs in mapping order first, then
	// any remaining valid dirs (alphabetically) that have no mapping entry.
	seen := make(map[string]bool)
	for _, m := range opts.ProfileMappings {
		if _, ok := validDirs[m.Dir]; !ok {
			continue
		}
		candidate := filepath.Join(opts.SearchRoot, m.Dir)
		prof := opts.ProfileOverride
		if prof == "" {
			prof = m.Profile
		}
		dirs = append(dirs, candidate)
		metaFor[candidate] = targetMeta{profile: prof}
		seen[m.Dir] = true
	}
	// Append unmapped dirs in alphabetical order.
	var remaining []string
	for name := range validDirs {
		if !seen[name] {
			remaining = append(remaining, name)
		}
	}
	sort.Strings(remaining)
	for _, name := range remaining {
		candidate := filepath.Join(opts.SearchRoot, name)
		dirs = append(dirs, candidate)
		metaFor[candidate] = targetMeta{profile: opts.ProfileOverride}
	}
	return dirs, metaFor, nil
}

// matchEnvFilter returns true if the env name should be included.
// A comma-separated filter (e.g. "dev-euw2,qa-euw2") matches exact names.
// A plain filter (e.g. "dev") uses substring match for CLI backward compat.
// An empty filter matches everything.
func matchEnvFilter(name, filter string) bool {
	if filter == "" {
		return true
	}
	if strings.Contains(filter, ",") {
		for _, part := range strings.Split(filter, ",") {
			if strings.TrimSpace(part) == name {
				return true
			}
		}
		return false
	}
	return strings.Contains(name, filter)
}

func isValidTfDir(path string) bool {
	info, err := os.Stat(path)
	if err != nil || !info.IsDir() {
		return false
	}
	matches, _ := filepath.Glob(filepath.Join(path, "*.tf"))
	return len(matches) > 0
}

// reorderDirs sorts dirs so their labels match the order given in promotionOrder.
// Dirs not mentioned in promotionOrder are appended at the end in their original order.
func reorderDirs(dirs []string, labelFor map[string]string, promotionOrder []string) []string {
	idx := make(map[string]int, len(promotionOrder))
	for i, name := range promotionOrder {
		idx[name] = i
	}
	sort.SliceStable(dirs, func(i, j int) bool {
		ni, nj := envLabel(labelFor, dirs[i]), envLabel(labelFor, dirs[j])
		ii, iok := idx[ni]
		ji, jok := idx[nj]
		if iok && jok {
			return ii < ji
		}
		return iok
	})
	return dirs
}

// runParallel executes terraform across all dirs concurrently. Each env writes to
// its own buffer; the complete block (header + output) is flushed to out under a
// mutex as each env finishes, preserving the same ════ ENV ════ structure.
func runParallel(
	ctx context.Context,
	dirs []string,
	metaFor map[string]targetMeta,
	labelFor map[string]string,
	opts Options,
	cmdDisplay string,
	out io.Writer,
	isPlan bool,
) ([]envResult, []string) {
	type slot struct {
		idx    int
		result envResult
	}

	ch := make(chan slot, len(dirs))
	jobs := make(chan struct{}, 4)
	safeOut := &lockedWriter{out: out}
	var wg sync.WaitGroup

	for i, dir := range dirs {
		env := envLabel(labelFor, dir)
		meta := resolvedMeta(metaFor[dir], opts.ProfileOverride)

		wg.Add(1)
		go func(idx int, dir, env string, meta targetMeta) {
			defer wg.Done()
			jobs <- struct{}{}
			defer func() { <-jobs }()

			profile := meta.profile
			header := fmt.Sprintf("════════════════════════════════════════\n  ENV: %s  |  PROFILE: %s\n  CMD: terraform %s\n════════════════════════════════════════\n", env, profile, cmdDisplay)
			prefixedOut := newPrefixWriter(safeOut, env)
			fmt.Fprint(prefixedOut, header)

			if profile == "" {
				fmt.Fprintf(prefixedOut, "Skipping %s (no AWS profile mapped and AWS_PROFILE not set)\n", env)
				ch <- slot{idx: idx, result: envResult{env: env, profile: profile}}
				return
			}

			args, skipTarget := buildArgs(opts.TfCommand, opts.TfArgs, opts.LockIDs[env], opts.ImportAddrs[env], opts.AutoApprove)
			if skipTarget {
				fmt.Fprintf(prefixedOut, "Skipping %s (no lock id / import spec provided)\n", env)
				ch <- slot{idx: idx, result: envResult{env: env, profile: profile}}
				return
			}
			savedPlanFile := ""
			if opts.TfCommand == "plan" {
				savedPlanFile = SavedPlanFilePath(opts.SavePlanDir, env)
				if savedPlanFile != "" {
					if err := os.MkdirAll(filepath.Dir(savedPlanFile), 0o700); err != nil {
						fmt.Fprintf(prefixedOut, "[FAILED] create saved plan directory: %v\n", err)
						ch <- slot{idx: idx, result: envResult{env: env, profile: meta.profile, failed: true}}
						return
					}
					args = append(args, "-out="+savedPlanFile)
				}
			}
			costPlanFile := ""
			if opts.Cost && opts.TfCommand == "plan" {
				costPlanFile = savedPlanFile
				if costPlanFile == "" {
					costPlanFile = costPlanPath()
					args = append(args, "-out="+costPlanFile)
				}
				defer func() {
					if costPlanFile != savedPlanFile {
						if err := os.Remove(costPlanFile); err != nil && !os.IsNotExist(err) {
							slog.Debug("could not remove cost plan file", "file", costPlanFile, "err", err)
						}
					}
				}()
			}
			cmd := exec.CommandContext(ctx, "terraform", args...)
			cmd.Dir = dir
			cmd.Env = terraformEnv(meta)
			setProcGroup(cmd)
			cmd.WaitDelay = 10 * time.Second
			cmd.Cancel = func() error { return signalGroup(cmd.Process.Pid, syscall.SIGINT) }

			summary := &planSummary{}
			tw := &teeWriter{out: prefixedOut, summary: summary}
			cmd.Stdout = tw
			cmd.Stderr = tw

			slog.Info("target started", "env", env, "profile", profile, "command", opts.TfCommand, "dir", dir, "parallel", true)
			targetStart := time.Now()
			exitCode := 0
			if err := cmd.Run(); err != nil {
				if exitErr, ok := err.(*exec.ExitError); ok {
					exitCode = exitErr.ExitCode()
				} else {
					exitCode = 1
				}
			}
			slog.Info("target finished", "env", env, "profile", profile, "command", opts.TfCommand, "exitCode", exitCode, "duration", time.Since(targetStart), "parallel", true)

			res := envResult{env: env, profile: profile, output: tw.capture.String()}
			res.summary = summary
			if exitCode != 0 {
				fmt.Fprintf(prefixedOut, "[FAILED] %s\n", env)
				res.failed = true
			} else if opts.Cost && summary != nil && !summary.noChanges {
				if cost, cerr := runInfracost(ctx, dir, costPlanFile, meta, opts); cerr != nil {
					fmt.Fprintf(prefixedOut, "[WARN] cost estimation failed for %s: %v\n", env, cerr)
					slog.Warn("infracost failed", "env", env, "err", cerr)
				} else {
					res.cost = cost
					fmt.Fprintf(prefixedOut, "Cost: %s %.2f/mo", cost.Currency, cost.TotalMonthly)
					if cost.HasDiff {
						fmt.Fprintf(prefixedOut, " (%+.2f)", cost.DiffMonthly)
					}
					fmt.Fprintln(prefixedOut)
				}
			}

			ch <- slot{idx: idx, result: res}
		}(i, dir, env, meta)
	}

	go func() {
		wg.Wait()
		close(ch)
	}()

	slots := make([]slot, len(dirs))
	for s := range ch {
		slots[s.idx] = s
	}

	results := make([]envResult, 0, len(dirs))
	var failed []string
	for _, s := range slots {
		results = append(results, s.result)
		if s.result.failed {
			failed = append(failed, s.result.env)
		}
	}
	return results, failed
}

// SavedPlanFilePath returns the collision-resistant plan filename for a target.
func SavedPlanFilePath(dir, target string) string {
	if dir == "" {
		return ""
	}
	safe := strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_' || r == '.' {
			return r
		}
		return '_'
	}, target)
	sum := sha256.Sum256([]byte(target))
	return filepath.Join(dir, fmt.Sprintf("%s-%x.tfplan", safe, sum[:6]))
}

func resolvedMeta(meta targetMeta, override string) targetMeta {
	if override != "" {
		meta.profile = override
		meta.accountID = ""
	}
	if meta.profile == "" {
		meta.profile = os.Getenv("AWS_PROFILE")
	}
	return meta
}

func ensureSessions(ctx context.Context, dirs []string, metaFor map[string]targetMeta, override string, interactive bool) error {
	seen := map[string]bool{}
	for _, dir := range dirs {
		meta := resolvedMeta(metaFor[dir], override)
		if meta.profile == "" {
			continue
		}
		key := meta.profile + "\x00" + meta.accountID
		if seen[key] {
			continue
		}
		seen[key] = true
		slog.Info("ensuring aws session", "profile", meta.profile, "account", meta.accountID, "interactive", interactive)
		if err := aws.EnsureSession(ctx, meta.profile, meta.accountID, interactive); err != nil {
			slog.Warn("ensure aws session failed", "profile", meta.profile, "err", err)
			return err
		}
	}
	return nil
}

// costPlanPath returns a unique temp path for a captured terraform plan file.
func costPlanPath() string {
	f, err := os.CreateTemp("", "tf9-cost-*.tfplan")
	if err != nil {
		return filepath.Join(os.TempDir(), fmt.Sprintf("tf9-cost-%d.tfplan", time.Now().UnixNano()))
	}
	name := f.Name()
	f.Close()
	return name
}

// generateDestroyPlan writes a destroy plan to outFile so infracost can price
// the teardown. It must run while the resources still exist (before the actual
// destroy) so the plan's prior state is the full deployment and infracost shows
// the cost falling toward zero.
func generateDestroyPlan(ctx context.Context, dir string, meta targetMeta, outFile string) error {
	cmd := exec.CommandContext(ctx, "terraform", "plan", "-destroy", "-input=false", "-out="+outFile)
	cmd.Dir = dir
	cmd.Env = terraformEnv(meta)
	if _, err := cmd.Output(); err != nil {
		return infracostErr(err)
	}
	return nil
}

// runInfracost computes a cost estimate for a target. When planFile is set, the
// plan is converted to JSON and infracost reports the cost diff; otherwise it
// runs a directory breakdown for the total monthly cost. The API key is passed
// only via the child environment and is never logged.
func runInfracost(ctx context.Context, dir, planFile string, meta targetMeta, opts Options) (*report.CostEstimate, error) {
	apiKey := opts.InfracostKey
	if apiKey == "" {
		apiKey = os.Getenv("INFRACOST_API_KEY")
	}
	if apiKey == "" {
		return nil, fmt.Errorf("no infracost api key configured")
	}
	currency := opts.Currency
	if currency == "" {
		currency = "USD"
	}

	inputPath := dir
	hasDiff := false
	if planFile != "" {
		jsonFile, err := os.CreateTemp("", "tf9-cost-*.json")
		if err != nil {
			return nil, fmt.Errorf("create plan json temp: %w", err)
		}
		jsonPath := jsonFile.Name()
		defer func() {
			if rerr := os.Remove(jsonPath); rerr != nil && !os.IsNotExist(rerr) {
				slog.Debug("could not remove plan json temp", "file", jsonPath, "err", rerr)
			}
		}()
		show := exec.CommandContext(ctx, "terraform", "show", "-json", planFile)
		show.Dir = dir
		show.Env = terraformEnv(meta)
		showOut, err := show.Output()
		if err != nil {
			jsonFile.Close()
			return nil, fmt.Errorf("terraform show -json: %w", infracostErr(err))
		}
		if _, err := jsonFile.Write(showOut); err != nil {
			jsonFile.Close()
			return nil, fmt.Errorf("write plan json: %w", err)
		}
		jsonFile.Close()
		inputPath = jsonPath
		hasDiff = true
	}

	ic := exec.CommandContext(ctx, "infracost", "breakdown", "--path", inputPath, "--format", "json")
	ic.Dir = dir
	ic.Env = append(os.Environ(), "INFRACOST_API_KEY="+apiKey, "INFRACOST_CURRENCY="+currency)
	icOut, err := ic.Output()
	if err != nil {
		return nil, fmt.Errorf("infracost breakdown: %w", infracostErr(err))
	}

	var parsed struct {
		Currency             string `json:"currency"`
		TotalMonthlyCost     string `json:"totalMonthlyCost"`
		DiffTotalMonthlyCost string `json:"diffTotalMonthlyCost"`
		Projects             []struct {
			Breakdown struct {
				Resources []struct {
					Name        string  `json:"name"`
					MonthlyCost *string `json:"monthlyCost"`
				} `json:"resources"`
			} `json:"breakdown"`
		} `json:"projects"`
	}
	if err := json.Unmarshal(icOut, &parsed); err != nil {
		return nil, fmt.Errorf("parse infracost output: %w", err)
	}
	cur := parsed.Currency
	if cur == "" {
		cur = currency
	}

	var resources []report.CostResource
	for _, p := range parsed.Projects {
		for _, r := range p.Breakdown.Resources {
			mc := 0.0
			if r.MonthlyCost != nil {
				mc = parseMoney(*r.MonthlyCost)
			}
			resources = append(resources, report.CostResource{
				Name:        r.Name,
				Type:        resourceType(r.Name),
				MonthlyCost: mc,
			})
		}
	}
	// Highest-cost first so the UI's "top resources" view is meaningful, and cap
	// the list to keep report sidecars small.
	sort.Slice(resources, func(i, j int) bool { return resources[i].MonthlyCost > resources[j].MonthlyCost })
	if len(resources) > 200 {
		resources = resources[:200]
	}

	return &report.CostEstimate{
		Currency:      cur,
		TotalMonthly:  parseMoney(parsed.TotalMonthlyCost),
		DiffMonthly:   parseMoney(parsed.DiffTotalMonthlyCost),
		HasDiff:       hasDiff,
		ResourceCount: len(resources),
		Resources:     resources,
	}, nil
}

// resourceType extracts the terraform resource type from an Infracost resource
// address (e.g. "module.vpc.aws_subnet.private[0]" → "aws_subnet"). The type is
// the dot-segment immediately before the resource name.
func resourceType(name string) string {
	if name == "" {
		return ""
	}
	// Drop any trailing index like [0] or ["a"].
	if i := strings.IndexByte(name, '['); i >= 0 {
		name = name[:i]
	}
	parts := strings.Split(name, ".")
	if len(parts) >= 2 {
		return parts[len(parts)-2]
	}
	return parts[0]
}

// infracostErr surfaces captured stderr from a failed exec so warnings are
// actionable (api key issues, missing binary, etc.).
func infracostErr(err error) error {
	if ee, ok := err.(*exec.ExitError); ok && len(ee.Stderr) > 0 {
		return fmt.Errorf("%v: %s", err, strings.TrimSpace(string(ee.Stderr)))
	}
	return err
}

func parseMoney(s string) float64 {
	f, _ := strconv.ParseFloat(strings.TrimSpace(s), 64)
	return f
}

func terraformEnv(meta targetMeta) []string {
	env := append(os.Environ(), "AWS_PROFILE="+meta.profile)
	if meta.region != "" {
		env = append(env, "AWS_REGION="+meta.region, "AWS_DEFAULT_REGION="+meta.region)
	}
	return env
}

type prefixWriter struct {
	out     io.Writer
	prefix  string
	atStart bool
}

func newPrefixWriter(out io.Writer, env string) io.Writer {
	return &prefixWriter{out: out, prefix: "[" + env + "] ", atStart: true}
}

func (w *prefixWriter) Write(p []byte) (int, error) {
	var b strings.Builder
	for _, c := range p {
		if w.atStart {
			b.WriteString(w.prefix)
			w.atStart = false
		}
		b.WriteByte(c)
		if c == '\n' {
			w.atStart = true
		}
	}
	_, err := io.WriteString(w.out, b.String())
	return len(p), err
}

type lockedWriter struct {
	mu  sync.Mutex
	out io.Writer
}

func (w *lockedWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.out.Write(p)
}
