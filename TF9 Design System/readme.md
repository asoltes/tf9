# TF9 Design System

## Overview

TF9 is an enterprise Terraform orchestration platform used by DevOps, Platform Engineering, Cloud Engineering, and Infrastructure teams. It provides a web UI to manage repositories, trigger and monitor Terraform runs (plan, apply, destroy, etc.), inspect terminal output, visualize resource graphs, analyze costs, and review configuration — all with multi-theme support (light / dark / dim).

**Design goal:** Professional, trustworthy, built for engineers. Clarity over decoration, information density without clutter, keyboard-first workflows.

## Sources

- **GitHub repository:** https://github.com/asoltes/tf9 (branch: `main`)
  - `frontend/src/styles/cloudscape.css` — global design tokens & component CSS
  - `frontend/src/styles/theme.css` — dark/dim overrides
  - `frontend/src/index.css` — animation utilities
  - `frontend/src/Shell.tsx` — app shell (topnav + sidenav)
  - `frontend/src/pages/` — all page components + scoped CSS
  - `frontend/public/tf9-logo.svg`, `tf9-mark.svg` — brand assets

> Note: The codebase is private. Collaborators with access can explore these paths for additional context.

---

## Content Fundamentals

**Voice & tone:** Direct, technical, engineer-to-engineer. No marketing language. Imperative verbs for actions ("Start Terraform Run", "Open Repository Workspace"). Never condescending.

**Casing:** Title Case for nav labels and section headings ("Run History", "Repository Workspace"). Sentence case for body copy, descriptions, and error messages. ALL CAPS used sparingly for status pills/badges (e.g. "INIT", "PLAN") with letter-spacing.

**Copy style:**
- Labels are nouns or noun phrases: "Repositories", "Cost Analysis", "AWS Profile Mappings"
- CTAs use imperative verbs: "Start Terraform Run", "Add a repository", "Retry"
- Error messages include: human-readable explanation → technical detail → suggested resolution
- Status text is lowercase + capitalized only when a proper name: "success", "partial success", "failed", "running", "cancelled", "denied"
- Timestamps shown as both relative ("2 hours ago") and exact (hover tooltip with full date/time)
- Numbers use commas for thousands; durations shown as "2m 34s" or "45s"

**Persona:** Infrastructure teams — DevOps, Platform, Cloud, SREs. Expect technical literacy. Show IDs, ARNs, and repo paths without hiding them.

**Emoji:** Never used in the UI. Only plain text and SVG icons.

**"I" vs "you":** Neither — the UI is product-voice ("No repositories configured yet. Add a repository to start running Terraform."), not conversational.

---

## Visual Foundations

### Colors

The palette is GitHub-dark-inspired for dark/dim modes, AWS Cloudscape-inspired for light mode. Core brand blue is `#0972d3` (light) / `#58a6ff` (dark). Terraform purple (`#8250df`) is used for parallel execution and the `--command-auto` token.

**Light mode:** Off-white canvas (`#f2f3f3`), white containers, deep squid-ink text (`#0f141a`), AWS-style navy nav (`#0f1b2a`).  
**Dark mode:** GitHub-dark backgrounds (`#0d1117` canvas, `#161b22` container), bright text (`#e6edf3`).  
**Dim mode:** GitHub-dark-dimmed — slightly lighter surfaces (`#22272e` / `#2d333b`), muted text (`#adbac7`).

### Typography

- **UI font:** Open Sans (Google Fonts) — 400, 600, 700, 800 weights
- **Code/mono font:** Monaco → Menlo → Consolas → Courier New → system monospace
- **Page titles:** 28px bold, letter-spacing −0.3px
- **Section titles:** 18px bold
- **Body:** 14px regular, line-height 1.43
- **Captions/labels:** 11–12px, often uppercase with letter-spacing for status pills
- Font smoothing: antialiased on both macOS and Windows

### Spacing

