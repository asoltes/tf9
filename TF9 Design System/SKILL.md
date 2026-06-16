---
name: tf9-design
description: Use this skill to generate well-branded interfaces and assets for TF9, an enterprise Terraform orchestration platform. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping or production work.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Key design rules for TF9

1. **Font:** Open Sans (Google Fonts) for UI; Monaco/Menlo for code/mono
2. **Theme:** Light (#f2f3f3 canvas, #0f1b2a nav), Dark (#0d1117 canvas, #161b22 surface), Dim (#22272e / #2d333b). Apply via `data-theme="light|dark"` + `data-variant="dim"` on `<html>`.
3. **Blue primary:** `#0972d3` light / `#58a6ff` dark
4. **Terraform purple:** `#8250df` light / `#bc8cff` dark (parallel runs, auto command)
5. **No gradients** on chrome surfaces. No glassmorphism.
6. **Buttons:** pill shape (border-radius: 20px), 2px border, 34px height
7. **Cards:** border-radius: 16px, shadow: `0 1px 4px -1px rgba(0,7,22,.12), 0 0 0 1px var(--divider)`
8. **Command colors:** each Terraform command (plan, apply, destroy, init, etc.) has a unique semantic color — see tokens/commands.css
9. **Iconography:** inline SVG, Lucide-style, stroke-only, 1.8–2.2px stroke, `currentColor`
10. **Copy style:** Title Case for nav/headings, sentence case for body, ALL CAPS for status badges with letter-spacing
11. **Status colors:** success=green, warning/partial=amber, error/failed=red, running/info=blue
12. **Terminal output:** monospace, dark background (#0b1220), line colors: add=green, del=red, change=amber, plan=blue
