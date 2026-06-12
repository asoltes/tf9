# E2E / CLI test campaign — bug log

Bugs surfaced while building the Playwright (web) and testscript (CLI) suites,
each reproduced by a test, fixed in app code, and re-verified.

---

## BUG #1 — `--report-dir <new-dir>` silently skips the HTML report

**Severity:** low (data not lost, but the requested report is never written)

**Symptom**
Running `tf9 plan --report-dir <dir>` where `<dir>` does not already exist
produces no report. The run still exits `0`; the only signal is a warning on
stderr:

```
[WARN] Could not save HTML report: create report: open <dir>/tf9-plan-….html: no such file or directory
```

A user pointing `--report-dir` at a fresh path reasonably expects the directory
to be created, the way most CLIs create their output directories.

**Reproduced by**
`cmd/tf9/testdata/script/report_generated.txtar`:

```
exec tf9 plan --report-dir $WORK/reports
stdout 'Report saved'
```

This failed (`no match for 'Report saved'`) because `report.Generate` called
`os.Create` on a path inside a non-existent directory.

**Root cause**
`internal/report/report.go` — `Generate()` joined `OutputDir` + filename and
called `os.Create` directly, never creating `OutputDir`.

**Fix**
Create the output directory before writing the file:

```go
if err := os.MkdirAll(opts.OutputDir, 0o755); err != nil {
    return "", fmt.Errorf("create report dir: %w", err)
}
f, err := os.Create(path)
```

(`internal/report/report.go`, `Generate`)

**Re-test**
`go test ./cmd/tf9/ -run TestScripts` → all 8 scripts pass, including the
report assertions. The default-report-dir path was already created elsewhere, so
this only affected explicit `--report-dir` targets.

---

## Test-suite notes (not app bugs)

- **Bare `#workspace` route renders the repository picker, not the workbench.**
  An early version of `e2e/navigation.spec.ts` asserted `.rw-workbench` after
  clicking the top-nav "Workspace" link. With no repository open, the workspace
  correctly shows `WorkspacePicker` (`.workspace-picker`) instead. This was a
  wrong test assertion, corrected to assert the picker — the app behaviour is
  intended.

---

## Coverage summary

**Playwright (web) — 40 tests, all passing.** Routes/smoke, top+side nav,
breadcrumbs, sidebar collapse, theme cycle (light/dark/dim), overview hub,
new-run modal, real `terraform plan` over SSE, real `terraform apply` approval
gate (Approve **and** Deny), config YAML save/format/validation, repository
add/rename/remove, reports list + viewer, workspace tree/tabs/diff/terminal,
logs. Evidence: `frontend/playwright-report/` (HTML + per-test video + trace)
and the named gallery in `frontend/e2e/screenshots/`.

**testscript (CLI) — 8 scripts, all passing.** Repo + target config lifecycle,
table/JSON output, help + removed-command guidance, CWD-mode and repo-mode
`plan`, target filtering (`--nonprod`, positional, mutually-exclusive guard),
`apply --force` / `--parallel` guard, and report generation.

Both suites run fully offline (no AWS credentials) using the built-in
`terraform_data` resource and a deterministic fake `aws` CLI shim that satisfies
the runner's pre-run STS session check.
