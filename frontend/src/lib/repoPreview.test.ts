/**
 * Unit tests for repoPreview.ts
 */
import { describe, it, expect } from 'vitest';
import {
  miniPipelineDots,
  enabledCount,
  distinctProfiles,
  existingGroups,
  groupOf,
} from './repoPreview';
import type { RepoTarget } from '../types';

const targets: RepoTarget[] = [
  { name: 'dev', directory: 'environments/dev', aws_profile: 'dev-profile' },
  { name: 'staging', directory: 'environments/staging', aws_profile: 'staging-profile' },
  { name: 'prod', directory: 'environments/prod', aws_profile: 'prod-profile' },
  { name: 'old', directory: 'environments/old', aws_profile: 'dev-profile', disabled: true },
];

describe('miniPipelineDots', () => {
  it('returns one dot per enabled target', () => {
    const dots = miniPipelineDots(targets);
    expect(dots).toHaveLength(3);
    expect(dots.map(d => d.name)).toEqual(['dev', 'staging', 'prod']);
  });

  it('filters out disabled targets', () => {
    const dots = miniPipelineDots(targets);
    expect(dots.every(d => d.name !== 'old')).toBe(true);
  });

  it('assigns the correct colors', () => {
    const dots = miniPipelineDots(targets);
    expect(dots[0].color).toBe('#3fb950');  // dev -> green
    expect(dots[1].color).toBe('#f5a623');  // staging -> amber
    expect(dots[2].color).toBe('#e5484d');  // prod -> red
  });

  it('returns empty array for empty targets', () => {
    expect(miniPipelineDots([])).toEqual([]);
  });

  it('returns empty array when all targets are disabled', () => {
    const allDisabled = targets.map(t => ({ ...t, disabled: true }));
    expect(miniPipelineDots(allDisabled)).toEqual([]);
  });
});

describe('enabledCount', () => {
  it('counts enabled vs total correctly', () => {
    expect(enabledCount(targets)).toEqual({ enabled: 3, total: 4 });
  });

  it('returns 0/0 for empty array', () => {
    expect(enabledCount([])).toEqual({ enabled: 0, total: 0 });
  });

  it('returns full count when none are disabled', () => {
    const t: RepoTarget[] = [
      { name: 'a', directory: 'a', aws_profile: 'p' },
      { name: 'b', directory: 'b', aws_profile: 'p' },
    ];
    expect(enabledCount(t)).toEqual({ enabled: 2, total: 2 });
  });

  it('returns 0 enabled when all are disabled', () => {
    const t = targets.map(x => ({ ...x, disabled: true }));
    expect(enabledCount(t)).toEqual({ enabled: 0, total: 4 });
  });
});

describe('distinctProfiles', () => {
  it('returns unique profiles in first-seen order', () => {
    expect(distinctProfiles(targets)).toEqual(['dev-profile', 'staging-profile', 'prod-profile']);
  });

  it('deduplicates profiles', () => {
    const t: RepoTarget[] = [
      { name: 'a', directory: 'a', aws_profile: 'shared' },
      { name: 'b', directory: 'b', aws_profile: 'shared' },
    ];
    expect(distinctProfiles(t)).toEqual(['shared']);
  });

  it('returns empty array for empty targets', () => {
    expect(distinctProfiles([])).toEqual([]);
  });
});

describe('existingGroups', () => {
  it('derives groups from explicit group field', () => {
    const t: RepoTarget[] = [
      { name: 'dev', directory: 'envs/dev', aws_profile: 'p', group: 'envs' },
      { name: 'prod', directory: 'envs/prod', aws_profile: 'p', group: 'envs' },
      { name: 'global', directory: 'global/iam', aws_profile: 'p', group: 'global' },
    ];
    expect(existingGroups(t)).toEqual(['envs', 'global']);
  });

  it('falls back to first directory segment when no group', () => {
    const t: RepoTarget[] = [
      { name: 'dev', directory: 'environments/dev', aws_profile: 'p' },
      { name: 'prod', directory: 'environments/prod', aws_profile: 'p' },
    ];
    expect(existingGroups(t)).toEqual(['environments']);
  });

  it('returns empty array for empty targets', () => {
    expect(existingGroups([])).toEqual([]);
  });
});

describe('groupOf (re-export of groupKey)', () => {
  it('uses explicit group when present', () => {
    expect(groupOf({ group: 'core', directory: 'envs/dev', name: 'dev' })).toBe('core');
  });

  it('falls back to first directory segment', () => {
    expect(groupOf({ directory: 'environments/dev', name: 'dev' })).toBe('environments');
  });

  it('falls back to directory when no slash', () => {
    expect(groupOf({ directory: 'standalone', name: 'standalone' })).toBe('standalone');
  });
});