8px base grid. Common spacings: 4, 8, 12, 16, 20, 24, 28, 36. Content padding: 28px top/bottom, 36px left/right. Nav item padding: 7px 18px. Card padding: 20px.

### Backgrounds & Surfaces

No full-bleed imagery, no gradients on chrome surfaces. The nav (`#0f1b2a`) provides the only "brand" background. Terminal cards use a distinct darker background within pages (`#0b1220` dark, `#f6f8fa` light) for visual separation. No textures or patterns.

### Borders & Cards

- Cards: `border-radius: 16px`, `box-shadow: 0 1px 4px -1px rgba(0,7,22,.12), 0 0 0 1px var(--divider)` — subtle outline, very light drop shadow
- Inputs: `border-radius: 8px`, `border: 2px solid var(--input-border)`
- Buttons: `border-radius: 20px` (pill shape), `border: 2px solid`
- Badges/pills: `border-radius: 4px` (square-ish) or `20px` (pill)
- Table rows: no rounded corners; use full-width dividers

### Animations

Minimal and purposeful:
- **Pulse dot:** 1.1s ease-in-out infinite — for running/active status indicators
- **Striped progress bar:** 0.8s linear infinite — on running progress segments  
- **Skeleton shimmer:** 1.4s ease-in-out opacity oscillation — loading placeholders
- **Spin:** linear — loading spinners
- No bounce, no spring, no entrance animations on static content
- All animations respect `prefers-reduced-motion`

### Hover & Press States

- **Nav links:** `background: var(--surface-2)` — subtle fill, no border change
- **Active nav:** blue left-border (2px), blue text, `var(--blue-bg)` background fill
- **Buttons:** primary darkens (`#033160`); normal fills with `--blue-bg`; icon buttons get circular fill
- **Table rows:** `background: var(--th)` on hover; selected rows get `--blue-bg` + 3px left inset shadow
- **Cards/tiles:** `background: var(--surface-2)` on hover

### Icons

SVG icon system — custom 24×24 Lucide-style stroke icons inline in React components. Stroke width 1.8–2.2px, round linecap/linejoin. No icon font. See ICONOGRAPHY section.

### Shadow System

Three levels:
1. `--shadow-sm` — subtle row-level depth (1px)
2. `--shadow-c` — card/container shadow (4px blur + 1px ring)
3. `--shadow-pop` — popover/modal/dropdown (20–30px blur + 1px ring)

Dark mode shadows are heavier (more opacity) because lighter backgrounds are absent.

### Color Vibe of Imagery

N/A — TF9 uses no photography or illustration. All visuals are data: tables, graphs, terminal output, progress bars.

### Transparency & Blur

Used sparingly:
- Backdrop blur on fullscreen terminal modal (`blur(5px)`) 
- `color-mix()` for tinted backgrounds (e.g. command-color tinted surfaces)
- No frosted-glass panels in regular UI

---

## Application Architecture

### Shell

```
┌─────────────────────────────────────────────────────┐
│  Topnav (56px) — Logo | Nav links | Spacer | User   │
├──────────┬──────────────────────────────────────────┤
│ Sidenav  │  Main Content                             │
│ (236px)  │  Breadcrumbs                              │
│ Groups:  │  Page title + actions                     │
│ - Ops    │  Page body                                │
│ - Config │                                           │
│ - Insight│                                           │
└──────────┴──────────────────────────────────────────┘
```

**Topnav height:** 56px. **Sidenav width:** 236px (collapsed: 52px). **Content max-width:** 1320px.

### Navigation Groups

| Group | Pages |
|---|---|
| Operations | Dashboard, Run History, Repository Workspace |
| Configuration | Repositories, Configuration, AWS Profile Mappings |
| Insights & Support | Terraform Reports, Graph View, Cost Analysis, System Logs, Documentation |

### Routing

Hash-based SPA routing. Pages: `overview`, `runs`, `workspace`, `repos`, `config`, `profile-mappings`, `reports`, `report`, `graph`, `cost`, `logs`, `help`.

