package api

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/andres/tf9/internal/config"
)

const workspaceChatHistoryLimit = 100

type workspaceChatMode string
type workspaceChatModel string

const (
	workspaceChatReview    workspaceChatMode = "review"
	workspaceChatAutoApply workspaceChatMode = "autoApply"

	workspaceChatSonnet workspaceChatModel = "sonnet"
	workspaceChatOpus   workspaceChatModel = "opus"
	workspaceChatHaiku  workspaceChatModel = "haiku"
)

type workspaceChatMessage struct {
	ID        string    `json:"id"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"createdAt"`
}

type workspaceChatRepoState struct {
	SessionID string                 `json:"sessionId,omitempty"`
	Mode      workspaceChatMode      `json:"mode"`
	Model     workspaceChatModel     `json:"model"`
	Messages  []workspaceChatMessage `json:"messages"`
}

type workspaceChatStore struct {
	Repositories map[string]*workspaceChatRepoState `json:"repositories"`
}

type workspaceChatEvent struct {
	Type     string         `json:"type"`
	Delta    string         `json:"delta,omitempty"`
	Message  string         `json:"message,omitempty"`
	Tool     string         `json:"tool,omitempty"`
	Summary  string         `json:"summary,omitempty"`
	Status   string         `json:"status,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

type workspaceChatTurn struct {
	ID       string
	Repo     string
	events   []workspaceChatEvent
	done     bool
	cancel   context.CancelFunc
	response strings.Builder
	mu       sync.RWMutex
}

func (t *workspaceChatTurn) append(event workspaceChatEvent) {
	t.mu.Lock()
	t.events = append(t.events, event)
	t.mu.Unlock()
}

func (t *workspaceChatTurn) snapshot(offset int) ([]workspaceChatEvent, bool) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	if offset < 0 {
		offset = 0
	}
	if offset > len(t.events) {
		offset = len(t.events)
	}
	events := append([]workspaceChatEvent(nil), t.events[offset:]...)
	return events, t.done
}

type workspaceChatManager struct {
	mu           sync.RWMutex
	store        workspaceChatStore
	turns        map[string]*workspaceChatTurn
	activeByRepo map[string]string
	statePath    string
	claudePath   string
	authChecked  time.Time
	authOK       bool
	authErr      string
}

func newWorkspaceChatManager() *workspaceChatManager {
	path := os.Getenv("TF9_CLAUDE_PATH")
	if path == "" {
		path, _ = exec.LookPath("claude")
	}
	m := &workspaceChatManager{
		store:        workspaceChatStore{Repositories: map[string]*workspaceChatRepoState{}},
		turns:        map[string]*workspaceChatTurn{},
		activeByRepo: map[string]string{},
		statePath:    filepath.Join(filepath.Dir(config.ConfigPath()), "ai-chat.json"),
		claudePath:   path,
	}
	m.load()
	return m
}

func (m *workspaceChatManager) load() {
	data, err := os.ReadFile(m.statePath)
	if errors.Is(err, os.ErrNotExist) {
		return
	}
	if err != nil {
		slog.Warn("workspace chat: load state failed", "path", m.statePath, "err", err)
		return
	}
	if err := json.Unmarshal(data, &m.store); err != nil {
		slog.Warn("workspace chat: parse state failed", "path", m.statePath, "err", err)
	}
	if m.store.Repositories == nil {
		m.store.Repositories = map[string]*workspaceChatRepoState{}
	}
}

func (m *workspaceChatManager) saveLocked() error {
	if err := os.MkdirAll(filepath.Dir(m.statePath), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(m.store, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(m.statePath), ".ai-chat-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, m.statePath)
}

func (m *workspaceChatManager) repoStateLocked(repo string) *workspaceChatRepoState {
	state := m.store.Repositories[repo]
	if state == nil {
		state = &workspaceChatRepoState{
			Mode: workspaceChatReview, Model: workspaceChatSonnet, Messages: []workspaceChatMessage{},
		}
		m.store.Repositories[repo] = state
	}
	if state.Mode != workspaceChatAutoApply {
		state.Mode = workspaceChatReview
	}
	if state.Model != workspaceChatOpus && state.Model != workspaceChatHaiku {
		state.Model = workspaceChatSonnet
	}
	return state
}

func (m *workspaceChatManager) authStatus(ctx context.Context) (bool, string) {
	m.mu.RLock()
	if time.Since(m.authChecked) < 30*time.Second {
		ok, msg := m.authOK, m.authErr
		m.mu.RUnlock()
		return ok, msg
	}
	claudePath := m.claudePath
	m.mu.RUnlock()
	if claudePath == "" {
		return false, "Claude Code is not installed or is not available on PATH."
	}
	authCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(authCtx, claudePath, "auth", "status").CombinedOutput()
	ok := false
	message := ""
	if err == nil {
		var status struct {
			LoggedIn bool `json:"loggedIn"`
		}
		if json.Unmarshal(out, &status) == nil && status.LoggedIn {
			ok = true
		} else {
			message = "Claude Code is not logged in. Run `claude auth login` before starting tf9."
		}
	} else {
		message = strings.TrimSpace(string(out))
		if message == "" {
			message = "Could not verify Claude Code authentication."
		}
	}
	m.mu.Lock()
	m.authChecked, m.authOK, m.authErr = time.Now(), ok, message
	m.mu.Unlock()
	return ok, message
}

func (m *workspaceChatManager) state(repo string) (workspaceChatRepoState, string, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	state := m.repoStateLocked(repo)
	copyState := *state
	copyState.Messages = append([]workspaceChatMessage{}, state.Messages...)
	activeID := m.activeByRepo[repo]
	return copyState, activeID, activeID != ""
}

func (m *workspaceChatManager) setMode(repo string, mode workspaceChatMode) error {
	if mode != workspaceChatReview && mode != workspaceChatAutoApply {
		return fmt.Errorf("mode must be review or autoApply")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.repoStateLocked(repo).Mode = mode
	return m.saveLocked()
}

func (m *workspaceChatManager) setModel(repo string, model workspaceChatModel) error {
	if model != workspaceChatSonnet && model != workspaceChatOpus && model != workspaceChatHaiku {
		return fmt.Errorf("model must be sonnet, opus, or haiku")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.activeByRepo[repo] != "" {
		return fmt.Errorf("wait for the active response before changing models")
	}
	m.repoStateLocked(repo).Model = model
	return m.saveLocked()
}

func (m *workspaceChatManager) reset(repo string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.activeByRepo[repo] != "" {
		return fmt.Errorf("cancel the active response before starting a new chat")
	}
	current := m.repoStateLocked(repo)
	m.store.Repositories[repo] = &workspaceChatRepoState{
		Mode: current.Mode, Model: current.Model, Messages: []workspaceChatMessage{},
	}
	return m.saveLocked()
}

func (m *workspaceChatManager) start(repo, prompt string) (*workspaceChatTurn, error) {
	root, err := workspaceRoot(repo)
	if err != nil {
		return nil, err
	}
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return nil, fmt.Errorf("message is required")
	}
	m.mu.Lock()
	if m.activeByRepo[repo] != "" {
		m.mu.Unlock()
		return nil, fmt.Errorf("a response is already running for this repository")
	}
	state := m.repoStateLocked(repo)
	turnID := fmt.Sprintf("%d", time.Now().UnixNano())
	turn := &workspaceChatTurn{ID: turnID, Repo: repo}
	ctx, cancel := context.WithCancel(context.Background())
	turn.cancel = cancel
	m.turns[turnID] = turn
	m.activeByRepo[repo] = turnID
	state.Messages = appendHistory(state.Messages, workspaceChatMessage{
		ID: turnID + "-user", Role: "user", Content: prompt, CreatedAt: time.Now().UTC(),
	})
	sessionID, mode, model := state.SessionID, state.Mode, state.Model
	if err := m.saveLocked(); err != nil {
		delete(m.turns, turnID)
		delete(m.activeByRepo, repo)
		m.mu.Unlock()
		cancel()
		return nil, err
	}
	claudePath := m.claudePath
	m.mu.Unlock()
	go m.runTurn(ctx, turn, root, prompt, sessionID, mode, model, claudePath)
	return turn, nil
}

func appendHistory(messages []workspaceChatMessage, message workspaceChatMessage) []workspaceChatMessage {
	messages = append(messages, message)
	if len(messages) > workspaceChatHistoryLimit {
		messages = append([]workspaceChatMessage(nil), messages[len(messages)-workspaceChatHistoryLimit:]...)
	}
	return messages
}

var workspaceChatAllowedTools = []string{
	"Read", "Glob", "Grep",
	// git is allowed broadly so the AI can investigate branches and reconcile
	// drift (fetch, log, diff, show, for-each-ref, rebase, cherry-pick, merge).
	// Pushing is denied below and remains a human action.
	"Bash(git *)",
	"Bash(go test *)", "Bash(go vet *)", "Bash(go build *)",
	"Bash(npm test *)", "Bash(npm run test *)", "Bash(npm run build *)", "Bash(npx tsc *)",
	"Bash(terraform fmt -check *)", "Bash(terraform validate *)",
	"Bash(tf9 init)", "Bash(tf9 init *)", "Bash(tf9 plan)", "Bash(tf9 plan *)",
}

var workspaceChatDeniedTools = []string{
	"Bash(rm *)", "Bash(sudo *)", "Bash(curl *)", "Bash(wget *)", "Bash(ssh *)", "Bash(scp *)",
	// Drift reconciliation must never push or apply — these stay with the human
	// (the Promote button and the terraform approval gate). Deny overrides allow.
	"Bash(git push)", "Bash(git push *)",
	"Bash(terraform apply *)", "Bash(terraform apply)",
	"Bash(terraform destroy *)", "Bash(terraform destroy)",
}

func (m *workspaceChatManager) runTurn(
	ctx context.Context,
	turn *workspaceChatTurn,
	root, prompt, sessionID string,
	mode workspaceChatMode,
	model workspaceChatModel,
	claudePath string,
) {
	status := "success"
	var runErr error
	if claudePath == "" {
		runErr = fmt.Errorf("Claude Code is not installed or is not available on PATH")
	} else {
		args := []string{
			"-p", prompt,
			"--model", string(model),
			"--output-format", "stream-json",
			"--verbose",
			"--include-partial-messages",
			"--permission-mode", string(modePermission(mode)),
			"--tools", "Read,Glob,Grep,Edit,Write,Bash",
			"--allowedTools", strings.Join(workspaceChatAllowedTools, ","),
			"--disallowedTools", strings.Join(workspaceChatDeniedTools, ","),
			"--append-system-prompt",
			"You are the tf9 workspace assistant. Work only inside the current repository. Never access credentials or paths outside it. Use only approved development commands. Explain blocked actions clearly. " +
				"For drift reconciliation: search recent local teammate branches first, then fetch and inspect origin branches when useful. Use read-only git commands (git fetch/log/diff/show/for-each-ref) to identify the branch and commit that explain the deployed state. In review mode, propose the plan first; the user approves by switching to autoApply mode before rebase/cherry-pick/merge. After changing files, you may verify with `tf9 init` and `tf9 plan`; report each run ID, link to `#runs`, and summarize the result. Never run `git push` or `terraform apply`/`terraform destroy` — promoting and applying are the user's responsibility.",
		}
		if sessionID != "" {
			args = append(args, "--resume", sessionID)
		}
		cmd := exec.CommandContext(ctx, claudePath, args...)
		cmd.Dir = root
		cmd.Env = os.Environ()
		stdout, err := cmd.StdoutPipe()
		if err != nil {
			runErr = err
		} else {
			stderr, stderrErr := cmd.StderrPipe()
			if stderrErr != nil {
				runErr = stderrErr
			} else if err := cmd.Start(); err != nil {
				runErr = err
			} else {
				var stderrText strings.Builder
				stderrDone := make(chan struct{})
				go func() {
					_, _ = io.Copy(&stderrText, stderr)
					close(stderrDone)
				}()
				runErr = m.consumeStream(turn, stdout)
				waitErr := cmd.Wait()
				<-stderrDone
				if runErr == nil && waitErr != nil {
					runErr = fmt.Errorf("%s", strings.TrimSpace(stderrText.String()))
					if runErr.Error() == "" {
						runErr = waitErr
					}
				}
			}
		}
	}
	if errors.Is(ctx.Err(), context.Canceled) {
		status = "cancelled"
		turn.append(workspaceChatEvent{Type: "status", Status: status, Message: "Response stopped."})
	} else if runErr != nil {
		status = "failed"
		turn.append(workspaceChatEvent{Type: "error", Message: friendlyClaudeError(runErr)})
	}

	m.mu.Lock()
	state := m.repoStateLocked(turn.Repo)
	response := strings.TrimSpace(turn.response.String())
	if response != "" {
		state.Messages = appendHistory(state.Messages, workspaceChatMessage{
			ID: turn.ID + "-assistant", Role: "assistant", Content: response, CreatedAt: time.Now().UTC(),
		})
	}
	delete(m.activeByRepo, turn.Repo)
	if err := m.saveLocked(); err != nil {
		slog.Warn("workspace chat: save state failed", "repo", turn.Repo, "err", err)
	}
	m.mu.Unlock()

	turn.mu.Lock()
	turn.events = append(turn.events, workspaceChatEvent{Type: "done", Status: status})
	turn.done = true
	turn.mu.Unlock()
}

