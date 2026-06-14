package api

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/andres/tf9/internal/applog"
	"github.com/andres/tf9/internal/aws"
	"github.com/andres/tf9/internal/config"
	"github.com/andres/tf9/internal/cost"
	"github.com/andres/tf9/internal/git"
	graphdata "github.com/andres/tf9/internal/graph"
	"github.com/andres/tf9/internal/report"
)

// safeJoin ensures the resolved path stays within root. Returns an error if unsafe.
func safeJoin(root, sub string) (string, error) {
	if sub == "" || sub == "." {
		return root, nil
	}
	joined := filepath.Join(root, filepath.Clean("/"+sub))
	rel, err := filepath.Rel(root, joined)
	if err != nil || strings.HasPrefix(rel, "..") {
		return "", fmt.Errorf("invalid path")
	}
	return joined, nil
}

// Handler returns an http.Handler for all /api/* routes.
func Handler(mgr *RunManager, reportDir string) http.Handler {
	mux := http.NewServeMux()
	chatManager := newWorkspaceChatManager()

	// Runs
	mux.HandleFunc("/api/web/settings", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		cfg, err := config.Load()
		if err != nil {
			jsonErr(w, "config", err.Error(), http.StatusInternalServerError)
			return
		}
		jsonOK(w, map[string]any{
			"savedPlanApply":             cfg.Web.SavedPlanApply,
			"approvalTimeoutSeconds":     int(cfg.Web.ApprovalTimeout() / time.Second),
			"reviewedPlanTimeoutSeconds": int(cfg.Web.ReviewedPlanTimeout() / time.Second),
			"ticketingUrl":               cfg.Web.TicketingURL,
		})
	})
	mux.HandleFunc("/api/runs", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			startRun(w, r, mgr, reportDir)
		case http.MethodGet:
			listRuns(w, r, mgr)
		default:
			methodNotAllowed(w)
		}
	})
	mux.HandleFunc("/api/runs/", func(w http.ResponseWriter, r *http.Request) {
		parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/runs/"), "/")
		id := parts[0]
		if len(parts) == 2 && parts[1] == "stream" {
			streamRun(w, r, mgr, id)
			return
		}
		if len(parts) == 2 && parts[1] == "input" && r.Method == http.MethodPost {
			sendRunInput(w, r, mgr, id)
			return
		}
		if len(parts) == 2 && parts[1] == "kill" && r.Method == http.MethodPost {
			forceKillRun(w, r, mgr, id)
			return
		}
		if len(parts) == 2 && parts[1] == "graph" && r.Method == http.MethodGet {
			getRunGraph(w, r, mgr, id)
			return
		}
		switch r.Method {
		case http.MethodGet:
			getRun(w, r, mgr, id)
		case http.MethodDelete:
			cancelRun(w, r, mgr, id)
		default:
			methodNotAllowed(w)
		}
	})

	// Repos
	mux.HandleFunc("/api/repos", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			listRepos(w, r)
		case http.MethodPost:
			addRepo(w, r)
		default:
			methodNotAllowed(w)
		}
	})
	mux.HandleFunc("/api/repos/", func(w http.ResponseWriter, r *http.Request) {
		tail := strings.TrimPrefix(r.URL.Path, "/api/repos/")
		parts := strings.SplitN(tail, "/", 2)
		name := parts[0]
		sub := ""
		if len(parts) == 2 {
			sub = parts[1]
		}
		if sub == "workspace" || strings.HasPrefix(sub, "workspace/") {
			action := strings.TrimPrefix(sub, "workspace")
			handleRepoWorkspace(w, r, name, strings.TrimPrefix(action, "/"), chatManager)
			return
		}
		switch sub {
		case "browse":
			browseRepo(w, r, name)
		case "branches":
			if r.Method != http.MethodGet {
				methodNotAllowed(w)
				return
			}
			listRepoBranches(w, r, name)
		case "commits":
			if r.Method != http.MethodGet {
				methodNotAllowed(w)
				return
			}
			listRepoCommits(w, r, name)
		case "commit":
			if r.Method != http.MethodGet {
				methodNotAllowed(w)
				return
			}
			getRepoCommit(w, r, name)
		case "rebase":
			if r.Method != http.MethodPost {
				methodNotAllowed(w)
				return
			}
			rebaseRepo(w, r, name)
		case "cherry-pick":
			if r.Method != http.MethodPost {
				methodNotAllowed(w)
				return
			}
			cherryPickRepo(w, r, name)
		case "merge":
			if r.Method != http.MethodPost {
				methodNotAllowed(w)
				return
			}
			mergeRepo(w, r, name)
		case "checkout":
			if r.Method != http.MethodPost {
				methodNotAllowed(w)
				return
			}
			checkoutRepo(w, r, name)
		case "status":
			if r.Method != http.MethodGet {
				methodNotAllowed(w)
				return
			}
			repoStatus(w, r, name)
		case "pull":
			if r.Method != http.MethodPost {
				methodNotAllowed(w)
				return
			}
			pullRepo(w, r, name)
		case "reconcile":
			if r.Method != http.MethodGet {
				methodNotAllowed(w)
				return
			}
			reconcileStatus(w, r, name)
		case "promote":
			if r.Method != http.MethodPost {
				methodNotAllowed(w)
				return
			}
			promoteRepo(w, r, name)
		case "active-branches":
			if r.Method != http.MethodGet {
				methodNotAllowed(w)
				return
			}
			listActiveBranches(w, r, name)
		case "config":
			switch r.Method {
			case http.MethodGet:
				getRepoConfig(w, r, name)
			case http.MethodPut:
				saveRepoConfig(w, r, name)
			default:
				methodNotAllowed(w)
			}
		default:
			if r.Method == http.MethodDelete {
				removeRepo(w, r, name)
			} else if r.Method == http.MethodPatch {
				updateRepo(w, r, name)
			} else {
				methodNotAllowed(w)
			}
		}
	})

	// Shared YAML configuration
	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			getConfigSource(w)
		case http.MethodPut:
			saveConfigSource(w, r)
		default:
			methodNotAllowed(w)
		}
	})
	mux.HandleFunc("/api/config/format", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			methodNotAllowed(w)
			return
		}
		formatConfigSource(w, r)
	})

	// Profile mappings
	mux.HandleFunc("/api/profile-mappings", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			getProfileMappings(w)
		case http.MethodPut:
			saveProfileMappings(w, r)
		default:
			methodNotAllowed(w)
		}
	})

	// AWS profiles
	mux.HandleFunc("/api/aws/profiles", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		jsonOK(w, listAWSProfiles())
	})

	// AWS profile details (region + account_id parsed from ~/.aws/config)
	mux.HandleFunc("/api/aws/profile-details", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		jsonOK(w, parseAWSProfileDetails())
	})

	// AWS STS identity
	mux.HandleFunc("/api/aws/identity", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		profile := r.URL.Query().Get("profile")
		if profile == "" {
			if cfg, err := config.Load(); err == nil {
				profile = cfg.StsProfile
			}
		}
		id, err := aws.GetIdentity(r.Context(), profile)
		if err != nil {
			// Client navigated away / refreshed mid-request: the subprocess is
			// killed and r.Context() is cancelled. That's not a server fault, so
			// don't emit a loud 5xx error line — the client is already gone.
			if r.Context().Err() != nil {
				slog.Debug("identity request cancelled by client", "profile", profile, "err", err)
				return
			}
			jsonErr(w, "aws_identity_failed", err.Error(), http.StatusBadGateway)
			return
		}
		jsonOK(w, struct {
			Account string `json:"account"`
			Arn     string `json:"arn"`
			UserID  string `json:"userId"`
			Profile string `json:"profile"`
		}{id.Account, id.Arn, id.UserID, profile})
	})

	// AWS SSO login — streams `aws sso login` output as SSE so the frontend
	// can show progress and the browser URL when no browser is available.
	mux.HandleFunc("/api/aws/sso-login", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		profile := r.URL.Query().Get("profile")
		if profile == "" {
			if cfg, err := config.Load(); err == nil {
				profile = cfg.StsProfile
			}
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("X-Accel-Buffering", "no")
		flusher, canFlush := w.(http.Flusher)

		sendLine := func(line string) {
			// Escape newlines so the SSE data field stays on one line.
			line = strings.ReplaceAll(line, "\n", "\\n")
			fmt.Fprintf(w, "data: %s\n\n", line)
			if canFlush {
				flusher.Flush()
			}
		}
		sendDone := func(success bool, msg string) {
			if success {
				fmt.Fprintf(w, "event: done\ndata: ok\n\n")
			} else {
				fmt.Fprintf(w, "event: done\ndata: error: %s\n\n", strings.ReplaceAll(msg, "\n", " "))
			}
			if canFlush {
				flusher.Flush()
			}
		}

		args := []string{"sso", "login"}
		if profile != "" {
			args = append(args, "--profile", profile)
		}
		cmd := exec.CommandContext(r.Context(), "aws", args...)
		cmd.Env = os.Environ()

		pr, pw, err := os.Pipe()
		if err != nil {
			sendLine("error: could not create pipe: " + err.Error())
			sendDone(false, err.Error())
			return
		}
		cmd.Stdout = pw
		cmd.Stderr = pw

		if err := cmd.Start(); err != nil {
			pw.Close()
			pr.Close()
			sendLine("error: could not start aws sso login: " + err.Error())
			sendDone(false, err.Error())
			return
		}
		pw.Close() // parent doesn't write

		done := make(chan error, 1)
		go func() { done <- cmd.Wait() }()

		buf := make([]byte, 256)
		lineBuf := ""
		for {
			n, readErr := pr.Read(buf)
			if n > 0 {
				lineBuf += string(buf[:n])
				for {
					idx := strings.IndexAny(lineBuf, "\n\r")
					if idx < 0 {
						break
					}
					line := strings.TrimRight(lineBuf[:idx], "\r")
					lineBuf = lineBuf[idx+1:]
					if line != "" {
						sendLine(line)
						// When aws sso login cannot open the browser itself (e.g. WSL2 /
						// headless servers), it prints the authorization URL to stdout.
						// Emit a separate `url` SSE event so the frontend can open it.
						trimmed := strings.TrimSpace(line)
						if strings.HasPrefix(trimmed, "https://") {
							fmt.Fprintf(w, "event: url\ndata: %s\n\n", trimmed)
							if canFlush {
								flusher.Flush()
							}
						}
					}
				}
			}
			if readErr != nil {
				break
			}
		}
		pr.Close()
		if lineBuf != "" {
			sendLine(lineBuf)
		}

		runErr := <-done
		if runErr != nil {
			sendDone(false, runErr.Error())
		} else {
			aws.InvalidateIdentityCache(profile)
			sendDone(true, "")
		}
	})

	// AWS SSO logout — runs `aws sso logout` and returns {"ok":true} or an error.
	mux.HandleFunc("/api/aws/sso-logout", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			methodNotAllowed(w)
			return
		}
		profile := r.URL.Query().Get("profile")
		args := []string{"sso", "logout"}
		if profile != "" {
			args = append(args, "--profile", profile)
		}
		cmd := exec.CommandContext(r.Context(), "aws", args...)
		cmd.Env = os.Environ()
		out, err := cmd.CombinedOutput()
		if err != nil {
			msg := strings.TrimSpace(string(out))
			if msg == "" {
				msg = err.Error()
			}
			jsonErr(w, "logout_failed", msg, http.StatusInternalServerError)
			return
		}
		aws.InvalidateIdentityCache(profile)
		jsonOK(w, map[string]bool{"ok": true})
	})

	// Reports list + individual report data
	mux.HandleFunc("/api/reports", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			listReports(w, r, reportDir)
		case http.MethodDelete:
			deleteReport(w, r, reportDir)
		default:
			methodNotAllowed(w)
		}
	})
	mux.HandleFunc("/api/reports/", func(w http.ResponseWriter, r *http.Request) {
		sub := strings.TrimPrefix(r.URL.Path, "/api/reports/")
		if r.Method == http.MethodGet && strings.HasSuffix(sub, "/data") {
			getReportData(w, r, reportDir, strings.TrimSuffix(sub, "/data"))
			return
		}
		if r.Method == http.MethodGet && strings.HasSuffix(sub, "/raw") {
			downloadReport(w, r, reportDir, strings.TrimSuffix(sub, "/raw"))
			return
		}
		methodNotAllowed(w)
	})

	// Infracost cost-estimation settings (token never returned to the client).
	mux.HandleFunc("/api/infracost/settings", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			getInfracostSettings(w, r)
		case http.MethodPut:
			putInfracostSettings(w, r)
		default:
			methodNotAllowed(w)
		}
	})

	// Aggregate cost data across saved reports for the Cost dashboard.
	mux.HandleFunc("/api/cost/summary", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		costSummary(w, r, reportDir)
	})

	// Infracost breakdown scans across configured repo targets (Breakdown/Diff
	// dashboards). POST runs a new scan; GET returns the latest scan + diff.
	mux.HandleFunc("/api/cost/scan", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			runCostScan(w, r)
		case http.MethodGet:
			getCostScan(w, r)
		default:
			methodNotAllowed(w)
		}
	})

	// Saved scan history (timestamps + totals) for the trend chart.
	mux.HandleFunc("/api/cost/scans", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		listCostScans(w, r)
	})

	// Shareable cost report download: ?format=html|text from the latest scan.
	mux.HandleFunc("/api/cost/report", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		downloadCostReport(w, r)
	})

	// Application logs — recent lines + current level.
	mux.HandleFunc("/api/logs", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		n := 500
		if v := r.URL.Query().Get("limit"); v != "" {
			if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 {
				n = parsed
			}
		}
		jsonOK(w, struct {
			Level string   `json:"level"`
			Lines []string `json:"lines"`
		}{applog.LevelString(), applog.Tail(n)})
	})

	// Change the active log level and persist it to config.yaml.
	mux.HandleFunc("/api/logs/level", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			methodNotAllowed(w)
			return
		}
		var body struct {
			Level string `json:"level"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonErr(w, "bad_request", "invalid JSON body", http.StatusBadRequest)
			return
		}
		if !applog.SetLevel(body.Level) {
			jsonErr(w, "bad_request", "invalid level (expected debug, info, warn, or error)", http.StatusBadRequest)
			return
		}
		if err := config.SetLogLevel(strings.ToLower(strings.TrimSpace(body.Level))); err != nil {
			jsonErr(w, "config_save_failed", err.Error(), http.StatusInternalServerError)
			return
		}
		jsonOK(w, struct {
			Level string `json:"level"`
		}{applog.LevelString()})
	})

	return logRequests(mux)
}

// statusRecorder wraps http.ResponseWriter to capture the status code while
// preserving http.Flusher so SSE streaming endpoints keep working.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Flush() {
	if fl, ok := s.ResponseWriter.(http.Flusher); ok {
		fl.Flush()
	}
}

func (s *statusRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := s.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, fmt.Errorf("response writer does not support hijacking")
	}
	s.status = http.StatusSwitchingProtocols
	return hijacker.Hijack()
}

func (s *statusRecorder) Unwrap() http.ResponseWriter {
	return s.ResponseWriter
}

// isStreamPath reports whether a path is a long-lived SSE endpoint, which is
// logged at DEBUG to avoid noise (duration is the whole stream lifetime).
func isStreamPath(path string) bool {
	return strings.HasSuffix(path, "/stream") ||
		strings.HasSuffix(path, "/sso-login") ||
		strings.HasSuffix(path, "/events") ||
		strings.HasSuffix(path, "/terminal")
}

// logRequests logs every API request with method, path, status, and duration.
// The duration field is the key signal for diagnosing hangs — a stalled request
// either never logs a completion line or logs a multi-second duration.
func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		elapsed := time.Since(start)
		level := slog.LevelInfo
		if isStreamPath(r.URL.Path) {
			level = slog.LevelDebug
		}
		slog.Log(r.Context(), level, "request",
			"method", r.Method, "path", r.URL.Path, "status", rec.status, "elapsed", elapsed)
	})
}

// ── helpers ─────────────────────────────────────────────────────────────────

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func jsonErr(w http.ResponseWriter, code string, msg string, status int) {
	// Central log for every API error response: 5xx is a server fault (Error),
	// 4xx is a client/usage problem (Warn). Correlates by timestamp with the
	// request-middleware line that carries method/path.
	if status >= http.StatusInternalServerError {
		slog.Error("api error", "code", code, "status", status, "msg", msg)
	} else if status >= http.StatusBadRequest {
		slog.Warn("api error", "code", code, "status", status, "msg", msg)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]string{"code": code, "message": msg},
	})
}

func methodNotAllowed(w http.ResponseWriter) {
	jsonErr(w, "method_not_allowed", "method not allowed", http.StatusMethodNotAllowed)
}

func getConfigSource(w http.ResponseWriter) {
	path, content, revision, err := config.ReadRaw()
	if err != nil {
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]string{
		"path":     path,
		"content":  content,
		"revision": revision,
	})
}

func saveConfigSource(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Content  string `json:"content"`
		Revision string `json:"revision"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonErr(w, "bad_request", "invalid request: "+err.Error(), http.StatusBadRequest)
		return
	}
	revision, err := config.WriteRaw(body.Content, body.Revision)
	if errors.Is(err, config.ErrRevisionConflict) {
		jsonErr(w, "revision_conflict", err.Error(), http.StatusConflict)
		return
	}
	if err != nil {
		jsonErr(w, "invalid_config", err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, map[string]string{"revision": revision})
}

