import { describe, it, expect } from 'vitest';
import {
  deriveTargetStatuses,
  parseEnvSections,
  parseCounts,
  sectionTerminalStatus,
  isParallelStream,
  stripAnsi,
  updateApprovalGate,   // NEW — does not exist yet; import fails before fix
  APPROVAL_SENTINEL,    // NEW — does not exist yet; import fails before fix
} from './runStatus';

function banner(env: string, profile = 'p'): string[] {
  return [
    '════════════════════════════════════════',
    `  ENV: ${env}  |  PROFILE: ${profile}`,
    '  CMD: terraform plan',
    '════════════════════════════════════════',
  ];
}

function pbanner(env: string, profile = 'p'): string[] {
  return [
    `[${env}] ════════════════════════════════════════`,
    `[${env}]   ENV: ${env}  |  PROFILE: ${profile}`,
    `[${env}]   CMD: terraform plan`,
    `[${env}] ════════════════════════════════════════`,
  ];
}

describe('stripAnsi', () => {
  it('removes ANSI color codes', () => {
    expect(stripAnsi('\x1b[32m+ resource\x1b[0m')).toBe('+ resource');
  });
});

describe('isParallelStream', () => {
  it('is false for empty and sequential output', () => {
    expect(isParallelStream([])).toBe(false);
    expect(isParallelStream(banner('dev'))).toBe(false);
  });
  it('is true when most lines are [env] prefixed', () => {
    expect(isParallelStream([...pbanner('dev'), '[dev] hello', '[qa] world'])).toBe(true);
  });
});

describe('parseEnvSections (sequential)', () => {
  it('returns [] when no banner yet', () => {
    expect(parseEnvSections(['Initializing...', 'Refreshing state...'])).toEqual([]);
  });
  it('parses a single section with name and profile', () => {
    const lines = [...banner('dev', 'my-dev'), 'Plan: 1 to add, 0 to change, 0 to destroy'];
    const s = parseEnvSections(lines);
    expect(s).toHaveLength(1);
    expect(s[0].name).toBe('dev');
    expect(s[0].profile).toBe('my-dev');
    expect(s[0].lines).toContain('Plan: 1 to add, 0 to change, 0 to destroy');
  });
  it('parses multiple sections in order', () => {
    const lines = [
      ...banner('dev'), 'No changes.',
      ...banner('prod'), 'Plan: 2 to add, 0 to change, 0 to destroy',
    ];
    const s = parseEnvSections(lines);
    expect(s.map(x => x.name)).toEqual(['dev', 'prod']);
  });
});

describe('parseEnvSections (parallel)', () => {
  it('groups by [env] prefix and strips banner scaffolding', () => {
    const lines = [
      ...pbanner('dev'), '[dev] Plan: 1 to add, 0 to change, 0 to destroy',
      ...pbanner('qa'), '[qa] No changes.',
    ];
    const s = parseEnvSections(lines);
    expect(s.map(x => x.name)).toEqual(['dev', 'qa']);
    expect(s[0].lines).toEqual(['Plan: 1 to add, 0 to change, 0 to destroy']);
    expect(s[1].lines).toEqual(['No changes.']);
    expect(s[0].profile).toBe('p');
  });
});

describe('parseCounts', () => {
  it('parses add/change/destroy', () => {
    expect(parseCounts(['Plan: 1 to add, 2 to change, 3 to destroy']))
      .toMatchObject({ add: 1, change: 2, destroy: 3, noChanges: false, failed: false });
  });
  it('detects no changes', () => {
    expect(parseCounts(['No changes.'])).toMatchObject({ noChanges: true });
  });
  it('detects failure', () => {
    expect(parseCounts(['[FAILED] dev'])).toMatchObject({ failed: true });
  });
  it('ignores ANSI codes', () => {
    expect(parseCounts(['\x1b[34mPlan: 5 to add, 0 to change, 0 to destroy\x1b[0m']))
      .toMatchObject({ add: 5 });
  });
});

