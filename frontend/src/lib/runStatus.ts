/**
 * Pure, dependency-free helpers for deriving per-target run status and parsing
 * env/plan output from a run's streamed lines.
 *
 * There are two line formats produced by the runner:
 *
 *  1. Sequential / promotion runs emit unprefixed lines and delimit each
 *     environment with a banner:
 *
 *        ════════════════════════════════════════
 *          ENV: dev  |  PROFILE: my-dev
 *          CMD: terraform plan
 *        ════════════════════════════════════════
 *        ...output...
 *
 *  2. Parallel runs prefix EVERY line (including the banner) with `[env] `:
 *
 *        [dev] ════════════════════════════════════════
 *        [dev]   ENV: dev  |  PROFILE: my-dev
 *        [dev]   CMD: terraform plan
 *        [dev] ...output...
 *
 * These helpers normalise both into the same `EnvSection[]` shape and derive a
 * coarse per-target status used by the progress bar / target dots.
 */

/**
 * The sentinel line emitted by runner.go's approvalMonitor when terraform is
 * waiting for interactive approval. Kept here so it can be imported by both
 * RunSplitPanel.tsx and the test suite from a single source of truth.
 */
export const APPROVAL_SENTINEL = '__TF9_APPROVAL__';

/**
 * Emitted by runner.go's approvalMonitor when terraform is no longer blocked on
 * the approval prompt (input received, or the run was cancelled/force-killed).
 * The frontend uses it to hide the approval bar reliably instead of guessing.
 */
export const APPROVAL_CLEAR_SENTINEL = '__TF9_APPROVAL_CLEAR__';

/**
 * Pure reducer for the approval gate state in RunSplitPanel. Encapsulated here
 * so the reset-on-run-id-change behaviour can be unit-tested without a DOM.
 *
 * Edge-triggered:
 *  - When runId changes, reset immediately (pending=false, counts=0).
 *  - A new APPROVAL_SENTINEL (show count increased) sets pending=true.
 *  - A new APPROVAL_CLEAR_SENTINEL (clear count increased) sets pending=false —
 *    this is the backend telling us terraform stopped waiting.
 *  - Otherwise keep the previous state unchanged.
 */
export function updateApprovalGate(
  prev: { pending: boolean; seenCount: number; clearCount?: number; runId: string | undefined },
  lines: string[],
  runId: string | undefined,
): { pending: boolean; seenCount: number; clearCount: number; runId: string | undefined } {
  // When the run changes, reset the counters so stale approvals from the
  // previous run can never bleed into the new one.
  const reset = runId !== prev.runId;
  const baseShow = reset ? 0 : prev.seenCount;
  const baseClear = reset ? 0 : (prev.clearCount ?? 0);
  const newShow = lines.filter(l => l === APPROVAL_SENTINEL).length;
  const newClear = lines.filter(l => l === APPROVAL_CLEAR_SENTINEL).length;
  if (newShow > baseShow) {
    return { pending: true, seenCount: newShow, clearCount: newClear, runId };
  }
  if (newClear > baseClear) {
    return { pending: false, seenCount: newShow, clearCount: newClear, runId };
  }
  return { pending: reset ? false : prev.pending, seenCount: newShow, clearCount: newClear, runId };
}

/**
 * Whether the approval gate should be visible, given the reducer state and how
 * many prompts the user has already answered (`answeredSeen`). The gate shows
 * only for an *unanswered* prompt — once the user clicks Approve/Deny the
 * component bumps answeredSeen to seenCount, so streaming output or a lagging
 * run.awaitingInput can never re-open it. This is the fix for the bug where the
 * fullscreen approval bar required a second click to dismiss.
 */
export function approvalGateVisible(
  gate: { pending: boolean; seenCount: number },
  answeredSeen: number,
): boolean {
  return gate.pending && gate.seenCount > answeredSeen;
}

export interface EnvSection {
  name: string;
  profile: string;
  lines: string[];
  stage?: string; // set for auto runs: 'init' | 'plan' | 'apply'
}

export interface PlanCounts {
  add: number;
  change: number;
  destroy: number;
  noChanges: boolean;
  failed: boolean;
}

export type TargetStatus = 'done' | 'fail' | 'denied' | 'running' | 'queued';

export interface TargetState {
  name: string;
  status: TargetStatus;
}

