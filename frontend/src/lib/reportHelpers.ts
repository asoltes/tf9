/**
 * Pure helpers for the Reports page and ReportViewer.
 */
import type { Report } from '../types';

/** Derive counts of reports per command (including "all"). */
export function commandCounts(reports: Report[]): Record<string, number> {
  const counts: Record<string, number> = { all: reports.length };
  for (const r of reports) {
    counts[r.command] = (counts[r.command] ?? 0) + 1;
  }
  return counts;
}

/** Returns reports filtered by command chip selection. */
export function filterByCommand(reports: Report[], selected: string): Report[] {
  if (selected === 'all') return reports;
  return reports.filter(r => r.command === selected);
}

/**
 * Compute the proportions (0–1) for a change bar given add/change/destroy totals.
 * Returns { addP, changeP, destroyP } that sum to ≤1.
 * If all are zero, returns all zeros.
 */
export function changeBarProportions(add: number, change: number, destroy: number): {
  addP: number; changeP: number; destroyP: number;
} {
  const total = add + change + destroy;
  if (total === 0) return { addP: 0, changeP: 0, destroyP: 0 };
  return {
    addP:     add / total,
    changeP:  change / total,
    destroyP: destroy / total,
  };
}
