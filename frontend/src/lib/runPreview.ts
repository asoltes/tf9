/**
 * Pure helpers for the New Run modal: CLI-preview assembly, group derivation,
 * lock-id map building, and command normalization.
 *
 * Dependency-free and synchronous so they can be unit-tested in isolation.
 */

/** Raw target shape received from GET /api/repos/{name}/config. */
export interface RawTarget {
  directory: string;
  name: string;
  aws_profile: string;
  account_id?: string;
  region?: string;
  disabled?: boolean;
  group?: string;
}

/** Primary commands surfaced as chips/segments. */
export const PRIMARY_COMMANDS = ['init', 'plan', 'apply', 'destroy', 'auto'] as const;

/** Secondary commands surfaced in the "More commands" dropdown. */
export const MORE_COMMANDS = [
  'validate',
  'refresh',
  'state list',
  'output',
  'import',
  'taint',
  'untaint',
  'force-unlock',
] as const;

export interface RunCommandInfo {
  label: string;
  short: string;
  description: string;
}

/** User-facing command guidance shared by the New Run command picker. */
export const RUN_COMMAND_INFO: Record<string, RunCommandInfo> = {
  auto: {
    label: 'auto',
    short: 'init → plan → apply',
    description: 'Initializes Terraform, previews the proposed changes, then applies them in sequence. Apply pauses for approval unless auto-approve is enabled.',
  },
  init: {
    label: 'init',
    short: 'Initialize directory',
    description: 'Prepares each target directory by configuring the backend and installing the required providers and modules.',
  },
  plan: {
    label: 'plan',
    short: 'Preview changes',
    description: 'Compares configuration with current state and shows the actions Terraform would take without changing infrastructure.',
  },
  apply: {
    label: 'apply',
    short: 'Provision changes',
    description: 'Executes the proposed infrastructure changes for the selected targets. Terraform requests approval unless auto-approve is enabled.',
  },
  destroy: {
    label: 'destroy',
    short: 'Tear down resources',
    description: 'Permanently removes all Terraform-managed resources in the selected targets. This action requires an additional confirmation.',
  },
  validate: {
    label: 'validate',
    short: 'Check configuration',
    description: 'Checks Terraform files for syntax and internal consistency without accessing remote services or changing infrastructure.',
  },
  refresh: {
    label: 'refresh',
    short: 'Synchronize state',
    description: 'Reads real infrastructure and updates Terraform state to match it. This can modify state but does not change remote resources.',
  },
  'state list': {
    label: 'state list',
    short: 'List tracked resources',
    description: 'Lists every resource address currently tracked in Terraform state for the selected targets.',
  },
  output: {
    label: 'output',
    short: 'Show output values',
    description: 'Displays the root module output values stored in Terraform state.',
  },
  import: {
    label: 'import',
    short: 'Track existing resources',
    description: 'Associates an existing infrastructure object with a Terraform resource address without creating the object.',
  },
  taint: {
    label: 'taint',
    short: 'Mark for replacement',
    description: 'Marks a resource as degraded so Terraform proposes replacing it during the next plan and apply.',
  },
  untaint: {
    label: 'untaint',
    short: 'Cancel replacement mark',
    description: 'Removes a taint mark so Terraform no longer forces replacement of that resource.',
  },
  'force-unlock': {
    label: 'force-unlock',
    short: 'Remove a state lock',
    description: 'Manually removes a Terraform state lock. Use only when no other process is actively operating on that state.',
  },
};

/**
 * Normalizes a UI command selection into the actual terraform command plus any
 * leading args. `state list` becomes command `state` with a leading `list` arg
 * because the runner runs `terraform <command> <args...>` and `state list` is
 * two tokens. All other selections pass through unchanged.
 */
export function normalizeCommand(uiCommand: string): { command: string; leadingArgs: string[] } {
  if (uiCommand === 'state list') {
    return { command: 'state', leadingArgs: ['list'] };
  }
  return { command: uiCommand, leadingArgs: [] };
}

/**
 * Derives the group key for a target. Uses the explicit `group` field when
 * present, otherwise falls back to the first path segment of its directory
 * (e.g. "environments/dev" → "environments"), or the target name as a last
 * resort.
 */
export function groupKey(t: Pick<RawTarget, 'group' | 'directory' | 'name'>): string {
  if (t.group && t.group.trim()) return t.group;
  if (t.directory && t.directory.includes('/')) {
    const first = t.directory.split('/')[0];
    if (first) return first;
  }
  return t.directory || t.name;
}