describe('deriveTargetStatuses', () => {
  it('no sections yet → all queued (with expectedTargets)', () => {
    const r = deriveTargetStatuses(['Initializing...'], ['dev', 'qa', 'prod']);
    expect(r).toEqual([
      { name: 'dev', status: 'queued' },
      { name: 'qa', status: 'queued' },
      { name: 'prod', status: 'queued' },
    ]);
  });

  it('no sections yet, no expectedTargets → empty', () => {
    expect(deriveTargetStatuses(['Initializing...'])).toEqual([]);
  });

  it('sequential: one section streaming → running', () => {
    const lines = [...banner('dev'), 'Refreshing state...'];
    expect(deriveTargetStatuses(lines)).toEqual([{ name: 'dev', status: 'running' }]);
  });

  it('sequential: earlier done + last running', () => {
    const lines = [
      ...banner('dev'), 'Plan: 1 to add, 0 to change, 0 to destroy',
      ...banner('prod'), 'Refreshing...',
    ];
    expect(deriveTargetStatuses(lines)).toEqual([
      { name: 'dev', status: 'done' },
      { name: 'prod', status: 'running' },
    ]);
  });

  it('sequential: failed section', () => {
    const lines = [...banner('dev'), 'Error: boom', '[FAILED] dev'];
    expect(deriveTargetStatuses(lines)).toEqual([{ name: 'dev', status: 'fail' }]);
  });

  it('sequential: all done', () => {
    const lines = [
      ...banner('dev'), 'No changes.',
      ...banner('prod'), 'Plan: 0 to add, 1 to change, 0 to destroy',
    ];
    // last section is terminal → done (not running)
    expect(deriveTargetStatuses(lines)).toEqual([
      { name: 'dev', status: 'done' },
      { name: 'prod', status: 'done' },
    ]);
  });

  it('parallel: all started, none terminal → all running', () => {
    const lines = [
      ...pbanner('dev'), '[dev] Refreshing...',
      ...pbanner('qa'), '[qa] Refreshing...',
    ];
    expect(deriveTargetStatuses(lines)).toEqual([
      { name: 'dev', status: 'running' },
      { name: 'qa', status: 'running' },
    ]);
  });

  it('parallel: some done + one running + one failed', () => {
    const lines = [
      ...pbanner('dev'), '[dev] Plan: 1 to add, 0 to change, 0 to destroy',
      ...pbanner('qa'), '[qa] Refreshing...',
      ...pbanner('prod'), '[prod] Error', '[prod] [FAILED] prod',
    ];
    expect(deriveTargetStatuses(lines)).toEqual([
      { name: 'dev', status: 'done' },
      { name: 'qa', status: 'running' },
      { name: 'prod', status: 'fail' },
    ]);
  });

  it('merges expectedTargets: seen statuses + queued for unseen', () => {
    const lines = [...banner('dev'), 'No changes.'];
    expect(deriveTargetStatuses(lines, ['dev', 'qa'])).toEqual([
      { name: 'dev', status: 'done' },
      { name: 'qa', status: 'queued' },
    ]);
  });

  it('degrades gracefully on empty input', () => {
    expect(deriveTargetStatuses([])).toEqual([]);
    expect(deriveTargetStatuses([], ['a'])).toEqual([{ name: 'a', status: 'queued' }]);
  });

  // ── Apply-stage approval gate ─────────────────────────────────────────────
  // `terraform apply` echoes the plan ("Plan: N to add") before its approval
  // prompt; that line must NOT settle the target as done while it is applying
  // or waiting for approval. Regression guard for the auto-mode apply bug where
  // the running target showed done and the run looked stuck.
  it('apply: target echoing the plan before approval stays running', () => {
    const lines = [
      ...banner('dev'), 'Plan: 1 to add, 0 to change, 0 to destroy',
      'Do you want to perform these actions?', 'Enter a value:',
    ];
    expect(deriveTargetStatuses(lines, ['dev', 'qa'], 'apply')).toEqual([
      { name: 'dev', status: 'running' },
      { name: 'qa', status: 'queued' },
    ]);
  });

  it('apply: target is done only after "Apply complete!"', () => {
    const lines = [
      ...banner('dev'), 'Plan: 1 to add, 0 to change, 0 to destroy',
      'Apply complete! Resources: 1 added, 0 changed, 0 destroyed',
      ...banner('qa'), 'Plan: 2 to add, 0 to change, 0 to destroy', 'Enter a value:',
    ];
    expect(deriveTargetStatuses(lines, ['dev', 'qa', 'loadtest'], 'apply')).toEqual([
      { name: 'dev', status: 'done' },
      { name: 'qa', status: 'running' },
      { name: 'loadtest', status: 'queued' },
    ]);
  });
});

