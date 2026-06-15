package runner

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/andres/tf9/internal/config"
)

type nopWriteCloser struct {
	io.Writer
}

func (nopWriteCloser) Close() error { return nil }

func TestSupportsGraph(t *testing.T) {
	for _, command := range []string{"plan", "apply", "destroy"} {
		if !supportsGraph(command) {
			t.Errorf("supportsGraph(%q) = false", command)
		}
	}
	for _, command := range []string{"init", "validate", "import", "state"} {
		if supportsGraph(command) {
			t.Errorf("supportsGraph(%q) = true", command)
		}
	}
}

// writeFakeBin writes an executable shell script to dir/name.
func writeFakeBin(t *testing.T, dir, name, script string) {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake %s: %v", name, err)
	}
}

// setupFakeBins creates a temp dir with a fake terraform (tfScript) and a fake
// aws binary (returns a fixed account ID), then prepends the dir to PATH so
// both runner.Run and aws.EnsureSession use them.
func setupFakeBins(t *testing.T, tfScript string) {
	t.Helper()
	dir := t.TempDir()
	writeFakeBin(t, dir, "terraform", tfScript)
	writeFakeBin(t, dir, "aws", "#!/bin/sh\necho 123456789012\n")
	t.Setenv("PATH", fmt.Sprintf("%s%c%s", dir, os.PathListSeparator, os.Getenv("PATH")))
}

// makeTfDir creates a temp directory containing a minimal main.tf so the runner
// recognises it as a valid Terraform target.
func makeTfDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "main.tf"), []byte("terraform {}\n"), 0o600); err != nil {
		t.Fatalf("write main.tf: %v", err)
	}
	return dir
}

// TestCLIApplyStdinConnected verifies that runner.Run passes opts.Stdin to the
// terraform subprocess when InputCh is nil (CLI interactive mode). The fake
// terraform reads its stdin and writes it to an env-var-nominated file.
//
// This test FAILS TO COMPILE before Bug 1 is fixed because Options.Stdin does
// not exist yet.
func TestCLIApplyStdinConnected(t *testing.T) {
	outFile := filepath.Join(t.TempDir(), "stdin.txt")
	t.Setenv("TF_TEST_STDIN_OUTPUT", outFile)

	setupFakeBins(t, "#!/bin/sh\ncat > \"$TF_TEST_STDIN_OUTPUT\"\n")
	tfDir := makeTfDir(t)

	_, _, err := Run(Options{
		SearchRoot:      tfDir,
		TfCommand:       "plan",
		ReportDir:       "-",
		ProfileOverride: "test-profile",
		Output:          io.Discard,
		Stdin:           strings.NewReader("yes\n"), // NEW FIELD — compile fails before fix
	})
	if err != nil {
		t.Fatalf("Run() returned error: %v", err)
	}

	got, err := os.ReadFile(outFile)
	if err != nil {
		t.Fatalf("stdin output file not written by subprocess: %v", err)
	}
	if string(got) != "yes\n" {
		t.Errorf("subprocess stdin = %q, want %q", string(got), "yes\n")
	}
}

// TestCancelKillsSubprocess verifies that cancelling the run context terminates
// the terraform subprocess within 500 ms. The fake terraform sleeps for 60 s
// (using exec so no orphan child holds the stdout pipe open), so without an
// explicit kill in runner.go it would hold up cmd.Wait indefinitely.
func TestCancelKillsSubprocess(t *testing.T) {
	// exec replaces the shell with sleep (same PID), so when we kill the process
	// the pipe closes immediately and cmd.Wait returns without lingering orphans.
	setupFakeBins(t, "#!/bin/sh\nexec sleep 60\n")
	tfDir := makeTfDir(t)

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		_, _, err := Run(Options{
			SearchRoot:      tfDir,
			TfCommand:       "plan",
			ReportDir:       "-",
			ProfileOverride: "test-profile",
			Output:          io.Discard,
			Ctx:             ctx,
		})
		done <- err
	}()

	// Give the subprocess time to start before cancelling.
	time.Sleep(200 * time.Millisecond)
	cancel()

	select {
	case <-done:
		// Run() returned — subprocess was killed.
	case <-time.After(500 * time.Millisecond):
		t.Fatal("Run() did not return within 500ms after context cancel; subprocess may still be alive")
	}
}

