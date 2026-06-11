package server

import (
	"fmt"
	"html/template"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/andres/tfops/internal/api"
	"github.com/andres/tfops/internal/applog"
	"github.com/andres/tfops/internal/config"
	"github.com/andres/tfops/internal/report"
	"github.com/andres/tfops/internal/web"
)

type reportEntry struct {
	Name    string
	Command string
	RunAt   time.Time
	SizeKB  int64
	IsLive  bool
}

func pidFile() string {
	if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
		return filepath.Join(xdg, "tfops", "serve.pid")
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "tfops", "serve.pid")
}

// killPreviousServer kills a previously started tfops server recorded in the PID file.
func killPreviousServer() {
	pf := pidFile()
	data, err := os.ReadFile(pf)
	if err != nil {
		return
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		slog.Debug("pid file unparseable, removing", "file", pf, "err", err)
		if rmErr := os.Remove(pf); rmErr != nil {
			slog.Debug("could not remove pid file", "file", pf, "err", rmErr)
		}
		return
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		slog.Debug("could not find previous server process", "pid", pid, "err", err)
		if rmErr := os.Remove(pf); rmErr != nil {
			slog.Debug("could not remove pid file", "file", pf, "err", rmErr)
		}
		return
	}
	if err := proc.Kill(); err == nil {
		fmt.Printf("  Stopped previous tfops server (pid %d)\n", pid)
		slog.Info("stopped previous tfops server", "pid", pid)
		time.Sleep(100 * time.Millisecond)
	} else {
		slog.Debug("could not kill previous server (likely already gone)", "pid", pid, "err", err)
	}
	if rmErr := os.Remove(pf); rmErr != nil {
		slog.Debug("could not remove pid file", "file", pf, "err", rmErr)
	}
}

// freePort returns the requested port if available, otherwise the next free one.
func freePort(requested int) int {
	for p := requested; p < requested+20; p++ {
		ln, err := net.Listen("tcp", fmt.Sprintf(":%d", p))
		if err == nil {
			ln.Close()
			return p
		}
	}
	return requested
}

// Serve starts the tfops web server (report browser + full web UI).
// openPath, if non-empty, navigates the browser to that path (when autoOpen is true).
// autoOpen controls whether the system browser is launched automatically.
func Serve(dir string, port int, openPath string, autoOpen bool, mgr *api.RunManager) error {
	absDir, err := filepath.Abs(dir)
	if err != nil {
		return err
	}

	applog.Init()

	killPreviousServer()
	requested := port
	port = freePort(port)
	if port != requested {
		slog.Info("requested port unavailable, using next free port", "requested", requested, "port", port)
	}

	mux := http.NewServeMux()

	// Web UI (React SPA — served from embedded dist/)
	mux.Handle("/", web.StaticHandler())

	// API
	mux.Handle("/api/", api.Handler(mgr, absDir))

	// Static reports + legacy SSE
	mux.HandleFunc("/events", sseHandler(absDir))
	mux.Handle("/reports/", http.StripPrefix("/reports/", http.FileServer(http.Dir(absDir))))

	addr := fmt.Sprintf("127.0.0.1:%d", port)
	base := fmt.Sprintf("http://%s", addr)
	fmt.Printf("  tfops report server\n")
	fmt.Printf("  Serving:  %s\n", absDir)
	fmt.Printf("  URL:      %s\n", base)
	fmt.Printf("  Logs:     %s\n\n", config.LogFile())

	slog.Info("server starting", "addr", addr, "dir", absDir)

	// Write PID so the next invocation can kill this one.
	pf := pidFile()
	if err := os.MkdirAll(filepath.Dir(pf), 0o755); err != nil {
		slog.Warn("could not create pid file dir", "dir", filepath.Dir(pf), "err", err)
	}
	if err := os.WriteFile(pf, []byte(strconv.Itoa(os.Getpid())), 0o644); err != nil {
		slog.Warn("could not write pid file", "file", pf, "err", err)
	}
	defer os.Remove(pf)

	target := base
	if openPath != "" {
		target = base + openPath
	}
	if autoOpen {
		go func() {
			time.Sleep(150 * time.Millisecond)
			openBrowser(target)
		}()
	}

	slog.Info("server listening", "addr", addr)
	err = http.ListenAndServe(addr, mux)
	if err != nil {
		slog.Error("server stopped", "addr", addr, "err", err)
	}
	return err
}

// openBrowser opens url in the default system browser.
func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		slog.Debug("could not open browser", "url", url, "err", err)
	}
}

// sseHandler watches a file (or the directory) for changes and pushes "update" events.
// ?watch=filename  — watch a specific report file
// ?watch=.         — watch the directory (any report file added/removed)
func sseHandler(absDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fl, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming not supported", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")

		target := r.URL.Query().Get("watch")
		lastState := snapshot(absDir, target)

		// Send a heartbeat comment every 15s to keep the connection alive through proxies.
		heartbeat := time.NewTicker(15 * time.Second)
		poll := time.NewTicker(500 * time.Millisecond)
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
				cur := snapshot(absDir, target)
				if cur != lastState {
					lastState = cur
					fmt.Fprintf(w, "event: update\ndata: ok\n\n")
					fl.Flush()
				}
			}
		}
	}
}