---

## Terraform Command Colors

Each command has a unique semantic color (light/dark/dim variants):

| Command | Light | Dark |
|---|---|---|
| init | `#0969da` | `#58a6ff` |
| plan | `#1a7f37` | `#3fb950` |
| apply | `#bc4c00` | `#ffa657` |
| destroy | `#cf222e` | `#ff7b72` |
| auto | `#8250df` | `#bc8cff` |
| validate | `#0a7c86` | `#39c5cf` |
| refresh | `#57606a` | `#9aa5b1` |
| state | `#9a6700` | `#e3b341` |
| import | `#1f6feb` | `#79c0ff` |
| cost | `#b4690e` | `#d29922` |

---

## Iconography

TF9 uses **inline SVG icons only** — no icon font, no external icon library CDN. All icons are custom 24×24 Lucide-style paths defined inline in React components using a helper:

```tsx
const ni = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
```

**Style:** Outline/stroke, not filled. Stroke weight 1.8–2.2px. Round linecap and linejoin. Inherits `currentColor` so they respond to theme changes automatically.

**Sizes used:** 14px, 15px, 16px (nav), 18px (settings icons), 24px (base viewBox). Always sized via width/height on the SVG element.

**No emoji** in the UI. No raster icons (PNG/JPG). No icon fonts.

**Logo assets:** See `assets/` directory.
- `tf9-logo.svg` — full wordmark logo (174×54px)
- `tf9-mark.svg` — standalone mark/favicon

---

## File Index

```
TF9 Design System/
├── styles.css                    ← Global entry point (import this)
├── tokens/
│   ├── colors.css                ← Light/dark/dim color tokens
│   ├── typography.css            ← Font stacks, sizes, weights
│   ├── spacing.css               ← Spacing scale, radii, shadows
│   ├── commands.css              ← Terraform command color tokens
│   └── animations.css            ← Keyframes and motion utilities
├── assets/
│   ├── tf9-logo.svg              ← Full wordmark
│   └── tf9-mark.svg              ← App icon / favicon
├── components/
│   ├── core/                     ← Button, Badge, Input, Select
│   ├── feedback/                 ← StatusDot, Toast, Skeleton
│   └── data/                     ← CommandBadge, StatusBadge, RunStatus
├── guidelines/
│   ├── colors-brand.card.html    ← Brand color specimen
│   ├── colors-light.card.html    ← Light theme tokens
│   ├── colors-dark.card.html     ← Dark theme tokens
│   ├── colors-status.card.html   ← Status color tokens
│   ├── colors-commands.card.html ← Command color tokens
│   ├── type-scale.card.html      ← Type scale specimen
│   ├── type-ui.card.html         ← UI type roles
│   ├── spacing.card.html         ← Spacing scale
│   ├── radius-shadow.card.html   ← Radii and shadows
│   └── themes.card.html          ← Theme overview
└── ui_kits/
    └── tf9/
        ├── index.html            ← TF9 interactive prototype
        ├── Shell.jsx             ← App shell
        ├── Dashboard.jsx         ← Overview page
        ├── RunHistory.jsx        ← Runs page
        └── RepositoryWorkspace.jsx ← Workspace page
```

---

## Components

See `components/` directory. Each component has:
- `Name.jsx` — implementation
- `Name.d.ts` — props interface
- `Name.prompt.md` — usage guide

---

## UI Kits

### TF9 App (`ui_kits/tf9/`)

Full hi-fi interactive recreation of the TF9 web app with:
- Topnav + collapsible sidenav
- Dashboard (Overview) with status tiles, recent runs, execution modes
- Run History with split-panel terminal output
- Repository Workspace

---

## Further Exploration

Readers with GitHub access can explore the full codebase at https://github.com/asoltes/tf9 to find additional pages (Cost Analysis, Graph View, System Logs, Terraform Reports), API endpoints, and e2e test specs that document every major user flow.
