# tf9 Web UI Enterprise Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the tf9 web UI an enterprise-grade operations interface: server-side run filtering (date + command), an operational Dashboard from real API data, clear navigation labels/grouping, complete accessible theme palettes, and production polish — with tests.

**Architecture:** Keep the existing plain-React + custom-CSS architecture and hash routing. Extend `GET /api/runs` with `from`/`to`/`command` query params filtered before pagination in `RunManager`. Add a dependency-free accessible date-range calendar. Rewrite `Overview` as a Dashboard composed from existing APIs. Relabel/group navigation in `Shell.tsx` preserving all route IDs.

**Tech Stack:** Go (net/http, stdlib testing), React 18 + TypeScript + Vite, vitest, Playwright.

---

### Task 1: Backend — date/command filtering on GET /api/runs (TDD)

**Files:**
- Modify: `internal/api/manager.go` (List → ListFiltered)
- Modify: `internal/api/handlers.go` (listRuns: parse `from`, `to` RFC3339, repeated `command`; 400 on malformed)
- Test: `internal/api/handlers_test.go` (new tests via httptest against `NewMux` or direct `listRuns` call with seeded RunManager)

Steps:
- [x] Write failing tests: filter by from/to (inclusive boundaries), by one command, by multiple commands, combined AND, filtered total reflects filter, newest-first preserved, absent params = legacy behavior, malformed `from` → 400.
- [x] Implement `runFilter` struct {from, to *time.Time; commands map[string]bool} parsed in handler; `(m *RunManager) ListFiltered(page, limit int, match func(*Run) bool) ([]*Run, int)`; keep `List` delegating with nil match.
- [x] `go test ./internal/api/` passes. Commit.

### Task 2: Frontend filter model + URL persistence (TDD)

**Files:**
- Create: `frontend/src/lib/runFilters.ts` + `frontend/src/lib/runFilters.test.ts`

API:
```ts
export interface RunFilters { from: string | null; to: string | null; commands: string[] } // from/to are local 'YYYY-MM-DD'
export function emptyFilters(): RunFilters
export function isEmpty(f: RunFilters): boolean
export function validateRange(f: RunFilters): string | null   // 'End date is before start date.' etc.
export function toQuery(f: RunFilters): string                // '&from=<RFC3339 local start-of-day>&to=<RFC3339 local end-of-day>&command=plan...'
export function parseHashQuery(qs: string): RunFilters        // from '#runs?from=2026-06-01&to=...&command=plan'
export function toHashQuery(f: RunFilters): string            // '' or '?from=...&command=...'
export function presetRange(p: 'today'|'yesterday'|'last7'|'last30', now?: Date): { from: string; to: string }
```
- [x] Failing tests: local boundary conversion (start 00:00:00.000 / end 23:59:59.999 local → RFC3339), presets, round-trip hash serialization, validation, empty behavior.
- [x] Implement; vitest passes. Commit.

### Task 3: Accessible DateRangePicker component (no dependency)

**Files:**
- Create: `frontend/src/components/DateRangePicker.tsx`, `frontend/src/components/DateRangePicker.css`

Behavior: button shows summary; popover with two manual ISO inputs (YYYY-MM-DD), preset buttons (Today, Yesterday, Last 7 days, Last 30 days, All time), one calendar grid (`role="grid"`, weekday headers, `aria-selected`, range interior class, today marker), month prev/next buttons, full arrow-key navigation (±1 day, ±7 days), Home/End to week bounds optional, Enter selects (first click = start, second = end; reversed order swaps), Escape closes and returns focus to trigger, click-outside closes. Inline validation message via `role="alert"`. Clear button. All colors via tokens.
- [x] Implement component + CSS (tokens only; visible in all three themes).
- [x] Commit.

### Task 4: Run History page — toolbar, chips, integration

**Files:**
- Modify: `frontend/src/pages/Runs.tsx`, `frontend/src/pages/Runs.css`, `frontend/src/App.tsx` (parseHash: treat `runs?...` prefix as runs page, pass query), `frontend/src/types.ts` (Page runs gains `filterQuery?: string`)

