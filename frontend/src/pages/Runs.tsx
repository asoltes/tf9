import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Shell from '../Shell';
import RunSplitPanel from '../components/RunSplitPanel';
import NewRunModal from '../components/NewRunModal';
import DateRangePicker from '../components/DateRangePicker';
import { api } from '../api';
import {
  emptyFilters, isEmptyFilters, parseHashQuery, toHashQuery, toQuery,
  type RunFilters,
} from '../lib/runFilters';
import { commandStyleClass } from '../lib/commandStyle';
import { ticketURL } from '../lib/ticketing';
import type { Run, RunStatus, Paginated, Repo, GitProvider } from '../types';
import './Runs.css';

// ── Inline icons (stroke=currentColor), ported from runs-history.js ─────────
const ICON_REFRESH = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" width="17" height="17"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>
);
const ICON_PLUS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><path d="M12 5v14M5 12h14" /></svg>
);
const ICON_GIT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>
);
const ICON_SEQ = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="5" rx="1" /><rect x="4" y="16" width="16" height="5" rx="1" /><path d="M12 8v4m0 0-2-2m2 2 2-2" /></svg>
);
const ICON_PAR = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="6" height="16" rx="1" /><rect x="15" y="4" width="6" height="16" rx="1" /></svg>
);
const ICON_CHECKC = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="8.5 12 11 14.5 15.5 9.5" /></svg>
);
const ICON_X = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></svg>
);
const ICON_PARTIAL = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 12h8M12 8v8" /></svg>
);
const ICON_STOP = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><rect x="9" y="9" width="6" height="6" rx="1" /></svg>
);
const ICON_BAN = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><line x1="6.3" y1="6.3" x2="17.7" y2="17.7" /></svg>
);

// ── Git-provider marks (filled brand glyphs, fill=currentColor) ─────────────
// Distinct from ICON_GIT (the branch glyph used in the Branch column): the repo
// fallback below is the git logo, not the branch icon.
const ICON_GITHUB = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.2 3.44 9.6 8.21 11.16.6.11.82-.25.82-.56 0-.27-.01-1-.02-1.96-3.34.71-4.04-1.58-4.04-1.58-.55-1.36-1.34-1.73-1.34-1.73-1.09-.73.08-.72.08-.72 1.2.08 1.84 1.21 1.84 1.21 1.07 1.8 2.81 1.28 3.5.98.11-.76.42-1.28.76-1.57-2.67-.3-5.47-1.31-5.47-5.83 0-1.29.47-2.34 1.24-3.17-.13-.3-.54-1.52.12-3.16 0 0 1.01-.32 3.3 1.21a11.6 11.6 0 0 1 6 0c2.29-1.53 3.3-1.21 3.3-1.21.66 1.64.24 2.86.12 3.16.77.83 1.23 1.88 1.23 3.17 0 4.53-2.81 5.53-5.49 5.82.43.37.81 1.1.81 2.22 0 1.6-.01 2.9-.01 3.29 0 .31.22.68.83.56C20.57 21.88 24 17.49 24 12.29 24 5.78 18.63.5 12 .5z" /></svg>
);
const ICON_GITLAB = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.955 13.587l-1.342-4.135-2.664-8.189a.455.455 0 0 0-.867 0L16.418 9.45H7.582L4.919 1.263a.455.455 0 0 0-.867 0L1.388 9.452.044 13.587a.924.924 0 0 0 .331 1.023L12 23.054l11.625-8.444a.92.92 0 0 0 .33-1.023" /></svg>
);
const ICON_GIT_LOGO = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.546 10.93 13.067.452a1.55 1.55 0 0 0-2.188 0L8.708 2.627l2.76 2.76a1.838 1.838 0 0 1 2.327 2.341l2.658 2.66a1.838 1.838 0 0 1 1.9.43 1.85 1.85 0 0 1 0 2.61c-.726.726-1.911.726-2.638 0a1.85 1.85 0 0 1-.4-2.009l-2.477-2.476v6.518c.179.088.348.21.494.357a1.85 1.85 0 0 1 0 2.609c-.726.726-1.911.726-2.638 0a1.85 1.85 0 0 1 0-2.609c.182-.181.388-.318.605-.408V8.835a1.84 1.84 0 0 1-.998-2.421L7.799 3.701.45 11.05a1.55 1.55 0 0 0 0 2.188l10.48 10.477a1.55 1.55 0 0 0 2.187 0l10.43-10.43a1.55 1.55 0 0 0 0-2.355" /></svg>
);

