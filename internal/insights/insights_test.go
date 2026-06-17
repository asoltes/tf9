package insights

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/andres/tf9/internal/config"
	"github.com/andres/tf9/internal/graph"
)

func TestBuildPromptOmitsRawResult(t *testing.T) {
	doc := graph.Document{
		RunID: "run-1",
		Nodes: []graph.Node{{
			ID:     "target:dev:aws_vpc.main",
			Label:  "aws_vpc.main",
			Action: graph.ActionCreate,
			Group:  "frontend",
			Target: "dev",
			Result: "cidr_block = \"10.0.0.0/16\"  # SECRET VALUE MUST NOT LEAK",
			Changes: []graph.ChangeDetail{
				{Path: "cidr_block", Kind: "added", Replacement: true},
			},
		}},
		Edges: []graph.Edge{{ID: "e1", Source: "a", Target: "b", Kind: "dependency"}},
	}

	prompt, err := buildPrompt(promptInstructions, doc.Sanitized(), []TargetSummary{{Target: "dev", Group: "frontend", Add: 1}})
	if err != nil {
		t.Fatalf("buildPrompt: %v", err)
	}
	if strings.Contains(prompt, "SECRET VALUE") || strings.Contains(prompt, "10.0.0.0/16") {
		t.Fatal("prompt leaked raw Node.Result values")
	}
	// Structural data must survive.
	for _, want := range []string{"aws_vpc.main", "cidr_block", "replacement", "dependency", "frontend"} {
		if !strings.Contains(prompt, want) {
			t.Errorf("prompt missing structural field %q", want)
		}
	}
}

func TestSanitizedKeepsStructureDropsResult(t *testing.T) {
	doc := graph.Document{Nodes: []graph.Node{{ID: "n1", Action: graph.ActionUpdate, Result: "x = 1"}}}
	s := doc.Sanitized()
	if s.Nodes[0].Result != "" {
		t.Error("Result not stripped")
	}
	if s.Nodes[0].Action != graph.ActionUpdate {
		t.Error("Action not preserved")
	}
	if doc.Nodes[0].Result == "" {
		t.Error("Sanitized mutated the original document")
	}
}

func TestNoChangesShortCircuitsWithoutClaude(t *testing.T) {
	// Isolate the cache dir to a temp config location.
	config.SetPath(t.TempDir() + "/config.yaml")
	// Force claude to be unavailable; the short-circuit must not need it.
	t.Setenv("TF9_CLAUDE_PATH", "/nonexistent/claude-binary")

	doc := graph.Document{Nodes: []graph.Node{{ID: "n1", Action: graph.ActionNone}}}
	ins, err := Generate(context.Background(), "run-x", "sonnet", "", doc, nil, false)
	if err != nil {
		t.Fatalf("expected no error on no-changes, got %v", err)
	}
	if !ins.NoChanges {
		t.Error("expected NoChanges=true")
	}
	// And it should be cached + loadable.
	loaded, ok := Load("run-x")
	if !ok || !loaded.NoChanges {
		t.Errorf("no-changes insight not cached: ok=%v %+v", ok, loaded)
	}
}

func TestGenerateRequiresClaudeWhenChanges(t *testing.T) {
	config.SetPath(t.TempDir() + "/config.yaml")
	// Make claude unresolvable deterministically: empty override + empty PATH,
	// so Generate must error out before any exec (no real claude call).
	t.Setenv("TF9_CLAUDE_PATH", "")
	t.Setenv("PATH", "")

	doc := graph.Document{Nodes: []graph.Node{{ID: "n1", Action: graph.ActionCreate}}}
	_, err := Generate(context.Background(), "run-y", "sonnet", "", doc, nil, false)
	if _, ok := err.(ErrClaudeUnavailable); !ok {
		t.Fatalf("expected ErrClaudeUnavailable, got %v", err)
	}
}

func TestInsightRoundTripsJSON(t *testing.T) {
	in := Insight{RunID: "r", Model: "sonnet", Text: "hi", NoChanges: false}
	b, _ := json.Marshal(in)
	var out Insight
	if err := json.Unmarshal(b, &out); err != nil || out.RunID != "r" {
		t.Fatalf("round-trip failed: %v %+v", err, out)
	}
}