// snapshot returns a string that changes whenever the watched target changes.
func snapshot(dir, target string) string {
	if target == "." || target == "" {
		entries, _ := os.ReadDir(dir)
		var parts []string
		for _, e := range entries {
			if strings.HasPrefix(e.Name(), "tfops-plan-") && strings.HasSuffix(e.Name(), ".html") {
				info, _ := e.Info()
				parts = append(parts, fmt.Sprintf("%s=%d", e.Name(), info.ModTime().UnixNano()))
			}
		}
		return strings.Join(parts, ",")
	}
	info, err := os.Stat(filepath.Join(dir, target))
	if err != nil {
		return ""
	}
	return fmt.Sprintf("%d", info.ModTime().UnixNano())
}

func indexHandler(absDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		entries, err := listReports(absDir)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		indexTmpl.Execute(w, map[string]any{
			"Dir":     absDir,
			"Reports": entries,
		})
	}
}

func listReports(dir string) ([]reportEntry, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var reports []reportEntry
	for _, e := range entries {
		if e.IsDir() || !strings.HasPrefix(e.Name(), "tfops-") || !strings.HasSuffix(e.Name(), ".html") {
			continue
		}
		info, _ := e.Info()
		cmd, runAt, isLive := report.ParseReportName(e.Name())
		reports = append(reports, reportEntry{
			Name:    e.Name(),
			Command: cmd,
			RunAt:   runAt,
			SizeKB:  info.Size() / 1024,
			IsLive:  isLive,
		})
	}
	sort.Slice(reports, func(i, j int) bool {
		if reports[i].IsLive != reports[j].IsLive {
			return reports[i].IsLive
		}
		return reports[i].RunAt.After(reports[j].RunAt)
	})
	return reports, nil
}

var indexTmpl = template.Must(template.New("index").Funcs(template.FuncMap{
	"fmtTime": func(t time.Time) string {
		if t.IsZero() {
			return "—"
		}
		return t.UTC().Format("2006-01-02  15:04:05 UTC")
	},
}).Parse(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>tfops — Plan Reports</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#c9d1d9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;min-height:100vh}
.wrap{max-width:900px;margin:0 auto;padding:0 24px}
.hdr{background:#161b22;border-bottom:1px solid #30363d;padding:20px 0;margin-bottom:32px}
.hdr-title{font-size:18px;font-weight:700;color:#f0f6fc;display:flex;align-items:center;gap:8px}
.hdr-title svg{opacity:.7}
.dir{color:#8b949e;font-size:12px;margin-top:4px;font-family:'SF Mono',Consolas,monospace}
.empty{color:#8b949e;text-align:center;padding:60px 0}
.empty-icon{font-size:36px;margin-bottom:12px}
.tbl-wrap{background:#161b22;border:1px solid #30363d;border-radius:10px;overflow:hidden}
table{width:100%;border-collapse:collapse}
th{background:#21262d;color:#8b949e;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;padding:10px 16px;text-align:left}
td{padding:12px 16px;border-top:1px solid #21262d;vertical-align:middle}
tr:hover td{background:#1c2128}
.name a{color:#58a6ff;text-decoration:none;font-family:'SF Mono',Consolas,monospace;font-size:12px;font-weight:600}
.name a:hover{text-decoration:underline}
.ts{color:#8b949e;font-family:'SF Mono',Consolas,monospace;font-size:12px}
.sz{color:#484f58;font-size:12px;text-align:right}
.pill{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.3px;vertical-align:middle;margin-left:8px}
.pill-live{background:#1a3a1f;color:#3fb950;border:1px solid #238636}
.pill-latest{background:#1a3a5f;color:#58a6ff;border:1px solid #1f6feb}
.pill-cmd{background:#21262d;color:#8b949e;border:1px solid #30363d;font-family:'SF Mono',Consolas,monospace;font-size:10px}
.live-dot{width:7px;height:7px;border-radius:50%;background:#3fb950;animation:lp 1s ease-in-out infinite}
@keyframes lp{0%,100%{opacity:1}50%{opacity:.2}}
.ftr{color:#484f58;font-size:11px;text-align:center;padding:24px 0;margin-top:32px;border-top:1px solid #21262d}
</style>
</head>
<body>
<header class="hdr">
  <div class="wrap">
    <div class="hdr-title">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
      tfops · Plan Reports
    </div>
    <div class="dir">{{.Dir}}</div>
  </div>
</header>
<main class="wrap">
  {{if not .Reports}}
  <div class="empty">
    <div class="empty-icon">📭</div>
    <div>No plan reports found.</div>
    <div style="color:#484f58;margin-top:8px;font-size:12px">Run <code style="background:#21262d;padding:2px 6px;border-radius:4px">tfops plan</code> to generate one.</div>
  </div>
  {{else}}
  <div class="tbl-wrap">
    <table>
      <thead><tr><th>Report</th><th>Command</th><th>Generated</th><th style="text-align:right">Size</th></tr></thead>
      <tbody>
        {{range $i, $r := .Reports}}
        <tr>
          <td class="name">
            <a href="/reports/{{$r.Name}}" target="_blank">{{$r.Name}}</a>
            {{if $r.IsLive}}<span class="pill pill-live"><span class="live-dot"></span>LIVE</span>
            {{else if eq $i 0}}<span class="pill pill-latest">latest</span>{{end}}
          </td>
          <td><span class="pill pill-cmd">{{$r.Command}}</span></td>
          <td class="ts">{{fmtTime $r.RunAt}}</td>
          <td class="sz">{{$r.SizeKB}} KB</td>
        </tr>
        {{end}}
      </tbody>
    </table>
  </div>
  {{end}}
</main>
<footer class="ftr wrap">tfops report server</footer>
<script>
// Auto-refresh index when reports are added/removed/updated
const es = new EventSource('/events?watch=.');
es.addEventListener('update', () => location.reload());
</script>
</body>
</html>`))
