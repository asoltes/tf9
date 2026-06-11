import { describe, it, expect } from 'vitest';
import { relativeTime } from './relativeTime';

const NOW = new Date('2026-06-08T12:00:00Z');

describe('relativeTime', () => {
  it('returns "just now" for 0 seconds ago', () => {
    expect(relativeTime(NOW, NOW)).toBe('just now');
  });

  it('returns "just now" for 30 seconds ago', () => {
    const t = new Date(NOW.getTime() - 30_000);
    expect(relativeTime(t, NOW)).toBe('just now');
  });

  it('returns "just now" for future dates', () => {
    const t = new Date(NOW.getTime() + 5000);
    expect(relativeTime(t, NOW)).toBe('just now');
  });

  it('returns "1m ago" for 90 seconds ago', () => {
    const t = new Date(NOW.getTime() - 90_000);
    expect(relativeTime(t, NOW)).toBe('1m ago');
  });

  it('returns "5m ago" for 5 minutes ago', () => {
    const t = new Date(NOW.getTime() - 5 * 60_000);
    expect(relativeTime(t, NOW)).toBe('5m ago');
  });

  it('returns "59m ago" for 59 minutes ago', () => {
    const t = new Date(NOW.getTime() - 59 * 60_000);
    expect(relativeTime(t, NOW)).toBe('59m ago');
  });

  it('returns "1h ago" for 1 hour ago', () => {
    const t = new Date(NOW.getTime() - 3_600_000);
    expect(relativeTime(t, NOW)).toBe('1h ago');
  });

  it('returns "2h ago" for 2 hours ago', () => {
    const t = new Date(NOW.getTime() - 2 * 3_600_000);
    expect(relativeTime(t, NOW)).toBe('2h ago');
  });

  it('returns "23h ago" for 23 hours ago', () => {
    const t = new Date(NOW.getTime() - 23 * 3_600_000);
    expect(relativeTime(t, NOW)).toBe('23h ago');
  });

  it('returns "1d ago" for 1 day ago', () => {
    const t = new Date(NOW.getTime() - 86_400_000);
    expect(relativeTime(t, NOW)).toBe('1d ago');
  });

  it('returns "6d ago" for 6 days ago', () => {
    const t = new Date(NOW.getTime() - 6 * 86_400_000);
    expect(relativeTime(t, NOW)).toBe('6d ago');
  });

  it('returns abbreviated date for 8 days ago', () => {
    const t = new Date(NOW.getTime() - 8 * 86_400_000);
    const result = relativeTime(t, NOW);
    // Should be a date string like "May 31" - not a relative time
    expect(result).not.toMatch(/ago/);
    expect(result.length).toBeGreaterThan(0);
  });

  it('accepts string dates', () => {
    const t = new Date(NOW.getTime() - 5 * 60_000).toISOString();
    expect(relativeTime(t, NOW)).toBe('5m ago');
  });
});
