# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.


Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Build & Run Commands

```bash
# Full build (React frontend → embedded Go binary)
make build          # outputs ./tf9 binary
make build-ui       # rebuild frontend only (faster after Go-only changes)
make install        # installs to ~/.local/bin/tf9 by default

# Development
make dev            # runs Vite dev server (hot-reload frontend only, port 5173)
cd frontend && npm run build   # rebuild embedded assets without rebuilding Go

# Demo (no AWS/Terraform required)
make demo           # builds and serves with examples/sample-config.yaml at :8080

# Clean
make clean          # removes ./tf9 binary, node_modules, internal/web/dist

# Run tests
go test ./...
cd frontend && npx tsc --noEmit   # TypeScript type check

# Run the web UI
./tf9 serve       # http://127.0.0.1:8080 (auto-opens browser)
./tf9 serve --port 9090 --dir ~/reports

# CLI usage
./tf9 plan                     # run in CWD if it has .tf files, else scan subdirs
./tf9 plan dev                 # filter targets matching "dev"
./tf9 apply                    # terraform shows its own plan + "Enter a value:" prompt
./tf9 apply prod --force       # apply prod targets, pass -auto-approve (skip prompt)
./tf9 plan --parallel          # run up to four targets concurrently
./tf9 plan -r ctp-infra        # run against registered repo
./tf9 config repo list
./tf9 config target list --repo ctp-infra
```

## Demo

`make demo` builds the binary and starts the web UI pre-loaded with the example
repository under `examples/`. No AWS credentials or Terraform state are needed
to browse the UI — the example targets run real `terraform init/plan` against
the minimal `.tf` files in `examples/infrastructure/`.

To try plan runs manually with the example config:

```bash
./tf9 --config ./examples/sample-config.yaml plan --repo infrastructure
./tf9 --config ./examples/sample-config.yaml serve
```

## Architecture

**Two interfaces, one binary.** The `./tf9` CLI and the `tf9 serve` web UI both live in the same binary. The web UI is a React SPA compiled by Vite and embedded into `internal/web/dist` via Go's `//go:embed`. The server (`internal/server`) mounts the React bundle at `/` and the REST API at `/api/`.

### Go packages

| Package | Responsibility |
|---|---|
| `cmd/tf9/main.go` | All CLI commands (cobra). `runTerraform` is the entry point for every `terraform *` subcommand. |
| `internal/runner` | Core execution engine: discovers environment directories, resolves AWS profiles, runs `terraform` processes, captures output, writes HTML reports. Sequential promotion or `--parallel`. |
| `internal/api` | HTTP handlers for `/api/*` + `RunManager`. The manager owns in-memory run state, streams output via SSE, and persists run history to `~/.config/tf9/runs.json`. |
| `internal/config` | Reads/writes the shared YAML configuration at `~/.config/tf9/config.yaml`, including repositories and ordered Terraform targets. Migrates legacy config files. |
| `internal/git` | Thin wrappers around `git` commands: diff, log, worktree, cherry-pick, rebase, merge, pull. |
| `internal/aws` | AWS SSO session management: checks `aws sts get-caller-identity`, triggers `aws sso login` when expired. |
| `internal/report` | Generates self-contained HTML plan reports; parses report filenames for the UI. |
| `internal/server` | `http.ServeMux` wiring, PID-file management for single-server-per-user, SSE for live report updates. |

### Key design constraints

- The React dist (`internal/web/dist/`) must be rebuilt before `go build` when frontend changes. `make build` handles this; `go build` alone will embed the old dist.
- `runner.Run` is used by both the CLI (`cmd/tf9/main.go`) and the web API (`internal/api/manager.go`). The `Output io.Writer` field distinguishes CLI (nil → stdout) from web (lineWriter → SSE buffer).
- `safeJoin` in `internal/api/handlers.go` guards all file-path construction against path traversal. Always use it.
- Never import `@cloudscape-design/components` — the pixel-port intentionally removed that dependency.
- **CWD mode**: `collectDirs` in `internal/runner/runner.go` checks if `SearchRoot` itself is a valid terraform directory before scanning subdirectories. This lets `tf9 plan/apply` work from any terraform module directory without a configured repo.
- **CLI approval gate**: `runTerraform` does NOT add `-auto-approve` unless `--force` is passed. For interactive CLI runs the runner wires `cmd.Stdin = os.Stdin` so terraform's own `Enter a value:` prompt is shown and handled natively. The web UI path uses `InputCh` + `approvalMonitor` to intercept the same prompt over SSE.

