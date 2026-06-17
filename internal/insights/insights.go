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
	TokensIn    int       `json:"tokensIn,omitempty"`
	TokensOut   int       `json:"tokensOut,omitempty"`
}

// EffectivePrompt returns customPrompt when non-empty, else the built-in
// promptInstructions. This allows config.yaml to override the advisory format.
func EffectivePrompt(customPrompt string) string {
	if strings.TrimSpace(customPrompt) != "" {
		return customPrompt
	}
	return promptInstructions
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
// runFailed must be true when the run ended in a failed/partial status — it
// bypasses the no-changes short-circuit so errors are still analyzed.
// customPrompt overrides the built-in prompt instructions when non-empty.
func Generate(ctx context.Context, runID, model, customPrompt string, doc graph.Document, targets []TargetSummary, runFailed bool) (Insight, error) {
	ins := Insight{RunID: runID, Model: model, GeneratedAt: time.Now().UTC()}

	if !runFailed && !hasChanges(doc) {
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

	hotTargets := make(map[string]bool)
	for _, t := range targets {
		if t.Add > 0 || t.Change > 0 || t.Destroy > 0 {
			hotTargets[t.Target] = true
		}
	}
	prompt, err := buildPrompt(EffectivePrompt(customPrompt), doc.Focused(hotTargets), targets)
	if err != nil {
		return Insight{}, err
	}

	cmd := exec.CommandContext(ctx, claudePath, "-p", "-", "--model", model, "--output-format", "json")
	cmd.Stdin = strings.NewReader(prompt)
	var stderr strings.Builder
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		return Insight{}, fmt.Errorf("claude invocation failed: %w\nstderr: %s", err, stderr.String())
	}

	var claudeResp struct {
		Result string `json:"result"`
		Usage  struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
	}
	if jsonErr := json.Unmarshal(out, &claudeResp); jsonErr != nil {
		// Fallback: treat raw output as plain text (graceful degradation).
		ins.Text = strings.TrimSpace(string(out))
	} else {
		ins.Text = strings.TrimSpace(claudeResp.Result)
		ins.TokensIn = claudeResp.Usage.InputTokens
		ins.TokensOut = claudeResp.Usage.OutputTokens
	}
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

1. **Risk Assessment** — Start with exactly one of these prefixes on its own line:
   RISK: LOW, RISK: MEDIUM, or RISK: HIGH — then one or two sentences on
   whether this looks safe to apply. Call out any destroys, replacements, or
   errors immediately. Factor in the environment tier of the affected targets
   when assigning risk: prod targets are highest risk regardless of change
   count; qa/loadtest are medium baseline; dev is lowest baseline. Escalate
   the risk level when destroys, replacements, or errors are present in any
   tier. This section is grounded fact.
2. **Impacted Resources by Group** — a table with columns: Group | Target |
   Resource Address | Type | Action | Changed Attributes. List every resource
   node that has a non-none action, grouped by their "group" label. Use the
   node label as the Type (e.g. aws_msk_cluster), the node address as the
   Resource Address, the action (create/update/delete/replace), and the changed
   attribute paths from the changes array. If a hot target has destroy counts
   from the summary but no resource-level nodes in the graph, add a row with
   Resource Address = "*(N resources — addresses not in graph)", Action =
   delete, and note the count. If there are no changes at all, write a single
   row: "No resource-level changes detected."
3. **Blast radius** — what changes, what gets replaced/destroyed, and which
   resources depend (transitively, via the edges) on the changed ones. Be
   specific about addresses.
4. **Customer-facing impact** — INFER from resource types (load balancers, CDNs,
   API gateways, DNS, public databases, etc.) which changes may affect
   customer-facing services. You MUST clearly label this section as an inference,
   not fact — tf9 has no authoritative customer-facing signal. Start with the
   line "Heuristic (inferred, not authoritative):" then list each impact as a
   bullet point. If nothing is customer-facing, write a single bullet: "No
   customer-facing resources identified."

Be terse and skimmable. Do not invent attribute values; you weren't given any.

Here is the data as JSON:
`

func buildPrompt(instructions string, doc graph.Document, targets []TargetSummary) (string, error) {
	payload := struct {
		Graph   graph.Document  `json:"graph"`
		Targets []TargetSummary `json:"targets"`
	}{Graph: doc, Targets: targets}
	data, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	return instructions + string(data), nil
}
