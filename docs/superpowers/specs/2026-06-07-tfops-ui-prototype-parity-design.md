# tf9 UI — Prototype Parity Design

**Date:** 2026-06-07
**Status:** Approved (design); pending spec review
**Author:** brainstorming session

## 1. Goal

Bring the existing tf9 web UI up to parity with the high-fidelity HTML/CSS/JS
prototype delivered in `design_handoff_tf9/` (extracted from
`platform-companion.zip`). Preserve the prototype's information architecture,
layouts, and interactions while building on the project's existing stack.

## 2. Approach & Constraints (decided)

- **Foundation:** Keep the real `@cloudscape-design/components` library and the
  existing `AppLayout` / `TopNavigation` shell. **Approximate** the prototype's
  visual design using Cloudscape design tokens — do **not** adopt the prototype's
  parallel `cloudscape.css` token system, and do **not** serve the static
  prototype files. Match colors, structure, and behavior; pixel-identical
  rendering is explicitly out of scope.
- **Scope:** All page areas described in the handoff README, decomposed into 6
  phases.
- **Data:** Wire everything to the real Go backend (`/api/*` + SSE). The
  prototype's mock data (`data-*.js`), simulated streaming, and `localStorage`
  persistence are reference-only and are replaced by real endpoints.
- **Theme:** Unchanged — `applyMode` + `tf9-color-mode` localStorage key. Dark
  default, light toggle.

### Why this approach

The prototype's HTML/CSS is copyable but its JS is deliberately wired to fake
data (hardcoded sample runs, `setTimeout` "streaming", `localStorage` config,
no STS call). Rewriting that behavior against the real backend is ~80% of the
effort regardless of visual foundation, and is identical for any approach.
Building on the existing React + Cloudscape code reuses ~3,000 lines that already
work and are already wired to the backend, and gives accessibility and supported
components for free.

## 3. Current State (gap analysis)

### Already built and reused as-is
- SSE streaming, ANSI color parsing, env-section parsing, plan-count parsing,
  stat pills (`RunSplitPanel.tsx`).
- Fullscreen terminal overlay scaffold (no copy/download yet).
- dnd-kit drag-reorder (`SortableItem.tsx`), used in NewRunModal + Repos.
- Config read/write (`/api/config`, `/api/repos/{name}/config`), branch / pull /
  checkout flows, AWS profile listing.
- Pages exist: Runs, Repos, ConfigYaml, Reports, ReportViewer, Help.
- Per-target `disabled` flag already exists in `config.RepoTarget` and is already
  toggled + saved to `config.yaml` from the Repos page.

### Backend gaps (net-new work, all confirmed)
1. **`group` field** — `config.RepoTarget` has no `group`. Add
   `Group string \`yaml:"group,omitempty" json:"group,omitempty"\``. Flows through
   the existing `/api/repos/{name}/config` GET/PUT with no other handler change.
2. **STS identity endpoint** — no HTTP route exposes `get-caller-identity`.
   Add `GET /api/aws/identity`.
3. **force-unlock with per-target Lock IDs** — `RunRequest` and runner `Options`
   have no lock-IDs field; runner cannot run `terraform force-unlock`.

### Frontend gaps vs. prototype
- No Overview/hub page (app defaults to Runs; `Page` union has no `overview`).
- No STS badge / user email in topnav.
- New Run Modal: uses a Select for command (no chips + "More commands"), no
  per-target Lock ID inputs, no CLI preview rail, no env color dots / prod
  badge / per-target auto-approve.
- Runs split panel: no progress bar, no target dots, no Grid/Tabs/Merged parallel
  views; fullscreen modal lacks Copy/Download + traffic-light header.
- Reports history: no filter chips / Cards-vs-List toggle / change bars / target
  chips matching the prototype.
- Report viewer is minimal (52 lines) vs. prototype's summary strip + per-env
  collapsible terminals with copy/download.
