package config

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func useTestConfig(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.yaml")
	SetPath(path)
	t.Cleanup(func() { SetPath("") })
	return path
}

func TestDefaultPathsUseTF9Identity(t *testing.T) {
	SetPath("")
	t.Cleanup(func() { SetPath("") })
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	t.Setenv("TF9_CONFIG", "")

	wantDir := filepath.Join(os.Getenv("XDG_CONFIG_HOME"), "tf9")
	if got := ConfigPath(); got != filepath.Join(wantDir, "config.yaml") {
		t.Fatalf("ConfigPath() = %q, want %q", got, filepath.Join(wantDir, "config.yaml"))
	}
	if got := RunsFile(); got != filepath.Join(wantDir, "runs.json") {
		t.Fatalf("RunsFile() = %q, want %q", got, filepath.Join(wantDir, "runs.json"))
	}
	if got := LogFile(); got != filepath.Join(wantDir, "tf9.log") {
		t.Fatalf("LogFile() = %q, want %q", got, filepath.Join(wantDir, "tf9.log"))
	}
	if got := DefaultReportDir(); got != filepath.Join(wantDir, "reports") {
		t.Fatalf("DefaultReportDir() = %q, want %q", got, filepath.Join(wantDir, "reports"))
	}
	if got := SavedPlanDir(); got != filepath.Join(wantDir, "plans") {
		t.Fatalf("SavedPlanDir() = %q, want %q", got, filepath.Join(wantDir, "plans"))
	}
}

func TestTF9ConfigEnvironmentOverride(t *testing.T) {
	SetPath("")
	t.Cleanup(func() { SetPath("") })
	want := filepath.Join(t.TempDir(), "team.yaml")
	t.Setenv("TF9_CONFIG", want)

	if got := ConfigPath(); got != want {
		t.Fatalf("ConfigPath() = %q, want %q", got, want)
	}
}

func TestSaveAndLoad(t *testing.T) {
	path := useTestConfig(t)
	ticketingURL := "https://tickets.example/browse/{ticket}"
	want := Config{
		Version: 1,
		Web: WebConfig{
			SavedPlanApply:             true,
			ApprovalTimeoutSeconds:     45,
			ReviewedPlanTimeoutSeconds: 900,
			TicketingURL:               &ticketingURL,
			ReconcilePrompt:            "Use the team reconciliation runbook.",
		},
		Repositories: []Repository{{
			Name:              "infra",
			Path:              "/work/infra",
			DefaultAWSProfile: "company-dev",
			DefaultAccountID:  "123456789012",
			DefaultRegion:     "eu-west-2",
			Targets: []RepoTarget{{
				Name: "dev", Directory: "environments/dev", AWSProfile: "company-dev",
				AccountID: "123456789012", Region: "eu-west-2",
			}},
		}},
	}
	if err := Save(want); err != nil {
		t.Fatal(err)
	}
	got, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Repositories) != 1 || got.Repositories[0].Targets[0].AWSProfile != "company-dev" {
		t.Fatalf("unexpected config: %#v", got)
	}
	repo := got.Repositories[0]
	if repo.DefaultAWSProfile != "company-dev" || repo.DefaultAccountID != "123456789012" || repo.DefaultRegion != "eu-west-2" {
		t.Fatalf("repository defaults did not round-trip: %#v", repo)
	}
	if !got.Web.SavedPlanApply {
		t.Fatal("web.saved_plan_apply did not round-trip")
	}
	if got.Web.ApprovalTimeoutSeconds != 45 || got.Web.ReviewedPlanTimeoutSeconds != 900 {
		t.Fatalf("web timeouts did not round-trip: %#v", got.Web)
	}
	if got.Web.TicketingURL == nil || *got.Web.TicketingURL != ticketingURL {
		t.Fatalf("web ticketing URL did not round-trip: %#v", got.Web)
	}
	if got.Web.ReconcilePrompt != "Use the team reconciliation runbook." {
		t.Fatalf("web reconcile prompt did not round-trip: %#v", got.Web)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("config mode = %o, want 600", info.Mode().Perm())
	}
}

