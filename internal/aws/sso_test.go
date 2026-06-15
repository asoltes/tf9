package aws

import (
	"slices"
	"testing"
)

func TestParseIdentity(t *testing.T) {
	raw := []byte(`{"Account":"123456789012","Arn":"arn:aws:iam::123456789012:user/dev","UserId":"AIDAEXAMPLE"}`)
	id, err := parseIdentity(raw)
	if err != nil {
		t.Fatalf("parseIdentity error: %v", err)
	}
	if id.Account != "123456789012" {
		t.Errorf("Account = %q, want 123456789012", id.Account)
	}
	if id.Arn != "arn:aws:iam::123456789012:user/dev" {
		t.Errorf("Arn = %q", id.Arn)
	}
	if id.UserID != "AIDAEXAMPLE" {
		t.Errorf("UserID = %q, want AIDAEXAMPLE", id.UserID)
	}
}

func TestParseIdentityInvalidJSON(t *testing.T) {
	_, err := parseIdentity([]byte(`not json`))
	if err == nil {
		t.Fatal("expected error for invalid JSON, got nil")
	}
}

func TestProfileEnvStripsInheritedCredentials(t *testing.T) {
	base := []string{
		"PATH=/usr/bin",
		"AWS_ACCESS_KEY_ID=AKIASTALE",
		"AWS_SECRET_ACCESS_KEY=stalesecret",
		"AWS_SESSION_TOKEN=staletoken",
		"AWS_SECURITY_TOKEN=staletoken2",
		"AWS_PROFILE=stale-profile",
		"AWS_DEFAULT_PROFILE=stale-default",
		"AWS_REGION=us-east-1",
		"AWS_DEFAULT_REGION=us-east-1",
	}

	got := ProfileEnv(base, "prod-foo", "eu-west-2")

	// PATH must survive untouched.
	if !slices.Contains(got, "PATH=/usr/bin") {
		t.Errorf("PATH was dropped: %v", got)
	}
	// The resolved profile must be the only AWS_PROFILE value.
	if !slices.Contains(got, "AWS_PROFILE=prod-foo") {
		t.Errorf("AWS_PROFILE=prod-foo missing: %v", got)
	}
	// Region must be pinned to the override.
	if !slices.Contains(got, "AWS_REGION=eu-west-2") || !slices.Contains(got, "AWS_DEFAULT_REGION=eu-west-2") {
		t.Errorf("region not pinned to eu-west-2: %v", got)
	}
	// No stale credential or stale profile/region value may survive.
	forbidden := []string{
		"AWS_ACCESS_KEY_ID=AKIASTALE",
		"AWS_SECRET_ACCESS_KEY=stalesecret",
		"AWS_SESSION_TOKEN=staletoken",
		"AWS_SECURITY_TOKEN=staletoken2",
		"AWS_PROFILE=stale-profile",
		"AWS_DEFAULT_PROFILE=stale-default",
		"AWS_REGION=us-east-1",
		"AWS_DEFAULT_REGION=us-east-1",
	}
	for _, f := range forbidden {
		if slices.Contains(got, f) {
			t.Errorf("stale var survived: %q in %v", f, got)
		}
	}
}

func TestProfileEnvBlankProfilePreservesAmbient(t *testing.T) {
	// A blank profile (and blank region) means "use the ambient default
	// credential chain" — e.g. the STS identity badge with no profile
	// configured. The environment must be returned untouched; stripping the
	// inherited credentials would make a valid default session look expired.
	base := []string{
		"AWS_PROFILE=ambient",
		"AWS_ACCESS_KEY_ID=AKIAAMBIENT",
		"AWS_SESSION_TOKEN=ambienttoken",
		"AWS_REGION=us-east-1",
		"HOME=/home/x",
	}
	got := ProfileEnv(base, "", "")

	if !slices.Equal(got, base) {
		t.Errorf("blank profile must preserve ambient env untouched:\n got %v\nwant %v", got, base)
	}
}

func TestProfileEnvBlankProfileWithRegion(t *testing.T) {
	// Blank profile but explicit region: do not touch credentials, but pin the
	// region.
	base := []string{"AWS_ACCESS_KEY_ID=AKIAAMBIENT", "AWS_REGION=us-east-1", "HOME=/home/x"}
	got := ProfileEnv(base, "", "eu-west-2")

	if slices.Contains(got, "AWS_REGION=us-east-1") {
		t.Errorf("stale region survived: %v", got)
	}
	if !slices.Contains(got, "AWS_REGION=eu-west-2") || !slices.Contains(got, "AWS_DEFAULT_REGION=eu-west-2") {
		t.Errorf("region not pinned to eu-west-2: %v", got)
	}
	// Ambient credentials must be preserved when profile is blank.
	if !slices.Contains(got, "AWS_ACCESS_KEY_ID=AKIAAMBIENT") {
		t.Errorf("ambient credentials dropped for blank profile: %v", got)
	}
}