- Repositories: no pipeline swim-lane view, no group, no edit modal, no
  pipeline-vs-table toggle.
- No toast/notification system.

## 4. Phased Design

Each phase is independently shippable. Phase 0 unblocks the rest.

### Phase 0 — Backend foundations

**0a. `group` on RepoTarget**
- Add `Group` field to `config.RepoTarget` (yaml/json `group,omitempty`).
- Mirror in `frontend/src/types.ts` `RepoTarget`.
- No handler changes; GET/PUT `/api/repos/{name}/config` already round-trips the
  struct.

**0b. STS identity endpoint**
- New `internal/aws` func, e.g. `Identity(profile string) (Identity, error)` that
  runs `aws sts get-caller-identity` and parses `{Account, Arn, UserId}`.
- New route `GET /api/aws/identity` (optional `?profile=`). Returns
  `200 {account, arn, userId}` on success, or an error envelope on failure
  (matching the existing `{error:{code,message}}` shape used by `api.ts`).

**0c. force-unlock per-target Lock IDs**
- Add `LockIDs map[string]string` (target name → lock id) to `RunRequest`
  (frontend `types.ts`) and the runner `Options`.
- In the runner, when `TfCommand == "force-unlock"`, run
  `terraform force-unlock -force <id>` for each selected target that has a lock
  id; targets without an id are skipped.
- Thread through `cmd/tf9/main.go` so the CLI supports it (flag for lock ids,
  e.g. `--lock-ids dev:abc,staging:def`).
- Tests: runner force-unlock command assembly; handler parsing of `lockIds`.

### Phase 1 — Shell, STS badge, Overview, polish

- **STS badge**: a custom `TopNavigation` utility rendering a colored dot + label
  with three states: `checking` (amber pulsing, shown ≥900ms on load),
  `ok` (green, "Authenticated"), `fail` (red, "Unauthenticated"). Calls
  `GET /api/aws/identity` on mount. Clicking re-checks.
- **User email** utility in the topnav (from a config/server-provided value, or a
  static placeholder if none is available — to be confirmed during impl).
- Keep the existing dark/light toggle utility.
- **Overview page**: add `{ id: 'overview' }` to the `Page` union, parse `#`/empty
  hash to overview, render a 2-column Cloudscape card grid linking to Runs,
  Reports, Repositories, Config YAML, Help. Make overview the default landing
  page (Runs remains reachable). The existing `FirstRun` empty-state can be folded
  into the overview when no repos exist.
- Light polish on ConfigYaml + Help to match prototype copy/structure.

### Phase 2 — New Run Modal upgrade

- **Command selection**: replace the command Select with a chip row
  (`init` · `plan` · `apply` · `destroy`) plus a "More commands" dropdown
  (validate, refresh, state list, output, import, taint, untaint, force-unlock).
- `apply` / `destroy` force Promotion mode and hide the Parallel option
  (partly present today).
- **force-unlock**: when selected, each *checked* target row shows an inline Lock
  ID text input; ids are collected into `LockIDs` and reflected in the CLI
  preview as `--lock-ids dev:abc,staging:def`.
- **Target rows**: colored env dot (prod=red, staging=amber, global=purple,
  dev=green; derived from name/dir/group), `prod` badge on production targets,
  per-target auto-approve toggle for `apply`.
- **CLI preview rail**: sticky right column showing the assembled `terraform`
  command with simple syntax highlighting (command blue, flags grey, values
  green) and an editable extra-flags input bound to `extraArgs`.
- **Disabled filtering**: targets with `disabled` in config are filtered out;
  empty groups are hidden. (Reads from `/api/repos/{name}/config`, not
  localStorage.)
- Group rows derive from the target `group` field (Phase 0a), falling back to the
  first directory segment.

### Phase 3 — Runs page + split panel upgrade

- **Runs table**: command color badges (plan=green, apply=orange, destroy=red,
  init=blue); pulsing dot on `running` rows.
