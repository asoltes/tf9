# tfops UI Redesign — Design Spec

**Date:** 2026-06-07  
**Source:** `design_handoff_tfops/` (inside `platform-companion.zip`)  
**Approach:** Option A — frontend-first with dual-format SSE detection, backend structured SSE as follow-on.

---

## Goals

Implement the high-fidelity design handoff into the existing React + Cloudscape codebase. Preserve all existing functionality while adding:

1. STS authentication badge in topnav
2. Grid / Tabs / Merged terminal views in the split panel (parallel runs)
3. Progress bar + target dot chips in the split panel
4. Full pipeline group swim-lane view in Repositories
5. `localStorage`-based disabled/group overrides, filtered in New Run Modal
6. Per-target Lock ID inputs in New Run Modal (`force-unlock`)
7. CLI preview rail in New Run Modal
8. Reports page redesign (filter chips, cards view, list view)
9. Toast notification system
10. macOS traffic light dots + copy/download in fullscreen terminal
11. Single `tfops.css` custom token file

---

## Non-Goals

- Changing the Go backend in this pass (backend SSE structured format is a follow-on)
- Changing the config.yaml schema
- Adding new API endpoints (STS badge uses existing `/api/aws/profiles`)

---

## File Structure

### New files
```
frontend/src/tfops.css                    Custom tokens + terminal/pipeline/toast CSS
frontend/src/components/StsAuthBadge.tsx  Topnav STS pill (checking/ok/fail)
frontend/src/components/ToastContainer.tsx Slide-up toast system + useToast context
frontend/src/components/TerminalCard.tsx  Shared terminal card (header + pre body)
frontend/src/components/FullscreenTerminal.tsx  Full-page overlay with copy/download
frontend/src/components/PipelineView.tsx  Horizontal swim-lane group view
frontend/src/components/PipelineTableView.tsx Sortable table view
frontend/src/components/StageEditModal.tsx Edit modal with group override
frontend/src/hooks/useRepoOverrides.ts    localStorage tfops-repo-overrides CRUD hook
```

### Modified files
```
frontend/src/main.tsx                     Import tfops.css
frontend/src/App.tsx                      Add StsAuthBadge to TopNavigation utilities
frontend/src/types.ts                     Add RunTarget, TargetStatus, LocalOverrides types
frontend/src/pages/Runs.tsx               Add Mode column, pulsing running-row dot
frontend/src/pages/Repos.tsx              Full replacement — pipeline + table views
frontend/src/pages/Reports.tsx            Full replacement — filter chips + cards/list
frontend/src/pages/ReportViewer.tsx       Add copy/download per env block
frontend/src/components/RunSplitPanel.tsx Full replacement — new split panel
frontend/src/components/NewRunModal.tsx   Full replacement — two-col + CLI preview
```

---

## CSS Strategy

**`frontend/src/tfops.css`** is imported once in `main.tsx`. It defines:

```css
/* Terminal card tokens — light mode */
:root {
  --tc-bg: #f6f8fa;
  --tc-head: #edf0f3;
  --tc-border: #d0d7de;
  --tc-text: #24292f;
  --tc-add: #1a7f37;
  --tc-del: #cf222e;
  --tc-change: #9a6700;
  --tc-plan: #0550ae;
  --tc-error: #cf222e;
}

/* Terminal card tokens — dark mode (Cloudscape sets data-mode=dark on <html>) */
[data-mode="dark"] {
  --tc-bg: #0b1220;
  --tc-head: #101a2b;
  --tc-border: #1d2736;
  --tc-text: #c9d1d9;
  --tc-add: #3fb950;
  --tc-del: #f85149;
  --tc-change: #d29922;
  --tc-plan: #58a6ff;
  --tc-error: #ff7b72;
}

/* Pipeline swim-lane layout */
/* Toast animation */
/* New Run Modal two-column layout */
/* Pulsing dot animation */
```

