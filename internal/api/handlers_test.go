package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/andres/tf9/internal/config"
	graphdata "github.com/andres/tf9/internal/graph"
)

func testHandler(t *testing.T) http.Handler {
	t.Helper()
	config.SetPath(filepath.Join(t.TempDir(), "config.yaml"))
	t.Cleanup(func() { config.SetPath("") })
	return Handler(NewRunManager(), t.TempDir())
}

func TestConfigAPIReadsAndPreservesRawYAML(t *testing.T) {
	handler := testHandler(t)

	req := httptest.NewRequest(http.MethodGet, "/api/config", nil)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("GET /api/config status = %d body=%s", res.Code, res.Body.String())
	}
	var got struct {
		Path     string `json:"path"`
		Content  string `json:"content"`
		Revision string `json:"revision"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Path == "" || got.Revision == "" {
		t.Fatalf("missing path or revision: %#v", got)
	}

	body, _ := json.Marshal(map[string]string{
		"content":  "# local config\nversion: 1\nrepositories: []",
		"revision": got.Revision,
	})
	req = httptest.NewRequest(http.MethodPut, "/api/config", bytes.NewReader(body))
	res = httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("PUT /api/config status = %d body=%s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/config", nil)
	res = httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if err := json.Unmarshal(res.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Content != "# local config\nversion: 1\nrepositories: []\n" {
		t.Fatalf("content = %q", got.Content)
	}
}

func TestConfigAPIRejectsRevisionConflict(t *testing.T) {
	handler := testHandler(t)

	req := httptest.NewRequest(http.MethodGet, "/api/config", nil)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	var got struct {
		Revision string `json:"revision"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}

	body, _ := json.Marshal(map[string]string{"content": "# first save\nversion: 1\nrepositories: []\n", "revision": got.Revision})
	req = httptest.NewRequest(http.MethodPut, "/api/config", bytes.NewReader(body))
	res = httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("initial PUT status = %d body=%s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPut, "/api/config", bytes.NewReader(body))
	res = httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusConflict {
		t.Fatalf("stale PUT status = %d body=%s", res.Code, res.Body.String())
	}
}