func formatConfigSource(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonErr(w, "bad_request", "invalid request: "+err.Error(), http.StatusBadRequest)
		return
	}
	content, err := config.FormatRaw(body.Content)
	if err != nil {
		jsonErr(w, "invalid_yaml", err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, map[string]string{"content": content})
}

// paginated is the standard envelope for list endpoints.
type paginated struct {
	Items any `json:"items"`
	Page  int `json:"page"`
	Limit int `json:"limit"`
	Total int `json:"total"`
}

const (
	defaultPage  = 1
	defaultLimit = 50
	maxLimit     = 500
)

// parsePage reads page/limit query params, applying sane defaults and bounds.
func parsePage(r *http.Request) (page, limit int) {
	page, limit = defaultPage, defaultLimit
	if v := r.URL.Query().Get("page"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			page = n
		}
	}
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	if limit > maxLimit {
		limit = maxLimit
	}
	return page, limit
}

// paginate returns the page-th slice of items (1-indexed) and the total count.
func paginate[T any](items []T, page, limit int) ([]T, int) {
	total := len(items)
	start := (page - 1) * limit
	if start < 0 || start >= total {
		return []T{}, total
	}
	end := start + limit
	if end > total {
		end = total
	}
	return items[start:end], total
}

// ── runs ────────────────────────────────────────────────────────────────────