export const STRIP_ANSI = /\x1b\[[0-9;]*[a-zA-Z]/g;

/** Strips ANSI escape codes, returning plain text. */
export function stripAnsi(s: string): string {
  return s.replace(STRIP_ANSI, '');
}

/** Detects whether the stream is in parallel `[env] ` prefixed format. */
export function isParallelStream(lines: string[]): boolean {
  let prefixed = 0;
  for (const line of lines) {
    if (/^\[[^\]]+\]\s/.test(line)) prefixed++;
  }
  // Parallel output prefixes essentially every line; require a clear majority
  // so a stray `[something]` in normal output doesn't trip the detector.
  return lines.length > 0 && prefixed >= Math.ceil(lines.length / 2);
}

const PREFIX_RE = /^\[([^\]]+)\]\s?/;

/** Splits a possibly-prefixed line into its `[env]` label (if any) and body. */
function splitPrefix(line: string): { env: string | null; body: string } {
  const m = line.match(PREFIX_RE);
  if (m) return { env: m[1], body: line.slice(m[0].length) };
  return { env: null, body: line };
}

function trimTrailingBlank(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === '') end--;
  return lines.slice(0, end);
}

/** Parses sequential (banner-delimited) output into env sections. */
function parseSequentialSections(lines: string[]): EnvSection[] {
  const sections: EnvSection[] = [];
  let current: EnvSection | null = null;
  let currentStage: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect auto pipeline stage banners: "=== auto: step N/3 — COMMAND ==="
    const stageMatch = line.match(/^=== auto: step \d\/3 — (\w+) ===/);
    if (stageMatch) {
      currentStage = stageMatch[1];
      continue;
    }

    if (line.startsWith('════') && i + 1 < lines.length) {
      const headerLine = lines[i + 1];
      const envMatch = headerLine.match(/ENV:\s*(\S+)/);
      if (envMatch) {
        const profileMatch = headerLine.match(/PROFILE:\s*(\S+)/);
        current = { name: envMatch[1], profile: profileMatch?.[1] ?? '', lines: [], stage: currentStage };
        sections.push(current);
        i++; // ENV: … line
        i++; // CMD: … line
        while (i < lines.length && !lines[i].startsWith('════')) i++;
        continue;
      }
    }

    if (current) current.lines.push(line);
  }

  return sections.map(s => ({ ...s, lines: trimTrailingBlank(s.lines) }));
}

/** Parses parallel (`[env] ` prefixed) output into env sections, grouped by prefix. */
function parseParallelSections(lines: string[]): EnvSection[] {
  const order: string[] = [];
  const byEnv = new Map<string, EnvSection>();

  for (const line of lines) {
    const { env, body } = splitPrefix(line);
    if (env == null) continue;
    let section = byEnv.get(env);
    if (!section) {
      section = { name: env, profile: '', lines: [] };
      byEnv.set(env, section);
      order.push(env);
    }
    // Capture the profile from the banner header if present.
    const profileMatch = body.match(/PROFILE:\s*(\S+)/);
    if (profileMatch && !section.profile) section.profile = profileMatch[1];
    // Drop banner scaffolding lines from the per-section terminal body.
    if (body.startsWith('════')) continue;
    if (/^\s*ENV:\s*\S+/.test(body)) continue;
    if (/^\s*CMD:\s*/.test(body)) continue;
    section.lines.push(body);
  }

  return order.map(name => {
    const s = byEnv.get(name)!;
    return { ...s, lines: trimTrailingBlank(s.lines) };
  });
}

/**
 * Parses env sections from streamed lines, auto-detecting sequential vs.
 * parallel format. Returns [] when no env banners are present yet (e.g. a
 * single-target run or before the first banner streams in).
 */
export function parseEnvSections(lines: string[]): EnvSection[] {
  if (isParallelStream(lines)) {
    const parallel = parseParallelSections(lines);
    if (parallel.length > 0) return parallel;
  }
  return parseSequentialSections(lines);
}

/** Parses terraform plan counts (and failure) from a section's lines. */
export function parseCounts(lines: string[]): PlanCounts {
  let failed = false;
  for (const line of lines) {
    const plain = stripAnsi(line);
    if (/\[FAILED\]/.test(plain)) failed = true;
    const m = plain.match(/Plan:\s+(\d+) to add,\s+(\d+) to change,\s+(\d+) to destroy/);
    if (m) return { add: +m[1], change: +m[2], destroy: +m[3], noChanges: false, failed };
    if (/No changes\./.test(plain)) return { add: 0, change: 0, destroy: 0, noChanges: true, failed };
    // Recognize apply/destroy completion as terminal so apply-phase sections settle correctly.
    const applyM = plain.match(/Apply complete! Resources: (\d+) added, (\d+) changed, (\d+) destroyed/);
    if (applyM) {
      const add = +applyM[1], change = +applyM[2], destroy = +applyM[3];
      return { add, change, destroy, noChanges: add === 0 && change === 0 && destroy === 0, failed };
    }
    const destroyM = plain.match(/Destroy complete! Resources: (\d+) destroyed/);
    if (destroyM) {
      const destroy = +destroyM[1];
      return { add: 0, change: 0, destroy, noChanges: destroy === 0, failed };
    }
  }
  return { add: 0, change: 0, destroy: 0, noChanges: false, failed };
}

