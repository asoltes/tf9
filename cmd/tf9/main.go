package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"text/tabwriter"
	"time"

	"github.com/andres/tf9/internal/api"
	"github.com/andres/tf9/internal/applog"
	"github.com/andres/tf9/internal/config"
	"github.com/andres/tf9/internal/report"
	"github.com/andres/tf9/internal/runner"
	"github.com/andres/tf9/internal/server"
	"github.com/spf13/cobra"
)

// lineBuf captures output lines for run history recording.
type lineBuf struct {
	mu    sync.Mutex
	lines []string
	buf   string
}

func (b *lineBuf) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.buf += string(p)
	for {
		idx := strings.IndexByte(b.buf, '\n')
		if idx == -1 {
			break
		}
		b.lines = append(b.lines, b.buf[:idx])
		b.buf = b.buf[idx+1:]
	}
	return len(p), nil
}

func (b *lineBuf) flush() {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.buf != "" {
		b.lines = append(b.lines, b.buf)
		b.buf = ""
	}
}

func (b *lineBuf) snapshot() []string {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := make([]string, len(b.lines))
	copy(out, b.lines)
	return out
}

var (
	configPath      string
	repoName        string
	targetFilter    string
	profileOverride string
	nonprodOnly     bool
	reportDir       string
	noReport        bool
	showReport      bool
	timeout         time.Duration
	force           bool
	parallel        bool
	recursive       bool
	skip            []string
	targets         []string
	varFiles        []string
	lockIDs         string
	cost            bool
)

// parseLockIDs parses a "name:id,name:id" string into a map of target name to
// lock id. Empty input yields nil. Each pair is split on the first colon (lock
// ids never contain colons, but SplitN keeps it safe). Malformed pairs — those
// without a colon, or with an empty name or empty id — are skipped.
func parseLockIDs(s string) map[string]string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	out := make(map[string]string)
	for _, pair := range strings.Split(s, ",") {
		parts := strings.SplitN(pair, ":", 2)
		if len(parts) != 2 {
			continue
		}
		name := strings.TrimSpace(parts[0])
		id := strings.TrimSpace(parts[1])
		if name == "" || id == "" {
			continue
		}
		out[name] = id
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func main() {
	root := newRootCmd()
	if err := root.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}
}

func newRootCmd() *cobra.Command {
	root := &cobra.Command{
		Use:           "tf9 <terraform-command> [target-filter] [flags] [-- terraform-args]",
		Short:         "Run Terraform across configured repository targets",
		SilenceUsage:  true,
		SilenceErrors: true,
		Args:          cobra.ArbitraryArgs,
		PersistentPreRun: func(cmd *cobra.Command, args []string) {
			if configPath != "" {
				config.SetPath(configPath)
			}
			applog.InitCLI()
		},
		RunE: runTerraform,
	}
	root.PersistentFlags().StringVar(&configPath, "config", "", "Configuration file (default: ~/.config/tf9/config.yaml)")

	// These flags apply only when the root command passes through to Terraform.
	root.Flags().StringVarP(&repoName, "repo", "r", "", "Configured repository name")
	root.Flags().StringVar(&targetFilter, "filter", "", "Target name filter")
	root.Flags().StringVarP(&profileOverride, "profile", "p", "", "Override AWS profile for all targets")
	root.Flags().BoolVar(&nonprodOnly, "nonprod", false, "Skip targets whose names start with prod")
	root.Flags().StringVar(&reportDir, "report-dir", "", "Directory to save HTML reports")
	root.Flags().BoolVar(&noReport, "no-report", false, "Disable HTML report generation")
	root.Flags().BoolVar(&showReport, "show-report", false, "Open the generated report in the web UI")
	root.Flags().DurationVar(&timeout, "timeout", 30*time.Minute, "Maximum Terraform run duration")
	root.Flags().BoolVar(&force, "force", false, "Skip production confirmation")
	root.Flags().BoolVar(&parallel, "parallel", false, "Run up to four targets concurrently (not apply/destroy)")
	root.Flags().BoolVarP(&recursive, "recursive", "R", false, "Scan child terraform dirs in profile_mappings order (uses dir→profile map)")
	root.Flags().StringSliceVarP(&skip, "skip", "s", nil, "Directory/target names to skip; comma-separated or repeatable (e.g. --skip prod-euw2,prod-euc1)")
	root.Flags().StringArrayVar(&targets, "target", nil, "Terraform resource target (repeatable)")
	root.Flags().StringArrayVar(&varFiles, "var-file", nil, "Terraform variable file (repeatable)")
	root.Flags().StringVar(&lockIDs, "lock-ids", "", "Per-target lock ids for force-unlock (e.g. dev:abc,staging:def)")
	root.Flags().BoolVar(&cost, "cost", false, "Estimate infrastructure cost with Infracost (needs an API key in infracost.yaml or INFRACOST_API_KEY)")

	root.AddCommand(newConfigCmd(), newServeCmd())
	return root
}