Cloudscape's own dark/light theming is already handled by `applyMode()` in `App.tsx`. We hook `tfops.css` onto Cloudscape's `data-mode` attribute (which Cloudscape sets on `<html>`) rather than a separate `data-theme` attribute.

---

## Component Specs

### `StsAuthBadge`

```
States: checking | ok | fail
Storage: localStorage['tfops-sts-auth'] → persists last known state
On mount:
  1. Read localStorage → show that state immediately (no flash)
  2. After 900ms: call GET /api/aws/profiles
     - success → state = ok
     - error (401/network) → state = fail
  3. Persist new state to localStorage
Props: none (reads/writes its own localStorage)
Visual:
  - Pill: height 28px, border-radius 999px, border 1px solid rgba(255,255,255,.14)
  - Dot: 7×7px circle; ok = green with box-shadow glow; checking = amber pulsing; fail = red
  - Text: 12px, weight 600
  - Placed in TopNavigation utilities array as iconUrl + text element
```

### `TerminalCard`

```
Props:
  env: string           — environment name
  profile: string       — AWS profile
  lines: string[]       — output lines (ANSI-capable)
  status: 'running' | 'done' | 'fail' | 'queued'
  counts?: PlanCounts   — +add ~change -destroy
  onExpand: () => void  — opens FullscreenTerminal

Structure:
  tc-head (--tc-head bg):
    colored dot (status-colored, pulsing if running) + env name + profile
    stat pills (counts)
    expand button (⤢)
  tc-body (--tc-bg, --tc-text, monospace):
    <pre> max-height 300px, auto-scroll on new lines
    renderLine() with ANSI + fallback color logic (reused from existing RunSplitPanel)
```

### `FullscreenTerminal`

```
Props:
  title: string         — "envName · profile"
  lines: string[]       — live-updating
  command: string       — for download filename
  env: string           — for download filename
  onClose: () => void

Structure:
  backdrop: position fixed, inset 0, blur(5px), z-index 9000
  modal: max-width 1140px, max-height 780px, centered, border-radius 14px
  header:
    traffic light dots (red=#ff5f57, yellow=#ffbd2e, green=#27c93f) — decorative only
    title + stat pills
    Copy button: navigator.clipboard.writeText(lines.join('\n')) → toast "Copied"
    Download: Blob + URL.createObjectURL → <a download> click → {command}-{env}.txt
    ✕ close button
  body:
    <pre> flex:1, --tc-bg, --tc-text, monospace, overflowY auto
    auto-scroll to bottom on new lines
  Close triggers: Esc key, backdrop click, ✕ button
  Enter animation: opacity 0 + scale(.97) → opacity 1 + scale(1), 150ms ease
```

### `RunSplitPanel` (replacement)

```
Props: unchanged (runId, onStatusChange, onRerun)

State:
  envLines: Map<string, string[]>    per-env demultiplexed lines
  rawLines: string[]                 all lines (for merged view + single-env fallback)
  viewMode: 'grid' | 'tabs' | 'merged'   parallel mode only
  activeTab: string                  tabs view active env
  targetStatuses: Map<string, 'running'|'done'|'fail'|'queued'>

SSE dual-format handler:
  onmessage = (e) => {
    try {
      const { env, line } = JSON.parse(e.data);
      envLines[env].push(line);
    } catch {
      rawLines.push(e.data);
      re-parse via parseEnvSections(rawLines) → update envLines
    }
  }

Layout (top to bottom):
  1. Meta strip: command badge, status, repo, branch, duration, View Report link, Re-run/Cancel
  2. Progress bar: 8px height, 3 segments (done=green, fail=red, running=blue animated)
  3. Target dots: pill chips per target with status dot
  4. View toggle (parallel only): Grid | Tabs | Merged segmented control
  5. Output area:
     - Promotion mode: stacked collapsible TerminalCards (sequential, collapsed after done)
     - Parallel / Grid: 2-col grid of TerminalCards (1-col if side panel narrow)
     - Parallel / Tabs: tab bar + single TerminalCard for active tab
     - Parallel / Merged: single terminal, each line prefixed [envName] in env color
```

