# Handoff: tfops — Terraform Operations UI

## Overview

**tfops** is a desktop web application for running and monitoring Terraform operations across multiple repositories, environments, and AWS profiles. It provides a Cloudscape-flavored (AWS console style) interface for:

- Triggering Terraform runs (init, plan, apply, destroy + more commands)
- Streaming live terminal output per environment in a split-panel view
- Viewing structured plan/apply/destroy reports
- Managing repository promotion pipelines (ordered target groups)
- Configuring AWS credentials and regions per target

---

## About the Design Files

The files in this bundle are **high-fidelity HTML/CSS/JS prototypes** — they are *not* production code to be copied directly. They represent the intended look, behavior, and interactions of the UI. Your task is to **recreate these designs in your actual codebase** using its existing framework, component libraries, and patterns.

The prototypes use:
- Vanilla JS (no framework)
- Custom Cloudscape-style CSS tokens (see `cloudscape.css`)
- Open Sans font (Google Fonts)
- Inline SVG icons throughout

Translate these into your stack (React, Vue, etc.) using your existing libraries. Use the HTML as a pixel-perfect visual reference and the JS as a behavioral spec.

---

## Fidelity

**High-fidelity.** Recreate the UI pixel-precisely: exact colors, spacing, typography, component shapes, hover/active/focus states, animations, and interactions are all specified. The design system tokens are all defined in `cloudscape.css`.

---

## Design Tokens (`cloudscape.css`)

### Colors (Light Mode — `:root`)
| Token | Value | Usage |
|---|---|---|
| `--bg-layout` | `#f2f3f3` | Page background |
| `--container` | `#ffffff` | Card/panel backgrounds |
| `--text` | `#0f141a` | Primary text |
| `--text-2` | `#5f6b7a` | Secondary text |
| `--text-3` | `#8b97a3` | Tertiary / muted |
| `--link` | `#0972d3` | Links, interactive blue |
| `--blue` | `#0972d3` | Primary action color |
| `--blue-bg` | `#f0f8ff` | Blue tinted backgrounds |
| `--green` | `#037f0c` | Success states |
| `--green-bg` | `#effff1` | Success backgrounds |
| `--amber` | `#8d6605` | Warning states |
| `--amber-bg` | `#fffef0` | Warning backgrounds |
| `--red` | `#d91515` | Error/destructive states |
| `--red-bg` | `#fff7f7` | Error backgrounds |
| `--nav-bg` | `#0f1b2a` | Topnav background |
| `--nav-bg-2` | `#192b3f` | Topnav hover |
| `--divider` | `#e9ebed` | Dividers |
| `--border-strong` | `#c6c6cd` | Stronger borders |
| `--input-border` | `#7d8998` | Form input borders |
| `--th` | `#f3f6f9` | Table header backgrounds |

### Dark Mode (`html[data-theme="dark"]`)
All tokens are overridden — see `theme.css` for the full dark mode token set.

### Typography
- **Font**: Open Sans (weights: 400, 600, 700, 800)
- **Mono font**: `"Monaco","Menlo","Consolas","Courier New",ui-monospace,monospace`
- **Base size**: 14px, line-height 1.43

### Spacing & Shape
| Token | Value |
|---|---|
| `--radius-c` | `16px` (cards/containers) |
| `--radius-i` | `8px` (inputs, buttons) |
| `--radius-pill` | `20px` (pills/badges) |
| `--shadow-c` | `0 1px 4px -1px rgba(0,7,22,.12), 0 0 0 1px var(--divider)` |
| `--shadow-pop` | `0 4px 20px rgba(0,7,22,.20), 0 0 0 1px var(--divider)` |

---

## Layout System

Every page uses this shell:

```
┌─────────────────────────────────────────────┐
│  Topnav (40px, sticky, #0f1b2a)             │
├────────────┬────────────────────────────────┤
│  Sidenav   │  Main content                  │
│  (280px)   │  (flex:1, scrollable)          │
│  sticky    │                                │
└────────────┴────────────────────────────────┘
```

- **Topnav**: height 40px, sticky `top:0`, `z-index:1000`, dark (`#0f1b2a`)
  - Left: brand logo (terraform SVG in `#ff9900` + "tfops" text, font-weight 700)
  - Middle: nav links (`Runs`, `Reports`)
  - Right: dark/light toggle → STS auth badge → user email
- **Sidenav**: 280px wide, `background:var(--container)`, `border-right:1px solid var(--divider)`, sticky, full viewport height minus topnav
  - Nav links: 14px, `padding:7px 24px`, `border-left:2px solid transparent` (active = `var(--blue)`)
- **Content area**: `flex:1`, `padding:24px 28px`, `background:var(--bg-layout)`