func runTerraform(cmd *cobra.Command, args []string) error {
	if len(args) == 0 {
		return cmd.Help()
	}
	tfCommand := args[0]
	if removedCommands[tfCommand] {
		return fmt.Errorf("%q was removed; use tf9 config repo or tf9 config target", tfCommand)
	}
	if recursive && repoName != "" {
		return fmt.Errorf("--recursive and --repo are mutually exclusive")
	}
	envFilter, tfArgs, err := splitTerraformArgs(tfCommand, args[1:], targetFilter)
	if err != nil {
		return err
	}
	searchRoot, repoLabel, explicitTargets, err := resolveRunTargets(repoName)
	if err != nil {
		return err
	}
	cliAutoApprove := force && (tfCommand == "apply" || tfCommand == "destroy")
	for _, target := range targets {
		tfArgs = append(tfArgs, "-target="+target)
	}
	for _, file := range varFiles {
		tfArgs = append(tfArgs, "-var-file="+file)
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	// Forward Ctrl+C / SIGTERM to context cancel. When terraform is the TTY
	// foreground group the signal goes there directly; once terraform exits and
	// we restore the foreground, any subsequent Ctrl+C reaches tf9 here and
	// stops the remaining targets cleanly.
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
	dir := reportDir
	if dir == "" {
		dir = config.DefaultReportDir()
	}
	if noReport {
		dir = "-"
	}

	cfg, _ := config.Load()

	costEnabled := cost
	var infracostKey, infracostCurrency string
	if costEnabled {
		ic, _ := config.LoadInfracost()
		infracostKey = ic.APIKey
		infracostCurrency = ic.Currency
		if infracostKey == "" {
			costEnabled = false
			fmt.Fprintln(os.Stderr, "  [WARN] --cost requested but no Infracost API key configured (infracost.yaml / INFRACOST_API_KEY); running without cost.")
		}
	}

	var lb lineBuf
	startedAt := time.Now().UTC()
	opts := runner.Options{
		SearchRoot:      searchRoot,
		RepoLabel:       repoLabel,
		TfCommand:       tfCommand,
		TfArgs:          tfArgs,
		EnvFilter:       envFilter,
		Skip:            skip,
		ProfileOverride: profileOverride,
		ProfileMappings: cfg.ProfileMappings,
		NonprodOnly:     nonprodOnly,
		ReportDir:       dir,
		Ctx:             ctx,
		ExplicitTargets: explicitTargets,
		Parallel:        parallel,
		Recursive:       recursive,
		LockIDs:         parseLockIDs(lockIDs),
		AutoApprove:     cliAutoApprove,
		Output:          io.MultiWriter(os.Stdout, &lb),
		Cost:            costEnabled,
		InfracostKey:    infracostKey,
		Currency:        infracostCurrency,
	}
	// For interactive apply/destroy (without --force), wire the real stdin so
	// terraform can present its "Enter a value:" prompt directly to the user.
	if !cliAutoApprove && (tfCommand == "apply" || tfCommand == "destroy") {
		opts.Stdin = os.Stdin
	}
	slog.Info("cli run started", "command", tfCommand, "repo", repoName, "envFilter", envFilter, "parallel", parallel, "recursive", recursive)
	_, reportName, runErr := runner.Run(opts)
	finishedAt := time.Now().UTC()
	lb.flush()

	status := api.StatusSuccess
	if runErr != nil {
		if ctx.Err() != nil {
			status = api.StatusCancelled
		} else if errors.Is(runErr, runner.ErrApprovalDenied) {
			status = api.StatusDenied
		} else {
			status = api.StatusFailed
		}
	}
	if runErr != nil && !errors.Is(runErr, runner.ErrApprovalDenied) {
		slog.Warn("cli run finished", "command", tfCommand, "status", status, "duration", finishedAt.Sub(startedAt), "err", runErr.Error())
	} else {
		slog.Info("cli run finished", "command", tfCommand, "status", status, "duration", finishedAt.Sub(startedAt))
	}
	req := api.RunRequest{
		Command:     tfCommand,
		Repo:        repoName,
		EnvFilter:   envFilter,
		Profile:     profileOverride,
		NonprodOnly: nonprodOnly,
		Parallel:    parallel,
		ExtraArgs:   tfArgs,
		Cost:        costEnabled,
	}
	api.AppendCLIRun(req, startedAt, finishedAt, status, lb.snapshot(), reportName, "")

	if showReport && !noReport {
		openPath := "#reports"
		if reportName != "" {
			openPath = "#report/" + reportName
		}
		if err := server.Serve(dir, 8080, openPath, true, api.NewRunManager()); err != nil {
			slog.Warn("report server exited with error", "err", err)
		}
	}
	if errors.Is(runErr, runner.ErrApprovalDenied) {
		return nil
	}
	return runErr
}

func splitTerraformArgs(command string, args []string, explicitFilter string) (string, []string, error) {
	filter := explicitFilter
	var tfArgs []string
	allowPositionalFilter := command == "plan" || command == "apply" || command == "destroy"
	for i, arg := range args {
		if arg == "--" {
			tfArgs = append(tfArgs, args[i+1:]...)
			break
		}
		if allowPositionalFilter && explicitFilter == "" && filter == "" && !strings.HasPrefix(arg, "-") {
			filter = arg
			continue
		}
		tfArgs = append(tfArgs, arg)
	}
	if explicitFilter != "" && allowPositionalFilter && len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		return "", nil, fmt.Errorf("use either positional target filter or --filter, not both")
	}
	return filter, tfArgs, nil
}

