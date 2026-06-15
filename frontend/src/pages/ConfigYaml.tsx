import { useCallback, useEffect, useRef, useState } from 'react';
import Shell from '../Shell';
import { configApi } from '../api';
import { useNav } from '../nav';
import GlobalSettingsEditor from '../components/GlobalSettingsEditor';
import ConfigBackups from '../components/ConfigBackups';
import './ConfigYaml.css';

/* =========================================================================
   Config YAML — code editor logic, ported from config/editor.js.
   Syntax highlight + line numbers + current line + schema validation,
   wired to the REAL ~/.config/tf9/config.yaml via configApi.
   ========================================================================= */

const LINE_H = 21; // --ed-lh
const PAD = 12;    // --ed-pad

type Sev = 'err' | 'warn';
interface Problem { line: number; sev: Sev; msg: string; }

/* ---- inline SVG icons (verbatim from editor.js) ----------------------- */
const I = {
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
  format: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/></svg>',
  wrap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><line x1="3" y1="6" x2="21" y2="6"/><path d="M3 12h15a3 3 0 1 1 0 6h-4"/><polyline points="16 16 14 18 16 20"/><line x1="3" y1="18" x2="10" y2="18"/></svg>',
  err: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="8.5 12 11 14.5 15.5 9.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
};

const CHECK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/* ---- helpers ----------------------------------------------------------- */
function esc(s: string): string {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
}

