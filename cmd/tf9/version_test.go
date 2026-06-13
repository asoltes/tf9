package main

import (
	"bytes"
	"strings"
	"testing"
)

func TestVersionCommand(t *testing.T) {
	oldVersion, oldCommit, oldBuildDate := version, commit, buildDate
	version, commit, buildDate = "v1.2.3", "abc123", "2026-06-13T10:00:00Z"
	t.Cleanup(func() {
		version, commit, buildDate = oldVersion, oldCommit, oldBuildDate
	})

	var out bytes.Buffer
	cmd := newVersionCmd()
	cmd.SetOut(&out)
	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if got := out.String(); !strings.Contains(got, "tf9 v1.2.3 (commit abc123, built 2026-06-13T10:00:00Z)") {
		t.Fatalf("version output = %q", got)
	}
}
