---
name: localtest-e2e
description: "Use whenever writing, running, or debugging end-to-end (browser) tests for tf9, or when you need to drive the real tf9 web UI against a throwaway offline server (the 'localtest'). All e2e work MUST go through this flow. Trigger on: e2e, end-to-end, Playwright, 'test the UI', 'run the app to verify', approval gate / live terminal browser checks, MCP browser driving of tf9."
---

# localtest-e2e

The **localtest** is a throwaway, fully-offline tf9 server backed by a fixture
repo. It is the ONE canonical way to exercise the real binary + web UI in a
browser — no AWS, no network, no real Terraform providers, no Claude session.

**Non-negotiable rule:** every end-to-end test and every "run the real app in a
browser to verify a change" task uses this flow. Do not hand-roll a separate
config, fake CLI, or terraform fixture for e2e — extend the harness here instead.
If the harness can't express what you need, change the harness, not your spec.

## The canonical harness

| File | Role |
|---|---|
| `frontend/e2e/server.mjs` | Builds the localtest: fixture repos, fake `aws`/`claude`, fresh `tf9` binary, isolated `XDG_CONFIG_HOME`, then `tf9 serve`. **Single source of truth.** |
| `frontend/playwright.config.ts` | Boots `server.mjs` as the `webServer` on port `18119`, one worker, screenshots/video on. |
| `frontend/e2e/helpers.ts` | Shared spec helpers: `goRoute`, `openNewRunModal`, `pickCommand`, `selectOnlyTarget`, `shot`. |
| `frontend/e2e/*.spec.ts` | The specs. Copy an existing one as your template. |

## What makes the localtest offline (the five pillars)

Understand these before changing anything — breaking one makes e2e hang or need
credentials:

1. **Terraform with no provider.** Fixture environments use the built-in
   `terraform_data` resource (`server.mjs`). It needs no `terraform init`
   download yet produces a real change on apply, so the approval gate
   ("Enter a value:") fires offline. Never add a fixture that downloads a
   provider.
2. **Fake `aws` CLI.** `server.mjs` writes a shim that answers
   `sts get-caller-identity` and `configure list-profiles`. The runner pre-checks
   the AWS session before every target; without the shim every run aborts.
   `PATH=${fakeBin}:$PATH` puts it first.
3. **Fake `claude` CLI.** A shim drives the reconcile/AI workspace flows over the
   real SSE path without an account or network. Wired via `TF9_CLAUDE_PATH`.
4. **Isolated state.** `XDG_CONFIG_HOME` points at a temp dir so runs, PID file,
   and reports never touch your real `~/.config/tf9`. The whole fixture lives
   under `/tmp/tf9-playwright` and is wiped on each boot.
5. **Approval over SSE.** Apply/destroy without `-auto-approve` emit the approval
   sentinel; the split panel shows `.sp-approval-bar`. Assert on that, not on
   terraform's raw prompt.

## A. Run the e2e suite (the normal path)

```bash
cd frontend
npm run test:e2e            # = npm run build && playwright test
npx playwright test run-apply-approval.spec.ts   # one spec
npx playwright test -g "approval gate"           # by title
npx playwright show-report  # open the HTML report after a run
```

Playwright builds the binary and boots `server.mjs` for you — do not start a
server yourself for the suite.

Prereqs (once): `npm install` in `frontend/`, plus a Go toolchain. Override the
Go binary with `GO_BINARY=/path/to/go` if it isn't at `/usr/local/go/bin/go`.

## Recording test evidence — video proof

Every e2e test run captures **video and screenshots** as evidence (enabled in
`playwright.config.ts`). When verifying a bug fix or testing a feature with e2e:

1. **Capture a run video** — drive the localtest or run a spec, Playwright records.
2. **Save under `docs/e2e/recording/<bug-name>/`** — e.g.
   `docs/e2e/recording/approval-gate-refresh/run-001.webm`.
3. **Include in commit message or PR description** — reference the video so
   reviewers can see the fix in action without reproducing it locally.

