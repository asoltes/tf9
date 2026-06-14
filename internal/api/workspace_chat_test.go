package api

import (
	"bufio"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/andres/tf9/internal/config"
)

func workspaceChatTestHandler(t *testing.T, script string) (http.Handler, string, string) {
	t.Helper()
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "main.tf"), []byte("terraform {}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	configPath := filepath.Join(t.TempDir(), "config.yaml")
	config.SetPath(configPath)
	t.Cleanup(func() { config.SetPath("") })
	if err := config.AddRepo("infra", root); err != nil {
		t.Fatal(err)
	}
	claude := filepath.Join(t.TempDir(), "claude")
	if err := os.WriteFile(claude, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	logPath := filepath.Join(t.TempDir(), "claude.log")
	t.Setenv("TF9_CLAUDE_PATH", claude)
	t.Setenv("CHAT_LOG", logPath)
	return Handler(NewRunManager(), t.TempDir()), root, logPath
}

const fakeClaudeScript = `#!/bin/sh
if [ "$1" = "auth" ]; then
  echo '{"loggedIn":true,"authMethod":"claude.ai"}'
  exit 0
fi
printf 'cwd=%s args=%s\n' "$PWD" "$*" >> "$CHAT_LOG"
echo '{"type":"system","subtype":"init","session_id":"11111111-1111-1111-1111-111111111111"}'
echo '{"type":"stream_event","session_id":"11111111-1111-1111-1111-111111111111","event":{"delta":{"type":"text_delta","text":"Updated "}}}'
echo '{"type":"assistant","session_id":"11111111-1111-1111-1111-111111111111","message":{"content":[{"type":"tool_use","name":"Edit","input":{"file_path":"main.tf"}}]}}'
echo '{"type":"stream_event","session_id":"11111111-1111-1111-1111-111111111111","event":{"delta":{"type":"text_delta","text":"main.tf"}}}'
echo '{"type":"result","subtype":"success","session_id":"11111111-1111-1111-1111-111111111111","result":"Updated main.tf"}'
`

func TestWorkspaceChatStreamsPersistsAndResumes(t *testing.T) {
	handler, root, logPath := workspaceChatTestHandler(t, fakeClaudeScript)

	res := workspaceRequest(t, handler, http.MethodGet, "/api/repos/infra/workspace/chat", nil)
	if res.Code != http.StatusOK {
		t.Fatalf("chat state status = %d body=%s", res.Code, res.Body.String())
	}
	var initial struct {
		Available bool               `json:"available"`
		Mode      workspaceChatMode  `json:"mode"`
		Model     workspaceChatModel `json:"model"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &initial); err != nil {
		t.Fatal(err)
	}
	if !initial.Available || initial.Mode != workspaceChatReview || initial.Model != workspaceChatSonnet {
		t.Fatalf("initial chat state = %#v", initial)
	}

	res = workspaceRequest(t, handler, http.MethodPut, "/api/repos/infra/workspace/chat/mode", map[string]string{
		"mode": string(workspaceChatAutoApply),
	})
	if res.Code != http.StatusOK {
		t.Fatalf("mode status = %d body=%s", res.Code, res.Body.String())
	}
	res = workspaceRequest(t, handler, http.MethodPut, "/api/repos/infra/workspace/chat/model", map[string]string{
		"model": string(workspaceChatOpus),
	})
	if res.Code != http.StatusOK {
		t.Fatalf("model status = %d body=%s", res.Code, res.Body.String())
	}

	turnID := startWorkspaceChatTestTurn(t, handler, "Update the file")
	stream := workspaceRequest(
		t, handler, http.MethodGet,
		"/api/repos/infra/workspace/chat/stream?turnId="+turnID, nil,
	)
	if stream.Code != http.StatusOK {
		t.Fatalf("stream status = %d body=%s", stream.Code, stream.Body.String())
	}
	events := decodeWorkspaceChatTestEvents(t, stream.Body.String())
	if !strings.Contains(stream.Body.String(), `"delta":"Updated "`) ||
		!strings.Contains(stream.Body.String(), `"tool":"Edit"`) ||
		events[len(events)-1].Status != "success" {
		t.Fatalf("unexpected events: %s", stream.Body.String())
	}

	res = workspaceRequest(t, handler, http.MethodGet, "/api/repos/infra/workspace/chat", nil)
	var state struct {
		Mode     workspaceChatMode      `json:"mode"`
		Messages []workspaceChatMessage `json:"messages"`
		Running  bool                   `json:"running"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &state); err != nil {
		t.Fatal(err)
	}
	if state.Running || state.Mode != workspaceChatAutoApply || len(state.Messages) != 2 ||
		state.Messages[1].Content != "Updated main.tf" {
		t.Fatalf("persisted state = %#v", state)
	}

	secondTurnID := startWorkspaceChatTestTurn(t, handler, "Continue")
	_ = workspaceRequest(
		t, handler, http.MethodGet,
		"/api/repos/infra/workspace/chat/stream?turnId="+secondTurnID, nil,
	)
	logged, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatal(err)
	}
	logText := string(logged)
	if !strings.Contains(logText, "cwd="+root) ||
		!strings.Contains(logText, "--permission-mode acceptEdits") ||
		!strings.Contains(logText, "--model opus") ||
		!strings.Contains(logText, "--resume 11111111-1111-1111-1111-111111111111") ||
		!strings.Contains(logText, "Bash(git *)") ||
		// git is allowed so the AI can reconcile drift, but push is explicitly
		// denied — promoting to the integration branch is the human's action.
		!strings.Contains(logText, "--disallowedTools") ||
		!strings.Contains(logText, "Bash(git push *)") {
		t.Fatalf("claude invocation was not scoped as expected:\n%s", logText)
	}

	statePath := filepath.Join(filepath.Dir(config.ConfigPath()), "ai-chat.json")
	persisted, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(persisted), "11111111-1111-1111-1111-111111111111") {
		t.Fatalf("session was not persisted: %s", persisted)
	}
}