### Target execution order

Repository targets execute in YAML list order. `apply` stops on the first
failure. `--parallel` uses at most four workers and is forbidden for
`apply`/`destroy`.

---

## Runner — `internal/runner`

### `runner.Options`

| Field | Type | Purpose |
|---|---|---|
| `SearchRoot` | `string` | Root directory to scan for Terraform environments |
| `RepoLabel` | `string` | Display label used in output headers |
| `TfCommand` | `string` | Terraform subcommand (plan, apply, destroy, state, …) |
| `TfArgs` | `[]string` | Extra arguments passed after the subcommand |
| `EnvFilter` | `string` | Comma-separated target name filter |
| `ProfileOverride` | `string` | AWS profile override for all targets |
| `NonprodOnly` | `bool` | Skip targets whose names start with `prod` |
| `ReportDir` | `string` | Directory for HTML reports; `"-"` disables |
| `ExplicitTargets` | `[]config.RepoTarget` | Ordered targets from repo config; bypasses `collectDirs` |
| `Output` | `io.Writer` | When non-nil, runner is headless — output goes here (web SSE buffer) instead of stdout |
| `Ctx` | `context.Context` | Controls timeout and cancellation |
| `Parallel` | `bool` | Run up to four targets concurrently |
| `PromotionOrder` | `[]string` | Sequential promotion order (web UI) |
| `LockIDs` | `map[string]string` | Per-target lock IDs for force-unlock |
| `ImportAddrs` | `map[string]ImportSpec` | Per-target import address/id pairs |
| `AutoApprove` | `bool` | Adds `-auto-approve` to apply/destroy args |
| `InputCh` | `<-chan string` | Channel for mid-run stdin (web approval gate) |
| `SkipApply` | `map[string]bool` | Env labels whose apply is skipped (no plan changes); auto mode |
| `Stdin` | `io.Reader` | If set, wired to terraform's stdin (CLI interactive mode) |

### Approval flow (mid-run)

When `AutoApprove` is false and `InputCh` is non-nil (web UI path), the runner
wraps the output writer in an `approvalMonitor`. The monitor scans the byte
stream for `"Enter a value:"`, emits the `__TF9_APPROVAL__` sentinel line to
the SSE stream, then blocks on `InputCh` until the frontend sends `"yes"` or
`"no"`. The value is written directly to terraform's stdin pipe.

For the CLI path, see **CLI approval gate** under Key design constraints —
terraform's own prompt is handled natively via `Options.Stdin`.

### `ApprovalSentinel`

```go
const ApprovalSentinel = "__TF9_APPROVAL__"
```

Emitted as a regular output line. Filtered from display on the frontend
(`displayLines` in `RunSplitPanel.tsx`). Triggers the amber approval bar.

---

## API — `internal/api`

### `RunStatus` values

```go
StatusRunning  RunStatus = "running"
StatusSuccess  RunStatus = "success"
StatusFailed   RunStatus = "failed"
StatusDenied   RunStatus = "denied"   // user clicked Deny on approval gate
StatusCancelled RunStatus = "cancelled"
```

### `Run` struct (key fields)

```go
type Run struct {
    ID         string
    Status     RunStatus
    Request    RunRequest
    // ...
    inputCh chan string  // receives "yes"/"no" from POST /api/runs/{id}/input
    denied  bool        // set when SendInput receives a non-"yes" value
}
```

`denied` is checked in the run goroutine's finish logic. A non-zero terraform
exit code sets `StatusDenied` instead of `StatusFailed` when `denied` is true.

