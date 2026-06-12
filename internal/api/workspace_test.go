package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/andres/tf9/internal/config"
	"github.com/gorilla/websocket"
)

func workspaceTestHandler(t *testing.T) (http.Handler, string) {
	t.Helper()
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "main.tf"), []byte("terraform {}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, "modules"), 0o755); err != nil {
		t.Fatal(err)
	}
	config.SetPath(filepath.Join(t.TempDir(), "config.yaml"))
	t.Cleanup(func() { config.SetPath("") })
	if err := config.AddRepo("infra", root); err != nil {
		t.Fatal(err)
	}
	return Handler(NewRunManager(), t.TempDir()), root
}

func workspaceRequest(t *testing.T, handler http.Handler, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var data []byte
	if body != nil {
		var err error
		data, err = json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(data))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	return res
}

func TestWorkspaceCRUDAndRevisionConflict(t *testing.T) {
	handler, root := workspaceTestHandler(t)

	res := workspaceRequest(t, handler, http.MethodGet, "/api/repos/infra/workspace/file?path=main.tf", nil)
	if res.Code != http.StatusOK {
		t.Fatalf("read status = %d body=%s", res.Code, res.Body.String())
	}
	var file workspaceFile
	if err := json.Unmarshal(res.Body.Bytes(), &file); err != nil {
		t.Fatal(err)
	}

	res = workspaceRequest(t, handler, http.MethodPut, "/api/repos/infra/workspace/file", map[string]any{
		"path": "main.tf", "content": "terraform { required_version = \">= 1.8\" }\n", "revision": file.Revision,
	})
	if res.Code != http.StatusOK {
		t.Fatalf("save status = %d body=%s", res.Code, res.Body.String())
	}
	got, err := os.ReadFile(filepath.Join(root, "main.tf"))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "terraform { required_version = \">= 1.8\" }\n" {
		t.Fatalf("saved content = %q", got)
	}

	res = workspaceRequest(t, handler, http.MethodPut, "/api/repos/infra/workspace/file", map[string]any{
		"path": "main.tf", "content": "stale", "revision": file.Revision,
	})
	if res.Code != http.StatusConflict {
		t.Fatalf("stale save status = %d body=%s", res.Code, res.Body.String())
	}

	res = workspaceRequest(t, handler, http.MethodPost, "/api/repos/infra/workspace/entry", map[string]string{
		"path": "modules/network", "type": "directory",
	})
	if res.Code != http.StatusCreated {
		t.Fatalf("mkdir status = %d body=%s", res.Code, res.Body.String())
	}
	res = workspaceRequest(t, handler, http.MethodPost, "/api/repos/infra/workspace/entry", map[string]string{
		"path": "modules/network/main.tf", "type": "file",
	})
	if res.Code != http.StatusCreated {
		t.Fatalf("create file status = %d body=%s", res.Code, res.Body.String())
	}
	res = workspaceRequest(t, handler, http.MethodPatch, "/api/repos/infra/workspace/entry", map[string]string{
		"path": "modules/network/main.tf", "destination": "modules/network/renamed.tf",
	})
	if res.Code != http.StatusOK {
		t.Fatalf("rename status = %d body=%s", res.Code, res.Body.String())
	}
	res = workspaceRequest(t, handler, http.MethodDelete, "/api/repos/infra/workspace/entry?path=modules%2Fnetwork", nil)
	if res.Code != http.StatusOK {
		t.Fatalf("delete status = %d body=%s", res.Code, res.Body.String())
	}
	if _, err := os.Stat(filepath.Join(root, "modules", "network")); !os.IsNotExist(err) {
		t.Fatalf("recursive delete left directory: %v", err)
	}
}

func TestWorkspaceLanguageCommonFiles(t *testing.T) {
	tests := map[string]string{
		"app.py":         "python",
		"server.rb":      "ruby",
		"main.rs":        "rust",
		"Program.cs":     "csharp",
		"service.java":   "java",
		"worker.cpp":     "cpp",
		"query.sql":      "sql",
		"schema.graphql": "graphql",
		"styles.scss":    "scss",
		"config.toml":    "ini",
		"Dockerfile":     "dockerfile",
		"Makefile":       "shell",
	}
	for path, want := range tests {
		t.Run(path, func(t *testing.T) {
			if got := workspaceLanguage(path); got != want {
				t.Fatalf("workspaceLanguage(%q) = %q, want %q", path, got, want)
			}
		})
	}
}

