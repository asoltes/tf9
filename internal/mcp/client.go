// Package mcp implements the `tf9 mcp` server: a stdio Model Context Protocol
// server that exposes a curated, access-gated subset of tf9's capabilities to
// external AI hosts. It is a thin façade over the REST API of a running
// `tf9 serve` process — it never runs terraform itself, so RunManager stays the
// single writer of run state and AI-triggered runs appear live in the web UI.
package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// ErrServeNotRunning is returned when the tf9 serve REST API is unreachable.
var ErrServeNotRunning = errors.New("serve_not_running: tf9 serve is not reachable — start it with `tf9 serve`")

// Client is a small HTTP client over a running tf9 serve instance.
type Client struct {
	baseURL string
	http    *http.Client
}

// NewClient returns a Client targeting the given serve base URL.
func NewClient(baseURL string) *Client {
	return &Client{baseURL: baseURL, http: &http.Client{Timeout: 30 * time.Second}}
}

// webURL builds a clickable web-UI URL from a hash route (e.g. "#runs" or
// "#report/<name>") so tool results can link the user back to the running UI.
func (c *Client) webURL(hashRoute string) string {
	return c.baseURL + "/" + hashRoute
}

// runRequest mirrors the subset of api.RunRequest the MCP server is allowed to
// send. Fields the MCP server must control (autoApprove, nonprodOnly) are set
// server-side and never exposed to the AI, so they live here rather than in any
// tool's argument schema.
type runRequest struct {
	Repo        string `json:"repo,omitempty"`
	Command     string `json:"command"`
	EnvFilter   string `json:"envFilter,omitempty"`
	AutoApprove bool   `json:"autoApprove"`
	NonprodOnly bool   `json:"nonprodOnly"`
}

// get fetches a path under /api and returns the raw JSON body.
func (c *Client) get(ctx context.Context, path string) (json.RawMessage, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return nil, err
	}
	return c.do(req)
}

// startRun posts a run request and returns the new run ID.
func (c *Client) startRun(ctx context.Context, rr runRequest) (string, error) {
	body, err := json.Marshal(rr)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/runs", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	raw, err := c.do(req)
	if err != nil {
		return "", err
	}
	var resp struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		return "", fmt.Errorf("unexpected response starting run: %w", err)
	}
	return resp.ID, nil
}

// analyzeRun fetches a run's AI insight, generating it when refresh is set or
// no cached insight exists (POST), otherwise returning the cached one (GET).
func (c *Client) analyzeRun(ctx context.Context, runID string, refresh bool) (json.RawMessage, error) {
	path := "/api/runs/" + url.PathEscape(runID) + "/insights"
	if refresh {
		path += "?refresh=true"
	}
	method := http.MethodPost // POST returns cached unless refresh=true; generates otherwise
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, nil)
	if err != nil {
		return nil, err
	}
	return c.do(req)
}

// do executes a request, mapping connection failures to ErrServeNotRunning and
// non-2xx responses to an error carrying the server's message.
func (c *Client) do(req *http.Request) (json.RawMessage, error) {
	resp, err := c.http.Do(req)
	if err != nil {
		var urlErr *url.Error
		if errors.As(err, &urlErr) {
			return nil, ErrServeNotRunning
		}
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := string(bytes.TrimSpace(body))
		if msg == "" {
			msg = resp.Status
		}
		return nil, fmt.Errorf("tf9 serve returned %d: %s", resp.StatusCode, msg)
	}
	return body, nil
}
