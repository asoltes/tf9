import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api, graphApi, repoGit } from '../api';
import { setPendingReconcileChat } from '../lib/pendingChat';
import { useNav } from '../nav';
import { useToast } from './ToastProvider';
import { envColor } from '../lib/colors';
import { commandStyleClass } from '../lib/commandStyle';
import { ticketURL } from '../lib/ticketing';
import {
  parseEnvSections,
  parseCounts,
  planHasOutputChanges,
  deriveTargetStatuses,
  sectionTerminalStatus,
  isParallelStream,
  stripAnsi,
  updateApprovalGate,
  approvalGateVisible,
  APPROVAL_SENTINEL,
  APPROVAL_CLEAR_SENTINEL,
  type EnvSection,
  type PlanCounts,
  type TargetState,
  type TargetStatus,
} from '../lib/runStatus';
import {
  parseResourceChanges,
  rctBadgeLabel,
  sortResourceChanges,
  type ResourceChange,
  type ResourceChangeSort,
} from '../lib/planChanges';
import TerminalBody, { renderLine, lineClass } from './Terminal';
import ConfirmModal from './ConfirmModal';
import RetryBranchModal from './RetryBranchModal';
import type { Run, RunStatus, WebSettings } from '../types';
import type { GraphDocument } from '../types';
import GraphView from './GraphView';

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