- **Split panel body**: meta-strip → progress bar → target dots → output.
  - **Progress bar**: segmented (done=green, fail=red, running=blue animated),
    derived from parsed env-section statuses.
  - **Target dots**: pill chips per target (running=blue pulsing, done=green,
    fail=red, queued=grey), derived from the stream.
- **Parallel output views**: Grid / Tabs / Merged toggle.
  - Grid: terminal cards in a 2-col grid (1-col when side-docked).
  - Tabs: single terminal with a tab bar.
  - Merged: interleaved stream, each line prefixed with a colored `[env]` label.
- **Promotion output**: stacked collapsible per-target sections (close to today).
- **Fullscreen modal**: extend `FullscreenOverlay` with a macOS traffic-light
  header, a **Copy** button (plain text to clipboard), and a **Download** button
  (`{command}-{env}.txt`).

### Phase 4 — Repositories pipeline view

- **Repo list table**: name/path, mini pipeline preview (dot-and-arrow), enabled
  count, AWS profiles, Configure button.
- **Pipeline (swim-lane) view**: targets grouped by `group` (default = first dir
  segment). Each group is a horizontal lane of stage cards (order badge, drag
  grip, env name + color dot, directory, profile, region, account id,
  enable/disable toggle, edit button). Drag reorders stages within a group.
- **Table view** toggle: same data, sortable, with up/down reorder buttons.
- **Edit modal**: stage name, directory (read-only), AWS profile (select), region
  (select), account id, **pipeline group** (text input with datalist
  autocomplete of existing groups — changing it moves the stage between
  pipelines), require-manual-approval toggle.
- All changes persist to `config.yaml` via the existing `/config` PUT (including
  `group` and `disabled`). No localStorage.

### Phase 5 — Reports

- **Reports history**: toolbar with filter chips (All / Plan / Apply / Destroy,
  each with a count badge, blue when active) and a Cards / List view toggle.
  - Cards: responsive grid (3/2/1 col). Each card: command badge, run id, status
    pill, repo + branch, resource-change bar (add/change/destroy), stats +
    duration, target chips (max 2 + "+N more"), relative date.
  - List: full table; clicking a row opens the report viewer.
  - Wired to `GET /api/reports`.
- **Report viewer** (Plan/Apply/Destroy share one layout): sticky header with run
  metadata → summary strip (aggregated add/change/destroy) → per-env collapsible
  terminal sections with syntax-highlighted output, Copy + Download
  (`{command}-{env}.txt`). Blocks with changes auto-expand; no-change blocks start
  collapsed. Wired to `GET /api/reports/{name}/data`.

## 5. Cross-cutting

- **Toasts**: a small notification context provider rendering a Cloudscape
  `Flashbar` (or equivalent) with auto-dismiss (~1.9s). Used for save/copy/run
  feedback.
- **Color tokens**: reuse Cloudscape `--color-*` tokens plus the terminal token
  set already present in `RunSplitPanel`. No new global token system.
- **Env color mapping**: a shared helper maps env/group names to the dot colors
  (prod/staging/global/dev) used in both the New Run Modal and Repositories.

## 6. Risks / call-outs

- **Fidelity**: with Cloudscape components, chip shapes, the 40px topnav, and
  some spacing will not match the prototype pixel-for-pixel. This is accepted.
- **Per-target run state**: progress bar + target dots rely on per-target status.
  The backend does not expose structured per-target status; we derive it from the
  existing env-section stream parsing. If parsing proves insufficient for live
  promotion/parallel runs, a follow-up may add structured run status to the API
  (out of scope for this pass; noted as a risk).
- **User email source**: the topnav email has no obvious backend source today;
  resolved during Phase 1 implementation (config value or placeholder).

## 7. Out of scope

- Adopting the prototype's `cloudscape.css` token system or serving static
  prototype files.
- Structured per-target run-status API (only added if Phase 3 derivation fails).
- Any change to the Go build/embed pipeline beyond what `make build` already does.