func modePermission(mode workspaceChatMode) workspaceChatMode {
	if mode == workspaceChatAutoApply {
		return "acceptEdits"
	}
	return "plan"
}

func friendlyClaudeError(err error) string {
	message := strings.TrimSpace(err.Error())
	lower := strings.ToLower(message)
	switch {
	case strings.Contains(lower, "credit"), strings.Contains(lower, "billing"):
		return "Claude usage is unavailable for this account. Check Agent SDK credits or billing."
	case strings.Contains(lower, "auth"), strings.Contains(lower, "login"):
		return "Claude Code authentication failed. Run `claude auth login` and restart tf9."
	case message == "":
		return "Claude Code exited without a response."
	default:
		return message
	}
}

func (m *workspaceChatManager) consumeStream(turn *workspaceChatTurn, reader io.Reader) error {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		var raw map[string]any
		if err := json.Unmarshal(scanner.Bytes(), &raw); err != nil {
			continue
		}
		if sessionID, _ := raw["session_id"].(string); sessionID != "" {
			m.mu.Lock()
			m.repoStateLocked(turn.Repo).SessionID = sessionID
			m.mu.Unlock()
		}
		switch raw["type"] {
		case "stream_event":
			event, _ := raw["event"].(map[string]any)
			delta, _ := event["delta"].(map[string]any)
			if delta["type"] == "text_delta" {
				text, _ := delta["text"].(string)
				if text != "" {
					turn.mu.Lock()
					turn.response.WriteString(text)
					turn.events = append(turn.events, workspaceChatEvent{Type: "delta", Delta: text})
					turn.mu.Unlock()
				}
			}
		case "assistant":
			message, _ := raw["message"].(map[string]any)
			content, _ := message["content"].([]any)
			for _, item := range content {
				block, _ := item.(map[string]any)
				if block["type"] != "tool_use" {
					continue
				}
				tool, _ := block["name"].(string)
				input, _ := block["input"].(map[string]any)
				turn.append(workspaceChatEvent{
					Type: "tool", Tool: tool, Summary: workspaceChatToolSummary(tool, input), Metadata: input,
				})
			}
		case "result":
			if raw["subtype"] != "success" {
				if result, _ := raw["result"].(string); result != "" {
					return errors.New(result)
				}
				return fmt.Errorf("Claude Code returned %v", raw["subtype"])
			}
		}
	}
	return scanner.Err()
}

