import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import Shell from '../Shell';
import { useNav } from '../nav';
import { useToast } from '../components/ToastProvider';
import { reportsApi } from '../api';
import { parseResourceChanges, rctBadgeLabel, type ResourceChange } from '../lib/planChanges';
import type { ReportData, ReportEnvResult } from '../types';
import './ReportViewer.css';

// ── Inline icons (stroke=currentColor), ported from report.js ───────────────

const I = {
  cube: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>,
  print: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>,
  back: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>,
  search: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>,
  x: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>,
  expand: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 13 12 18 17 13" /><polyline points="7 6 12 11 17 6" /></svg>,
  collapse: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 11 12 6 7 11" /><polyline points="17 18 12 13 7 18" /></svg>,
  wrap: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><path d="M3 12h15a3 3 0 1 1 0 6h-4" /><polyline points="16 16 14 18 16 20" /><line x1="3" y1="18" x2="10" y2="18" /></svg>,
  chevron: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>,
  copy: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>,
  download: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12l4-4m-4 4l-4-4" /><path d="M4 21h16" /></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>,
  tilde: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14c0-2.2 1.3-4 3.2-4 2.8 0 3.6 4 6.4 4 1.9 0 3.2-1.8 3.2-4" /></svg>,
  minus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /></svg>,
  layers: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>,
  repo: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>,
  ok: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" /><polyline points="8 12 11 15 16 9" /></svg>,
  warn: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  fire: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2s4 4 4 8a4 4 0 0 1-8 0c0-1 .5-2 .5-2S6 10 6 14a6 6 0 0 0 12 0c0-5-6-12-6-12z" /></svg>,
  nomatch: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /><path d="M8 11h6" /></svg>,
};

