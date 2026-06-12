import { useState, useEffect, useCallback, useMemo } from 'react';
import Shell from '../Shell';
import { useNav } from '../nav';
import { costApi } from '../api';
import { useToast } from '../components/ToastProvider';
import type {
  CostDetail, CostScan, CostScanDiff, CostScanHistoryItem, CostSummaryItem, InfracostSettings,
} from '../types';
import './Cost.css';

type Tab = 'apply' | 'breakdown' | 'diff' | 'settings';

function relTime(iso?: string): string {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (isNaN(s)) return '';
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

function fmt(currency: string, v: number): string {
  return `${currency} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function signed(currency: string, v: number): string {
  return `${v >= 0 ? '+' : '-'}${currency} ${Math.abs(v).toFixed(2)}`;
}

// A scan older than 24h is flagged so the business doesn't read it as live spend.
function isStale(iso?: string): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() > 24 * 3600 * 1000;
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

// ── Reusable pieces ─────────────────────────────────────────────────────────

function Card({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'amber' | 'blue' | 'green' | 'red' }) {
  return (
    <div className={`cost-stat${tone ? ' t-' + tone : ''}`}>
      <div className="cost-stat-val">{value}</div>
      <div className="cost-stat-lbl">{label}</div>
      {sub && <div className="cost-stat-sub">{sub}</div>}
    </div>
  );
}

function Bars({ rows, currency }: { rows: Group[]; currency: string }) {
  const max = Math.max(1, ...rows.map(r => r.monthly));
  if (rows.length === 0) return <div className="cost-empty">No priced resources.</div>;
  return (
    <div className="cost-bars">
      {rows.map(r => (
        <div className="cost-bar-row" key={r.label}>
          <div className="cost-bar-head">
            <span className="cost-bar-name">{r.label}</span>
            <span className="cost-bar-val">{fmt(currency, r.monthly)}<span className="cost-bar-cnt"> · {r.targets || r.resources}</span></span>
          </div>
          <div className="cost-bar-track"><i style={{ width: `${(r.monthly / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function CostChart({ points, currency }: { points: { runAt: string; value: number }[]; currency: string }) {
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
            <title>{`${relTime(p.runAt)} — ${fmt(currency, p.value)}/mo`}</title>
          </circle>
        ))}
      </svg>
      <div className="cost-chart-axis"><span>{fmt(currency, max)}</span><span>{fmt(currency, 0)}</span></div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function CostPage() {
  const { navigate } = useNav();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('breakdown');
  const [settings, setSettings] = useState<InfracostSettings | null>(null);

  // Apply dashboard (from saved apply reports).
  const [applyItems, setApplyItems] = useState<CostSummaryItem[]>([]);
  const [applyLatest, setApplyLatest] = useState<CostDetail | null>(null);

  // Breakdown / Diff (from on-demand scans).
  const [scan, setScan] = useState<CostScan | null>(null);
  const [diff, setDiff] = useState<CostScanDiff | null>(null);
  const [history, setHistory] = useState<CostScanHistoryItem[]>([]);
  const [scanning, setScanning] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  // Settings form.
  const [token, setToken] = useState('');
  const [enabledByDefault, setEnabledByDefault] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([costApi.settings(), costApi.summary(), costApi.getScan(), costApi.scanHistory()])
      .then(([s, sum, sc, hist]) => {
        setSettings(s);
        setEnabledByDefault(s.enabledByDefault);
        setCurrency(s.currency || 'USD');
        setApplyItems(sum?.items ?? []);
        setApplyLatest(sum?.latest ?? null);
        setScan(sc?.scan ?? null);
        setDiff(sc?.diff ?? null);
        setHistory(hist?.items ?? []);
        setLoading(false);
      })
      .catch(e => { setError(e instanceof Error ? e.message : 'Failed to load cost data.'); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const runScan = useCallback(() => {
    setScanning(true);
    toast('Running Infracost breakdown across all targets…', 'info');
    costApi.runScan()
      .then(res => {
        setScan(res.scan);
        setDiff(res.diff);
        setScanning(false);
        toast('Breakdown scan complete', 'success');
        costApi.scanHistory().then(h => setHistory(h?.items ?? [])).catch(() => {});
      })
      .catch(e => { setScanning(false); toast(e instanceof Error ? e.message : 'Scan failed', 'error'); });
  }, [toast]);

  const exportReport = useCallback((kind: 'html' | 'text' | 'print') => {
    setExportOpen(false);
    if (!scan) { toast('Run a breakdown scan first', 'error'); return; }
    if (kind === 'print') {
      fetch(costApi.reportUrl('html'))
        .then(r => r.text())
        .then(html => {
          const w = window.open('', '_blank');
          if (!w) { toast('Popup blocked — allow popups to print', 'error'); return; }
          w.document.write(html);
          w.document.close();
          setTimeout(() => w.print(), 350);
        })
        .catch(() => toast('Could not open print view', 'error'));
      return;
    }
    window.location.href = costApi.reportUrl(kind);
  }, [scan, toast]);

  const save = useCallback(() => {
    setSaving(true);
    const body: { token?: string; enabledByDefault: boolean; currency: string } = { enabledByDefault, currency: currency.trim() || 'USD' };
    if (token.trim() !== '') body.token = token.trim();
    costApi.saveSettings(body)
      .then(s => { setSettings(s); setToken(''); setSaving(false); toast('Infracost settings saved', 'success'); })
      .catch(e => { setSaving(false); toast(e instanceof Error ? e.message : 'Failed to save settings', 'error'); });
  }, [enabledByDefault, currency, token, toast]);

  const clearToken = useCallback(() => {
    setSaving(true);
    costApi.saveSettings({ token: null, enabledByDefault, currency: currency.trim() || 'USD' })
      .then(s => { setSettings(s); setToken(''); setSaving(false); toast('Infracost token cleared', 'info'); })
      .catch(e => { setSaving(false); toast(e instanceof Error ? e.message : 'Failed to clear token', 'error'); });
  }, [enabledByDefault, currency, toast]);

  const cur = scan?.currency || currency || 'USD';
  const byRepo = useMemo(() => rollup(scan, t => t.repo, false), [scan]);
  const byGroup = useMemo(() => rollup(scan, t => t.group, false), [scan]);
  const byService = useMemo(() => rollup(scan, () => '', true), [scan]);
  const scanErrors = useMemo(() => (scan?.targets ?? []).filter(t => t.error), [scan]);
  const historyPoints = useMemo(
    () => history.slice().reverse().map(h => ({ runAt: h.runAt, value: h.totalMonthly })),
    [history],
  );

  // ── Tab renderers ──────────────────────────────────────────────────────────

  function renderBreakdown() {
    if (!scan) {
      return (
        <div className="cost-card">
          <div className="cost-empty">
            No breakdown yet. Click <b>Run breakdown</b> to scan all configured repository targets with Infracost.
            This parses Terraform HCL directly — no AWS credentials or terraform init needed.
          </div>
        </div>
      );
    }
    const targets = scan.targets ?? [];
    return (
      <>
        <div className="cost-stats">
          <Card label="Total monthly cost" value={fmt(cur, scan.totalMonthly)} tone="amber" sub={`scanned ${relTime(scan.runAt)}`} />
          <Card label="Projected annual" value={fmt(cur, scan.totalMonthly * 12)} tone="blue" />
          <Card label="Targets" value={String(targets.length)} sub={scanErrors.length ? `${scanErrors.length} with errors` : 'all parsed'} tone={scanErrors.length ? 'red' : 'green'} />
          <Card label="Services" value={String(byService.length)} />
          <Card label="Repositories" value={String(byRepo.length)} />
        </div>

        <div className="cost-card">
          <div className="cost-card-title">Monthly cost over time</div>
          <CostChart points={historyPoints} currency={cur} />
        </div>

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
                        : <><td className="num">{t.resourceCount}</td><td className="num">{fmt(t.currency, t.totalMonthly)}</td></>}
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

  function renderDiff() {
    if (!diff || !diff.oldRunAt) {
      return (
        <div className="cost-card">
          <div className="cost-empty">
            No diff yet. The Diff dashboard compares the latest breakdown against the previous one — run <b>Run breakdown</b> at
            least twice to see cost drift across your targets.
          </div>
        </div>
      );
    }
    const allTargets = diff.targets ?? [];
    const allResources = diff.resources ?? [];
    const changedTargets = allTargets.filter(t => t.status !== 'unchanged');
    return (
      <>
        <div className="cost-stats">
          <Card label="Net monthly change" value={signed(diff.currency, diff.change)} tone={diff.change > 0 ? 'red' : diff.change < 0 ? 'green' : undefined} sub={`since ${relTime(diff.oldRunAt)}`} />
          <Card label="Previous total" value={fmt(diff.currency, diff.oldTotal)} />
          <Card label="Current total" value={fmt(diff.currency, diff.newTotal)} tone="amber" />
          <Card label="Targets changed" value={String(changedTargets.length)} />
          <Card label="Resource changes" value={String(allResources.length)} />
        </div>

        <div className="cost-card">
          <div className="cost-card-title">Target changes</div>
          {changedTargets.length === 0 ? <div className="cost-empty">No target cost changes since the previous scan.</div> : (
            <div className="cost-table-wrap">
              <table className="cost-tbl">
                <thead><tr><th>Repository / Target</th><th>Status</th><th className="num">Was</th><th className="num">Now</th><th className="num">Change</th></tr></thead>
                <tbody>
                  {changedTargets.map(t => (
                    <tr key={t.repo + '/' + t.target}>
                      <td><span className="cost-run-id">{t.repo} / {t.target}</span></td>
                      <td><span className={`cost-pill ${t.status}`}>{t.status}</span></td>
                      <td className="num">{fmt(diff.currency, t.oldMonthly)}</td>
                      <td className="num">{fmt(diff.currency, t.newMonthly)}</td>
                      <td className="num" style={{ color: t.change > 0 ? 'var(--red)' : t.change < 0 ? 'var(--green)' : 'var(--text-3)' }}>{signed(diff.currency, t.change)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="cost-card">
          <div className="cost-card-title">Resource changes</div>
          {allResources.length === 0 ? <div className="cost-empty">No resource-level changes.</div> : (
            <div className="cost-table-wrap">
              <table className="cost-tbl">
                <thead><tr><th>Resource</th><th>Target</th><th>Status</th><th className="num">Change</th></tr></thead>
                <tbody>
                  {allResources.map((r, i) => (
                    <tr key={r.repo + r.target + r.name + i}>
                      <td><span className="cost-run-id">{r.name}</span></td>
                      <td style={{ color: 'var(--text-3)' }}>{r.repo}/{r.target}</td>
                      <td><span className={`cost-pill ${r.status}`}>{r.status}</span></td>
                      <td className="num" style={{ color: r.change > 0 ? 'var(--red)' : r.change < 0 ? 'var(--green)' : 'var(--text-3)' }}>{signed(diff.currency, r.change)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    );
  }

  function renderApply() {
    if (!applyLatest) {
      return (
        <div className="cost-card">
          <div className="cost-empty">
            No applied infrastructure costs yet. Run an <b>apply</b> with cost estimation enabled to populate this dashboard.
          </div>
        </div>
      );
    }
    const acur = applyLatest.currency || 'USD';
    const prev = applyItems.length > 1 ? applyItems[1].totalMonthly : null;
    const change = prev != null ? applyLatest.totalMonthly - prev : null;
    const points = applyItems.slice().reverse().map(it => ({ runAt: it.runAt, value: it.totalMonthly }));
    const svc = applyLatest.byService;
    const maxSvc = Math.max(1, ...svc.map(s => s.monthlyCost));
    return (
      <>
        <div className="cost-stats">
          <Card label="Current monthly cost" value={fmt(acur, applyLatest.totalMonthly)} tone="amber" sub={`latest apply · ${relTime(applyLatest.runAt)}`} />
          <Card label="Projected annual" value={fmt(acur, applyLatest.totalMonthly * 12)} tone="blue" />
          <Card label="Priced resources" value={String(applyLatest.resourceCount)} tone="green" sub={`${svc.length} service${svc.length === 1 ? '' : 's'}`} />
          <Card label="Change vs previous" value={change == null ? '—' : signed(acur, change)} tone={change == null ? undefined : change > 0 ? 'red' : 'green'} sub="apply-over-apply" />
          <Card label="Applies tracked" value={String(applyItems.length)} />
        </div>
        <div className="cost-card">
          <div className="cost-card-title">Monthly cost over time (applies)</div>
          <CostChart points={points} currency={acur} />
        </div>
        <div className="cost-grid">
          <div className="cost-card">
            <div className="cost-card-title">Cost by service</div>
            {svc.length === 0 ? <div className="cost-empty">No priced resources.</div> : (
              <div className="cost-bars">
                {svc.map(s => (
                  <div className="cost-bar-row" key={s.type}>
                    <div className="cost-bar-head"><span className="cost-bar-name">{s.type}</span><span className="cost-bar-val">{fmt(acur, s.monthlyCost)}<span className="cost-bar-cnt"> · {s.count}</span></span></div>
                    <div className="cost-bar-track"><i style={{ width: `${(s.monthlyCost / maxSvc) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="cost-card">
            <div className="cost-card-title">Top resources</div>
            <div className="cost-table-wrap">
              <table className="cost-tbl">
                <thead><tr><th>Resource</th><th>Type</th><th className="num">Monthly</th></tr></thead>
                <tbody>
                  {applyLatest.resources.slice(0, 12).map((r, i) => (
                    <tr key={r.name + i}><td><span className="cost-run-id">{r.name}</span></td><td>{r.type}</td><td className="num">{fmt(acur, r.monthlyCost)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="cost-card">
          <div className="cost-card-title">Apply history</div>
          <div className="cost-table-wrap">
            <table className="cost-tbl">
              <thead><tr><th>Run</th><th className="num">Resources</th><th className="num">Monthly cost</th><th>When</th></tr></thead>
              <tbody>
                {applyItems.map(it => (
                  <tr key={it.report} onClick={() => navigate({ id: 'report', name: it.report })}>
                    <td><span className="cost-run-id">{it.report.replace(/^tf9-/, '').replace(/\.html$/, '')}</span></td>
                    <td className="num">{it.resourceCount}</td>
                    <td className="num">{fmt(it.currency, it.totalMonthly)}</td>
                    <td><span className="cost-date">{relTime(it.runAt)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'breakdown', label: 'Breakdown' },
    { id: 'diff', label: 'Diff' },
    { id: 'apply', label: 'Apply' },
    { id: 'settings', label: 'Settings' },
  ];

  function renderSettings() {
    return (
      <div className="cost-card">
        <div className="cost-card-title">Infracost settings</div>
        <div className="cost-field">
          <label className="cost-label">API token</label>
          <div className="cost-token-row">
            <input
              type="password"
              className="cost-input"
              placeholder={settings?.tokenConfigured ? 'Configured — leave blank to keep' : 'Paste your Infracost API token'}
              value={token}
              onChange={e => setToken(e.target.value)}
              autoComplete="off"
            />
            <span className={`cost-token-state ${settings?.tokenConfigured ? 'ok' : 'off'}`}>
              {settings?.tokenConfigured ? 'Configured' : 'Not set'}
            </span>
          </div>
          <div className="cost-hint">
            Stored securely in infracost.yaml (file permissions 0600), never committed to your repo. Get a free token at infracost.io.
          </div>
        </div>

        <div className="cost-field">
          <label className="cost-label">Currency</label>
          <input className="cost-input cost-input-sm" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
        </div>

        <div
          className={`cost-toggle${enabledByDefault ? ' on' : ''}`}
          onClick={() => setEnabledByDefault(v => !v)}
          role="switch" aria-checked={enabledByDefault} tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEnabledByDefault(v => !v); } }}
        >
          <span className={`switch${enabledByDefault ? ' on' : ''}`} />
          <span>
            <span className="cost-toggle-t">Pre-check cost in the New Run dialog</span>
            <span className="cost-toggle-d">Off by default to avoid hitting Infracost API limits — each run stays an explicit opt-in.</span>
          </span>
        </div>

        <div className="cost-actions">
          <button className="cost-btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
          {settings?.tokenConfigured && <button className="cost-btn" onClick={clearToken} disabled={saving}>Clear token</button>}
        </div>
      </div>
    );
  }

  return (
    <Shell>
      <div className="cost-page">
        <div className="cost-head">
          <div>
            <div className="page-title">Cost</div>
            <div className="page-desc">
              AWS infrastructure cost from Infracost — breakdown of existing infrastructure by repository and pipeline group,
              drift over time, and applied-run costs. Export shareable reports for the business.
            </div>
          </div>
          <div className="cost-head-actions">
            {scan && (
              <span className={`cost-fresh${isStale(scan.runAt) ? ' stale' : ''}`} title={new Date(scan.runAt).toLocaleString()}>
                {isStale(scan.runAt) ? '⚠ ' : ''}scanned {relTime(scan.runAt)}
              </span>
            )}
            <button className="cost-btn primary" onClick={runScan} disabled={scanning || !settings?.tokenConfigured}>
              {scanning ? 'Scanning…' : 'Run breakdown'}
            </button>
            <div className="cost-export">
              <button className="cost-btn" onClick={() => setExportOpen(o => !o)} disabled={!scan}>Export ▾</button>
              {exportOpen && (
                <div className="cost-export-menu" onMouseLeave={() => setExportOpen(false)}>
                  <button onClick={() => exportReport('html')}>Download HTML</button>
                  <button onClick={() => exportReport('text')}>Download text</button>
                  <button onClick={() => exportReport('print')}>Print / Save as PDF</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {!settings?.tokenConfigured && tab !== 'settings' && (
          <div className="cost-card">
            <div className="cost-empty">
              No Infracost API token configured. Add one in the <button className="cost-link" onClick={() => setTab('settings')}>Settings</button> tab to enable cost scans.
            </div>
          </div>
        )}

        <div className="cost-tabs">
          {TABS.map(t => (
            <button key={t.id} className={`cost-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {tab === 'settings' ? renderSettings()
          : loading ? (
            <div className="cost-card"><div className="cost-empty">Loading…</div></div>
          ) : error ? (
            <div className="cost-card"><div className="cost-empty is-error">{error}</div></div>
          ) : tab === 'breakdown' ? renderBreakdown() : tab === 'diff' ? renderDiff() : renderApply()}
      </div>
    </Shell>
  );
}