func resolveRunTargets(name string) (string, string, []config.RepoTarget, error) {
	if name == "" {
		pwd, err := os.Getwd()
		return pwd, "", nil, err
	}
	repo, ok, err := config.FindRepository(name)
	if err != nil {
		return "", "", nil, err
	}
	if !ok {
		return "", "", nil, fmt.Errorf("unknown repo %q", name)
	}
	if len(repo.Targets) == 0 {
		return "", "", nil, fmt.Errorf("repo %q has no configured targets", name)
	}
	return repo.Path, repo.Name, repo.Targets, nil
}

var removedCommands = map[string]bool{
	"list-repos": true, "add-repo": true, "remove-repo": true,
	"list-envs": true, "add-env": true, "remove-env": true,
	"show-report": true, "drift": true, "lr": true, "le": true,
}

func selectsProd(filter string, targets []config.RepoTarget) bool {
	if nonprodOnly {
		return false
	}
	if len(targets) == 0 {
		return filter == "" || strings.Contains(strings.ToLower(filter), "prod")
	}
	for _, target := range targets {
		if !target.Disabled && matchFilter(target.Name, filter) && strings.HasPrefix(strings.ToLower(target.Name), "prod") {
			return true
		}
	}
	return false
}

func matchFilter(name, filter string) bool {
	if filter == "" {
		return true
	}
	for _, part := range strings.Split(filter, ",") {
		if strings.Contains(name, strings.TrimSpace(part)) {
			return true
		}
	}
	return false
}

func newConfigCmd() *cobra.Command {
	cmd := &cobra.Command{Use: "config", Short: "Manage repositories and Terraform targets"}
	cmd.AddCommand(newRepoCmd(), newTargetCmd())
	return cmd
}

func newRepoCmd() *cobra.Command {
	cmd := &cobra.Command{Use: "repo", Short: "Manage configured repositories"}
	cmd.AddCommand(
		&cobra.Command{
			Use:   "list",
			Short: "List repositories",
			Args:  cobra.NoArgs,
			RunE: func(cmd *cobra.Command, args []string) error {
				cfg, err := config.Load()
				if err != nil {
					return err
				}
				tw := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
				fmt.Fprintln(tw, "NAME\tPATH\tTARGETS")
				for _, repo := range cfg.Repositories {
					fmt.Fprintf(tw, "%s\t%s\t%d\n", repo.Name, repo.Path, len(repo.Targets))
				}
				return tw.Flush()
			},
		},
		&cobra.Command{
			Use:   "add <name> <absolute-path>",
			Short: "Add a repository",
			Args:  cobra.ExactArgs(2),
			RunE: func(cmd *cobra.Command, args []string) error {
				if err := config.AddRepo(args[0], args[1]); err != nil {
					return err
				}
				fmt.Printf("Added repository %s\n", args[0])
				return nil
			},
		},
		&cobra.Command{
			Use:   "remove <name>",
			Short: "Remove a repository and its targets",
			Args:  cobra.ExactArgs(1),
			RunE: func(cmd *cobra.Command, args []string) error {
				return config.RemoveRepo(args[0])
			},
		},
	)
	return cmd
}

