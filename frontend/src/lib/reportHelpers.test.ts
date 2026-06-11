import { describe, it, expect } from 'vitest';
import { commandCounts, filterByCommand, changeBarProportions } from './reportHelpers';
import type { Report } from '../types';

const makeReport = (command: string, name = 'r'): Report => ({
  name,
  command,
  runAt: '2026-06-08T10:00:00Z',
  sizeKb: 10,
  isLive: false,
  add: 1,
  change: 0,
  destroy: 0,
  envs: 1,
  failed: 0,
});

describe('commandCounts', () => {
  it('returns all:0 for empty list', () => {
    expect(commandCounts([])).toEqual({ all: 0 });
  });

  it('counts each command separately plus all', () => {
    const reports = [
      makeReport('plan', 'r1'),
      makeReport('plan', 'r2'),
      makeReport('apply', 'r3'),
    ];
    expect(commandCounts(reports)).toEqual({ all: 3, plan: 2, apply: 1 });
  });

  it('handles single report', () => {
    expect(commandCounts([makeReport('destroy', 'r1')])).toEqual({ all: 1, destroy: 1 });
  });
});

describe('filterByCommand', () => {
  const reports = [
    makeReport('plan', 'r1'),
    makeReport('plan', 'r2'),
    makeReport('apply', 'r3'),
    makeReport('destroy', 'r4'),
  ];

  it('returns all reports for "all"', () => {
    expect(filterByCommand(reports, 'all')).toHaveLength(4);
  });

  it('filters to only plan reports', () => {
    const result = filterByCommand(reports, 'plan');
    expect(result).toHaveLength(2);
    expect(result.every(r => r.command === 'plan')).toBe(true);
  });

  it('filters to only apply reports', () => {
    const result = filterByCommand(reports, 'apply');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('r3');
  });

  it('returns empty for unknown command', () => {
    expect(filterByCommand(reports, 'init')).toHaveLength(0);
  });
});

describe('changeBarProportions', () => {
  it('returns all zeros when no changes', () => {
    expect(changeBarProportions(0, 0, 0)).toEqual({ addP: 0, changeP: 0, destroyP: 0 });
  });

  it('returns 1 for add when only additions', () => {
    const { addP, changeP, destroyP } = changeBarProportions(5, 0, 0);
    expect(addP).toBe(1);
    expect(changeP).toBe(0);
    expect(destroyP).toBe(0);
  });

  it('returns equal thirds for equal counts', () => {
    const { addP, changeP, destroyP } = changeBarProportions(3, 3, 3);
    expect(addP).toBeCloseTo(1/3);
    expect(changeP).toBeCloseTo(1/3);
    expect(destroyP).toBeCloseTo(1/3);
  });

  it('proportions sum to 1 for mixed values', () => {
    const { addP, changeP, destroyP } = changeBarProportions(10, 4, 6);
    expect(addP + changeP + destroyP).toBeCloseTo(1);
  });

  it('handles add+change with no destroy', () => {
    const { addP, changeP, destroyP } = changeBarProportions(3, 1, 0);
    expect(addP).toBeCloseTo(0.75);
    expect(changeP).toBeCloseTo(0.25);
    expect(destroyP).toBe(0);
  });
});
