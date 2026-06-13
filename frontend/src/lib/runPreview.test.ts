/**
 * Unit tests for runPreview.ts
 * Requires vitest — run with: npm run test
 * (vitest is not yet configured in this project; excluded from tsc)
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeCommand,
  groupKey,
  deriveGroups,
  buildLockIds,
  formatLockIdsFlag,
  buildCliPreview,
  tokenizePreview,
  PRIMARY_COMMANDS,
  MORE_COMMANDS,
  RUN_COMMAND_INFO,
  type RawTarget,
} from './runPreview';

describe('RUN_COMMAND_INFO', () => {
  it('documents every primary and secondary command', () => {
    for (const command of [...PRIMARY_COMMANDS, ...MORE_COMMANDS]) {
      expect(RUN_COMMAND_INFO[command]?.label).toBe(command);
      expect(RUN_COMMAND_INFO[command]?.short.length).toBeGreaterThan(0);
      expect(RUN_COMMAND_INFO[command]?.description.length).toBeGreaterThan(20);
    }
  });
});

describe('normalizeCommand', () => {
  it('passes through ordinary commands', () => {
    expect(normalizeCommand('plan')).toEqual({ command: 'plan', leadingArgs: [] });
    expect(normalizeCommand('force-unlock')).toEqual({ command: 'force-unlock', leadingArgs: [] });
  });
  it('splits "state list" into state + list arg', () => {
    expect(normalizeCommand('state list')).toEqual({ command: 'state', leadingArgs: ['list'] });
  });
});

describe('groupKey', () => {
  it('uses explicit group when present', () => {
    expect(groupKey({ group: 'core', directory: 'environments/dev', name: 'dev' })).toBe('core');
  });
  it('falls back to first directory segment', () => {
    expect(groupKey({ directory: 'environments/dev', name: 'dev' })).toBe('environments');
  });
  it('falls back to directory then name', () => {
    expect(groupKey({ directory: 'dev', name: 'dev' })).toBe('dev');
    expect(groupKey({ directory: '', name: 'solo' })).toBe('solo');
  });
  it('ignores blank group', () => {
    expect(groupKey({ group: '   ', directory: 'environments/dev', name: 'dev' })).toBe('environments');
  });
});

describe('deriveGroups', () => {
  const targets: RawTarget[] = [
    { name: 'dev', directory: 'environments/dev', aws_profile: 'p1' },
    { name: 'qa', directory: 'environments/qa', aws_profile: 'p2' },
    { name: 'global', directory: 'global/iam', aws_profile: 'p3', group: 'global' },
    { name: 'old', directory: 'environments/old', aws_profile: 'p4', disabled: true },
  ];
  it('filters disabled targets', () => {
    const g = deriveGroups(targets);
    const names = g.flatMap(x => x.targets.map(t => t.name));
    expect(names).not.toContain('old');
  });
  it('buckets by derived group preserving first-seen order', () => {
    const g = deriveGroups(targets);
    expect(g.map(x => x.group)).toEqual(['environments', 'global']);
    expect(g[0].targets.map(t => t.name)).toEqual(['dev', 'qa']);
    expect(g[1].targets.map(t => t.name)).toEqual(['global']);
  });
  it('hides empty groups (all-disabled group absent)', () => {
    const only: RawTarget[] = [{ name: 'x', directory: 'z/x', aws_profile: 'p', disabled: true }];
    expect(deriveGroups(only)).toEqual([]);
  });
});

describe('buildLockIds', () => {
  it('keys by name and drops empty ids', () => {
    expect(buildLockIds([
      { name: 'dev', lockId: 'abc-123' },
      { name: 'qa', lockId: '' },
      { name: 'prod', lockId: '  def  ' },
    ])).toEqual({ dev: 'abc-123', prod: 'def' });
  });
  it('returns empty object when none set', () => {
    expect(buildLockIds([{ name: 'a', lockId: '' }])).toEqual({});
  });
});

describe('formatLockIdsFlag', () => {
  it('serializes to name:id,name:id', () => {
    expect(formatLockIdsFlag({ dev: 'abc', prod: 'def' })).toBe('dev:abc,prod:def');
  });
});

describe('buildCliPreview', () => {
  it('plan with single target', () => {
    const r = buildCliPreview({ uiCommand: 'plan', targets: ['dev'] });
    expect(r.line).toBe('terraform plan');
    expect(r.note).toBe('Target: dev');
  });
  it('apply with auto-approve and ordered targets', () => {
    const r = buildCliPreview({ uiCommand: 'apply', targets: ['dev', 'prod'], autoApprove: true });
    expect(r.line).toBe('terraform apply -auto-approve');
    expect(r.note).toBe('Targets (in order): dev → prod');
  });
  it('apply without auto-approve omits the flag', () => {
    const r = buildCliPreview({ uiCommand: 'apply', targets: ['dev'], autoApprove: false });
    expect(r.line).toBe('terraform apply');
  });
  it('auto-approve only applies to apply command', () => {
    const r = buildCliPreview({ uiCommand: 'plan', targets: ['dev'], autoApprove: true });
    expect(r.line).toBe('terraform plan');
  });
  it('state list normalizes to state + list', () => {
    const r = buildCliPreview({ uiCommand: 'state list', targets: ['dev'] });
    expect(r.line).toBe('terraform state list');
  });
  it('force-unlock includes --lock-ids', () => {
    const r = buildCliPreview({
      uiCommand: 'force-unlock',
      targets: ['dev', 'prod'],
      lockIds: { dev: 'abc', prod: 'def' },
    });
    expect(r.line).toBe('terraform force-unlock --lock-ids dev:abc,prod:def');
  });
  it('includes profile and extra args', () => {
    const r = buildCliPreview({
      uiCommand: 'plan',
      targets: ['dev'],
      profile: 'myprofile',
      extraArgs: ['-target=aws_s3_bucket.foo'],
    });
    expect(r.line).toBe('AWS_PROFILE=myprofile terraform plan -target=aws_s3_bucket.foo');
  });
  it('no note when no targets', () => {
    const r = buildCliPreview({ uiCommand: 'plan', targets: [] });
    expect(r.note).toBe('');
  });
});

describe('tokenizePreview', () => {
  it('classifies terraform and command as command tokens', () => {
    const t = tokenizePreview('terraform plan -input=false');
    expect(t[0]).toEqual({ text: 'terraform', kind: 'command' });
    expect(t[1]).toEqual({ text: 'plan', kind: 'command' });
    expect(t[2]).toEqual({ text: '-input=false', kind: 'flag' });
  });
  it('classifies env assignment as value', () => {
    const t = tokenizePreview('AWS_PROFILE=foo terraform plan');
    expect(t[0]).toEqual({ text: 'AWS_PROFILE=foo', kind: 'value' });
    expect(t[1].kind).toBe('command');
    expect(t[2].kind).toBe('command');
  });
  it('classifies bare values after flags as value', () => {
    const t = tokenizePreview('terraform force-unlock --lock-ids dev:abc');
    expect(t[2]).toEqual({ text: '--lock-ids', kind: 'flag' });
    expect(t[3]).toEqual({ text: 'dev:abc', kind: 'value' });
  });
});