func TestConfigAPIFormatsYAMLWithoutSaving(t *testing.T) {
	handler := testHandler(t)
	body, _ := json.Marshal(map[string]string{
		"content": "# config\nversion: 1\nrepositories:\n    - name: infra\n      path: /work/infra\n",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/config/format", bytes.NewReader(body))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("POST /api/config/format status = %d body=%s", res.Code, res.Body.String())
	}
	var got struct {
		Content string `json:"content"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	want := "# config\nversion: 1\nrepositories:\n  - name: infra\n    path: /work/infra\n"
	if got.Content != want {
		t.Fatalf("formatted content = %q, want %q", got.Content, want)
	}

	_, saved, _, err := config.ReadRaw()
	if err != nil {
		t.Fatal(err)
	}
	if saved == got.Content {
		t.Fatal("format endpoint unexpectedly persisted content")
	}
}

func TestConfigAPIRejectsInvalidYAMLFormat(t *testing.T) {
	handler := testHandler(t)
	body, _ := json.Marshal(map[string]string{"content": "version: ["})
	req := httptest.NewRequest(http.MethodPost, "/api/config/format", bytes.NewReader(body))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("POST invalid format status = %d body=%s", res.Code, res.Body.String())
	}
}

func TestRepoAPIWritesRepositoryAndTargetsToSharedConfig(t *testing.T) {
	handler := testHandler(t)

	body, _ := json.Marshal(map[string]string{"name": "infra", "path": "/work/infra"})
	req := httptest.NewRequest(http.MethodPost, "/api/repos", bytes.NewReader(body))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusCreated {
		t.Fatalf("POST /api/repos status = %d body=%s", res.Code, res.Body.String())
	}

	body, _ = json.Marshal(config.RepoConfig{
		DefaultAWSProfile: "company-dev",
		DefaultAccountID:  "123456789012",
		DefaultRegion:     "eu-west-2",
		Targets: []config.RepoTarget{{
			Name: "dev", Directory: "environments/dev", AWSProfile: "company-dev",
		}},
	})
	req = httptest.NewRequest(http.MethodPut, "/api/repos/infra/config", bytes.NewReader(body))
	res = httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("PUT /api/repos/infra/config status = %d body=%s", res.Code, res.Body.String())
	}

	cfg, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Repositories) != 1 || len(cfg.Repositories[0].Targets) != 1 {
		t.Fatalf("repository targets were not persisted: %#v", cfg)
	}
	if got := cfg.Repositories[0].Targets[0].AWSProfile; got != "company-dev" {
		t.Fatalf("aws_profile = %q, want company-dev", got)
	}
	repo := cfg.Repositories[0]
	if repo.DefaultAWSProfile != "company-dev" || repo.DefaultAccountID != "123456789012" || repo.DefaultRegion != "eu-west-2" {
		t.Fatalf("repository defaults were not persisted: %#v", repo)
	}
}

func TestRepoAPIRejectsTargetWithoutAWSProfile(t *testing.T) {
	handler := testHandler(t)
	if err := config.AddRepo("infra", "/work/infra"); err != nil {
		t.Fatal(err)
	}

	body, _ := json.Marshal(config.RepoConfig{Targets: []config.RepoTarget{{
		Name: "dev", Directory: "environments/dev",
	}}})
	req := httptest.NewRequest(http.MethodPut, "/api/repos/infra/config", bytes.NewReader(body))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("PUT invalid repo config status = %d body=%s", res.Code, res.Body.String())
	}
}

func TestRepoAPIRejectsInvalidDefaultAccountID(t *testing.T) {
	handler := testHandler(t)
	if err := config.AddRepo("infra", "/work/infra"); err != nil {
		t.Fatal(err)
	}

	body, _ := json.Marshal(config.RepoConfig{DefaultAccountID: "1234"})
	req := httptest.NewRequest(http.MethodPut, "/api/repos/infra/config", bytes.NewReader(body))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("PUT invalid default account ID status = %d body=%s", res.Code, res.Body.String())
	}
}

func TestRunRequestDecodesLockIDs(t *testing.T) {
	body := []byte(`{"command":"force-unlock","repo":"infra","lockIds":{"dev":"abc-123","staging":"def-456"}}`)
	var req RunRequest
	if err := json.Unmarshal(body, &req); err != nil {
		t.Fatal(err)
	}
	if req.Command != "force-unlock" {
		t.Fatalf("command = %q", req.Command)
	}
	if len(req.LockIDs) != 2 {
		t.Fatalf("lockIds = %#v", req.LockIDs)
	}
	if req.LockIDs["dev"] != "abc-123" || req.LockIDs["staging"] != "def-456" {
		t.Fatalf("lockIds = %#v", req.LockIDs)
	}
}

func TestValidateResourceAddresses(t *testing.T) {
	got, err := validateResourceAddresses("plan", []string{" module.network ", "", `aws_instance.web["blue"]`})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"module.network", `aws_instance.web["blue"]`}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("addresses = %#v, want %#v", got, want)
	}

	for _, command := range []string{"taint", "untaint"} {
		if _, err := validateResourceAddresses(command, nil); err == nil {
			t.Fatalf("%s without address should fail", command)
		}
		if _, err := validateResourceAddresses(command, []string{"one", "two"}); err == nil {
			t.Fatalf("%s with multiple addresses should fail", command)
		}
	}
	if _, err := validateResourceAddresses("destroy", []string{"module.network"}); err == nil {
		t.Fatal("destroy with resource addresses should fail")
	}
}

func TestDriftAPIIsRemoved(t *testing.T) {
	handler := testHandler(t)
	req := httptest.NewRequest(http.MethodGet, "/api/drift", nil)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("GET /api/drift status = %d, want 404", res.Code)
	}
}

func TestRunGraphAPIReadsSavedGraph(t *testing.T) {
	config.SetPath(filepath.Join(t.TempDir(), "config.yaml"))
	t.Cleanup(func() { config.SetPath("") })
	mgr := &RunManager{runs: []*Run{{
		ID: "run-7", Status: StatusSuccess, Request: RunRequest{Command: "plan", Repo: "infra"},
	}}}
	doc := graphdata.Document{
		RunID: "run-7", Repo: "infra", Revision: 1,
		Nodes: []graphdata.Node{{ID: "target:dev:resource:aws_vpc.main", Kind: "managed", Label: "aws_vpc.main"}},
	}
	data, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(graphPath("run-7")), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(graphPath("run-7"), data, 0o600); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/runs/run-7/graph", nil)
	res := httptest.NewRecorder()
	Handler(mgr, t.TempDir()).ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", res.Code, res.Body.String())
	}
	var got graphdata.Document
	if err := json.Unmarshal(res.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Revision != 1 || len(got.Nodes) != 1 {
		t.Fatalf("graph = %#v", got)
	}

	runReq := httptest.NewRequest(http.MethodGet, "/api/runs/run-7", nil)
	runRes := httptest.NewRecorder()
	Handler(mgr, t.TempDir()).ServeHTTP(runRes, runReq)
	if runRes.Code != http.StatusOK {
		t.Fatalf("run status = %d body=%s", runRes.Code, runRes.Body.String())
	}
	var runBody struct {
		HasGraph bool `json:"hasGraph"`
	}
	if err := json.Unmarshal(runRes.Body.Bytes(), &runBody); err != nil {
		t.Fatal(err)
	}
	if !runBody.HasGraph {
		t.Fatal("run hasGraph = false, want true")
	}
}

func TestRunWithoutGraphReportsUnavailable(t *testing.T) {
	config.SetPath(filepath.Join(t.TempDir(), "config.yaml"))
	t.Cleanup(func() { config.SetPath("") })
	mgr := &RunManager{runs: []*Run{{
		ID: "run-8", Status: StatusSuccess, Request: RunRequest{Command: "validate", Repo: "infra"},
	}}}
	handler := Handler(mgr, t.TempDir())

	req := httptest.NewRequest(http.MethodGet, "/api/runs/run-8", nil)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	var runBody struct {
		HasGraph bool `json:"hasGraph"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &runBody); err != nil {
		t.Fatal(err)
	}
	if runBody.HasGraph {
		t.Fatal("run hasGraph = true, want false")
	}

	graphReq := httptest.NewRequest(http.MethodGet, "/api/runs/run-8/graph", nil)
	graphRes := httptest.NewRecorder()
	handler.ServeHTTP(graphRes, graphReq)
	if graphRes.Code != http.StatusNotFound {
		t.Fatalf("graph status = %d, want 404", graphRes.Code)
	}
}

func TestAWSIdentityMethodNotAllowed(t *testing.T) {
	handler := testHandler(t)
	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete} {
		req := httptest.NewRequest(method, "/api/aws/identity", nil)
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if res.Code != http.StatusMethodNotAllowed {
			t.Errorf("%s /api/aws/identity status = %d, want %d", method, res.Code, http.StatusMethodNotAllowed)
		}
		var got struct {
			Error struct {
				Code string `json:"code"`
			} `json:"error"`
		}
		if err := json.Unmarshal(res.Body.Bytes(), &got); err != nil {
			t.Errorf("%s body not valid JSON: %v", method, err)
			continue
		}
		if got.Error.Code != "method_not_allowed" {
			t.Errorf("%s error code = %q, want method_not_allowed", method, got.Error.Code)
		}
	}
}

