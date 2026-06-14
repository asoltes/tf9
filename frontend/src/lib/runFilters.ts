// Run History filter model: local-date range + multi-command selection.
//
// Dates are held as local calendar days ('YYYY-MM-DD'). They convert to
// inclusive RFC3339 boundaries (local start-of-day / end-of-day) only when
// building the API query, and round-trip through the location hash so
// filters survive refresh and can be shared.

export interface RunFilters {
  /** Local calendar day 'YYYY-MM-DD' (inclusive start), or null. */
  from: string | null;
  /** Local calendar day 'YYYY-MM-DD' (inclusive end), or null. */
  to: string | null;
  /** Selected terraform commands; empty = all commands. */
  commands: string[];
  /** Selected run statuses; empty = all statuses. */
  statuses: string[];
  /** Case-insensitive ticket substring. */
  ticket: string;
}

export type DatePreset = 'today' | 'yesterday' | 'last7' | 'last30';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function emptyFilters(): RunFilters {
  return { from: null, to: null, commands: [], statuses: [], ticket: '' };
}

export function isEmptyFilters(f: RunFilters): boolean {
  return !f.from && !f.to && f.commands.length === 0 && f.statuses.length === 0 && !f.ticket.trim();
}

/** Returns a user-facing error for an invalid range, or null when valid. */
export function validateRange(f: RunFilters): string | null {
  if (f.from && !DATE_RE.test(f.from)) return 'Start date must use the YYYY-MM-DD format.';
  if (f.to && !DATE_RE.test(f.to)) return 'End date must use the YYYY-MM-DD format.';
  if (f.from && f.to && f.to < f.from) return 'End date is before the start date.';
  return null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toLocalDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses 'YYYY-MM-DD' as a local date; null when malformed. */
export function fromLocalDay(day: string): Date | null {
  if (!DATE_RE.test(day)) return null;
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  // Reject impossible dates like 2026-02-31 (Date rolls them over).
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

export function presetRange(p: DatePreset, now: Date = new Date()): { from: string; to: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = (offset: number) =>
    toLocalDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset));
  switch (p) {
    case 'today': return { from: day(0), to: day(0) };
    case 'yesterday': return { from: day(-1), to: day(-1) };
    case 'last7': return { from: day(-6), to: day(0) };
    case 'last30': return { from: day(-29), to: day(0) };
  }
}

/**
 * Builds the API query fragment ('' or 'from=...&to=...&command=...').
 * Local days become inclusive RFC3339 boundaries: start-of-day for `from`,
 * end-of-day (23:59:59.999) for `to`, in the browser's timezone.
 */
export function toQuery(f: RunFilters): string {
  const params = new URLSearchParams();
  const from = f.from ? fromLocalDay(f.from) : null;
  const to = f.to ? fromLocalDay(f.to) : null;
  if (from) params.set('from', from.toISOString());
  if (to) {
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
    params.set('to', end.toISOString());
  }
  for (const c of f.commands) params.append('command', c);
  for (const status of f.statuses) params.append('status', status);
  if (f.ticket.trim()) params.set('ticket', f.ticket.trim());
  return params.toString();
}

/** Serializes filters for the location hash; '' when empty. */
export function toHashQuery(f: RunFilters): string {
  const params = new URLSearchParams();
  if (f.from) params.set('from', f.from);
  if (f.to) params.set('to', f.to);
  for (const c of f.commands) params.append('command', c);
  for (const status of f.statuses) params.append('status', status);
  if (f.ticket.trim()) params.set('ticket', f.ticket.trim());
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Parses filters back out of a hash query ('?from=...'); lenient on junk. */
export function parseHashQuery(qs: string): RunFilters {
  const params = new URLSearchParams(qs.replace(/^\?/, ''));
  const from = params.get('from');
  const to = params.get('to');
  return {
    from: from && DATE_RE.test(from) ? from : null,
    to: to && DATE_RE.test(to) ? to : null,
    commands: params.getAll('command').filter(Boolean),
    statuses: params.getAll('status').filter(Boolean),
    ticket: params.get('ticket')?.trim() ?? '',
  };
}