### `NewRunModal` (replacement)

```
Trigger: visible prop → renders as fixed overlay (not Cloudscape Modal)
Z-index: 8000

Layout:
  Two columns side-by-side:
    Left (flex:1, scrollable, max-width ~680px):
      Command chips: init · plan · apply · destroy (pill buttons, one active at a time)
      More commands dropdown: validate, refresh, state list, output, import, taint, untaint, force-unlock
      Repo dropdown + branch selector with ahead/behind badge + Pull button
      Run mode tiles: Promotion | Parallel (Parallel hidden when cmd=apply/destroy)
      Targets section (grouped by pipeline group, collapsible per group):
        Each target row: checkbox + drag grip (promotion mode) + env dot + env name + profile + prod badge
        force-unlock: adds inline Lock ID <input> below env name for each checked target
        apply mode: adds auto-approve toggle per target
      Disabled targets (from localStorage) are filtered out; empty groups hidden
    Right (sticky, ~340px, padding-left 28px):
      CLI Preview heading
      <code> block with syntax-highlighted command:
        blue: terraform + subcommand
        grey: flag names (-chdir, --auto-approve, --lock-id)
        green: values (dir, env names, lock IDs)
      Extra flags <input> editable inline
      Run button at bottom of rail

Command behavior:
  apply/destroy → force runMode=promotion, hide parallel option
  force-unlock → show Lock ID input per checked target
  plan/init/validate → all options available

Submission: same API as current (POST /api/runs), lockIds passed in extraArgs as --lock-id=dev:abc123
localStorage filter: on open, read tfops-repo-overrides, filter disabled=true targets before rendering
```

### `PipelineView`

```
Data source:
  Server: RepoConfig.targets[] (canonical order + profile/region/account)
  localStorage: tfops-repo-overrides[`${repo}:${target.name}`] → { disabled, group }
  Effective group = localStorage.group || first segment of target.directory (e.g. "environments/dev" → group "environments")
  Note: the current toGroupRows() uses the *last* segment — this is a behavior change to match the design spec.

Rendering:
  Groups: Map<group, RepoTarget[]> sorted by group then target order
  Each group = .pipeline-lane (horizontal flex):
    Group label (left, rotated 90°)
    Stage cards (flex row, horizontally scrollable):
      order badge (1,2,3…)
      drag grip (horizontal @dnd-kit)
      env dot (prod=red, staging=amber, global=purple, dev=green by name heuristic)
      target name + directory
      AWS profile + region + account
      enabled/disabled toggle → writes localStorage immediately
      edit button → opens StageEditModal

Drag reorder: within a group only (horizontal). On drop: update cfgTargets order + POST save.
Add stage button: opens a browse modal to pick a directory → add with defaults.
```

### `StageEditModal`

```
Fields:
  Stage name (text input)
  Directory (read-only code)
  AWS profile (Autosuggest from /api/aws/profiles)
  Region (text input)
  Account ID (text input)
  Pipeline group (text input with datalist of existing group names)
    → changing this updates localStorage group override for this target
  Require manual approval (toggle) — reserved, not currently wired to backend

On save: update cfgTargets state, save to server via PUT /api/repos/:name/config,
         update localStorage group override if group field changed.
```

### `ToastContainer`

```
Context: ToastContext provides toast(message, type='info'|'success'|'error') function
Placement: fixed, bottom-right, z-index 10000
Each toast:
  max-width 360px, border-radius 8px, padding 12px 16px
  type-colored left border (3px solid)
  slide-up enter: translateY(20px)→0 + opacity 0→1, 200ms ease-out
  auto-dismiss: 1.9s → slide-down + fade out
  manual dismiss: ✕ button
ToastContext.Provider wraps <App> in main.tsx
```

### `useRepoOverrides` hook

