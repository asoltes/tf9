package cost

import (
	"sort"
	"time"
)

// GroupCost is a labelled cost rollup (by repo, pipeline group, or service).
type GroupCost struct {
	Label         string  `json:"label"`
	MonthlyCost   float64 `json:"monthlyCost"`
	ResourceCount int     `json:"resourceCount"`
	TargetCount   int     `json:"targetCount,omitempty"`
}

// ByRepo rolls up a scan's cost per repository.
func (s *Scan) ByRepo() []GroupCost {
	m := map[string]*GroupCost{}
	for _, t := range s.Targets {
		g := ensure(m, t.Repo)
		g.MonthlyCost += t.TotalMonthly
		g.ResourceCount += t.ResourceCount
		g.TargetCount++
	}
	return sortedGroups(m)
}

// ByGroup rolls up a scan's cost per pipeline group. Targets with no group are
// bucketed under "ungrouped".
func (s *Scan) ByGroup() []GroupCost {
	m := map[string]*GroupCost{}
	for _, t := range s.Targets {
		label := t.Group
		if label == "" {
			label = "ungrouped"
		}
		g := ensure(m, label)
		g.MonthlyCost += t.TotalMonthly
		g.ResourceCount += t.ResourceCount
		g.TargetCount++
	}
	return sortedGroups(m)
}

// ByService rolls up a scan's cost per resource type across all targets.
func (s *Scan) ByService() []GroupCost {
	m := map[string]*GroupCost{}
	for _, t := range s.Targets {
		for _, r := range t.Resources {
			g := ensure(m, r.Type)
			g.MonthlyCost += r.MonthlyCost
			g.ResourceCount++
		}
	}
	return sortedGroups(m)
}

func ensure(m map[string]*GroupCost, label string) *GroupCost {
	g := m[label]
	if g == nil {
		g = &GroupCost{Label: label}
		m[label] = g
	}
	return g
}

func sortedGroups(m map[string]*GroupCost) []GroupCost {
	out := make([]GroupCost, 0, len(m))
	for _, g := range m {
		out = append(out, *g)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].MonthlyCost > out[j].MonthlyCost })
	return out
}

// ── Diff ────────────────────────────────────────────────────────────────────

// TargetDiff is the per-target change between two scans.
type TargetDiff struct {
	Repo       string  `json:"repo"`
	Target     string  `json:"target"`
	Group      string  `json:"group"`
	OldMonthly float64 `json:"oldMonthly"`
	NewMonthly float64 `json:"newMonthly"`
	Change     float64 `json:"change"`
	Status     string  `json:"status"` // added / removed / increased / decreased / unchanged
}

// ResourceDiff is a notable per-resource change between two scans.
type ResourceDiff struct {
	Repo       string  `json:"repo"`
	Target     string  `json:"target"`
	Name       string  `json:"name"`
	Type       string  `json:"type"`
	OldMonthly float64 `json:"oldMonthly"`
	NewMonthly float64 `json:"newMonthly"`
	Change     float64 `json:"change"`
	Status     string  `json:"status"` // added / removed / increased / decreased
}

// ScanDiff is the cost change between a previous and current scan.
type ScanDiff struct {
	OldRunAt  *time.Time     `json:"oldRunAt,omitempty"`
	NewRunAt  time.Time      `json:"newRunAt"`
	Currency  string         `json:"currency"`
	OldTotal  float64        `json:"oldTotal"`
	NewTotal  float64        `json:"newTotal"`
	Change    float64        `json:"change"`
	Targets   []TargetDiff   `json:"targets"`
	Resources []ResourceDiff `json:"resources"`
}

// Diff computes the cost change from prev → curr. When prev is nil the diff
// treats everything in curr as newly added.
func Diff(curr, prev *Scan) *ScanDiff {
	d := &ScanDiff{
		NewRunAt:  curr.RunAt,
		Currency:  curr.Currency,
		NewTotal:  curr.TotalMonthly,
		Targets:   []TargetDiff{},
		Resources: []ResourceDiff{},
	}
	if prev != nil {
		old := prev.RunAt
		d.OldRunAt = &old
		d.OldTotal = prev.TotalMonthly
	}
	d.Change = d.NewTotal - d.OldTotal

	// Index previous targets and resources by stable keys.
	prevTargets := map[string]float64{}
	prevRes := map[string]ResourceCost{}
	if prev != nil {
		for _, t := range prev.Targets {
			prevTargets[t.Repo+"\x00"+t.Target] = t.TotalMonthly
			for _, r := range t.Resources {
				prevRes[t.Repo+"\x00"+t.Target+"\x00"+r.Name] = r
			}
		}
	}

	seenTarget := map[string]bool{}
	curRes := map[string]bool{}
	for _, t := range curr.Targets {
		key := t.Repo + "\x00" + t.Target
		seenTarget[key] = true
		oldVal, existed := prevTargets[key]
		td := TargetDiff{Repo: t.Repo, Target: t.Target, Group: t.Group, OldMonthly: oldVal, NewMonthly: t.TotalMonthly, Change: t.TotalMonthly - oldVal}
		td.Status = statusFor(existed, oldVal, t.TotalMonthly, false)
		d.Targets = append(d.Targets, td)

		for _, r := range t.Resources {
			rkey := key + "\x00" + r.Name
			curRes[rkey] = true
			oldR, had := prevRes[rkey]
			if had && approxEq(oldR.MonthlyCost, r.MonthlyCost) {
				continue
			}
			rd := ResourceDiff{Repo: t.Repo, Target: t.Target, Name: r.Name, Type: r.Type, OldMonthly: oldR.MonthlyCost, NewMonthly: r.MonthlyCost, Change: r.MonthlyCost - oldR.MonthlyCost}
			rd.Status = statusFor(had, oldR.MonthlyCost, r.MonthlyCost, true)
			d.Resources = append(d.Resources, rd)
		}
	}

	// Targets / resources that existed before but are gone now (removed).
	if prev != nil {
		for _, t := range prev.Targets {
			key := t.Repo + "\x00" + t.Target
			if !seenTarget[key] {
				d.Targets = append(d.Targets, TargetDiff{Repo: t.Repo, Target: t.Target, Group: t.Group, OldMonthly: t.TotalMonthly, Change: -t.TotalMonthly, Status: "removed"})
			}
			for _, r := range t.Resources {
				rkey := key + "\x00" + r.Name
				if !curRes[rkey] {
					d.Resources = append(d.Resources, ResourceDiff{Repo: t.Repo, Target: t.Target, Name: r.Name, Type: r.Type, OldMonthly: r.MonthlyCost, Change: -r.MonthlyCost, Status: "removed"})
				}
			}
		}
	}

	// Largest absolute change first; cap resource list.
	sort.Slice(d.Targets, func(i, j int) bool { return abs(d.Targets[i].Change) > abs(d.Targets[j].Change) })
	sort.Slice(d.Resources, func(i, j int) bool { return abs(d.Resources[i].Change) > abs(d.Resources[j].Change) })
	if len(d.Resources) > 100 {
		d.Resources = d.Resources[:100]
	}
	return d
}

func statusFor(existed bool, oldVal, newVal float64, _ bool) string {
	switch {
	case !existed:
		return "added"
	case approxEq(oldVal, newVal):
		return "unchanged"
	case newVal > oldVal:
		return "increased"
	default:
		return "decreased"
	}
}

func approxEq(a, b float64) bool { return abs(a-b) < 0.005 }

func abs(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}