### REST API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/runs` | List runs (paginated: `?page=1&limit=20`; optional filters `from`/`to` RFC3339 inclusive + repeated `command=`, applied before pagination; malformed values → 400) |
| `POST` | `/api/runs` | Start a new run |
| `GET` | `/api/runs/{id}` | Get a single run |
| `GET` | `/api/runs/{id}/stream` | SSE stream of output lines |
| `POST` | `/api/runs/{id}/cancel` | Cancel a running run |
| `POST` | `/api/runs/{id}/input` | Send `{"value":"yes"/"no"}` to the approval gate |
| `GET` | `/api/repos` | List configured repositories |
| `POST` | `/api/repos` | Add a repository |
| `DELETE` | `/api/repos/{name}` | Remove a repository |
| `PATCH` | `/api/repos/{name}` | Rename a repository |
| `GET` | `/api/repos/{name}/browse` | Browse directory tree |
| `GET` | `/api/repos/{name}/config` | Get repo-specific run config |
| `PUT` | `/api/repos/{name}/config` | Save repo-specific run config |
| `GET` | `/api/config` | Get raw YAML config |
| `PUT` | `/api/config` | Save raw YAML config |
| `GET` | `/api/aws/profiles` | List AWS CLI profiles |
| `GET` | `/api/aws/identity` | Get current AWS caller identity |
| `POST` | `/api/aws/sso-login` | Trigger `aws sso login` (SSE stream) |
| `GET` | `/api/reports` | List HTML plan reports |
| `GET` | `/api/reports/{name}` | Get report data |
| `DELETE` | `/api/reports` | Delete a report |

### SSE stream format

Each SSE event is a JSON line:

```json
{"line": "some output text"}
{"done": true, "success": true}
{"done": true, "success": false}
```

The sentinel `__TF9_APPROVAL__` is delivered as a regular `line` event and
filtered on the frontend before display.

---

## Frontend (plain React — no Cloudscape)

The UI was pixel-ported off AWS Cloudscape onto a hand-rolled design system that
matches the original prototype in `design_handoff_tf9/`. All Cloudscape
component imports have been removed.

- **Framework:** React 18 + TypeScript, built with Vite
- **UI library:** None — plain JSX + custom CSS (`frontend/src/styles/`)
- **Theming:** `html[data-theme="dark"|"light"]` attribute; toggled in topnav, persisted to `localStorage` key `tf9-color-mode`. FOUC-prevention script in `index.html` sets the attribute before first paint.
- **State:** Component-local React state only — no Redux/Zustand
- **Routing:** Hash-based, driven by the `Page` union type in `types.ts`
- **API:** All calls go through `frontend/src/api.ts` helper wrappers
- **Context:** `NavContext` (via `nav.tsx`) provides `page`, `navigate`, `mode`, `toggleTheme`, `userEmail` to every component

### Routes

| Hash | Page |
|---|---|
| `#overview` (default) | Dashboard (operational overview) |
| `#runs` | Run History (`#runs?from=…&to=…&command=…` carries filters) |
| `#runs/new` | Opens New Run Modal over the run history |
| `#repos` | Repositories |
| `#config` | Configuration (YAML editor) |
| `#reports` | Terraform Reports list |
| `#report/<name>` | Report viewer |
| `#help` | Documentation |

Visible navigation labels (route IDs unchanged): Dashboard, Run History,
Repository Workspace, Repositories, Configuration, AWS Profile Mappings,
Terraform Reports, Cost Analysis, System Logs, Documentation — grouped in the
sidebar as Operations / Configuration / Insights & Support.

### Key files

| File | Purpose |
|---|---|
| `frontend/src/api.ts` | All HTTP calls — thin wrappers around `req<T>()` |
| `frontend/src/types.ts` | Shared TypeScript types (`RunStatus`, `RunRequest`, `Page`, etc.) |
| `frontend/src/nav.tsx` | `NavContext` — provides `page`, `navigate`, `mode`, `toggleTheme` |
| `frontend/src/Shell.tsx` | Topnav + sidenav + breadcrumbs layout |
| `frontend/src/pages/` | Page components — `Overview`, `Runs`, `Repos`, `ConfigYaml`, `Reports`, `ReportViewer`, `Help` |
| `frontend/src/components/` | `Shell`, `StsBadge`, `NewRunModal`, `RunSplitPanel`, `Terminal`, `ToastProvider`, `ConfirmModal` |
| `frontend/src/lib/` | Pure utilities — `colors`, `identity`, `relativeTime`, `repoPreview`, `reportHelpers`, `runPreview`, `runStatus` |
| `frontend/src/styles/cloudscape.css` | Design tokens (CSS custom properties) for light mode — color palette, spacing, shadows. Named after the original prototype tokens. |
| `frontend/src/styles/theme.css` | Dark/light overrides applied via `html[data-theme]` selector. Load after `cloudscape.css`. |

