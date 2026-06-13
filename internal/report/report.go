package report

import (
	"encoding/json"
	"fmt"
	"html/template"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var ansiRe = regexp.MustCompile(`\x1b\[([0-9;]*)m`)
var ansiStripRe = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)

func stripAnsi(s string) string { return ansiStripRe.ReplaceAllString(s, "") }

// renderOutput renders terraform output as HTML, one `<span class="rl">` per line
// tagged with a `data-k` kind (add/del/chg/dim/plan/ok/err/data) so the report's
// in-page filter bar (Raw/Changes/Errors/Summary) can show or hide lines client
// side. ANSI color codes are converted to themed spans; when a line has no ANSI
// it is colored by prefix pattern (headless / non-TTY runs).
func renderOutput(output string) template.HTML {
	if output == "" {
		return ""
	}
	return template.HTML(renderLinesHTML(strings.Split(output, "\n")))
}

// renderLinesHTML wraps each line in a `<span class="rl" data-k="…">` element so
// the in-page filter can show/hide lines. Shared by the raw output and the
// expandable resource-change blocks.
func renderLinesHTML(lines []string) string {
	var sb strings.Builder
	for _, line := range lines {
		var inner string
		if strings.Contains(line, "\x1b[") {
			inner = string(ansiToHTML(line))
		} else {
			inner = colorizeLine(line)
		}
		sb.WriteString(`<span class="rl" data-k="`)
		sb.WriteString(classifyLine(stripAnsi(line)))
		sb.WriteString(`">`)
		sb.WriteString(inner)
		sb.WriteString("</span>")
	}
	return sb.String()
}

var changeHdrRe = regexp.MustCompile(`^#\s+(.+?)\s+(?:will|must|has)\s+`)
var resourceModuleRe = regexp.MustCompile(`\b(?:resource|module)\b`)

type changeBlock struct {
	Action   string // add / change / destroy / replace
	Resource string
	Lines    []string
}

// parseChanges extracts per-resource change blocks from terraform plan output,
// mirroring the web UI's parseResourceChanges so the report's Changes view
// matches the live terminal's resource table.
func parseChanges(output string) []changeBlock {
	type seg struct {
		hdr   string
		lines []string
	}
	var segs []seg
	var cur *seg
	for _, line := range strings.Split(output, "\n") {
		t := strings.TrimLeft(stripAnsi(line), " \t")
		if strings.HasPrefix(t, "#") {
			if cur != nil {
				segs = append(segs, *cur)
			}
			cur = &seg{hdr: t, lines: []string{line}}
		} else if cur != nil {
			cur.lines = append(cur.lines, line)
		}
	}
	if cur != nil {
		segs = append(segs, *cur)
	}

	var out []changeBlock
	for _, s := range segs {
		m := changeHdrRe.FindStringSubmatch(s.hdr)
		if m == nil {
			continue
		}
		action := ""
		for _, line := range s.lines {
			t := strings.TrimLeft(stripAnsi(line), " \t")
			if !resourceModuleRe.MatchString(t) {
				continue
			}
			switch {
			case strings.HasPrefix(t, "-/+"), strings.HasPrefix(t, "+/-"):
				action = "replace"
			case strings.HasPrefix(t, "+"):
				action = "add"
			case strings.HasPrefix(t, "-"):
				action = "destroy"
			case strings.HasPrefix(t, "~"):
				action = "change"
			}
			if action != "" {
				break
			}
		}
		if action == "" {
			continue
		}
		out = append(out, changeBlock{Action: action, Resource: m[1], Lines: s.lines})
	}
	return out
}

func changeBadgeLabel(a string) string {
	switch a {
	case "add":
		return "+ add"
	case "destroy":
		return "− destroy"
	case "replace":
		return "± replace"
	default:
		return "~ change"
	}
}

// changesTable renders the expandable resource-change table used by the Changes
// filter — the static-HTML counterpart of the SPA's ResourceChangeTable.
func changesTable(output string) template.HTML {
	blocks := parseChanges(output)
	if len(blocks) == 0 {
		return template.HTML(`<div class="rct-none">No resource changes detected.</div>`)
	}
	var sb strings.Builder
	sb.WriteString(`<div class="rct-toolbar"><label>Sort <select onchange="sortRct(this)"><option value="plan">Plan order</option><option value="action">Action</option><option value="resource">Resource A-Z</option></select></label></div>`)
	sb.WriteString(`<table class="rct"><tbody>`)
	for i, b := range blocks {
		sb.WriteString(`<tr class="rct-row" data-order="`)
		sb.WriteString(strconv.Itoa(i))
		sb.WriteString(`" data-action="`)
		sb.WriteString(template.HTMLEscapeString(b.Action))
		sb.WriteString(`" data-resource="`)
		sb.WriteString(template.HTMLEscapeString(strings.ToLower(b.Resource)))
		sb.WriteString(`" onclick="toggleRct(this)"><td><span class="rct-badge `)
		sb.WriteString(b.Action)
		sb.WriteString(`">`)
		sb.WriteString(template.HTMLEscapeString(changeBadgeLabel(b.Action)))
		sb.WriteString(`</span></td><td class="rct-res">`)
		sb.WriteString(template.HTMLEscapeString(b.Resource))
		sb.WriteString(`</td><td class="rct-chev">▼</td></tr>`)
		sb.WriteString(`<tr class="rct-block"><td colspan="3"><div class="rct-block-out">`)
		sb.WriteString(renderLinesHTML(b.Lines))
		sb.WriteString(`</div></td></tr>`)
	}
	sb.WriteString(`</tbody></table>`)
	return template.HTML(sb.String())
}

