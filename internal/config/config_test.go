package config

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func useTestConfig(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.yaml")
	SetPath(path)
	t.Cleanup(func() { SetPath("") })
	return path
}

func TestSaveAndLoad(t *testing.T) {
	path := useTestConfig(t)
	want := Config{
		Version: 1,
		Repositories: []Repository{{
			Name: "infra",
			Path: "/work/infra",
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
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("config mode = %o, want 600", info.Mode().Perm())
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