func TestWorkspaceChatRejectsUnsupportedModel(t *testing.T) {
	handler, _, _ := workspaceChatTestHandler(t, fakeClaudeScript)
	res := workspaceRequest(t, handler, http.MethodPut, "/api/repos/infra/workspace/chat/model", map[string]string{
		"model": "unknown",
	})
	if res.Code != http.StatusBadRequest {
		t.Fatalf("unsupported model status = %d body=%s", res.Code, res.Body.String())
	}
}

func TestWorkspaceChatRejectsConcurrentTurnAndCancels(t *testing.T) {
	handler, _, _ := workspaceChatTestHandler(t, `#!/bin/sh
if [ "$1" = "auth" ]; then
  echo '{"loggedIn":true}'
  exit 0
fi
echo '{"type":"system","subtype":"init","session_id":"22222222-2222-2222-2222-222222222222"}'
exec sleep 10
`)
	_ = startWorkspaceChatTestTurn(t, handler, "Wait")
	res := workspaceRequest(t, handler, http.MethodPost, "/api/repos/infra/workspace/chat/message", map[string]string{
		"message": "Second",
	})
	if res.Code != http.StatusConflict {
		t.Fatalf("concurrent status = %d body=%s", res.Code, res.Body.String())
	}
	res = workspaceRequest(t, handler, http.MethodPost, "/api/repos/infra/workspace/chat/cancel", map[string]string{})
	if res.Code != http.StatusOK {
		t.Fatalf("cancel status = %d body=%s", res.Code, res.Body.String())
	}
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		res = workspaceRequest(t, handler, http.MethodGet, "/api/repos/infra/workspace/chat", nil)
		var state struct {
			Running bool `json:"running"`
		}
		if json.Unmarshal(res.Body.Bytes(), &state) == nil && !state.Running {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("chat turn did not stop after cancellation")
}

func TestWorkspaceChatReportsMissingAuthentication(t *testing.T) {
	handler, _, _ := workspaceChatTestHandler(t, `#!/bin/sh
if [ "$1" = "auth" ]; then
  echo '{"loggedIn":false}'
  exit 1
fi
`)
	res := workspaceRequest(t, handler, http.MethodGet, "/api/repos/infra/workspace/chat", nil)
	var state struct {
		Available bool   `json:"available"`
		AuthError string `json:"authError"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &state); err != nil {
		t.Fatal(err)
	}
	if state.Available || state.AuthError == "" {
		t.Fatalf("auth state = %#v", state)
	}
	res = workspaceRequest(t, handler, http.MethodPost, "/api/repos/infra/workspace/chat/message", map[string]string{
		"message": "Hello",
	})
	if res.Code != http.StatusServiceUnavailable {
		t.Fatalf("unauthenticated message status = %d body=%s", res.Code, res.Body.String())
	}
}

func startWorkspaceChatTestTurn(t *testing.T, handler http.Handler, message string) string {
	t.Helper()
	res := workspaceRequest(t, handler, http.MethodPost, "/api/repos/infra/workspace/chat/message", map[string]string{
		"message": message,
	})
	if res.Code != http.StatusOK {
		t.Fatalf("start status = %d body=%s", res.Code, res.Body.String())
	}
	var started struct {
		TurnID string `json:"turnId"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &started); err != nil {
		t.Fatal(err)
	}
	return started.TurnID
}

func decodeWorkspaceChatTestEvents(t *testing.T, stream string) []workspaceChatEvent {
	t.Helper()
	var events []workspaceChatEvent
	scanner := bufio.NewScanner(strings.NewReader(stream))
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		var event workspaceChatEvent
		if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &event); err != nil {
			t.Fatal(err)
		}
		events = append(events, event)
	}
	return events
}
