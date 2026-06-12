// Package cost runs Infracost breakdowns across configured repository targets,
// persists the results as point-in-time scans, and computes diffs between scans.
// Unlike terraform plan/apply, `infracost breakdown` parses HCL directly, so a
// scan needs no terraform init, state, or AWS credentials.
package cost

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/andres/tf9/internal/config"
)

// ResourceCost is a single priced resource from an Infracost breakdown.
type ResourceCost struct {
	Name        string  `json:"name"`
	Type        string  `json:"type"`
	MonthlyCost float64 `json:"monthlyCost"`
}

// TargetCost is the breakdown result for one configured repository target.
type TargetCost struct {
	Repo          string         `json:"repo"`
	Target        string         `json:"target"`
	Group         string         `json:"group"`
	Directory     string         `json:"directory"`
	Currency      string         `json:"currency"`
	TotalMonthly  float64        `json:"totalMonthly"`
	ResourceCount int            `json:"resourceCount"`
	Resources     []ResourceCost `json:"resources,omitempty"`
	Error         string         `json:"error,omitempty"`
}

// Scan is a point-in-time cost breakdown across all configured targets.
type Scan struct {
	RunAt        time.Time    `json:"runAt"`
	Currency     string       `json:"currency"`
	TotalMonthly float64      `json:"totalMonthly"`
	Targets      []TargetCost `json:"targets"`
}

// RunBreakdown runs `infracost breakdown` for every enabled target in every
// enabled repository and returns the aggregated scan. Per-target failures are
// recorded on the target (Error) rather than aborting the whole scan. The API
// key is passed only via the child environment and never logged.
func RunBreakdown(ctx context.Context, cfg config.Config, apiKey, currency string) (*Scan, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("no infracost api key configured")
	}
	if currency == "" {
		currency = "USD"
	}
	scan := &Scan{RunAt: time.Now().UTC(), Currency: currency, Targets: []TargetCost{}}

	for _, repo := range cfg.Repositories {
		if repo.Disabled {
			continue
		}
		for _, t := range repo.Targets {
			if t.Disabled {
				continue
			}
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			dir := filepath.Join(repo.Path, t.Directory)
			tc := TargetCost{
				Repo:      repo.Name,
				Target:    t.Name,
				Group:     t.Group,
				Directory: dir,
				Currency:  currency,
			}
			res, total, cur, err := breakdownDir(ctx, dir, apiKey, currency)
			if err != nil {
				tc.Error = err.Error()
				slog.Warn("cost breakdown failed", "repo", repo.Name, "target", t.Name, "err", err)
			} else {
				tc.Resources = res
				tc.ResourceCount = len(res)
				tc.TotalMonthly = total
				if cur != "" {
					tc.Currency = cur
				}
				scan.TotalMonthly += total
			}
			scan.Targets = append(scan.Targets, tc)
		}
	}
	return scan, nil
}

// breakdownDir runs infracost breakdown on a single terraform directory.
func breakdownDir(ctx context.Context, dir, apiKey, currency string) ([]ResourceCost, float64, string, error) {
	cmd := exec.CommandContext(ctx, "infracost", "breakdown", "--path", dir, "--format", "json")
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "INFRACOST_API_KEY="+apiKey, "INFRACOST_CURRENCY="+currency)
	out, err := cmd.Output()
	if err != nil {
		return nil, 0, "", infracostErr(err)
	}

	var parsed struct {
		Currency         string `json:"currency"`
		TotalMonthlyCost string `json:"totalMonthlyCost"`
		Projects         []struct {
			Metadata struct {
				Errors []struct {
					Message string `json:"message"`
				} `json:"errors"`
			} `json:"metadata"`
			Breakdown struct {
				Resources []struct {
					Name        string  `json:"name"`
					MonthlyCost *string `json:"monthlyCost"`
				} `json:"resources"`
			} `json:"breakdown"`
		} `json:"projects"`
	}
	if err := json.Unmarshal(out, &parsed); err != nil {
		return nil, 0, "", fmt.Errorf("parse infracost output: %w", err)
	}

	// Infracost embeds HCL/parse failures as per-project errors while still
	// exiting 0 — surface them so the dashboard doesn't show a misleading $0.
	for _, p := range parsed.Projects {
		if len(p.Metadata.Errors) > 0 {
			return nil, 0, "", fmt.Errorf("%s", p.Metadata.Errors[0].Message)
		}
	}

	var resources []ResourceCost
	for _, p := range parsed.Projects {
		for _, r := range p.Breakdown.Resources {
			mc := 0.0
			if r.MonthlyCost != nil {
				mc = parseMoney(*r.MonthlyCost)
			}
			resources = append(resources, ResourceCost{Name: r.Name, Type: resourceType(r.Name), MonthlyCost: mc})
		}
	}
	sort.Slice(resources, func(i, j int) bool { return resources[i].MonthlyCost > resources[j].MonthlyCost })
	if len(resources) > 200 {
		resources = resources[:200]
	}
	return resources, parseMoney(parsed.TotalMonthlyCost), parsed.Currency, nil
}