/* ---- syntax highlight -------------------------------------------------- */
function hlVal(v: string): string {
  if (v === '') return '';
  let com = '';
  const ci = v.indexOf(' #');
  if (ci >= 0) { com = '<span class="t-com">' + esc(v.slice(ci)) + '</span>'; v = v.slice(0, ci); }
  const trail = (v.match(/\s*$/) as RegExpMatchArray)[0];
  const core = v.slice(0, v.length - trail.length);
  let cls: string;
  if (/^(["']).*\1$/.test(core)) cls = 't-str';
  else if (/^-?\d+(\.\d+)?$/.test(core)) cls = 't-num';
  else if (/^(true|false|null|yes|no|~)$/i.test(core)) cls = 't-bool';
  else if (/^[&*]/.test(core)) cls = 't-anchor';
  else cls = 't-val';
  return '<span class="' + cls + '">' + esc(core) + '</span>' + esc(trail) + com;
}
function hlLine(line: string): string {
  if (/^\s*#/.test(line)) return '<span class="t-com">' + esc(line) + '</span>';
  const m = line.match(/^(\s*)(- )?([A-Za-z0-9_.\-]+)(:)(\s|$)(.*)$/);
  if (m) {
    let out = esc(m[1]);
    if (m[2]) out += '<span class="t-pun">- </span>';
    out += '<span class="t-key">' + esc(m[3]) + '</span><span class="t-pun">:</span>' + (m[5] === ' ' ? ' ' : '');
    out += hlVal(m[6]);
    return out;
  }
  const l = line.match(/^(\s*)(- )(.*)$/);
  if (l) return esc(l[1]) + '<span class="t-pun">- </span>' + hlVal(l[3]);
  return esc(line) || '';
}
function highlightHtml(value: string): string {
  return value.split('\n').map(hlLine).join('\n');
}

/* ---- validation -------------------------------------------------------- */
function validate(value: string): Problem[] {
  const lines = value.split('\n');
  const probs: Problem[] = [];
  const repoNames: Record<string, boolean> = {};
  const rootKeys = new Set(['version', 'web', 'repositories', 'profile_mappings', 'sts_profile', 'log_level']);
  lines.forEach((ln, i) => {
    const lead = (ln.match(/^[ \t]*/) as RegExpMatchArray)[0];
    if (lead.indexOf('\t') >= 0) probs.push({ line: i + 1, sev: 'err', msg: 'YAML does not allow tabs for indentation — use spaces.' });
    const root = ln.match(/^([A-Za-z0-9_.-]+):/);
    if (root && !rootKeys.has(root[1])) {
      probs.push({ line: i + 1, sev: 'err', msg: `Unsupported top-level field "${root[1]}". Remove legacy or unrelated configuration.` });
    }
    if (/^    groups:/.test(ln)) {
      probs.push({ line: i + 1, sev: 'err', msg: 'Repository-level "groups" is unsupported. Define each target group with its "group" field.' });
    }
    const ai = ln.match(/^\s*((?:default_)?account_id):\s*(\d{6,})\s*(#.*)?$/);
    if (ai) probs.push({ line: i + 1, sev: 'warn', msg: 'Quote ' + ai[1] + ' ("' + ai[2] + '") to preserve leading zeros.' });
    const rn = ln.match(/^  - name:\s*(\S+)/);
    if (rn) { if (repoNames[rn[1]]) probs.push({ line: i + 1, sev: 'err', msg: 'Duplicate repository name "' + rn[1] + '".' }); repoNames[rn[1]] = true; }
  });
  if (!/^version:\s*1\s*$/m.test(value)) probs.push({ line: 1, sev: 'warn', msg: 'Expected "version: 1" at the top of the file.' });

  let inTgt = false, tStart = 0, tName = '', hasDir = false, hasProf = false;
  function closeTgt() {
    if (!inTgt) return;
    if (!hasProf) probs.push({ line: tStart, sev: 'err', msg: 'Target "' + tName + '" is missing required field: aws_profile.' });
    if (!hasDir) probs.push({ line: tStart, sev: 'err', msg: 'Target "' + tName + '" is missing required field: directory.' });
    inTgt = false;
  }
  lines.forEach((ln, i) => {
    const indent = ((ln.match(/^ */) || [''])[0]).length;
    const tm = ln.match(/^      - name:\s*(\S+)/);
    if (tm) { closeTgt(); inTgt = true; tStart = i + 1; tName = tm[1]; hasDir = false; hasProf = false; return; }
    if (inTgt) {
      if (ln.trim() && indent <= 4) { closeTgt(); return; }
      if (/^\s*aws_profile:\s*\S/.test(ln)) hasProf = true;
      if (/^\s*directory:\s*\S/.test(ln)) hasDir = true;
    }
  });
  closeTgt();
  probs.sort((a, b) => a.line - b.line);
  return probs;
}

export default function ConfigYaml() {
  const { mode } = useNav();
  const [path, setPath] = useState('~/.config/tf9/config.yaml');
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState('');
  const [revision, setRevision] = useState('');
  const [problems, setProblems] = useState<Problem[]>([]);
  const [curLine, setCurLine] = useState(0);
  const [pos, setPos] = useState({ line: 1, col: 1 });
  const [wrap, setWrap] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastOn, setToastOn] = useState(false);

  const inpRef = useRef<HTMLTextAreaElement>(null);
  const hlRef = useRef<HTMLPreElement>(null);
  const gutterInnerRef = useRef<HTMLDivElement>(null);
  const curbandRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dirty = content !== saved;
  const errCount = problems.filter((p) => p.sev === 'err').length;
  const warnCount = problems.length - errCount;

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    setToastOn(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastOn(false), 1900);
  }, []);

  /* ---- scroll sync (transform-based, mirrors editor.js) ---------------- */
  const syncScroll = useCallback(() => {
    const inp = inpRef.current;
    if (!inp) return;
    if (hlRef.current) hlRef.current.style.transform = `translate(${-inp.scrollLeft}px,${-inp.scrollTop}px)`;
    if (gutterInnerRef.current) gutterInnerRef.current.style.transform = `translateY(${-inp.scrollTop}px)`;
    const cur = inp.value.slice(0, inp.selectionStart).split('\n').length - 1;
    if (curbandRef.current) curbandRef.current.style.transform = `translateY(${cur * LINE_H + PAD - inp.scrollTop}px)`;
  }, []);

  const updateCaret = useCallback(() => {
    const inp = inpRef.current;
    if (!inp) return;
    const before = inp.value.slice(0, inp.selectionStart);
    const line = before.split('\n').length;
    const col = inp.selectionStart - before.lastIndexOf('\n');
    setPos({ line, col });
    setCurLine(line - 1);
  }, []);

  // Recompute problems whenever content changes.
  useEffect(() => { setProblems(validate(content)); }, [content]);

  // Re-sync transforms after render (content / theme / wrap changes).
  useEffect(() => { syncScroll(); }, [content, mode, wrap, curLine, syncScroll]);

  useEffect(() => {
    window.addEventListener('resize', syncScroll);
    return () => window.removeEventListener('resize', syncScroll);
  }, [syncScroll]);

  // Snap editor height to a line boundary so no partial line shows at the bottom.
  useEffect(() => {
    const OVERHEAD = 32; // 1px border × 2 + 30px status bar
    function snap() {
      const el = editorRef.current;
      if (!el) return;
      el.style.height = '';
      const natural = el.getBoundingClientRect().height;
      const codeH = natural - OVERHEAD;
      const n = Math.floor((codeH - PAD) / LINE_H);
      if (n < 1) return;
      el.style.height = (PAD + n * LINE_H + OVERHEAD) + 'px';
    }
    snap();
    window.addEventListener('resize', snap);
    return () => window.removeEventListener('resize', snap);
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  /* ---- load / save ----------------------------------------------------- */
  const load = useCallback(async () => {
    try {
      const res = await configApi.get();
      if (res.path) setPath(res.path);
      setContent(res.content);
      setSaved(res.content);
      setRevision(res.revision);
      toast('Reloaded from disk');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load config');
    }
  }, [toast]);

  // Initial load.
  useEffect(() => {
    let active = true;
    configApi.get()
      .then((res) => {
        if (!active) return;
        if (res.path) setPath(res.path);
        setContent(res.content);
        setSaved(res.content);
        setRevision(res.revision);
      })
      .catch((e) => { if (active) toast(e instanceof Error ? e.message : 'Failed to load config'); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async () => {
    if (problems.some((p) => p.sev === 'err')) {
      setShowProblems(true);
      toast('Fix errors before saving');
      return;
    }
    const next = content.endsWith('\n') ? content : content + '\n';
    try {
      const res = await configApi.save(next, revision);
      setRevision(res.revision);
      setContent(next);
      setSaved(next);
      toast('Config saved to config.yaml');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to save config');
    }
  }, [content, problems, revision, toast]);

  const refreshSource = useCallback(async () => {
    const res = await configApi.get();
    if (res.path) setPath(res.path);
    setContent(res.content);
    setSaved(res.content);
    setRevision(res.revision);
  }, []);

  const format = useCallback(async () => {
    setFormatting(true);
    try {
      const res = await configApi.format(content);
      setContent(res.content);
      toast('Document formatted');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not format document');
    } finally {
      setFormatting(false);
    }
  }, [content, toast]);

  /* ---- goto line (problems pane click) --------------------------------- */
  const gotoLine = useCallback((line: number) => {
    const inp = inpRef.current;
    if (!inp) return;
    const lines = inp.value.split('\n');
    let p = 0;
    for (let i = 0; i < line - 1 && i < lines.length; i++) p += lines[i].length + 1;
    inp.focus();
    inp.setSelectionRange(p, p);
    inp.scrollTop = Math.max(0, (line - 1) * LINE_H - inp.clientHeight / 2 + 40);
    updateCaret();
    syncScroll();
  }, [updateCaret, syncScroll]);

  /* ---- keydown (Tab, save, and format shortcuts) ----------------------- */
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const inp = inpRef.current;
    if (!inp) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = inp.selectionStart, en = inp.selectionEnd;
      const next = inp.value.slice(0, s) + '  ' + inp.value.slice(en);
      setContent(next);
      requestAnimationFrame(() => {
        inp.selectionStart = inp.selectionEnd = s + 2;
        updateCaret();
        syncScroll();
      });
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      format();
    }
  }, [format, save, updateCaret, syncScroll]);

  /* ---- gutter rows ----------------------------------------------------- */
  const lineCount = content.split('\n').length;
  const byLine: Record<number, Sev> = {};
  problems.forEach((p) => { if (!byLine[p.line] || p.sev === 'err') byLine[p.line] = p.sev; });

  return (
    <Shell>
      <div className="config-page">
        <div className="page-head">
          <div>
            <div className="page-title">Configuration</div>
            <div className="page-desc">
              Shared CLI and web UI configuration. <code>{path}</code> — store AWS profile names, account IDs and regions here, never credentials.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-normal" onClick={load}>
              <span style={{ display: 'flex' }} dangerouslySetInnerHTML={{ __html: I.refresh }} />Reload
            </button>
            <button className="btn btn-primary" onClick={save} disabled={!dirty}>
              <span style={{ display: 'flex' }} dangerouslySetInnerHTML={{ __html: I.save }} />Save
              {dirty && <span className="dirty-dot" />}
            </button>
          </div>
        </div>

        {dirty && (
          <div className="alert warning">
            <span style={{ display: 'flex' }} dangerouslySetInnerHTML={{ __html: I.warn }} />
            <div>You have unsaved changes. The schema is validated before saving.</div>
          </div>
        )}

        <GlobalSettingsEditor disabled={dirty} notify={toast} onSaved={refreshSource} />

        <ConfigBackups notify={toast} onRestored={refreshSource} />

        <div className="container flush">
          <div className="c-head">
            <div>
              <div className="c-title">Configuration file</div>
              <div className="c-desc mono">{path}</div>
            </div>
          </div>

          <div style={{ padding: 14 }}>
            <div
              className={`editor${wrap ? ' wrap' : ''}${showProblems ? ' show-problems' : ''}`}
              data-theme={mode === 'light' ? 'light' : 'dark'}
              data-variant={mode}
              ref={editorRef}
            >
              <div className="ed-main">
                <div className="ed-gutter">
                  <div className="ed-gutter-inner" ref={gutterInnerRef}>
                    {Array.from({ length: lineCount }, (_, i) => (
                      <div key={i} className={`gl${i === curLine ? ' cur' : ''}`}>
                        {byLine[i + 1] && <span className={`marker ${byLine[i + 1] === 'err' ? 'err' : 'warn'}`} />}
                        {i + 1}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="ed-code">
                  <div className="ed-curband" ref={curbandRef} />
                  <pre className="ed-highlight" ref={hlRef} dangerouslySetInnerHTML={{ __html: highlightHtml(content) }} />
                  <textarea
                    className="ed-input"
                    ref={inpRef}
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="off"
                    wrap="off"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={onKeyDown}
                    onKeyUp={() => { updateCaret(); syncScroll(); }}
                    onClick={() => { updateCaret(); syncScroll(); }}
                    onScroll={syncScroll}
                  />
                </div>
              </div>

              <div className="ed-status">
                <span className="seg seg-prob" onClick={() => setShowProblems((v) => !v)}>
                  <span>
                    {errCount
                      ? <span className="pill-err" dangerouslySetInnerHTML={{ __html: I.err + ' ' + errCount }} />
                      : <span className="pill-ok" dangerouslySetInnerHTML={{ __html: I.ok + ' 0' }} />}
                  </span>
                  <span>
                    <span className={warnCount ? 'pill-warn' : undefined} dangerouslySetInnerHTML={{ __html: I.warn + ' ' + warnCount }} />
                  </span>
                </span>
                <span className="sp" />
                <span className="seg">Ln {pos.line}, Col {pos.col}</span>
                <span className="seg">Spaces: 2</span>
                <span className="seg">YAML</span>
                <span
                  className={`seg btn-seg${wrap ? ' on' : ''}`}
                  title="Toggle word wrap"
                  style={{ display: 'inline-flex' }}
                  onClick={() => setWrap((v) => !v)}
                >
                  <span style={{ display: 'flex' }} dangerouslySetInnerHTML={{ __html: I.wrap }} />
                </span>
              </div>

              <div className="ed-problems">
                <div className="prob-head">
                  <span>Problems <span style={{ color: 'var(--ed-gutter-text)', fontWeight: 400 }}>({problems.length})</span></span>
                  <button className="prob-close" onClick={() => setShowProblems(false)} dangerouslySetInnerHTML={{ __html: I.x }} />
                </div>
                {problems.length === 0 ? (
                  <div className="prob-empty">
                    <span dangerouslySetInnerHTML={{ __html: I.ok }} />  No problems detected. Schema is valid.
                  </div>
                ) : (
                  problems.map((p, i) => (
                    <div key={i} className="prob-row" onClick={() => gotoLine(p.line)}>
                      <span className={`ic ${p.sev === 'err' ? 'err' : 'warn'}`} dangerouslySetInnerHTML={{ __html: p.sev === 'err' ? I.err : I.warn }} />
                      <span>{p.msg}</span>
                      <span className="ln">Ln {p.line}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <button className="btn btn-normal btn-sm" onClick={format} disabled={formatting}>
                <span style={{ display: 'flex' }} dangerouslySetInnerHTML={{ __html: I.format }} />
                {formatting ? 'Formatting…' : 'Format document'}
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                Validated against the tf9 schema · Tab inserts 2 spaces · ⌘S to save · ⇧⌘F to format
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className={`toast${toastOn ? ' show' : ''}`}>
        {CHECK_ICON}{toastMsg}
      </div>
    </Shell>
  );
}
