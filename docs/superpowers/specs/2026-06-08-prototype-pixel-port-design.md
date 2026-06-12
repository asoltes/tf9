# Design: Verbatim pixel-port of the tf9 prototype

**Date:** 2026-06-08
**Branch:** `feat/prototype-pixel-port`
**Status:** Approved — in implementation

## Goal

Replace the current Cloudscape-React presentation layer with a 1:1 visual
reproduction of the prototype in `design_handoff_tf9/`, while keeping every
page wired to the **real Go backend** (`/api/*`, live SSE, real
`config.yaml` / run history). The prototype's mock `data-*.js` files and
localStorage simulations are **visual/behavioral reference only — not shipped**
(except where the prototype intentionally uses localStorage as a real contract:
`tf9-color-mode`, `tf9-repo-overrides`).

## Two locked decisions

1. **Port the prototype CSS verbatim.** Drop the real
   `@cloudscape-design/components` / `global-styles` library. Bring the
   prototype's `cloudscape.css` + `theme.css` tokens into the React app and
   rebuild each page with plain JSX that matches the prototype's exact HTML/CSS.
   This is the only path to genuine pixel parity. Keep `@dnd-kit/*` for drag.
2. **Keep all real backend integration.** Pixel-copy visuals only; data keeps
   flowing through existing `api.ts` / `types.ts`.

## Architecture

### Foundation (shared — must land first)
- Copy `design_handoff_tf9/cloudscape.css` and `theme.css` **verbatim** into
  `frontend/src/styles/`. These define every token (`--bg-layout`,
  `--container`, `--radius-c`, `--shadow-c`, terminal tokens…) and base classes
  (`.topnav`, `.sidenav`, `.btn`, `.badge`, `.table`, `.crumbs`, …).
- Add Open Sans (Google Fonts) in `index.html`.
- Add the FOUC-preventing theme init (`theme.js` logic) inline in
  `index.html` `<head>` — reads `tf9-color-mode` before paint, sets
  `html[data-theme]`. Default follows `prefers-color-scheme`.
- Remove `@cloudscape-design/global-styles` import from `main.tsx`.
- Rewrite `Shell.tsx` + `nav.tsx` as plain JSX matching the prototype topnav
  (40px dark `#0f1b2a` bar: brand SVG `#ff9900` + "tf9", Runs/Reports links,
  theme toggle, STS badge, user email) and 280px sidenav (Overview, Runs,
  Settings → Repositories/Config YAML, Reports, Help). Hash routing preserved
  per the `Page` union in `types.ts`.
- Port `sts.js` into a React `StsBadge` component (checking/ok/fail pill, exact
  visuals + ~900ms checking animation) **wired to the real `awsApi` identity
  call**, not the localStorage toggle.

### Per-page rebuild
Each page is rebuilt from the prototype HTML with its own scoped CSS file
co-located and imported per page. **Data stays real** — keep the existing
`api.ts` fetching in each page and map real `Run` / `Report` / `Repo` /
`RepoTarget` fields into the prototype markup.

| Page | Prototype source | Real data |
|---|---|---|
| Overview | `index.html` | static |
| Runs + split panel + terminal modal | `runs/Runs.html`, `runs-history.{js,css}`, `run.css` | `api` runs list + SSE stream |
| New Run modal | `runs/New Run Modal.html`, `run.js`, `run.css` | `configApi` targets, `api.start` |
| Repositories | `repos/Repositories.html`, `app.js` | `configApi` repos/targets |
| Config YAML | `config/Config YAML.html`, `editor.{js,css}` | `configApi` raw yaml |
| Reports history | `reports/Reports.html`, `reports-history.{js,css}` | `reportsApi` list |
| Report viewer | `reports/{Plan,Apply,Destroy} Report.html`, `report.{js,css}` | `reportsApi` data |
| Help | `help/Help.html` | static |

### Behaviors ported (faithful, backed by real data)
- **Runs split panel:** bottom/side dock toggle + drag-resize handle
  (ns-/ew-resize); progress bar (done/fail/running segments); target dots;
  output views — Grid/Tabs/Merged (parallel) and collapsible stacked sections
  (promotion); fed by live SSE.
- **Fullscreen terminal modal:** scale-in (opacity 0 + scale .97 → 1, 150ms),
  macOS traffic-light header, Copy + Download `{command}-{env}.txt`, close via
  Esc / backdrop / ✕.
- **New Run modal:** command chips (init/plan/apply/destroy) + More-commands
  dropdown; apply/destroy force Promotion and hide Parallel; per-target Lock ID
  inputs for `force-unlock` (CLI `--lock-ids dev:abc,staging:def`); sticky CLI
  preview rail with token highlighting (cmd=blue, flag=grey, value=green);
  disabled targets filtered out via `tf9-repo-overrides`.
- **Repositories:** pipeline swim-lanes grouped by `group` (default = first dir
  segment) + table view toggle; drag-to-reorder stages; enable/disable toggle +
  group override persisted to `tf9-repo-overrides` localStorage
  (`{ "repo:env": { "disabled": bool, "group": "" } }`); edit modal with
  group datalist autocomplete.
- **Config YAML editor:** gutter, syntax highlight, current-line, validation +
  problems pane, copy button.
- **Toasts:** slide-up, auto-dismiss 1.9s.
- **Theme toggle:** `html[data-theme]` swap persisted to `tf9-color-mode`.

## Execution plan (phased)

Phase 1 is the dependency root and lands first. Phases 2–6 are largely
independent (each owns its page file(s) + scoped CSS) and can run in parallel
once Phase 1 is merged.

1. **Foundation** — fonts, `cloudscape.css`/`theme.css` verbatim, theme init,
   Shell, sidenav, `StsBadge`, Overview hub. Removes Cloudscape from the shell.
2. **Help + Config YAML** — lower-interaction pages + editor.
3. **Repositories** — pipeline/table/drag/persistence/edit modal.
4. **Reports history + Report viewer**.
5. **Runs page + split panel + terminal modal**.
6. **New Run modal**.
7. **Cleanup** — remove unused `@cloudscape-design/*` deps from
   `package.json`; `make build` verification.

## Verification

- `make build` succeeds (rebuilds embedded `internal/web/dist`).
- Each page visually diffed against its prototype HTML opened side-by-side,
  light **and** dark mode.
- Live data still flows on Runs / Reports / Repositories (real backend).
- `cd frontend && npm run build` clean (no TS errors), existing `*.test.ts`
  pass.

## Constraints / notes

- React dist must be rebuilt before `go build` — `make build` handles it.
- `safeJoin` path-traversal guard in `internal/api/handlers.go` is unchanged.
- No backend (`internal/*`, `cmd/*`) changes expected; this is frontend-only.
- Each page's scoped CSS may reuse class names from another page's prototype
  CSS — scope per-page (CSS Modules or page-prefixed class names) to avoid
  collisions across the SPA.
