import { useCallback, useEffect, useMemo, useState } from 'react';
import Shell from '../Shell';
import { useNav } from '../nav';
import { api, awsApi, reportsApi } from '../api';
import { relativeTime } from '../lib/relativeTime';
import { commandStyleClass } from '../lib/commandStyle';
import type { Identity, Paginated, Repo, Report, Run, RunStatus } from '../types';
import './Overview.css';

interface OverviewProps {
  // Retained for App compatibility.
  firstRun: boolean;
}

// The dashboard summarises the most recent window of run history; counts are
// labelled with the window size so they are never mistaken for all-time totals.
const RUN_WINDOW = 100;
const RECENT_RUNS_SHOWN = 6;

interface Fetched<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
}

function useFetch<T>(fetcher: () => Promise<T>): Fetched<T> & { retry: () => void } {
  const [state, setState] = useState<Fetched<T>>({ loading: true, error: null, data: null });
  const load = useCallback(() => {
    setState(s => ({ ...s, loading: true, error: null }));
    fetcher()
      .then(data => setState({ loading: false, error: null, data }))
      .catch(e => setState({ loading: false, error: e instanceof Error ? e.message : 'Request failed.', data: null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);
  return { ...state, retry: load };
}

function duration(start: string, end?: string): string {
  if (!end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0 || isNaN(ms)) return '—';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function exactDateTime(iso: string): { date: string; time: string; full: string } {
  if (!iso) return { date: '—', time: '', full: '' };
  const value = new Date(iso);
  if (isNaN(value.getTime())) return { date: '—', time: '', full: '' };
  return {
    date: value.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
    time: value.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    full: value.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' }),
  };
}

const STATUS_TILES: { status: RunStatus; label: string }[] = [
  { status: 'running', label: 'Running' },
  { status: 'success', label: 'Succeeded' },
  { status: 'partial_success', label: 'Partial Success' },
  { status: 'failed', label: 'Failed' },
  { status: 'denied', label: 'Denied' },
  { status: 'cancelled', label: 'Cancelled' },
];

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="dash-error" role="alert">
      <span>{message}</span>
      <button className="btn btn-normal btn-sm" onClick={onRetry}>Retry</button>
    </div>
  );
}

function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="dash-skel" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => <div key={i} className="dash-skel-line" />)}
    </div>
  );
}

