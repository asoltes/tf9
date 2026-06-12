import { useState, useEffect, useCallback, useMemo } from 'react';
import Shell from '../Shell';
import { useNav } from '../nav';
import { reportsApi } from '../api';
import { commandCounts, filterByCommand } from '../lib/reportHelpers';
import type { Report } from '../types';
import './Reports.css';

// ── Inline icons (stroke=currentColor), ported from reports-history.js ──────

const ICON_CHECKC = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="8.5 12 11 14.5 15.5 9.5" /></svg>
);
const ICON_X = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></svg>
);
const ICON_GRID = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
);
const ICON_LIST = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
);
const ICON_REPORT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></svg>
);

type ViewMode = 'cards' | 'list';

// ── Mapping real Report → display fields ────────────────────────────────────

function badgeColor(cmd: string): string {
  return cmd === 'destroy' ? 'red' : cmd === 'apply' ? 'green' : cmd === 'plan' ? 'blue' : 'orange';
}

/** Derive a short run identifier from the report filename timestamp. */
function runId(name: string): string {
  // tf9-plan-20260602-153045.html → 20260602-153045 ; tf9-apply-live.html → live
  const m = name.replace(/^tf9-/, '').replace(/\.html$/, '');
  const parts = m.split('-');
  if (parts.length >= 3) return parts.slice(1).join('-');
  return parts.slice(1).join('-') || m;
}