// SaveScan persists a scan as cost-scan-<timestamp>.json and prunes history to
// the most recent 50 scans.
func SaveScan(s *Scan) error {
	dir := config.CostScanDir()
	name := fmt.Sprintf("cost-scan-%s.json", s.RunAt.Format("20060102-150405"))
	b, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal scan: %w", err)
	}
	if err := os.WriteFile(filepath.Join(dir, name), b, 0o644); err != nil {
		return fmt.Errorf("write scan: %w", err)
	}
	pruneScans(dir, 50)
	return nil
}

// ListScanFiles returns saved scan filenames sorted newest-first.
func ListScanFiles() ([]string, error) {
	dir := config.CostScanDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasPrefix(e.Name(), "cost-scan-") && strings.HasSuffix(e.Name(), ".json") {
			names = append(names, e.Name())
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(names)))
	return names, nil
}

// LoadScan reads one saved scan by filename.
func LoadScan(name string) (*Scan, error) {
	b, err := os.ReadFile(filepath.Join(config.CostScanDir(), name))
	if err != nil {
		return nil, err
	}
	var s Scan
	if err := json.Unmarshal(b, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

// LoadLatestTwo returns the newest scan and the one before it (for diffs). Either
// may be nil when fewer scans exist.
func LoadLatestTwo() (latest, previous *Scan) {
	names, err := ListScanFiles()
	if err != nil || len(names) == 0 {
		return nil, nil
	}
	if s, err := LoadScan(names[0]); err == nil {
		latest = s
	}
	if len(names) > 1 {
		if s, err := LoadScan(names[1]); err == nil {
			previous = s
		}
	}
	return latest, previous
}

func pruneScans(dir string, keep int) {
	names, err := ListScanFiles()
	if err != nil || len(names) <= keep {
		return
	}
	for _, n := range names[keep:] {
		if err := os.Remove(filepath.Join(dir, n)); err != nil && !os.IsNotExist(err) {
			slog.Debug("could not prune cost scan", "file", n, "err", err)
		}
	}
}

// infracostErr surfaces captured stderr from a failed exec so warnings are
// actionable (api key issues, missing binary, unsupported HCL, etc.).
func infracostErr(err error) error {
	if ee, ok := err.(*exec.ExitError); ok && len(ee.Stderr) > 0 {
		msg := strings.TrimSpace(string(ee.Stderr))
		if len(msg) > 300 {
			msg = msg[:300]
		}
		return fmt.Errorf("%v: %s", err, msg)
	}
	return err
}

func parseMoney(s string) float64 {
	f, _ := strconv.ParseFloat(strings.TrimSpace(s), 64)
	return f
}

// resourceType extracts the terraform resource type from an Infracost resource
// address (e.g. "module.vpc.aws_subnet.private[0]" → "aws_subnet").
func resourceType(name string) string {
	if name == "" {
		return ""
	}
	if i := strings.IndexByte(name, '['); i >= 0 {
		name = name[:i]
	}
	parts := strings.Split(name, ".")
	if len(parts) >= 2 {
		return parts[len(parts)-2]
	}
	return parts[0]
}