func startRun(w http.ResponseWriter, r *http.Request, mgr *RunManager, reportDir string) {
	var req RunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, "bad_request", "invalid request: "+err.Error(), http.StatusBadRequest)
		return
	}
	if req.Command == "" {
		jsonErr(w, "bad_request", "command is required", http.StatusBadRequest)
		return
	}
	resourceAddresses, err := validateResourceAddresses(req.Command, req.ResourceAddresses)
	if err != nil {
		jsonErr(w, "bad_request", err.Error(), http.StatusBadRequest)
		return
	}
	req.ResourceAddresses = resourceAddresses
	req.Ticket = strings.TrimSpace(req.Ticket)
	if len(req.Ticket) > 128 || strings.ContainsAny(req.Ticket, "\r\n\t") {
		jsonErr(w, "bad_request", "ticket must be 128 characters or fewer and contain no control characters", http.StatusBadRequest)
		return
	}
	cfg, err := config.Load()
	if err != nil {
		jsonErr(w, "config", err.Error(), http.StatusInternalServerError)
		return
	}
	if cfg.Web.SavedPlanApply {
		if req.Command == "auto" {
			jsonErr(w, "bad_request", "auto is disabled while web.saved_plan_apply is enabled; run and review a plan first", http.StatusBadRequest)
			return
		}
		if req.Command == "apply" {
			req, err = mgr.PrepareReviewedApply(req)
			if err != nil {
				jsonErr(w, "bad_request", err.Error(), http.StatusBadRequest)
				return
			}
		}
	}

	searchRoot, repoLabel, err := resolveSearchRoot(req.Repo)
	if err != nil {
		jsonErr(w, "bad_request", err.Error(), http.StatusBadRequest)
		return
	}
	if req.Repo != "" {
		rc, cfgErr := config.LoadRepoConfig(req.Repo)
		if cfgErr != nil {
			jsonErr(w, "bad_request", cfgErr.Error(), http.StatusBadRequest)
			return
		}
		if len(rc.Targets) == 0 {
			jsonErr(w, "bad_request", "repository has no configured targets", http.StatusBadRequest)
			return
		}
	}

	run, err := mgr.Start(req, searchRoot, repoLabel, reportDir, cfg.Web)
	if err != nil {
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, map[string]string{"id": run.ID})
}

func validateResourceAddresses(command string, addresses []string) ([]string, error) {
	normalized := make([]string, 0, len(addresses))
	for _, address := range addresses {
		address = strings.TrimSpace(address)
		if address == "" {
			continue
		}
		if strings.ContainsAny(address, "\r\n\t") {
			return nil, fmt.Errorf("resource addresses must not contain control characters")
		}
		normalized = append(normalized, address)
	}
	switch command {
	case "taint", "untaint":
		if len(normalized) != 1 {
			return nil, fmt.Errorf("%s requires exactly one resource address", command)
		}
	case "plan", "apply":
	default:
		if len(normalized) > 0 {
			return nil, fmt.Errorf("resource addresses are not supported for %s", command)
		}
	}
	return normalized, nil
}

// resolveTargetDirs returns the ordered list of target labels for a run.
// These labels match the ENV: field emitted by the runner in section banners,
// so the frontend can map streamed output back to the correct dot/status.
// PromotionOrder takes precedence over EnvFilter.
func resolveTargetDirs(req RunRequest) []string {
	if len(req.PromotionOrder) > 0 {
		return req.PromotionOrder
	}
	var names []string
	for _, part := range strings.Split(req.EnvFilter, ",") {
		part = strings.TrimSpace(part)
		if part != "" {
			names = append(names, part)
		}
	}
	return names
}

// parseRunFilter builds the optional run-list predicate from `from`/`to`
// (RFC3339, inclusive boundaries), repeated `command`/`status` parameters,
// and a case-insensitive ticket substring.
// Returns nil when no filter parameters are present (legacy behavior) and an
// error for malformed values, which the caller maps to a 400 response.
func parseRunFilter(r *http.Request) (func(*Run) bool, error) {
	q := r.URL.Query()
	var from, to *time.Time
	if v := q.Get("from"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return nil, fmt.Errorf("invalid 'from' timestamp %q: must be RFC3339", v)
		}
		from = &t
	}
	if v := q.Get("to"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return nil, fmt.Errorf("invalid 'to' timestamp %q: must be RFC3339", v)
		}
		to = &t
	}
	if from != nil && to != nil && to.Before(*from) {
		return nil, fmt.Errorf("'to' timestamp is before 'from'")
	}
	var commands map[string]bool
	if vals := q["command"]; len(vals) > 0 {
		commands = make(map[string]bool, len(vals))
		for _, v := range vals {
			commands[v] = true
		}
	}
	validStatuses := map[RunStatus]bool{
		StatusRunning: true, StatusSuccess: true, StatusPartialSuccess: true, StatusFailed: true,
		StatusDenied: true, StatusCancelled: true,
	}
	var statuses map[RunStatus]bool
	if vals := q["status"]; len(vals) > 0 {
		statuses = make(map[RunStatus]bool, len(vals))
		for _, v := range vals {
			status := RunStatus(v)
			if !validStatuses[status] {
				return nil, fmt.Errorf("invalid run status %q", v)
			}
			statuses[status] = true
		}
	}
	ticket := strings.ToLower(strings.TrimSpace(q.Get("ticket")))
	if from == nil && to == nil && commands == nil && statuses == nil && ticket == "" {
		return nil, nil
	}
	return func(run *Run) bool {
		if commands != nil && !commands[run.Request.Command] {
			return false
		}
		if statuses != nil && !statuses[run.Status] {
			return false
		}
		if from != nil && run.StartedAt.Before(*from) {
			return false
		}
		if to != nil && run.StartedAt.After(*to) {
			return false
		}
		if ticket != "" && !strings.Contains(strings.ToLower(run.Request.Ticket), ticket) {
			return false
		}
		return true
	}, nil
}

func listRuns(w http.ResponseWriter, r *http.Request, mgr *RunManager) {
	type runSummary struct {
		ID                 string     `json:"id"`
		Status             RunStatus  `json:"status"`
		Command            string     `json:"command"`
		EnvFilter          string     `json:"envFilter"`
		Repo               string     `json:"repo"`
		GitBranch          string     `json:"gitBranch,omitempty"`
		StartedAt          time.Time  `json:"startedAt"`
		FinishedAt         *time.Time `json:"finishedAt,omitempty"`
		TargetDirs         []string   `json:"targetDirs"`
		Request            RunRequest `json:"request"`
		Add                int        `json:"add"`
		Change             int        `json:"change"`
		Destroy            int        `json:"destroy"`
		SavedPlanReady     bool       `json:"savedPlanReady,omitempty"`
		SavedPlanExpiresAt *time.Time `json:"savedPlanExpiresAt,omitempty"`
		HasGraph           bool       `json:"hasGraph,omitempty"`
	}
	match, err := parseRunFilter(r)
	if err != nil {
		jsonErr(w, "bad_request", err.Error(), http.StatusBadRequest)
		return
	}
	page, limit := parsePage(r)
	runs, total := mgr.ListFiltered(page, limit, match)
	out := make([]runSummary, len(runs))
	for i, run := range runs {
		run.mu.RLock()
		var add, change, destroy int
		for _, res := range run.Results {
			add += res.Add
			change += res.Change
			destroy += res.Destroy
		}
		out[i] = runSummary{
			ID:                 run.ID,
			Status:             run.Status,
			Command:            run.Request.Command,
			EnvFilter:          run.Request.EnvFilter,
			Repo:               run.Request.Repo,
			GitBranch:          run.GitBranch,
			StartedAt:          run.StartedAt,
			FinishedAt:         run.FinishedAt,
			TargetDirs:         resolveTargetDirs(run.Request),
			Request:            run.Request,
			Add:                add,
			Change:             change,
			Destroy:            destroy,
			SavedPlanReady:     run.SavedPlanReady,
			SavedPlanExpiresAt: run.SavedPlanExpiresAt,
			HasGraph:           graphExists(run.ID),
		}
		run.mu.RUnlock()
	}
	jsonOK(w, paginated{Items: out, Page: page, Limit: limit, Total: total})
}