function relTime(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (!iso || isNaN(s)) return '';
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

function CmdBadge({ cmd }: { cmd: string }) {
  return <span className={`badge ${badgeColor(cmd)}`}>{cmd}</span>;
}

function statSpan(v: number, sym: '+' | '~' | '-') {
  const color = sym === '+' ? 'var(--green)' : sym === '~' ? 'var(--amber)' : 'var(--red)';
  const col = v > 0 ? color : 'var(--text-3)';
  return <span style={{ color: col }}>{sym}{v}</span>;
}

function ChangeBar({ add, change, destroy }: { add: number; change: number; destroy: number }) {
  const total = add + change + destroy;
  if (total === 0) {
    return (
      <div className="rh-card-bar">
        <i style={{ width: '100%', background: 'var(--text-3)', opacity: 0.2 }} />
      </div>
    );
  }
  return (
    <div className="rh-card-bar">
      <i className="b-add" style={{ width: `${(add / total) * 100}%` }} />
      <i className="b-chg" style={{ width: `${(change / total) * 100}%` }} />
      <i className="b-del" style={{ width: `${(destroy / total) * 100}%` }} />
    </div>
  );
}

export default function ReportsPage() {
  const { navigate } = useNav();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('cards');
  const [filter, setFilter] = useState<string>('all');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    reportsApi.list()
      .then(res => {
        const sorted = (res?.items || []).slice().sort(
          (a, b) => new Date(b.runAt).getTime() - new Date(a.runAt).getTime()
        );
        setReports(sorted);
        setLoading(false);
      })
      .catch(e => {
        setError(e instanceof Error ? e.message : 'Failed to load reports.');
        setLoading(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c = commandCounts(reports);
    return { all: c.all ?? 0, plan: c.plan ?? 0, apply: c.apply ?? 0, destroy: c.destroy ?? 0 };
  }, [reports]);

  const list = useMemo(() => filterByCommand(reports, filter), [reports, filter]);

  // Cost roll-up across the loaded reports (reports are newest-first). The latest
  // apply reflects deployed cost; the latest plan carries a projected change.
  const cost = useMemo(() => {
    const withCost = reports.filter(r => r.hasCost);
    if (withCost.length === 0) return null;
    const latestApply = withCost.find(r => r.command === 'apply');
    const latestPlan = withCost.find(r => r.command === 'plan');
    const anchor = latestApply ?? withCost[0];
    return {
      count: withCost.length,
      currency: anchor.currency ?? 'USD',
      monthly: anchor.totalMonthly ?? 0,
      anchorCmd: anchor.command,
      annual: (anchor.totalMonthly ?? 0) * 12,
      change: latestPlan ? (latestPlan.diffMonthly ?? 0) : null,
    };
  }, [reports]);

  const open = (name: string) => navigate({ id: 'report', name });

  const FILTERS: { key: string; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'plan', label: 'Plan' },
    { key: 'apply', label: 'Apply' },
    { key: 'destroy', label: 'Destroy' },
  ];

  function renderBody() {
    if (loading && reports.length === 0) {
      return (
        <div className="rh-empty">
          {ICON_REPORT}
          <div className="t">Loading reports…</div>
        </div>
      );
    }
    if (error) {
      return (
        <div className="rh-empty is-error">
          {ICON_X}
          <div className="t">Couldn't load reports</div>
          <div>{error}</div>
          <button className="rh-retry" onClick={load}>Retry</button>
        </div>
      );
    }
    if (list.length === 0) {
      return (
        <div className="rh-empty">
          {ICON_REPORT}
          <div className="t">No reports found</div>
          <div>No reports match the selected filter.</div>
        </div>
      );
    }
    return view === 'cards' ? renderCards() : renderTable();
  }

  function renderCards() {
    return (
      <div className="rh-cards">
        {list.map(r => {
          const status = r.failed > 0 ? 'failed' : 'success';
          const envLabel = `${r.envs} env${r.envs === 1 ? '' : 's'}`;
          return (
            <div
              key={r.name}
              className="rh-card"
              role="button"
              tabIndex={0}
              onClick={() => open(r.name)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(r.name); } }}
            >
              <div className="rh-card-top">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CmdBadge cmd={r.command} />
                  <span className="rh-card-id">{runId(r.name)}</span>
                </div>
                <span className={`rh-card-status ${status}`}>
                  {status === 'success' ? ICON_CHECKC : ICON_X}{status}
                </span>
              </div>
              <ChangeBar add={r.add} change={r.change} destroy={r.destroy} />
              <div className="rh-card-stats">
                {statSpan(r.add, '+')} {statSpan(r.change, '~')} {statSpan(r.destroy, '-')}
                {r.hasCost && (
                  <span style={{ color: 'var(--amber)', marginLeft: 'auto' }}>
                    {r.currency} {(r.totalMonthly ?? 0).toFixed(2)}/mo
                  </span>
                )}
              </div>
              <div className="rh-card-meta">
                <div className="rh-card-targets">
                  {r.envs > 0 && <span className="tc">{envLabel}</span>}
                  {r.failed > 0 && <span className="tm" style={{ color: 'var(--red)' }}>{r.failed} failed</span>}
                </div>
                <span className="rh-card-date">{relTime(r.runAt)}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderTable() {
    return (
      <div className="rh-table-wrap">
        <table className="rh-tbl">
          <thead>
            <tr>
              <th>Run ID</th>
              <th>Command</th>
              <th className="num">Add</th>
              <th className="num">Change</th>
              <th className="num">Destroy</th>
              <th>Distribution</th>
              <th className="num">Envs</th>
              <th className="num">Monthly Cost</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {list.map(r => {
              const status = r.failed > 0 ? 'failed' : 'success';
              const total = r.add + r.change + r.destroy || 1;
              return (
                <tr
                  key={r.name}
                  onClick={() => open(r.name)}
                >
                  <td><span className="run-id">{runId(r.name)}</span></td>
                  <td><CmdBadge cmd={r.command} /></td>
                  <td className="num">{statSpan(r.add, '+')}</td>
                  <td className="num">{statSpan(r.change, '~')}</td>
                  <td className="num">{statSpan(r.destroy, '-')}</td>
                  <td>
                    <span className="dist">
                      <i style={{ width: `${(r.add / total) * 100}%`, background: 'var(--green)' }} />
                      <i style={{ width: `${(r.change / total) * 100}%`, background: 'var(--amber)' }} />
                      <i style={{ width: `${(r.destroy / total) * 100}%`, background: 'var(--red)' }} />
                    </span>
                  </td>
                  <td className="num">{r.envs}</td>
                  <td className="num">
                    {r.hasCost
                      ? <span style={{ color: 'var(--amber)' }}>{r.currency} {(r.totalMonthly ?? 0).toFixed(2)}</span>
                      : <span style={{ color: 'var(--text-3)' }}>—</span>}
                  </td>
                  <td><span className="date">{relTime(r.runAt)}</span></td>
                  <td>
                    <span className={`st ${status}`}>
                      {status === 'success' ? ICON_CHECKC : ICON_X}{status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <Shell>
      <div className="reports-page">
        <div className="rh-head">
          <div>
            <div className="page-title">
              Terraform Reports <span className="counter">({reports.length})</span>
            </div>
            <div className="page-desc">
              Terraform run reports — plan, apply, and destroy output across your repositories.
            </div>
          </div>
        </div>

        {cost && (
          <div className="rh-cost-cards">
            <div className="rh-cost-card amber">
              <div className="rh-cost-val">{cost.currency} {cost.monthly.toFixed(2)}</div>
              <div className="rh-cost-lbl">{cost.anchorCmd === 'apply' ? 'deployed monthly cost' : 'latest monthly cost'}</div>
            </div>
            <div className="rh-cost-card blue">
              <div className="rh-cost-val">{cost.currency} {cost.annual.toFixed(2)}</div>
              <div className="rh-cost-lbl">projected annual cost</div>
            </div>
            <div className={`rh-cost-card ${cost.change == null ? '' : cost.change > 0 ? 'red' : 'green'}`}>
              <div className="rh-cost-val">
                {cost.change == null ? '—' : `${cost.change >= 0 ? '+' : ''}${cost.currency} ${cost.change.toFixed(2)}`}
              </div>
              <div className="rh-cost-lbl">latest plan cost change</div>
            </div>
            <div className="rh-cost-card">
              <div className="rh-cost-val">{cost.count}</div>
              <div className="rh-cost-lbl">cost-tracked reports</div>
            </div>
          </div>
        )}

        <div className="rh-toolbar">
          <div className="rh-filters">
            {FILTERS.map(f => (
              <button
                key={f.key}
                className={`rh-filter${filter === f.key ? ' on' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label} <span className="cnt">{counts[f.key as keyof typeof counts]}</span>
              </button>
            ))}
          </div>
          <span className="rh-spacer" />
          <div className="rh-view-toggle">
            <button className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}>
              {ICON_GRID}Cards
            </button>
            <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
              {ICON_LIST}List
            </button>
          </div>
        </div>

        {renderBody()}
      </div>
    </Shell>
  );
}