// classifyLine maps a plain (ANSI-stripped) line to a kind key, mirroring the
// web UI's lineClass so the standalone report filters the same way.
func classifyLine(line string) string {
	t := strings.TrimLeft(line, " \t")
	switch {
	case strings.HasPrefix(t, "+ ") || t == "+":
		return "add"
	case strings.HasPrefix(t, "- ") || t == "-":
		return "del"
	case strings.HasPrefix(t, "~ "):
		return "chg"
	case strings.HasPrefix(t, "# "):
		return "dim"
	case strings.HasPrefix(t, "Plan:"):
		return "plan"
	case strings.HasPrefix(t, "Apply complete"), strings.HasPrefix(t, "No changes"), strings.HasPrefix(t, "Destroy complete"):
		return "ok"
	case strings.HasPrefix(t, "Error"), strings.HasPrefix(t, "[FAILED]"):
		return "err"
	case strings.HasPrefix(t, "data."):
		return "data"
	}
	return ""
}

func ansiToHTML(raw string) template.HTML {
	var sb strings.Builder
	last := 0
	open := false
	for _, m := range ansiRe.FindAllStringSubmatchIndex(raw, -1) {
		sb.WriteString(template.HTMLEscapeString(raw[last:m[0]]))
		last = m[1]
		if open {
			sb.WriteString("</span>")
			open = false
		}
		style := ansiStyle(strings.Split(raw[m[2]:m[3]], ";"))
		if style != "" {
			sb.WriteString(`<span style="`)
			sb.WriteString(style)
			sb.WriteString(`">`)
			open = true
		}
	}
	sb.WriteString(template.HTMLEscapeString(raw[last:]))
	if open {
		sb.WriteString("</span>")
	}
	return template.HTML(sb.String())
}

func ansiStyle(codes []string) string {
	var parts []string
	for _, code := range codes {
		n, _ := strconv.Atoi(strings.TrimSpace(code))
		switch {
		case n == 1:
			parts = append(parts, "font-weight:bold")
		case n == 2:
			parts = append(parts, "opacity:0.6")
		case (n >= 30 && n <= 37) || (n >= 90 && n <= 97):
			parts = append(parts, fmt.Sprintf("color:var(--a%d)", n))
		}
	}
	return strings.Join(parts, ";")
}

func colorizeLine(line string) string {
	e := template.HTMLEscapeString(line)
	t := strings.TrimLeft(line, " \t")
	switch {
	case strings.HasPrefix(t, "+ ") || t == "+":
		return `<span style="color:var(--a32)">` + e + `</span>`
	case strings.HasPrefix(t, "- ") || t == "-":
		return `<span style="color:var(--a31)">` + e + `</span>`
	case strings.HasPrefix(t, "~ "):
		return `<span style="color:var(--a33)">` + e + `</span>`
	case strings.HasPrefix(t, "-/+") || strings.HasPrefix(t, "+/-"):
		return `<span style="color:var(--a31)">` + e + `</span>`
	case strings.HasPrefix(t, "# ") && (strings.Contains(t, "will be created") || strings.Contains(t, "will be destroyed") || strings.Contains(t, "will be updated") || strings.Contains(t, "must be replaced") || strings.Contains(t, "will be replaced")):
		return `<span style="color:var(--a33)">` + e + `</span>`
	case strings.HasPrefix(t, "Plan:"):
		return `<span style="color:var(--a34)">` + e + `</span>`
	case strings.HasPrefix(t, "No changes"):
		return `<span style="color:var(--a32)">` + e + `</span>`
	}
	return e
}

// Summary is the machine-readable plan totals written as a sidecar JSON file.
// It also stores full per-environment results so the web UI can render without parsing HTML.
type Summary struct {
	Command   string      `json:"command"`
	RunAt     time.Time   `json:"runAt,omitempty"`
	RepoLabel string      `json:"repoLabel,omitempty"`
	Applied   bool        `json:"applied"`
	Add       int         `json:"add"`
	Change    int         `json:"change"`
	Destroy   int         `json:"destroy"`
	Envs      int         `json:"envs"`
	Failed    int         `json:"failed"`
	Results   []EnvResult `json:"results,omitempty"`
	// Cost totals across environments (present only when cost estimation ran).
	Currency      string  `json:"currency,omitempty"`
	TotalMonthly  float64 `json:"totalMonthly,omitempty"`
	DiffMonthly   float64 `json:"diffMonthly,omitempty"`
	ResourceCount int     `json:"resourceCount,omitempty"`
	HasCost       bool    `json:"hasCost,omitempty"`
}

// CostEstimate holds Infracost cost data for a single environment.
type CostEstimate struct {
	Currency      string         `json:"currency"`
	TotalMonthly  float64        `json:"totalMonthly"`
	DiffMonthly   float64        `json:"diffMonthly"` // 0 for apply / directory breakdown
	HasDiff       bool           `json:"hasDiff"`
	ResourceCount int            `json:"resourceCount"`
	Resources     []CostResource `json:"resources,omitempty"`
}