func getRun(w http.ResponseWriter, _ *http.Request, mgr *RunManager, id string) {
	run, ok := mgr.Get(id)
	if !ok {
		jsonErr(w, "not_found", "run not found", http.StatusNotFound)
		return
	}
	run.mu.RLock()
	resp := struct {
		ID                 string             `json:"id"`
		StartedAt          time.Time          `json:"startedAt"`
		FinishedAt         *time.Time         `json:"finishedAt,omitempty"`
		Status             RunStatus          `json:"status"`
		Request            RunRequest         `json:"request"`
		ReportPath         string             `json:"reportPath,omitempty"`
		Results            []report.EnvResult `json:"results,omitempty"`
		GitBranch          string             `json:"gitBranch,omitempty"`
		TargetDirs         []string           `json:"targetDirs"`
		Lines              []string           `json:"lines"`
		SavedPlanReady     bool               `json:"savedPlanReady,omitempty"`
		SavedPlanExpiresAt *time.Time         `json:"savedPlanExpiresAt,omitempty"`
		AwaitingInput      bool               `json:"awaitingInput"`
		ApprovalExpiresAt  *time.Time         `json:"approvalExpiresAt,omitempty"`
		HasGraph           bool               `json:"hasGraph,omitempty"`
	}{
		ID:                 run.ID,
		StartedAt:          run.StartedAt,
		FinishedAt:         run.FinishedAt,
		Status:             run.Status,
		Request:            run.Request,
		ReportPath:         run.ReportPath,
		Results:            run.Results,
		GitBranch:          run.GitBranch,
		TargetDirs:         resolveTargetDirs(run.Request),
		Lines:              run.lines,
		SavedPlanReady:     run.SavedPlanReady,
		SavedPlanExpiresAt: run.SavedPlanExpiresAt,
		AwaitingInput:      run.AwaitingInput,
		ApprovalExpiresAt:  run.ApprovalExpiresAt,
		HasGraph:           graphExists(run.ID),
	}
	run.mu.RUnlock()
	jsonOK(w, resp)
}

func getRunGraph(w http.ResponseWriter, _ *http.Request, mgr *RunManager, id string) {
	run, ok := mgr.Get(id)
	if !ok {
		jsonErr(w, "not_found", "run not found", http.StatusNotFound)
		return
	}
	run.mu.RLock()
	sourceID := run.ID
	planRunID := run.Request.PlanRunID
	run.mu.RUnlock()

	data, err := os.ReadFile(graphPath(sourceID))
	if errors.Is(err, os.ErrNotExist) && planRunID != "" {
		sourceID = planRunID
		data, err = os.ReadFile(graphPath(sourceID))
	}
	if errors.Is(err, os.ErrNotExist) {
		jsonErr(w, "not_found", "graph unavailable for this run", http.StatusNotFound)
		return
	}
	if err != nil {
		slog.Error("read run graph failed", "run", sourceID, "err", err)
		jsonErr(w, "internal", "failed to read graph", http.StatusInternalServerError)
		return
	}
	var doc graphdata.Document
	if err := json.Unmarshal(data, &doc); err != nil {
		slog.Error("parse run graph failed", "run", sourceID, "err", err)
		jsonErr(w, "internal", "failed to parse graph", http.StatusInternalServerError)
		return
	}
	jsonOK(w, doc)
}

func graphExists(runID string) bool {
	info, err := os.Stat(graphPath(runID))
	return err == nil && !info.IsDir()
}

func streamRun(w http.ResponseWriter, r *http.Request, mgr *RunManager, id string) {
	run, ok := mgr.Get(id)
	if !ok {
		jsonErr(w, "not_found", "run not found", http.StatusNotFound)
		return
	}

	fl, ok := w.(http.Flusher)
	if !ok {
		jsonErr(w, "internal", "streaming not supported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	heartbeat := time.NewTicker(15 * time.Second)
	poll := time.NewTicker(200 * time.Millisecond)
	defer heartbeat.Stop()
	defer poll.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-heartbeat.C:
			fmt.Fprintf(w, ": heartbeat\n\n")
			fl.Flush()
		case <-poll.C:
			lines := run.Lines(offset)
			for _, line := range lines {
				fmt.Fprintf(w, "data: %s\n\n", jsonEscape(line))
				offset++
			}
			if len(lines) > 0 {
				fl.Flush()
			}
			run.mu.RLock()
			done := run.Status != StatusRunning
			run.mu.RUnlock()
			if done && run.LineCount() <= offset {
				run.mu.RLock()
				status := string(run.Status)
				reportPath := run.ReportPath
				run.mu.RUnlock()
				fmt.Fprintf(w, "event: done\ndata: {\"status\":%q,\"reportPath\":%q}\n\n", status, reportPath)
				fl.Flush()
				return
			}
		}
	}
}

func cancelRun(w http.ResponseWriter, _ *http.Request, mgr *RunManager, id string) {
	if mgr.Cancel(id) {
		jsonOK(w, map[string]string{"status": "cancelled"})
	} else {
		jsonErr(w, "not_found", "run not found or already finished", http.StatusNotFound)
	}
}

func forceKillRun(w http.ResponseWriter, _ *http.Request, mgr *RunManager, id string) {
	if mgr.ForceKill(id) {
		jsonOK(w, map[string]string{"status": "cancelled"})
	} else {
		jsonErr(w, "not_found", "run not found or already finished", http.StatusNotFound)
	}
}

func sendRunInput(w http.ResponseWriter, r *http.Request, mgr *RunManager, id string) {
	run, ok := mgr.Get(id)
	if !ok {
		jsonErr(w, "not_found", "run not found", http.StatusNotFound)
		return
	}
	var body struct {
		Value string `json:"value"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Value == "" {
		jsonErr(w, "bad_request", "value required", http.StatusBadRequest)
		return
	}
	if !run.SendInput(body.Value) {
		jsonErr(w, "not_waiting", "run is not waiting for input", http.StatusConflict)
		return
	}
	jsonOK(w, map[string]string{"status": "ok"})
}

// ── repos ───────────────────────────────────────────────────────────────────

func listRepos(w http.ResponseWriter, r *http.Request) {
	cfg, err := config.Load()
	if err != nil {
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	type entry struct {
		Name     string `json:"name"`
		Path     string `json:"path"`
		Disabled bool   `json:"disabled,omitempty"`
		Provider string `json:"provider"`
	}
	out := make([]entry, 0, len(cfg.Repositories))
	for _, repo := range cfg.Repositories {
		provider := git.DetectProvider(git.RemoteURL(repo.Path))
		out = append(out, entry{Name: repo.Name, Path: repo.Path, Disabled: repo.Disabled, Provider: provider})
	}
	page, limit := parsePage(r)
	items, total := paginate(out, page, limit)
	jsonOK(w, paginated{Items: items, Page: page, Limit: limit, Total: total})
}

func addRepo(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonErr(w, "bad_request", err.Error(), http.StatusBadRequest)
		return
	}
	if body.Name == "" || body.Path == "" {
		jsonErr(w, "bad_request", "name and path are required", http.StatusBadRequest)
		return
	}
	if err := config.AddRepo(body.Name, body.Path); err != nil {
		jsonErr(w, "conflict", err.Error(), http.StatusConflict)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, map[string]string{"name": body.Name, "path": body.Path})
}

func removeRepo(w http.ResponseWriter, _ *http.Request, name string) {
	if err := config.RemoveRepo(name); err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"removed": name})
}

func updateRepo(w http.ResponseWriter, r *http.Request, oldName string) {
	var body struct {
		Name     string `json:"name"`
		Disabled *bool  `json:"disabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonErr(w, "bad_request", "invalid request: "+err.Error(), http.StatusBadRequest)
		return
	}
	if body.Disabled != nil {
		if err := config.SetRepoDisabled(oldName, *body.Disabled); err != nil {
			jsonErr(w, "conflict", err.Error(), http.StatusConflict)
			return
		}
		jsonOK(w, map[string]any{"name": oldName})
		return
	}
	if body.Name == "" {
		jsonErr(w, "bad_request", "name or disabled is required", http.StatusBadRequest)
		return
	}
	if strings.ContainsAny(body.Name, "/\\\n\r\t") {
		jsonErr(w, "bad_request", "repository name must not contain path separators or control characters", http.StatusBadRequest)
		return
	}
	if err := config.RenameRepo(oldName, body.Name); err != nil {
		jsonErr(w, "conflict", err.Error(), http.StatusConflict)
		return
	}
	jsonOK(w, map[string]string{"name": body.Name})
}

func browseRepo(w http.ResponseWriter, r *http.Request, name string) {
	repos, err := config.LoadRepos()
	if err != nil {
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	repoRoot, ok := repos[name]
	if !ok {
		jsonErr(w, "not_found", "unknown repo "+name, http.StatusNotFound)
		return
	}
	subPath := r.URL.Query().Get("path")
	absPath, err := safeJoin(repoRoot, subPath)
	if err != nil {
		jsonErr(w, "bad_request", "invalid path", http.StatusBadRequest)
		return
	}

	entries, err := os.ReadDir(absPath)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
		return
	}

	type entry struct {
		Name  string `json:"name"`
		IsDir bool   `json:"isDir"`
		HasTf bool   `json:"hasTf"`
	}
	out := make([]entry, 0, len(entries))
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".") {
			continue
		}
		hasTf := false
		if e.IsDir() {
			matches, _ := filepath.Glob(filepath.Join(absPath, e.Name(), "*.tf"))
			hasTf = len(matches) > 0
		}
		out = append(out, entry{Name: e.Name(), IsDir: e.IsDir(), HasTf: hasTf})
	}

	page, limit := parsePage(r)
	items, total := paginate(out, page, limit)

	// Compute relative path from repo root for display
	rel, _ := filepath.Rel(repoRoot, absPath)
	if rel == "." {
		rel = ""
	}
	jsonOK(w, map[string]any{
		"repoRoot": repoRoot,
		"path":     rel,
		"entries":  items,
		"page":     page,
		"limit":    limit,
		"total":    total,
	})
}

