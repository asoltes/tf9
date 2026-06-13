package api

import (
	"slices"
	"testing"
)

// The drift-reconcile feature relies on the AI being able to run git reconcile
// commands but never push or apply. Lock those invariants in place.
func TestWorkspaceChatToolPolicy(t *testing.T) {
	if !slices.Contains(workspaceChatAllowedTools, "Bash(git *)") {
		t.Fatal("git must be allowed so the AI can reconcile drift")
	}
	for _, denied := range []string{
		"Bash(git push *)", "Bash(terraform apply *)", "Bash(terraform destroy *)",
	} {
		if !slices.Contains(workspaceChatDeniedTools, denied) {
			t.Fatalf("%q must be denied — the AI must never push or apply", denied)
		}
	}
}