// TestInteractiveApplyNoChangesDoesNotHang reproduces the promotion-stuck bug:
// in web interactive apply mode (InputCh set, AutoApprove false), a target whose
// `terraform apply` reports "no changes" exits WITHOUT printing the
// "Enter a value:" prompt and without reading stdin. With an io.Pipe stdin the
// exec stdin-copy goroutine never reaches EOF, so cmd.Wait() hangs forever and
// promotion never advances to the next target. With an *os.File pipe there is no
// copy goroutine and Wait returns on exit. This test fails (times out) before
// the fix and passes after.
func TestInteractiveApplyNoChangesDoesNotHang(t *testing.T) {
	// Fake terraform: ignore stdin, emit a no-changes apply, exit 0.
	setupFakeBins(t, "#!/bin/sh\necho 'No changes. Your infrastructure matches the configuration.'\necho 'Apply complete! Resources: 0 added, 0 changed, 0 destroyed.'\nexit 0\n")

	root := t.TempDir()
	for _, sub := range []string{"stage1", "stage2"} {
		p := filepath.Join(root, sub)
		if err := os.MkdirAll(p, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(p, "main.tf"), []byte("terraform {}\n"), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	inputCh := make(chan string) // non-nil → triggers the web interactive path
	done := make(chan struct {
		results int
		err     error
	}, 1)
	go func() {
		res, _, err := Run(Options{
			SearchRoot: root,
			TfCommand:  "apply",
			ReportDir:  "-",
			Output:     io.Discard, // headless (web) mode
			InputCh:    inputCh,
			ExplicitTargets: []config.RepoTarget{
				{Name: "stage1", Directory: "stage1", AWSProfile: "p1"},
				{Name: "stage2", Directory: "stage2", AWSProfile: "p2"},
			},
		})
		done <- struct {
			results int
			err     error
		}{len(res), err}
	}()

	select {
	case got := <-done:
		if got.err != nil {
			t.Fatalf("Run() returned error: %v", got.err)
		}
		if got.results != 2 {
			t.Fatalf("expected both promotion stages to run, got %d results", got.results)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Run() hung on a no-changes interactive apply — promotion deadlock regression")
	}
}

func TestResolveExplicitTargetsUsesFullPathIdentity(t *testing.T) {
	root := t.TempDir()
	for _, dir := range []string{"service-a/dev", "service-b/dev"} {
		path := filepath.Join(root, dir)
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(path, "main.tf"), []byte("terraform {}\n"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	dirs, meta, labels := resolveExplicitTargets(Options{
		SearchRoot: root,
		ExplicitTargets: []config.RepoTarget{
			{Name: "dev-a", Directory: "service-a/dev", AWSProfile: "profile-a"},
			{Name: "dev-b", Directory: "service-b/dev", AWSProfile: "profile-b"},
		},
	})
	if len(dirs) != 2 {
		t.Fatalf("dirs = %d", len(dirs))
	}
	if meta[dirs[0]].profile != "profile-a" || meta[dirs[1]].profile != "profile-b" {
		t.Fatalf("target metadata collided: %#v", meta)
	}
	if labels[dirs[0]] != "dev-a" || labels[dirs[1]] != "dev-b" {
		t.Fatalf("target labels collided: %#v", labels)
	}
}

func TestBuildArgsForceUnlockWithID(t *testing.T) {
	args, skip := buildArgs("force-unlock", []string{"-ignored"}, nil, "abc-123", ImportSpec{}, false)
	if skip {
		t.Fatalf("force-unlock with id should not skip")
	}
	want := []string{"force-unlock", "-force", "abc-123"}
	if len(args) != len(want) {
		t.Fatalf("args = %v, want %v", args, want)
	}
	for i := range want {
		if args[i] != want[i] {
			t.Fatalf("args = %v, want %v", args, want)
		}
	}
}

func TestBuildArgsForceUnlockWithoutIDSkips(t *testing.T) {
	args, skip := buildArgs("force-unlock", nil, nil, "", ImportSpec{}, false)
	if !skip {
		t.Fatalf("force-unlock without id should skip, got args=%v", args)
	}
}

func TestBuildArgsNormalCommands(t *testing.T) {
	args, skip := buildArgs("plan", []string{"-refresh=false"}, nil, "", ImportSpec{}, false)
	if skip {
		t.Fatalf("plan should not skip")
	}
	want := []string{"plan", "-input=false", "-refresh=false"}
	if len(args) != len(want) {
		t.Fatalf("plan args = %v, want %v", args, want)
	}
	for i := range want {
		if args[i] != want[i] {
			t.Fatalf("plan args = %v, want %v", args, want)
		}
	}

	// autoApprove=true adds -auto-approve
	args, _ = buildArgs("apply", nil, nil, "", ImportSpec{}, true)
	want = []string{"apply", "-input=false", "-auto-approve"}
	if len(args) != len(want) {
		t.Fatalf("apply autoApprove=true args = %v, want %v", args, want)
	}
	for i := range want {
		if args[i] != want[i] {
			t.Fatalf("apply autoApprove=true args = %v, want %v", args, want)
		}
	}

	// Interactive apply (autoApprove=false) must NOT add -input=false or
	// -auto-approve — terraform needs input enabled to read the "yes" approval
	// from stdin, otherwise the prompt is shown but the run hangs.
	args, _ = buildArgs("apply", nil, nil, "", ImportSpec{}, false)
	want = []string{"apply"}
	if len(args) != len(want) {
		t.Fatalf("apply autoApprove=false args = %v, want %v", args, want)
	}
	for i := range want {
		if args[i] != want[i] {
			t.Fatalf("apply autoApprove=false args = %v, want %v", args, want)
		}
	}

	// destroy stays interactive too (never gets -input=false).
	args, _ = buildArgs("destroy", nil, nil, "", ImportSpec{}, false)
	if len(args) != 1 || args[0] != "destroy" {
		t.Fatalf("interactive destroy args = %v, want [destroy]", args)
	}
}

func TestBuildArgsResourceAddresses(t *testing.T) {
	args, _ := buildArgs("plan", []string{"-refresh=false"}, []string{"module.network", `aws_instance.web["blue"]`}, "", ImportSpec{}, false)
	want := []string{"plan", "-input=false", "-refresh=false", "-target=module.network", `-target=aws_instance.web["blue"]`}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("plan args = %v, want %v", args, want)
	}

	args, _ = buildArgs("apply", nil, []string{"module.network"}, "", ImportSpec{}, true)
	want = []string{"apply", "-input=false", "-auto-approve", "-target=module.network"}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("apply args = %v, want %v", args, want)
	}

	for _, command := range []string{"taint", "untaint"} {
		args, _ = buildArgs(command, []string{"-allow-missing"}, []string{`aws_instance.web["blue"]`}, "", ImportSpec{}, false)
		want = []string{command, "-allow-missing", `aws_instance.web["blue"]`}
		if !reflect.DeepEqual(args, want) {
			t.Fatalf("%s args = %v, want %v", command, args, want)
		}
	}
}

func TestSavedPlanFilePathSanitizesTarget(t *testing.T) {
	dir := t.TempDir()
	got := SavedPlanFilePath(dir, "prod/us west")
	if !strings.HasPrefix(filepath.Base(got), "prod_us_west-") || !strings.HasSuffix(got, ".tfplan") {
		t.Fatalf("savedPlanFilePath() = %q, want sanitized name with hash suffix", got)
	}
	if got == SavedPlanFilePath(dir, "prod_us_west") {
		t.Fatal("distinct target names produced the same saved plan path")
	}
}

func TestPlanSavesAndApplyUsesReviewedPlan(t *testing.T) {
	argsFile := filepath.Join(t.TempDir(), "args.txt")
	t.Setenv("TF_TEST_ARGS", argsFile)
	setupFakeBins(t, "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$TF_TEST_ARGS\"\nfor a in \"$@\"; do case \"$a\" in -out=*) touch \"${a#-out=}\";; esac; done\n")
	tfDir := makeTfDir(t)
	planDir := t.TempDir()

	_, _, err := Run(Options{
		SearchRoot:      tfDir,
		TfCommand:       "plan",
		ReportDir:       "-",
		ProfileOverride: "test-profile",
		Output:          io.Discard,
		SavePlanDir:     planDir,
	})
	if err != nil {
		t.Fatal(err)
	}
	planFile := SavedPlanFilePath(planDir, filepath.Base(tfDir))
	if _, err := os.Stat(planFile); err != nil {
		t.Fatalf("saved plan was not created: %v", err)
	}

	_, _, err = Run(Options{
		SearchRoot:      tfDir,
		TfCommand:       "apply",
		ReportDir:       "-",
		ProfileOverride: "test-profile",
		Output:          io.Discard,
		ApplyPlanFiles:  map[string]string{filepath.Base(tfDir): planFile},
	})
	if err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(argsFile)
	if err != nil {
		t.Fatal(err)
	}
	want := "apply\n-input=false\n" + planFile + "\n"
	if string(got) != want {
		t.Fatalf("terraform args = %q, want %q", string(got), want)
	}
}

func TestParallelReviewedApplyUsesSavedPlan(t *testing.T) {
	argsFile := filepath.Join(t.TempDir(), "args.txt")
	t.Setenv("TF_TEST_ARGS", argsFile)
	setupFakeBins(t, "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$TF_TEST_ARGS\"\n")
	tfDir := makeTfDir(t)
	planFile := filepath.Join(t.TempDir(), "saved.tfplan")
	if err := os.WriteFile(planFile, []byte("plan"), 0o600); err != nil {
		t.Fatal(err)
	}

	_, _, err := Run(Options{
		SearchRoot:      tfDir,
		TfCommand:       "apply",
		ReportDir:       "-",
		ProfileOverride: "test-profile",
		Output:          io.Discard,
		Parallel:        true,
		ApplyPlanFiles:  map[string]string{filepath.Base(tfDir): planFile},
	})
	if err != nil {
		t.Fatalf("parallel reviewed apply should be permitted: %v", err)
	}
	got, err := os.ReadFile(argsFile)
	if err != nil {
		t.Fatal(err)
	}
	want := "apply\n-input=false\n" + planFile + "\n"
	if string(got) != want {
		t.Fatalf("terraform args = %q, want %q", string(got), want)
	}
}

func TestParallelApplyWithoutReviewedPlanIsRejected(t *testing.T) {
	setupFakeBins(t, "#!/bin/sh\nexit 0\n")
	tfDir := makeTfDir(t)
	_, _, err := Run(Options{
		SearchRoot:      tfDir,
		TfCommand:       "apply",
		ReportDir:       "-",
		ProfileOverride: "test-profile",
		Output:          io.Discard,
		Parallel:        true,
	})
	if err == nil {
		t.Fatal("parallel apply without reviewed plan files should be rejected")
	}
}

func TestDeniedApplyIsNotReportedAsFailure(t *testing.T) {
	setupFakeBins(t, "#!/bin/sh\necho 'Apply cancelled.'\nexit 1\n")
	tfDir := makeTfDir(t)
	var out strings.Builder

	results, _, err := Run(Options{
		SearchRoot:      tfDir,
		TfCommand:       "apply",
		ReportDir:       "-",
		ProfileOverride: "test-profile",
		AutoApprove:     true,
		Output:          &out,
	})
	if !errors.Is(err, ErrApprovalDenied) {
		t.Fatalf("Run() error = %v, want ErrApprovalDenied", err)
	}
	if len(results) != 1 || results[0].Failed {
		t.Fatalf("denied result should not be failed: %#v", results)
	}
	got := out.String()
	if !strings.Contains(got, "[DENIED]") || !strings.Contains(got, "approval denied") {
		t.Fatalf("denial output missing clear status: %q", got)
	}
	if strings.Contains(got, "[FAILED]") || strings.Contains(got, "fix "+filepath.Base(tfDir)) {
		t.Fatalf("denial output was reported as failure: %q", got)
	}
}

func TestApprovalWasDeniedRecognizesApplyAndDestroy(t *testing.T) {
	for _, output := range []string{
		"Apply cancelled.",
		"\x1b[31mDestroy cancelled.\x1b[0m",
	} {
		if !approvalWasDenied(output) {
			t.Fatalf("approvalWasDenied(%q) = false", output)
		}
	}
	if approvalWasDenied("Error: provider failed") {
		t.Fatal("ordinary Terraform failure was classified as denial")
	}
}

func TestMissingTaintResourceIsSkipped(t *testing.T) {
	diagnostic := strings.Join([]string{
		"Error: No such resource instance",
		"There is no resource instance in the state with the address",
		"module.region_delta.terraform_data.service_volatile[22].",
	}, "\n")
	setupFakeBins(t, "#!/bin/sh\ncat <<'EOF'\n"+diagnostic+"\nEOF\nexit 1\n")
	tfDir := makeTfDir(t)
	var out strings.Builder

	results, _, err := Run(Options{
		SearchRoot:        tfDir,
		TfCommand:         "taint",
		ResourceAddresses: []string{"module.region_delta.terraform_data.service_volatile[22]"},
		ReportDir:         "-",
		ProfileOverride:   "test-profile",
		Output:            &out,
	})
	if err != nil {
		t.Fatalf("Run() error = %v, want success", err)
	}
	if len(results) != 1 || results[0].Failed {
		t.Fatalf("missing taint resource should be skipped: %#v", results)
	}
	if !strings.Contains(out.String(), "[SKIPPED]") || strings.Contains(out.String(), "[FAILED]") {
		t.Fatalf("output = %q, want skipped without failed", out.String())
	}
}

func TestMissingResourceDiagnosticDoesNotMaskOtherCommands(t *testing.T) {
	output := "Error: No such resource instance\nThere is no resource instance in the state with the address aws_instance.web."
	if _, skipped := skippableCommandFailure("plan", output); skipped {
		t.Fatal("plan failure was classified as skipped")
	}
	if _, skipped := skippableCommandFailure("taint", "Error: provider failed"); skipped {
		t.Fatal("ordinary taint failure was classified as skipped")
	}
}

func TestForceUnlockAlreadyUnlockedIsSkipped(t *testing.T) {
	setupFakeBins(t, "#!/bin/sh\necho 'Failed to unlock state: LocalState not locked'\nexit 1\n")
	tfDir := makeTfDir(t)
	env := filepath.Base(tfDir)
	var out strings.Builder

	results, _, err := Run(Options{
		SearchRoot:      tfDir,
		TfCommand:       "force-unlock",
		LockIDs:         map[string]string{env: "abc-123"},
		ReportDir:       "-",
		ProfileOverride: "test-profile",
		Output:          &out,
	})
	if err != nil {
		t.Fatalf("Run() error = %v, want success", err)
	}
	if len(results) != 1 || results[0].Failed {
		t.Fatalf("already unlocked state should be skipped: %#v", results)
	}
	if !strings.Contains(out.String(), "[SKIPPED]") || !strings.Contains(out.String(), "already unlocked") {
		t.Fatalf("output = %q, want already-unlocked skip", out.String())
	}
}

func TestForceUnlockMismatchedLockIDStillFails(t *testing.T) {
	output := `Failed to unlock state: state lock ID "abc" does not match existing lock ID "def"`
	if _, skipped := skippableCommandFailure("force-unlock", output); skipped {
		t.Fatal("mismatched force-unlock lock ID was classified as skipped")
	}
}

func TestApprovalMonitorDisplaysApproved(t *testing.T) {
	var out, stdin bytes.Buffer
	input := make(chan string, 1)
	input <- "yes"
	monitor := &approvalMonitor{
		out:     &out,
		stdinW:  nopWriteCloser{Writer: &stdin},
		inputCh: input,
		ctx:     context.Background(),
	}

	if _, err := monitor.Write([]byte("Enter a value:")); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), approvalAcceptedLine) {
		t.Fatalf("output = %q, want approved marker", out.String())
	}
	if stdin.String() != "yes\n" {
		t.Fatalf("terraform stdin = %q, want yes newline", stdin.String())
	}
}

func TestApprovalMonitorDoesNotApproveDenial(t *testing.T) {
	var out, stdin bytes.Buffer
	input := make(chan string, 1)
	input <- "no"
	monitor := &approvalMonitor{
		out:     &out,
		stdinW:  nopWriteCloser{Writer: &stdin},
		inputCh: input,
		ctx:     context.Background(),
	}

	if _, err := monitor.Write([]byte("Enter a value:")); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(out.String(), "[APPROVED]") {
		t.Fatalf("denial output incorrectly contains approval: %q", out.String())
	}
}

func TestReportOutputRemovesApprovalControlLines(t *testing.T) {
	input := strings.Join([]string{
		"Terraform will perform the following actions:",
		ApprovalSentinel,
		approvalAcceptedLine,
		ApprovalClearSentinel,
		"Apply complete! Resources: 1 added, 0 changed, 0 destroyed.",
	}, "\n")
	got := reportOutput(input)
	if strings.Contains(got, "__TF9_APPROVAL") || strings.Contains(got, "[APPROVED]") {
		t.Fatalf("report output contains approval control lines: %q", got)
	}
	if !strings.Contains(got, "Terraform will perform") || !strings.Contains(got, "Apply complete!") {
		t.Fatalf("report output removed regular Terraform output: %q", got)
	}
}

func TestPlanSummaryUsesAppliedBoolean(t *testing.T) {
	var out strings.Builder
	printPlanSummary(&out, []envResult{
		{env: "dev", applied: true, summary: &planSummary{add: 1}},
		{env: "prod", applied: false, failed: true},
	})
	got := out.String()
	if !strings.Contains(got, "APPLIED") || !strings.Contains(got, "True") || !strings.Contains(got, "False") {
		t.Fatalf("summary does not show applied booleans: %q", got)
	}
	if strings.Contains(got, "STATUS") {
		t.Fatalf("summary still contains status heading: %q", got)
	}
}

func TestReorderDirsUsesTargetNames(t *testing.T) {
	dirs := []string{"/repo/a/dev", "/repo/b/dev"}
	labels := map[string]string{dirs[0]: "dev-a", dirs[1]: "dev-b"}
	got := reorderDirs(dirs, labels, []string{"dev-b", "dev-a"})
	if got[0] != "/repo/b/dev" || got[1] != "/repo/a/dev" {
		t.Fatalf("unexpected order: %v", got)
	}
}