// CostResource is a single priced resource from an Infracost breakdown.
type CostResource struct {
	Name        string  `json:"name"` // terraform address, e.g. aws_instance.web
	Type        string  `json:"type"` // resource type, e.g. aws_instance
	MonthlyCost float64 `json:"monthlyCost"`
}

// EnvResult holds the plan outcome for a single environment.
type EnvResult struct {
	Env       string        `json:"env"`
	Profile   string        `json:"profile"`
	Applied   bool          `json:"applied"`
	Failed    bool          `json:"failed"`
	NoChanges bool          `json:"noChanges"`
	Add       int           `json:"add"`
	Change    int           `json:"change"`
	Destroy   int           `json:"destroy"`
	Output    string        `json:"output"` // plain-text plan output (ANSI stripped)
	Cost      *CostEstimate `json:"cost,omitempty"`
}

// Options carries report metadata.
type Options struct {
	Command   string
	RepoLabel string
	RunAt     time.Time
	OutputDir string
	// Filename overrides the default timestamped name (e.g. "tf9-plan-live.html").
	Filename string
	// IsLive injects an SSE client script so the browser auto-reloads when the file changes.
	IsLive bool
}

// Generate writes a self-contained HTML report and returns the file path.
func Generate(results []EnvResult, opts Options) (string, error) {
	if opts.OutputDir == "" {
		opts.OutputDir = "."
	}
	filename := opts.Filename
	if filename == "" {
		cmd := strings.ReplaceAll(opts.Command, "-", "_")
		if cmd == "" {
			cmd = "run"
		}
		filename = fmt.Sprintf("tf9-%s-%s.html", cmd, opts.RunAt.Format("20060102-150405"))
	}
	path := filepath.Join(opts.OutputDir, filename)

	if err := os.MkdirAll(opts.OutputDir, 0o755); err != nil {
		return "", fmt.Errorf("create report dir: %w", err)
	}
	f, err := os.Create(path)
	if err != nil {
		return "", fmt.Errorf("create report: %w", err)
	}
	defer f.Close()

	totalAdd, totalChange, totalDestroy := 0, 0, 0
	var totalMonthly, diffMonthly float64
	resourceCount := 0
	hasCost := false
	currency := "USD"
	for _, r := range results {
		totalAdd += r.Add
		totalChange += r.Change
		totalDestroy += r.Destroy
		if r.Cost != nil {
			hasCost = true
			currency = r.Cost.Currency
			totalMonthly += r.Cost.TotalMonthly
			diffMonthly += r.Cost.DiffMonthly
			resourceCount += r.Cost.ResourceCount
		}
	}

	funcs := template.FuncMap{
		"renderOutput": renderOutput,
		"changesTable": changesTable,
		"fmtTime":      func(t time.Time) string { return t.UTC().Format("2006-01-02 15:04:05 UTC") },
		"gt":           func(a, b int) bool { return a > b },
		"money":        func(v float64) string { return fmt.Sprintf("%.2f", v) },
		"signedMoney": func(v float64) string {
			if v >= 0 {
				return fmt.Sprintf("+%.2f", v)
			}
			return fmt.Sprintf("%.2f", v)
		},
		"ucfirst": func(s string) string {
			if s == "" {
				return s
			}
			return strings.ToUpper(s[:1]) + s[1:]
		},
	}
	tmpl, err := template.New("r").Funcs(funcs).Parse(htmlTpl)
	if err != nil {
		return "", fmt.Errorf("parse template: %w", err)
	}

	type data struct {
		Opts                                Options
		Results                             []EnvResult
		TotalAdd, TotalChange, TotalDestroy int
		IsPlan                              bool
		HasCost                             bool
		Currency                            string
		TotalMonthly, DiffMonthly           float64
		ResourceCount                       int
		AnnualCost                          float64
	}
	isPlan := opts.Command == "plan"
	if err := tmpl.Execute(f, data{opts, results, totalAdd, totalChange, totalDestroy, isPlan, hasCost, currency, totalMonthly, diffMonthly, resourceCount, totalMonthly * 12}); err != nil {
		return "", fmt.Errorf("render report: %w", err)
	}

	// Append SSE client after </html> so the browser reloads when the file is updated.
	if opts.IsLive {
		if _, err := f.WriteString(liveScriptFor(filename)); err != nil {
			return "", err
		}
	}

	// Write companion JSON sidecar with full data for the web UI.
	if !opts.IsLive {
		sum := Summary{
			Command:   opts.Command,
			RunAt:     opts.RunAt,
			RepoLabel: opts.RepoLabel,
			Applied:   opts.Command == "apply" && len(results) > 0,
			Envs:      len(results),
			Results:   results,
		}
		for _, r := range results {
			sum.Add += r.Add
			sum.Change += r.Change
			sum.Destroy += r.Destroy
			if r.Failed {
				sum.Failed++
			}
			if !r.Applied {
				sum.Applied = false
			}
			if r.Cost != nil {
				sum.HasCost = true
				sum.Currency = r.Cost.Currency
				sum.TotalMonthly += r.Cost.TotalMonthly
				sum.DiffMonthly += r.Cost.DiffMonthly
				sum.ResourceCount += r.Cost.ResourceCount
			}
		}
		if b, err := json.Marshal(sum); err == nil {
			jsonPath := strings.TrimSuffix(path, ".html") + ".json"
			if err := os.WriteFile(jsonPath, b, 0o644); err != nil {
				slog.Error("report: write json sidecar failed", "file", jsonPath, "err", err)
			}
		} else {
			slog.Error("report: marshal summary failed", "err", err)
		}
	}

	return path, nil
}

