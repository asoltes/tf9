package api

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

const workspaceMaxEditableSize = 2 << 20

type workspaceEntry struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	IsDir    bool   `json:"isDir"`
	Size     int64  `json:"size,omitempty"`
	Modified string `json:"modified,omitempty"`
}

type workspaceFile struct {
	Path     string `json:"path"`
	Content  string `json:"content"`
	Revision string `json:"revision"`
	Size     int64  `json:"size"`
	Language string `json:"language"`
	ReadOnly bool   `json:"readOnly"`
	Binary   bool   `json:"binary"`
}

func handleRepoWorkspace(w http.ResponseWriter, r *http.Request, name, action string) {
	switch action {
	case "tree":
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		workspaceTree(w, r, name)
	case "file":
		switch r.Method {
		case http.MethodGet:
			workspaceReadFile(w, r, name)
		case http.MethodPut:
			workspaceSaveFile(w, r, name)
		default:
			methodNotAllowed(w)
		}
	case "entry":
		switch r.Method {
		case http.MethodPost:
			workspaceCreateEntry(w, r, name)
		case http.MethodPatch:
			workspaceMoveEntry(w, r, name)
		case http.MethodDelete:
			workspaceDeleteEntry(w, r, name)
		default:
			methodNotAllowed(w)
		}
	case "diff":
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		workspaceDiff(w, r, name)
	case "events":
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		workspaceEvents(w, r, name)
	case "terminal":
		workspaceTerminal(w, r, name)
	default:
		http.NotFound(w, r)
	}
}

func workspaceRoot(name string) (string, error) {
	root, err := repoPath(name)
	if err != nil {
		return "", err
	}
	root, err = filepath.Abs(root)
	if err != nil {
		return "", fmt.Errorf("resolve repository path: %w", err)
	}
	return filepath.EvalSymlinks(root)
}

func workspacePath(root, rel string, allowMissing bool) (string, error) {
	rel = filepath.FromSlash(strings.TrimSpace(rel))
	if rel == "" || rel == "." {
		return root, nil
	}
	if filepath.IsAbs(rel) {
		return "", fmt.Errorf("absolute paths are not allowed")
	}
	clean := filepath.Clean(rel)
	if clean == ".git" || strings.HasPrefix(clean, ".git"+string(filepath.Separator)) {
		return "", fmt.Errorf(".git is not accessible")
	}
	candidate := filepath.Join(root, clean)
	parent := candidate
	if allowMissing {
		parent = filepath.Dir(candidate)
	}
	resolved, err := filepath.EvalSymlinks(parent)
	if err != nil {
		return "", err
	}
	if allowMissing {
		resolved = filepath.Join(resolved, filepath.Base(candidate))
	}
	inside, err := filepath.Rel(root, resolved)
	if err != nil || inside == ".." || strings.HasPrefix(inside, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("path escapes repository")
	}
	return resolved, nil
}

func workspaceRevision(data []byte, info os.FileInfo) string {
	h := sha256.New()
	_, _ = h.Write(data)
	_, _ = io.WriteString(h, strconv.FormatInt(info.ModTime().UnixNano(), 10))
	return hex.EncodeToString(h.Sum(nil))
}

func workspaceTree(w http.ResponseWriter, r *http.Request, name string) {
	root, err := workspaceRoot(name)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
		return
	}
	rel := r.URL.Query().Get("path")
	dir, err := workspacePath(root, rel, false)
	if err != nil {
		jsonErr(w, "bad_request", err.Error(), http.StatusBadRequest)
		return
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
		return
	}
	out := make([]workspaceEntry, 0, len(entries))
	for _, entry := range entries {
		if entry.Name() == ".git" {
			continue
		}
		info, infoErr := entry.Info()
		if infoErr != nil {
			slog.Warn("workspace: inspect entry failed", "repo", name, "path", entry.Name(), "err", infoErr)
			continue
		}
		path := filepath.ToSlash(filepath.Join(rel, entry.Name()))
		out = append(out, workspaceEntry{
			Name: entry.Name(), Path: path, IsDir: entry.IsDir(), Size: info.Size(),
			Modified: info.ModTime().UTC().Format(time.RFC3339Nano),
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].IsDir != out[j].IsDir {
			return out[i].IsDir
		}
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	jsonOK(w, map[string]any{"path": filepath.ToSlash(rel), "entries": out})
}

func workspaceReadFile(w http.ResponseWriter, r *http.Request, name string) {
	root, err := workspaceRoot(name)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
		return
	}
	rel := r.URL.Query().Get("path")
	path, err := workspacePath(root, rel, false)
	if err != nil {
		jsonErr(w, "bad_request", err.Error(), http.StatusBadRequest)
		return
	}
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		jsonErr(w, "not_found", "file not found", http.StatusNotFound)
		return
	}
	data := []byte{}
	if info.Size() <= workspaceMaxEditableSize {
		data, err = os.ReadFile(path)
		if err != nil {
			jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
			return
		}
	} else {
		file, openErr := os.Open(path)
		if openErr != nil {
			jsonErr(w, "internal", openErr.Error(), http.StatusInternalServerError)
			return
		}
		sample := make([]byte, 8192)
		n, readErr := file.Read(sample)
		if closeErr := file.Close(); closeErr != nil {
			slog.Debug("workspace: close large file failed", "path", path, "err", closeErr)
		}
		if readErr != nil && !errors.Is(readErr, io.EOF) {
			jsonErr(w, "internal", readErr.Error(), http.StatusInternalServerError)
			return
		}
		data = sample[:n]
	}
	binary := !utf8.Valid(data) || bytesContainNUL(data)
	readOnly := binary || info.Size() > workspaceMaxEditableSize
	content := ""
	if !binary && info.Size() <= workspaceMaxEditableSize {
		content = string(data)
	}
	jsonOK(w, workspaceFile{
		Path: filepath.ToSlash(rel), Content: content, Revision: workspaceRevision(data, info),
		Size: info.Size(), Language: workspaceLanguage(rel), ReadOnly: readOnly, Binary: binary,
	})
}