export function ResourceChangeTable({
  lines, search, expanded, onToggle, sort, onSortChange,
}: {
  lines: string[];
  search: string;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  sort: ResourceChangeSort;
  onSortChange: (sort: ResourceChangeSort) => void;
}) {
  const changes = useMemo(() => parseResourceChanges(lines), [lines]);
  const term = search.trim().toLowerCase();
  const filtered = sortResourceChanges(
    term ? changes.filter(c => c.resource.toLowerCase().includes(term)) : changes,
    sort,
  );
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
      <div className="rct-toolbar">
        <label>
          Sort
          <select value={sort} onChange={event => onSortChange(event.target.value as ResourceChangeSort)}>
            <option value="plan">Plan order</option>
            <option value="action">Action</option>
            <option value="resource">Resource A-Z</option>
          </select>
        </label>
      </div>
      <table className="rct">
        <thead><tr><th>Action</th><th>Resource</th><th /></tr></thead>
        <tbody>
          {filtered.flatMap(c => {
            const key = `${c.action}:${c.resource}`;
            const isOpen = expanded.has(key);
            const rows: React.ReactNode[] = [
              <tr
                key={`r:${key}`}
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
                <tr key={`e:${key}`} className="rct-expanded">
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
  skip: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></svg>,
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
  ai: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z" /><path d="M18.5 15.5 19 17l1.5.5L19 18l-.5 1.5L18 18l-1.5-.5L18 17z" /></svg>,
};

type Dock = 'bottom' | 'side';
type ParallelView = 'grid' | 'tabs' | 'merged';
const RERUN_COMMANDS = ['init', 'plan', 'apply', 'destroy', 'auto'] as const;

function statusClass(s: RunStatus): string { return s; }
function statusIcon(s: RunStatus): React.ReactNode {
  if (s === 'running') return <span className="spin" />;
  if (s === 'success') return I.checkc;
  if (s === 'partial_success') return I.warn;
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

function countdownLabel(deadline: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
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
  if (runStatus === 'partial_success') return <span className="tc-state partial_success">PARTIAL SUCCESS</span>;
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

interface FullscreenState { env: string; profile: string; sectionName: string | null; follow?: boolean; }

interface Props {
  run: Run | null;
  lines: string[];
  dock: Dock;
  onDockChange: (d: Dock) => void;
  onStatusChange?: () => void;
  onRerun?: (run: Run) => void;
  onApplyPlan?: (run: Run) => void;
  ticketingUrl?: string | null;
}

export default function RunSplitPanel({ run, lines, dock, onDockChange, onStatusChange, onRerun, onApplyPlan, ticketingUrl }: Props) {
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
  const [panelView, setPanelView] = useState<'terminal' | 'graph'>('terminal');
  const [graphDoc, setGraphDoc] = useState<GraphDocument | null>(null);
  const [graphError, setGraphError] = useState('');
  // Changes-filter resource expansion, keyed per table id so it survives the
  // single→promotion/parallel branch switch that remounts ResourceChangeTable.
  const [rctExpanded, setRctExpanded] = useState<Record<string, Set<string>>>({});
  const [rctSort, setRctSort] = useState<Record<string, ResourceChangeSort>>({});
  const spSearchInputRef = useRef<HTMLInputElement>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmApplyPlan, setConfirmApplyPlan] = useState(false);
  const [confirmKill, setConfirmKill] = useState(false);
  const [retryOpen, setRetryOpen] = useState(false);
  const [approvalPending, setApprovalPending] = useState(false);
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [destroyApprovalConfirm, setDestroyApprovalConfirm] = useState(false);
  const [approvalDeadline, setApprovalDeadline] = useState<number | null>(null);
  const [approvalTimeoutSeconds, setApprovalTimeoutSeconds] = useState(300);
  const [clock, setClock] = useState(() => Date.now());
  const [reconcileLoading, setReconcileLoading] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const fsBodyRef = useRef<HTMLDivElement>(null);
  const rerunMenuRef = useRef<HTMLDetailsElement>(null);
  // Edge-triggered approval gate state (single source of truth in runStatus.ts).
  // Held in a ref so re-renders driven by streaming output don't re-open a gate
  // the user already answered.
  const gateRef = useRef<{ pending: boolean; seenCount: number; clearCount: number; runId: string | undefined }>(
    { pending: false, seenCount: 0, clearCount: 0, runId: undefined },
  );
  // How many approval prompts the user has already answered. The gate shows only
  // when a NEW prompt arrives beyond this — so once you click Approve/Deny it can
  // never re-appear for the same prompt, no matter what streams in afterward.
  const answeredSeenRef = useRef(0);

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

  useEffect(() => {
    api.get<WebSettings>('/api/web/settings')
      .then(settings => setApprovalTimeoutSeconds(settings.approvalTimeoutSeconds))
      .catch(() => {});
  }, []);

  const savedPlanDeadline = run?.savedPlanExpiresAt ? new Date(run.savedPlanExpiresAt).getTime() : null;
  const reviewedPlanAvailable = !!run
    && run.request?.command === 'plan'
    && run.status === 'success'
    && run.savedPlanReady
    && (savedPlanDeadline === null || savedPlanDeadline > clock);
  const timerActive = approvalPending || (savedPlanDeadline !== null && savedPlanDeadline > clock);
  useEffect(() => {
    if (!timerActive) return;
    const timer = window.setInterval(() => setClock(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [timerActive]);

  useEffect(() => {
    if (!reviewedPlanAvailable) setConfirmApplyPlan(false);
  }, [reviewedPlanAvailable]);

  useEffect(() => {
    function closeRerunMenu(event: MouseEvent | KeyboardEvent) {
      const menu = rerunMenuRef.current;
      if (!menu?.open) return;
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        menu.removeAttribute('open');
        return;
      }
      if (event instanceof MouseEvent && !menu.contains(event.target as Node)) {
        menu.removeAttribute('open');
      }
    }
    document.addEventListener('mousedown', closeRerunMenu);
    document.addEventListener('keydown', closeRerunMenu);
    return () => {
      document.removeEventListener('mousedown', closeRerunMenu);
      document.removeEventListener('keydown', closeRerunMenu);
    };
  }, []);

  // Reset view-related state when the selected run changes.
  const runId = run?.id ?? null;
  useEffect(() => {
    setParallelView('grid');
    setActiveTab('');
    setCollapsed({});
    setFullscreen(null);
    setSpSearch('');
    setSpFilter('all');
    setPanelView('terminal');
    setGraphDoc(null);
    setGraphError('');
    setRctExpanded({});
    setApprovalDeadline(null);
  }, [runId]);

  useEffect(() => {
    if (!run?.hasGraph && panelView === 'graph') {
      setPanelView('terminal');
    }
  }, [run?.hasGraph, panelView]);

  useEffect(() => {
    if (!runId || panelView !== 'graph') return;
    let active = true;
    const load = () => graphApi.get(runId)
      .then(doc => { if (active) { setGraphDoc(doc); setGraphError(''); } })
      .catch(e => { if (active) { setGraphDoc(null); setGraphError(e instanceof Error ? e.message : 'Graph unavailable.'); } });
    load();
    const timer = run?.status === 'running' ? window.setInterval(load, 1200) : undefined;
    return () => { active = false; if (timer) window.clearInterval(timer); };
  }, [runId, panelView, run?.status]);

  // Props that make ResourceChangeTable a controlled component for a given table.
  const rctProps = useCallback((tableId: string) => ({
    expanded: rctExpanded[tableId] ?? new Set<string>(),
    onToggle: (key: string) => setRctExpanded(previous => {
      const next = new Set(previous[tableId] ?? []);
      if (next.has(key)) next.delete(key); else next.add(key);
      return { ...previous, [tableId]: next };
    }),
    sort: rctSort[tableId] ?? 'plan',
    onSortChange: (sort: ResourceChangeSort) => setRctSort(previous => ({ ...previous, [tableId]: sort })),
  }), [rctExpanded, rctSort]);

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
        t.status === 'done' || t.status === 'skipped'
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
      if (term === 'skipped') return { name: s.name, status: 'skipped' as TargetStatus };
      if (term === 'done') return { name: s.name, status: 'done' as TargetStatus };
      // Sequential within a stage: only the last started section is running.
      const isLast = i === sections.length - 1;
      return { name: s.name, status: (isLast ? 'running' : 'done') as TargetStatus };
    });
    const seenByName = new Map(seen.map(t => [t.name, t]));
    const raw = expectedTargets.map(name => seenByName.get(name) ?? { name, status: 'queued' as TargetStatus });
    return run && run.status !== 'running'
      ? raw.map(t => t.status === 'done' || t.status === 'skipped' ? t : { ...t, status: (run.status === 'success' ? 'done' : run.status === 'denied' ? 'denied' : 'fail') as TargetStatus })
      : raw;
  })();

  // Use stage-aware statuses for auto runs everywhere (progress bar, dots, retry).
  const effectiveTargetStatuses = isAutoRun ? autoTargetStatuses : targetStatuses;

  // The section terraform is actively working (running / blocked on approval).
  // For auto runs this lives in the latest stage group; otherwise it's the live
  // matching section. Used so fullscreen can follow the run across stages.
  const sectionKey = (s: EnvSection) => (s.stage ? `${s.stage}:${s.name}` : s.name);
  const activeSection: EnvSection | undefined = (() => {
    const running = effectiveTargetStatuses.find(t => t.status === 'running');
    if (!running) return undefined;
    const pool = isAutoRun && stageGroups.length > 0
      ? stageGroups[stageGroups.length - 1].sections
      : envSections;
    return pool.find(s => s.name === running.name);
  })();
  const activeSectionKey = activeSection ? sectionKey(activeSection) : null;

  // While following the live run in fullscreen, advance to whichever section is
  // now active. This fixes the case where approving a stage left the fullscreen
  // terminal stuck on the finished stage instead of showing the next one.
  useEffect(() => {
    if (!fullscreen || !fullscreen.follow || !activeSection || !activeSectionKey) return;
    if (fullscreen.sectionName === null) return; // raw/combined view — leave as is
    if (fullscreen.sectionName === activeSectionKey) return;
    setFullscreen({
      env: activeSection.name,
      profile: activeSection.profile,
      sectionName: activeSectionKey,
      follow: true,
    });
  }, [activeSectionKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
      gateRef.current = { ...gateRef.current, pending: false };
      setApprovalPending(false);
      toast('Run force-killed', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to force-kill run', 'error');
    }
    onStatusChange?.();
  }

  // ── Terraform interactive approval detection ─────────────────────────────
  // The runner emits APPROVAL_SENTINEL when terraform blocks on the prompt. Each
  // sentinel is one prompt; `seenCount` counts them. The gate is open only while
  // an *unanswered* prompt exists (seenCount > answeredSeen). Because answering
  // bumps answeredSeen to the current seenCount, no amount of streaming output
  // (or a stale run.awaitingInput from a lagging poll) can re-open it — which is
  // what previously made the fullscreen bar require a second click to dismiss.
  useEffect(() => {
    const prev = gateRef.current;
    const next = updateApprovalGate(prev, lines, run?.id);
    if (next.runId !== prev.runId) {
      answeredSeenRef.current = 0; // new run → forget answers
      setDestroyApprovalConfirm(false);
    }
    gateRef.current = next;
    const visible = approvalGateVisible(next, answeredSeenRef.current);
    setApprovalPending(visible);
    if (visible && (next.seenCount > prev.seenCount || next.runId !== prev.runId)) {
      setDestroyApprovalConfirm(false);
      const serverDeadline = run?.approvalExpiresAt ? new Date(run.approvalExpiresAt).getTime() : NaN;
      setApprovalDeadline(Number.isFinite(serverDeadline)
        ? serverDeadline
        : Date.now() + approvalTimeoutSeconds * 1000);
    }
  }, [lines, run?.id, run?.approvalExpiresAt, approvalTimeoutSeconds]);

  useEffect(() => {
    if (approvalPending && approvalDeadline === null) {
      setApprovalDeadline(Date.now() + approvalTimeoutSeconds * 1000);
    }
  }, [approvalPending, approvalDeadline, approvalTimeoutSeconds]);

  useEffect(() => {
    if (!approvalPending || !run?.approvalExpiresAt) return;
    const serverDeadline = new Date(run.approvalExpiresAt).getTime();
    if (Number.isFinite(serverDeadline)) setApprovalDeadline(serverDeadline);
  }, [approvalPending, run?.approvalExpiresAt]);

  useEffect(() => {
    if (!approvalPending || approvalDeadline === null || clock < approvalDeadline) return;
    gateRef.current = { ...gateRef.current, pending: false };
    setApprovalPending(false);
    setDestroyApprovalConfirm(false);
  }, [approvalPending, approvalDeadline, clock]);

  // Force-clear the gate when a run finishes (no more input possible).
  useEffect(() => {
    if (!run || run.status !== 'running') {
      gateRef.current = { ...gateRef.current, pending: false };
      setApprovalPending(false);
      setDestroyApprovalConfirm(false);
      setApprovalDeadline(null);
    }
  }, [run?.status]);

  async function sendApproval(value: string) {
    if (!run || approvalSubmitting) return;
    // Optimistically latch this prompt as answered and hide the gate *now*, so a
    // single click dismisses it immediately instead of waiting on the round-trip.
    answeredSeenRef.current = gateRef.current.seenCount;
    gateRef.current = { ...gateRef.current, pending: false };
    setApprovalPending(false);
    setDestroyApprovalConfirm(false);
    setApprovalDeadline(null);
    setApprovalSubmitting(true);
    try {
      await api.sendRunInput(run.id, value);
    } catch (e) {
      // 409 = run is no longer waiting (it moved on, finished, or was killed):
      // the gate is correctly closed, just resync. Any other error means the
      // input may not have landed — surface it and re-open so the user can retry.
      const msg = e instanceof Error ? e.message : 'Approval failed';
      toast(msg, 'error');
      if (!/409|no longer waiting|not waiting/i.test(msg)) {
        answeredSeenRef.current = Math.max(0, gateRef.current.seenCount - 1);
        gateRef.current = { ...gateRef.current, pending: true };
        setApprovalPending(true);
      }
      onStatusChange?.();
    } finally {
      setApprovalSubmitting(false);
    }
  }

  // Identify the target currently blocked on approval so the gate can name the
  // exact stage / environment / AWS profile being decided and the plan's blast
  // radius. The blocked target is the one still 'running'; in fullscreen we
  // prefer the section the user has open.
  function approvalContext(variant: 'sp' | 'fs'): {
    stage?: string; env: string; profile: string;
    counts?: PlanCounts; destructive: boolean;
  } {
    const running = effectiveTargetStatuses.find(t => t.status === 'running');
    const runningSection = running ? envSections.find(s => s.name === running.name) : undefined;
    let section = runningSection;
    let stage = runningSection?.stage;
    let env = runningSection?.name || run?.envFilter || '';
    let profile = runningSection?.profile || run?.request?.profile || '';
    if (variant === 'fs' && fullscreen) {
      const sec = envSections.find(s => {
        const key = s.stage ? `${s.stage}:${s.name}` : s.name;
        return key === fullscreen.sectionName || s.name === fullscreen.env;
      });
      section = sec ?? runningSection;
      stage = sec?.stage ?? runningSection?.stage;
      env = fullscreen.env || sec?.name || env;
      profile = fullscreen.profile || sec?.profile || profile;
    }
    const counts = section ? parseCounts(section.lines) : undefined;
    return { stage, env, profile, counts, destructive: command === 'destroy' };
  }

  // Inline terraform approval panel — rendered in the split panel body AND inside
  // the fullscreen terminal so the user can approve without leaving fullscreen.
  function approvalBar(variant: 'sp' | 'fs') {
    if (!approvalPending || run?.status !== 'running') return null;
    const ctx = approvalContext(variant);
    const c = ctx.counts;
    const hasCounts = !!c && !c.noChanges && (c.add + c.change + c.destroy > 0);
    const verb = ctx.destructive ? 'destroy' : 'apply';
    return (
      <div
        className={`sp-approval-bar command-style ${commandStyleClass(verb)} ${ctx.destructive ? 'destructive' : 'apply'}${variant === 'fs' ? ' fs-approval-bar' : ''}${ctx.destructive && destroyApprovalConfirm ? ' final-confirm' : ''}`}
        role="alertdialog"
        aria-label={ctx.destructive && destroyApprovalConfirm ? 'Final Terraform destroy confirmation' : 'Terraform approval required'}
        aria-live="assertive"
      >
        <div className="sp-approval-main">
          <span className="sp-approval-icon">{ctx.destructive ? I.warn : I.checkc}</span>
          <div className="sp-approval-text">
            <div className="sp-approval-title">
              {ctx.destructive
                ? destroyApprovalConfirm ? 'Are you sure?' : 'Approval required'
                : 'Ready to apply'}
              <span className={`sp-approval-cmd${ctx.destructive ? ' bad' : ''}`}>{verb}</span>
              {approvalDeadline !== null && (
                <span className="sp-approval-countdown">Expires in {countdownLabel(approvalDeadline, clock)}</span>
              )}
            </div>
            <div className="sp-approval-sub">
              {ctx.destructive && destroyApprovalConfirm
                ? <>This permanently destroys the selected infrastructure{ctx.env ? <> in <strong>{ctx.env}</strong></> : null}. Terraform is still waiting for your final confirmation.</>
                : ctx.destructive
                  ? <>Review the plan below, then choose whether to destroy these resources{ctx.env ? <> in <strong>{ctx.env}</strong></> : null}.</>
                  : <>Review the plan below. Applying will make these changes{ctx.env ? <> to <strong>{ctx.env}</strong></> : null}.</>}
            </div>
            {(ctx.stage || ctx.env || ctx.profile || hasCounts) && (
              <div className="sp-approval-ctx">
                {ctx.stage && <span className="sp-approval-chip">Stage <strong>{ctx.stage}</strong></span>}
                {ctx.env && <span className="sp-approval-chip">Target <strong>{ctx.env}</strong></span>}
                {ctx.profile && <span className="sp-approval-chip">AWS profile <strong>{ctx.profile}</strong></span>}
                {hasCounts && (
                  <span className="sp-approval-chip plan">
                    <b className="g">+{c!.add}</b>
                    <b className="y">~{c!.change}</b>
                    <b className="r">-{c!.destroy}</b>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="sp-approval-actions">
          <button
            className="btn btn-normal btn-sm"
            disabled={approvalSubmitting}
            onClick={() => sendApproval('no')}
          >
            {ctx.destructive && destroyApprovalConfirm ? 'Cancel destroy' : ctx.destructive ? 'Deny' : 'Reject'}
          </button>
          <button
            className={`btn btn-sm command-action command-style ${commandStyleClass(verb)}`}
            disabled={approvalSubmitting}
            onClick={() => {
              if (ctx.destructive && !destroyApprovalConfirm) {
                setDestroyApprovalConfirm(true);
                return;
              }
              sendApproval('yes');
            }}
          >
            {approvalSubmitting
              ? 'Submitting…'
              : ctx.destructive
                ? destroyApprovalConfirm ? 'Destroy permanently' : 'Approve destroy'
                : 'Apply changes'}
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

  function rerunAs(nextCommand: string) {
    if (!run || !onRerun) return;
    if (nextCommand === command) {
      onRerun(run);
      return;
    }
    const sequential = nextCommand === 'apply' || nextCommand === 'destroy' || nextCommand === 'auto';
    onRerun({
      ...run,
      command: nextCommand,
      request: {
        ...run.request,
        command: nextCommand,
        extraArgs: [],
        parallel: sequential ? false : run.request.parallel,
        autoApprove: nextCommand === 'apply' || nextCommand === 'auto' ? run.request.autoApprove : false,
        planRunId: undefined,
        lockIds: undefined,
        importAddrs: undefined,
        resourceAddresses: nextCommand === 'plan' || nextCommand === 'apply'
          ? run.request.resourceAddresses
          : undefined,
      },
    });
  }

  // Hand off the output already on screen and navigate immediately. The
  // workspace loads remote git context after it mounts, keeping git fetch off
  // the navigation path.
  function reconcileWithAI(srcLines: string[] = displayLines) {
    const repoName = run?.request?.repo || run?.repo;
    if (!repoName || reconcileLoading) return;
    setReconcileLoading(true);
    setPendingReconcileChat(repoName, srcLines.join('\n'));
    navigate({ id: 'workspace', name: repoName });
  }

  // Small AI icon shown in a terminal card head once that session is inactive
  // (done / skipped / failed / denied). Reconciles against that session's output.
  // Only shown when reconciling is meaningful: the session errored/failed, or it
  // produced changes. A clean success with no changes hides it.
  function reconcileHeadBtn(srcLines: string[], status: TargetStatus | undefined) {
    if (!(run?.request?.repo || run?.repo)) return null;
    const counts = parseCounts(srcLines);
    const hasChanges = counts.add + counts.change + counts.destroy > 0 || planHasOutputChanges(srcLines);
    const errored = status === 'fail' || status === 'denied';
    if (!hasChanges && !errored) return null;
    return (
      <button
        className={`tc-reconcile command-style ${commandStyleClass(command)}${reconcileLoading ? ' loading' : ''}`}
        title="Reconcile with AI"
        aria-label="Reconcile with AI"
        onClick={(e) => { e.stopPropagation(); reconcileWithAI(srcLines); }}
        onPointerEnter={() => { void import('../pages/RepositoryWorkspace'); }}
        onFocus={() => { void import('../pages/RepositoryWorkspace'); }}
        disabled={reconcileLoading}
      >
        {I.ai}<span>Reconcile</span>
      </button>
    );
  }

  // Big circular FAB shown at the bottom-right of a terminal that is awaiting
  // input/approval. Reconciles against that session's output.
  function reconcileFab(srcLines: string[]) {
    if (!(run?.request?.repo || run?.repo)) return null;
    return (
      <button
        className={`sp-reconcile-ai command-style ${commandStyleClass(command)}${reconcileLoading ? ' loading' : ''}`}
        title="Reconcile with AI"
        aria-label="Reconcile with AI"
        onClick={(e) => { e.stopPropagation(); reconcileWithAI(srcLines); }}
        onPointerEnter={() => { void import('../pages/RepositoryWorkspace'); }}
        onFocus={() => { void import('../pages/RepositoryWorkspace'); }}
        disabled={reconcileLoading}
      >
        {I.ai}
      </button>
    );
  }

  function openFullscreen(env: string, profile: string, sectionName: string | null) {
    // Follow the live run only when opening on the section that is currently
    // active — so approving a stage advances the view to the next one. Opening a
    // finished section (to review it) stays put.
    const follow = run?.status === 'running' && sectionName !== null && sectionName === activeSectionKey;
    setFullscreen({ env, profile, sectionName, follow });
  }

  // ── Empty state rendered inline below (same root element as non-empty) ──

  // ── Card head (grid / tabs) ──────────────────────────────────────────────
  function cardHead(section: EnvSection, status: TargetStatus | undefined) {
    const counts = parseCounts(section.lines);
    const sd = status === 'running' ? 'run' : status ?? 'queued';
    const label = status === 'running' ? 'running' : status === 'done' ? 'done' : status === 'skipped' ? 'skipped' : status === 'fail' ? 'failed' : status === 'denied' ? 'denied' : 'queued';
    return (
      <>
        <span className={`sd ${sd}`} />
        <span className="en">{section.name}</span>
        <span className="pr">{section.profile}</span>
        <span className="sp" />
        {(status === 'done' || status === 'skipped') && <StatsChips counts={counts} />}
        {(status === 'done' || status === 'skipped') && <DistBar counts={counts} />}
        <span className={`tc-state ${sd}`}>{label}</span>
        {status && status !== 'running' && status !== 'queued' && reconcileHeadBtn(section.lines, status)}
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
            {runStatus && runStatus !== 'running' && reconcileHeadBtn(displayLines, status)}
            <button className="tc-exp" title="Fullscreen"
              onClick={(e) => { e.stopPropagation(); openFullscreen(envName, run?.request?.profile || '', null); }}>
              {I.expand}
            </button>
          </div>
          {spFilter === 'changes'
            ? <ResourceChangeTable lines={displayLines} search={spSearch} {...rctProps('single')} />
            : <TerminalBody lines={applyFilter(displayLines, spFilter, spSearch)} autoScroll={!spSearch && spFilter === 'all'} />}
          {approvalPending && runStatus === 'running' && reconcileFab(displayLines)}
        </div>
      </div>
    );
  } else if (mode === 'parallel') {
    const head = (
      <div className="out-head">
        <div className="ot">
          <span className="mode-cell" style={{ fontWeight: 700 }}>{I.par}Parallel</span>
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
                {approvalPending && status === 'running' && reconcileFab(s.lines)}
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
              {approvalPending && activeStatus === 'running' && reconcileFab(active.lines)}
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
      const stateCls = status === 'running' ? 'run' : status === 'done' ? 'done' : status === 'skipped' ? 'skipped' : status === 'fail' ? 'fail' : status === 'denied' ? 'denied' : 'queued';
      const defaultCollapsed = status !== 'running' && status !== 'fail' && status !== 'denied';
      const isCollapsed = colKey in collapsed ? collapsed[colKey] : defaultCollapsed;
      const step = status === 'done' ? I.check : status === 'skipped' ? I.skip : status === 'fail' ? '!' : status === 'denied' ? I.ban : i + 1;
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
                : status === 'skipped'
                  ? <span style={{ fontSize: '11.5px', color: 'var(--text-3)', fontWeight: 700 }}>SKIPPED</span>
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
            {status && status !== 'running' && status !== 'queued' && reconcileHeadBtn(s.lines, status)}
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
            {approvalPending && status === 'running' && reconcileFab(s.lines)}
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
  const done = effectiveTargetStatuses.filter(t => t.status === 'done' || t.status === 'skipped').length;
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
    if (run?.status === 'partial_success') return <span className="tc-state partial_success" style={{ fontSize: 12 }}>PARTIAL SUCCESS</span>;
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
                  <span className={`rstatus ${statusClass(run.status)}`}>{statusIcon(run.status)}{run.status === 'partial_success' ? 'Partial Success' : run.status}</span>
                </div>
                <div className="sp-actions">
                  <div className="sp-command-actions">
                    {run.status === 'running' ? (
                      <>
                        <button className="btn btn-normal btn-sm" onClick={() => setConfirmCancel(true)}>{I.stop}Cancel run</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setConfirmKill(true)} title="Forcibly terminate this run and kill the terraform process">{I.stop}Force kill</button>
                      </>
                    ) : (
                      <>
                        {onApplyPlan && reviewedPlanAvailable && (
                          <button className="btn btn-primary btn-sm" onClick={() => setConfirmApplyPlan(true)}>
                            {I.check}Apply reviewed plan
                            {savedPlanDeadline !== null && <small className="reviewed-plan-countdown">{countdownLabel(savedPlanDeadline, clock)}</small>}
                          </button>
                        )}
                        {onRerun && fail > 0 && (
                      <button className="btn btn-danger-outline btn-sm" onClick={retryFailed} title={`Re-run ${fail} failed target${fail === 1 ? '' : 's'}`}>
                        {I.retry}Retry failed
                      </button>
                    )}
                    {onRerun && (
                      <details className="rerun-menu" ref={rerunMenuRef}>
                        <summary className="btn btn-normal btn-sm">{I.refresh}Re-run{I.chev}</summary>
                        <div className="rerun-menu-pop">
                          {[command, ...RERUN_COMMANDS.filter(item => item !== command)].map(item => (
                            <button
                              key={item}
                              type="button"
                              onClick={() => {
                                rerunMenuRef.current?.removeAttribute('open');
                                rerunAs(item);
                              }}
                            >
                              <span>Run <span className={`badge command-style ${commandStyleClass(item)}`}>{item}</span></span>
                              {item === command && <small>same command</small>}
                            </button>
                          ))}
                        </div>
                      </details>
                    )}
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
                  <MetaItem k="Command"><span className={`badge command-style ${commandStyleClass(command)}`}>{command}</span></MetaItem>
                  <MetaItem k="Mode">
                    <span className={`mode-cell ${mode === 'parallel' ? 'par' : ''}`} style={{ fontWeight: 600 }}>
                      {mode === 'parallel' ? I.par : I.seq}{mode === 'parallel' ? 'Parallel' : 'Promotion'}
                    </span>
                  </MetaItem>
                  <MetaItem k="Repo" mono>{run.request?.repo || run.repo || '—'}</MetaItem>
                  {run.request?.ticket && (
                    <MetaItem k="Ticket">
                      {ticketURL(ticketingUrl, run.request.ticket)
                        ? <a href={ticketURL(ticketingUrl, run.request.ticket)!} target="_blank" rel="noreferrer" className="mono">{run.request.ticket}</a>
                        : <span className="mono">{run.request.ticket}</span>}
                    </MetaItem>
                  )}
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

                <div className="sp-view-tabs">
                  <button className={panelView === 'terminal' ? 'active' : ''} onClick={() => setPanelView('terminal')}>Terminal</button>
                  {run.hasGraph && <button className={panelView === 'graph' ? 'active' : ''} onClick={() => setPanelView('graph')}>Graph</button>}
                </div>

                {panelView === 'terminal' ? (
                  <>
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
                  </>
                ) : graphDoc ? (
                  <GraphView document={graphDoc} compact onOpenFullPage={() => navigate({ id: 'graph', runId: run.id })} />
                ) : (
                  <div className="sp-graph-empty">{graphError || 'Loading graph…'}</div>
                )}
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
                {fullscreen.follow && run?.status === 'running' && (
                  <span className="fs-follow" title="Following the active stage — advances automatically as the run progresses">
                    <i /> Following live
                  </span>
                )}
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
                  {(run?.request?.repo || run?.repo) && (
                    <button className={`fs-action-btn fs-reconcile command-style ${commandStyleClass(command)}${reconcileLoading ? ' loading' : ''}`}
                      title="Reconcile with AI"
                      onClick={() => reconcileWithAI(fsLines)}
                      onPointerEnter={() => { void import('../pages/RepositoryWorkspace'); }}
                      disabled={reconcileLoading}>
                      {I.ai}Reconcile
                    </button>
                  )}
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