func workspaceChatToolSummary(tool string, input map[string]any) string {
	for _, key := range []string{"file_path", "path", "command", "pattern"} {
		if value, _ := input[key].(string); value != "" {
			return value
		}
	}
	return tool
}

func (m *workspaceChatManager) cancel(repo string) bool {
	m.mu.RLock()
	turn := m.turns[m.activeByRepo[repo]]
	m.mu.RUnlock()
	if turn == nil || turn.cancel == nil {
		return false
	}
	turn.cancel()
	return true
}

func (m *workspaceChatManager) turn(id, repo string) (*workspaceChatTurn, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	turn, ok := m.turns[id]
	return turn, ok && turn.Repo == repo
}

func handleRepoWorkspaceChat(w http.ResponseWriter, r *http.Request, name, action string, manager *workspaceChatManager) {
	switch action {
	case "":
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		if _, err := workspaceRoot(name); err != nil {
			jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
			return
		}
		available, authError := manager.authStatus(r.Context())
		state, activeTurnID, running := manager.state(name)
		jsonOK(w, map[string]any{
			"available": available, "authError": authError, "mode": state.Mode,
			"model": state.Model, "messages": state.Messages, "running": running, "activeTurnId": activeTurnID,
		})
	case "message":
		if r.Method != http.MethodPost {
			methodNotAllowed(w)
			return
		}
		available, authError := manager.authStatus(r.Context())
		if !available {
			jsonErr(w, "claude_unavailable", authError, http.StatusServiceUnavailable)
			return
		}
		var body struct {
			Message string `json:"message"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonErr(w, "bad_request", "invalid JSON body", http.StatusBadRequest)
			return
		}
		turn, err := manager.start(name, body.Message)
		if err != nil {
			jsonErr(w, "chat_start_failed", err.Error(), http.StatusConflict)
			return
		}
		jsonOK(w, map[string]string{"turnId": turn.ID})
	case "stream":
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		workspaceChatStream(w, r, name, manager)
	case "mode":
		if r.Method != http.MethodPut {
			methodNotAllowed(w)
			return
		}
		var body struct {
			Mode workspaceChatMode `json:"mode"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonErr(w, "bad_request", "invalid JSON body", http.StatusBadRequest)
			return
		}
		if err := manager.setMode(name, body.Mode); err != nil {
			jsonErr(w, "bad_request", err.Error(), http.StatusBadRequest)
			return
		}
		jsonOK(w, map[string]workspaceChatMode{"mode": body.Mode})
	case "model":
		if r.Method != http.MethodPut {
			methodNotAllowed(w)
			return
		}
		var body struct {
			Model workspaceChatModel `json:"model"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonErr(w, "bad_request", "invalid JSON body", http.StatusBadRequest)
			return
		}
		if err := manager.setModel(name, body.Model); err != nil {
			jsonErr(w, "bad_request", err.Error(), http.StatusBadRequest)
			return
		}
		jsonOK(w, map[string]workspaceChatModel{"model": body.Model})
	case "cancel":
		if r.Method != http.MethodPost {
			methodNotAllowed(w)
			return
		}
		if !manager.cancel(name) {
			jsonErr(w, "not_running", "no response is running", http.StatusConflict)
			return
		}
		jsonOK(w, map[string]string{"status": "cancelled"})
	case "reset":
		if r.Method != http.MethodDelete {
			methodNotAllowed(w)
			return
		}
		if err := manager.reset(name); err != nil {
			jsonErr(w, "chat_reset_failed", err.Error(), http.StatusConflict)
			return
		}
		jsonOK(w, map[string]bool{"ok": true})
	default:
		http.NotFound(w, r)
	}
}

func workspaceChatStream(w http.ResponseWriter, r *http.Request, repo string, manager *workspaceChatManager) {
	turn, ok := manager.turn(r.URL.Query().Get("turnId"), repo)
	if !ok {
		jsonErr(w, "not_found", "chat turn not found", http.StatusNotFound)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		jsonErr(w, "unsupported", "streaming not supported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	offset := 0
	ticker := time.NewTicker(100 * time.Millisecond)
	heartbeat := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	defer heartbeat.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-heartbeat.C:
			fmt.Fprint(w, ": heartbeat\n\n")
			flusher.Flush()
		case <-ticker.C:
			events, done := turn.snapshot(offset)
			for _, event := range events {
				data, _ := json.Marshal(event)
				fmt.Fprintf(w, "data: %s\n\n", data)
				offset++
			}
			if len(events) > 0 {
				flusher.Flush()
			}
			if done && len(events) == 0 {
				return
			}
		}
	}
}