// ── GET /api/runs filtering ─────────────────────────────────────────────────

// seedRunManager returns a manager holding four finished runs, oldest first:
//
//	run-1 plan    2026-06-01T12:00Z
//	run-2 apply   2026-06-02T12:00Z
//	run-3 plan    2026-06-03T12:00Z
//	run-4 destroy 2026-06-04T12:00Z
func seedRunManager() *RunManager {
	t0 := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	mk := func(id, cmd, ticket string, status RunStatus, day int) *Run {
		return &Run{
			ID:        id,
			Status:    status,
			StartedAt: t0.AddDate(0, 0, day),
			Request:   RunRequest{Command: cmd, Ticket: ticket},
		}
	}
	return &RunManager{runs: []*Run{
		mk("run-1", "plan", "OPS-100", StatusSuccess, 0),
		mk("run-2", "apply", "PLAT-42", StatusFailed, 1),
		mk("run-3", "plan", "ops-101", StatusSuccess, 2),
		mk("run-4", "destroy", "", StatusCancelled, 3),
	}}
}

type runsListBody struct {
	Items []struct {
		ID      string `json:"id"`
		Command string `json:"command"`
	} `json:"items"`
	Total int `json:"total"`
}

func getRunsList(t *testing.T, mgr *RunManager, query string) (int, runsListBody) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/runs"+query, nil)
	res := httptest.NewRecorder()
	listRuns(res, req, mgr)
	var body runsListBody
	if res.Code == http.StatusOK {
		if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
			t.Fatalf("invalid JSON body: %v\n%s", err, res.Body.String())
		}
	}
	return res.Code, body
}

func runIDs(body runsListBody) []string {
	ids := make([]string, len(body.Items))
	for i, it := range body.Items {
		ids[i] = it.ID
	}
	return ids
}

func TestListRunsUnfilteredKeepsLegacyBehavior(t *testing.T) {
	code, body := getRunsList(t, seedRunManager(), "")
	if code != http.StatusOK {
		t.Fatalf("status = %d", code)
	}
	if body.Total != 4 {
		t.Fatalf("total = %d, want 4", body.Total)
	}
	want := []string{"run-4", "run-3", "run-2", "run-1"} // newest-first
	if got := runIDs(body); !reflect.DeepEqual(got, want) {
		t.Fatalf("ids = %v, want %v", got, want)
	}
}

