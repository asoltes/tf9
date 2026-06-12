import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api } from '../api';
import { useNav } from '../nav';
import { useToast } from './ToastProvider';
import { envColor } from '../lib/colors';
import {
  parseEnvSections,
  parseCounts,
  deriveTargetStatuses,
  sectionTerminalStatus,
  isParallelStream,
  stripAnsi,
  APPROVAL_SENTINEL,
  APPROVAL_CLEAR_SENTINEL,
  type EnvSection,
  type TargetState,
  type TargetStatus,
} from '../lib/runStatus';
import { parseResourceChanges, rctBadgeLabel, type ResourceChange } from '../lib/planChanges';
import TerminalBody, { renderLine, lineClass } from './Terminal';
import ConfirmModal from './ConfirmModal';
import RetryBranchModal from './RetryBranchModal';
import type { Run, RunStatus } from '../types';

type FsFilter = 'all' | 'changes' | 'errors' | 'plan';

function applyFilter(lines: string[], filter: FsFilter, search: string): string[] {
  let result = lines;
  if (filter !== 'all') {
    if (filter === 'changes') {
      const segments: string[][] = [];
      let current: string[] = [];
      for (const line of result) {
        if (/^\s*#\s/.test(stripAnsi(line))) {
          if (current.length) segments.push(current);
          current = [line];
        } else {
          current.push(line);
        }
      }
      if (current.length) segments.push(current);
      result = segments
        .filter(seg => seg.some(l => {
          const cls = lineClass(stripAnsi(l));
          return cls === 'tl-add' || cls === 'tl-del' || cls === 'tl-chg';
        }))
        .flat();
    } else {
      result = result.filter(line => {
        const plain = stripAnsi(line);
        const cls = lineClass(plain);
        if (filter === 'errors') return cls === 'tl-err' || /Error|FAILED|\[FAILED\]/i.test(plain);
        if (filter === 'plan') return cls === 'tl-plan' || cls === 'tl-ok';
        return true;
      });
    }
  }
  if (search.trim()) {
    const term = search.trim().toLowerCase();
    result = result.filter(line => stripAnsi(line).toLowerCase().includes(term));
  }
  return result;
}