func TestTicketingURLAllowsNullAndRejectsInvalidURL(t *testing.T) {
	useTestConfig(t)
	if err := Save(Config{Version: 1, Web: WebConfig{TicketingURL: nil}}); err != nil {
		t.Fatalf("null ticketing URL rejected: %v", err)
	}
	invalid := "tickets.example/browse/{ticket}"
	err := Save(Config{Version: 1, Web: WebConfig{TicketingURL: &invalid}})
	if err == nil || !strings.Contains(err.Error(), "ticketing_url") {
		t.Fatalf("expected ticketing URL validation error, got %v", err)
	}
}

func TestTicketURLFor(t *testing.T) {
	withPlaceholder := "https://tickets.example/browse/{ticket}"
	cfg := WebConfig{TicketingURL: &withPlaceholder}
	if got := cfg.TicketURLFor("OPS 42"); got != "https://tickets.example/browse/OPS%2042" {
		t.Fatalf("placeholder URL = %q", got)
	}
	appendBase := "https://tickets.example/issues/"
	cfg.TicketingURL = &appendBase
	if got := cfg.TicketURLFor("OPS-42"); got != "https://tickets.example/issues/OPS-42" {
		t.Fatalf("appended URL = %q", got)
	}
	if got := (WebConfig{}).TicketURLFor("OPS-42"); got != "" {
		t.Fatalf("unconfigured URL = %q", got)
	}
}

func TestWebTimeoutDefaultsAndValidation(t *testing.T) {
	if got := (WebConfig{}).ApprovalTimeout(); got != 300*time.Second {
		t.Fatalf("default approval timeout = %s", got)
	}
	if got := (WebConfig{}).ReviewedPlanTimeout(); got != time.Hour {
		t.Fatalf("default reviewed plan timeout = %s", got)
	}
	useTestConfig(t)
	err := Save(Config{Version: 1, Web: WebConfig{ApprovalTimeoutSeconds: -1}})
	if err == nil || !strings.Contains(err.Error(), "approval_timeout_seconds") {
		t.Fatalf("expected approval timeout validation error, got %v", err)
	}
}

func TestRejectsInvalidDefaultAccountID(t *testing.T) {
	useTestConfig(t)
	err := Save(Config{
		Version: 1,
		Repositories: []Repository{{
			Name:             "infra",
			Path:             "/work/infra",
			DefaultAccountID: "1234",
		}},
	})
	if err == nil {
		t.Fatal("expected invalid default account ID validation error")
	}
}

func TestRepoTargetGroupRoundTrips(t *testing.T) {
	useTestConfig(t)
	want := Config{
		Version: 1,
		Repositories: []Repository{{
			Name: "infra",
			Path: "/work/infra",
			Targets: []RepoTarget{
				{Name: "dev", Directory: "environments/dev", AWSProfile: "company-dev", Group: "nonprod"},
				{Name: "prod", Directory: "environments/prod", AWSProfile: "company-prod", Group: "  prod  "},
				{Name: "sandbox", Directory: "environments/sandbox", AWSProfile: "company-sandbox"},
			},
		}},
	}
	if err := Save(want); err != nil {
		t.Fatal(err)
	}
	got, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	targets := got.Repositories[0].Targets
	if targets[0].Group != "nonprod" {
		t.Fatalf("target[0].Group = %q, want %q", targets[0].Group, "nonprod")
	}
	// Validate trims whitespace from Group.
	if targets[1].Group != "prod" {
		t.Fatalf("target[1].Group = %q, want %q (trimmed)", targets[1].Group, "prod")
	}
	// Target with no group should have empty string (field is omitempty, not required).
	if targets[2].Group != "" {
		t.Fatalf("target[2].Group = %q, want empty", targets[2].Group)
	}
}