func getRepoConfig(w http.ResponseWriter, _ *http.Request, name string) {
	cfg, err := config.LoadRepoConfig(name)
	if err != nil {
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, cfg)
}

func saveRepoConfig(w http.ResponseWriter, r *http.Request, name string) {
	var cfg config.RepoConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		jsonErr(w, "bad_request", err.Error(), http.StatusBadRequest)
		return
	}
	if err := config.SaveRepoConfig(name, cfg); err != nil {
		jsonErr(w, "invalid_config", err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, cfg)
}

// ── reports ─────────────────────────────────────────────────────────────────

func listReports(w http.ResponseWriter, r *http.Request, reportDir string) {
	entries, err := os.ReadDir(reportDir)
	if err != nil {
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	type entry struct {
		Name         string    `json:"name"`
		Command      string    `json:"command"`
		RunAt        time.Time `json:"runAt"`
		SizeKB       int64     `json:"sizeKb"`
		IsLive       bool      `json:"isLive"`
		Applied      bool      `json:"applied"`
		Add          int       `json:"add"`
		Change       int       `json:"change"`
		Destroy      int       `json:"destroy"`
		Envs         int       `json:"envs"`
		Failed       int       `json:"failed"`
		HasCost      bool      `json:"hasCost,omitempty"`
		Currency     string    `json:"currency,omitempty"`
		TotalMonthly float64   `json:"totalMonthly,omitempty"`
		DiffMonthly  float64   `json:"diffMonthly,omitempty"`
		Ticket       string    `json:"ticket,omitempty"`
		TicketURL    string    `json:"ticketUrl,omitempty"`
	}
	out := make([]entry, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || !strings.HasPrefix(e.Name(), "tf9-") || !strings.HasSuffix(e.Name(), ".html") {
			continue
		}
		info, _ := e.Info()
		cmd, runAt, isLive := report.ParseReportName(e.Name())
		en := entry{
			Name:    e.Name(),
			Command: cmd,
			RunAt:   runAt,
			SizeKB:  info.Size() / 1024,
			IsLive:  isLive,
		}
		// Load companion JSON sidecar if it exists.
		jsonPath := filepath.Join(reportDir, strings.TrimSuffix(e.Name(), ".html")+".json")
		if b, err := os.ReadFile(jsonPath); err == nil {
			var sum report.Summary
			if json.Unmarshal(b, &sum) == nil {
				en.Add = sum.Add
				en.Applied = sum.Applied
				en.Change = sum.Change
				en.Destroy = sum.Destroy
				en.Envs = sum.Envs
				en.Failed = sum.Failed
				en.HasCost = sum.HasCost
				en.Currency = sum.Currency
				en.TotalMonthly = sum.TotalMonthly
				en.DiffMonthly = sum.DiffMonthly
				en.Ticket = sum.Ticket
				en.TicketURL = sum.TicketURL
			}
		}
		out = append(out, en)
	}
	// Reverse so newest reports (largest timestamp in filename) are on page 1.
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	page, limit := parsePage(r)
	items, total := paginate(out, page, limit)
	jsonOK(w, paginated{Items: items, Page: page, Limit: limit, Total: total})
}

// getInfracostSettings returns the Infracost settings without exposing the key.
func getInfracostSettings(w http.ResponseWriter, _ *http.Request) {
	cfg, err := config.LoadInfracost()
	if err != nil {
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, struct {
		EnabledByDefault bool   `json:"enabledByDefault"`
		Currency         string `json:"currency"`
		TokenConfigured  bool   `json:"tokenConfigured"`
	}{
		EnabledByDefault: cfg.EnabledByDefault,
		Currency:         cfg.Currency,
		TokenConfigured:  strings.TrimSpace(cfg.APIKey) != "",
	})
}

// putInfracostSettings saves the Infracost settings. An empty/absent token field
// leaves the stored token unchanged; sending "" with clearToken removes it.
func putInfracostSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token            *string `json:"token"`
		EnabledByDefault bool    `json:"enabledByDefault"`
		Currency         string  `json:"currency"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonErr(w, "bad_request", "invalid JSON body", http.StatusBadRequest)
		return
	}
	cfg, err := config.LoadInfracost()
	if err != nil {
		slog.Warn("could not load infracost settings", "err", err)
	}
	cfg.EnabledByDefault = body.EnabledByDefault
	if strings.TrimSpace(body.Currency) != "" {
		cfg.Currency = strings.TrimSpace(body.Currency)
	}
	// Only overwrite the token when the caller explicitly provides the field.
	if body.Token != nil {
		cfg.APIKey = strings.TrimSpace(*body.Token)
	}
	if err := config.SaveInfracost(cfg); err != nil {
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	getInfracostSettings(w, r)
}

// costSummary aggregates cost data from saved apply reports for the Cost
// dashboard. Only `apply` runs are included — they reflect the cost of what is
// actually deployed, whereas plans are speculative.
func costSummary(w http.ResponseWriter, r *http.Request, reportDir string) {
	entries, err := os.ReadDir(reportDir)
	if err != nil {
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	type item struct {
		Report        string    `json:"report"`
		RunAt         time.Time `json:"runAt"`
		Currency      string    `json:"currency"`
		TotalMonthly  float64   `json:"totalMonthly"`
		ResourceCount int       `json:"resourceCount"`
		Ticket        string    `json:"ticket,omitempty"`
		TicketURL     string    `json:"ticketUrl,omitempty"`
	}
	type resourceRow struct {
		Name        string  `json:"name"`
		Type        string  `json:"type"`
		MonthlyCost float64 `json:"monthlyCost"`
	}
	type serviceRow struct {
		Type        string  `json:"type"`
		Count       int     `json:"count"`
		MonthlyCost float64 `json:"monthlyCost"`
	}
	type detail struct {
		Report        string        `json:"report"`
		RunAt         time.Time     `json:"runAt"`
		Currency      string        `json:"currency"`
		TotalMonthly  float64       `json:"totalMonthly"`
		ResourceCount int           `json:"resourceCount"`
		Resources     []resourceRow `json:"resources"`
		ByService     []serviceRow  `json:"byService"`
		Ticket        string        `json:"ticket,omitempty"`
		TicketURL     string        `json:"ticketUrl,omitempty"`
	}

	items := make([]item, 0, len(entries))
	var newest *report.Summary
	var newestName string
	var newestAt time.Time
	for _, e := range entries {
		if e.IsDir() || !strings.HasPrefix(e.Name(), "tf9-") || !strings.HasSuffix(e.Name(), ".html") {
			continue
		}
		cmd, runAt, isLive := report.ParseReportName(e.Name())
		if cmd != "apply" || isLive {
			continue
		}
		jsonPath := filepath.Join(reportDir, strings.TrimSuffix(e.Name(), ".html")+".json")
		b, rerr := os.ReadFile(jsonPath)
		if rerr != nil {
			continue
		}
		var sum report.Summary
		if json.Unmarshal(b, &sum) != nil || !sum.HasCost {
			continue
		}
		items = append(items, item{
			Report:        e.Name(),
			RunAt:         runAt,
			Currency:      sum.Currency,
			TotalMonthly:  sum.TotalMonthly,
			ResourceCount: sum.ResourceCount,
			Ticket:        sum.Ticket,
			TicketURL:     sum.TicketURL,
		})
		if newest == nil || runAt.After(newestAt) {
			s := sum
			newest = &s
			newestName = e.Name()
			newestAt = runAt
		}
	}
	// Newest first for the time-series / table.
	sort.Slice(items, func(i, j int) bool { return items[i].RunAt.After(items[j].RunAt) })

	// Build the detail view from the most recent apply: a flat resource list plus
	// a per-type ("by service") rollup for monitoring where cost concentrates.
	var det *detail
	if newest != nil {
		d := detail{
			Report:        newestName,
			RunAt:         newestAt,
			Currency:      newest.Currency,
			TotalMonthly:  newest.TotalMonthly,
			ResourceCount: newest.ResourceCount,
			Ticket:        newest.Ticket,
			TicketURL:     newest.TicketURL,
			Resources:     []resourceRow{},
			ByService:     []serviceRow{},
		}
		svc := map[string]*serviceRow{}
		for _, res := range newest.Results {
			if res.Cost == nil {
				continue
			}
			for _, rr := range res.Cost.Resources {
				d.Resources = append(d.Resources, resourceRow{Name: rr.Name, Type: rr.Type, MonthlyCost: rr.MonthlyCost})
				s := svc[rr.Type]
				if s == nil {
					s = &serviceRow{Type: rr.Type}
					svc[rr.Type] = s
				}
				s.Count++
				s.MonthlyCost += rr.MonthlyCost
			}
		}
		sort.Slice(d.Resources, func(i, j int) bool { return d.Resources[i].MonthlyCost > d.Resources[j].MonthlyCost })
		for _, s := range svc {
			d.ByService = append(d.ByService, *s)
		}
		sort.Slice(d.ByService, func(i, j int) bool { return d.ByService[i].MonthlyCost > d.ByService[j].MonthlyCost })
		det = &d
	}

	jsonOK(w, struct {
		Items  []item  `json:"items"`
		Latest *detail `json:"latest"`
	}{Items: items, Latest: det})
}

// resolveInfracost returns the API key + currency, or an error suitable for a
// 400 when no key is configured.
func resolveInfracost() (key, currency string, err error) {
	ic, lerr := config.LoadInfracost()
	if lerr != nil {
		slog.Warn("could not load infracost settings", "err", lerr)
	}
	if strings.TrimSpace(ic.APIKey) == "" {
		return "", "", fmt.Errorf("no Infracost API key configured — set one on the Cost page")
	}
	return ic.APIKey, ic.Currency, nil
}

// runCostScan runs an Infracost breakdown across all configured repo targets,
// saves it, and returns the new scan plus a diff against the previous scan.
func runCostScan(w http.ResponseWriter, r *http.Request) {
	key, currency, err := resolveInfracost()
	if err != nil {
		jsonErr(w, "no_api_key", err.Error(), http.StatusBadRequest)
		return
	}
	cfg, err := config.Load()
	if err != nil {
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	// Breakdown calls the Infracost pricing API per resource; allow generous time.
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Minute)
	defer cancel()

	prevLatest, _ := cost.LoadLatestTwo()
	scan, err := cost.RunBreakdown(ctx, cfg, key, currency)
	if err != nil {
		jsonErr(w, "scan_failed", err.Error(), http.StatusBadGateway)
		return
	}
	if err := cost.SaveScan(scan); err != nil {
		slog.Warn("could not save cost scan", "err", err)
	}
	jsonOK(w, struct {
		Scan *cost.Scan     `json:"scan"`
		Diff *cost.ScanDiff `json:"diff"`
	}{Scan: scan, Diff: cost.Diff(scan, prevLatest)})
}

// getCostScan returns the latest saved scan and its diff against the prior scan.
func getCostScan(w http.ResponseWriter, _ *http.Request) {
	latest, prev := cost.LoadLatestTwo()
	if latest == nil {
		jsonOK(w, struct {
			Scan *cost.Scan     `json:"scan"`
			Diff *cost.ScanDiff `json:"diff"`
		}{Scan: nil, Diff: nil})
		return
	}
	jsonOK(w, struct {
		Scan *cost.Scan     `json:"scan"`
		Diff *cost.ScanDiff `json:"diff"`
	}{Scan: latest, Diff: cost.Diff(latest, prev)})
}

// listCostScans returns saved scan timestamps + totals for the trend chart.
func listCostScans(w http.ResponseWriter, _ *http.Request) {
	names, err := cost.ListScanFiles()
	if err != nil {
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	type item struct {
		RunAt        time.Time `json:"runAt"`
		Currency     string    `json:"currency"`
		TotalMonthly float64   `json:"totalMonthly"`
		Targets      int       `json:"targets"`
	}
	items := make([]item, 0, len(names))
	for _, n := range names {
		s, lerr := cost.LoadScan(n)
		if lerr != nil {
			continue
		}
		items = append(items, item{RunAt: s.RunAt, Currency: s.Currency, TotalMonthly: s.TotalMonthly, Targets: len(s.Targets)})
	}
	jsonOK(w, struct {
		Items []item `json:"items"`
	}{Items: items})
}

// downloadCostReport streams a shareable HTML or text cost report built from the
// latest scan.
func downloadCostReport(w http.ResponseWriter, r *http.Request) {
	latest, prev := cost.LoadLatestTwo()
	if latest == nil {
		jsonErr(w, "not_found", "no cost scan available — run a breakdown first", http.StatusNotFound)
		return
	}
	diff := cost.Diff(latest, prev)
	stamp := latest.RunAt.UTC().Format("20060102-150405")
	switch r.URL.Query().Get("format") {
	case "text", "txt":
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="cost-report-%s.txt"`, stamp))
		if _, err := w.Write([]byte(cost.TextReport(latest, diff))); err != nil {
			slog.Debug("write text cost report failed", "err", err)
		}
	default: // html
		html, err := cost.HTMLReport(latest, diff)
		if err != nil {
			jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="cost-report-%s.html"`, stamp))
		if _, err := w.Write(html); err != nil {
			slog.Debug("write html cost report failed", "err", err)
		}
	}
}

// deleteReport removes a report HTML file and its JSON sidecar.
func getReportData(w http.ResponseWriter, _ *http.Request, reportDir, name string) {
	if !strings.HasPrefix(name, "tf9-") || !strings.HasSuffix(name, ".html") {
		jsonErr(w, "bad_request", "invalid report name", http.StatusBadRequest)
		return
	}
	jsonPath, err := safeJoin(reportDir, strings.TrimSuffix(name, ".html")+".json")
	if err != nil {
		jsonErr(w, "bad_request", "invalid report name", http.StatusBadRequest)
		return
	}
	b, err := os.ReadFile(jsonPath)
	if err != nil {
		if os.IsNotExist(err) {
			// Sidecar missing — parse the HTML report to extract per-env data.
			cmd, runAt, _ := report.ParseReportName(name)
			htmlPath, herr := safeJoin(reportDir, name)
			if herr == nil {
				if sum, perr := parseReportHTML(htmlPath, cmd, runAt); perr == nil {
					jsonOK(w, sum)
					return
				}
			}
			jsonOK(w, report.Summary{Command: cmd, RunAt: runAt})
			return
		}
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	var sum report.Summary
	if err := json.Unmarshal(b, &sum); err != nil {
		jsonErr(w, "internal", "failed to parse report data", http.StatusInternalServerError)
		return
	}
	jsonOK(w, sum)
}

func deleteReport(w http.ResponseWriter, r *http.Request, reportDir string) {
	name := r.URL.Query().Get("name")
	if name == "" {
		jsonErr(w, "bad_request", "name is required", http.StatusBadRequest)
		return
	}
	if !strings.HasPrefix(name, "tf9-") || !strings.HasSuffix(name, ".html") {
		jsonErr(w, "bad_request", "invalid report name", http.StatusBadRequest)
		return
	}
	htmlPath, err := safeJoin(reportDir, name)
	if err != nil {
		jsonErr(w, "bad_request", "invalid report name", http.StatusBadRequest)
		return
	}
	if err := os.Remove(htmlPath); err != nil {
		if os.IsNotExist(err) {
			jsonErr(w, "not_found", "report not found", http.StatusNotFound)
			return
		}
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	if jsonPath, err := safeJoin(reportDir, strings.TrimSuffix(name, ".html")+".json"); err == nil {
		if err := os.Remove(jsonPath); err != nil && !os.IsNotExist(err) {
			slog.Debug("could not remove report json sidecar", "file", jsonPath, "err", err)
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func downloadReport(w http.ResponseWriter, _ *http.Request, reportDir, name string) {
	if !strings.HasPrefix(name, "tf9-") || !strings.HasSuffix(name, ".html") {
		jsonErr(w, "bad_request", "invalid report name", http.StatusBadRequest)
		return
	}
	htmlPath, err := safeJoin(reportDir, name)
	if err != nil {
		jsonErr(w, "bad_request", "invalid report name", http.StatusBadRequest)
		return
	}
	b, err := os.ReadFile(htmlPath)
	if err != nil {
		if os.IsNotExist(err) {
			jsonErr(w, "not_found", "report not found", http.StatusNotFound)
			return
		}
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename=%q`, name))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(b)))
	w.WriteHeader(http.StatusOK)
	w.Write(b)
}