---

## Pages

### 1. Overview / Hub (`index.html`)
Hub page with cards linking to each section.

**Layout**: Content area with page title + 2-column card grid  
**Cards**: `border-radius:var(--radius-c)`, `box-shadow:var(--shadow-c)`, hover lifts with `translateY(-2px)`  
**Active nav**: "Overview" highlighted in sidenav

---

### 2. Runs (`runs/Runs.html`)

The primary page. Split into a scrollable runs table (top) and a live split panel (bottom/side).

#### Runs Table
- Full-width table with columns: Run ID · Command · Repo · Branch · Targets · Mode · Result · Started · Duration · Status
- Running rows have a pulsing blue dot (`animation:pulse`) and blue left-border on selected row
- Clicking a row opens the split panel and starts streaming if the run is active
- Badge component for commands: `plan`=green, `apply`=orange, `destroy`=red, `init`=blue

#### Split Panel
Two dock modes toggled via icons in the panel header:
- **Bottom dock**: `height: min(440px, 52vh)`, `border-top:1px solid var(--border-strong)`, resize handle on top edge (ns-resize cursor)
- **Side dock**: `width: min(640px, 48%)`, `border-left:1px solid var(--border-strong)`, resize handle on left edge (ew-resize cursor)

**Split panel header**: Run ID + status badge on left; action buttons (Re-run, View report) + dock toggle on right  
**Split panel body**: meta-strip → progress bar → target dots → output area

**Progress bar**: `height:8px`, rounded, three segments: done (green) + fail (red) + running (blue, animated)  
**Target dots**: pill-shaped chips per target; `running` = blue pulsing dot, `done` = green, `fail` = red, `queued` = grey

#### Output Views (Parallel mode)
Three views toggled by Grid / Tabs / Merged buttons:
- **Grid**: 2-column grid of terminal cards (1-col when side-docked)
- **Tabs**: One terminal with tab bar
- **Merged**: Single interleaved stream, each line prefixed with colored `[env]` label

#### Output View (Promotion mode)
Stacked collapsible sections, one per target. Sequential — each starts only after the previous completes. Chevron collapses/expands the terminal.

#### Terminal Cards
Always use terminal color scheme (dark in dark mode, light-themed in light mode — see terminal tokens below).

**Terminal card structure**:
```
┌─ tc-head ──────────────────────────────────────┐
│ ● env-name   profile      +3 ~0 -0  DONE  [⤢] │
├────────────────────────────────────────────────┤
│ tc-body (monospace, scrollable)                │
│ Acquiring state lock...                        │
│ + resource "aws_instance" "example" {          │
└────────────────────────────────────────────────┘
```

#### Terminal Color Tokens (both modes)
These override for light/dark:

| Token (light) | Value | Dark value |
|---|---|---|
| Card bg | `#f6f8fa` | `#0b1220` |
| Header bg | `#edf0f3` | `#101a2b` |
| Border | `#d0d7de` | `#1d2736` |
| Text | `#24292f` | `#c9d1d9` |
| Add line | `#1a7f37` | `#3fb950` |
| Delete line | `#cf222e` | `#f85149` |
| Change line | `#9a6700` | `#d29922` |
| Plan line | `#0550ae` | `#58a6ff` |
| Error line | `#cf222e` | `#ff7b72` |

#### Fullscreen Terminal Modal
Triggered by the `⤢` expand button on each terminal card. Opens a modal:
- **Backdrop**: `position:fixed; inset:40px 0 0 0` (below topnav), `background:rgba(0,7,22,.28)` light / `rgba(0,0,0,.75)` dark, `backdrop-filter:blur(5px)`
- **Modal**: max-width 1140px, max-height 780px, centered, `border-radius:14px`
- **Modal header**: Traffic light dots (macOS style: red/yellow/green) + env · profile title + stats badge + Copy + Download buttons + ✕ close
- **Header** and **body** both use the terminal color tokens (theme-adaptive)
- Copy button: copies plain text output to clipboard
- Download button: triggers `.txt` file download named `{command}-{env}.txt`
- Close: Esc key, clicking backdrop, or ✕ button

---

### 3. New Run Modal (`runs/New Run Modal.html`)

Full-page modal for configuring a new Terraform run.

**Layout**: Two columns — left = form (scrollable), right = sticky CLI preview rail

#### Command Selection
Four primary command chips in a row: `init` · `plan` · `apply` · `destroy`  
Plus a "More commands" dropdown: validate, refresh, state list, output, import, taint, untaint, force-unlock

**Behavior**:
- `apply` / `destroy` force "Promotion" mode and hide Parallel option
- `force-unlock` shows a per-target Lock ID input field (see below)