describe('sectionTerminalStatus', () => {
  it('plan context: terminal on Plan: / No changes', () => {
    expect(sectionTerminalStatus(['Plan: 1 to add, 0 to change, 0 to destroy'], 'plan')).toBe('done');
    expect(sectionTerminalStatus(['No changes.'], 'plan')).toBe('done');
    expect(sectionTerminalStatus(['Refreshing...'], 'plan')).toBeNull();
  });
  it('apply context: NOT terminal on Plan: alone (approval pending)', () => {
    expect(sectionTerminalStatus(['Plan: 1 to add, 0 to change, 0 to destroy', 'Enter a value:'], 'apply')).toBeNull();
  });
  it('apply context: terminal on Apply complete!', () => {
    expect(sectionTerminalStatus([
      'Plan: 1 to add, 0 to change, 0 to destroy',
      'Apply complete! Resources: 1 added, 0 changed, 0 destroyed',
    ], 'apply')).toBe('done');
  });
  it('destroy context: terminal on Destroy complete!', () => {
    expect(sectionTerminalStatus(['Destroy complete! Resources: 3 destroyed'], 'destroy')).toBe('done');
  });
  it('init context: terminal on successful init', () => {
    expect(sectionTerminalStatus(['Terraform has been successfully initialized!'], 'init')).toBe('done');
    expect(sectionTerminalStatus(['Initializing provider plugins...'], 'init')).toBeNull();
  });
  it('failure beats everything', () => {
    expect(sectionTerminalStatus(['Plan: 1 to add, 0 to change, 0 to destroy', '[FAILED] dev'], 'apply')).toBe('fail');
  });
  it('recognizes an explicitly denied approval', () => {
    expect(sectionTerminalStatus(['Apply cancelled.', '[DENIED] dev'], 'apply')).toBe('denied');
  });
});

// ── Approval gate state — Bug 3 regression tests ─────────────────────────────
// updateApprovalGate is a pure reducer that the component delegates to for
// deciding when to show/hide the "terraform is waiting for approval" bar.
// Tests fail before Bug 3 is fixed because updateApprovalGate / APPROVAL_SENTINEL
// do not exist in runStatus.ts yet.

describe('updateApprovalGate', () => {
  const init = { pending: false, seenCount: 0, runId: undefined as string | undefined };

  it('sets pending when sentinel first appears', () => {
    const s = updateApprovalGate(init, [APPROVAL_SENTINEL], 'run-1');
    expect(s.pending).toBe(true);
    expect(s.seenCount).toBe(1);
    expect(s.runId).toBe('run-1');
  });

  it('does not re-trigger when sentinel count unchanged', () => {
    const s1 = updateApprovalGate(init, [APPROVAL_SENTINEL], 'run-1');
    // Simulate user approving (pending cleared externally); no new sentinels.
    const s2 = updateApprovalGate({ ...s1, pending: false }, [APPROVAL_SENTINEL], 'run-1');
    expect(s2.pending).toBe(false);
  });

  it('resets pending=false and seenCount=0 when run id changes', () => {
    const s1 = updateApprovalGate(init, [APPROVAL_SENTINEL], 'run-1');
    expect(s1.pending).toBe(true);
    // Switch to a new run — approval gate must reset even if the new run is still running.
    const s2 = updateApprovalGate(s1, [], 'run-2');
    expect(s2.pending).toBe(false);
    expect(s2.seenCount).toBe(0);
    expect(s2.runId).toBe('run-2');
  });

  it('approval gate does not show for queued run (no sentinel in lines)', () => {
    const s = updateApprovalGate(init, ['Refreshing state...'], 'run-3');
    expect(s.pending).toBe(false);
  });

  it('detects a new sentinel in the same run after a reset', () => {
    const s1 = updateApprovalGate(init, [APPROVAL_SENTINEL], 'run-1');
    const s2 = updateApprovalGate(s1, [], 'run-2');        // switch run → reset
    const s3 = updateApprovalGate(s2, [APPROVAL_SENTINEL], 'run-2'); // new sentinel in run-2
    expect(s3.pending).toBe(true);
  });
});
