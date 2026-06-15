import { useMemo } from 'react';
import type { CostScan } from '../types';

// Shared rendering of an Infracost breakdown scan, used both by the live Cost
// Analysis page and by the ReportViewer when opening a saved cost report. Keeping
// it here means there is exactly one breakdown layout.

export function fmtMoney(currency: string, v: number): string {
  return `${currency} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function relTime(iso?: string): string {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (isNaN(s)) return '';
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

type Group = { label: string; monthly: number; resources: number; targets: number };

function rollup(scan: CostScan | null, key: (t: CostScan['targets'][number]) => string, fromResources: boolean): Group[] {
  if (!scan) return [];
  const m = new Map<string, Group>();
  const get = (label: string) => {
    let g = m.get(label);
    if (!g) { g = { label, monthly: 0, resources: 0, targets: 0 }; m.set(label, g); }
    return g;
  };
  for (const t of scan.targets ?? []) {
    if (fromResources) {
      for (const r of t.resources ?? []) {
        const g = get(r.type);
        g.monthly += r.monthlyCost;
        g.resources++;
      }
    } else {
      const g = get(key(t) || 'ungrouped');
      g.monthly += t.totalMonthly;
      g.resources += t.resourceCount;
      g.targets++;
    }
  }
  return [...m.values()].sort((a, b) => b.monthly - a.monthly);
}

export function Card({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'amber' | 'blue' | 'green' | 'red' }) {
  return (
    <div className={`cost-stat${tone ? ' t-' + tone : ''}`}>
      <div className="cost-stat-val">{value}</div>
      <div className="cost-stat-lbl">{label}</div>
      {sub && <div className="cost-stat-sub">{sub}</div>}
    </div>
  );
}

export function Bars({ rows, currency }: { rows: Group[]; currency: string }) {
  const max = Math.max(1, ...rows.map(r => r.monthly));
  if (rows.length === 0) return <div className="cost-empty">No priced resources.</div>;
  return (
    <div className="cost-bars">
      {rows.map(r => (
        <div className="cost-bar-row" key={r.label}>
          <div className="cost-bar-head">
            <span className="cost-bar-name">{r.label}</span>
            <span className="cost-bar-val">{fmtMoney(currency, r.monthly)}<span className="cost-bar-cnt"> · {r.targets || r.resources}</span></span>
          </div>
          <div className="cost-bar-track"><i style={{ width: `${(r.monthly / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export function CostChart({ points, currency }: { points: { runAt: string; value: number }[]; currency: string }) {
  const W = 720, H = 200, padX = 8, padY = 16;
  if (points.length < 2) return <div className="cost-empty">Need at least two data points to chart a trend.</div>;
  const max = Math.max(...points.map(p => p.value), 1);
  const innerW = W - padX * 2, innerH = H - padY * 2;
  const x = (i: number) => padX + (i / (points.length - 1)) * innerW;
  const y = (v: number) => padY + innerH - (v / max) * innerH;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(padY + innerH).toFixed(1)} L${x(0).toFixed(1)},${(padY + innerH).toFixed(1)} Z`;
  return (
    <div className="cost-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Monthly cost over time">
        <defs>
          <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--amber)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--amber)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map(f => (
          <line key={f} x1={padX} x2={W - padX} y1={padY + innerH * f} y2={padY + innerH * f}
            stroke="var(--border)" strokeWidth="1" strokeDasharray={f === 1 ? '' : '3 4'} />
        ))}
        <path d={area} fill="url(#costGrad)" />
        <path d={line} fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r="3" fill="var(--amber)" stroke="var(--surface-1)" strokeWidth="1.5">
            <title>{`${relTime(p.runAt)} — ${fmtMoney(currency, p.value)}/mo`}</title>
          </circle>
        ))}
      </svg>
      <div className="cost-chart-axis"><span>{fmtMoney(currency, max)}</span><span>{fmtMoney(currency, 0)}</span></div>
    </div>
  );
}

// CostBreakdownView renders the full breakdown dashboard for a single scan:
// summary cards, optional trend chart, and the by-repo / by-group / by-service /
// targets rollups. `historyPoints` is optional (only the live page has trend
// history); when absent the trend card is omitted.
export function CostBreakdownView({ scan, historyPoints }: { scan: CostScan; historyPoints?: { runAt: string; value: number }[] }) {
  const cur = scan.currency || 'USD';
  const targets = scan.targets ?? [];
  const byRepo = useMemo(() => rollup(scan, t => t.repo, false), [scan]);
  const byGroup = useMemo(() => rollup(scan, t => t.group, false), [scan]);
  const byService = useMemo(() => rollup(scan, () => '', true), [scan]);
  const scanErrors = useMemo(() => targets.filter(t => t.error), [targets]);

  return (
    <>
      <div className="cost-stats">
        <Card label="Total monthly cost" value={fmtMoney(cur, scan.totalMonthly)} tone="amber" sub={`scanned ${relTime(scan.runAt)}`} />
        <Card label="Projected annual" value={fmtMoney(cur, scan.totalMonthly * 12)} tone="blue" />
        <Card label="Targets" value={String(targets.length)} sub={scanErrors.length ? `${scanErrors.length} with errors` : 'all parsed'} tone={scanErrors.length ? 'red' : 'green'} />
        <Card label="Services" value={String(byService.length)} />
        <Card label="Repositories" value={String(byRepo.length)} />
      </div>

      {historyPoints && (
        <div className="cost-card">
          <div className="cost-card-title">Monthly cost over time</div>
          <CostChart points={historyPoints} currency={cur} />
        </div>
      )}

      <div className="cost-grid">
        <div className="cost-card">
          <div className="cost-card-title">Cost by repository</div>
          <Bars rows={byRepo} currency={cur} />
        </div>
        <div className="cost-card">
          <div className="cost-card-title">Cost by pipeline group</div>
          <Bars rows={byGroup} currency={cur} />
        </div>
      </div>

      <div className="cost-grid">
        <div className="cost-card">
          <div className="cost-card-title">Cost by service</div>
          <Bars rows={byService} currency={cur} />
        </div>
        <div className="cost-card">
          <div className="cost-card-title">Targets</div>
          <div className="cost-table-wrap">
            <table className="cost-tbl">
              <thead><tr><th>Repository</th><th>Target</th><th>Group</th><th className="num">Resources</th><th className="num">Monthly</th></tr></thead>
              <tbody>
                {targets.map(t => (
                  <tr key={t.repo + '/' + t.target}>
                    <td><span className="cost-run-id">{t.repo}</span></td>
                    <td>{t.target}</td>
                    <td style={{ color: 'var(--text-3)' }}>{t.group || '—'}</td>
                    {t.error
                      ? <td colSpan={2} style={{ color: 'var(--red)', fontStyle: 'italic' }} title={t.error}>error</td>
                      : <><td className="num">{t.resourceCount}</td><td className="num">{fmtMoney(t.currency, t.totalMonthly)}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
