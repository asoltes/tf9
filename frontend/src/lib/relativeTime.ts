/**
 * Pure helper for human-readable relative time strings.
 * e.g. "just now", "5m ago", "2h ago", "3d ago", "Jan 5"
 */

export function relativeTime(date: Date | string, now?: Date): string {
  const then = typeof date === 'string' ? new Date(date) : date;
  const base = now ?? new Date();
  const diffMs = base.getTime() - then.getTime();

  if (diffMs < 0) return 'just now';
  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) {
    const m = Math.floor(diffMs / 60_000);
    return `${m}m ago`;
  }
  if (diffMs < 86_400_000) {
    const h = Math.floor(diffMs / 3_600_000);
    return `${h}h ago`;
  }
  if (diffMs < 7 * 86_400_000) {
    const d = Math.floor(diffMs / 86_400_000);
    return `${d}d ago`;
  }
  // Older than 7 days: show abbreviated date
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
