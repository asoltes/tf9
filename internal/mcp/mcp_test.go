package mcp

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sort"
	"testing"

	"github.com/andres/tf9/internal/config"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestRegisteredToolNamesByLevel(t *testing.T) {
	readonlyTools := []string{
		"tf9_analyze_run", "tf9_get_cost_report", "tf9_get_plan_graph", "tf9_get_run",
		"tf9_get_run_output", "tf9_list_repos", "tf9_list_runs", "tf9_list_targets",
	}
	cases := map[string][]string{
		config.MCPAccessReadonly:     readonlyTools,
		config.MCPAccessPlan:         append(append([]string{}, readonlyTools...), "tf9_run_plan"),
		config.MCPAccessUnrestricted: append(append([]string{}, readonlyTools...), "tf9_run_apply", "tf9_run_destroy", "tf9_run_plan"),
	}
	for level, want := range cases {
		got := RegisteredToolNames(level)
		sort.Strings(got)
		sort.Strings(want)
		if len(got) != len(want) {
			t.Fatalf("level %q: got %v, want %v", level, got, want)
		}
		for i := range want {
			if got[i] != want[i] {
				t.Fatalf("level %q: got %v, want %v", level, got, want)
			}
		}
	}
}

// connectInMemory wires an in-memory client session to a server so we can list
// tools through the real SDK.
func connectInMemory(t *testing.T, level string, c *Client) *mcp.ClientSession {
	t.Helper()
	ctx := context.Background()
	srv := NewServer(level, c)
	st, ct := mcp.NewInMemoryTransports()
	if _, err := srv.Connect(ctx, st, nil); err != nil {
		t.Fatalf("server connect: %v", err)
	}
	cli := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "1"}, nil)
	cs, err := cli.Connect(ctx, ct, nil)
	if err != nil {
		t.Fatalf("client connect: %v", err)
	}
	t.Cleanup(func() { cs.Close() })
	return cs
}

func TestReadonlyHidesRunTools(t *testing.T) {
	cs := connectInMemory(t, config.MCPAccessReadonly, NewClient("http://127.0.0.1:0"))
	for tl, err := range cs.Tools(context.Background(), nil) {
		if err != nil {
			t.Fatal(err)
		}
		if tl.Name == "tf9_run_plan" || tl.Name == "tf9_run_apply" || tl.Name == "tf9_run_destroy" {
			t.Fatalf("readonly level must not expose %q", tl.Name)
		}
	}
}

func TestApplyForcesHumanGateAndNonprod(t *testing.T) {
	var got runRequest
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/runs" || r.Method != http.MethodPost {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &got)
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"run-0007"}`))
	}))
	defer ts.Close()

	cs := connectInMemory(t, config.MCPAccessUnrestricted, NewClient(ts.URL))
	res, err := cs.CallTool(context.Background(), &mcp.CallToolParams{
		Name:      "tf9_run_apply",
		Arguments: map[string]any{"repo": "infra", "envFilter": "dev"},
	})
	if err != nil {
		t.Fatalf("call tool: %v", err)
	}
	if res.IsError {
		t.Fatalf("tool returned error: %+v", res.Content)
	}
	if got.Command != "apply" {
		t.Errorf("command = %q, want apply", got.Command)
	}
	if got.AutoApprove {
		t.Error("apply must never set autoApprove (human gate)")
	}
	if !got.NonprodOnly {
		t.Error("apply must force nonprodOnly to refuse prod* targets")
	}
	if got.Repo != "infra" || got.EnvFilter != "dev" {
		t.Errorf("repo/envFilter not forwarded: %+v", got)
	}
}

func TestGetRunAddsClickableLinks(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"id":"run-0042","status":"success","reportPath":"/home/u/.config/tf9/reports/tf9-plan-20260617-003523.html"}`))
	}))
	defer ts.Close()

	cs := connectInMemory(t, config.MCPAccessReadonly, NewClient(ts.URL))
	res, err := cs.CallTool(context.Background(), &mcp.CallToolParams{
		Name:      "tf9_get_run",
		Arguments: map[string]any{"runId": "run-0042"},
	})
	if err != nil {
		t.Fatalf("call tool: %v", err)
	}
	var out map[string]any
	if err := json.Unmarshal([]byte(res.Content[0].(*mcp.TextContent).Text), &out); err != nil {
		t.Fatalf("parse result: %v", err)
	}
	wantReport := ts.URL + "/#report/tf9-plan-20260617-003523.html"
	if out["reportUrl"] != wantReport {
		t.Errorf("reportUrl = %v, want %v", out["reportUrl"], wantReport)
	}
	if out["runHistoryUrl"] != ts.URL+"/#runs" {
		t.Errorf("runHistoryUrl = %v, want %v/#runs", out["runHistoryUrl"], ts.URL)
	}
}

func TestAnalyzeRunPostsToInsightsEndpoint(t *testing.T) {
	var gotPath, gotMethod, gotRefresh string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotMethod = r.Method
		gotRefresh = r.URL.Query().Get("refresh")
		_, _ = w.Write([]byte(`{"runId":"run-0009","text":"advisory","noChanges":false}`))
	}))
	defer ts.Close()

	cs := connectInMemory(t, config.MCPAccessReadonly, NewClient(ts.URL))
	res, err := cs.CallTool(context.Background(), &mcp.CallToolParams{
		Name:      "tf9_analyze_run",
		Arguments: map[string]any{"runId": "run-0009", "refresh": true},
	})
	if err != nil {
		t.Fatalf("call tool: %v", err)
	}
	if res.IsError {
		t.Fatalf("tool error: %+v", res.Content)
	}
	if gotMethod != http.MethodPost {
		t.Errorf("method = %s, want POST", gotMethod)
	}
	if gotPath != "/api/runs/run-0009/insights" {
		t.Errorf("path = %s", gotPath)
	}
	if gotRefresh != "true" {
		t.Errorf("refresh query = %q, want true", gotRefresh)
	}
}

func TestServeNotRunning(t *testing.T) {
	// Point at a closed port; the client should surface serve_not_running.
	cs := connectInMemory(t, config.MCPAccessReadonly, NewClient("http://127.0.0.1:1"))
	res, err := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: "tf9_list_repos"})
	if err != nil {
		t.Fatalf("call tool: %v", err)
	}
	if !res.IsError {
		t.Fatal("expected an error result when serve is unreachable")
	}
}
