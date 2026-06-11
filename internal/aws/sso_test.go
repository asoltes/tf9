package aws

import (
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