```typescript
type TargetKey = string; // `${repoName}:${targetName}`
interface TargetOverride { disabled: boolean; group: string; }
type Overrides = Record<TargetKey, TargetOverride>;

const STORAGE_KEY = 'tfops-repo-overrides';

// Returns [overrides, setOverride, isDisabled, getGroup]
// setOverride(key, patch) merges patch into stored overrides + triggers re-render
// isDisabled(repo, target) → bool
// getGroup(repo, target) → string ('' = use default)
```

### `Reports` page (replacement)

```
Layout:
  Toolbar: filter chips (All | Plan | Apply | Destroy) with count badges
           View toggle: Cards | List (segmented control)
  Content: depends on view toggle

Cards view (default):
  3-col responsive grid (2-col <1100px, 1-col <700px)
  Each card:
    Command badge + Run ID + status pill
    Repo + branch with git icon
    Resource change bar: 3-segment horizontal bar (green=add, amber=change, red=destroy)
    Stats: +add ~change -destroy + duration
    Target chips (max 2 visible, "+N more" overflow)
    Relative date (e.g. "2 hours ago")
    Click → navigate to report viewer

List view:
  Full-width Cloudscape Table with columns:
    Run ID | Command | Status | Repo | Branch | +/~/- | Targets | Duration | Date
  Click row → navigate to report viewer

Filtering: client-side on the fetched reports array
```

---

## Types additions (`types.ts`)

```typescript
export type TargetStatus = 'running' | 'done' | 'fail' | 'queued';

export interface RunTarget {
  name: string;
  profile: string;
  status: TargetStatus;
}

export interface LocalOverride {
  disabled: boolean;
  group: string;
}

// Extends existing Run type:
// run.mode?: 'promotion' | 'parallel'   — new field from API
// run.targets?: RunTarget[]             — new field from API (parallel demux)
```

---

## Backend follow-on (out of scope for this pass)

When the Go backend is updated to emit structured SSE:
- Change `lineWriter` in `internal/api/manager.go` to emit `{"env":"dev","line":"..."}` JSON
- The frontend's dual-format handler picks this up automatically with no further changes
- Per-target `status` events could also be added: `{"type":"status","env":"dev","status":"done"}`

---

## Interactions & Animations

| Interaction | Implementation |
|---|---|
| STS badge on load | 900ms setTimeout → API call → state update |
| Pulsing running dot | `@keyframes pulse` opacity 1→0.3→1, 1.4s infinite |
| Terminal expand | `scale(0.97) opacity(0)` → `scale(1) opacity(1)`, 150ms ease |
| Progress bar running segment | `@keyframes shimmer` background-position animation |
| Toast slide-up | `translateY(20px)` → `translateY(0)`, 200ms ease-out |
| Stage card drag | @dnd-kit horizontal strategy, ghost clone + placeholder |
| Theme toggle | Cloudscape `applyMode()` sets `data-mode` on `<html>`; tfops.css responds to it |
| localStorage writes | Synchronous in event handlers; no debounce needed (small data) |

---

## Acceptance Criteria

- [ ] STS badge shows in topnav: checking → ok/fail within 2s of load
- [ ] Dark/light toggle applies to both Cloudscape components and terminal card tokens
- [ ] Parallel run split panel shows Grid view by default, switches to Tabs/Merged on toggle
- [ ] Progress bar and target dots update as run progresses
- [ ] Fullscreen terminal: copy copies plain text, download saves `{cmd}-{env}.txt`
- [ ] New Run Modal: `apply`/`destroy` force Promotion mode; `force-unlock` shows per-target Lock ID inputs
- [ ] New Run Modal: CLI preview updates live as form state changes
- [ ] New Run Modal: disabled targets (from localStorage) are absent from the target list
- [ ] Repos pipeline view: enable/disable toggle writes localStorage immediately
- [ ] Repos pipeline view: group override in edit modal moves a target to a different pipeline
- [ ] Reports page: filter chips count and filter correctly; cards/list toggle works
- [ ] Toast appears on successful run creation, copy action
- [ ] All interactions work in both dark and light mode