export interface DerivedGroup {
  group: string;
  targets: RawTarget[];
}

/**
 * Filters out disabled targets and buckets the rest into ordered groups.
 * Empty groups never appear. Group order follows first-appearance order of the
 * input targets.
 */
export function deriveGroups(targets: RawTarget[]): DerivedGroup[] {
  const order: string[] = [];
  const map = new Map<string, RawTarget[]>();
  for (const t of targets) {
    if (t.disabled) continue;
    const key = groupKey(t);
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(t);
  }
  return order.map(group => ({ group, targets: map.get(group)! }));
}

/**
 * Builds the per-target lock-id map for force-unlock. Keyed by target name;
 * targets with an empty/whitespace id are omitted (the backend skips them).
 */
export function buildLockIds(entries: Array<{ name: string; lockId: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of entries) {
    const id = (e.lockId ?? '').trim();
    if (id) out[e.name] = id;
  }
  return out;
}

/** Serializes a lock-id map into the `name:id,name:id` CLI form. */
export function formatLockIdsFlag(lockIds: Record<string, string>): string {
  return Object.entries(lockIds)
    .map(([name, id]) => `${name}:${id}`)
    .join(',');
}

export interface CliPreviewInput {
  /** UI command selection (may be "state list"). */
  uiCommand: string;
  /** Selected target names, in execution order. */
  targets: string[];
  /** Profile override (empty = none). */
  profile?: string;
  /** Editable extra flags, already split into tokens. */
  extraArgs?: string[];
  /** Apply auto-approve flag. */
  autoApprove?: boolean;
  /** Collected force-unlock lock ids (name → id). */
  lockIds?: Record<string, string>;
}

/**
 * Assembles a single representative terraform command line plus a target-order
 * note. Returns the line and an optional note describing the target ordering.
 *
 * Token order: terraform <command> [<leadingArgs>] [-auto-approve] [--lock-ids ...]
 *              [extra args]  (profile shown as a leading env assignment)
 */
export function buildCliPreview(input: CliPreviewInput): { line: string; note: string } {
  const { command, leadingArgs } = normalizeCommand(input.uiCommand);
  const tokens: string[] = [];

  if (input.profile && input.profile.trim()) {
    tokens.push(`AWS_PROFILE=${input.profile.trim()}`);
  }
  tokens.push('terraform', command, ...leadingArgs);

  if (input.autoApprove && command === 'apply') {
    tokens.push('-auto-approve');
  }

  if (command === 'force-unlock' && input.lockIds && Object.keys(input.lockIds).length > 0) {
    tokens.push('--lock-ids', formatLockIdsFlag(input.lockIds));
  }

  if (input.extraArgs) {
    for (const a of input.extraArgs) {
      if (a) tokens.push(a);
    }
  }

  const line = tokens.join(' ');

  let note = '';
  const targets = input.targets ?? [];
  if (targets.length === 1) {
    note = `Target: ${targets[0]}`;
  } else if (targets.length > 1) {
    note = `Targets (in order): ${targets.join(' → ')}`;
  }

  return { line, note };
}

/** Preview-rail syntax-highlight palette (kept consistent with lib/colors). */
export const PREVIEW_COLORS = {
  command: '#58a6ff', // blue
  flag: '#8b949e',    // grey
  value: '#3fb950',   // green
} as const;

export type PreviewTokenKind = 'command' | 'flag' | 'value' | 'plain';

/**
 * Classifies a single CLI token for syntax highlighting:
 *  - the literal "terraform" and the command word → command (blue)
 *  - tokens starting with "-" → flag (grey)
 *  - KEY=VALUE env assignments and bare values → value (green)
 *  - everything else → plain
 */
export function tokenizePreview(line: string): Array<{ text: string; kind: PreviewTokenKind }> {
  const parts = line.split(' ').filter(Boolean);
  const out: Array<{ text: string; kind: PreviewTokenKind }> = [];
  let sawTerraform = false;
  let sawCommand = false;
  for (const p of parts) {
    let kind: PreviewTokenKind;
    if (p === 'terraform') {
      kind = 'command';
      sawTerraform = true;
    } else if (sawTerraform && !sawCommand && !p.startsWith('-')) {
      kind = 'command';
      sawCommand = true;
    } else if (p.startsWith('-')) {
      kind = 'flag';
    } else {
      kind = 'value';
    }
    out.push({ text: p, kind });
  }
  return out;
}