// parseReportHTML extracts per-environment plan counts from a legacy HTML report
// that has no companion JSON sidecar. It relies on the data-add/change/destroy/failed
// attributes and class-based markers the HTML template always emits.
var (
	reEnvHdr     = regexp.MustCompile(`class="env-hdr"[^>]*data-add="(\d+)"[^>]*data-change="(\d+)"[^>]*data-destroy="(\d+)"[^>]*data-failed="(true|false)"`)
	reEnvName    = regexp.MustCompile(`class="env-nm">([^<]+)<`)
	reEnvProfile = regexp.MustCompile(`class="profile-cell">([^<]+)<`)
)

func parseReportHTML(path, cmd string, runAt time.Time) (report.Summary, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return report.Summary{}, err
	}
	content := string(raw)

	hdrs := reEnvHdr.FindAllStringSubmatchIndex(content, -1)
	names := reEnvName.FindAllStringSubmatch(content, -1)
	profiles := reEnvProfile.FindAllStringSubmatch(content, -1)

	sum := report.Summary{Command: cmd, RunAt: runAt, Applied: cmd == "apply" && len(hdrs) > 0}
	for i, hdr := range hdrs {
		add, _ := strconv.Atoi(content[hdr[2]:hdr[3]])
		change, _ := strconv.Atoi(content[hdr[4]:hdr[5]])
		destroy, _ := strconv.Atoi(content[hdr[6]:hdr[7]])
		failed := content[hdr[8]:hdr[9]] == "true"

		env := ""
		if i < len(names) {
			env = names[i][1]
		}
		profile := ""
		if i < len(profiles) {
			profile = profiles[i][1]
		}

		r := report.EnvResult{
			Env:     env,
			Profile: profile,
			Applied: cmd == "apply" && !failed,
			Failed:  failed,
			Add:     add,
			Change:  change,
			Destroy: destroy,
		}
		sum.Results = append(sum.Results, r)
		sum.Add += add
		sum.Change += change
		sum.Destroy += destroy
		if failed {
			sum.Failed++
			sum.Applied = false
		}
	}
	sum.Envs = len(sum.Results)
	return sum, nil
}

