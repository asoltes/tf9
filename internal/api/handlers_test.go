package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/andres/tfops/internal/config"
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

func TestRepoAPIWritesRepositoryAndTargetsToSharedConfig(t *testing.T) {
	handler := testHandler(t)

	body, _ := json.Marshal(map[string]string{"name": "infra", "path": "/work/infra"})
	req := httptest.NewRequest(http.MethodPost, "/api/repos", bytes.NewReader(body))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusCreated {
		t.Fatalf("POST /api/repos status = %d body=%s", res.Code, res.Body.String())
	}

	body, _ = json.Marshal(config.RepoConfig{Targets: []config.RepoTarget{{
		Name: "dev", Directory: "environments/dev", AWSProfile: "company-dev",
	}}})
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

func TestDriftAPIIsRemoved(t *testing.T) {
	handler := testHandler(t)
	req := httptest.NewRequest(http.MethodGet, "/api/drift", nil)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("GET /api/drift status = %d, want 404", res.Code)
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