export default function Overview(_props: OverviewProps) {
  const { navigate } = useNav();

  const runsQ = useFetch(() => api.get<Paginated<Run>>(`/api/runs?page=1&limit=${RUN_WINDOW}`));
  const reposQ = useFetch(() => api.get<Paginated<Repo>>('/api/repos'));
  // Pull the full set so the Recent reports card can show every report; the
  // server orders them by filename (command, then time), so we re-sort by run
  // time below to get a true latest-first list.
  const reportsQ = useFetch(() => reportsApi.list(1, 500));
  const identityQ = useFetch<Identity>(() => awsApi.identity());

  const runs = runsQ.data?.items ?? [];
  const repos = reposQ.data?.items ?? [];
  // Newest first by run time; reports without a parseable time (e.g. live runs)
  // are treated as most recent so they surface at the top.
  const reports = useMemo(() => {
    const items = reportsQ.data?.items ?? [];
    const ts = (r: Report) => { const t = new Date(r.runAt).getTime(); return isNaN(t) ? Infinity : t; };
    return items.slice().sort((a, b) => ts(b) - ts(a));
  }, [reportsQ.data]);

  const counts = STATUS_TILES.map(t => ({
    ...t,
    count: runs.filter(r => r.status === t.status).length,
  }));

  const attention: { key: string; node: React.ReactNode }[] = [];
  if (!identityQ.loading && (identityQ.error || !identityQ.data?.arn)) {
    attention.push({
      key: 'aws',
      node: (
        <>
          <span className="dot" style={{ background: 'var(--amber)' }} />
          <span>AWS session unavailable — sign in before starting apply runs.</span>
        </>
      ),
    });
  }
  if (!reposQ.loading && !reposQ.error && repos.length === 0) {
    attention.push({
      key: 'repos',
      node: (
        <>
          <span className="dot" style={{ background: 'var(--blue)' }} />
          <span>
            No repositories configured yet.{' '}
            <a href="#repos" onClick={e => { e.preventDefault(); navigate({ id: 'repos' }); }}>Add a repository</a>
            {' '}to start running Terraform.
          </span>
        </>
      ),
    });
  }
  for (const r of runs.filter(r => r.status === 'failed' || r.status === 'partial_success' || r.status === 'denied').slice(0, 3)) {
    attention.push({
      key: r.id,
      node: (
        <>
          <span className="dot" style={{ background: r.status === 'partial_success' || r.status === 'denied' ? 'var(--amber)' : 'var(--red)' }} />
          <span>
            Run <a href="#runs" onClick={e => { e.preventDefault(); navigate({ id: 'runs' }); }} className="mono">{r.id}</a>
            {' '}({r.command || r.request?.command}{r.repo ? ` · ${r.repo}` : ''}) {r.status === 'partial_success' ? 'partially succeeded' : r.status}{' '}
            {r.startedAt ? relativeTime(r.startedAt) : ''}.
          </span>
        </>
      ),
    });
  }

  const recent = runs.slice(0, RECENT_RUNS_SHOWN);
  const analysis = useMemo(() => {
    const promotion = runs.filter(run => !run.request?.parallel).length;
    const parallel = runs.length - promotion;
    const completed = runs.filter(run => run.finishedAt);
    const success = runs.filter(run => run.status === 'success').length;
    const totalDuration = completed.reduce((sum, run) => (
      sum + Math.max(0, new Date(run.finishedAt!).getTime() - new Date(run.startedAt).getTime())
    ), 0);
    return {
      promotion,
      parallel,
      successRate: completed.length ? Math.round((success / completed.length) * 100) : 0,
      averageDuration: completed.length ? Math.round(totalDuration / completed.length / 1000) : 0,
      resourceChanges: runs.reduce((sum, run) => sum + (run.add ?? 0) + (run.change ?? 0) + (run.destroy ?? 0), 0),
    };
  }, [runs]);

  return (
    <Shell>
      <div className="overview-page">
        <div className="page-head">
          <div>
            <div className="page-title">Dashboard</div>
            <div className="page-desc">
              Operational summary for tf9 — Terraform runs across your ordered repository targets.
            </div>
          </div>
          <div className="dash-actions">
            <button className="btn btn-normal" onClick={() => navigate({ id: 'workspace' })}>
              Open Repository Workspace
            </button>
            <button className="btn btn-primary" onClick={() => navigate({ id: 'runs', newRun: true })}>
              Start Terraform Run
            </button>
          </div>
        </div>

        {/* Status tiles — honest scope: counts cover the latest history window. */}
        <section aria-label="Run status summary">
          {runsQ.error ? (
            <SectionError message={`Run history unavailable: ${runsQ.error}`} onRetry={runsQ.retry} />
          ) : (
            <div className="dash-tiles">
              {counts.map(t => (
                <a
                  key={t.status}
                  className={`dash-tile st-${t.status}`}
                  href={`#runs?status=${t.status}`}
                  onClick={e => { e.preventDefault(); navigate({ id: 'runs', filterQuery: `?status=${t.status}` }); }}
                  aria-label={`${t.label}: ${runsQ.loading ? 'loading' : t.count} of the last ${runs.length} runs`}
                >
                  <span className="dash-tile-n">{runsQ.loading ? '…' : t.count}</span>
                  <span className="dash-tile-l">{t.label}</span>
                </a>
              ))}
              <div className="dash-tiles-note">
                {runsQ.loading ? 'Loading run history…' : runs.length === 0 ? 'No runs recorded yet.' : `Last ${runs.length} runs`}
              </div>
            </div>
          )}
        </section>

        {attention.length > 0 && (
          <section className="container dash-attn" aria-label="Needs attention">
            <div className="c-head noborder"><div className="c-title">Needs attention</div></div>
            <div className="c-body tight">
              <ul className="dash-attn-list">
                {attention.map(a => <li key={a.key}>{a.node}</li>)}
              </ul>
            </div>
          </section>
        )}

        <div className="dash-grid">
          <section className="container flush dash-recent" aria-label="Recent runs">
            <div className="c-head">
              <div className="c-title">Recent runs</div>
              <a href="#runs" onClick={e => { e.preventDefault(); navigate({ id: 'runs' }); }}>View all</a>
            </div>
            {runsQ.loading && <div className="c-body"><Skeleton lines={4} /></div>}
            {!runsQ.loading && runsQ.error && (
              <div className="c-body"><SectionError message={runsQ.error} onRetry={runsQ.retry} /></div>
            )}
            {!runsQ.loading && !runsQ.error && recent.length === 0 && (
              <div className="c-body dash-empty">
                No runs yet.{' '}
                <button className="btn btn-link btn-sm" onClick={() => navigate({ id: 'runs', newRun: true })}>
                  Start your first Terraform run
                </button>
              </div>
            )}
            {!runsQ.loading && !runsQ.error && recent.length > 0 && (
              <table className="tbl dash-tbl">
                <thead>
                  <tr><th>Command</th><th>Repository</th><th>Status</th><th>Date and time</th><th>Duration</th></tr>
                </thead>
                <tbody>
                  {recent.map(r => {
                    const started = exactDateTime(r.startedAt);
                    return (
                    <tr key={r.id} className="selectable" onClick={() => navigate({ id: 'runs' })}>
                      <td><span className={`badge command-style ${commandStyleClass(r.command || r.request?.command || '')}`}>{r.command || r.request?.command || '—'}</span></td>
                      <td><span className="mono dash-repo" title={r.repo || ''}>{r.repo || '—'}</span></td>
                      <td><span className={`dash-status ${r.status}`}>{r.status === 'partial_success' ? 'Partial Success' : r.status}</span></td>
                      <td title={started.full}><span className="dash-run-date">{started.date}<small>{started.time}</small></span></td>
                      <td>{r.status === 'running' ? 'in progress' : duration(r.startedAt, r.finishedAt)}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          <div className="dash-side">
            <section className="container dash-card" aria-label="Execution mode analysis">
              <div className="c-head noborder"><div className="c-title">Execution modes</div></div>
              <div className="c-body tight dash-mode-body">
                <div className="dash-mode-chart" aria-label={`${analysis.promotion} promotion runs and ${analysis.parallel} parallel runs`}>
                  <div className="dash-mode-bar promotion" style={{ flexGrow: analysis.promotion || 0 }} />
                  <div className="dash-mode-bar parallel" style={{ flexGrow: analysis.parallel || 0 }} />
                  {runs.length === 0 && <div className="dash-mode-bar empty" />}
                </div>
                <div className="dash-mode-legend">
                  <span><i className="promotion" />Promotion <strong>{analysis.promotion}</strong></span>
                  <span><i className="parallel" />Parallel <strong>{analysis.parallel}</strong></span>
                </div>
                <div className="dash-analysis-grid">
                  <div><strong>{analysis.successRate}%</strong><span>Success rate</span></div>
                  <div><strong>{analysis.averageDuration}s</strong><span>Avg. duration</span></div>
                  <div><strong>{analysis.resourceChanges}</strong><span>Resource changes</span></div>
                </div>
              </div>
            </section>

            <section className="container dash-card" aria-label="Resources">
              <div className="c-head noborder"><div className="c-title">Resources</div></div>
              <div className="c-body tight">
                <ul className="dash-kv">
                  <li>
                    <span>Repositories</span>
                    {reposQ.loading ? <span>…</span> : reposQ.error
                      ? <button className="btn btn-link btn-sm" onClick={reposQ.retry}>Retry</button>
                      : <a href="#repos" onClick={e => { e.preventDefault(); navigate({ id: 'repos' }); }}>{repos.length}</a>}
                  </li>
                  <li>
                    <span>Terraform reports</span>
                    {reportsQ.loading ? <span>…</span> : reportsQ.error
                      ? <button className="btn btn-link btn-sm" onClick={reportsQ.retry}>Retry</button>
                      : <a href="#reports" onClick={e => { e.preventDefault(); navigate({ id: 'reports' }); }}>{reportsQ.data?.total ?? reports.length}</a>}
                  </li>
                  <li>
                    <span>AWS session</span>
                    {identityQ.loading ? <span>…</span> : identityQ.data?.account
                      ? <span className="mono">{identityQ.data.account}</span>
                      : <span className="dash-muted">not signed in</span>}
                  </li>
                  <li>
                    <span>Cost Analysis</span>
                    <a href="#cost" onClick={e => { e.preventDefault(); navigate({ id: 'cost' }); }}>Open</a>
                  </li>
                </ul>
              </div>
            </section>

            <section className="container dash-card" aria-label="Recent reports">
              <div className="c-head">
                <div className="c-title">Recent reports</div>
                <a href="#reports" onClick={e => { e.preventDefault(); navigate({ id: 'reports' }); }}>View all</a>
              </div>
              <div className="c-body tight">
                {reportsQ.loading && <div style={{ padding: '4px 20px 14px' }}><Skeleton lines={2} /></div>}
                {!reportsQ.loading && reportsQ.error && (
                  <div style={{ padding: '4px 20px 14px' }}><SectionError message={reportsQ.error} onRetry={reportsQ.retry} /></div>
                )}
                {!reportsQ.loading && !reportsQ.error && reports.length === 0 && (
                  <div className="dash-empty" style={{ padding: '4px 20px 16px' }}>No reports yet — they are written after each run.</div>
                )}
                {!reportsQ.loading && !reportsQ.error && reports.length > 0 && (
                  <ul className="dash-reports scroll">
                    {reports.map((rep: Report) => (
                      <li key={rep.name}>
                        <a
                          href={`#report/${rep.name}`}
                          onClick={e => { e.preventDefault(); navigate({ id: 'report', name: rep.name }); }}
                        >
                          <span className={`badge command-style ${commandStyleClass(rep.command)}`}>{rep.command}</span>
                          <span className="dash-report-name" title={rep.name}>{rep.name}</span>
                          <span className="dash-muted">{rep.runAt ? relativeTime(rep.runAt) : ''}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </Shell>
  );
}
