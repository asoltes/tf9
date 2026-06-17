package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/andres/tf9/internal/config"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// tool bundles a tool's name, minimum access level, and its registration
// closure (which captures the client and the typed handler).
type tool struct {
	name     string
	minLevel string
	register func(*mcp.Server)
}

// textResult wraps raw text/JSON as a successful tool result.
func textResult(text string) *mcp.CallToolResult {
	return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: text}}}
}

// tools returns every MCP tool definition. Registration is gated by minLevel in
// NewServer; this function lists all of them regardless of level.
func tools(c *Client) []tool {
	// Argument schemas. Read tools that take no input use an empty struct.
	type noArgs struct{}
	type repoArg struct {
		Repo string `json:"repo" jsonschema:"repository name as configured in tf9"`
	}
	type runIDArg struct {
		RunID string `json:"runId" jsonschema:"the run id, e.g. run-0001"`
	}
	type outputArg struct {
		RunID  string `json:"runId" jsonschema:"the run id, e.g. run-0001"`
		Offset int    `json:"offset,omitempty" jsonschema:"line offset to start from (0 for all)"`
	}
	type listRunsArg struct {
		Page    int    `json:"page,omitempty" jsonschema:"page number (1-based)"`
		Limit   int    `json:"limit,omitempty" jsonschema:"page size"`
		Command string `json:"command,omitempty" jsonschema:"filter by command, e.g. plan or apply"`
		Status  string `json:"status,omitempty" jsonschema:"filter by status, e.g. success or failed"`
		Ticket  string `json:"ticket,omitempty" jsonschema:"case-insensitive ticket substring filter"`
	}
	type runArg struct {
		Repo      string `json:"repo" jsonschema:"repository name as configured in tf9"`
		EnvFilter string `json:"envFilter,omitempty" jsonschema:"comma-separated target names to run; empty means all targets"`
	}
	type analyzeArg struct {
		RunID   string `json:"runId" jsonschema:"the run id to analyze, e.g. run-0001"`
		Refresh bool   `json:"refresh,omitempty" jsonschema:"regenerate the insight even if one is cached"`
	}

	def := func(name, minLevel, desc string, reg func(*mcp.Server)) tool {
		return tool{name: name, minLevel: minLevel, register: reg}
	}

	return []tool{
		def("tf9_list_repos", config.MCPAccessReadonly, "List configured tf9 repositories.",
			func(s *mcp.Server) {
				mcp.AddTool(s, &mcp.Tool{Name: "tf9_list_repos", Description: "List configured tf9 repositories."},
					func(ctx context.Context, _ *mcp.CallToolRequest, _ noArgs) (*mcp.CallToolResult, any, error) {
						raw, err := c.get(ctx, "/api/repos")
						if err != nil {
							return nil, nil, err
						}
						return textResult(string(raw)), nil, nil
					})
			}),

		def("tf9_list_targets", config.MCPAccessReadonly, "List the configured terraform targets for a repository.",
			func(s *mcp.Server) {
				mcp.AddTool(s, &mcp.Tool{Name: "tf9_list_targets", Description: "List the configured terraform targets for a repository."},
					func(ctx context.Context, _ *mcp.CallToolRequest, a repoArg) (*mcp.CallToolResult, any, error) {
						if strings.TrimSpace(a.Repo) == "" {
							return nil, nil, fmt.Errorf("repo is required")
						}
						raw, err := c.get(ctx, "/api/repos/"+url.PathEscape(a.Repo)+"/config")
						if err != nil {
							return nil, nil, err
						}
						return textResult(string(raw)), nil, nil
					})
			}),

		def("tf9_list_runs", config.MCPAccessReadonly, "List run history (optionally filtered/paginated).",
			func(s *mcp.Server) {
				mcp.AddTool(s, &mcp.Tool{Name: "tf9_list_runs", Description: "List run history (optionally filtered/paginated)."},
					func(ctx context.Context, _ *mcp.CallToolRequest, a listRunsArg) (*mcp.CallToolResult, any, error) {
						q := url.Values{}
						if a.Page > 0 {
							q.Set("page", strconv.Itoa(a.Page))
						}
						if a.Limit > 0 {
							q.Set("limit", strconv.Itoa(a.Limit))
						}
						if a.Command != "" {
							q.Set("command", a.Command)
						}
						if a.Status != "" {
							q.Set("status", a.Status)
						}
						if a.Ticket != "" {
							q.Set("ticket", a.Ticket)
						}
						path := "/api/runs"
						if len(q) > 0 {
							path += "?" + q.Encode()
						}
						raw, err := c.get(ctx, path)
						if err != nil {
							return nil, nil, err
						}
						return textResult(addField(raw, "runHistoryUrl", c.webURL("#runs"))), nil, nil
					})
			}),

		def("tf9_get_run", config.MCPAccessReadonly, "Get a single run's status and summary.",
			func(s *mcp.Server) {
				mcp.AddTool(s, &mcp.Tool{Name: "tf9_get_run", Description: "Get a single run's status and summary, including clickable web-UI links. When status is awaitingInput, a human must approve in the tf9 web UI."},
					func(ctx context.Context, _ *mcp.CallToolRequest, a runIDArg) (*mcp.CallToolResult, any, error) {
						raw, err := c.getRun(ctx, a.RunID)
						if err != nil {
							return nil, nil, err
						}
						return textResult(c.enrichRunLinks(raw)), nil, nil
					})
			}),

		def("tf9_get_run_output", config.MCPAccessReadonly, "Get a run's terminal output lines.",
			func(s *mcp.Server) {
				mcp.AddTool(s, &mcp.Tool{Name: "tf9_get_run_output", Description: "Get a run's terminal output lines (optionally from a line offset)."},
					func(ctx context.Context, _ *mcp.CallToolRequest, a outputArg) (*mcp.CallToolResult, any, error) {
						raw, err := c.getRun(ctx, a.RunID)
						if err != nil {
							return nil, nil, err
						}
						var run struct {
							Lines []string `json:"lines"`
						}
						if err := json.Unmarshal(raw, &run); err != nil {
							return nil, nil, fmt.Errorf("could not parse run output: %w", err)
						}
						lines := run.Lines
						if a.Offset > 0 && a.Offset < len(lines) {
							lines = lines[a.Offset:]
						} else if a.Offset >= len(lines) {
							lines = nil
						}
						return textResult(strings.Join(lines, "\n")), nil, nil
					})
			}),

		def("tf9_get_plan_graph", config.MCPAccessReadonly, "Get the sanitized resource/dependency graph for a run.",
			func(s *mcp.Server) {
				mcp.AddTool(s, &mcp.Tool{Name: "tf9_get_plan_graph", Description: "Get the sanitized resource/dependency graph for a supported run."},
					func(ctx context.Context, _ *mcp.CallToolRequest, a runIDArg) (*mcp.CallToolResult, any, error) {
						if strings.TrimSpace(a.RunID) == "" {
							return nil, nil, fmt.Errorf("runId is required")
						}
						raw, err := c.get(ctx, "/api/runs/"+url.PathEscape(a.RunID)+"/graph")
						if err != nil {
							return nil, nil, err
						}
						return textResult(string(raw)), nil, nil
					})
			}),

		def("tf9_analyze_run", config.MCPAccessReadonly, "Generate or fetch an AI advisory for a run (blast radius, impacted service groups, heuristic customer-facing impact).",
			func(s *mcp.Server) {
				mcp.AddTool(s, &mcp.Tool{Name: "tf9_analyze_run", Description: "Generate or fetch an AI advisory for a run: technical blast radius (grounded), impacted service groups (by label), and a heuristic, explicitly-labeled customer-facing read. Needs a run with a plan/apply graph."},
					func(ctx context.Context, _ *mcp.CallToolRequest, a analyzeArg) (*mcp.CallToolResult, any, error) {
						if strings.TrimSpace(a.RunID) == "" {
							return nil, nil, fmt.Errorf("runId is required")
						}
						raw, err := c.analyzeRun(ctx, a.RunID, a.Refresh)
						if err != nil {
							return nil, nil, err
						}
						return textResult(c.enrichRunLinks(raw)), nil, nil
					})
			}),

		def("tf9_get_cost_report", config.MCPAccessReadonly, "Get the latest Infracost cost scan and diff.",
			func(s *mcp.Server) {
				mcp.AddTool(s, &mcp.Tool{Name: "tf9_get_cost_report", Description: "Get the latest Infracost cost scan and diff."},
					func(ctx context.Context, _ *mcp.CallToolRequest, _ noArgs) (*mcp.CallToolResult, any, error) {
						raw, err := c.get(ctx, "/api/cost/scan")
						if err != nil {
							return nil, nil, err
						}
						return textResult(string(raw)), nil, nil
					})
			}),

		def("tf9_run_plan", config.MCPAccessPlan, "Trigger a terraform plan run (non-mutating).",
			func(s *mcp.Server) {
				mcp.AddTool(s, &mcp.Tool{Name: "tf9_run_plan", Description: "Trigger a terraform plan run (non-mutating). Returns a runId; poll tf9_get_run / tf9_get_run_output for progress."},
					func(ctx context.Context, _ *mcp.CallToolRequest, a runArg) (*mcp.CallToolResult, any, error) {
						return startRunResult(ctx, c, "plan", a.Repo, a.EnvFilter)
					})
			}),

		def("tf9_run_apply", config.MCPAccessUnrestricted, "Trigger a terraform apply run (requires human approval).",
			func(s *mcp.Server) {
				mcp.AddTool(s, &mcp.Tool{Name: "tf9_run_apply", Description: "Trigger a terraform apply run. The run blocks on tf9's human approval gate (never auto-approved) and prod* targets are refused. Returns a runId; a human must approve in the tf9 web UI."},
					func(ctx context.Context, _ *mcp.CallToolRequest, a runArg) (*mcp.CallToolResult, any, error) {
						return startRunResult(ctx, c, "apply", a.Repo, a.EnvFilter)
					})
			}),

		def("tf9_run_destroy", config.MCPAccessUnrestricted, "Trigger a terraform destroy run (requires human approval).",
			func(s *mcp.Server) {
				mcp.AddTool(s, &mcp.Tool{Name: "tf9_run_destroy", Description: "Trigger a terraform destroy run. The run blocks on tf9's human approval gate (never auto-approved) and prod* targets are refused. Returns a runId; a human must approve in the tf9 web UI."},
					func(ctx context.Context, _ *mcp.CallToolRequest, a runArg) (*mcp.CallToolResult, any, error) {
						return startRunResult(ctx, c, "destroy", a.Repo, a.EnvFilter)
					})
			}),
	}
}