const PROVIDER_ICON: Record<GitProvider, JSX.Element> = {
  github: ICON_GITHUB,
  gitlab: ICON_GITLAB,
  git: ICON_GIT_LOGO,
};

type Dock = 'bottom' | 'side';

const PAGE_SIZE = 25;

function statusLabel(status: RunStatus): string {
  return status === 'partial_success' ? 'Partial Success' : status;
}

function statusIcon(s: RunStatus): React.ReactNode {
  if (s === 'running') return <span className="spin" />;
  if (s === 'success') return ICON_CHECKC;
  if (s === 'partial_success') return ICON_PARTIAL;
  if (s === 'failed') return ICON_X;
  if (s === 'denied') return ICON_BAN;
  return ICON_STOP;
}

function fmtTimestamp(iso: string): { label: string; title: string } {
  if (!iso) return { label: '—', title: '' };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { label: '—', title: '' };
  const now = new Date();
  const title = d.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'medium' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const sameYear = d.getFullYear() === now.getFullYear();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400_000);
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let label: string;
  if (dDay.getTime() === today.getTime()) {
    label = `Today · ${time}`;
  } else if (dDay.getTime() === yesterday.getTime()) {
    label = `Yesterday · ${time}`;
  } else if (sameYear) {
    const mon = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    label = `${mon} · ${time}`;
  } else {
    const mon = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    label = `${mon} · ${time}`;
  }
  return { label, title };
}