func newTargetCmd() *cobra.Command {
	var repo string
	cmd := &cobra.Command{Use: "target", Short: "Manage ordered repository targets"}
	cmd.PersistentFlags().StringVarP(&repo, "repo", "r", "", "Repository name (required)")
	cmd.MarkPersistentFlagRequired("repo")

	var output string
	list := &cobra.Command{
		Use:   "list",
		Short: "List targets",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := config.LoadRepoConfig(repo)
			if err != nil {
				return err
			}
			if output == "json" {
				encoder := json.NewEncoder(os.Stdout)
				encoder.SetIndent("", "  ")
				return encoder.Encode(cfg.Targets)
			}
			if output != "table" {
				return fmt.Errorf("invalid output %q", output)
			}
			tw := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
			fmt.Fprintln(tw, "#\tNAME\tDIRECTORY\tAWS PROFILE\tACCOUNT\tREGION\tDISABLED")
			for i, target := range cfg.Targets {
				fmt.Fprintf(tw, "%d\t%s\t%s\t%s\t%s\t%s\t%t\n", i+1, target.Name, target.Directory, target.AWSProfile, target.AccountID, target.Region, target.Disabled)
			}
			return tw.Flush()
		},
	}
	list.Flags().StringVarP(&output, "output", "o", "table", "Output format: table or json")

	var profile, accountID, region, after string
	var disabled bool
	add := &cobra.Command{
		Use:   "add <name> <directory>",
		Short: "Add an ordered Terraform target",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			return config.AddTarget(repo, config.RepoTarget{
				Name: args[0], Directory: args[1], AWSProfile: profile,
				AccountID: accountID, Region: region, Disabled: disabled,
			}, after)
		},
	}
	add.Flags().StringVarP(&profile, "profile", "p", "", "AWS profile (required)")
	add.Flags().StringVar(&accountID, "account-id", "", "Expected 12-digit AWS account ID")
	add.Flags().StringVar(&region, "region", "", "AWS region")
	add.Flags().BoolVar(&disabled, "disabled", false, "Add the target disabled")
	add.Flags().StringVar(&after, "after", "", "Insert after another target")
	add.MarkFlagRequired("profile")

	remove := &cobra.Command{
		Use:   "remove <name>",
		Short: "Remove a target",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return config.RemoveTarget(repo, args[0])
		},
	}
	var moveAfter string
	move := &cobra.Command{
		Use:   "move <name>",
		Short: "Move a target to the beginning or after another target",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return config.MoveTarget(repo, args[0], moveAfter)
		},
	}
	move.Flags().StringVar(&moveAfter, "after", "", "Move after this target; omit to move first")
	cmd.AddCommand(list, add, remove, move)
	return cmd
}

func newServeCmd() *cobra.Command {
	var port int
	var dir, reportSelection string
	var open bool
	cmd := &cobra.Command{
		Use:   "serve",
		Short: "Start the local web UI",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			if dir == "" {
				dir = config.DefaultReportDir()
			}
			openPath := ""
			if reportSelection != "" {
				reports, err := listReportFiles(dir)
				if err != nil {
					return err
				}
				if len(reports) == 0 {
					return fmt.Errorf("no reports found in %s", dir)
				}
				n := 1
				if reportSelection != "latest" {
					n, err = strconv.Atoi(reportSelection)
					if err != nil || n < 1 {
						return fmt.Errorf("--report must be latest or a positive number")
					}
				}
				if n > len(reports) {
					return fmt.Errorf("only %d report(s) available", len(reports))
				}
				openPath = "#report/" + reports[n-1]
			}
			return server.Serve(dir, port, openPath, open, api.NewRunManager())
		},
	}
	cmd.Flags().IntVar(&port, "port", 8080, "Port to listen on")
	cmd.Flags().StringVar(&dir, "dir", "", "Report directory")
	cmd.Flags().StringVar(&reportSelection, "report", "", "Open latest report or report number N")
	cmd.Flags().BoolVar(&open, "open", false, "Open browser automatically after starting")
	return cmd
}

func listReportFiles(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	type item struct {
		name string
		at   time.Time
	}
	var reports []item
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasPrefix(name, "tf9-") || !strings.HasSuffix(name, ".html") {
			continue
		}
		_, at, live := report.ParseReportName(name)
		if !live {
			reports = append(reports, item{name: name, at: at})
		}
	}
	sort.Slice(reports, func(i, j int) bool { return reports[i].at.After(reports[j].at) })
	names := make([]string, len(reports))
	for i, item := range reports {
		names[i] = item.name
	}
	return names, nil
}