- [x] Toolbar above table: DateRangePicker + command multi-select (checkbox dropdown listing plan/apply/destroy plus any other command values present in loaded data; "All commands" state when none selected) + active-filter chips (removable) + "Clear all filters" + result count; distinct filtered-empty state ("No runs match the current filters").
- [x] Wire `loadRuns` to include `toQuery(filters)`; reset to page 1 on filter change; auto-refresh keeps filters; selection/SSE untouched; on API failure keep filters and show retry button.
- [x] Persist via `history.replaceState` to `#runs?{...}`; restore on mount/hashchange. Page label updates: title "Run History".
- [x] `npx tsc --noEmit`; vitest; commit.

### Task 5: Navigation relabel, grouping, icons, a11y

**Files:**
- Modify: `frontend/src/Shell.tsx`, `frontend/src/styles/cloudscape.css` (collapsed rail, focus styles), e2e specs `navigation.spec.ts`, `smoke-routes.spec.ts`

Labels (route IDs unchanged): overview→Dashboard, runs→Run History, workspace→Repository Workspace, repos→Repositories, config→Configuration, profile-mappings→AWS Profile Mappings, reports→Terraform Reports, cost→Cost Analysis, logs→System Logs, help→Documentation.
Groups: Operations / Configuration / Insights & Support. Sidebar: per-link icons; collapsed mode shows icon rail with tooltips + aria-labels (not blank); `aria-current="page"` on active; `<nav aria-label="Primary">`. Topnav quick links relabeled to match (Workspace→Repository Workspace etc. — keep the three quick links). Breadcrumb map updated to the same labels; "Settings" crumb → "Configuration".
- [x] Implement; update e2e label assertions; commit.

### Task 6: Operational Dashboard (Overview rewrite)

**Files:**
- Modify: `frontend/src/pages/Overview.tsx`, `frontend/src/pages/Overview.css`, e2e `overview.spec.ts`

Data: `GET /api/runs?page=1&limit=100` (counts labeled "last N runs" — honest scope), `GET /api/repos`, `GET /api/reports?limit=5`, `awsApi.identity()`.
Sections: header (title "Dashboard", desc, primary actions "Start Terraform Run" → #runs/new and "Open Repository Workspace" → #workspace); status tiles (Running/Succeeded/Failed/Denied/Cancelled counts, clickable → Run History with command/none filter); Needs attention list (recent failed/denied runs with links, AWS identity unavailable, no repositories configured → onboarding CTA); Recent runs table (command badge, repo, targets, status, started, duration, click → #runs selection by id? deep-link to #runs); Recent reports list; resource counts (repositories; link to Cost Analysis). Per-section loading skeleton, error + Retry, empty states. No fabricated data.
- [x] Implement; update overview.spec.ts; commit.

### Task 7: Semantic tokens, theme completeness, a11y polish

**Files:**
- Modify: `frontend/src/styles/cloudscape.css`, `frontend/src/styles/theme.css`

- [x] Add semantic aliases on :root and theme blocks: `--surface-canvas`, `--surface-raised`, `--surface-sunken`, `--text-muted`, `--focus-ring`, `--running`, `--neutral`; new components consume them.
- [x] Global `:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px }` (and remove outline-suppression if any).
- [x] Light-mode contrast: bump `--text-3` to #65737e-range (≥4.5:1 on white) and audit badge/amber text tokens.
- [x] `@media (prefers-reduced-motion: reduce)` kill transitions/animations.
- [x] Calendar/chips/dashboard tokens verified in light, dark, dim.
- [x] Commit.

### Task 8: Verification

- [x] `cd frontend && npx tsc --noEmit`
- [x] `cd frontend && npm test` (vitest)
- [x] `go test ./...`
- [x] `cd frontend && npm run build`
- [x] Playwright: `cd frontend && npm run test:e2e` (or targeted specs if environment-limited; report exactly what ran)
- [x] Fix regressions; final commit.
