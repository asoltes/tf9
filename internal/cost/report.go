package cost

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ReportData is the sidecar payload saved alongside a cost report's HTML. It
// carries the full scan plus the diff so the Reports list and viewer can render
// a breakdown without re-running Infracost.
type ReportData struct {
	Scan *Scan     `json:"scan"`
	Diff *ScanDiff `json:"diff,omitempty"`
}

// ReportStem returns the timestamped filename stem for a scan's saved report,
// matching report.ParseReportName's "tf9-<cmd>-<ts>" convention so it parses
// back to command "cost".
func ReportStem(s *Scan) string {
	return fmt.Sprintf("tf9-cost-%s", s.RunAt.Format("20060102-150405"))
}

// SaveReport persists a scan as a first-class report in reportDir: a
// self-contained HTML file plus a JSON sidecar. This is what makes a breakdown
// show up on the Reports page and open in the ReportViewer, with history.
func SaveReport(reportDir string, scan *Scan, diff *ScanDiff) error {
	if scan == nil {
		return fmt.Errorf("nil scan")
	}
	if err := os.MkdirAll(reportDir, 0o755); err != nil {
		return fmt.Errorf("create report dir: %w", err)
	}
	stem := ReportStem(scan)
	html, err := HTMLReport(scan, diff)
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(reportDir, stem+".html"), html, 0o644); err != nil {
		return fmt.Errorf("write cost report html: %w", err)
	}
	b, err := json.Marshal(ReportData{Scan: scan, Diff: diff})
	if err != nil {
		return fmt.Errorf("marshal cost report data: %w", err)
	}
	if err := os.WriteFile(filepath.Join(reportDir, stem+".json"), b, 0o644); err != nil {
		return fmt.Errorf("write cost report json: %w", err)
	}
	return nil
}

// money formats a value with the currency prefix.
func money(currency string, v float64) string {
	return fmt.Sprintf("%s %.2f", currency, v)
}

func signed(currency string, v float64) string {
	if v >= 0 {
		return fmt.Sprintf("+%s %.2f", currency, v)
	}
	return fmt.Sprintf("-%s %.2f", currency, -v)
}

// TextReport renders a plain-text cost summary suitable for email / chat / a
// .txt attachment shared with the business.
func TextReport(scan *Scan, diff *ScanDiff) string {
	var b strings.Builder
	cur := scan.Currency
	fmt.Fprintf(&b, "TF9 INFRASTRUCTURE COST REPORT\n")
	fmt.Fprintf(&b, "Generated: %s\n", scan.RunAt.UTC().Format("2006-01-02 15:04 UTC"))
	fmt.Fprintf(&b, "================================================\n\n")
	fmt.Fprintf(&b, "Total monthly cost:   %s\n", money(cur, scan.TotalMonthly))
	fmt.Fprintf(&b, "Projected annual:     %s\n", money(cur, scan.TotalMonthly*12))
	fmt.Fprintf(&b, "Targets scanned:      %d\n", len(scan.Targets))
	if diff != nil && diff.OldRunAt != nil {
		fmt.Fprintf(&b, "Change since %s: %s/mo\n", diff.OldRunAt.UTC().Format("2006-01-02 15:04"), signed(cur, diff.Change))
	}

	fmt.Fprintf(&b, "\nBY REPOSITORY\n------------------------------------------------\n")
	for _, g := range scan.ByRepo() {
		fmt.Fprintf(&b, "  %-28s %14s/mo  (%d resources)\n", g.Label, money(cur, g.MonthlyCost), g.ResourceCount)
	}

	fmt.Fprintf(&b, "\nBY PIPELINE GROUP\n------------------------------------------------\n")
	for _, g := range scan.ByGroup() {
		fmt.Fprintf(&b, "  %-28s %14s/mo  (%d targets)\n", g.Label, money(cur, g.MonthlyCost), g.TargetCount)
	}

	fmt.Fprintf(&b, "\nBY SERVICE\n------------------------------------------------\n")
	for _, g := range scan.ByService() {
		fmt.Fprintf(&b, "  %-28s %14s/mo  (%d resources)\n", g.Label, money(cur, g.MonthlyCost), g.ResourceCount)
	}

	fmt.Fprintf(&b, "\nTARGETS\n------------------------------------------------\n")
	for _, t := range scan.Targets {
		if t.Error != "" {
			fmt.Fprintf(&b, "  %-20s %-12s  [error: %s]\n", t.Repo, t.Target, t.Error)
			continue
		}
		fmt.Fprintf(&b, "  %-20s %-12s %14s/mo  (%d resources)\n", t.Repo, t.Target, money(cur, t.TotalMonthly), t.ResourceCount)
	}
	return b.String()
}