Playwright saves videos to `frontend/test-results/` by default (git-ignored). Copy
the relevant ones to `docs/e2e/recording/<bug-name>/` before committing. Name them
descriptively (e.g. `before-fix.webm`, `after-fix.webm`, `happy-path.webm`) so
the sequence is clear.

This is the "proof of correct behavior" that pairs with the code review — video
evidence that the UI behaves as intended, live-streamed over the real SSE path,
with real Terraform state changes, on the real web server, no mocks.

## B. Create a localtest by hand (interactive / MCP browser driving)

Use this when you want to click through the real UI yourself or drive it with the
Playwright MCP tools (e.g. reproducing a live-terminal bug). **Reuse the harness**
— don't reinvent the fixture:

1. **Pick a free port** (the suite owns `18119`; use another, e.g. `18200`).
2. **Boot the localtest** — `server.mjs` builds the binary and serves:
   ```bash
   cd frontend
   node e2e/server.mjs 18200        # builds tf9, starts serve on :18200
   ```
   Run it in the background (`run_in_background`) so it survives across steps;
   it stays up until killed.
3. **Confirm it's live:**
   ```bash
   curl -s http://127.0.0.1:18200/api/repos
   ```
4. **Drive the UI** at `http://127.0.0.1:18200/#runs` with the Playwright MCP
   browser tools (navigate, snapshot, click), or open it manually.
   - Start runs through the UI (New Run modal) to exercise the live-stream path,
     or `POST /api/runs` to set up state quickly.
   - The approval bar is `.sp-approval-bar`; reject = `Deny`/`Reject`, accept =
     `Approve`/`Apply changes`.
   - To answer a prompt without the button: `POST /api/runs/{id}/input` with
     `{"value":"yes"|"no"}`.
5. **Tear down:** kill the `server.mjs` process. State is in `/tmp/tf9-playwright`
   and is recreated on next boot.

> If you only need to drive the frontend with hot-reload against a localtest,
> run `npm run dev` (Vite on `:5173`, proxies `/api` to `:8080`) and point
> `server.mjs`/the binary at `:8080`. For verifying shipped behaviour prefer the
> binary's own embedded UI on the localtest port.

## Writing a new e2e spec — checklist

1. Put it in `frontend/e2e/<feature>.spec.ts`.
2. `import { test, expect } from '@playwright/test'` and pull shared steps from
   `./helpers`.
3. Reach app state through the UI helpers (`openNewRunModal`, `pickCommand`,
   `selectOnlyTarget`) — match existing specs.
4. Assert on stable selectors (`.splitpanel`, `.sp-approval-bar`, `.rstatus.*`,
   `.tc-body`), not on raw terraform text where a class exists.
5. Call `shot(page, 'name')` at key states — specs build a browsable PNG gallery
   under `e2e/screenshots/`.
6. Need a new repo/target/profile/branch? Add it to the fixture in
   `server.mjs` so every spec shares one deterministic world. Keep it offline
   (`terraform_data` only).
7. Runs are sequential (`workers: 1`). Order-sensitive flows (e.g. Deny before
   Approve so state is still dirty) are fine — see `run-apply-approval.spec.ts`.
8. **Save test evidence** — after the suite runs, copy the video recordings from
   `frontend/test-results/` to `docs/e2e/recording/<bug-name>/` with descriptive
   names (e.g. `approval-gate-refresh/before-fix.webm`, `after-fix.webm`). These
   are proof that the fix works in the real web UI.

## Troubleshooting

- **Every run fails on AWS session** → fake `aws` shim missing from `PATH`, or a
  new profile name isn't handled in the shim.
- **Run hangs / provider download** → a fixture stopped using `terraform_data`.
- **Approval bar never appears** → command sent with `-auto-approve`, or you
  asserted on the prompt text instead of `.sp-approval-bar`.
- **State bleeds between runs** → `XDG_CONFIG_HOME` not isolated, or you pointed
  the binary at your real `~/.config/tf9`.
- **Port already in use** → a previous `server.mjs` is still running; kill it.