func TestWorkspaceRejectsTraversalGitAndSymlinkEscape(t *testing.T) {
	handler, root := workspaceTestHandler(t)
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "secret"), []byte("secret"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "escape")); err != nil {
		t.Fatal(err)
	}

	for _, path := range []string{
		"/api/repos/infra/workspace/file?path=..%2Fsecret",
		"/api/repos/infra/workspace/tree?path=.git",
		"/api/repos/infra/workspace/file?path=escape%2Fsecret",
	} {
		res := workspaceRequest(t, handler, http.MethodGet, path, nil)
		if res.Code != http.StatusBadRequest {
			t.Errorf("%s status = %d body=%s", path, res.Code, res.Body.String())
		}
	}
}

func TestWorkspaceDiff(t *testing.T) {
	handler, root := workspaceTestHandler(t)
	for _, args := range [][]string{
		{"init"},
		{"config", "user.email", "test@example.com"},
		{"config", "user.name", "Test"},
		{"add", "main.tf"},
		{"commit", "-m", "initial"},
	} {
		cmd := exec.Command("git", append([]string{"-C", root}, args...)...)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
	if err := os.WriteFile(filepath.Join(root, "main.tf"), []byte("terraform { required_version = \">= 1.8\" }\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	res := workspaceRequest(t, handler, http.MethodGet, "/api/repos/infra/workspace/diff?path=main.tf", nil)
	if res.Code != http.StatusOK || !bytes.Contains(res.Body.Bytes(), []byte("required_version")) {
		t.Fatalf("diff status = %d body=%s", res.Code, res.Body.String())
	}
}

func TestWorkspaceWebSocketOriginAllowsLoopbackDevProxy(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "http://localhost:8080/api/repos/infra/workspace/terminal", nil)
	req.Host = "localhost:8080"
	req.Header.Set("Origin", "http://localhost:5173")
	if !workspaceUpgrader.CheckOrigin(req) {
		t.Fatal("loopback Vite origin should be allowed")
	}
	req.Header.Set("Origin", "https://example.com")
	if workspaceUpgrader.CheckOrigin(req) {
		t.Fatal("non-loopback cross-origin terminal should be rejected")
	}
}

func TestWorkspaceTerminalRunsInRepository(t *testing.T) {
	handler, root := workspaceTestHandler(t)
	t.Setenv("SHELL", "/bin/sh")
	server := httptest.NewServer(handler)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/repos/infra/workspace/terminal"
	header := http.Header{"Origin": []string{server.URL}}
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if err := conn.SetReadDeadline(time.Now().Add(5 * time.Second)); err != nil {
		t.Fatal(err)
	}
	if err := conn.WriteMessage(websocket.BinaryMessage, []byte("pwd\nexit\n")); err != nil {
		t.Fatal(err)
	}

	var output strings.Builder
	for {
		_, data, readErr := conn.ReadMessage()
		if len(data) > 0 {
			output.Write(data)
		}
		if strings.Contains(output.String(), root) {
			return
		}
		if readErr != nil {
			t.Fatalf("terminal closed before pwd output; output=%q err=%v", output.String(), readErr)
		}
	}
}

func TestWorkspaceTerminalRunsInSelectedDirectory(t *testing.T) {
	handler, root := workspaceTestHandler(t)
	t.Setenv("SHELL", "/bin/sh")
	server := httptest.NewServer(handler)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/repos/infra/workspace/terminal?path=modules"
	header := http.Header{"Origin": []string{server.URL}}
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if err := conn.SetReadDeadline(time.Now().Add(5 * time.Second)); err != nil {
		t.Fatal(err)
	}
	if err := conn.WriteMessage(websocket.BinaryMessage, []byte("pwd\nexit\n")); err != nil {
		t.Fatal(err)
	}

	want := filepath.Join(root, "modules")
	var output strings.Builder
	for {
		_, data, readErr := conn.ReadMessage()
		if len(data) > 0 {
			output.Write(data)
		}
		if strings.Contains(output.String(), want) {
			return
		}
		if readErr != nil {
			t.Fatalf("terminal closed before selected pwd output; output=%q err=%v", output.String(), readErr)
		}
	}
}

func TestWorkspaceTerminalRejectsInvalidDirectory(t *testing.T) {
	handler, _ := workspaceTestHandler(t)

	for _, path := range []string{"main.tf", "../outside"} {
		res := workspaceRequest(
			t,
			handler,
			http.MethodGet,
			"/api/repos/infra/workspace/terminal?path="+url.QueryEscape(path),
			nil,
		)
		if res.Code != http.StatusBadRequest {
			t.Errorf("path %q status = %d body=%s", path, res.Code, res.Body.String())
		}
	}
}
