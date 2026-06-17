// Package insights generates on-demand, AI-authored advisories for a tf9 run:
// technical blast radius, impacted service groups, and a best-effort
// customer-facing read. It shells out to the `claude` CLI one-shot (no tools,
// no streaming) over the SANITIZED run graph only — never raw terraform values.
// Results are cached per run so the UI, CLI, and MCP all read one artifact.
package insights

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/andres/tf9/internal/config"
	"github.com/andres/tf9/internal/graph"
)

// Insight is the cached advisory for a single run.
type Insight struct {
	RunID       string    `json:"runId"`
	Model       string    `json:"model"`
	GeneratedAt time.Time `json:"generatedAt"`
	Text        string    `json:"text"`
	NoChanges   bool      `json:"noChanges"`
}

// TargetSummary is the per-target change tally fed to the model (value-free).
type TargetSummary struct {
	Target    string `json:"target"`
	Group     string `json:"group,omitempty"`
	Add       int    `json:"add"`
	Change    int    `json:"change"`
	Destroy   int    `json:"destroy"`
	NoChanges bool   `json:"noChanges"`
}

// Path returns the cache location, alongside the run's graph.json.
func Path(runID string) string {
	return filepath.Join(config.SavedPlanDir(), runID, "insight.json")
}

// Load reads a cached insight, reporting whether one exists.
func Load(runID string) (Insight, bool) {
	data, err := os.ReadFile(Path(runID))
	if err != nil {
		return Insight{}, false
	}
	var ins Insight
	if err := json.Unmarshal(data, &ins); err != nil {
		return Insight{}, false
	}
	return ins, true
}

// ErrClaudeUnavailable is returned when the `claude` CLI cannot be resolved.
type ErrClaudeUnavailable struct{}

func (ErrClaudeUnavailable) Error() string {
	return "claude_unavailable: the claude CLI is not installed or not on PATH"
}

// resolveClaude mirrors workspace_chat.go: TF9_CLAUDE_PATH wins, else PATH lookup.
func resolveClaude() string {
	if p := os.Getenv("TF9_CLAUDE_PATH"); p != "" {
		return p
	}
	p, _ := exec.LookPath("claude")
	return p
}

// Generate builds an insight from the sanitized graph and per-target summary,
// shelling to `claude` unless there are no changes, then caches and returns it.
func Generate(ctx context.Context, runID, model string, doc graph.Document, targets []TargetSummary) (Insight, error) {
	ins := Insight{RunID: runID, Model: model, GeneratedAt: time.Now().UTC()}

	if !hasChanges(doc) {
		ins.NoChanges = true
		ins.Text = "No changes — nothing to analyze. Terraform reported no differences for this run."
		if err := save(runID, ins); err != nil {
			return ins, err
		}
		return ins, nil
	}

	claudePath := resolveClaude()
	if claudePath == "" {
		return Insight{}, ErrClaudeUnavailable{}
	}

	prompt, err := buildPrompt(doc.Sanitized(), targets)
	if err != nil {
		return Insight{}, err
	}

	cmd := exec.CommandContext(ctx, claudePath, "-p", prompt, "--model", model)
	out, err := cmd.Output()
	if err != nil {
		return Insight{}, fmt.Errorf("claude invocation failed: %w", err)
	}
	ins.Text = strings.TrimSpace(string(out))
	if ins.Text == "" {
		return Insight{}, fmt.Errorf("claude returned empty output")
	}
	if err := save(runID, ins); err != nil {
		return ins, err
	}
	return ins, nil
}

func hasChanges(doc graph.Document) bool {
	for _, n := range doc.Nodes {
		if n.Action != graph.ActionNone {
			return true
		}
	}
	return false
}

// save writes the insight atomically (temp + rename), like graph.SaveTarget.
func save(runID string, ins Insight) error {
	path := Path(runID)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create insight dir: %w", err)
	}
	data, err := json.MarshalIndent(ins, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return fmt.Errorf("write insight: %w", err)
	}
	return os.Rename(tmp, path)
}

const promptInstructions = `You are a Terraform change advisor for the tf9 tool. You are given a SANITIZED
change graph (no attribute values — only resource addresses, actions, changed
attribute paths with sensitive/computed/replacement flags, dependency edges) and
a per-target change summary. Produce a concise markdown advisory with these
sections:

1. **Blast radius** — what changes, what gets replaced/destroyed, and which
   resources depend (transitively, via the edges) on the changed ones. This is
   grounded fact from the graph; be specific about addresses.
2. **Impacted service groups** — group the changes by their "group" label.
3. **Customer-facing impact** — INFER from resource types (load balancers, CDNs,
   API gateways, DNS, public databases, etc.) which changes may affect
   customer-facing services. You MUST clearly label this section as an inference,
   not fact — tf9 has no authoritative customer-facing signal. Prefix it with
   "Heuristic (inferred, not authoritative):".

Be terse and skimmable. Do not invent attribute values; you weren't given any.

Here is the data as JSON:
`

func buildPrompt(doc graph.Document, targets []TargetSummary) (string, error) {
	payload := struct {
		Graph   graph.Document  `json:"graph"`
		Targets []TargetSummary `json:"targets"`
	}{Graph: doc, Targets: targets}
	data, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	return promptInstructions + string(data), nil
}