// ── ANSI terminal rendering (raw text, real ANSI honored) ───────────────────
const ANSI_RE = /\x1b\[([0-9;]*)m/g;
function hasAnsi(s: string): boolean { return s.indexOf('\x1b[') !== -1; }
function stripAnsi(s: string): string { return s.replace(ANSI_RE, ''); }

interface AnsiState { bold: boolean; dim: boolean; color: number | null; }
function applyCodes(st: AnsiState, codes: string) {
  codes.split(';').forEach(c => {
    const n = parseInt(c || '0', 10);
    if (n === 0) { st.bold = false; st.dim = false; st.color = null; }
    else if (n === 1) st.bold = true;
    else if (n === 2) st.dim = true;
    else if (n === 22) { st.bold = false; st.dim = false; }
    else if (n === 39) st.color = null;
    else if ((n >= 30 && n <= 37) || (n >= 90 && n <= 97)) st.color = n;
  });
}
function styleFor(st: AnsiState): React.CSSProperties | undefined {
  const s: React.CSSProperties = {};
  let any = false;
  if (st.bold) { s.fontWeight = 600; any = true; }
  if (st.dim) { s.opacity = 0.6; any = true; }
  if (st.color) { s.color = `var(--rv-a${st.color})`; any = true; }
  return any ? s : undefined;
}

/** Render a piece of text with the active query highlighted. */
function highlight(text: string, q: string, keyBase: string): ReactNode {
  if (!q) return text;
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const out: ReactNode[] = [];
  let i = 0, idx: number, k = 0;
  while ((idx = lower.indexOf(ql, i)) !== -1) {
    if (idx > i) out.push(text.slice(i, idx));
    out.push(<span className="hl" key={`${keyBase}-h${k++}`}>{text.slice(idx, idx + q.length)}</span>);
    i = idx + q.length;
  }
  if (i < text.length) out.push(text.slice(i));
  return out;
}

function renderAnsiLine(text: string, q: string, keyBase: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0, m: RegExpExecArray | null, seg = 0;
  const st: AnsiState = { bold: false, dim: false, color: null };
  ANSI_RE.lastIndex = 0;
  while ((m = ANSI_RE.exec(text)) !== null) {
    const piece = text.slice(last, m.index);
    if (piece) {
      const style = styleFor(st);
      const inner = highlight(piece, q, `${keyBase}-${seg}`);
      out.push(style ? <span style={style} key={`${keyBase}-s${seg++}`}>{inner}</span> : <span key={`${keyBase}-s${seg++}`}>{inner}</span>);
    }
    last = ANSI_RE.lastIndex;
    applyCodes(st, m[1]);
  }
  const tail = text.slice(last);
  if (tail) {
    const style = styleFor(st);
    const inner = highlight(tail, q, `${keyBase}-${seg}`);
    out.push(style ? <span style={style} key={`${keyBase}-s${seg++}`}>{inner}</span> : <span key={`${keyBase}-s${seg++}`}>{inner}</span>);
  }
  return out;
}

// ── status / helpers ────────────────────────────────────────────────────────
interface StatusInfo { cls: string; label: string; dot: string; }
function statusOf(r: ReportEnvResult): StatusInfo {
  if (r.failed) return { cls: 'sb-failed', label: 'Failed', dot: 'var(--rv-red)' };
  if (r.noChanges || (r.add === 0 && r.change === 0 && r.destroy === 0)) return { cls: 'sb-none', label: 'No changes', dot: 'var(--rv-faint)' };
  if (r.destroy > 0) return { cls: 'sb-destroy', label: 'Has destroys', dot: 'var(--rv-red)' };
  return { cls: 'sb-changes', label: 'Changes', dot: 'var(--rv-green)' };
}

function fmtTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface Totals { add: number; change: number; destroy: number; failed: number; noChange: number; envs: number; }
function computeTotals(results: ReportEnvResult[]): Totals {
  let add = 0, change = 0, destroy = 0, failed = 0, noChange = 0;
  results.forEach(r => {
    add += r.add; change += r.change; destroy += r.destroy;
    if (r.failed) failed++;
    if (r.noChanges || (r.add === 0 && r.change === 0 && r.destroy === 0)) noChange++;
  });
  return { add, change, destroy, failed, noChange, envs: results.length };
}

function shouldAutoOpen(r: ReportEnvResult): boolean {
  return r.failed || r.add > 0 || r.change > 0 || r.destroy > 0;
}

// ── resource change table (report context) ───────────────────────────────────
type RvFilter = 'all' | 'changes' | 'errors' | 'plan';

function RvResourceTable({ changes, query, wrap }: { changes: ResourceChange[]; query: string; wrap: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const term = query.trim().toLowerCase();
  const filtered = term ? changes.filter(c => c.resource.toLowerCase().includes(term)) : changes;
  if (filtered.length === 0) {
    return (
      <div className="rv-rct-empty">
        {changes.length === 0 ? 'No resource changes detected.' : 'No matching resources.'}
      </div>
    );
  }
  return (
    <div className="rv-rct">
      <table>
        <thead><tr><th>Action</th><th>Resource</th><th /></tr></thead>
        <tbody>
          {filtered.flatMap((c, i) => {
            const key = `${c.action}:${c.resource}`;
            const isOpen = expanded === key;
            const rows: ReactNode[] = [
              <tr
                key={`r${i}`}
                className={`rv-rct-row${isOpen ? ' open' : ''}`}
                onClick={() => setExpanded(isOpen ? null : key)}
              >
                <td><span className={`rv-rct-badge ${c.action}`}>{rctBadgeLabel(c.action)}</span></td>
                <td className="rv-rct-res">{c.resource}</td>
                <td className="rv-rct-chev">{I.chevron}</td>
              </tr>,
            ];
            if (isOpen) {
              rows.push(
                <tr key={`e${i}`}>
                  <td colSpan={3} className="rv-rct-block">
                    <div className={`rv-rct-term${wrap ? ' wrap-on' : ''}`}>
                      <div className="term-inner">
                        {c.blockLines.map((line, n) => (
                          <div className="ln" key={n}>
                            <span className="ln-gutter">{n + 1}</span>
                            <span className="ln-code">
                              {hasAnsi(line) ? renderAnsiLine(line, query, `rct${i}-l${n}`) : highlight(line, query, `rct${i}-l${n}`)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </td>
                </tr>,
              );
            }
            return rows;
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── env block ───────────────────────────────────────────────────────────────
function EnvBlock({ result, command, open, hidden, query, wrap, onToggle, onScrollRef }: {
  result: ReportEnvResult; command: string; open: boolean; hidden: boolean;
  query: string; wrap: boolean; onToggle: () => void;
  onScrollRef: (el: HTMLDivElement | null) => void;
}) {
  const toast = useToast();
  const s = statusOf(result);
  const [filter, setFilter] = useState<RvFilter>('all');
  const lines = useMemo(() => (result.output || '').split('\n'), [result.output]);

  const resourceChanges = useMemo(
    () => filter === 'changes' ? parseResourceChanges(lines) : null,
    [lines, filter],
  );

  const filteredLines = useMemo(() => {
    if (filter === 'all' || filter === 'changes') return lines;
    return lines.filter(line => {
      const t = stripAnsi(line).trimStart();
      if (filter === 'errors') return /^Error:|^\[FAILED\]/i.test(t) || /\bError\b/i.test(t);
      if (filter === 'plan')   return /^Plan:|^Apply complete|^No changes|^Destroy complete/.test(t);
      return true;
    });
  }, [lines, filter]);

  const plainText = useCallback(() => lines.map(l => stripAnsi(l)).join('\n'), [lines]);

  const onCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const text = plainText();
    const done = () => toast('Output copied', 'success');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => toast('Could not copy output', 'error'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
  }, [plainText, toast]);

  const onDownload = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const safe = (str: string) => (str || 'output').replace(/[^a-z0-9._-]+/gi, '-');
    const filename = `${safe(command)}-${safe(result.env)}.txt`;
    const blob = new Blob([plainText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Output downloaded', 'success');
  }, [plainText, command, result.env, toast]);

  const nums = result.failed
    ? <span className="env-nums"><span className="z">failed</span></span>
    : (
      <span className="env-nums">
        <span className={result.add ? 'ea' : 'z'}>+{result.add}</span>
        <span className={result.change ? 'ec' : 'z'}>~{result.change}</span>
        <span className={result.destroy ? 'ed' : 'z'}>-{result.destroy}</span>
      </span>
    );

  return (
    <div
      ref={onScrollRef}
      className={`env-block${open ? ' open' : ''}${hidden ? ' hidden' : ''}`}
    >
      <div className="env-hdr" onClick={onToggle}>
        <span className="env-dot-lg" style={{ background: s.dot }} />
        <div className="env-hdr-left">
          <span className="env-nm">{result.env}</span>
          {result.profile && <span className="env-pr">{result.profile}</span>}
          <span className="env-meta" />
          {nums}
        </div>
        <span className={`sb ${s.cls}`}><span className="d" />{s.label}</span>
        <span className="chevron">{I.chevron}</span>
      </div>
      <div className="env-body">
        <div className="term-bar">
          <span className="term-dots"><i /><i /><i /></span>
          <span className="term-cmd">$ terraform {command} &nbsp;&middot;&nbsp; {result.env}</span>
          <span className="rv-fps">
            {(['all', 'changes', 'errors', 'plan'] as RvFilter[]).map(f => (
              <button
                key={f}
                className={`rv-fp${filter === f ? ' active' : ''}`}
                onClick={e => { e.stopPropagation(); setFilter(f); }}
              >
                {f === 'all' ? 'All' : f === 'changes' ? 'Changes' : f === 'errors' ? 'Errors' : 'Summary'}
              </button>
            ))}
          </span>
          <span className="term-bar-spacer" />
          <button className="term-copy" onClick={onCopy}>{I.copy}Copy output</button>
          <button className="term-copy" onClick={onDownload}>{I.download}Download</button>
        </div>
        {filter === 'changes' ? (
          <RvResourceTable changes={resourceChanges!} query={query} wrap={wrap} />
        ) : (
          <div className={`term${wrap ? ' wrap-on' : ''}`}>
            <div className="term-inner">
              {filteredLines.length === 0 || (filteredLines.length === 1 && filteredLines[0] === '')
                ? <div className="rv-filter-empty">No matching lines.</div>
                : filteredLines.map((line, n) => (
                    <div className="ln" key={n}>
                      <span className="ln-gutter">{n + 1}</span>
                      <span className="ln-code">
                        {hasAnsi(line) ? renderAnsiLine(line, query, `l${n}`) : highlight(line, query, `l${n}`)}
                      </span>
                    </div>
                  ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReportViewer({ name }: { name: string; mode?: 'light' | 'dark' | 'dim' }) {
  const { navigate } = useNav();
  const toast = useToast();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openState, setOpenState] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [wrap, setWrap] = useState(false);
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    reportsApi.data(name)
      .then(d => {
        setData(d);
        const initial: Record<string, boolean> = {};
        for (const r of d.results ?? []) initial[r.env] = shouldAutoOpen(r);
        setOpenState(initial);
        setLoading(false);
      })
      .catch(e => {
        setError(e instanceof Error ? e.message : 'Failed to load report data.');
        setLoading(false);
      });
  }, [name]);

  useEffect(() => { load(); }, [load]);

  const command = data?.command ?? 'plan';
  const results = useMemo(() => data?.results ?? [], [data]);
  const totals = useMemo(() => computeTotals(results), [results]);

  // search: which blocks match + match count
  const search = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = new Set<string>();
    let matches = 0;
    if (!q) return { q, matched, matches, hasQuery: false };
    for (const r of results) {
      const hay = (r.env + '\n' + (r.output || '')).toLowerCase();
      let m = 0, idx = -1;
      while ((idx = hay.indexOf(q, idx + 1)) !== -1) m++;
      if (m > 0) { matched.add(r.env); matches += m; }
    }
    return { q, matched, matches, hasQuery: true };
  }, [query, results]);

  const shownCount = search.hasQuery ? search.matched.size : results.length;

  const allOpen = useMemo(() => {
    const visible = results.filter(r => !search.hasQuery || search.matched.has(r.env));
    return visible.length > 0 && visible.every(r => openState[r.env]);
  }, [results, search, openState]);

  const toggleAll = useCallback(() => {
    const next = !allOpen;
    setOpenState(prev => {
      const out = { ...prev };
      for (const r of results) {
        if (!search.hasQuery || search.matched.has(r.env)) out[r.env] = next;
      }
      return out;
    });
  }, [allOpen, results, search]);

  // keyboard: "/" or Cmd/Ctrl+F focuses search; Esc clears
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const inp = searchRef.current;
      if (!inp) return;
      if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'f')) {
        if (document.activeElement !== inp) { e.preventDefault(); inp.focus(); inp.select(); }
      }
      if (e.key === 'Escape' && document.activeElement === inp) { setQuery(''); inp.blur(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // verdict
  function verdict(): { kind: string; ico: ReactNode; h: ReactNode; p: ReactNode } {
    const t = totals;
    if (t.failed > 0) {
      return { kind: 'is-danger', ico: I.warn, h: `${t.failed} of ${t.envs} environment${t.envs === 1 ? '' : 's'} failed`, p: 'Review the failed environments below before proceeding.' };
    }
    if (command === 'destroy') {
      return { kind: 'is-danger', ico: I.fire, h: <>Destroyed <b>{t.destroy}</b> resource{t.destroy === 1 ? '' : 's'} across <b>{t.envs}</b> environment{t.envs === 1 ? '' : 's'}</>, p: 'All targeted infrastructure has been torn down.' };
    }
    if (command === 'apply') {
      return { kind: 'is-ok', ico: I.ok, h: <>Apply complete across <b>{t.envs}</b> environment{t.envs === 1 ? '' : 's'}</>, p: <><b>{t.add}</b> added, <b>{t.change}</b> changed, <b>{t.destroy}</b> destroyed.</> };
    }
    if (t.destroy > 0) {
      return { kind: 'is-warn', ico: I.warn, h: <>Plan includes <b>{t.destroy}</b> destroy{t.destroy === 1 ? '' : 's'}</>, p: 'Review destroyed resources carefully before applying.' };
    }
    if (t.add + t.change + t.destroy === 0) {
      return { kind: 'is-ok', ico: I.ok, h: 'No changes — infrastructure matches configuration', p: <>All <b>{t.envs}</b> environment{t.envs === 1 ? '' : 's'} are up to date.</> };
    }
    return { kind: 'is-ok', ico: I.ok, h: <>Ready to apply — <b>{t.add + t.change}</b> change{t.add + t.change === 1 ? '' : 's'} planned</>, p: <><b>{t.add}</b> to add, <b>{t.change}</b> to change across <b>{t.envs}</b> environment{t.envs === 1 ? '' : 's'}.</> };
  }

  const v = data ? verdict() : null;
  const total = totals.add + totals.change + totals.destroy || 1;

  function jumpTo(env: string) {
    setOpenState(prev => ({ ...prev, [env]: true }));
    requestAnimationFrame(() => {
      blockRefs.current[env]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  const meta: ReactNode[] = [];
  if (data?.repoLabel) meta.push(<span className="chip" key="repo">{I.repo}<b>{data.repoLabel}</b></span>);
  meta.push(<span className="chip" key="hash">#{name}</span>);
  if (data?.runAt) meta.push(<span className="chip" key="time">{fmtTime(data.runAt)}</span>);

  return (
    <Shell>
      <div className="report-viewer" data-cmd={command}>
        <header className="rv-hdr">
          <div className="hdr-inner">
            <div className="hdr-left">
              <div className="mark">{I.cube}</div>
              <div className="hdr-titles">
                <div className="hdr-title">
                  Terraform {command.charAt(0).toUpperCase() + command.slice(1)}
                  <span className="pill"><span className="dot" />{command}</span>
                </div>
                <div className="hdr-sub">{meta}</div>
              </div>
            </div>
            <div className="hdr-right">
              <button className="rv-back" onClick={() => navigate({ id: 'reports' })}>{I.back}Back to Reports</button>
              <a
                className="btn"
                href={reportsApi.rawUrl(name)}
                download={name}
                title="Download full HTML report"
                onClick={() => toast('Downloading report…', 'success')}
              >{I.download}Download</a>
              <button className="btn" onClick={() => window.print()} title="Print / Save as PDF">{I.print}Print</button>
            </div>
          </div>
        </header>

        {loading && !data && (
          <div className="rv-msg">Loading report…</div>
        )}

        {error && (
          <div className="rv-msg">
            <div style={{ marginBottom: 6, fontWeight: 700 }}>Couldn't load report data</div>
            <div>{error}</div>
            <button className="rh-retry" onClick={load}>Retry</button>
          </div>
        )}

        {data && v && (
          <>
            <div className={`verdict ${v.kind}`}>
              <div className="verdict-ico">{v.ico}</div>
              <div className="verdict-txt">
                <div className="verdict-h">{v.h}</div>
                <div className="verdict-p">{v.p}</div>
              </div>
              <div className="verdict-spacer" />
              {totals.add + totals.change + totals.destroy > 0 && (
                <div className="verdict-bar">
                  <i className="vb-add" style={{ width: `${(totals.add / total) * 100}%` }} />
                  <i className="vb-change" style={{ width: `${(totals.change / total) * 100}%` }} />
                  <i className="vb-destroy" style={{ width: `${(totals.destroy / total) * 100}%` }} />
                </div>
              )}
            </div>

            <div className="cards">
              <StatCard mod="add" ico={I.plus} val={`+${totals.add}`} lbl="To add" foot={totals.add === 0 ? 'Nothing new' : 'new resources'} />
              <StatCard mod="change" ico={I.tilde} val={`~${totals.change}`} lbl="To change" foot={totals.change === 0 ? 'No updates' : 'in-place updates'} />
              <StatCard mod="destroy" ico={I.minus} val={`-${totals.destroy}`} lbl="To destroy" foot={totals.destroy === 0 ? 'Nothing removed' : 'resources removed'} />
              <StatCard mod="envs" ico={I.layers} val={String(totals.envs)} lbl="Environments" foot={totals.failed > 0 ? `${totals.failed} failed` : (totals.noChange > 0 ? `${totals.noChange} unchanged` : 'all planned')} />
            </div>

            <section className="sec">
              <div className="sec-title">Summary <span className="sec-count">{totals.envs} env{totals.envs === 1 ? '' : 's'}</span></div>
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Environment</th><th>Profile</th>
                      <th className="num">Add</th><th className="num">Change</th><th className="num">Destroy</th>
                      <th>Distribution</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(r => {
                      const s = statusOf(r);
                      const tot = r.add + r.change + r.destroy || 1;
                      const n = (val: number, sym: string, cls: string) =>
                        val > 0 ? <span className={cls}>{sym}{val}</span> : <span className="n-zero">{sym}0</span>;
                      return (
                        <tr key={r.env} onClick={() => jumpTo(r.env)}>
                          <td>
                            <span className="env-link">
                              <span className="env-dot" style={{ background: s.dot }} />
                              <span className="env-name">{r.env}</span>
                            </span>
                          </td>
                          <td className="t-profile">{r.profile || '—'}</td>
                          <td className="num n-add">{r.failed ? <span className="n-zero">—</span> : n(r.add, '+', 'n-add')}</td>
                          <td className="num n-change">{r.failed ? <span className="n-zero">—</span> : n(r.change, '~', 'n-change')}</td>
                          <td className="num n-destroy">{r.failed ? <span className="n-zero">—</span> : n(r.destroy, '-', 'n-destroy')}</td>
                          <td>
                            {!r.failed && (
                              <span className="dist">
                                <i style={{ width: `${(r.add / tot) * 100}%`, background: 'var(--rv-green)' }} />
                                <i style={{ width: `${(r.change / tot) * 100}%`, background: 'var(--rv-amber)' }} />
                                <i style={{ width: `${(r.destroy / tot) * 100}%`, background: 'var(--rv-red)' }} />
                              </span>
                            )}
                          </td>
                          <td><span className={`sb ${s.cls}`}><span className="d" />{s.label}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="sec">
              <div className="sec-title">Details <span className="sec-count">{totals.envs} env{totals.envs === 1 ? '' : 's'}</span></div>

              <div className="toolbar">
                <div className={`search${query ? ' has-val' : ''}`}>
                  {I.search}
                  <input
                    ref={searchRef}
                    type="text"
                    placeholder="Search resources, attributes, addresses…  ( / )"
                    spellCheck={false}
                    autoComplete="off"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                  <button className="search-clear" aria-label="Clear search" onClick={() => { setQuery(''); searchRef.current?.focus(); }}>{I.x}</button>
                </div>
                <span className="search-count">
                  {search.hasQuery ? `${search.matches} match${search.matches === 1 ? '' : 'es'} · ${shownCount}/${results.length} env` : ''}
                </span>
                <span className="tb-spacer" />
                <button className={`btn${wrap ? ' is-on' : ''}`} onClick={() => setWrap(w => !w)}>{I.wrap}Wrap</button>
                <button className="btn" onClick={toggleAll}>{allOpen ? I.collapse : I.expand}{allOpen ? 'Collapse all' : 'Expand all'}</button>
              </div>

              <div>
                {results.map(r => {
                  const hidden = search.hasQuery && !search.matched.has(r.env);
                  const open = search.hasQuery
                    ? (search.matched.has(r.env) ? true : !!openState[r.env])
                    : !!openState[r.env];
                  return (
                    <EnvBlock
                      key={r.env}
                      result={r}
                      command={command}
                      open={open}
                      hidden={hidden}
                      query={search.q}
                      wrap={wrap}
                      onToggle={() => setOpenState(prev => ({ ...prev, [r.env]: !open }))}
                      onScrollRef={el => { blockRefs.current[r.env] = el; }}
                    />
                  );
                })}
                <div className={`no-match${search.hasQuery && shownCount === 0 ? ' show' : ''}`}>
                  {I.nomatch}<div>No environments match your search.</div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </Shell>
  );
}

function StatCard({ mod, ico, val, lbl, foot }: { mod: string; ico: ReactNode; val: string; lbl: string; foot: string }) {
  return (
    <div className={`card card-${mod}`}>
      <div className="card-top"><span className="card-lbl">{lbl}</span><span className="card-ico">{ico}</span></div>
      <div className="card-val tnum">{val}</div>
      <div className="card-foot">{foot}</div>
    </div>
  );
}