// ── helpers ─────────────────────────────────────────────────────────────────

func resolveSearchRoot(repoName string) (searchRoot, repoLabel string, err error) {
	if repoName == "" {
		pwd, _ := os.Getwd()
		return pwd, "", nil
	}
	repo, ok, err := config.FindRepository(repoName)
	if err != nil {
		return "", "", err
	}
	if !ok {
		return "", "", fmt.Errorf("unknown repo %q", repoName)
	}
	return repo.Path, repoName, nil
}

func jsonEscape(s string) string {
	b, _ := json.Marshal(s)
	// json.Marshal wraps in quotes — strip them for the data field
	if len(b) >= 2 {
		return string(b[1 : len(b)-1])
	}
	return s
}

// ── repo git operations ───────────────────────────────────────────────────────

func repoPath(name string) (string, error) {
	repos, err := config.LoadRepos()
	if err != nil {
		return "", err
	}
	p, ok := repos[name]
	if !ok {
		return "", fmt.Errorf("unknown repo %q", name)
	}
	return p, nil
}

func listRepoCommits(w http.ResponseWriter, r *http.Request, name string) {
	base := r.URL.Query().Get("base")
	head := r.URL.Query().Get("head")
	if base == "" || head == "" {
		jsonErr(w, "bad_request", "base and head query parameters are required", http.StatusBadRequest)
		return
	}
	dir, err := repoPath(name)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
		return
	}
	commits, err := git.ListCommitsBetween(dir, base, head)
	if err != nil {
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	type commitEntry struct {
		SHA      string `json:"sha"`
		ShortSHA string `json:"shortSha"`
		Message  string `json:"message"`
		Author   string `json:"author"`
		Date     string `json:"date"`
	}
	out := make([]commitEntry, len(commits))
	for i, c := range commits {
		short := c.Hash
		if len(short) > 7 {
			short = short[:7]
		}
		out[i] = commitEntry{
			SHA:      c.Hash,
			ShortSHA: short,
			Message:  c.Subject,
			Author:   c.Author,
			Date:     c.Date,
		}
	}
	jsonOK(w, out)
}

func getRepoCommit(w http.ResponseWriter, r *http.Request, name string) {
	sha := r.URL.Query().Get("sha")
	if sha == "" {
		jsonErr(w, "bad_request", "sha query parameter is required", http.StatusBadRequest)
		return
	}
	dir, err := repoPath(name)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
		return
	}
	patch, err := git.CommitPatch(r.Context(), dir, sha)
	if err != nil {
		jsonErr(w, "commit_failed", err.Error(), http.StatusUnprocessableEntity)
		return
	}
	jsonOK(w, map[string]string{"patch": patch})
}

func listRepoBranches(w http.ResponseWriter, _ *http.Request, name string) {
	dir, err := repoPath(name)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
		return
	}
	branches, err := git.ListBranches(dir)
	if err != nil {
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, branches)
}

func rebaseRepo(w http.ResponseWriter, r *http.Request, name string) {
	var body struct {
		BaseBranch string `json:"baseBranch"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonErr(w, "bad_request", err.Error(), http.StatusBadRequest)
		return
	}
	if body.BaseBranch == "" {
		jsonErr(w, "bad_request", "baseBranch is required", http.StatusBadRequest)
		return
	}
	dir, err := repoPath(name)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
		return
	}
	output, err := git.RebaseOnto(r.Context(), dir, body.BaseBranch)
	if err != nil {
		slog.Warn("git rebase failed", "repo", name, "base", body.BaseBranch, "err", err)
		jsonOK(w, map[string]string{"output": output, "error": err.Error()})
		return
	}
	jsonOK(w, map[string]string{"output": output})
}

func mergeRepo(w http.ResponseWriter, r *http.Request, name string) {
	var body struct {
		BranchName string `json:"branchName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonErr(w, "bad_request", err.Error(), http.StatusBadRequest)
		return
	}
	if body.BranchName == "" {
		jsonErr(w, "bad_request", "branchName is required", http.StatusBadRequest)
		return
	}
	dir, err := repoPath(name)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
		return
	}
	output, err := git.Merge(r.Context(), dir, body.BranchName)
	if err != nil {
		slog.Warn("git merge failed", "repo", name, "branch", body.BranchName, "err", err)
		jsonOK(w, map[string]string{"output": output, "error": err.Error()})
		return
	}
	jsonOK(w, map[string]string{"output": output})
}

func cherryPickRepo(w http.ResponseWriter, r *http.Request, name string) {
	var body struct {
		Commits []string `json:"commits"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonErr(w, "bad_request", err.Error(), http.StatusBadRequest)
		return
	}
	if len(body.Commits) == 0 {
		jsonErr(w, "bad_request", "commits must be a non-empty array", http.StatusBadRequest)
		return
	}
	dir, err := repoPath(name)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
		return
	}
	output, err := git.CherryPick(r.Context(), dir, body.Commits)
	if err != nil {
		slog.Warn("git cherry-pick failed", "repo", name, "commits", len(body.Commits), "err", err)
		jsonOK(w, map[string]string{"output": output, "error": err.Error()})
		return
	}
	jsonOK(w, map[string]string{"output": output})
}

func repoStatus(w http.ResponseWriter, r *http.Request, name string) {
	dir, err := repoPath(name)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
		return
	}

	// Fetch from origin; ignore errors (no network, no remote) — still return what we can.
	if err := git.Fetch(r.Context(), dir); err != nil {
		slog.Debug("repo status: git fetch failed", "repo", name, "err", err)
	}

	behind, behindErr := git.BehindCount(r.Context(), dir)
	hasRemote := behindErr == nil

	branchBytes, branchErr := exec.CommandContext(r.Context(), "git", "-C", dir, "rev-parse", "--abbrev-ref", "HEAD").Output()
	if branchErr != nil {
		slog.Warn("repo status: could not resolve branch", "repo", name, "err", branchErr)
	}
	branch := strings.TrimSpace(string(branchBytes))

	changedFiles, statusErr := git.WorkingDirStatus(r.Context(), dir)
	if statusErr != nil {
		slog.Warn("repo status: could not read working dir status", "repo", name, "err", statusErr)
	}
	if changedFiles == nil {
		changedFiles = []git.WorkingDirFile{}
	}

	jsonOK(w, map[string]any{
		"branch":       branch,
		"behind":       behind,
		"hasRemote":    hasRemote,
		"changedFiles": changedFiles,
	})
}

func pullRepo(w http.ResponseWriter, r *http.Request, name string) {
	dir, err := repoPath(name)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
		return
	}
	output, err := git.Pull(r.Context(), dir)
	if err != nil {
		jsonErr(w, "pull_failed", err.Error(), http.StatusUnprocessableEntity)
		return
	}
	jsonOK(w, map[string]string{"output": output})
}

func checkoutRepo(w http.ResponseWriter, r *http.Request, name string) {
	dir, err := repoPath(name)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
		return
	}
	var body struct {
		Branch string `json:"branch"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Branch == "" {
		jsonErr(w, "bad_request", "branch is required", http.StatusBadRequest)
		return
	}
	if strings.HasPrefix(body.Branch, "-") {
		jsonErr(w, "bad_request", "invalid branch name", http.StatusBadRequest)
		return
	}
	output, err := git.Checkout(r.Context(), dir, body.Branch)
	if err != nil {
		jsonErr(w, "checkout_failed", strings.TrimSpace(output+"\n"+err.Error()), http.StatusUnprocessableEntity)
		return
	}
	jsonOK(w, map[string]string{"output": output})
}

// currentBranch resolves the checked-out branch name for repoDir.
func currentBranch(ctx context.Context, dir string) string {
	out, err := exec.CommandContext(ctx, "git", "-C", dir, "rev-parse", "--abbrev-ref", "HEAD").Output()
	if err != nil {
		slog.Warn("could not resolve current branch", "dir", dir, "err", err)
		return ""
	}
	return strings.TrimSpace(string(out))
}

// integrationSettings returns the integration branch and active-branch window/
// limit for a repo, falling back to defaults when the repo is unknown.
func integrationSettings(name string) (branch string, windowDays, limit int) {
	repo, ok, err := config.FindRepository(name)
	if err != nil || !ok {
		return config.DefaultIntegrationBranch, config.DefaultActiveBranchWindowDays, config.DefaultActiveBranchLimit
	}
	return repo.IntegrationBranchOrDefault(), repo.ActiveWindowDays(), repo.ActiveLimit()
}

// reconcileStatus reports how the current branch relates to the integration
// branch on origin: how far ahead/behind it is, the divergent commits, and a
// recommended action. It powers the Reconcile panel and the pre-apply guard.
func reconcileStatus(w http.ResponseWriter, r *http.Request, name string) {
	dir, err := repoPath(name)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
		return
	}

	// Fetch so the comparison reflects what teammates pushed. Best-effort.
	if err := git.Fetch(r.Context(), dir); err != nil {
		slog.Debug("reconcile: git fetch failed", "repo", name, "err", err)
	}

	integration, _, _ := integrationSettings(name)
	current := currentBranch(r.Context(), dir)

	// Prefer the remote integration ref (shared truth); fall back to the local
	// branch when origin has no such ref (e.g. a local-only repo).
	ref := "origin/" + integration
	ahead, behind, abErr := git.AheadBehind(r.Context(), dir, ref, "HEAD")
	if abErr != nil {
		ref = integration
		ahead, behind, abErr = git.AheadBehind(r.Context(), dir, ref, "HEAD")
	}
	if abErr != nil {
		// No integration ref reachable — report a benign "unknown" status rather
		// than failing the whole request.
		jsonOK(w, map[string]any{
			"integrationBranch": integration,
			"currentBranch":     current,
			"hasIntegration":    false,
			"recommend":         "unknown",
		})
		return
	}

	// behindCommits: on integration but not on HEAD — what you'd revert if you
	// applied now. aheadCommits: your work not yet promoted to integration.
	behindCommits, _ := git.ListCommitsBetween(dir, "HEAD", ref)
	aheadCommits, _ := git.ListCommitsBetween(dir, ref, "HEAD")
	if behindCommits == nil {
		behindCommits = []git.Commit{}
	}
	if aheadCommits == nil {
		aheadCommits = []git.Commit{}
	}

	recommend := "clean"
	switch {
	case behind > 0:
		recommend = "rebase"
	case ahead > 0:
		recommend = "promote"
	}

	jsonOK(w, map[string]any{
		"integrationBranch": integration,
		"integrationRef":    ref,
		"currentBranch":     current,
		"hasIntegration":    true,
		"ahead":             ahead,
		"behind":            behind,
		"diverged":          ahead > 0 && behind > 0,
		"behindCommits":     behindCommits,
		"aheadCommits":      aheadCommits,
		"recommend":         recommend,
	})
}