#### Execution Mode
- **Promotion**: sequential, stops on first failure
- **Parallel**: all targets simultaneously (disabled for apply/destroy)

#### Targets Section
Grouped by pipeline group (matching Repositories config). Each group is collapsible.

Each target row:
- Checkbox (check/uncheck to include/exclude)
- Drag grip for reordering within group
- Env name with colored dot (red=prod, amber=staging, purple=global, green=dev)
- Profile name
- `prod` badge on production targets
- Auto-approve toggle (apply only)

**force-unlock per-target Lock ID**: When `force-unlock` is selected from More Commands, each **checked** target row shows an additional Lock ID text input inline below the target name. Each target has its own independent Lock ID. The CLI preview reflects `--lock-ids dev:abc123,staging:def456` format.

#### Repository + Branch Selector
Dropdown for repo + branch selector. Shows ahead/behind commit count.

#### CLI Preview Rail (sticky right column)
Shows the assembled `terraform` command with syntax highlighting:
- Command tokens in blue
- Flag names in grey  
- Values in green
- Editable extra flags input

#### Disabled Targets
Targets disabled in Repositories (`tfops-repo-overrides` in localStorage) are filtered out and do not appear in the New Run Modal. Empty groups are hidden.

---

### 4. Plan / Apply / Destroy Reports

Three report pages sharing the same layout. Reference files: `reports/Plan Report.html`, `reports/Apply Report.html`, `reports/Destroy Report.html`.

**Layout**: Sticky header with run metadata → result summary strip → per-environment terminal output sections

**Each result block**:
- Collapsible header with env name, profile, status badge, resource change counts (+add ~change -destroy)
- Terminal body with syntax-highlighted Terraform output
- Copy output button + Download button (saves `{command}-{env}.txt`)
- Blocks with changes auto-expand; no-change blocks start collapsed

**Summary strip**: aggregated add/change/destroy counts across all environments, colored (green/amber/red)

---

### 5. Reports History (`reports/Reports.html`)

**Layout**: toolbar (filter chips + view toggle) → cards or table

**Filter chips**: All · Plan · Apply · Destroy (pill-style, blue when active, shows count badge)

**View toggle**: Cards / List (segmented control style)

**Cards view**: 3-column responsive grid (2-col <1100px, 1-col <700px). Each card:
- Command badge + run ID + status pill
- Repo name + branch with git icon
- Resource change bar (color-coded: green=add, amber=change, red=destroy)
- Stats: +add ~change -destroy + duration
- Target chips (max 2 visible, "+N more" overflow) + relative date

**List view**: Full table with all columns. Clicking any row navigates to the corresponding report page.

---

### 6. Repositories (`repos/Repositories.html`)

**Layout**: Container with repo list table → configure section (pipeline or table view) → browse section

#### Repo List Table
Shows each repo with: name/path, pipeline preview (mini dot-and-arrow diagram), enabled count, AWS profiles, Configure button.

#### Pipeline View
Groups targets by their `group` property (defaults to first directory segment). Each group is a horizontal swim-lane:

```
global/    [1 stage · 1 enabled]
  ┌──────────┐  →  ┌──────────┐  + Add stage
  │ bootstrap│     │  dev     │
  └──────────┘     └──────────┘
```

Each stage card shows: order badge (1,2,3…), drag grip, env name + color dot, directory path, AWS profile, region, account ID, enabled/disabled toggle switch, edit button.

**Drag reorder**: stages can be dragged within their group to reorder the promotion sequence.

#### Table View
Same data in a sortable table with up/down arrow buttons for reordering. Shows Order · Stage · Directory · AWS profile · Account ID · Region · Enabled toggle · Edit/Delete actions.

#### Edit Modal
Fields: Stage name · Directory (read-only) · AWS profile (select) · Region (select) · Account ID · **Pipeline group** (text input with datalist autocomplete of existing groups — changing this moves the stage to a different pipeline) · Require manual approval (toggle).

#### Enable/Disable Persistence
The `disabled` state and `group` override for each target are persisted to `localStorage` under key `tfops-repo-overrides` as:
```json
{
  "infrastructure:dev": { "disabled": false, "group": "" },
  "infrastructure:prod": { "disabled": true, "group": "environments" }
}
```
The New Run Modal reads this key on load and filters out disabled targets.

---

### 7. Config YAML (`config/Config YAML.html`)

YAML editor page showing the generated `~/.config/tfops/config.yaml` based on repository and target configuration. Uses a code editor with syntax highlighting and a copy button.

---

### 8. Help (`help/Help.html`)

Documentation/reference page with sections on configuration format, CLI usage, and FAQ.