function duration(start: string, end?: string): string {
  if (!end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function runTargets(r: Run): string[] {
  if (r.targetDirs && r.targetDirs.length) return r.targetDirs;
  return r.envFilter?.split(',').map(s => s.trim()).filter(Boolean) ?? [];
}

const BASE_COMMANDS = ['plan', 'apply', 'destroy'];
const RUN_STATUSES: RunStatus[] = ['running', 'success', 'partial_success', 'failed', 'denied', 'cancelled'];

/** Multi-select command filter: checkbox dropdown with an "all" state. */
function CommandFilter({
  options, selected, onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (commands: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function toggle(cmd: string) {
    onChange(selected.includes(cmd) ? selected.filter(c => c !== cmd) : [...selected, cmd]);
  }

  const label = selected.length === 0
    ? 'All commands'
    : selected.length === 1 ? `Command: ${selected[0]}` : `Commands: ${selected.length}`;

  return (
    <div className="cmdf" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`cmdf-trigger${selected.length > 0 ? ' has-value' : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {label}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <div
          className="cmdf-pop"
          role="group"
          aria-label="Filter by command"
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
          }}
        >
          <label className="cmdf-opt">
            <input
              type="checkbox"
              checked={selected.length === 0}
              onChange={() => onChange([])}
            />
            All commands
          </label>
          <div className="cmdf-sep" />
          {options.map(cmd => (
            <label key={cmd} className="cmdf-opt">
              <input type="checkbox" checked={selected.includes(cmd)} onChange={() => toggle(cmd)} />
              <span className={`badge command-style ${commandStyleClass(cmd)}`}>{cmd}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** Multi-select status filter matching the command filter interaction. */
function StatusFilter({
  selected, onChange,
}: {
  selected: string[];
  onChange: (statuses: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function toggle(status: string) {
    onChange(selected.includes(status)
      ? selected.filter(item => item !== status)
      : [...selected, status]);
  }

  const label = selected.length === 0
    ? 'All statuses'
    : selected.length === 1 ? `Status: ${statusLabel(selected[0] as RunStatus)}` : `Statuses: ${selected.length}`;

  return (
    <div className="cmdf statusf" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`cmdf-trigger${selected.length > 0 ? ' has-value' : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        {label}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <div
          className="cmdf-pop"
          role="group"
          aria-label="Filter by status"
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              setOpen(false);
              triggerRef.current?.focus();
            }
          }}
        >
          <label className="cmdf-opt">
            <input type="checkbox" checked={selected.length === 0} onChange={() => onChange([])} />
            All statuses
          </label>
          <div className="cmdf-sep" />
          {RUN_STATUSES.map(status => (
            <label key={status} className="cmdf-opt status-option">
              <input type="checkbox" checked={selected.includes(status)} onChange={() => toggle(status)} />
              <span className={`dash-status ${status}`}>{statusLabel(status)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Runs({ openNewRun, filterQuery }: { openNewRun?: boolean; filterQuery?: string }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newRunOpen, setNewRunOpen] = useState(false);
  const [filters, setFilters] = useState<RunFilters>(() => parseHashQuery(filterQuery ?? ''));
  const [ticketingUrl, setTicketingUrl] = useState<string | null>(null);

  // Filter changes reset to page 1 and are mirrored into the hash so refresh
  // and back/forward keep them. replaceState avoids a hashchange re-render.
  const applyFilters = useCallback((f: RunFilters) => {
    setFilters(f);
    setPage(1);
    window.history.replaceState(null, '', `#runs${toHashQuery(f)}`);
  }, []);

  // Deep-link / external hash change (e.g. dashboard tiles).
  useEffect(() => { setFilters(parseHashQuery(filterQuery ?? '')); setPage(1); }, [filterQuery]);

  // Opened via the Overview "New run" card / #runs/new deep-link.
  useEffect(() => { if (openNewRun) setNewRunOpen(true); }, [openNewRun]);
  const [dock, setDock] = useState<Dock>(() => {
    const saved = localStorage.getItem('tf9-dock');
    return saved === 'bottom' || saved === 'side' ? saved : 'side';
  });
  function handleDockChange(d: Dock) {
    setDock(d);
    localStorage.setItem('tf9-dock', d);
  }

  // ── Selected-run detail + live SSE streaming (real backend) ───────────────
  const [run, setRun] = useState<Run | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const sseRef = useRef<EventSource | null>(null);

  // Map repo name → detected git provider, used to badge the Repo column.
  const [providers, setProviders] = useState<Record<string, GitProvider>>({});
  useEffect(() => {
    api.get<Paginated<Repo>>('/api/repos')
      .then(res => {
        const map: Record<string, GitProvider> = {};
        for (const repo of res?.items || []) {
          if (repo.provider) map[repo.name] = repo.provider;
        }
        setProviders(map);
      })
      .catch(() => { /* provider badges are best-effort; fall back to git icon */ });
    api.get<import('../types').WebSettings>('/api/web/settings')
      .then(settings => setTicketingUrl(settings.ticketingUrl))
      .catch(() => setTicketingUrl(null));
  }, []);

  const loadRuns = useCallback(() => {
    setError(null);
    const filterQs = toQuery(filters);
    return api.get<Paginated<Run>>(`/api/runs?page=${page}&limit=${PAGE_SIZE}${filterQs ? `&${filterQs}` : ''}`)
      .then(res => {
        setRuns(res?.items || []);
        setTotal(res?.total || 0);
        setLoading(false);
      })
      .catch(e => {
        setError(e instanceof Error ? e.message : 'Failed to load runs.');
        setLoading(false);
      });
  }, [page, filters]);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // If runs are deleted/expire and the current page falls past the end, step back.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // Auto-refresh the table while any run is active.
  useEffect(() => {
    if (!runs.some(r => r.status === 'running')) return;
    const timer = setInterval(loadRuns, 2500);
    return () => clearInterval(timer);
  }, [runs, loadRuns]);

  // ── SSE wiring (preserved from the prior Cloudscape implementation) ───────
  const stopStream = useCallback(() => {
    sseRef.current?.close();
    sseRef.current = null;
  }, []);

  const loadRunDetail = useCallback((id: string) => {
    api.get<Run>(`/api/runs/${id}`).then(r => {
      if (!r) return;
      setRun(r);
      const initial = r.lines || [];
      setLines(initial);
      if (r.status === 'running') startStream(id, initial.length);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startStream(id: string, fromOffset: number) {
    stopStream();
    const es = new EventSource(`/api/runs/${id}/stream?offset=${fromOffset}`);
    sseRef.current = es;
    es.onmessage = (e) => {
      let line: string;
      try { line = JSON.parse(`"${e.data}"`); } catch { line = e.data; }
      setLines(prev => [...prev, line]);
    };
    es.onerror = () => {
      stopStream();
      setLines(prev => [...prev, '[Connection lost. Reload to reconnect.]']);
      // Resync the run record so a dropped stream doesn't leave the UI stuck on
      // 'running' when the backend has already finished (or been killed).
      loadRunDetail(id);
      loadRuns();
    };
    es.addEventListener('done', () => {
      stopStream();
      loadRunDetail(id);
      loadRuns();
    });
  }

  // Load run detail + (re)start stream when the selection changes.
  useEffect(() => {
    stopStream();
    setRun(null);
    setLines([]);
    if (selectedId) loadRunDetail(selectedId);
    return stopStream;
  }, [selectedId, loadRunDetail, stopStream]);

  const selectRun = useCallback((id: string) => { setSelectedId(id); }, []);

  async function onRerun(r: Run) {
    const res = await api.post<{ id: string }>('/api/runs', r.request);
    setPage(1);
    await loadRuns();
    setSelectedId(res.id);
  }

  async function onApplyPlan(r: Run, parallel: boolean) {
    const res = await api.post<{ id: string }>('/api/runs', {
      command: 'apply',
      repo: r.request.repo,
      planRunId: r.id,
      parallel,
    });
    setPage(1);
    await loadRuns();
    setSelectedId(res.id);
  }

  // Commands offered in the filter: the standard verbs plus anything present
  // in real run data or already selected (so a chip never becomes unremovable).
  const commandOptions = useMemo(() => {
    const set = new Set(BASE_COMMANDS);
    filters.commands.forEach(c => set.add(c));
    runs.forEach(r => { const c = r.command || r.request?.command; if (c) set.add(c); });
    return Array.from(set);
  }, [runs, filters.commands]);

  const filtersActive = !isEmptyFilters(filters);
  const dateChip = filters.from && filters.to
    ? (filters.from === filters.to ? filters.from : `${filters.from} – ${filters.to}`)
    : filters.from ? `from ${filters.from}` : filters.to ? `until ${filters.to}` : null;

  async function onRunCreated(runId: string) {
    setNewRunOpen(false);
    if (window.location.hash === '#runs/new') {
      window.history.replaceState(null, '', '#runs');
    }
    setPage(1);
    await loadRuns();
    setSelectedId(runId);
  }

  return (
    <Shell>
      <div className={`runs-page`}>
        <div className="runs-topbar">
          <div className="runs-head">
            <div>
              <div className="page-title">Run History <span className="counter">{loading ? '' : `(${total})`}</span></div>
              <div className="page-desc">Terraform runs across your repositories. Select a run to stream its output.</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="btn btn-icon" title="Refresh" aria-label="Refresh run history" style={{ border: '1px solid var(--border)', width: 34, height: 34 }} onClick={loadRuns}>{ICON_REFRESH}</button>
              <button className="btn btn-primary" onClick={() => setNewRunOpen(true)}>{ICON_PLUS}New run</button>
            </div>
          </div>

          <div className="runs-filterbar" role="region" aria-label="Run history filters">
            <DateRangePicker
              from={filters.from}
              to={filters.to}
              onChange={(from, to) => applyFilters({ ...filters, from, to })}
            />
            <CommandFilter
              options={commandOptions}
              selected={filters.commands}
              onChange={(commands) => applyFilters({ ...filters, commands })}
            />
            <StatusFilter
              selected={filters.statuses}
              onChange={statuses => applyFilters({ ...filters, statuses })}
            />
            <input
              className="ticket-filter"
              type="search"
              aria-label="Search by ticket number"
              placeholder="Search ticket"
              value={filters.ticket}
              onChange={event => applyFilters({ ...filters, ticket: event.target.value })}
            />
            {filtersActive && (
              <>
                <div className="filter-chips">
                  {dateChip && (
                    <span className="filter-chip">
                      {dateChip}
                      <button
                        type="button" aria-label="Remove date filter"
                        onClick={() => applyFilters({ ...filters, from: null, to: null })}
                      >×</button>
                    </span>
                  )}
                  {filters.commands.map(cmd => (
                    <span key={cmd} className="filter-chip">
                      {cmd}
                      <button
                        type="button" aria-label={`Remove ${cmd} filter`}
                        onClick={() => applyFilters({ ...filters, commands: filters.commands.filter(c => c !== cmd) })}
                      >×</button>
                    </span>
                  ))}
                  {filters.statuses.map(status => (
                    <span key={status} className="filter-chip status">
                      Status: {status}
                      <button
                        type="button" aria-label={`Remove ${status} status filter`}
                        onClick={() => applyFilters({ ...filters, statuses: filters.statuses.filter(item => item !== status) })}
                      >×</button>
                    </span>
                  ))}
                  {filters.ticket && (
                    <span className="filter-chip">
                      Ticket: {filters.ticket}
                      <button
                        type="button" aria-label="Remove ticket filter"
                        onClick={() => applyFilters({ ...filters, ticket: '' })}
                      >×</button>
                    </span>
                  )}
                </div>
                <button type="button" className="btn btn-link btn-sm" onClick={() => applyFilters(emptyFilters())}>
                  Clear all filters
                </button>
                <span className="filter-count" aria-live="polite">
                  {loading ? '' : `${total} matching run${total === 1 ? '' : 's'}`}
                </span>
              </>
            )}
          </div>
        </div>

        <div className={`runs-dock ${dock}`}>
          <div className="runs-content">
            <div className="runs-table-scroll">
              <div className="container flush">
                <table className="runs-tbl">
                  <thead>
                    <tr>
                      <th>Run ID</th><th>Command</th><th>Ticket</th><th>Repo</th><th>Branch</th><th>Targets</th>
                      <th>Mode</th><th>Started</th><th>Duration</th><th>Status</th>
                      <th style={{ width: 140 }}>Changes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {error && (
                      <tr><td colSpan={11} style={{ padding: 16 }}>
                        <span style={{ color: 'var(--red)' }}>{error}</span>
                        <button className="btn btn-normal btn-sm" style={{ marginLeft: 12 }} onClick={loadRuns}>Retry</button>
                      </td></tr>
                    )}
                    {!error && runs.length === 0 && !loading && filtersActive && (
                      <tr><td colSpan={11} style={{ color: 'var(--text-2)', padding: 24, textAlign: 'center' }}>
                        No runs match the current filters.{' '}
                        <button className="btn btn-link btn-sm" onClick={() => applyFilters(emptyFilters())}>Clear all filters</button>
                      </td></tr>
                    )}
                    {!error && runs.length === 0 && !loading && !filtersActive && (
                      <tr><td colSpan={11} style={{ color: 'var(--text-2)', padding: 24, textAlign: 'center' }}>No runs yet. Click “New run” to get started.</td></tr>
                    )}
                    {runs.map(r => {
                      const sel = r.id === selectedId;
                      const command = r.command || r.request?.command || '';
                      const targets = runTargets(r);
                      const chips = targets.slice(0, 2);
                      const parallel = r.request?.parallel;
                      const ts = fmtTimestamp(r.startedAt);
                      return (
                        <tr key={r.id}
                          className={`${sel ? 'selected ' : ''}${r.status === 'running' ? 'is-running' : ''}`}
                          onClick={() => selectRun(r.id)}>
                          <td style={{ width: 118 }}>
                            <span className="run-id">{r.status === 'running' && <span className="live" />}{r.id}</span>
                          </td>
                          <td style={{ width: 96 }}><span className={`run-command command-style ${commandStyleClass(command)}`}>{command}</span></td>
                          <td style={{ width: 118 }}>
                            {r.request?.ticket
                              ? (() => {
                                  const href = ticketURL(ticketingUrl, r.request.ticket);
                                  return href
                                    ? <a className="ticket-cell" href={href} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>{r.request.ticket}</a>
                                    : <span className="ticket-cell">{r.request.ticket}</span>;
                                })()
                              : <span className="mono-cell">—</span>}
                          </td>
                          <td style={{ width: 160 }}>
                            {(() => {
                              const repoName = r.repo || r.request?.repo || '';
                              if (!repoName) return <span className="mono-cell repo">—</span>;
                              const provider: GitProvider = providers[repoName] || 'git';
                              return (
                                <span className="mono-cell repo" title={`${repoName} · ${provider}`}>
                                  <span className={`repo-provider provider-${provider}`}>{PROVIDER_ICON[provider]}</span>
                                  <span className="repo-name">{repoName}</span>
                                </span>
                              );
                            })()}
                          </td>
                          <td style={{ width: 118 }}><span className="branch-cell">{ICON_GIT}{r.gitBranch || '—'}</span></td>
                          <td style={{ width: 170 }}>
                            <span className="tgt-chips">
                              {chips.length === 0 && <span className="tgt-chip">all</span>}
                              {chips.map(c => <span key={c} className="tgt-chip">{c}</span>)}
                              {targets.length > 2 && <span className="tgt-more">+{targets.length - 2} more</span>}
                            </span>
                          </td>
                          <td style={{ width: 120 }}>
                            <span className={`mode-cell ${parallel ? 'par' : ''}`}>{parallel ? ICON_PAR : ICON_SEQ}{parallel ? 'Parallel' : 'Promotion'}</span>
                          </td>
                          <td style={{ width: 160 }} title={ts.title}><span className="ts-cell">{ts.label}</span></td>
                          <td style={{ width: 90 }}><span className="mono-cell">{r.status === 'running' ? '—' : duration(r.startedAt, r.finishedAt)}</span></td>
                          <td style={{ width: 140 }}><span className={`rstatus ${r.status}`}>{statusIcon(r.status)}{statusLabel(r.status)}</span></td>
                          <td style={{ width: 140 }}>
                            {(() => {
                              if (r.status === 'running') return <span style={{ color: 'var(--text-2)' }}>—</span>;
                              const total = (r.add ?? 0) + (r.change ?? 0) + (r.destroy ?? 0);
                              if (total === 0) return <span style={{ color: 'var(--text-2)' }}>—</span>;
                              return (
                                <span className="run-dist">
                                  <span className="dist-bar">
                                    <i style={{ width: `${((r.add ?? 0) / total) * 100}%`, background: 'var(--green)' }} />
                                    <i style={{ width: `${((r.change ?? 0) / total) * 100}%`, background: 'var(--amber)' }} />
                                    <i style={{ width: `${((r.destroy ?? 0) / total) * 100}%`, background: 'var(--red)' }} />
                                  </span>
                                  <span className="run-dist-counts">
                                    {(r.add ?? 0) > 0 && <span className="a">+{r.add}</span>}
                                    {(r.change ?? 0) > 0 && <span className="c">~{r.change}</span>}
                                    {(r.destroy ?? 0) > 0 && <span className="d">-{r.destroy}</span>}
                                  </span>
                                </span>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {total > PAGE_SIZE && (
              <div className="runs-pager">
                <span className="runs-pager-meta">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                </span>
                <div className="runs-pager-btns">
                  <button
                    className="btn btn-normal btn-sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span className="runs-pager-pos">Page {page} of {totalPages}</span>
                  <button
                    className="btn btn-normal btn-sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {selectedId && (
            <RunSplitPanel
              run={run}
              lines={lines}
              dock={dock}
              onDockChange={handleDockChange}
              onStatusChange={() => { loadRuns(); if (selectedId) loadRunDetail(selectedId); }}
              onRerun={onRerun}
              onApplyPlan={onApplyPlan}
              onSelectRun={selectRun}
              ticketingUrl={ticketingUrl}
            />
          )}
        </div>
      </div>

      <NewRunModal
        visible={newRunOpen}
        onDismiss={() => {
          setNewRunOpen(false);
          // Drop the #runs/new flag so a refresh doesn't reopen the modal.
          if (window.location.hash === '#runs/new') {
            window.history.replaceState(null, '', '#runs');
          }
        }}
        onCreated={onRunCreated}
      />
    </Shell>
  );
}