func TestRejectsDuplicateTargetNames(t *testing.T) {
	useTestConfig(t)
	err := Save(Config{
		Version: 1,
		Repositories: []Repository{{
			Name: "infra",
			Path: "/work/infra",
			Targets: []RepoTarget{
				{Name: "dev", Directory: "a/dev", AWSProfile: "a"},
				{Name: "dev", Directory: "b/dev", AWSProfile: "b"},
			},
		}},
	})
	if err == nil {
		t.Fatal("expected duplicate target validation error")
	}
}

func TestRawConfigPreservesSourceAndRejectsStaleRevision(t *testing.T) {
	path := useTestConfig(t)
	if err := os.WriteFile(path, []byte("# managed locally\nversion: 1\nrepositories: []\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, content, revision, err := ReadRaw()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(content, "# managed locally") {
		t.Fatalf("comment was not read: %q", content)
	}

	updated := "# keep this comment\nversion: 1\nrepositories: []"
	nextRevision, err := WriteRaw(updated, revision)
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != updated+"\n" {
		t.Fatalf("raw config was reformatted: %q", data)
	}
	if nextRevision == revision {
		t.Fatal("revision did not change")
	}
	if _, err := WriteRaw(updated, revision); !errors.Is(err, ErrRevisionConflict) {
		t.Fatalf("stale save error = %v, want revision conflict", err)
	}
}

func TestFormatRawPreservesCommentsAndUsesTwoSpaceIndent(t *testing.T) {
	formatted, err := FormatRaw("# repository config\nversion: 1\nrepositories:\n    - name: infra\n      path: /work/infra\n")
	if err != nil {
		t.Fatal(err)
	}
	want := "# repository config\nversion: 1\nrepositories:\n  - name: infra\n    path: /work/infra\n"
	if formatted != want {
		t.Fatalf("FormatRaw() = %q, want %q", formatted, want)
	}
}

func TestFormatRawRejectsInvalidYAML(t *testing.T) {
	if _, err := FormatRaw("version: ["); err == nil {
		t.Fatal("expected invalid YAML error")
	}
}

func TestRawConfigRejectsUnknownCredentialFields(t *testing.T) {
	useTestConfig(t)
	_, _, revision, err := ReadRaw()
	if err != nil {
		t.Fatal(err)
	}
	content := `version: 1
repositories:
  - name: infra
    path: /work/infra
    credential_material: should-not-be-stored
`
	if _, err := WriteRaw(content, revision); err == nil || !strings.Contains(err.Error(), "field credential_material not found") {
		t.Fatalf("error = %v, want unknown field rejection", err)
	}
}

func TestLegacyMigration(t *testing.T) {
	path := useTestConfig(t)
	dir := filepath.Dir(path)
	if err := os.WriteFile(filepath.Join(dir, "envs"), []byte("dev=company-dev\nprod=company-prod\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "repos"), []byte("infra=/work/infra\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(dir, "repo-configs"), 0o700); err != nil {
		t.Fatal(err)
	}
	legacy := `{"targets":[{"dir":"stacks/dev","name":"dev","profile":"","group":"nonprod"},{"dir":"stacks/prod","name":"prod","profile":"company-prod","group":"prod"}],"groups":[{"name":"prod","disabled":true}]}`
	if err := os.WriteFile(filepath.Join(dir, "repo-configs", "infra.json"), []byte(legacy), 0o600); err != nil {
		t.Fatal(err)
	}

	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	targets := cfg.Repositories[0].Targets
	if targets[0].AWSProfile != "company-dev" {
		t.Fatalf("migrated profile = %q", targets[0].AWSProfile)
	}
	if !targets[1].Disabled {
		t.Fatal("target in disabled legacy group should be disabled")
	}
	backups, err := filepath.Glob(filepath.Join(dir, "legacy-backup-*"))
	if err != nil || len(backups) != 1 {
		t.Fatalf("legacy backup not created: %v %v", backups, err)
	}
}