func bytesContainNUL(data []byte) bool {
	limit := len(data)
	if limit > 8192 {
		limit = 8192
	}
	for _, b := range data[:limit] {
		if b == 0 {
			return true
		}
	}
	return false
}

func workspaceLanguage(path string) string {
	ext := strings.ToLower(filepath.Ext(path))
	if lang := mime.TypeByExtension(ext); strings.HasPrefix(lang, "text/") {
		return strings.TrimPrefix(lang, "text/")
	}
	switch ext {
	case ".tf", ".tfvars":
		return "hcl"
	case ".yaml", ".yml":
		return "yaml"
	case ".json":
		return "json"
	case ".go":
		return "go"
	case ".ts", ".tsx":
		return "typescript"
	case ".js", ".jsx":
		return "javascript"
	case ".md":
		return "markdown"
	case ".sh", ".zsh", ".bash":
		return "shell"
	case ".css":
		return "css"
	case ".html":
		return "html"
	default:
		return "plaintext"
	}
}

func workspaceSaveFile(w http.ResponseWriter, r *http.Request, name string) {
	var body struct {
		Path     string `json:"path"`
		Content  string `json:"content"`
		Revision string `json:"revision"`
		Force    bool   `json:"force"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonErr(w, "bad_request", err.Error(), http.StatusBadRequest)
		return
	}
	root, err := workspaceRoot(name)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
		return
	}
	path, err := workspacePath(root, body.Path, false)
	if err != nil {
		jsonErr(w, "bad_request", err.Error(), http.StatusBadRequest)
		return
	}
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		jsonErr(w, "not_found", "file not found", http.StatusNotFound)
		return
	}
	current, err := os.ReadFile(path)
	if err != nil {
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	if info.Size() > workspaceMaxEditableSize || !utf8.Valid(current) || bytesContainNUL(current) {
		jsonErr(w, "read_only", "binary and files over 2 MiB are read-only", http.StatusUnprocessableEntity)
		return
	}
	if !body.Force && (body.Revision == "" || body.Revision != workspaceRevision(current, info)) {
		jsonErr(w, "revision_conflict", "file changed since it was opened", http.StatusConflict)
		return
	}
	if len(body.Content) > workspaceMaxEditableSize {
		jsonErr(w, "too_large", "file exceeds the 2 MiB editable limit", http.StatusRequestEntityTooLarge)
		return
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".tfops-save-*")
	if err != nil {
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	tmpName := tmp.Name()
	defer func() {
		if rmErr := os.Remove(tmpName); rmErr != nil && !errors.Is(rmErr, os.ErrNotExist) {
			slog.Debug("workspace: remove save temp failed", "path", tmpName, "err", rmErr)
		}
	}()
	if chmodErr := tmp.Chmod(info.Mode().Perm()); chmodErr != nil {
		_ = tmp.Close()
		jsonErr(w, "internal", chmodErr.Error(), http.StatusInternalServerError)
		return
	}
	if _, err := io.WriteString(tmp, body.Content); err != nil {
		_ = tmp.Close()
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	if err := tmp.Close(); err != nil {
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	if err := os.Rename(tmpName, path); err != nil {
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	saved, err := os.Stat(path)
	if err != nil {
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	data := []byte(body.Content)
	jsonOK(w, map[string]string{"revision": workspaceRevision(data, saved)})
}

func workspaceCreateEntry(w http.ResponseWriter, r *http.Request, name string) {
	var body struct {
		Path string `json:"path"`
		Type string `json:"type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonErr(w, "bad_request", err.Error(), http.StatusBadRequest)
		return
	}
	root, err := workspaceRoot(name)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
		return
	}
	path, err := workspacePath(root, body.Path, true)
	if err != nil {
		jsonErr(w, "bad_request", err.Error(), http.StatusBadRequest)
		return
	}
	switch body.Type {
	case "file":
		file, createErr := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
		if createErr == nil {
			createErr = file.Close()
		}
		err = createErr
	case "directory":
		err = os.Mkdir(path, 0o755)
	default:
		jsonErr(w, "bad_request", "type must be file or directory", http.StatusBadRequest)
		return
	}
	if err != nil {
		jsonErr(w, "conflict", err.Error(), http.StatusConflict)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, map[string]string{"path": filepath.ToSlash(body.Path)})
}