---

## STS Authentication Badge

**Component**: replaces the region label in the topnav right section.

**States**:
- `checking` — amber pulsing dot + "Checking…" (shown for ~900ms on load, simulating `GetCallerIdentity` call)
- `ok` (authenticated) — green dot with glow + "Authenticated"
- `fail` (unauthenticated) — red dot + "Unauthenticated"

**Persistence**: state stored in `localStorage` under `tfops-sts-auth`  
**Click to toggle**: prototype behavior — real implementation calls AWS STS `GetCallerIdentity`

**Visual spec**:
- Pill shape: `height:28px`, `padding:0 11px 0 9px`, `border-radius:999px`
- Border: `1px solid rgba(255,255,255,.14)` on dark topnav
- Dot: `7px × 7px`, rounded, with `box-shadow` glow on ok state
- Font: 12px, weight 600

---

## Interactions & Animations

| Interaction | Spec |
|---|---|
| Page load / DOMContentLoaded | STS badge runs checking animation (900ms) |
| Run row click | Opens split panel; starts live streaming simulation if run is active |
| Terminal expand (⤢) | Fullscreen modal scales in: `opacity:0 + scale(.97)` → `opacity:1 + scale(1)`, 150ms ease |
| Esc / backdrop click | Closes fullscreen modal |
| Split panel resize | Drag handle — bottom dock: ns-resize, side dock: ew-resize |
| Stage card drag | Ghost clone follows pointer; placeholder shows in original slot; drop commits reorder |
| Toggle disabled | Immediate re-render + localStorage save |
| Toast notifications | Slide up, auto-dismiss after 1.9s |
| Dark/light toggle | `html[data-theme]` attribute swap, persisted in localStorage |
| Theme on load | Script in `<head>` reads localStorage before paint to avoid FOUC |

---

## Dark / Light Mode

Theme is controlled by `html[data-theme="dark" | "light"]`. Default follows `prefers-color-scheme`.

All component colors use CSS custom properties (defined in `cloudscape.css` and `theme.css`). The **only exception** is the terminal output area, which has its own token set (see Terminal Color Tokens above) that adapts both modes.

Implementation:
```js
// theme.js (runs in <head> to prevent flash)
var key = "tfops-color-mode";
var stored = localStorage.getItem(key);
var preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
document.documentElement.setAttribute("data-theme", stored || preferred);
```

---

## Files Reference

```
index.html                    → Overview hub
sts.js                        → STS auth badge component (shared)
cloudscape.css                → Design tokens + base components
theme.css                     → Dark mode token overrides
theme.js                      → Theme init (load in <head>)

runs/
  Runs.html                   → Runs history + split panel
  New Run Modal.html          → New run configuration form
  run.js                      → New run modal logic
  run.css                     → New run modal styles
  runs-history.js             → Runs table + split panel logic
  runs-history.css            → Runs page styles

reports/
  Reports.html                → Reports history (cards + list)
  Plan Report.html            → Plan output report
  Apply Report.html           → Apply output report
  Destroy Report.html         → Destroy output report
  report.js                   → Shared report renderer
  report.css                  → Shared report styles
  reports-history.js          → Reports history page logic
  reports-history.css         → Reports history page styles
  data-plan.js                → Sample plan run data
  data-apply.js               → Sample apply run data
  data-destroy.js             → Sample destroy run data

repos/
  Repositories.html           → Repo + pipeline management
  app.js                      → Repositories page logic

config/
  Config YAML.html            → YAML editor

help/
  Help.html                   → Documentation
```

---

## Prompt for Claude Code

Paste this into Claude Code in your repository:

```
I have a high-fidelity HTML/CSS/JS prototype of a Terraform operations UI called "tfops". 
The design handoff package is in the `design_handoff_tfops/` folder — start by reading 
`design_handoff_tfops/README.md` for full specs, then reference the HTML files in that folder 
as visual + behavioral references.

Please implement this UI in our codebase using our existing framework and component libraries. 
Key things to preserve exactly:
1. The Cloudscape-style design tokens and color system (defined in cloudscape.css)
2. The split panel with live streaming terminal output
3. The fullscreen terminal modal with copy/download
4. The New Run Modal with init/plan/apply/destroy commands, per-target Lock IDs for force-unlock
5. The Repositories page with pipeline groups, enable/disable toggle (persisted to localStorage), 
   and group override — and the New Run Modal must filter disabled targets accordingly
6. The STS authentication badge in the topnav
7. Full dark/light mode support using CSS custom properties
8. All interactions: drag-to-reorder stages, resize handle on split panel, toast notifications

Reference the HTML files for exact visual output and the JS files for interaction logic.
```