// ParseReportName parses a report filename into command, run time, and live flag.
// Handles: tf9-plan-20260602-153045.html, tf9-apply-live.html, etc.
func ParseReportName(name string) (cmd string, runAt time.Time, isLive bool) {
	s := strings.TrimPrefix(name, "tf9-")
	s = strings.TrimSuffix(s, ".html")
	if strings.HasSuffix(s, "-live") {
		cmd = strings.ReplaceAll(strings.TrimSuffix(s, "-live"), "_", "-")
		return cmd, time.Time{}, true
	}
	if len(s) > 16 {
		ts := s[len(s)-15:]
		t, err := time.ParseInLocation("20060102-150405", ts, time.UTC)
		if err == nil {
			cmd = strings.ReplaceAll(s[:len(s)-16], "_", "-")
			return cmd, t, false
		}
	}
	return s, time.Time{}, false
}

// liveScriptFor returns an SSE client script that watches the given filename.
func liveScriptFor(filename string) string {
	return `
<script>
(function(){
  const pill = document.createElement('div');
  pill.style = 'position:fixed;bottom:20px;right:20px;background:#238636;color:#fff;padding:7px 16px;border-radius:999px;font-size:12px;font-weight:600;z-index:9999;display:flex;align-items:center;gap:8px;box-shadow:0 4px 12px #0009';
  pill.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#fff;display:inline-block;animation:lp 1s ease-in-out infinite"></span>Live';
  document.head.insertAdjacentHTML('beforeend','<style>@keyframes lp{0%,100%{opacity:1}50%{opacity:.25}}</style>');
  document.body.appendChild(pill);
  const es = new EventSource('/events?watch=` + filename + `');
  es.addEventListener('update', () => location.reload());
  es.onerror = () => { pill.style.background='#6e2a2a'; pill.innerHTML='Disconnected'; es.close(); };
})();
</script>`
}

// htmlTpl is the self-contained HTML report template.
const htmlTpl = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Terraform {{ucfirst .Opts.Command}} · {{fmtTime .Opts.RunAt}}</title>
<script>
// Apply theme before first paint to avoid flash
(function(){
  var m = localStorage.getItem('tf9-color-mode');
  document.documentElement.setAttribute('data-theme', m === 'light' ? 'light' : m === 'dim' ? 'dim' : 'dark');
})();
</script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

/* ── Theme tokens ── */
:root {
  --bg:        #0d1117;
  --surface:   #161b22;
  --th:        #21262d;
  --hover:     #1c2128;
  --text:      #c9d1d9;
  --text-h:    #f0f6fc;
  --muted:     #8b949e;
  --faint:     #484f58;
  --border:    #30363d;
  --border2:   #21262d;
  --green:     #3fb950;
  --amber:     #d29922;
  --red:       #f85149;
  --blue:      #58a6ff;
  --orange:    #db6d28;
  --pill-bg:   #1a3a5f;
  --pill-c:    #58a6ff;
  --pill-br:   rgba(31,111,235,.33);
  --sb-ok-bg:  #1a3a1f; --sb-ok-c:  #3fb950; --sb-ok-br: #238636;
  --sb-no-bg:  #1f2937; --sb-no-c:  #6b7280; --sb-no-br: #374151;
  --sb-ds-bg:  #3b1619; --sb-ds-c:  #f85149; --sb-ds-br: #6e2a2a;
  --term-bg:   #010409;
  --term-text: #c9d1d9;
  --a30:#484f58;--a31:#f85149;--a32:#3fb950;--a33:#d29922;--a34:#58a6ff;--a35:#db61a2;--a36:#39c5cf;--a37:#c9d1d9;
  --a90:#6e7681;--a91:#ffa198;--a92:#56d364;--a93:#e3b341;--a94:#79c0ff;--a95:#d2a8ff;--a96:#76e3ea;--a97:#cae8ff;
}
[data-theme="light"] {
  --bg:        #f6f8fa;
  --surface:   #ffffff;
  --th:        #f6f8fa;
  --hover:     #eaeef2;
  --text:      #24292f;
  --text-h:    #1f2328;
  --muted:     #57606a;
  --faint:     #8c959f;
  --border:    #d0d7de;
  --border2:   #d0d7de;
  --green:     #1a7f37;
  --amber:     #9a6700;
  --red:       #cf222e;
  --blue:      #0969da;
  --orange:    #bc4c00;
  --pill-bg:   #dbeafe;
  --pill-c:    #1d4ed8;
  --pill-br:   #93c5fd;
  --sb-ok-bg:  #dafbe1; --sb-ok-c:  #1a7f37; --sb-ok-br: #56d364;
  --sb-no-bg:  #f6f8fa; --sb-no-c:  #57606a; --sb-no-br: #d0d7de;
  --sb-ds-bg:  #ffebe9; --sb-ds-c:  #cf222e; --sb-ds-br: #ffc1ba;
  --term-bg:   #f6f8fa;
  --term-text: #24292f;
  --a30:#24292f;--a31:#cf222e;--a32:#1a7f37;--a33:#9a6700;--a34:#0969da;--a35:#8250df;--a36:#1b7c83;--a37:#57606a;
  --a90:#8c959f;--a91:#cf222e;--a92:#1a7f37;--a93:#9a6700;--a94:#0969da;--a95:#8250df;--a96:#1b7c83;--a97:#24292f;
}
[data-theme="dim"] {
  --bg:        #22272e;
  --surface:   #2d333b;
  --th:        #2d333b;
  --hover:     #323942;
  --text:      #adbac7;
  --text-h:    #cdd9e5;
  --muted:     #768390;
  --faint:     #545d68;
  --border:    #545d68;
  --border2:   #444c56;
  --green:     #57ab5a;
  --amber:     #c69026;
  --red:       #e5534b;
  --blue:      #6cb6ff;
  --orange:    #cc6b2c;
  --pill-bg:   #243b53;
  --pill-c:    #6cb6ff;
  --pill-br:   rgba(55,108,200,.4);
  --sb-ok-bg:  #1b3326; --sb-ok-c:  #57ab5a; --sb-ok-br: #2d6a3f;
  --sb-no-bg:  #2d333b; --sb-no-c:  #768390; --sb-no-br: #444c56;
  --sb-ds-bg:  #3a2024; --sb-ds-c:  #e5534b; --sb-ds-br: #7a3038;
  --term-bg:   #1c2128;
  --term-text: #adbac7;
  --a30:#545d68;--a31:#e5534b;--a32:#57ab5a;--a33:#c69026;--a34:#6cb6ff;--a35:#dcbdfb;--a36:#8ddbf0;--a37:#adbac7;
  --a90:#768390;--a91:#ff9492;--a92:#6bc46d;--a93:#daaa3f;--a94:#96d0ff;--a95:#dcbdfb;--a96:#8ddbf0;--a97:#cdd9e5;
}

