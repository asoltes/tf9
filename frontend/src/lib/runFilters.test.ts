import { describe, it, expect } from 'vitest';
import {
  emptyFilters,
  isEmptyFilters,
  validateRange,
  toQuery,
  parseHashQuery,
  toHashQuery,
  presetRange,
} from './runFilters';

// A fixed "now": Friday 2026-06-12, 15:30 local time.
const NOW = new Date(2026, 5, 12, 15, 30, 0);

describe('presetRange', () => {
  it('today is a single local day', () => {
    expect(presetRange('today', NOW)).toEqual({ from: '2026-06-12', to: '2026-06-12' });
  });
  it('yesterday is the previous local day', () => {
    expect(presetRange('yesterday', NOW)).toEqual({ from: '2026-06-11', to: '2026-06-11' });
  });
  it('last 7 days includes today', () => {
    expect(presetRange('last7', NOW)).toEqual({ from: '2026-06-06', to: '2026-06-12' });
  });
  it('last 30 days includes today', () => {
    expect(presetRange('last30', NOW)).toEqual({ from: '2026-05-14', to: '2026-06-12' });
  });
});

describe('toQuery', () => {
  it('returns empty string for empty filters', () => {
    expect(toQuery(emptyFilters())).toBe('');
  });

  it('converts local dates to inclusive start/end-of-day RFC3339 timestamps', () => {
    const qs = toQuery({ from: '2026-06-01', to: '2026-06-03', commands: [], statuses: [], ticket: '' });
    const params = new URLSearchParams(qs);
    const from = new Date(params.get('from')!);
    const to = new Date(params.get('to')!);
    expect(from.getTime()).toBe(new Date(2026, 5, 1, 0, 0, 0, 0).getTime());
    expect(to.getTime()).toBe(new Date(2026, 5, 3, 23, 59, 59, 999).getTime());
  });

  it('repeats command params and combines with dates', () => {
    const qs = toQuery({ from: '2026-06-01', to: null, commands: ['plan', 'apply'], statuses: ['success'], ticket: 'OPS-42' });
    const params = new URLSearchParams(qs);
    expect(params.getAll('command')).toEqual(['plan', 'apply']);
    expect(params.get('from')).toBeTruthy();
    expect(params.get('to')).toBeNull();
    expect(params.getAll('status')).toEqual(['success']);
    expect(params.get('ticket')).toBe('OPS-42');
  });
});

describe('hash round-trip', () => {
  it('serializes and parses back the same filters', () => {
    const f = { from: '2026-06-01', to: '2026-06-12', commands: ['plan', 'destroy'], statuses: ['failed'], ticket: 'OPS-42' };
    expect(parseHashQuery(toHashQuery(f))).toEqual(f);
  });

  it('empty filters serialize to empty string', () => {
    expect(toHashQuery(emptyFilters())).toBe('');
  });

  it('parses an empty/garbage query as empty filters', () => {
    expect(parseHashQuery('')).toEqual(emptyFilters());
    expect(parseHashQuery('?bogus=1')).toEqual(emptyFilters());
  });

  it('drops malformed dates on parse', () => {
    expect(parseHashQuery('?from=notadate&command=plan')).toEqual({
      from: null,
      to: null,
      commands: ['plan'],
      statuses: [],
      ticket: '',
    });
  });
});

describe('validateRange', () => {
  it('accepts empty and single-ended ranges', () => {
    expect(validateRange(emptyFilters())).toBeNull();
    expect(validateRange({ from: '2026-06-01', to: null, commands: [], statuses: [], ticket: '' })).toBeNull();
    expect(validateRange({ from: null, to: '2026-06-01', commands: [], statuses: [], ticket: '' })).toBeNull();
  });
  it('accepts a single-day range', () => {
    expect(validateRange({ from: '2026-06-01', to: '2026-06-01', commands: [], statuses: [], ticket: '' })).toBeNull();
  });
  it('rejects end before start', () => {
    expect(validateRange({ from: '2026-06-02', to: '2026-06-01', commands: [], statuses: [], ticket: '' })).toMatch(/before/i);
  });
});

describe('isEmptyFilters', () => {
  it('is true only when nothing is set', () => {
    expect(isEmptyFilters(emptyFilters())).toBe(true);
    expect(isEmptyFilters({ from: '2026-06-01', to: null, commands: [], statuses: [], ticket: '' })).toBe(false);
    expect(isEmptyFilters({ from: null, to: null, commands: ['plan'], statuses: [], ticket: '' })).toBe(false);
    expect(isEmptyFilters({ from: null, to: null, commands: [], statuses: ['failed'], ticket: '' })).toBe(false);
    expect(isEmptyFilters({ from: null, to: null, commands: [], statuses: [], ticket: 'OPS-42' })).toBe(false);
  });
});
