package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"

	"github.com/andres/tf9/internal/config"
	graphdata "github.com/andres/tf9/internal/graph"
	"github.com/andres/tf9/internal/insights"
	"github.com/andres/tf9/internal/report"
)

// Sentinel errors from GenerateInsight, mapped to HTTP statuses by the handler
// and to messages by the CLI.
var (
	ErrRunNotFound  = errors.New("run not found")
	ErrNoGraph      = errors.New("graph unavailable for this run")
	ErrInvalidModel = errors.New("unknown model id")
)

// GenerateInsight returns the AI advisory for a run, generating it from the
// sanitized graph unless a cached one exists and refresh is false. model "" uses
// the configured default. Shared by the HTTP handler and the `tf9 insights` CLI.
func (m *RunManager) GenerateInsight(ctx context.Context, id, model string, refresh bool) (insights.Insight, error) {
	if _, ok := m.Get(id); !ok {
		return insights.Insight{}, ErrRunNotFound
	}
	if !refresh {
		if ins, ok := insights.Load(id); ok {
			return ins, nil
		}
	}
	doc, ok := loadRunGraph(m, id)
	if !ok {
		return insights.Insight{}, ErrNoGraph
	}

	cfg, err := config.Load()
	if err != nil {
		return insights.Insight{}, err
	}
	if model == "" {
		model = cfg.Web.DefaultAIModelID()
	} else if !cfg.Web.IsValidAIModelID(model) {
		return insights.Insight{}, ErrInvalidModel
	}

	run, _ := m.Get(id)
	run.mu.RLock()
	targets := targetSummaries(run.Results, doc)
	runFailed := run.Status == StatusFailed || run.Status == StatusPartialSuccess
	run.mu.RUnlock()

	return insights.Generate(ctx, id, model, doc, targets, runFailed)
}

// getRunInsight returns a previously generated insight, or 404 if none exists.
func getRunInsight(w http.ResponseWriter, _ *http.Request, mgr *RunManager, id string) {
	if _, ok := mgr.Get(id); !ok {
		jsonErr(w, "not_found", "run not found", http.StatusNotFound)
		return
	}
	ins, ok := insights.Load(id)
	if !ok {
		jsonErr(w, "not_generated", "no insight generated for this run yet", http.StatusNotFound)
		return
	}
	jsonOK(w, ins)
}

// postRunInsight generates (or returns cached, unless ?refresh=true) the AI
// insight for a run.
func postRunInsight(w http.ResponseWriter, r *http.Request, mgr *RunManager, id string) {
	refresh := r.URL.Query().Get("refresh") == "true"
	ins, err := mgr.GenerateInsight(r.Context(), id, r.URL.Query().Get("model"), refresh)
	switch {
	case err == nil:
		jsonOK(w, ins)
	case errors.Is(err, ErrRunNotFound):
		jsonErr(w, "not_found", "run not found", http.StatusNotFound)
	case errors.Is(err, ErrNoGraph):
		jsonErr(w, "not_found", "graph unavailable for this run — insights need a plan/apply graph", http.StatusNotFound)
	case errors.Is(err, ErrInvalidModel):
		jsonErr(w, "invalid_model", "unknown model id", http.StatusBadRequest)
	case errors.As(err, &insights.ErrClaudeUnavailable{}):
		jsonErr(w, "claude_unavailable", err.Error(), http.StatusServiceUnavailable)
	default:
		slog.Error("generate insight failed", "run", id, "err", err)
		jsonErr(w, "internal", "failed to generate insight", http.StatusInternalServerError)
	}
}

// loadRunGraph reads a run's graph, falling back to the plan run's graph for
// apply runs (mirrors getRunGraph).
func loadRunGraph(mgr *RunManager, id string) (graphdata.Document, bool) {
	run, ok := mgr.Get(id)
	if !ok {
		return graphdata.Document{}, false
	}
	run.mu.RLock()
	sourceID := run.ID
	planRunID := run.Request.PlanRunID
	run.mu.RUnlock()

	data, err := os.ReadFile(graphPath(sourceID))
	if errors.Is(err, os.ErrNotExist) && planRunID != "" {
		data, err = os.ReadFile(graphPath(planRunID))
	}
	if err != nil {
		return graphdata.Document{}, false
	}
	var doc graphdata.Document
	if err := json.Unmarshal(data, &doc); err != nil {
		return graphdata.Document{}, false
	}
	return doc, true
}

// targetSummaries builds the value-free per-target tally fed to the model,
// resolving each target's group from the graph nodes.
func targetSummaries(results []report.EnvResult, doc graphdata.Document) []insights.TargetSummary {
	groupOf := map[string]string{}
	for _, n := range doc.Nodes {
		if n.Target != "" && n.Group != "" {
			groupOf[n.Target] = n.Group
		}
	}
	out := make([]insights.TargetSummary, 0, len(results))
	for _, res := range results {
		out = append(out, insights.TargetSummary{
			Target:    res.Env,
			Group:     groupOf[res.Env],
			Add:       res.Add,
			Change:    res.Change,
			Destroy:   res.Destroy,
			NoChanges: res.NoChanges,
		})
	}
	return out
}