func TestListRunsFiltersBySingleCommand(t *testing.T) {
	code, body := getRunsList(t, seedRunManager(), "?command=plan")
	if code != http.StatusOK {
		t.Fatalf("status = %d", code)
	}
	want := []string{"run-3", "run-1"}
	if got := runIDs(body); !reflect.DeepEqual(got, want) {
		t.Fatalf("ids = %v, want %v", got, want)
	}
	if body.Total != 2 {
		t.Fatalf("total = %d, want 2", body.Total)
	}
}

func TestListRunsFiltersByMultipleCommands(t *testing.T) {
	code, body := getRunsList(t, seedRunManager(), "?command=plan&command=apply")
	if code != http.StatusOK {
		t.Fatalf("status = %d", code)
	}
	want := []string{"run-3", "run-2", "run-1"}
	if got := runIDs(body); !reflect.DeepEqual(got, want) {
		t.Fatalf("ids = %v, want %v", got, want)
	}
}

func TestListRunsFiltersByStatus(t *testing.T) {
	code, body := getRunsList(t, seedRunManager(), "?status=success")
	if code != http.StatusOK {
		t.Fatalf("status = %d", code)
	}
	want := []string{"run-3", "run-1"}
	if got := runIDs(body); !reflect.DeepEqual(got, want) {
		t.Fatalf("ids = %v, want %v", got, want)
	}
}

func TestListRunsAcceptsPartialSuccessStatus(t *testing.T) {
	mgr := seedRunManager()
	mgr.runs = append(mgr.runs, &Run{
		ID:        "run-5",
		Status:    StatusPartialSuccess,
		StartedAt: time.Date(2026, 6, 5, 12, 0, 0, 0, time.UTC),
		Request:   RunRequest{Command: "plan"},
	})
	code, body := getRunsList(t, mgr, "?status=partial_success")
	if code != http.StatusOK || body.Total != 1 || !reflect.DeepEqual(runIDs(body), []string{"run-5"}) {
		t.Fatalf("partial success filter: code=%d total=%d ids=%v", code, body.Total, runIDs(body))
	}
}

func TestListRunsFiltersByTicketSubstringCaseInsensitive(t *testing.T) {
	code, body := getRunsList(t, seedRunManager(), "?ticket=OpS")
	if code != http.StatusOK {
		t.Fatalf("status = %d", code)
	}
	want := []string{"run-3", "run-1"}
	if got := runIDs(body); !reflect.DeepEqual(got, want) {
		t.Fatalf("ids = %v, want %v", got, want)
	}
}

func TestListRunsRejectsInvalidStatus(t *testing.T) {
	code, _ := getRunsList(t, seedRunManager(), "?status=unknown")
	if code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", code)
	}
}

func TestListRunsFiltersByDateRangeInclusive(t *testing.T) {
	// from equals run-2's exact start; to equals run-3's exact start —
	// both boundaries must be inclusive.
	code, body := getRunsList(t, seedRunManager(),
		"?from=2026-06-02T12:00:00Z&to=2026-06-03T12:00:00Z")
	if code != http.StatusOK {
		t.Fatalf("status = %d", code)
	}
	want := []string{"run-3", "run-2"}
	if got := runIDs(body); !reflect.DeepEqual(got, want) {
		t.Fatalf("ids = %v, want %v", got, want)
	}
}

func TestListRunsCombinesDateAndCommandWithAND(t *testing.T) {
	code, body := getRunsList(t, seedRunManager(),
		"?from=2026-06-02T00:00:00Z&command=plan")
	if code != http.StatusOK {
		t.Fatalf("status = %d", code)
	}
	want := []string{"run-3"}
	if got := runIDs(body); !reflect.DeepEqual(got, want) {
		t.Fatalf("ids = %v, want %v", got, want)
	}
}

func TestListRunsFiltersBeforePagination(t *testing.T) {
	code, body := getRunsList(t, seedRunManager(), "?command=plan&limit=1&page=2")
	if code != http.StatusOK {
		t.Fatalf("status = %d", code)
	}
	if body.Total != 2 {
		t.Fatalf("total = %d, want 2 (filtered count, not all runs)", body.Total)
	}
	want := []string{"run-1"} // page 2 of the filtered, newest-first list
	if got := runIDs(body); !reflect.DeepEqual(got, want) {
		t.Fatalf("ids = %v, want %v", got, want)
	}
}

func TestListRunsRejectsMalformedDates(t *testing.T) {
	for _, q := range []string{"?from=notadate", "?to=2026-06-01", "?from=2026-06-02T00:00:00Z&to=2026-06-01T00:00:00Z"} {
		code, _ := getRunsList(t, seedRunManager(), q)
		if code != http.StatusBadRequest {
			t.Errorf("query %q status = %d, want 400", q, code)
		}
	}
}