body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:14px;line-height:1.6;min-height:100vh;transition:background-color .2s,color .2s}
.wrap{max-width:1100px;margin:0 auto;padding:0 24px}

/* ── Header ── */
.hdr{background:var(--surface);border-bottom:1px solid var(--border);padding:18px 0;position:sticky;top:0;z-index:50;backdrop-filter:blur(8px);transition:background-color .2s,border-color .2s}
.hdr-inner{display:flex;align-items:center;justify-content:space-between;gap:12px}
.hdr-title{font-size:18px;font-weight:700;color:var(--text-h);display:flex;align-items:center;gap:8px}
.hdr-title svg{opacity:.7}
.hdr-meta{color:var(--muted);font-size:12px;margin-top:3px}
.pill{display:inline-flex;align-items:center;padding:4px 12px;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:.4px;text-transform:uppercase}
.pill-plan{background:var(--pill-bg);color:var(--pill-c);border:1px solid var(--pill-br)}

/* ── Stat cards ── */
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin:24px 0}
.card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px 22px;position:relative;overflow:hidden;transition:background-color .2s,border-color .2s}
.card::before{content:'';position:absolute;inset:0;opacity:.06;pointer-events:none}
.card-add::before{background:linear-gradient(135deg,var(--green),transparent)}
.card-change::before{background:linear-gradient(135deg,var(--amber),transparent)}
.card-destroy::before{background:linear-gradient(135deg,var(--red),transparent)}
.card-envs::before{background:linear-gradient(135deg,var(--blue),transparent)}
.card-cost::before{background:linear-gradient(135deg,var(--amber),transparent)}
.card-resources::before{background:linear-gradient(135deg,var(--blue),transparent)}
.card-val{font-size:38px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.card-lbl{color:var(--muted);font-size:11px;margin-top:6px;text-transform:uppercase;letter-spacing:.6px}
.card-add .card-val{color:var(--green)}
.card-change .card-val{color:var(--amber)}
.card-destroy .card-val{color:var(--red)}
.card-envs .card-val{color:var(--blue)}
.card-cost .card-val{color:var(--amber);font-size:26px}
.card-resources .card-val{color:var(--blue)}

/* ── Section ── */
.sec{margin:28px 0}
.sec-title{font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;display:flex;align-items:center;gap:8px}
.sec-title::after{content:'';flex:1;height:1px;background:var(--border)}

/* ── Summary table ── */
.tbl-wrap{background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;transition:background-color .2s,border-color .2s}
table{width:100%;border-collapse:collapse}
th{background:var(--th);color:var(--muted);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;padding:10px 16px;text-align:left;white-space:nowrap;transition:background-color .2s}
td{padding:11px 16px;border-top:1px solid var(--border2);vertical-align:middle;transition:background-color .15s}
tr:hover td{background:var(--hover)}
.mono{font-family:'SF Mono','Fira Code',Consolas,monospace;font-size:12px}
.fw{font-weight:600}
.profile-cell{color:var(--muted)}
.ma{color:var(--green);font-weight:700}.mc{color:var(--amber);font-weight:700}.md{color:var(--red);font-weight:700}.mz{color:var(--faint)}
.sb{display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap}
.sc{background:var(--sb-ok-bg);color:var(--sb-ok-c);border:1px solid var(--sb-ok-br)}
.sn{background:var(--sb-no-bg);color:var(--sb-no-c);border:1px solid var(--sb-no-br)}
.sd{background:var(--sb-ds-bg);color:var(--sb-ds-c);border:1px solid var(--sb-ds-br)}
.sf{background:var(--sb-ds-bg);color:var(--sb-ds-c);border:1px solid var(--sb-ds-br)}

/* ── Env accordion ── */
.env-block{background:var(--surface);border:1px solid var(--border);border-radius:10px;margin-bottom:10px;overflow:hidden;transition:box-shadow .2s,background-color .2s,border-color .2s}
.env-block:has(.env-body.open){box-shadow:0 0 0 1px #388bfd55}
.env-hdr{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;cursor:pointer;user-select:none;transition:background .15s;gap:12px}
.env-hdr:hover{background:var(--hover)}
.env-hdr-left{display:flex;align-items:center;gap:14px;min-width:0}
.env-nm{font-family:'SF Mono','Fira Code',Consolas,monospace;font-size:13px;font-weight:700;color:var(--text-h);white-space:nowrap}
.env-pr{color:var(--muted);font-size:12px;white-space:nowrap}
.env-nums{display:flex;gap:10px;font-family:'SF Mono',Consolas,monospace;font-size:12px;font-weight:600}
.ea{color:var(--green)}.ec{color:var(--amber)}.ed{color:var(--red)}
.chevron{color:var(--muted);font-size:10px;transition:transform .25s;flex-shrink:0}
.env-body{display:none;border-top:1px solid var(--border)}
.env-body.open{display:block}
.env-filter{display:flex;align-items:center;gap:6px;padding:9px 16px;background:var(--surface);border-bottom:1px solid var(--border)}
.efp{appearance:none;cursor:pointer;font:inherit;font-size:11px;font-weight:600;letter-spacing:.3px;color:var(--muted);background:transparent;border:1px solid var(--border);border-radius:999px;padding:3px 12px;transition:color .15s,background .15s,border-color .15s}
.efp:hover{color:var(--text-h);background:var(--hover)}
.efp.active{color:var(--pill-c);background:var(--pill-bg);border-color:var(--pill-br)}
.env-out{background:var(--term-bg);color:var(--term-text);padding:16px 20px;overflow-x:auto;font-family:'SF Mono','Fira Code',Consolas,monospace;font-size:12px;line-height:1.65;white-space:pre;max-height:70vh;overflow-y:auto;transition:background-color .2s,color .2s}
.env-out .rl{display:block}
.env-out .rl:empty::after{content:"\00a0"}
.env-empty{display:none;padding:16px 20px;background:var(--term-bg);color:var(--muted);font-style:italic;font-size:12px}
/* ── Changes (resource-change table) ── */
.env-changes{display:none;background:var(--surface)}
.rct-toolbar{display:flex;justify-content:flex-end;padding:8px 16px;border-bottom:1px solid var(--border2);background:var(--surface)}
.rct-toolbar label{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.rct-toolbar select{height:27px;padding:2px 26px 2px 8px;border:1px solid var(--border);border-radius:6px;outline:none;background:var(--surface);color:var(--text);font:11px inherit}
.rct-toolbar select:focus{border-color:var(--blue)}
.rct{width:100%;border-collapse:collapse;font-size:12px}
.rct-row{cursor:pointer;transition:background .15s}
.rct-row>td{padding:9px 16px;border-top:1px solid var(--border2);vertical-align:middle}
.rct-row:first-child>td{border-top:none}
.rct-row:hover>td{background:var(--hover)}
.rct-res{font-family:'SF Mono','Fira Code',Consolas,monospace;color:var(--text-h);width:100%}
.rct-chev{width:24px;text-align:right;color:var(--muted);transition:transform .2s}
.rct-row.open .rct-chev{transform:rotate(180deg)}
.rct-badge{display:inline-flex;align-items:center;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}
.rct-badge.add{background:var(--sb-ok-bg);color:var(--sb-ok-c);border:1px solid var(--sb-ok-br)}
.rct-badge.change{background:rgba(210,153,34,.16);color:var(--amber);border:1px solid rgba(210,153,34,.42)}
.rct-badge.destroy,.rct-badge.replace{background:var(--sb-ds-bg);color:var(--sb-ds-c);border:1px solid var(--sb-ds-br)}
.rct-block{display:none}
.rct-block.open{display:table-row}
.rct-block>td{padding:0;border-top:1px solid var(--border2)}
.rct-block-out{background:var(--term-bg);color:var(--term-text);padding:12px 18px;font-family:'SF Mono','Fira Code',Consolas,monospace;font-size:12px;line-height:1.65;white-space:pre;overflow-x:auto;max-height:50vh;overflow-y:auto}
.rct-block-out .rl{display:block}
.rct-block-out .rl:empty::after{content:"\00a0"}
.rct-none{padding:16px 20px;color:var(--muted);font-style:italic;font-size:12px}

/* ── Theme toggle ── */
.theme-tog{display:flex;align-items:center;gap:2px;background:rgba(0,0,0,.18);border-radius:8px;padding:3px}
.theme-tog button{cursor:pointer;font:inherit;font-size:11px;font-weight:600;color:var(--muted);background:transparent;border:none;border-radius:6px;padding:4px 10px;transition:color .15s,background .15s}
.theme-tog button:hover{color:var(--text-h)}
.theme-tog button.on{background:var(--surface);color:var(--text-h);box-shadow:0 1px 3px rgba(0,0,0,.3)}

/* ── Footer ── */
.ftr{color:var(--faint);font-size:11px;text-align:center;padding:28px 0 20px;border-top:1px solid var(--border2);margin-top:32px}

/* ── Responsive ── */
@media(max-width:640px){
  .cards{grid-template-columns:1fr 1fr}
  .env-pr,.env-nums{display:none}
  .wrap{padding:0 14px}
  th:nth-child(2),td:nth-child(2){display:none}
}
</style>
</head>
<body>

<header class="hdr">
  <div class="wrap">
    <div class="hdr-inner">
      <div>
        <div class="hdr-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
          Terraform {{ucfirst .Opts.Command}} Report
        </div>
        <div class="hdr-meta">{{fmtTime .Opts.RunAt}}{{if .Opts.RepoLabel}} &nbsp;·&nbsp; {{.Opts.RepoLabel}}{{end}}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <span class="pill pill-plan">{{.Opts.Command}}</span>
        <div class="theme-tog" id="themeTog">
          <button data-t="light" onclick="setTheme('light')">Light</button>
          <button data-t="dark"  onclick="setTheme('dark')">Dark</button>
          <button data-t="dim"   onclick="setTheme('dim')">Dim</button>
        </div>
      </div>
    </div>
  </div>
</header>

<main class="wrap" style="padding-top:24px;padding-bottom:8px">

  <div class="cards">
    <div class="card card-add">
      <div class="card-val">+{{.TotalAdd}}</div>
      <div class="card-lbl">to add</div>
    </div>
    <div class="card card-change">
      <div class="card-val">~{{.TotalChange}}</div>
      <div class="card-lbl">to change</div>
    </div>
    <div class="card card-destroy">
      <div class="card-val">-{{.TotalDestroy}}</div>
      <div class="card-lbl">to destroy</div>
    </div>
    <div class="card card-envs">
      <div class="card-val">{{len .Results}}</div>
      <div class="card-lbl">environments</div>
    </div>
    {{if .HasCost}}
    <div class="card card-cost">
      <div class="card-val">{{.Currency}} {{money .TotalMonthly}}</div>
      <div class="card-lbl">{{if .IsPlan}}projected monthly cost{{else}}estimated monthly cost{{end}}</div>
    </div>
    {{if .IsPlan}}
    <div class="card card-cost">
      <div class="card-val">{{.Currency}} {{signedMoney .DiffMonthly}}</div>
      <div class="card-lbl">monthly cost change</div>
    </div>
    {{end}}
    <div class="card card-cost">
      <div class="card-val">{{.Currency}} {{money .AnnualCost}}</div>
      <div class="card-lbl">projected annual cost</div>
    </div>
    <div class="card card-resources">
      <div class="card-val">{{.ResourceCount}}</div>
      <div class="card-lbl">priced resources</div>
    </div>
    {{end}}
  </div>

  <div class="sec">
    <div class="sec-title">Summary</div>
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Environment</th>
            <th>Profile</th>
            <th>Add</th><th>Change</th><th>Destroy</th>
            {{if .HasCost}}<th>Monthly Cost</th>{{end}}
            <th>Applied</th>
          </tr>
        </thead>
        <tbody>
          {{range .Results}}
          <tr>
            <td class="mono fw">{{.Env}}</td>
            <td class="profile-cell">{{.Profile}}</td>
            <td class="mono">{{if .Failed}}<span class="mz">—</span>{{else if gt .Add 0}}<span class="ma">+{{.Add}}</span>{{else}}<span class="mz">+0</span>{{end}}</td>
            <td class="mono">{{if .Failed}}<span class="mz">—</span>{{else if gt .Change 0}}<span class="mc">~{{.Change}}</span>{{else}}<span class="mz">~0</span>{{end}}</td>
            <td class="mono">{{if .Failed}}<span class="mz">—</span>{{else if gt .Destroy 0}}<span class="md">-{{.Destroy}}</span>{{else}}<span class="mz">-0</span>{{end}}</td>
            {{if $.HasCost}}<td class="mono">{{if .Cost}}{{.Cost.Currency}} {{money .Cost.TotalMonthly}}{{if .Cost.HasDiff}} ({{signedMoney .Cost.DiffMonthly}}){{end}}{{else}}<span class="mz">—</span>{{end}}</td>{{end}}
            <td><span class="sb {{if .Applied}}sc{{else}}sn{{end}}">{{if .Applied}}True{{else}}False{{end}}</span></td>
          </tr>
          {{end}}
        </tbody>
      </table>
    </div>
  </div>

  <div class="sec">
    <div class="sec-title">Details</div>
    {{range .Results}}
    <div class="env-block">
      <div class="env-hdr" onclick="toggle(this)" data-add="{{.Add}}" data-change="{{.Change}}" data-destroy="{{.Destroy}}" data-failed="{{.Failed}}">
        <div class="env-hdr-left">
          <span class="env-nm">{{.Env}}</span>
          <span class="env-pr">{{.Profile}}</span>
          <span class="env-nums">
            <span class="ea">+{{.Add}}</span>
            <span class="ec">~{{.Change}}</span>
            <span class="ed">-{{.Destroy}}</span>
          </span>
        </div>
        <span class="chevron">▼</span>
      </div>
      <div class="env-body">
        {{if .Output}}
        <div class="env-filter">
          <button class="efp active" data-f="raw" onclick="filterEnv(this)">Raw</button>
          <button class="efp" data-f="changes" onclick="filterEnv(this)">Changes</button>
          <button class="efp" data-f="errors" onclick="filterEnv(this)">Errors</button>
          <button class="efp" data-f="summary" onclick="filterEnv(this)">Summary</button>
        </div>
        <div class="env-out">{{renderOutput .Output}}</div>
        <div class="env-changes">{{changesTable .Output}}</div>
        <div class="env-empty">No matching lines for this filter.</div>
        {{else}}
        <div class="env-out"><span style="color:var(--muted);font-style:italic">No output captured.</span></div>
        {{end}}
      </div>
    </div>
    {{end}}
  </div>

</main>

<footer class="ftr wrap">Generated by tf9 &nbsp;·&nbsp; {{fmtTime .Opts.RunAt}}</footer>

<script>
function toggle(hdr) {
  const body = hdr.nextElementSibling;
  const icon = hdr.querySelector('.chevron');
  const open = body.classList.toggle('open');
  icon.style.transform = open ? 'rotate(180deg)' : '';
}
// Auto-open envs that have changes or failures
document.querySelectorAll('.env-hdr').forEach(hdr => {
  const d = hdr.dataset;
  const hasChanges = parseInt(d.add)||parseInt(d.change)||parseInt(d.destroy)||d.failed==='true';
  if (hasChanges) {
    hdr.nextElementSibling.classList.add('open');
    hdr.querySelector('.chevron').style.transform = 'rotate(180deg)';
  }
});
// Per-env output filter — mirrors the web UI terminal pills (Raw/Changes/Errors/Summary)
// so a shared report stays interactive offline.
function filterEnv(btn) {
  var bar = btn.parentElement;
  bar.querySelectorAll('.efp').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  var f = btn.dataset.f;
  var body = btn.closest('.env-body');
  var out = body.querySelector('.env-out');
  var changes = body.querySelector('.env-changes');
  var empty = body.querySelector('.env-empty');

  // Changes shows the expandable resource table instead of the raw line view —
  // matching the live terminal's ResourceChangeTable.
  if (f === 'changes') {
    if (out) out.style.display = 'none';
    if (empty) empty.style.display = 'none';
    if (changes) changes.style.display = 'block';
    return;
  }
  if (changes) changes.style.display = 'none';
  if (out) out.style.display = '';

  var lines = Array.prototype.slice.call(body.querySelectorAll('.env-out .rl'));
  var vis = new Array(lines.length).fill(false);
  if (f === 'raw') {
    vis.fill(true);
  } else if (f === 'summary') {
    lines.forEach(function(el, i){ if (el.dataset.k === 'plan' || el.dataset.k === 'ok') vis[i] = true; });
  } else if (f === 'errors') {
    lines.forEach(function(el, i){ if (el.dataset.k === 'err' || /Error|FAILED|\[FAILED\]/i.test(el.textContent)) vis[i] = true; });
  }
  var any = false;
  lines.forEach(function(el, i){ el.style.display = vis[i] ? '' : 'none'; if (vis[i]) any = true; });
  if (empty) empty.style.display = any ? 'none' : 'block';
}
function toggleRct(row) {
  var open = row.classList.toggle('open');
  var blk = row.nextElementSibling;
  if (blk && blk.classList.contains('rct-block')) blk.classList.toggle('open', open);
}
function sortRct(select) {
  var table = select.closest('.env-changes').querySelector('.rct');
  if (!table) return;
  var body = table.tBodies[0];
  var rows = Array.prototype.slice.call(body.querySelectorAll('.rct-row'));
  var actionOrder = { add: 0, change: 1, replace: 2, destroy: 3 };
  rows.sort(function(a, b) {
    if (select.value === 'action') {
      return actionOrder[a.dataset.action] - actionOrder[b.dataset.action] ||
        parseInt(a.dataset.order, 10) - parseInt(b.dataset.order, 10);
    }
    if (select.value === 'resource') {
      return a.dataset.resource.localeCompare(b.dataset.resource) ||
        parseInt(a.dataset.order, 10) - parseInt(b.dataset.order, 10);
    }
    return parseInt(a.dataset.order, 10) - parseInt(b.dataset.order, 10);
  });
  rows.forEach(function(row) {
    var block = row.nextElementSibling;
    body.appendChild(row);
    if (block && block.classList.contains('rct-block')) body.appendChild(block);
  });
}
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('tf9-color-mode', t);
  document.querySelectorAll('#themeTog button').forEach(function(b) {
    b.classList.toggle('on', b.dataset.t === t);
  });
}
// Mark the active button on load
(function() {
  var t = document.documentElement.getAttribute('data-theme') || 'dark';
  document.querySelectorAll('#themeTog button').forEach(function(b) {
    b.classList.toggle('on', b.dataset.t === t);
  });
})();
// Sync theme with the parent SPA via postMessage (storage events don't fire in same-tab iframes)
window.addEventListener('message', function(e) {
  if (e.data && e.data.tf9Theme) {
    setTheme(e.data.tf9Theme);
  }
});
</script>

</body>
</html>`