// HTMLReport renders a self-contained, print-friendly HTML cost report. It is
// designed to be saved as PDF via the browser's print dialog.
func HTMLReport(scan *Scan, diff *ScanDiff) ([]byte, error) {
	funcs := template.FuncMap{
		"money":   money,
		"signed":  signed,
		"annual":  func(v float64) float64 { return v * 12 },
		"fmtTime": func(t time.Time) string { return t.UTC().Format("2006-01-02 15:04 UTC") },
		"pct": func(part, whole float64) float64 {
			if whole == 0 {
				return 0
			}
			return part / whole * 100
		},
	}
	tmpl, err := template.New("cost").Funcs(funcs).Parse(costHTML)
	if err != nil {
		return nil, fmt.Errorf("parse cost report template: %w", err)
	}
	data := struct {
		Scan      *Scan
		Diff      *ScanDiff
		ByRepo    []GroupCost
		ByGroup   []GroupCost
		ByService []GroupCost
	}{
		Scan:      scan,
		Diff:      diff,
		ByRepo:    scan.ByRepo(),
		ByGroup:   scan.ByGroup(),
		ByService: scan.ByService(),
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return nil, fmt.Errorf("render cost report: %w", err)
	}
	return buf.Bytes(), nil
}

const costHTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Infrastructure Cost Report</title>
<style>
  :root{--ink:#1a1f29;--muted:#5f6b7a;--line:#e3e6ea;--amber:#b4690e;--green:#1a7f37;--red:#c0392b;--blue:#0b6bcb;--bg:#fff;--panel:#f7f9fb}
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg);font-size:14px;line-height:1.5}
  .wrap{max-width:900px;margin:0 auto;padding:32px 28px}
  h1{font-size:24px;margin:0 0 4px}
  .meta{color:var(--muted);font-size:13px;margin-bottom:24px}
  .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:28px}
  .card{border:1px solid var(--line);border-radius:10px;padding:16px 18px;background:var(--panel)}
  .card .v{font-size:22px;font-weight:800}
  .card .l{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-top:6px}
  .card.amber .v{color:var(--amber)} .card.blue .v{color:var(--blue)}
  .card.up .v{color:var(--red)} .card.down .v{color:var(--green)}
  h2{font-size:15px;margin:26px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--line)}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line)}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted)}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  .bar{height:7px;border-radius:4px;background:#e9edf2;overflow:hidden;margin-top:4px}
  .bar i{display:block;height:100%;background:var(--amber)}
  .up{color:var(--red)} .down{color:var(--green)} .mut{color:var(--muted)}
  .err{color:var(--red);font-style:italic}
  .foot{margin-top:32px;color:var(--muted);font-size:12px;border-top:1px solid var(--line);padding-top:12px}
  @media print{.wrap{max-width:none;padding:0} body{font-size:12px} .no-print{display:none}}
</style>
</head>
<body>
<div class="wrap">
  <h1>Infrastructure Cost Report</h1>
  <div class="meta">Generated {{fmtTime .Scan.RunAt}} · {{len .Scan.Targets}} target(s) · powered by Infracost</div>

  <div class="cards">
    <div class="card amber"><div class="v">{{money .Scan.Currency .Scan.TotalMonthly}}</div><div class="l">Monthly cost</div></div>
    <div class="card blue"><div class="v">{{money .Scan.Currency (annual .Scan.TotalMonthly)}}</div><div class="l">Projected annual</div></div>
    <div class="card"><div class="v">{{len .ByService}}</div><div class="l">Services</div></div>
    {{if and .Diff .Diff.OldRunAt}}
    <div class="card {{if gt .Diff.Change 0.0}}up{{else}}down{{end}}"><div class="v">{{signed .Scan.Currency .Diff.Change}}</div><div class="l">Change since last scan</div></div>
    {{else}}
    <div class="card"><div class="v">{{len .Scan.Targets}}</div><div class="l">Targets</div></div>
    {{end}}
  </div>

  <h2>Cost by repository</h2>
  <table><thead><tr><th>Repository</th><th class="num">Targets</th><th class="num">Resources</th><th class="num">Monthly</th></tr></thead><tbody>
  {{range .ByRepo}}<tr><td>{{.Label}}</td><td class="num">{{.TargetCount}}</td><td class="num">{{.ResourceCount}}</td><td class="num">{{money $.Scan.Currency .MonthlyCost}}</td></tr>{{end}}
  </tbody></table>

  <h2>Cost by pipeline group</h2>
  <table><thead><tr><th>Group</th><th class="num">Targets</th><th class="num">Monthly</th><th>Share</th></tr></thead><tbody>
  {{range .ByGroup}}<tr><td>{{.Label}}</td><td class="num">{{.TargetCount}}</td><td class="num">{{money $.Scan.Currency .MonthlyCost}}</td><td><div class="bar"><i style="width:{{printf "%.0f" (pct .MonthlyCost $.Scan.TotalMonthly)}}%"></i></div></td></tr>{{end}}
  </tbody></table>

  <h2>Cost by service</h2>
  <table><thead><tr><th>Service</th><th class="num">Resources</th><th class="num">Monthly</th></tr></thead><tbody>
  {{range .ByService}}<tr><td>{{.Label}}</td><td class="num">{{.ResourceCount}}</td><td class="num">{{money $.Scan.Currency .MonthlyCost}}</td></tr>{{end}}
  </tbody></table>

  <h2>Targets</h2>
  <table><thead><tr><th>Repository</th><th>Target</th><th>Group</th><th class="num">Resources</th><th class="num">Monthly</th></tr></thead><tbody>
  {{range .Scan.Targets}}<tr><td>{{.Repo}}</td><td>{{.Target}}</td><td class="mut">{{if .Group}}{{.Group}}{{else}}—{{end}}</td>
  {{if .Error}}<td colspan="2" class="err">{{.Error}}</td>{{else}}<td class="num">{{.ResourceCount}}</td><td class="num">{{money $.Scan.Currency .TotalMonthly}}</td>{{end}}</tr>{{end}}
  </tbody></table>

  {{if and .Diff .Diff.OldRunAt}}
  <h2>Changes since {{fmtTime .Diff.OldRunAt}}</h2>
  <table><thead><tr><th>Repository / Target</th><th class="num">Was</th><th class="num">Now</th><th class="num">Change</th></tr></thead><tbody>
  {{range .Diff.Targets}}{{if ne .Status "unchanged"}}<tr><td>{{.Repo}} / {{.Target}}</td><td class="num">{{money $.Diff.Currency .OldMonthly}}</td><td class="num">{{money $.Diff.Currency .NewMonthly}}</td><td class="num {{if gt .Change 0.0}}up{{else}}down{{end}}">{{signed $.Diff.Currency .Change}}</td></tr>{{end}}{{end}}
  </tbody></table>
  {{end}}

  <div class="foot">tf9 cost report · figures are Infracost estimates of list prices and exclude usage-based and negotiated discounts.</div>
</div>
</body>
</html>`
