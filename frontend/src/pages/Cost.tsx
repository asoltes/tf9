import { useState, useEffect, useCallback, useMemo } from 'react';
import Shell from '../Shell';
import { costApi } from '../api';
import { useToast } from '../components/ToastProvider';
import { Card, CostBreakdownView, fmtMoney as fmt, relTime } from '../components/CostBreakdownView';
import type {
  CostScan, CostScanDiff, CostScanHistoryItem, InfracostSettings,
} from '../types';
import './Cost.css';

type Tab = 'breakdown' | 'diff' | 'settings';

function signed(currency: string, v: number): string {
  return `${v >= 0 ? '+' : '-'}${currency} ${Math.abs(v).toFixed(2)}`;
}

// A scan older than 24h is flagged so the business doesn't read it as live spend.
function isStale(iso?: string): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() > 24 * 3600 * 1000;
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function CostPage() {
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('breakdown');
  const [settings, setSettings] = useState<InfracostSettings | null>(null);

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
    Promise.all([costApi.settings(), costApi.getScan(), costApi.scanHistory()])
      .then(([s, sc, hist]) => {
        setSettings(s);
        setEnabledByDefault(s.enabledByDefault);
        setCurrency(s.currency || 'USD');
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
    return <CostBreakdownView scan={scan} historyPoints={historyPoints} />;
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

  const TABS: { id: Tab; label: string }[] = [
    { id: 'breakdown', label: 'Breakdown' },
    { id: 'diff', label: 'Diff' },
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
            <div className="page-title">Cost Analysis</div>
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
          ) : tab === 'breakdown' ? renderBreakdown() : renderDiff()}
      </div>
    </Shell>
  );
}