// getRun fetches a single run, validating the id first.
func (c *Client) getRun(ctx context.Context, id string) (json.RawMessage, error) {
	if strings.TrimSpace(id) == "" {
		return nil, fmt.Errorf("runId is required")
	}
	return c.get(ctx, "/api/runs/"+url.PathEscape(id))
}

// startRunResult triggers a run and returns its id as the tool result. apply and
// destroy always force autoApprove=false (human gate) and nonprodOnly=true
// (refuse prod* targets); plan needs neither.
func startRunResult(ctx context.Context, c *Client, command, repo, envFilter string) (*mcp.CallToolResult, any, error) {
	if strings.TrimSpace(repo) == "" {
		return nil, nil, fmt.Errorf("repo is required")
	}
	rr := runRequest{Repo: repo, Command: command, EnvFilter: envFilter}
	if command == "apply" || command == "destroy" {
		rr.AutoApprove = false
		rr.NonprodOnly = true
	}
	id, err := c.startRun(ctx, rr)
	if err != nil {
		return nil, nil, err
	}
	msg := fmt.Sprintf("Started %s run %s. Poll tf9_get_run / tf9_get_run_output for progress.", command, id)
	if command == "apply" || command == "destroy" {
		msg += " A human must approve it in the tf9 web UI before it proceeds."
	}
	out, _ := json.Marshal(map[string]string{
		"runId":         id,
		"message":       msg,
		"runHistoryUrl": c.webURL("#runs"),
	})
	return textResult(string(out)), nil, nil
}

// enrichRunLinks adds clickable web-UI links to a single run's JSON: a
// runHistoryUrl, and a reportUrl when the run has a saved HTML report.
func (c *Client) enrichRunLinks(raw json.RawMessage) string {
	var run map[string]any
	if err := json.Unmarshal(raw, &run); err != nil {
		return string(raw) // pass through on anything unexpected
	}
	run["runHistoryUrl"] = c.webURL("#runs")
	if rp, ok := run["reportPath"].(string); ok && rp != "" {
		run["reportUrl"] = c.webURL("#report/" + filepath.Base(rp))
	}
	out, err := json.Marshal(run)
	if err != nil {
		return string(raw)
	}
	return string(out)
}

// addField re-marshals a JSON object with one extra string field added.
func addField(raw json.RawMessage, key, value string) string {
	var obj map[string]any
	if err := json.Unmarshal(raw, &obj); err != nil {
		return string(raw)
	}
	obj[key] = value
	out, err := json.Marshal(obj)
	if err != nil {
		return string(raw)
	}
	return string(out)
}