`Shell.tsx` renders the topnav + sidenav + breadcrumbs layout as plain JSX — no Cloudscape `AppLayout`, `TopNavigation`, or `SideNavigation`. The split-panel props on `ShellProps` are kept for source compatibility with pages that still pass them; they are no-ops until used.

### CSS variables

All colors and spacing live in `styles/cloudscape.css` under `:root`. Dark
overrides are in `styles/theme.css` under `html[data-theme="dark"]`.
Do not hardcode color values in component CSS — always use `var(--token)`.

Key tokens: `--blue`, `--green`, `--red`, `--amber`, `--surface-1`,
`--surface-2`, `--surface-3`, `--border`, `--text-1`, `--text-2`.

### `RunSplitPanel.tsx`

The live terminal component. Key behaviours:

- `APPROVAL_SENTINEL` is defined at **module scope** (not inside the component).
  Moving it inside the component causes a Temporal Dead Zone crash.
- `displayLines` filters sentinel lines before rendering.
- `sentinelCountRef` tracks how many sentinels have been seen so far; a new one
  triggers `setApprovalPending(true)`.
- Approval bar is only shown when `approvalPending && run?.status === 'running'`.
- After the user submits, `setApprovalPending(false)` is called immediately;
  the bar disappears regardless of whether terraform has processed the input yet.

### `NewRunModal.tsx`

Do not introduce Unicode curly quotes (`"` `"`) in JSX string literals — the
Edit tool can corrupt them. Use straight ASCII quotes only.

---

## Config files (`~/.config/tf9/`)

| File | Purpose |
|---|---|
| `config.yaml` | Repositories and ordered targets with directory, AWS profile, optional account ID/region, and disabled flag |
| `runs.json` | Persisted run history (last 200, capped at 5000 lines each) |
| `reports/` | HTML plan report files |
| `serve.pid` | PID of running `tf9 serve` process (killed on next `serve`) |

---

## Non-negotiable rules

- No command injection — user input is never interpolated into shell strings.
  Always use exec arrays (`exec.Command(bin, args...)`), never `sh -c`.
- No path traversal — use `safeJoin` for all file paths derived from API input.
- No credentials in logs or API responses.
- Exit code 0 = clean success only; non-zero on any failure.
- `--force` / explicit confirmation required for apply/destroy.
- Never skip the `safeJoin` check on report file names.

## Error handling and application logging

Every error that crosses a function boundary must either be returned to the
caller **or** logged via `slog` — never silently discarded.

**Rules:**
- Never write `_ = someCall()` for calls that return an error unless the error
  is structurally impossible (e.g. `bytes.Buffer.Write`, `strconv.Atoi` on a
  regex-captured numeric string). If in doubt, log it.
- Never leave an `if err != nil` block empty. At minimum add a `slog` call.
- Use the right level: `slog.Error` for data-loss / crash-worthy failures;
  `slog.Warn` for degraded / recoverable paths; `slog.Debug` for intentional
  best-effort operations where failure is expected and harmless.
- Log at the point of detection, not higher up the call stack, to preserve
  context. Include relevant identifiers (`"profile"`, `"path"`, `"err"`) as
  key-value pairs.
- Do not log credentials, tokens, or full environment contents — profile names
  and error messages are fine; AWS secret values are not.
- The application logger is `log/slog` (stdlib). Calls go to `~/.config/tf9/tf9.log`
  (server: file + stderr; CLI: file-only). No `fmt.Fprintf(os.Stderr, ...)` for
  internal errors — route everything through slog so it lands in the log file.

**Practical checklist when adding or editing code:**
1. Does every `if err != nil` either `return err` or call `slog.*`?
2. Are all `_ = call()` usages genuinely safe to ignore?
3. Does every new function that can fail return an error (or log if it can't)?

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