function ResourceChangeTable({ lines, search, expanded, onToggle }: { lines: string[]; search: string; expanded: string | null; onToggle: (key: string) => void }) {
  const changes = useMemo(() => parseResourceChanges(lines), [lines]);
  const term = search.trim().toLowerCase();
  const filtered = term ? changes.filter(c => c.resource.toLowerCase().includes(term)) : changes;
  if (filtered.length === 0) {
    return (
      <div className="tc-body">
        <span className="waiting">
          {changes.length === 0 ? 'No resource changes detected.' : 'No matching resources.'}
        </span>
      </div>
    );
  }
  return (
    <div className="tc-body rct-wrap">
      <table className="rct">
        <thead><tr><th>Action</th><th>Resource</th><th /></tr></thead>
        <tbody>
          {filtered.flatMap((c, i) => {
            const key = `${c.action}:${c.resource}`;
            const isOpen = expanded === key;
            const rows: React.ReactNode[] = [
              <tr
                key={`r${i}`}
                className={`rct-row${isOpen ? ' rct-row-open' : ''}`}
                onClick={() => onToggle(key)}
              >
                <td><span className={`rct-badge ${c.action}`}>{rctBadgeLabel(c.action)}</span></td>
                <td className="rct-resource">{c.resource}</td>
                <td className="rct-chevron">{I.chev}</td>
              </tr>,
            ];
            if (isOpen) {
              rows.push(
                <tr key={`e${i}`} className="rct-expanded">
                  <td colSpan={3} className="rct-block-cell">
                    <TerminalBody lines={c.blockLines} autoScroll={false} className="rct-block-body" />
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

// ── Inline icons (stroke=currentColor), ported from runs-history.js ─────────
const I = {
  refresh: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>,
  seq: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="5" rx="1" /><rect x="4" y="16" width="16" height="5" rx="1" /><path d="M12 8v4m0 0-2-2m2 2 2-2" /></svg>,
  par: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="6" height="16" rx="1" /><rect x="15" y="4" width="6" height="16" rx="1" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
  checkc: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="8.5 12 11 14.5 15.5 9.5" /></svg>,
  x: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></svg>,
  stop: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><rect x="9" y="9" width="6" height="6" rx="1" /></svg>,
  expand: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>,
  chev: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>,
  report: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></svg>,
  grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="8" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" /></svg>,
  tabs: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9h18M3 9l2-4h6l1 2h9v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /></svg>,
  merge: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>,
  warn: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  arrow: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  git: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>,
  dockSide: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="15" y1="4" x2="15" y2="20" /></svg>,
  dockBottom: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="3" y1="14" x2="21" y2="14" /></svg>,
  retry: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>,
  copy: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>,
  wrap: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><path d="M3 12h13a3 3 0 0 1 0 6h-4l2-2m0 4-2-2" /><line x1="3" y1="18" x2="7" y2="18" /></svg>,
  nowrap: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>,
  download: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 21h16" /></svg>,
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>,
  search: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.35-4.35" /></svg>,
  ban: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><line x1="6.3" y1="6.3" x2="17.7" y2="17.7" /></svg>,
};

type Dock = 'bottom' | 'side';
type ParallelView = 'grid' | 'tabs' | 'merged';

function statusClass(s: RunStatus): string { return s; }
function statusIcon(s: RunStatus): React.ReactNode {
  if (s === 'running') return <span className="spin" />;
  if (s === 'success') return I.checkc;
  if (s === 'failed') return I.x;
  if (s === 'denied') return I.ban;
  return I.stop;
}

function duration(start: string, end?: string): string {
  if (!end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function relTime(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (!iso || isNaN(s)) return '';
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

function cmdBadgeClass(cmd: string): string {
  return cmd === 'destroy' ? 'red' : cmd === 'apply' ? 'orange' : cmd === 'plan' ? 'green' : 'blue';
}

// Proportional colour bar showing add/change/destroy distribution.
function DistBar({ counts }: { counts: ReturnType<typeof parseCounts> }) {
  const total = counts.add + counts.change + counts.destroy;
  if (total === 0) return null;
  return (
    <span className="dist-bar">
      <i style={{ width: `${(counts.add / total) * 100}%` }} />
      <i style={{ width: `${(counts.change / total) * 100}%` }} />
      <i style={{ width: `${(counts.destroy / total) * 100}%` }} />
    </span>
  );
}

// Stats chips rendered with the prototype's tc-stats classes.
function StatsChips({ counts, runStatus }: { counts: ReturnType<typeof parseCounts>; runStatus?: RunStatus }) {
  if (runStatus === 'denied') return <span className="tc-state denied">DENIED</span>;
  if (counts.failed) return <span className="tc-state fail">FAILED</span>;
  if (counts.noChanges) return <span className="tc-stats"><span className="c">~0</span></span>;
  if (counts.add > 0 || counts.change > 0 || counts.destroy > 0) {
    return (
      <span className="tc-stats">
        <span className="a">+{counts.add}</span>
        <span className="c">~{counts.change}</span>
        <span className="d">-{counts.destroy}</span>
      </span>
    );
  }
  return null;
}

interface FullscreenState { env: string; profile: string; sectionName: string | null; }

interface Props {
  run: Run | null;
  lines: string[];
  dock: Dock;
  onDockChange: (d: Dock) => void;
  onStatusChange?: () => void;
  onRerun?: (run: Run) => void;
  onApplyPlan?: (run: Run) => void;
}

export default function RunSplitPanel({ run, lines, dock, onDockChange, onStatusChange, onRerun, onApplyPlan }: Props) {
  const { navigate } = useNav();
  const toast = useToast();
  const [parallelView, setParallelView] = useState<ParallelView>('grid');
  const [activeTab, setActiveTab] = useState<string>('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [fullscreen, setFullscreen] = useState<FullscreenState | null>(null);
  const [fsWrap, setFsWrap] = useState(true);
  const [fsSearch, setFsSearch] = useState('');
  const [fsFilter, setFsFilter] = useState<FsFilter>('all');
  const fsSearchInputRef = useRef<HTMLInputElement>(null);
  const [spSearch, setSpSearch] = useState('');
  const [spFilter, setSpFilter] = useState<FsFilter>('all');
  // Changes-filter resource expansion, keyed per table id so it survives the
  // single→promotion/parallel branch switch that remounts ResourceChangeTable.
  const [rctExpanded, setRctExpanded] = useState<Record<string, string | null>>({});
  const spSearchInputRef = useRef<HTMLInputElement>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmApplyPlan, setConfirmApplyPlan] = useState(false);
  const [confirmKill, setConfirmKill] = useState(false);
  const [retryOpen, setRetryOpen] = useState(false);
  const [approvalPending, setApprovalPending] = useState(false);
  const [approvalInput, setApprovalInput] = useState('yes');
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const fsBodyRef = useRef<HTMLDivElement>(null);

  // ── Resize handle (axis depends on dock) ─────────────────────────────────
  useEffect(() => {
    const handle = handleRef.current;
    const panel = panelRef.current;
    if (!handle || !panel) return;
    let drag: { x: number; y: number; w: number; h: number } | null = null;
    function onMove(e: PointerEvent) {
      if (!drag || !panel) return;
      if (dock === 'side') {
        const nw = Math.max(340, Math.min(window.innerWidth - 400, drag.w - (e.clientX - drag.x)));
        panel.style.width = nw + 'px'; panel.style.height = '';
      } else {
        const nh = Math.max(120, Math.min(window.innerHeight - 160, drag.h - (e.clientY - drag.y)));
        panel.style.height = nh + 'px'; panel.style.width = '';
      }
    }
    function onUp() {
      drag = null; document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    function onDown(e: PointerEvent) {
      if (!panel) return;
      drag = { x: e.clientX, y: e.clientY, w: panel.offsetWidth, h: panel.offsetHeight };
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    }
    handle.addEventListener('pointerdown', onDown);
    return () => {
      handle.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dock]);

  // Reset inline sizing when dock mode flips so the CSS min() defaults apply.
  useEffect(() => {
    if (panelRef.current) { panelRef.current.style.width = ''; panelRef.current.style.height = ''; }
  }, [dock]);

  // Reset view-related state when the selected run changes.
  const runId = run?.id ?? null;
  useEffect(() => {
    setParallelView('grid');
    setActiveTab('');
    setCollapsed({});
    setFullscreen(null);
    setSpSearch('');
    setSpFilter('all');
    setRctExpanded({});
  }, [runId]);

  // Props that make ResourceChangeTable a controlled component for a given table.
  const rctProps = useCallback((tableId: string) => ({
    expanded: rctExpanded[tableId] ?? null,
    onToggle: (key: string) =>
      setRctExpanded(p => ({ ...p, [tableId]: p[tableId] === key ? null : key })),
  }), [rctExpanded]);

  // Derived data ------------------------------------------------------------
  const displayLines = lines.filter(l => l !== APPROVAL_SENTINEL && l !== APPROVAL_CLEAR_SENTINEL);
  const envSections = run ? parseEnvSections(displayLines) : [];
  const command = run?.request?.command ?? run?.command ?? '';
  const isParallelRun = !!run && (run.request?.parallel || isParallelStream(lines));
  const mode: 'parallel' | 'promotion' = isParallelRun ? 'parallel' : 'promotion';
  const isAutoRun = command === 'auto' && envSections.some(s => s.stage);

  const expectedTargets =
    run?.targetDirs && run.targetDirs.length > 0
      ? run.targetDirs
      : run?.request?.promotionOrder && run.request.promotionOrder.length > 0
        ? run.request.promotionOrder
        : undefined;
  const rawTargetStatuses = deriveTargetStatuses(displayLines, expectedTargets, command);
  // When the run has finished, any section still marked 'running' never emitted
  // a terminal plan line (e.g. apply output). Promote it to match the run outcome
  // so the progress bar and dots settle rather than staying stuck as running.
  // When a run ends, settle any target still showing as running or queued.
  // Cancelled runs stop all remaining targets; denied marks them denied; failed marks them fail.
  const targetStatuses = run && run.status !== 'running'
    ? rawTargetStatuses.map(t =>
        t.status === 'done'
          ? t
          : { ...t, status: (run.status === 'success' ? 'done' : run.status === 'denied' ? 'denied' : 'fail') as TargetStatus }
      )
    : rawTargetStatuses;

  // ── Auto-run stage groups (hoisted so progress bar + dots can use them) ───
  type StageGroup = { stage: string; stepNum: number; sections: EnvSection[] };
  const STAGE_ORDER = ['init', 'plan', 'apply'] as const;
  const stageGroups: StageGroup[] = [];
  if (isAutoRun) {
    for (const s of envSections) {
      const stage = s.stage ?? 'unknown';
      let group = stageGroups.find(g => g.stage === stage);
      if (!group) {
        group = { stage, stepNum: STAGE_ORDER.indexOf(stage as typeof STAGE_ORDER[number]) + 1, sections: [] };
        stageGroups.push(group);
      }
      group.sections.push(s);
    }
  }
  const lastStage = stageGroups[stageGroups.length - 1]?.stage;

  // For auto runs, derive target statuses from the CURRENT stage only.
  //
  // Two problems this guards against, both rooted in apply output:
  //  1. The global deriveTargetStatuses keys each target off its LATEST section
  //     across all stages — so during the apply phase, qa/loadtest still map to
  //     their plan-stage sections and look "done" before their apply even starts.
  //  2. `terraform apply` echoes "Plan: N to add" before the approval prompt, so
  //     a target that is mid-apply (or waiting for approval) must NOT be treated
  //     as done — sectionTerminalStatus(stage='apply') requires "Apply complete!".
  // Together these keep dev shown as `running`, qa/loadtest as `queued`, and the
  // run progressing target-by-target instead of jumping to "3/3 complete".
  const autoTargetStatuses: TargetState[] = (() => {
    if (!isAutoRun || stageGroups.length === 0 || !expectedTargets?.length) return targetStatuses;
    const sections = stageGroups[stageGroups.length - 1].sections;
    const seen: TargetState[] = sections.map((s, i) => {
      const term = sectionTerminalStatus(s.lines, s.stage);
      if (term === 'fail') return { name: s.name, status: 'fail' as TargetStatus };
      if (term === 'done') return { name: s.name, status: 'done' as TargetStatus };
      // Sequential within a stage: only the last started section is running.
      const isLast = i === sections.length - 1;
      return { name: s.name, status: (isLast ? 'running' : 'done') as TargetStatus };
    });
    const seenByName = new Map(seen.map(t => [t.name, t]));
    const raw = expectedTargets.map(name => seenByName.get(name) ?? { name, status: 'queued' as TargetStatus });
    return run && run.status !== 'running'
      ? raw.map(t => t.status === 'done' ? t : { ...t, status: (run.status === 'success' ? 'done' : run.status === 'denied' ? 'denied' : 'fail') as TargetStatus })
      : raw;
  })();

  // Use stage-aware statuses for auto runs everywhere (progress bar, dots, retry).
  const effectiveTargetStatuses = isAutoRun ? autoTargetStatuses : targetStatuses;

  // Default the active tab once sections exist.
  useEffect(() => {
    setActiveTab(prev => (prev || envSections[0]?.name) ?? '');
  }, [envSections]);

  // Fullscreen lines (live — reflects latest stream).
  const fsLines = fullscreen
    ? fullscreen.sectionName === null
      ? displayLines
      : (envSections.find(s => {
          const key = s.stage ? `${s.stage}:${s.name}` : s.name;
          return key === fullscreen.sectionName;
        })?.lines ?? [])
    : [];

  // Reset search/filter when a different fullscreen section opens.
  useEffect(() => {
    setFsSearch('');
    setFsFilter('all');
  }, [fullscreen?.env, fullscreen?.sectionName]);

  // Fullscreen keyboard / actions ------------------------------------------
  const closeFullscreen = useCallback(() => setFullscreen(null), []);
  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fsSearch || fsFilter !== 'all') { setFsSearch(''); setFsFilter('all'); }
        else closeFullscreen();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        fsSearchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreen, closeFullscreen, fsSearch, fsFilter]);

  const fsDisplayLines = useMemo(
    () => applyFilter(fsLines, fsFilter, fsSearch),
    [fsLines, fsFilter, fsSearch],
  );

  const fsPlainText = useCallback(() => fsLines.map(stripAnsi).join('\n'), [fsLines]);
  const onCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(fsPlainText()); toast('Output copied', 'success'); }
    catch { toast('Copy failed', 'error'); }
  }, [fsPlainText, toast]);
  const onDownload = useCallback(() => {
    if (!fullscreen) return;
    const safe = (s: string) => (s || 'output').replace(/[^a-z0-9._-]+/gi, '-');
    const filename = `${safe(command)}-${safe(fullscreen.env)}.txt`;
    const blob = new Blob([fsPlainText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(`Downloaded ${filename}`, 'success');
  }, [fullscreen, command, fsPlainText, toast]);

  async function cancelRun() {
    if (!run) return;
    setConfirmCancel(false);
    try {
      await api.delete(`/api/runs/${run.id}`);
      toast('Cancellation requested', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to cancel run', 'error');
    }
    onStatusChange?.();
  }

  async function forceKillRun() {
    if (!run) return;
    setConfirmKill(false);
    try {
      await api.forceKill(run.id);
      setApprovalPending(false);
      toast('Run force-killed', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to force-kill run', 'error');
    }
    onStatusChange?.();
  }

  // ── Terraform interactive approval detection ─────────────────────────────
  // The runner emits APPROVAL_SENTINEL when terraform blocks on the prompt and
  // APPROVAL_CLEAR_SENTINEL when it stops waiting. The bar is open only while
  // more show-sentinels than clear-sentinels have streamed — so it appears
  // exactly when terraform is blocked and clears reliably. run.awaitingInput is
  // the backend's authoritative fallback (covers reload / late join).
  useEffect(() => {
    const show = lines.filter(l => l === APPROVAL_SENTINEL).length;
    const clear = lines.filter(l => l === APPROVAL_CLEAR_SENTINEL).length;
    const pending = (show > clear) || !!run?.awaitingInput;
    setApprovalPending(pending);
    if (pending) setApprovalInput('yes');
  }, [lines, run?.awaitingInput, run?.id]);

  // Force-clear the gate when a run finishes (no more input possible).
  useEffect(() => {
    if (!run || run.status !== 'running') setApprovalPending(false);
  }, [run?.status]);

  async function sendApproval(value: string) {
    if (!run || approvalSubmitting) return;
    setApprovalSubmitting(true);
    try {
      await api.sendRunInput(run.id, value);
      setApprovalPending(false);
    } catch (e) {
      // 409 = run is no longer waiting (it moved on, finished, or was killed).
      // Surface it and resync run state so a stale bar clears instead of hanging.
      toast(e instanceof Error ? e.message : 'Approval failed', 'error');
      setApprovalPending(false);
      onStatusChange?.();
    } finally {
      setApprovalSubmitting(false);
    }
  }

  // Inline terraform approval bar — rendered in the split panel body AND inside
  // the fullscreen terminal so the user can approve without leaving fullscreen.
  function approvalBar(variant: 'sp' | 'fs') {
    if (!approvalPending || run?.status !== 'running') return null;
    return (
      <div className={`sp-approval-bar${variant === 'fs' ? ' fs-approval-bar' : ''}`} role="alert" aria-live="assertive">
        <div className="sp-approval-msg">
          <span className="sp-approval-icon">{I.warn}</span>
          <span>Terraform is waiting for your approval — only <strong>yes</strong> will be accepted to apply.</span>
        </div>
        <div className="sp-approval-actions">
          <input
            className="sp-approval-input"
            type="text"
            value={approvalInput}
            onChange={e => setApprovalInput(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter' && approvalInput.trim() === 'yes') sendApproval(approvalInput.trim());
            }}
            spellCheck={false}
            autoComplete="off"
            autoFocus
          />
          <button
            className="btn btn-primary btn-sm"
            disabled={approvalInput.trim() !== 'yes' || approvalSubmitting}
            onClick={() => sendApproval(approvalInput.trim())}
          >
            {approvalSubmitting ? 'Approving…' : 'Approve'}
          </button>
          <button
            className="btn btn-danger btn-sm"
            disabled={approvalSubmitting}
            onClick={() => sendApproval('no')}
          >
            Deny
          </button>
        </div>
      </div>
    );
  }

  function retryFailed() {
    if (!run || !onRerun) return;
    setRetryOpen(true);
  }

  function confirmRetry() {
    if (!run || !onRerun) return;
    setRetryOpen(false);
    const failedNames = effectiveTargetStatuses.filter(t => t.status === 'fail').map(t => t.name);
    if (failedNames.length === 0) return;
    const origOrder = run.request?.promotionOrder ?? [];
    const promotionOrder = origOrder.length > 0
      ? origOrder.filter(n => failedNames.includes(n))
      : failedNames;
    onRerun({ ...run, request: { ...run.request, envFilter: failedNames.join(','), promotionOrder } });
  }

  function openFullscreen(env: string, profile: string, sectionName: string | null) {
    setFullscreen({ env, profile, sectionName });
  }

  // ── Empty state rendered inline below (same root element as non-empty) ──

  // ── Card head (grid / tabs) ──────────────────────────────────────────────
  function cardHead(section: EnvSection, status: TargetStatus | undefined) {
    const counts = parseCounts(section.lines);
    const sd = status === 'running' ? 'run' : status ?? 'queued';
    const label = status === 'running' ? 'running' : status === 'done' ? 'done' : status === 'fail' ? 'failed' : status === 'denied' ? 'denied' : 'queued';
    return (
      <>
        <span className={`sd ${sd}`} />
        <span className="en">{section.name}</span>
        <span className="pr">{section.profile}</span>
        <span className="sp" />
        {status === 'done' && <StatsChips counts={counts} />}
        {status === 'done' && <DistBar counts={counts} />}
        <span className={`tc-state ${sd}`}>{label}</span>
        <button className="tc-exp" title="Fullscreen"
          onClick={(e) => { e.stopPropagation(); openFullscreen(section.name, section.profile, section.name); }}>
          {I.expand}
        </button>
      </>
    );
  }

  // ── Output region ────────────────────────────────────────────────────────
  let output: React.ReactNode;

  if (envSections.length === 0) {
    // Single target / pre-banner — one terminal card.
    const counts = parseCounts(displayLines);
    const envName = run?.request?.envFilter || 'all environments';
    const runStatus = run?.status;
    const status: TargetStatus | undefined =
      runStatus === 'running' ? 'running' : runStatus === 'success' ? 'done' : runStatus === 'denied' ? 'denied' : runStatus ? 'fail' : undefined;
    const sd = status === 'running' ? 'run' : status ?? 'done';
    output = (
      <div className={`term-grid one`}>
        <div className={`term-card ${sd}`}>
          <div className="tc-head">
            <span className={`sd ${sd}`} />
            <span className="en">{envName}</span>
            <span className="pr">{run?.request?.profile || ''}</span>
            <span className="sp" />
            {(status === 'done' || runStatus !== 'running') && <StatsChips counts={counts} runStatus={runStatus} />}
            {(status === 'done' || runStatus !== 'running') && <DistBar counts={counts} />}
            <button className="tc-exp" title="Fullscreen"
              onClick={(e) => { e.stopPropagation(); openFullscreen(envName, run?.request?.profile || '', null); }}>
              {I.expand}
            </button>
          </div>
          {spFilter === 'changes'
            ? <ResourceChangeTable lines={displayLines} search={spSearch} {...rctProps('single')} />
            : <TerminalBody lines={applyFilter(displayLines, spFilter, spSearch)} autoScroll={!spSearch && spFilter === 'all'} />}
        </div>
      </div>
    );
  } else if (mode === 'parallel') {
    const head = (
      <div className="out-head">
        <div className="ot">
          <span className="par-pill">{I.par}Parallel</span>
          {envSections.length} target{envSections.length === 1 ? '' : 's'} running concurrently
        </div>
        <div className="view-toggle">
          <button className={parallelView === 'grid' ? 'on' : ''} onClick={() => setParallelView('grid')}>{I.grid}Grid</button>
          <button className={parallelView === 'tabs' ? 'on' : ''} onClick={() => setParallelView('tabs')}>{I.tabs}Tabs</button>
          <button className={parallelView === 'merged' ? 'on' : ''} onClick={() => setParallelView('merged')}>{I.merge}Merged</button>
        </div>
      </div>
    );

    let body: React.ReactNode;
    if (parallelView === 'grid') {
      body = (
        <div className={`term-grid${envSections.length === 1 ? ' one' : ''}`}>
          {envSections.map(s => {
            const status = targetStatuses.find(t => t.name === s.name)?.status;
            const sd = status === 'running' ? 'run' : status ?? 'queued';
            return (
              <div key={s.name} className={`term-card ${sd}`}>
                <div className="tc-head">{cardHead(s, status)}</div>
                {spFilter === 'changes'
                  ? <ResourceChangeTable lines={s.lines} search={spSearch} {...rctProps(s.name)} />
                  : <TerminalBody lines={applyFilter(s.lines, spFilter, spSearch)} autoScroll={!spSearch && spFilter === 'all'} />}
              </div>
            );
          })}
        </div>
      );
    } else if (parallelView === 'tabs') {
      const active = envSections.find(s => s.name === activeTab) ?? envSections[0];
      const activeStatus = active ? targetStatuses.find(t => t.name === active.name)?.status : undefined;
      body = (
        <>
          <div className="term-tabs">
            {envSections.map(s => {
              const status = targetStatuses.find(t => t.name === s.name)?.status;
              const d = status === 'running' ? 'run' : status ?? 'queued';
              return (
                <div key={s.name} className={`term-tab${s.name === active?.name ? ' on' : ''}`} onClick={() => setActiveTab(s.name)}>
                  <span className={`d ${d}`} />{s.name}
                </div>
              );
            })}
          </div>
          {active && (
            <div className="term-single">
              <div className="tc-head">{cardHead(active, activeStatus)}</div>
              {spFilter === 'changes'
                ? <ResourceChangeTable lines={active.lines} search={spSearch} {...rctProps(active.name)} />
                : <TerminalBody lines={applyFilter(active.lines, spFilter, spSearch)} autoScroll={!spSearch && spFilter === 'all'} />}
            </div>
          )}
        </>
      );
    } else {
      // Merged — interleave all sections with colored [env] prefixes.
      const term = spSearch.trim().toLowerCase();
      const merged: { env: string; line: string }[] = [];
      envSections.forEach(s => s.lines.forEach(l => merged.push({ env: s.name, line: l })));

      let mergedBody: React.ReactNode;
      if (spFilter === 'changes') {
        // Resource table with extra Target column for the merged view.
        const rows: { env: string; action: ResourceChange['action']; resource: string }[] = [];
        envSections.forEach(s => {
          parseResourceChanges(s.lines).forEach(({ blockLines: _b, ...c }) => {
            if (!term || c.resource.toLowerCase().includes(term)) rows.push({ env: s.name, ...c });
          });
        });
        mergedBody = rows.length === 0
          ? <div className="tc-body"><span className="waiting">No resource changes detected.</span></div>
          : (
            <div className="tc-body rct-wrap">
              <table className="rct">
                <thead><tr><th>Target</th><th>Action</th><th>Resource</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td><span className="merged-pref" style={{ color: envColor(r.env) }}>{r.env}</span></td>
                      <td><span className={`rct-badge ${r.action}`}>{rctBadgeLabel(r.action)}</span></td>
                      <td className="rct-resource">{r.resource}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
      } else {
        const filteredMerged = merged.filter(m => {
          const plain = stripAnsi(m.line);
          const cls = lineClass(plain);
          if (spFilter === 'errors' && cls !== 'tl-err' && !/Error|FAILED|\[FAILED\]/i.test(plain)) return false;
          if (spFilter === 'plan' && cls !== 'tl-plan' && cls !== 'tl-ok') return false;
          if (term && !plain.toLowerCase().includes(term)) return false;
          return true;
        });
        mergedBody = (
          <div className="tc-body">
            {filteredMerged.length === 0
              ? <span className="waiting">{merged.length === 0 ? 'Waiting for output…' : 'No matching lines.'}</span>
              : filteredMerged.map((m, i) => (
                  <span key={i}>
                    <span className="merged-pref" style={{ color: envColor(m.env) }}>[{m.env}] </span>
                    {renderLine(m.line, i)}
                  </span>
                ))}
          </div>
        );
      }

      body = (
        <div className="merged-term">
          <div className="tc-head">
            <span className="en">All targets</span>
            <span className="pr">interleaved · prefixed by target</span>
            <span className="sp" />
            <button className="tc-exp" title="Fullscreen"
              onClick={(e) => { e.stopPropagation(); openFullscreen('all-targets', '', null); }}>
              {I.expand}
            </button>
          </div>
          {mergedBody}
        </div>
      );
    }

    output = <>{head}{body}</>;
  } else {
    // Promotion — stacked collapsible sections; auto-expand running/fail.

    // Helper: render a single collapsible promo section.
    // colKey disambiguates same-name targets across auto stages.
    function promoSection(s: EnvSection, i: number, colKey: string, fsKey: string, effectiveStatus?: TargetStatus) {
      const status = effectiveStatus ?? targetStatuses.find(t => t.name === s.name)?.status;
      const counts = parseCounts(s.lines);
      const stateCls = status === 'running' ? 'run' : status === 'done' ? 'done' : status === 'fail' ? 'fail' : status === 'denied' ? 'denied' : 'queued';
      const defaultCollapsed = status !== 'running' && status !== 'fail' && status !== 'denied';
      const isCollapsed = colKey in collapsed ? collapsed[colKey] : defaultCollapsed;
      const step = status === 'done' ? I.check : status === 'fail' ? '!' : status === 'denied' ? I.ban : i + 1;
      return (
        <div key={colKey} className={`promo-sec ${stateCls}${isCollapsed ? ' collapsed' : ''}`}>
          <div className="promo-sec-head" onClick={() => setCollapsed(prev => ({ ...prev, [colKey]: !(colKey in prev ? prev[colKey] : defaultCollapsed) }))}>
            <span className="promo-step">{step}</span>
            <span className="promo-nm">{s.name}</span>
            <span className="promo-pr">{s.profile}</span>
            <span className="sp" />
            {status === 'running'
              ? <span className="spin" style={{ borderColor: 'var(--blue)', borderTopColor: 'transparent' }} />
              : status === 'queued'
                ? <span style={{ fontSize: '11.5px', color: 'var(--text-3)', fontWeight: 600 }}>queued</span>
                : status === 'fail'
                  ? <span style={{ fontSize: '11.5px', color: 'var(--red)', fontWeight: 700 }}>FAILED</span>
                  : (
                    <>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>
                        <span style={{ color: 'var(--green)' }}>+{counts.add}</span>{' '}
                        <span style={{ color: 'var(--amber)' }}>~{counts.change}</span>{' '}
                        <span style={{ color: 'var(--red)' }}>-{counts.destroy}</span>
                      </span>
                      <DistBar counts={counts} />
                    </>
                  )}
            <button className="tc-exp" title="Fullscreen" style={{ color: 'var(--text-3)' }}
              onClick={(e) => { e.stopPropagation(); openFullscreen(s.name, s.profile, fsKey); }}>
              {I.expand}
            </button>
            <span className="promo-chev">{I.chev}</span>
          </div>
          <div className="promo-term">
            {spFilter === 'changes'
              ? <ResourceChangeTable lines={s.lines} search={spSearch} {...rctProps(colKey)} />
              : <TerminalBody lines={applyFilter(s.lines, spFilter, spSearch)} autoScroll={!spSearch && spFilter === 'all'} />}
          </div>
        </div>
      );
    }

    if (isAutoRun) {
      output = (
        <>
          <div className="out-head">
            <div className="ot"><span className="mode-cell" style={{ fontWeight: 700 }}>{I.seq}Auto — init → plan → apply</span></div>
          </div>
          {stageGroups.map(group => {
            const isCurrentStage = group.stage === lastStage;
            // For the current stage, show ALL expected targets — including queued
            // placeholders for targets that haven't started yet.
            const sectionsByName = new Map(group.sections.map(s => [s.name, s]));
            const entries = isCurrentStage && autoTargetStatuses.length > 0
              ? autoTargetStatuses.map(t => ({
                  s: sectionsByName.get(t.name) ?? { name: t.name, profile: '', lines: [], stage: group.stage } as EnvSection,
                  effectiveStatus: t.status,
                }))
              : group.sections.map(s => ({ s, effectiveStatus: 'done' as TargetStatus }));
            return (
              <div key={group.stage} className="auto-stage-group">
                <div className="auto-stage-hdr">
                  <span className={`auto-stage-pill ${group.stage}`}>{group.stage}</span>
                  <span className="auto-stage-step">step {group.stepNum}/3</span>
                </div>
                {entries.map(({ s, effectiveStatus }, i) => {
                  const colKey = `${group.stage}:${s.name}`;
                  const fsKey = colKey;
                  return promoSection(s, i, colKey, fsKey, effectiveStatus);
                })}
              </div>
            );
          })}
        </>
      );
    } else {
      output = (
        <>
          <div className="out-head">
            <div className="ot"><span className="mode-cell" style={{ fontWeight: 700 }}>{I.seq}Promotion — runs in order, stops on failure</span></div>
          </div>
          {envSections.map((s, i) => promoSection(s, i, s.name, s.name))}
        </>
      );
    }
  }

  // ── Progress + dots ──────────────────────────────────────────────────────
  const total = effectiveTargetStatuses.length || 1;
  const done = effectiveTargetStatuses.filter(t => t.status === 'done').length;
  const fail = effectiveTargetStatuses.filter(t => t.status === 'fail').length;
  const runn = effectiveTargetStatuses.filter(t => t.status === 'running').length;
  // When the run is active but no section banners have been parsed yet,
  // targetStatuses is empty and runn=0 — show the full bar as running so
  // the user sees live progress instead of an empty grey rail.
  const displayRunn = runn > 0 ? runn : (run?.status === 'running' && done === 0 && fail === 0 ? 1 : 0);

  const fsStats = (() => {
    if (!fullscreen) return null;
    const counts = parseCounts(fsLines);
    if (run?.status === 'denied') return <span className="tc-state denied" style={{ fontSize: 12 }}>DENIED</span>;
    if (counts.failed) return <span className="tc-state fail" style={{ fontSize: 12 }}>FAILED</span>;
    if (counts.noChanges) return <span className="tc-stats" style={{ fontSize: 13 }}><span className="c">~0</span></span>;
    if (counts.add > 0 || counts.change > 0 || counts.destroy > 0) {
      return (
        <span className="tc-stats" style={{ fontSize: 13 }}>
          <span className="a">+{counts.add}</span><span className="c">~{counts.change}</span><span className="d">-{counts.destroy}</span>
        </span>
      );
    }
    return null;
  })();

  return (
    <>
      <ConfirmModal
        visible={confirmApplyPlan}
        header="Apply reviewed plan"
        confirmLabel="Apply saved plan"
        cancelLabel="Keep reviewing"
        onCancel={() => setConfirmApplyPlan(false)}
        onConfirm={() => {
          setConfirmApplyPlan(false);
          if (run && onApplyPlan) onApplyPlan(run);
        }}
      >
        Apply the exact Terraform plan saved by {run?.id}? Target selection and plan arguments are locked to the reviewed run.
      </ConfirmModal>

      <ConfirmModal
        visible={confirmCancel}
        header="Cancel run"
        confirmLabel="Cancel run"
        cancelLabel="Keep running"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={cancelRun}
      >
        Stop this run? Terraform will be interrupted and any in-progress environment may be left partially applied.
      </ConfirmModal>

      <ConfirmModal
        visible={confirmKill}
        header="Force kill run"
        confirmLabel="Force kill"
        cancelLabel="Keep running"
        onCancel={() => setConfirmKill(false)}
        onConfirm={forceKillRun}
      >
        Forcibly terminate this run? The terraform process and its children are killed immediately (SIGKILL) and the run is marked cancelled. Use this only when a normal cancel does not work — terraform state may be left locked or partially applied.
      </ConfirmModal>

      {retryOpen && run && (
        <RetryBranchModal
          run={run}
          failedCount={effectiveTargetStatuses.filter(t => t.status === 'fail').length}
          onConfirm={confirmRetry}
          onClose={() => setRetryOpen(false)}
        />
      )}

      {/* splitpanel is always the same root element in both empty and
          non-empty state so React never unmounts it — the resize-handle
          useEffect only runs on [dock] changes and would lose its listeners
          if the DOM node were replaced. */}
      <div className="splitpanel" ref={panelRef}>
        <div className="sp-handle" ref={handleRef}><span className="bar" /></div>
        <div className="sp-inner">
          {!run ? (
            <>
              <div className="sp-head">
                <div className="sp-title"><span className="rid">run</span></div>
                <div className="sp-actions">
                  <DockToggle dock={dock} onDockChange={onDockChange} />
                </div>
              </div>
              <div className="sp-body"><div className="sp-empty">Select a run to see its output.</div></div>
            </>
          ) : (
            <>
              <div className="sp-head">
                <div className="sp-title">
                  <span className="rid">{run.id}</span>
                  <span className={`rstatus ${statusClass(run.status)}`}>{statusIcon(run.status)}{run.status}</span>
                </div>
                <div className="sp-actions">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {run.status === 'running' ? (
                      <>
                        <button className="btn btn-normal btn-sm" onClick={() => setConfirmCancel(true)}>{I.stop}Cancel run</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setConfirmKill(true)} title="Forcibly terminate this run and kill the terraform process">{I.stop}Force kill</button>
                      </>
                    ) : (
                      <>
                        {onApplyPlan && run.request?.command === 'plan' && run.status === 'success' && run.savedPlanReady && (
                          <button className="btn btn-primary btn-sm" onClick={() => setConfirmApplyPlan(true)}>{I.check}Apply reviewed plan</button>
                        )}
                        {onRerun && fail > 0 && (
                      <button className="btn btn-danger-outline btn-sm" onClick={retryFailed} title={`Re-run ${fail} failed target${fail === 1 ? '' : 's'}`}>
                        {I.retry}Retry failed
                      </button>
                    )}
                    {onRerun && <button className="btn btn-normal btn-sm" onClick={() => onRerun(run)}>{I.refresh}Re-run</button>}
                        {run.reportPath && (
                          <button className="btn btn-normal btn-sm" onClick={() => navigate({ id: 'report', name: run.reportPath! })}>{I.report}View report</button>
                        )}
                      </>
                    )}
                  </div>
                  <DockToggle dock={dock} onDockChange={onDockChange} />
                </div>
              </div>

              <div className="sp-body">
                <div className="meta-strip">
                  <MetaItem k="Command"><span className={`badge ${cmdBadgeClass(command)}`}>{command}</span></MetaItem>
                  <MetaItem k="Mode">
                    <span className={`mode-cell ${mode === 'parallel' ? 'par' : ''}`} style={{ fontWeight: 600 }}>
                      {mode === 'parallel' ? I.par : I.seq}{mode === 'parallel' ? 'Parallel' : 'Promotion'}
                    </span>
                  </MetaItem>
                  <MetaItem k="Repo" mono>{run.request?.repo || run.repo || '—'}</MetaItem>
                  <MetaItem k="Branch"><span className="branch-cell">{I.git}{run.gitBranch || '—'}</span></MetaItem>
                  <MetaItem k="Targets">{String(effectiveTargetStatuses.length || envSections.length || 1)}</MetaItem>
                  <MetaItem k="Started">{relTime(run.startedAt)}</MetaItem>
                  <MetaItem k="Duration">{run.status === 'running' ? 'running…' : duration(run.startedAt, run.finishedAt)}</MetaItem>
                </div>

                <div className="progress-row">
                  <div className="progress-bar">
                    <i className="pb-done" style={{ width: `${(done / total) * 100}%` }} />
                    <i className="pb-fail" style={{ width: `${(fail / total) * 100}%` }} />
                    <i className="pb-run" style={{ width: `${(displayRunn / total) * 100}%` }} />
                  </div>
                  <span className="progress-meta">
                    {done}/{effectiveTargetStatuses.length || 1} complete{fail ? ` · ${fail} failed` : ''}{runn ? ` · ${runn} running` : ''}
                  </span>
                </div>
                <div className="target-dots">
                  {effectiveTargetStatuses.map((t, i) => {
                    const cls = t.status === 'running' ? 'run' : t.status;
                    return (
                      <span key={t.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        {i > 0 && mode === 'promotion' && <span className="seq-arrow">{I.arrow}</span>}
                        <span className={`tdot ${cls}`}><span className="d" />{t.name}</span>
                      </span>
                    );
                  })}
                </div>

                <div className="sp-filter-bar">
                  <div className="sp-search-wrap">
                    <span className="sp-search-icon">{I.search}</span>
                    <input
                      ref={spSearchInputRef}
                      className="sp-search-input"
                      type="text"
                      placeholder="Filter output…"
                      value={spSearch}
                      onChange={e => setSpSearch(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Escape') setSpSearch(''); }}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    {spSearch && (
                      <button className="sp-search-clear" onClick={() => { setSpSearch(''); spSearchInputRef.current?.focus(); }} aria-label="Clear">
                        {I.close}
                      </button>
                    )}
                  </div>
                  <div className="sp-filter-pills">
                    {(['all', 'changes', 'errors', 'plan'] as FsFilter[]).map(f => (
                      <button
                        key={f}
                        className={`sp-filter-pill${spFilter === f ? ' active' : ''}`}
                        onClick={() => setSpFilter(f)}
                      >
                        {f === 'all' ? 'Raw' : f === 'changes' ? 'Changes' : f === 'errors' ? 'Errors' : 'Summary'}
                      </button>
                    ))}
                  </div>
                </div>

                {output}

                {approvalBar('sp')}
              </div>
            </>
          )}
        </div>
      </div>

      {fullscreen && (
        <div className="fs-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeFullscreen(); }}>
          <div className="fs-modal">
            <div className="fs-header">
              <div className="fs-header-left">
                <div className="fs-dots"><span /><span /><span /></div>
                <span className="fs-title">{fullscreen.env}{fullscreen.profile ? `  ·  ${fullscreen.profile}` : ''}</span>
              </div>
              <div className="fs-header-right">
                <span className="fs-stats">{fsStats}</span>
                <div className="fs-actions">
                  <button className="fs-action-btn" title="Copy output" onClick={onCopy}>{I.copy}Copy</button>
                  <button className="fs-action-btn" title="Download output" onClick={onDownload}>{I.download}Download</button>
                  <button
                    className={`fs-action-btn${fsWrap ? ' active' : ''}`}
                    title={fsWrap ? 'Unwrap lines' : 'Wrap lines'}
                    onClick={() => setFsWrap(v => !v)}
                  >{fsWrap ? I.wrap : I.nowrap}{fsWrap ? 'Wrap' : 'Unwrap'}</button>
                </div>
                <div className="fs-divider" />
                <button className="fs-close" aria-label="Close fullscreen" onClick={closeFullscreen}>{I.close}</button>
              </div>
            </div>
            <div className="fs-search-bar">
              <div className="fs-search-wrap">
                <span className="fs-search-icon">{I.search}</span>
                <input
                  ref={fsSearchInputRef}
                  className="fs-search-input"
                  type="text"
                  placeholder="Search output… (Ctrl+F)"
                  value={fsSearch}
                  onChange={e => setFsSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setFsSearch(''); } }}
                  spellCheck={false}
                  autoComplete="off"
                />
                {fsSearch && (
                  <button className="fs-search-clear" onClick={() => { setFsSearch(''); fsSearchInputRef.current?.focus(); }} aria-label="Clear search">
                    {I.close}
                  </button>
                )}
              </div>
              {(fsSearch.trim() || fsFilter !== 'all') && (
                <span className="fs-match-count">
                  {fsFilter === 'changes'
                    ? (() => { const n = parseResourceChanges(fsLines).length; return `${n} resource${n === 1 ? '' : 's'}`; })()
                    : `${fsDisplayLines.length} ${fsDisplayLines.length === 1 ? 'line' : 'lines'}`}
                </span>
              )}
              <div className="fs-filter-sep" />
              <div className="fs-filter-pills">
                {(['all', 'changes', 'errors', 'plan'] as FsFilter[]).map(f => (
                  <button
                    key={f}
                    className={`fs-filter-pill${fsFilter === f ? ' active' : ''}`}
                    onClick={() => setFsFilter(f)}
                  >
                    {f === 'all' ? 'Raw' : f === 'changes' ? 'Changes' : f === 'errors' ? 'Errors' : 'Summary'}
                  </button>
                ))}
              </div>
            </div>
            {fsFilter === 'changes'
              ? <div className="fs-body rct-wrap"><ResourceChangeTable lines={fsLines} search={fsSearch} {...rctProps('fs')} /></div>
              : <TerminalBody
                  className="tc-body fs-body"
                  lines={fsDisplayLines}
                  innerRef={fsBodyRef}
                  autoScroll={!fsSearch && fsFilter === 'all'}
                  style={fsWrap ? undefined : { whiteSpace: 'pre', wordBreak: 'normal', overflowX: 'auto' }}
                />}
            {approvalBar('fs')}
          </div>
        </div>
      )}
    </>
  );
}

function DockToggle({ dock, onDockChange }: { dock: Dock; onDockChange: (d: Dock) => void }) {
  return (
    <div className="dock-toggle" title="Split panel position">
      <button className={dock === 'side' ? 'on' : ''} title="Dock to side" onClick={() => onDockChange('side')}>{I.dockSide}</button>
      <button className={dock === 'bottom' ? 'on' : ''} title="Dock to bottom" onClick={() => onDockChange('bottom')}>{I.dockBottom}</button>
    </div>
  );
}

function MetaItem({ k, mono, children }: { k: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div className="meta-item">
      <span className="k">{k}</span>
      <span className={`v${mono ? ' mono' : ''}`}>{children}</span>
    </div>
  );
}