// promoteRepo merges the current (or named) feature branch into the integration
// branch and pushes it, so the integration branch reflects what was just
// applied. The working tree must be clean. On failure it returns the output and
// error so the user can resolve git state in the terminal.
func promoteRepo(w http.ResponseWriter, r *http.Request, name string) {
	dir, err := repoPath(name)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
		return
	}
	var body struct {
		Branch string `json:"branch"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body) // branch is optional; default to current
	feature := strings.TrimSpace(body.Branch)
	if feature == "" {
		feature = currentBranch(r.Context(), dir)
	}
	if feature == "" || strings.HasPrefix(feature, "-") {
		jsonErr(w, "bad_request", "invalid branch name", http.StatusBadRequest)
		return
	}

	// Refuse on a dirty tree — checkout/merge would fail or lose work.
	changed, _ := git.WorkingDirStatus(r.Context(), dir)
	if len(changed) > 0 {
		jsonErr(w, "dirty_worktree", "commit or stash your changes before promoting", http.StatusUnprocessableEntity)
		return
	}

	integration, _, _ := integrationSettings(name)
	if feature == integration {
		jsonErr(w, "bad_request", "current branch is already the integration branch", http.StatusBadRequest)
		return
	}

	var out strings.Builder
	step := func(label, output string, stepErr error) bool {
		out.WriteString("$ " + label + "\n" + output)
		if !strings.HasSuffix(output, "\n") {
			out.WriteString("\n")
		}
		return stepErr == nil
	}

	co, coErr := git.Checkout(r.Context(), dir, integration)
	if !step("git checkout "+integration, co, coErr) {
		slog.Warn("promote: checkout integration failed", "repo", name, "branch", integration, "err", coErr)
		jsonOK(w, map[string]string{"output": out.String(), "error": coErr.Error()})
		return
	}
	mg, mgErr := git.Merge(r.Context(), dir, feature)
	if !step("git merge --no-edit "+feature, mg, mgErr) {
		slog.Warn("promote: merge failed", "repo", name, "feature", feature, "err", mgErr)
		// Leave the user on the integration branch to resolve the conflict.
		jsonOK(w, map[string]string{"output": out.String(), "error": mgErr.Error()})
		return
	}
	ps, psErr := git.Push(r.Context(), dir, integration)
	if !step("git push origin "+integration, ps, psErr) {
		slog.Warn("promote: push failed", "repo", name, "branch", integration, "err", psErr)
		jsonOK(w, map[string]string{"output": out.String(), "error": psErr.Error()})
		return
	}
	// Return to the feature branch so the user keeps working where they were.
	if back, backErr := git.Checkout(r.Context(), dir, feature); backErr != nil {
		step("git checkout "+feature, back, backErr)
		slog.Warn("promote: return to feature branch failed", "repo", name, "feature", feature, "err", backErr)
	}
	jsonOK(w, map[string]string{"output": out.String()})
}

// listActiveBranches returns recently-committed branches (the AI auto-mode
// drift feed) using the repo's configured window and limit.
func listActiveBranches(w http.ResponseWriter, r *http.Request, name string) {
	dir, err := repoPath(name)
	if err != nil {
		jsonErr(w, "not_found", err.Error(), http.StatusNotFound)
		return
	}
	if err := git.Fetch(r.Context(), dir); err != nil {
		slog.Debug("active branches: git fetch failed", "repo", name, "err", err)
	}
	_, windowDays, limit := integrationSettings(name)
	branches, err := git.ActiveBranches(r.Context(), dir, windowDays, limit)
	if err != nil {
		jsonErr(w, "internal", err.Error(), http.StatusInternalServerError)
		return
	}
	if branches == nil {
		branches = []git.BranchInfo{}
	}
	jsonOK(w, map[string]any{"windowDays": windowDays, "limit": limit, "branches": branches})
}

// listAWSProfiles reads ~/.aws/config and ~/.aws/credentials and returns all
// unique profile names found in either file.
func listAWSProfiles() []string {
	seen := map[string]struct{}{}
	home, err := os.UserHomeDir()
	if err != nil {
		return []string{}
	}

	parseIni := func(path string, stripProfilePrefix bool) {
		data, err := os.ReadFile(path)
		if err != nil {
			return
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if !strings.HasPrefix(line, "[") || !strings.HasSuffix(line, "]") {
				continue
			}
			name := line[1 : len(line)-1]
			if stripProfilePrefix {
				name = strings.TrimPrefix(name, "profile ")
			}
			name = strings.TrimSpace(name)
			if name != "" {
				seen[name] = struct{}{}
			}
		}
	}

	parseIni(filepath.Join(home, ".aws", "config"), true)
	parseIni(filepath.Join(home, ".aws", "credentials"), false)

	profiles := make([]string, 0, len(seen))
	for p := range seen {
		profiles = append(profiles, p)
	}
	sort.Strings(profiles)
	return profiles
}

type awsProfileDetail struct {
	Region    string `json:"region"`
	AccountID string `json:"account_id"`
}

// parseAWSProfileDetails reads ~/.aws/config and returns a map of profile name
// to its region and account ID (from sso_account_id or role_arn). These values
// are used by the UI to auto-populate the edit-stage modal.
func parseAWSProfileDetails() map[string]awsProfileDetail {
	home, err := os.UserHomeDir()
	if err != nil {
		return map[string]awsProfileDetail{}
	}
	data, err := os.ReadFile(filepath.Join(home, ".aws", "config"))
	if err != nil {
		return map[string]awsProfileDetail{}
	}

	result := map[string]awsProfileDetail{}
	var cur string

	for _, raw := range strings.Split(string(data), "\n") {
		line := strings.TrimSpace(raw)
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			name := strings.TrimSpace(strings.TrimPrefix(line[1:len(line)-1], "profile "))
			if name != "" {
				cur = name
				if _, ok := result[cur]; !ok {
					result[cur] = awsProfileDetail{}
				}
			}
			continue
		}
		if cur == "" || !strings.Contains(line, "=") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		d := result[cur]
		switch key {
		case "region":
			d.Region = val
		case "sso_account_id":
			if d.AccountID == "" {
				d.AccountID = val
			}
		}
		result[cur] = d
	}

	return result
}

func getProfileMappings(w http.ResponseWriter) {
	cfg, err := config.Load()
	if err != nil {
		jsonErr(w, "load_config", err.Error(), http.StatusInternalServerError)
		return
	}
	m := cfg.ProfileMappings
	if m == nil {
		m = []config.ProfileMapping{}
	}
	jsonOK(w, m)
}

func saveProfileMappings(w http.ResponseWriter, r *http.Request) {
	var mappings []config.ProfileMapping
	if err := json.NewDecoder(r.Body).Decode(&mappings); err != nil {
		jsonErr(w, "invalid_body", err.Error(), http.StatusBadRequest)
		return
	}
	if err := config.Update(func(cfg *config.Config) error {
		cfg.ProfileMappings = mappings
		return nil
	}); err != nil {
		jsonErr(w, "save_config", err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, struct{}{})
}