func workspaceMoveEntry(w http.ResponseWriter, r *http.Request, name string) {
	var body struct {
		Path        string `json:"path"`
		Destination string `json:"destination"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonErr(w, "bad_request", err.Error(), http.StatusBadRequest)
		return
	}
	root, err := workspaceRoot(name)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
		return
	}
	source, err := workspacePath(root, body.Path, false)
	if err != nil {
		jsonErr(w, "bad_request", err.Error(), http.StatusBadRequest)
		return
	}
	destination, err := workspacePath(root, body.Destination, true)
	if err != nil {
		jsonErr(w, "bad_request", err.Error(), http.StatusBadRequest)
		return
	}
	if err := os.Rename(source, destination); err != nil {
		jsonErr(w, "conflict", err.Error(), http.StatusConflict)
		return
	}
	jsonOK(w, map[string]string{"path": filepath.ToSlash(body.Destination)})
}

func workspaceDeleteEntry(w http.ResponseWriter, r *http.Request, name string) {
	root, err := workspaceRoot(name)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
		return
	}
	rel := r.URL.Query().Get("path")
	path, err := workspacePath(root, rel, false)
	if err != nil {
		jsonErr(w, "bad_request", err.Error(), http.StatusBadRequest)
		return
	}
	if path == root {
		jsonErr(w, "bad_request", "repository root cannot be deleted", http.StatusBadRequest)
		return
	}
	if err := os.RemoveAll(path); err != nil {
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]bool{"ok": true})
}

func workspaceDiff(w http.ResponseWriter, r *http.Request, name string) {
	root, err := workspaceRoot(name)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
		return
	}
	rel := r.URL.Query().Get("path")
	if _, err := workspacePath(root, rel, false); err != nil {
		jsonErr(w, "bad_request", err.Error(), http.StatusBadRequest)
		return
	}
	args := []string{"-C", root, "diff", "--no-ext-diff", "HEAD", "--"}
	if rel != "" {
		args = append(args, rel)
	}
	out, err := exec.CommandContext(r.Context(), "git", args...).CombinedOutput()
	if err != nil {
		args = []string{"-C", root, "diff", "--no-ext-diff", "--"}
		if rel != "" {
			args = append(args, rel)
		}
		out, err = exec.CommandContext(r.Context(), "git", args...).CombinedOutput()
		if err != nil {
			jsonErr(w, "diff_failed", strings.TrimSpace(string(out)), http.StatusUnprocessableEntity)
			return
		}
	}
	if len(out) == 0 && rel != "" {
		status := exec.CommandContext(r.Context(), "git", "-C", root, "status", "--porcelain=v1", "--", rel)
		statusOut, statusErr := status.Output()
		if statusErr == nil && strings.HasPrefix(string(statusOut), "??") {
			cmd := exec.CommandContext(r.Context(), "git", "-C", root, "diff", "--no-index", "--no-ext-diff", os.DevNull, rel)
			untracked, diffErr := cmd.CombinedOutput()
			var exitErr *exec.ExitError
			if diffErr == nil || (errors.As(diffErr, &exitErr) && exitErr.ExitCode() == 1) {
				out = untracked
			}
		}
	}
	jsonOK(w, map[string]string{"diff": string(out)})
}

func workspaceSnapshot(root string) string {
	h := sha256.New()
	_ = filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		rel, relErr := filepath.Rel(root, path)
		if relErr != nil {
			return nil
		}
		if entry.IsDir() && entry.Name() == ".git" {
			return filepath.SkipDir
		}
		info, infoErr := entry.Info()
		if infoErr == nil {
			_, _ = fmt.Fprintf(h, "%s:%d:%d;", filepath.ToSlash(rel), info.Size(), info.ModTime().UnixNano())
		}
		return nil
	})
	cmd := exec.Command("git", "-C", root, "status", "--porcelain=v1", "--branch")
	if out, err := cmd.Output(); err == nil {
		_, _ = h.Write(out)
	}
	return hex.EncodeToString(h.Sum(nil))
}

func workspaceEvents(w http.ResponseWriter, r *http.Request, name string) {
	root, err := workspaceRoot(name)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
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
	ticker := time.NewTicker(750 * time.Millisecond)
	heartbeat := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	defer heartbeat.Stop()
	last := workspaceSnapshot(root)
	fmt.Fprintf(w, "event: ready\ndata: %s\n\n", last)
	flusher.Flush()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-heartbeat.C:
			fmt.Fprint(w, ": heartbeat\n\n")
			flusher.Flush()
		case <-ticker.C:
			next := workspaceSnapshot(root)
			if next != last {
				last = next
				fmt.Fprintf(w, "event: change\ndata: %s\n\n", next)
				flusher.Flush()
			}
		}
	}
}

var workspaceUpgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}
		parsed, err := url.Parse(origin)
		if err != nil {
			return false
		}
		if parsed.Host == r.Host {
			return true
		}
		originHost, _, originErr := net.SplitHostPort(parsed.Host)
		requestHost, _, requestErr := net.SplitHostPort(r.Host)
		return originErr == nil && requestErr == nil &&
			isLoopbackHost(originHost) && isLoopbackHost(requestHost)
	},
}

func isLoopbackHost(host string) bool {
	return host == "localhost" || net.ParseIP(host).IsLoopback()
}

func workspaceTerminal(w http.ResponseWriter, r *http.Request, name string) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	root, err := workspaceRoot(name)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
		return
	}
	terminalDir, err := workspacePath(root, r.URL.Query().Get("path"), false)
	if err != nil {
		jsonErr(w, "invalid_path", err.Error(), http.StatusBadRequest)
		return
	}
	info, err := os.Stat(terminalDir)
	if err != nil {
		jsonErr(w, "not_found", "terminal directory not found", http.StatusNotFound)
		return
	}
	if !info.IsDir() {
		jsonErr(w, "invalid_path", "terminal path must be a directory", http.StatusBadRequest)
		return
	}
	conn, err := workspaceUpgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Warn("workspace: websocket upgrade failed", "repo", name, "err", err)
		return
	}
	defer conn.Close()

	shell := os.Getenv("SHELL")
	if shell == "" {
		if runtime.GOOS == "windows" {
			shell = "cmd.exe"
		} else {
			shell = "/bin/sh"
		}
	}
	cmd := exec.CommandContext(r.Context(), shell)
	cmd.Dir = terminalDir
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")
	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Rows: 24, Cols: 80})
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"error","message":"could not start shell"}`))
		slog.Warn("workspace: start shell failed", "repo", name, "shell", shell, "err", err)
		return
	}
	defer func() {
		_ = ptmx.Close()
		if cmd.Process != nil {
			if killErr := killProcessGroup(cmd.Process); killErr != nil && !errors.Is(killErr, os.ErrProcessDone) {
				slog.Debug("workspace: kill terminal process failed", "repo", name, "err", killErr)
			}
		}
		if waitErr := cmd.Wait(); waitErr != nil {
			slog.Debug("workspace: terminal exited", "repo", name, "err", waitErr)
		}
	}()

	var writeMu sync.Mutex
	done := make(chan struct{})
	go func() {
		defer close(done)
		buf := make([]byte, 32*1024)
		for {
			n, readErr := ptmx.Read(buf)
			if n > 0 {
				writeMu.Lock()
				writeErr := conn.WriteMessage(websocket.BinaryMessage, buf[:n])
				writeMu.Unlock()
				if writeErr != nil {
					return
				}
			}
			if readErr != nil {
				return
			}
		}
	}()

	for {
		messageType, data, readErr := conn.ReadMessage()
		if readErr != nil {
			return
		}
		if messageType == websocket.BinaryMessage {
			if _, err := ptmx.Write(data); err != nil {
				return
			}
			continue
		}
		var msg struct {
			Type string `json:"type"`
			Cols uint16 `json:"cols"`
			Rows uint16 `json:"rows"`
		}
		if json.Unmarshal(data, &msg) == nil && msg.Type == "resize" && msg.Cols > 0 && msg.Rows > 0 {
			if err := pty.Setsize(ptmx, &pty.Winsize{Cols: msg.Cols, Rows: msg.Rows}); err != nil {
				slog.Debug("workspace: resize terminal failed", "repo", name, "err", err)
			}
		}
		select {
		case <-done:
			return
		default:
		}
	}
}