const APPLY_DONE_RE = /Apply complete!|Destroy complete!/;
const INIT_DONE_RE = /has been successfully initialized|Terraform has been successfully/i;

/**
 * Resolves a section's terminal status given its stage/command context.
 *
 * The critical case is apply/destroy: `terraform apply` always echoes the plan
 * summary ("Plan: N to add, M to change, K to destroy") *before* its
 * "Enter a value:" approval prompt. That `Plan:` line must NOT be treated as a
 * completion marker — otherwise a target that is still applying (or waiting for
 * approval) is incorrectly shown as `done`, the progress bar over-counts, and
 * the run appears stuck. Apply/destroy sections are only `done` once an actual
 * "Apply complete!" / "Destroy complete!" marker is present.
 *
 * Returns 'done' | 'fail' when terminal, or null when the section is still in
 * progress (caller decides running vs. queued).
 */
export function sectionTerminalStatus(lines: string[], ctx?: string): 'done' | 'fail' | 'denied' | null {
  let failed = false;
  let denied = false;
  let sawApplyDone = false;
  let sawInitDone = false;
  let sawPlan = false;
  let sawNoChanges = false;
  for (const line of lines) {
    const plain = stripAnsi(line);
    if (/\[FAILED\]/.test(plain)) failed = true;
    if (/\[DENIED\]/.test(plain)) denied = true;
    if (APPLY_DONE_RE.test(plain)) sawApplyDone = true;
    if (INIT_DONE_RE.test(plain)) sawInitDone = true;
    if (/Plan:\s+\d+ to add/.test(plain)) sawPlan = true;
    if (/No changes\./.test(plain)) sawNoChanges = true;
  }
  if (denied) return 'denied';
  if (failed) return 'fail';
  if (ctx === 'apply' || ctx === 'destroy') {
    // "No changes" apply skips the approval prompt and still prints "Apply
    // complete!", but accept either marker defensively.
    return sawApplyDone || (sawNoChanges && !sawPlan) ? 'done' : null;
  }
  if (ctx === 'init') {
    return sawInitDone ? 'done' : null;
  }
  // plan / unknown: a plan result (or completion) is terminal.
  return sawPlan || sawNoChanges || sawApplyDone ? 'done' : null;
}

/**
 * Derives a coarse per-target status from streamed lines.
 *
 * Status rules:
 *  - A section that has reached a terminal plan-count, `[FAILED]`, or
 *    `[DENIED]` marker is done, failed, or denied respectively.
 *  - In parallel runs, every started section that is not terminal is `running`
 *    (they all stream concurrently).
 *  - In sequential runs, only the last non-terminal section is `running`; any
 *    earlier non-terminal section is treated as `done` (it finished and the
 *    runner moved on).
 *  - `expectedTargets` entries with no section seen yet are `queued`.
 *
 * Degrades gracefully: unknown / unseen targets become `queued`, never throws.
 */
export function deriveTargetStatuses(lines: string[], expectedTargets?: string[], command?: string): TargetState[] {
  const sections = parseEnvSections(lines ?? []);
  const parallel = isParallelStream(lines ?? []);

  const seen: TargetState[] = sections.map((s, i) => {
    // Per-section stage (auto runs) takes precedence over the run-level command
    // so each apply/plan/init section is judged terminal by the right markers.
    const term = sectionTerminalStatus(s.lines, s.stage ?? command);
    if (term === 'denied') return { name: s.name, status: 'denied' as TargetStatus };
    if (term === 'fail') return { name: s.name, status: 'fail' as TargetStatus };
    if (term === 'done') return { name: s.name, status: 'done' as TargetStatus };
    // Not terminal yet.
    if (parallel) return { name: s.name, status: 'running' as TargetStatus };
    // Sequential: only the last seen section can be running.
    const isLast = i === sections.length - 1;
    return { name: s.name, status: (isLast ? 'running' : 'done') as TargetStatus };
  });

  if (!expectedTargets || expectedTargets.length === 0) return seen;

  const seenByName = new Map(seen.map(s => [s.name, s]));
  return expectedTargets.map(name => seenByName.get(name) ?? { name, status: 'queued' as TargetStatus });
}
