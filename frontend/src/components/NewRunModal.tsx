import { useState, useEffect, useRef, useCallback } from 'react';
import { api, parallelWorkersApi, repoGit } from '../api';
import type { Repo, Paginated, GitChangedFile, ReconcileStatus, WebSettings } from '../types';
import { useToast } from './ToastProvider';
import { useNav } from '../nav';
import {
  PRIMARY_COMMANDS,
  MORE_COMMANDS,
  RUN_COMMAND_INFO,
  normalizeCommand,
  deriveGroups,
  buildLockIds,
  type RawTarget,
} from '../lib/runPreview';
import { commandStyleClass } from '../lib/commandStyle';
import { ticketURL } from '../lib/ticketing';
import './NewRunModal.css';

// ── Inline icons (stroke=currentColor), ported verbatim from run.js `I` map ──
const I = {
  plan: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  apply: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4L19 6" /></svg>,
  destroy: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>,
  init: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12l4-4m-4 4l-4-4" /><path d="M4 21h16" /></svg>,
  auto: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 8 8 12 4 16"/><polyline points="10 8 14 12 10 16"/><polyline points="16 8 20 12 16 16"/></svg>,
  folder: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>,
  key: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.5 12.5 7.5-7.5M16 5l3 3" /></svg>,
  arrow: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
  chev: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>,
  chevR: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>,
  copy: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>,
  info: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>,
  warn: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  seq: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="5" rx="1" /><rect x="4" y="16" width="16" height="5" rx="1" /><path d="M12 8v4m0 0-2-2m2 2 2-2" /></svg>,
  par: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="6" height="16" rx="1" /><rect x="15" y="4" width="6" height="16" rx="1" /></svg>,
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>,
  pull: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M4 21h16" /></svg>,
  refresh: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>,
};

const COMMON: { id: string; icon: keyof typeof I }[] = [
  { id: 'auto', icon: 'auto' },
  { id: 'init', icon: 'init' },
  { id: 'plan', icon: 'plan' },
  { id: 'apply', icon: 'apply' },
  { id: 'destroy', icon: 'destroy' },
];

type Mode = 'promotion' | 'parallel';

interface Target {
  name: string;
  dir: string;
  profile: string;
  prod: boolean;
  checked: boolean;
  lockId: string;
  importAddr: string;
  importId: string;
}
interface Group {
  key: string;
  collapsed: boolean;
  disabled: boolean;
  targets: Target[];
}

// envColor — ported verbatim from run.js (prototype palette).
function envColor(t: Target): string {
  if (t.prod) return '#d91515';
  const n = t.name.toLowerCase();
  if (/stag|pre/.test(n)) return '#8d6605';
  if (/global|shared|boot|s3|iam/.test(n)) return '#7d4bd1';
  return '#037f0c';
}

function xyClass(xy: string): string {
  if (xy === '??') return 'untracked';
  const x = xy[0];
  if (x === 'A') return 'added';
  if (x === 'D' || xy[1] === 'D') return 'deleted';
  if (x === 'R') return 'renamed';
  return 'modified';
}

interface RepoOverride { disabled?: boolean; group?: string }

const GROUP_OVR_KEY = 'tf9-group-overrides';

function readOverrides(): Record<string, RepoOverride> {
  try { return JSON.parse(localStorage.getItem('tf9-repo-overrides') || '{}'); }
  catch { return {}; }
}

function readGroupOverrides(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(GROUP_OVR_KEY) || '{}'); }
  catch { return {}; }
}

function saveGroupOverride(repoName: string, groupKey: string, disabled: boolean) {
  try {
    const d: Record<string, boolean> = readGroupOverrides();
    if (disabled) d[`${repoName}:${groupKey}`] = true;
    else delete d[`${repoName}:${groupKey}`];
    localStorage.setItem(GROUP_OVR_KEY, JSON.stringify(d));
  } catch { /* ignore */ }
}

/**
 * Builds the grouped, filtered target list from the raw repo config.
 * - Disabled targets (via tf9-repo-overrides) are removed.
 * - The `group` override moves a target into a different pipeline group.
 * - Disabled pipeline groups (via tf9-group-overrides) are shown dimmed with targets unchecked.
 * - Empty groups are hidden.
 * Group order follows first-appearance order.
 */
function buildGroups(repoName: string, raw: RawTarget[]): Group[] {
  const ovr = readOverrides();
  const grpOvr = readGroupOverrides();
  const adjusted: RawTarget[] = raw
    .filter(t => {
      const o = ovr[`${repoName}:${t.name}`];
      return !(o && o.disabled);
    })
    .map(t => {
      const o = ovr[`${repoName}:${t.name}`];
      return o && o.group && o.group.trim() ? { ...t, group: o.group } : t;
    });
  return deriveGroups(adjusted).map(g => {
    const disabled = !!grpOvr[`${repoName}:${g.group}`];
    return {
      key: g.group,
      collapsed: false,
      disabled,
      targets: g.targets.map(t => ({
        name: t.name,
        dir: t.directory,
        profile: t.aws_profile,
        prod: t.name.toLowerCase().includes('prod'),
        checked: !disabled,
        lockId: '',
        importAddr: '',
        importId: '',
      })),
    };
  });
}

interface RepoStatus { branch: string; behind: number; hasRemote: boolean; changedFiles: GitChangedFile[] }

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onCreated: (runId: string) => void;
}

export default function NewRunModal({ visible, onDismiss, onCreated }: Props) {
  const toast = useToast();
  const { navigate } = useNav();
  const onCreatedRef = useRef(onCreated);
  useEffect(() => { onCreatedRef.current = onCreated; }, [onCreated]);

  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoIdx, setRepoIdx] = useState(0);
  const [cmd, setCmd] = useState('auto');
  const [mode, setMode] = useState<Mode>('promotion');
  const [autoApprove, setAutoApprove] = useState(false);
  const [profile, setProfile] = useState('');
  const [extra, setExtra] = useState('');
  const [resourceAddresses, setResourceAddresses] = useState<string[]>(['']);
  const [advOpen, setAdvOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [savedPlanApply, setSavedPlanApply] = useState(false);
  const [parallelWorkers, setParallelWorkers] = useState(0);
  const [ticket, setTicket] = useState('');
  const [ticketingUrl, setTicketingUrl] = useState<string | null>(null);

  const [branches, setBranches] = useState<string[]>([]);
  const [repoStatus, setRepoStatus] = useState<RepoStatus | null>(null);
  const [reconcile, setReconcile] = useState<ReconcileStatus | null>(null);
  const [pulling, setPulling] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [pendingBranch, setPendingBranch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Drag state for within-group target reordering. MUST be declared before the
  // `if (!visible) return null` early return below — otherwise the hook count
  // differs between the hidden and visible renders (React error #310).
  const dragRef = useRef<{ gi: number; pos: number } | null>(null);
  const groupDragRef = useRef<number | null>(null);

  const repo = repos[repoIdx];
  const repoName = repo?.name ?? '';

  const isApply = cmd === 'apply';
  const isDestroy = cmd === 'destroy';
  const isForceUnlock = cmd === 'force-unlock';
  const isImport = cmd === 'import';
  const isTaintCommand = cmd === 'taint' || cmd === 'untaint';
  const supportsResourceTargets = cmd === 'plan' || cmd === 'apply';
  const isAuto = cmd === 'auto';
  const lockSequential = isApply || isDestroy || isAuto;
  const isMore = !PRIMARY_COMMANDS.includes(cmd as typeof PRIMARY_COMMANDS[number]);

  // ── load targets/branches/status for the selected repo ────────────────────
  const loadRepoData = useCallback((name: string) => {
    setGroups([]);
    setBranches([]);
    setRepoStatus(null);
    setReconcile(null);
    if (!name) return;
    api.get<{ targets: RawTarget[] }>(`/api/repos/${encodeURIComponent(name)}/config`)
      .then(cfg => setGroups(buildGroups(name, cfg?.targets ?? [])))
      .catch(() => setGroups([]));
    repoGit.branches(name).then(setBranches).catch(() => setBranches([]));
    repoGit.status(name).then(setRepoStatus).catch(() => setRepoStatus(null));
    repoGit.reconcile(name).then(setReconcile).catch(() => setReconcile(null));
  }, []);

  // Load repo list when the modal opens; reset transient state.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setConfirm(false);
    setError('');
    setTicket('');
    setResourceAddresses(['']);
    api.get<Paginated<Repo>>('/api/repos')
      .then(res => res?.items ?? [])
      .catch(() => [] as Repo[])
      .then(list => {
        if (cancelled) return;
        const enabled = (list ?? []).filter((r: Repo) => !r.disabled);
        setRepos(enabled);
        setRepoIdx(0);
        if (enabled.length > 0) loadRepoData(enabled[0].name);
      });
    return () => { cancelled = true; };
  }, [visible, loadRepoData]);


  useEffect(() => {
    if (!visible) return;
    api.get<WebSettings>('/api/web/settings')
      .then(s => {
        const enabled = !!s.savedPlanApply;
        setSavedPlanApply(enabled);
        setTicketingUrl(s.ticketingUrl);
        if (enabled) setCmd(current => current === 'apply' ? 'plan' : current);
      })
      .catch(() => {
        setSavedPlanApply(false);
        setTicketingUrl(null);
      });
    parallelWorkersApi.get().then(r => setParallelWorkers(r.workers ?? 0)).catch(() => setParallelWorkers(0));
  }, [visible]);

  if (!visible) return null;

  // ── derived ───────────────────────────────────────────────────────────────
  const totalTargets = groups.reduce((n, g) => n + g.targets.length, 0);
  const checked: Target[] = groups.flatMap(g => g.disabled ? [] : g.targets.filter(t => t.checked));
  const normalizedResourceAddresses = resourceAddresses.map(address => address.trim()).filter(Boolean);
  const resourceAddressMissing = isTaintCommand && normalizedResourceAddresses.length !== 1;
  const seq = mode === 'promotion';
  const branch = repoStatus?.branch ?? '';

  // ── mutators ────────────────────────────────────────────────────────────
  function onSetCmd(id: string) {
    if (savedPlanApply && id === 'apply') {
      setError('Saved-plan apply is enabled. Run Plan, review its output, then use Apply reviewed plan from the run details.');
      return;
    }
    setError('');
    setCmd(id);
    if (id === 'taint' || id === 'untaint') {
      setResourceAddresses(prev => [prev[0] ?? '']);
    }
    if (id === 'apply' || id === 'destroy' || id === 'auto') setMode('promotion');
    if (id === 'init' || id === 'plan') setMode('parallel');
    if (id !== 'apply' && id !== 'auto') setAutoApprove(false);
    setConfirm(false);
  }
  function onSetMode(m: Mode) {
    if (m === 'parallel' && lockSequential) return;
    setMode(m);
    setConfirm(false);
  }
  function onSelectRepo(idx: number) {
    setRepoIdx(idx);
    setConfirm(false);
    setPendingBranch('');
    if (repos[idx]) loadRepoData(repos[idx].name);
  }
  function toggleTarget(gi: number, ti: number) {
    setGroups(prev => prev.map((g, j) => j === gi
      ? { ...g, targets: g.targets.map((t, k) => k === ti ? { ...t, checked: !t.checked } : t) }
      : g));
    setConfirm(false);
  }
  function toggleGroup(gi: number) {
    setGroups(prev => prev.map((g, j) => {
      if (j !== gi) return g;
      const all = g.targets.every(t => t.checked);
      return { ...g, targets: g.targets.map(t => ({ ...t, checked: !all })) };
    }));
    setConfirm(false);
  }
  function toggleCollapse(gi: number) {
    setGroups(prev => prev.map((g, j) => j === gi ? { ...g, collapsed: !g.collapsed } : g));
  }
  function toggleGroupPipeline(gi: number) {
    const g = groups[gi];
    const newDisabled = !g.disabled;
    saveGroupOverride(repoName, g.key, newDisabled);
    setGroups(prev => prev.map((pg, j) => j !== gi ? pg : {
      ...pg,
      disabled: newDisabled,
      targets: pg.targets.map(t => ({ ...t, checked: !newDisabled })),
    }));
    setConfirm(false);
  }
  function setLockId(gi: number, ti: number, v: string) {
    setGroups(prev => prev.map((g, j) => j === gi
      ? { ...g, targets: g.targets.map((t, k) => k === ti ? { ...t, lockId: v } : t) }
      : g));
  }
  function setImportField(gi: number, ti: number, field: 'importAddr' | 'importId', v: string) {
    setGroups(prev => prev.map((g, j) => j === gi
      ? { ...g, targets: g.targets.map((t, k) => k === ti ? { ...t, [field]: v } : t) }
      : g));
  }
  function setResourceAddress(index: number, value: string) {
    setResourceAddresses(prev => prev.map((address, i) => i === index ? value : address));
    setConfirm(false);
  }
  function addResourceAddress() {
    setResourceAddresses(prev => [...prev, '']);
    setConfirm(false);
  }
  function removeResourceAddress(index: number) {
    setResourceAddresses(prev => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [''];
    });
    setConfirm(false);
  }
  function setAll(val: boolean) {
    setGroups(prev => prev.map(g => ({ ...g, targets: g.targets.map(t => ({ ...t, checked: val })) })));
    setConfirm(false);
  }
  function skipProd() {
    setGroups(prev => prev.map(g => ({ ...g, targets: g.targets.map(t => ({ ...t, checked: !t.prod })) })));
    setConfirm(false);
  }

  // ── drag within a group (vanilla pointer drag, ported from run.js) ────────
  function startDrag(e: React.PointerEvent, gi: number, ti: number) {
    e.preventDefault();
    dragRef.current = { gi, pos: ti };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onDrag);
    window.addEventListener('pointerup', endDrag);
  }
  function onDrag(e: PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const body = document.querySelector(`[data-body="${d.gi}"]`);
    if (!body) return;
    const rows = Array.from(body.querySelectorAll('.tgt'));
    let to = rows.length - 1;
    for (let i = 0; i < rows.length; i++) {
      const rc = rows[i].getBoundingClientRect();
      if (e.clientY < rc.top + rc.height / 2) { to = i; break; }
    }
    if (to !== d.pos) {
      const from = d.pos;
      d.pos = to;
      setGroups(prev => prev.map((g, j) => {
        if (j !== d.gi) return g;
        const arr = g.targets.slice();
        const [x] = arr.splice(from, 1);
        arr.splice(to, 0, x);
        return { ...g, targets: arr };
      }));
    }
  }
  function endDrag() {
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', onDrag);
    window.removeEventListener('pointerup', endDrag);
    dragRef.current = null;
  }

  // ── drag across groups (group-level reorder) ─────────────────────────────
  function startGroupDrag(e: React.PointerEvent, gi: number) {
    e.preventDefault();
    groupDragRef.current = gi;
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onGroupDrag);
    window.addEventListener('pointerup', endGroupDrag);
  }
  function onGroupDrag(e: PointerEvent) {
    const from = groupDragRef.current;
    if (from === null) return;
    const els = Array.from(document.querySelectorAll('.tgroup[data-gidx]')) as HTMLElement[];
    let to = els.length - 1;
    for (let i = 0; i < els.length; i++) {
      const rc = els[i].getBoundingClientRect();
      if (e.clientY < rc.top + rc.height / 2) { to = i; break; }
    }
    if (to !== from) {
      groupDragRef.current = to;
      setGroups(prev => {
        const arr = prev.slice();
        const [x] = arr.splice(from, 1);
        arr.splice(to, 0, x);
        return arr;
      });
    }
  }
  function endGroupDrag() {
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', onGroupDrag);
    window.removeEventListener('pointerup', endGroupDrag);
    groupDragRef.current = null;
  }

  // ── git pull ──────────────────────────────────────────────────────────────
  async function handlePull() {
    if (!repoName) return;
    setPulling(true);
    try {
      await repoGit.pull(repoName);
      const s = await repoGit.status(repoName).catch(() => null);
      setRepoStatus(s);
      toast('Pulled latest from origin', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Pull failed', 'error');
    } finally {
      setPulling(false);
    }
  }

  // ── git status refresh ───────────────────────────────────────────────────
  async function handleRefreshStatus() {
    if (!repoName || refreshing) return;
    setRefreshing(true);
    try {
      const [s, b] = await Promise.all([
        repoGit.status(repoName).catch(() => null),
        repoGit.branches(repoName).catch(() => null),
      ]);
      if (s) setRepoStatus(s);
      if (b) setBranches(b);
    } finally {
      setRefreshing(false);
    }
  }

  // ── git checkout ─────────────────────────────────────────────────────────
  async function handleCheckout(newBranch: string) {
    if (!repoName || newBranch === branch) return;
    setPendingBranch(newBranch);
    setCheckingOut(true);
    try {
      await repoGit.checkout(repoName, newBranch);
      // Optimistically commit the new branch immediately — don't wait for
      // the full status call (which does a git fetch and can be slow/fail).
      setRepoStatus(prev => ({
        branch: newBranch,
        behind: prev?.behind ?? 0,
        hasRemote: prev?.hasRemote ?? false,
        changedFiles: prev?.changedFiles ?? [],
      }));
      toast(`Checked out ${newBranch}`, 'success');
      // Refresh behind-count and changed-files in the background.
      repoGit.status(repoName).then(s => { if (s) setRepoStatus(s); }).catch(() => {});
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Checkout failed', 'error');
    } finally {
      setPendingBranch('');
      setCheckingOut(false);
    }
  }

  // ── CLI preview (token spans, matches run.js cliPreview) ──────────────────
  function cliTokens(): React.ReactNode[] {
    const positional = ['plan', 'apply', 'destroy'].includes(cmd);
    const out: React.ReactNode[] = [];
    let k = 0;
    const push = (cls: string, txt: string) => { out.push(<span key={k++} className={cls}>{txt}</span>); };

    if (cmd === 'auto') {
      const envF = checked.length && checked.length !== totalTargets
        ? checked.map(t => t.name).join(',') : null;
      const seg = (c: string) => {
        push('tok-cmd', `tf9 ${c}`);
        push('tok-flag', '-r'); push('tok-val', repoName);
        if (envF) { push('tok-flag', '--filter'); push('tok-val', envF); }
      };
      seg('init');
      out.push('&&');
      seg('plan');
      out.push('&&');
      seg('apply');
      if (autoApprove) push('tok-flag', '--auto-approve');
      return out.flatMap((node, i) => i === 0 ? [node] : [' ', node]);
    }

    push('tok-cmd', `tf9 ${cmd}`);
    if (checked.length && checked.length !== totalTargets) {
      const names = checked.map(t => t.name);
      if (positional) push('tok-val', names.join(' '));
      else { push('tok-flag', '--filter'); push('tok-val', names.join(',')); }
    }
    push('tok-flag', '-r');
    push('tok-val', repoName);
    if (mode === 'parallel') push('tok-flag', '--parallel');
    if (isApply && autoApprove) push('tok-flag', '--auto-approve');
    if (profile.trim()) { push('tok-flag', '--profile'); push('tok-val', profile.trim()); }
    if (extra.trim()) push('tok-val', extra.trim());
    if (supportsResourceTargets) {
      for (const address of normalizedResourceAddresses) {
        push('tok-flag', '--target');
        push('tok-val', address);
      }
    } else if (isTaintCommand && normalizedResourceAddresses[0]) {
      push('tok-val', normalizedResourceAddresses[0]);
    }
    if (isForceUnlock) {
      const lids = checked.filter(t => t.lockId && t.lockId.trim()).map(t => `${t.name}:${t.lockId.trim()}`);
      if (lids.length) { push('tok-flag', '--lock-ids'); push('tok-val', lids.join(',')); }
    }
    // interleave with spaces
    return out.flatMap((node, i) => i === 0 ? [node] : [' ', node]);
  }
  function plainCli(): string {
    const positional = ['plan', 'apply', 'destroy'].includes(cmd);

    if (cmd === 'auto') {
      const envF = checked.length && checked.length !== totalTargets
        ? ` --filter ${checked.map(t => t.name).join(',')}` : '';
      const aa = autoApprove ? ' --auto-approve' : '';
      return `tf9 init -r ${repoName}${envF} && tf9 plan -r ${repoName}${envF} && tf9 apply -r ${repoName}${envF}${aa}`;
    }

    const parts: string[] = [`tf9 ${cmd}`];
    if (checked.length && checked.length !== totalTargets) {
      const names = checked.map(t => t.name);
      parts.push(positional ? names.join(' ') : `--filter ${names.join(',')}`);
    }
    parts.push(`-r ${repoName}`);
    if (mode === 'parallel') parts.push('--parallel');
    if (isApply && autoApprove) parts.push('--auto-approve');
    if (profile.trim()) parts.push(`--profile ${profile.trim()}`);
    if (extra.trim()) parts.push(extra.trim());
    if (supportsResourceTargets) {
      for (const address of normalizedResourceAddresses) parts.push(`--target ${address}`);
    } else if (isTaintCommand && normalizedResourceAddresses[0]) {
      parts.push(normalizedResourceAddresses[0]);
    }
    if (isForceUnlock) {
      const lids = checked.filter(t => t.lockId && t.lockId.trim()).map(t => `${t.name}:${t.lockId.trim()}`);
      if (lids.length) parts.push(`--lock-ids ${lids.join(',')}`);
    }
    return parts.join(' ');
  }
  function copyCli() {
    const text = plainCli();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => toast('Command copied', 'success'), () => {});
    }
  }

  // ── run submission (real backend) ─────────────────────────────────────────
  function onRun() {
    if (checked.length === 0 || resourceAddressMissing) return;
    if (isDestroy || (isAuto && autoApprove) || mode === 'parallel' || isApply) {
      setConfirm(true);
    } else {
      doRun();
    }
  }

  async function doRun() {
    setConfirm(false);
    setError('');
    setSubmitting(true);
    const { command, leadingArgs } = normalizeCommand(cmd);
    const extraArr = extra.trim().split(/\s+/).filter(Boolean);
    const envFilter = checked.length === totalTargets ? '' : checked.map(t => t.name).join(',');
    const lockIds = isForceUnlock
      ? buildLockIds(checked.map(t => ({ name: t.name, lockId: t.lockId })))
      : undefined;
    const importAddrs = isImport
      ? Object.fromEntries(
          checked
            .filter(t => t.importAddr.trim() && t.importId.trim())
            .map(t => [t.name, { addr: t.importAddr.trim(), id: t.importId.trim() }])
        )
      : undefined;
    let runId: string | null = null;
    try {
      const res = await api.post<{ id: string }>('/api/runs', {
        command,
        repo: repoName,
        envFilter,
        profile: profile.trim(),
        extraArgs: [...leadingArgs, ...extraArr],
        ...((supportsResourceTargets || isTaintCommand) && normalizedResourceAddresses.length > 0
          ? { resourceAddresses: normalizedResourceAddresses }
          : {}),
        nonprodOnly: false,
        autoApprove: (isApply || isAuto) && autoApprove,
        parallel: mode === 'parallel',
        promotionOrder: mode === 'promotion' ? checked.map(t => t.name) : [],
        ...(ticket.trim() ? { ticket: ticket.trim() } : {}),
        ...(isForceUnlock && lockIds ? { lockIds } : {}),
        ...(isImport && importAddrs && Object.keys(importAddrs).length > 0 ? { importAddrs } : {}),
      });
      runId = res.id;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
    if (runId) {
      toast(`${cmd} run started — ${checked.length} target${checked.length === 1 ? '' : 's'}`, 'success');
      onCreatedRef.current(runId);
    }
  }

  // ── render ────────────────────────────────────────────────────────────────
  const n = checked.length;
  const prodSel = checked.some(t => t.prod);
  let sumWarn: React.ReactNode = null;
  if (isDestroy) sumWarn = <div className="sum-warn red">{I.warn}Destroy removes infrastructure permanently.</div>;
  else if (isAuto && autoApprove) sumWarn = <div className="sum-warn amber">{I.warn}Auto-approve enabled — apply will proceed without an approval prompt.</div>;
  else if (isAuto) sumWarn = <div className="sum-warn amber">{I.warn}Runs init → plan → apply in sequence. Apply will pause for your approval.</div>;
  else if (prodSel && isApply) sumWarn = <div className="sum-warn amber">{I.warn}Production target selected — changes apply to prod.</div>;
  else if (mode === 'parallel') sumWarn = <div className="sum-warn amber">{I.warn}Failures won't stop targets already running.</div>;

  const commandInfo = RUN_COMMAND_INFO[cmd];
  const ticketHref = ticketURL(ticketingUrl, ticket);

  // Confirm-bar copy, keyed by command. Tint/icon follow the command color.
  const tgtLabel = `${n} target${n === 1 ? '' : 's'}`;
  let cfTitle: string;
  let cfDetail: string;
  if (isDestroy) {
    cfTitle = `Destroy ${tgtLabel}?`;
    cfDetail = 'Permanently tears down resources — cannot be undone.';
  } else if (isAuto) {
    cfTitle = `Run pipeline on ${tgtLabel}?`;
    cfDetail = 'init → plan → apply runs unattended with auto-approve — no approval prompt.';
  } else if (mode === 'parallel') {
    cfTitle = `Run ${tgtLabel} in parallel?`;
    cfDetail = "Up to 4 run at once; a failure won't stop targets already running.";
  } else {
    cfTitle = prodSel ? `Apply to ${tgtLabel}, including production?` : `Apply to ${tgtLabel}?`;
    cfDetail = prodSel ? 'Production infrastructure will change.' : 'Selected infrastructure will change.';
  }
  const cfDanger = isDestroy || isAuto || (isApply && prodSel);

  return (
    <div className="run-overlay" onClick={e => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div className={`run-modal${isDestroy ? ' is-destroy' : ''}`} role="dialog" aria-label="New run">
        <div className="rm-head">
          <div>
            <div className="t">New run</div>
            <div className="s">Configure and launch a Terraform run across your repository targets.</div>
          </div>
          <button className="rm-close" aria-label="Close" onClick={onDismiss}>{I.close}</button>
        </div>

        <div className="rm-body">
          <div className="rm-main">
            {/* tracking */}
            <div className="rm-section">
              <label className="field-label" htmlFor="run-ticket">Ticket number <span className="rm-sublabel">— optional</span></label>
              <input
                id="run-ticket"
                className="inp mono"
                maxLength={128}
                placeholder="e.g. OPS-1234"
                value={ticket}
                onChange={e => setTicket(e.target.value)}
              />
              <div className="field-hint">
                Stored with the run for history search and tracking.
                {ticketHref && <> <a href={ticketHref} target="_blank" rel="noreferrer">Open ticket</a></>}
              </div>
            </div>

            {/* command */}
            <div className="rm-section">
              <div className="rm-label">Command</div>
              <div className="cmd-row">
                {COMMON.map(c => {
                  const blockedBySavedPlan = savedPlanApply && c.id === 'apply';
                  if (blockedBySavedPlan) {
                    return (
                      <div key={c.id} className="cmd-chip-wrap">
                        <button
                          className={`cmd-chip ${c.icon} command-style ${commandStyleClass(c.id)} disabled`}
                          aria-describedby={`command-description-${c.id}`}
                          disabled
                        >
                          <span className="ic">{I[c.icon]}</span>
                          <span>
                            <span className="cc-t">{RUN_COMMAND_INFO[c.id].label}</span>
                            <span className="cc-d" id={`command-description-${c.id}`}>{RUN_COMMAND_INFO[c.id].short}</span>
                          </span>
                        </button>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={c.id}
                      className={`cmd-chip ${c.icon} command-style ${commandStyleClass(c.id)}${cmd === c.id ? ' on' : ''}`}
                      onClick={() => onSetCmd(c.id)}
                      aria-describedby={`command-description-${c.id}`}
                    >
                      <span className="ic">{I[c.icon]}</span>
                      <span>
                        <span className="cc-t">{RUN_COMMAND_INFO[c.id].label}</span>
                        <span className="cc-d" id={`command-description-${c.id}`}>{RUN_COMMAND_INFO[c.id].short}</span>
                      </span>
                    </button>
                  );
                })}
                <div className="cmd-more">
                  <select
                    className={`sel command-select command-style${isMore ? ` selected ${commandStyleClass(cmd)}` : ''}`}
                    value={isMore ? cmd : ''}
                    onChange={e => { if (e.target.value) onSetCmd(e.target.value); }}
                  >
                    <option value="" disabled>More commands…</option>
                    {MORE_COMMANDS.map(m => (
                      <option key={m} value={m}>{RUN_COMMAND_INFO[m].label} — {RUN_COMMAND_INFO[m].short}</option>
                    ))}
                  </select>
                </div>
              </div>
              {savedPlanApply && (
                <div className="saved-plan-notice">
                  {I.warn}
                  <span>Saved-plan apply is on — run <strong>Plan</strong> first, then use <strong>Apply reviewed plan</strong> from the run details.</span>
                </div>
              )}
              <div className={`command-description command-style ${commandStyleClass(cmd)}${isDestroy ? ' danger' : ''}`}>
                <span className="command-description-icon">{isDestroy ? I.warn : I.info}</span>
                <div>
                  <strong>{commandInfo.label}</strong>
                  <span>{commandInfo.description}</span>
                </div>
              </div>
            </div>

            {(supportsResourceTargets || isTaintCommand) && (
              <div className="rm-section resource-address-section">
                <div className="rm-label">
                  {isTaintCommand ? 'Resource address' : 'Resource/module targets'}
                  <span className="rm-sublabel">
                    {isTaintCommand ? ' — required, shared across selected environments' : ' — optional, shared across selected environments'}
                  </span>
                </div>
                <div className="resource-address-list">
                  {(isTaintCommand ? resourceAddresses.slice(0, 1) : resourceAddresses).map((address, index) => (
                    <div className="resource-address-row" key={index}>
                      <input
                        className="inp mono"
                        aria-label={isTaintCommand ? 'Resource address' : `Resource target ${index + 1}`}
                        placeholder={isTaintCommand ? 'aws_instance.web' : 'module.network or aws_instance.web["blue"]'}
                        value={address}
                        onChange={e => setResourceAddress(index, e.target.value)}
                      />
                      {supportsResourceTargets && resourceAddresses.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-normal resource-address-remove"
                          aria-label={`Remove resource target ${index + 1}`}
                          onClick={() => removeResourceAddress(index)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {supportsResourceTargets && (
                  <button type="button" className="btn btn-link resource-address-add" onClick={addResourceAddress}>
                    Add another target
                  </button>
                )}
                <div className="field-hint">
                  {isTaintCommand
                    ? `Runs terraform ${cmd} with this address in every selected environment.`
                    : 'Each address is passed to Terraform as a repeatable -target flag.'}
                </div>
              </div>
            )}

            {/* repo + branch */}
            <div className="rm-section">
              <div className="field-row">
                <div>
                  <label className="field-label">Repository</label>
                  <select
                    className="sel"
                    value={repoIdx}
                    onChange={e => onSelectRepo(+e.target.value)}
                  >
                    {repos.length === 0 && <option value={0}>No repos registered</option>}
                    {repos.map((r, i) => <option key={r.name} value={i}>{r.name}</option>)}
                  </select>
                  <div className="field-hint">
                    {groups.length} pipeline{groups.length === 1 ? '' : 's'} · {totalTargets} targets
                  </div>
                </div>
                <div>
                  <label className="field-label">Branch</label>
                  <div className="branch-row">
                    <select
                      className="sel"
                      value={pendingBranch || branch}
                      disabled={checkingOut}
                      onChange={e => handleCheckout(e.target.value)}
                    >
                      {branches.length === 0 && <option value={branch}>{branch || '—'}</option>}
                      {branches.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <button
                      className={`branch-refresh-btn${refreshing ? ' spinning' : ''}`}
                      title="Refresh branch status"
                      disabled={refreshing || checkingOut}
                      onClick={handleRefreshStatus}
                    >
                      {I.refresh}
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {checkingOut ? (
                      <span className="git-pill checking"><span className="spin-xs" />Checking out…</span>
                    ) : repoStatus && repoStatus.behind > 0 ? (
                      <>
                        <span className="git-pill behind">{I.warn}{repoStatus.behind} behind origin</span>
                        <button className="btn btn-normal btn-sm" disabled={pulling} onClick={handlePull}>
                          {I.pull}{pulling ? 'Pulling…' : 'Pull'}
                        </button>
                      </>
                    ) : (
                      <span className="git-pill ok">{I.check}Up to date</span>
                    )}
                  </div>
                  {repoStatus && repoStatus.changedFiles && repoStatus.changedFiles.length > 0 && (
                    <div className="git-status-box">
                      <div className="gsb-head">{repoStatus.changedFiles.length} uncommitted change{repoStatus.changedFiles.length === 1 ? '' : 's'}</div>
                      <div className="gsb-files">
                        {repoStatus.changedFiles.map((f, i) => (
                          <div key={i} className="gsb-row">
                            <span className={`gsb-xy ${xyClass(f.xy)}`}>{f.xy}</span>
                            <span className="gsb-path">{f.path}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* run mode */}
            <div className="rm-section">
              <div className="rm-label">Run mode</div>
              <div className="tiles">
                <div className={`tile${seq ? ' on' : ''}`} onClick={() => onSetMode('promotion')}>
                  <span className="ti-ic">{I.seq}</span>
                  <span><span className="ti-t">Sequential</span><span className="ti-d">Runs targets in order, stops on first failure.</span></span>
                </div>
                <div
                  className={`tile${mode === 'parallel' ? ' on' : ''}${lockSequential ? ' disabled' : ''}`}
                  onClick={() => onSetMode('parallel')}
                >
                  <span className="ti-ic">{I.par}</span>
                  <span><span className="ti-t">Parallel</span><span className="ti-d">{parallelWorkers === 0 ? 'Unlimited targets at once.' : `Up to ${parallelWorkers} target${parallelWorkers === 1 ? '' : 's'} at once.`}{lockSequential ? ` Not allowed for ${cmd}.` : ''}</span></span>
                  {lockSequential && <span className="ti-lock">sequential only</span>}
                </div>
              </div>
            </div>

            {/* targets */}
            <div className="rm-section">
              <div className="rm-label">Targets <span className="rm-sublabel">— grouped by pipeline · drag groups or targets to reorder</span></div>
              <div className="tgt-toolbar">
                <button className="btn btn-link" onClick={() => setAll(true)}>Select all</button>
                <button className="btn btn-link" onClick={() => setAll(false)}>None</button>
                <button className="btn btn-link" onClick={skipProd}>Skip prod</button>
                <span className="sp" />
              </div>
              <div>
                {groups.length === 0 && (
                  <div className="exec-empty" style={{ padding: '6px 2px' }}>No targets configured for this repository.</div>
                )}
                {groups.map((g, gi) => {
                  const c = g.disabled ? 0 : g.targets.filter(t => t.checked).length;
                  const tot = g.targets.length;
                  const cls = g.disabled ? '' : c === 0 ? '' : c === tot ? 'on' : 'ind';
                  return (
                    <div key={g.key} data-gidx={gi} className={`tgroup${g.collapsed ? ' collapsed' : ''}${g.disabled ? ' grp-disabled' : ''}`}>
                      <div className="tgroup-head">
                        <span className={`cbox ${cls}`} style={g.disabled ? { pointerEvents: 'none', opacity: 0.4 } : undefined} onClick={e => { e.stopPropagation(); if (!g.disabled) toggleGroup(gi); }}>{I.check}</span>
                        {seq && <span className="ord">{gi + 1}</span>}
                        <span className="gfolder">{I.folder}</span>
                        <span className="gname">{g.key}/</span>
                        <span className="gcount">{g.disabled ? 'skipped' : `${c}/${tot} selected`}</span>
                        <span className="grp-pipe-sw" title={g.disabled ? 'Pipeline disabled — click to enable' : 'Disable this pipeline'} onClick={e => { e.stopPropagation(); toggleGroupPipeline(gi); }}>
                          <span className={`switch${g.disabled ? '' : ' on'}`} style={{ '--sw-on': 'var(--blue)' } as React.CSSProperties} />
                          <span className="grp-pipe-label">{g.disabled ? 'Skip' : 'Run'}</span>
                        </span>
                        <span className="chev" onClick={e => { e.stopPropagation(); toggleCollapse(gi); }}>{I.chev}</span>
                        {seq && (
                          <span className="tgroup-grip" onPointerDown={e => { e.stopPropagation(); startGroupDrag(e, gi); }}>
                            <span className="col"><i /><i /><i /></span>
                            <span className="col"><i /><i /><i /></span>
                          </span>
                        )}
                      </div>
                      <div className="tgroup-body" data-body={gi}>
                        {g.targets.map((t, ti) => (
                          <div
                            key={t.name + t.dir}
                            className={`tgt${t.checked ? '' : ' off'}`}
                            style={(isForceUnlock || isImport) ? { flexWrap: 'wrap' } : undefined}
                          >
                            <span className={`cbox ${t.checked ? 'on' : ''}`} onClick={e => { e.stopPropagation(); toggleTarget(gi, ti); }}>{I.check}</span>
                            {seq && <span className="ord">{ti + 1}</span>}
                            <span className="nm">
                              <span className="st-dot" style={{ background: envColor(t) }} />
                              {t.name}
                              {t.prod && <span className="prod-tag">prod</span>}
                            </span>
                            <span className="dir">{t.dir}</span>
                            <span className="sp" />
                            {seq && (
                              <span className="grip" onPointerDown={e => startDrag(e, gi, ti)}>
                                <span className="col"><i /><i /><i /></span>
                                <span className="col"><i /><i /><i /></span>
                              </span>
                            )}
                            {isForceUnlock && t.checked && (
                              <div style={{ width: '100%', padding: '6px 0 2px 28px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ display: 'flex', color: 'var(--text-3)', flexShrink: 0, width: 14, height: 14 }}>{I.key}</span>
                                <input
                                  className="inp mono"
                                  placeholder={`Lock ID for ${t.name}`}
                                  value={t.lockId}
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => setLockId(gi, ti, e.target.value)}
                                  style={{ height: 28, fontSize: 12, flex: 1 }}
                                />
                              </div>
                            )}
                            {isImport && t.checked && (
                              <div style={{ width: '100%', padding: '6px 0 2px 28px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ display: 'flex', color: 'var(--text-3)', flexShrink: 0, width: 14, height: 14 }}>{I.arrow}</span>
                                  <input
                                    className="inp mono"
                                    placeholder="Resource address  (e.g. aws_instance.web)"
                                    value={t.importAddr}
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => setImportField(gi, ti, 'importAddr', e.target.value)}
                                    style={{ height: 28, fontSize: 12, flex: 1 }}
                                  />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ display: 'flex', color: 'var(--text-3)', flexShrink: 0, width: 14, height: 14 }}>{I.key}</span>
                                  <input
                                    className="inp mono"
                                    placeholder="Resource ID  (e.g. i-1234567890abcdef0)"
                                    value={t.importId}
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => setImportField(gi, ti, 'importId', e.target.value)}
                                    style={{ height: 28, fontSize: 12, flex: 1 }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* danger / auto-approve */}
            {(isApply || isDestroy || isAuto) && (
              <div className="rm-section">
                {(isApply || isAuto) && (
                  <div className={`aa-control${autoApprove ? ' on' : ''}`} onClick={() => setAutoApprove(v => !v)}>
                    <span className={`switch${autoApprove ? ' on' : ''}`} />
                    <span><span className="aa-t">--auto-approve</span><span className="aa-d">Skip the interactive approval prompt before applying.</span></span>
                  </div>
                )}
                {isDestroy && (
                  <div className="destroy-warn">
                    <div className="dw-row">
                      <span className="dw-icon">{I.warn}</span>
                      <div>
                        <div className="dw-title">Destroy is irreversible</div>
                        <div className="dw-text">This permanently tears down all selected resources and cannot be undone. You will be asked to confirm once more before execution.</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* advanced */}
            <div className="rm-section">
              <div className={`adv-toggle${advOpen ? ' open' : ''}`} onClick={() => setAdvOpen(v => !v)}>
                {I.chevR}Advanced options
              </div>
              {advOpen && (
                <div className="adv-body">
                  <div className="adv-desc">Optional overrides — most runs don't need these.</div>
                  <div className="field-row">
                    <div>
                      <label className="field-label">Profile override</label>
                      <input className="inp" placeholder="leave blank for per-target mapping" value={profile} onChange={e => setProfile(e.target.value)} />
                      <div className="field-hint">Overrides the AWS profile for every selected target, ignoring per-target mappings.</div>
                    </div>
                    <div>
                      <label className="field-label">Extra arguments</label>
                      <input className="inp mono" placeholder="-target=aws_s3_bucket.foo" value={extra} onChange={e => setExtra(e.target.value)} />
                      <div className="field-hint">Appended verbatim to the terraform command. Example: -refresh=false</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* summary rail */}
          <aside className="rm-side">
            <div className="sum-title">Run summary</div>
            <div className="sum-cmd">
              <span className={`pill command-style ${commandStyleClass(cmd)}`}>{cmd}</span>
              <span style={{ fontSize: '12.5px', color: 'var(--text-2)' }}>{seq ? 'Sequential' : 'Parallel'}</span>
            </div>
            <div className="sum-row"><span className="k">Repo</span><span className="v mono">{repoName || '—'}</span></div>
            <div className="sum-row"><span className="k">Branch</span><span className="v mono">{pendingBranch || branch || '—'}</span></div>
            <div className="sum-row">
              <span className="k">Ticket</span>
              <span className="v mono">
                {ticket.trim()
                  ? ticketHref
                    ? <a href={ticketHref} target="_blank" rel="noreferrer">{ticket.trim()}</a>
                    : ticket.trim()
                  : '—'}
              </span>
            </div>
            <div className="sum-row"><span className="k">Targets</span><span className="v">{checked.length} of {totalTargets}</span></div>
            {isAuto && (
              <div className="auto-steps">
                <div className="as-hdr">Pipeline</div>
                <div className="as-row"><span className="as-num as-init">1</span><span className="as-name">init</span></div>
                <div className="as-conn">{I.arrow}</div>
                <div className="as-row"><span className="as-num as-plan">2</span><span className="as-name">plan</span></div>
                <div className="as-conn">{I.arrow}</div>
                <div className="as-row"><span className="as-num as-apply">3</span><span className="as-name">apply</span><span className={`as-tag${autoApprove ? ' aa' : ''}`}>{autoApprove ? 'auto-approve' : 'needs approval'}</span></div>
              </div>
            )}
            <div className="exec-box">
              <div className="eh">{seq ? <>{I.seq}Execution order</> : <>{I.par}Runs concurrently</>}</div>
              <div className="exec-list">
                {checked.length === 0
                  ? <div className="exec-empty">No targets selected</div>
                  : checked.map((t, i) => (
                    <div key={t.name + i}>
                      {i > 0 && seq && <div className="exec-conn">{I.arrow}</div>}
                      <div className={`exec-item${seq ? '' : ' par'}`}>
                        <span className="en">{seq ? i + 1 : '•'}</span>
                        <span className="nm">{t.name}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
            <div className="cli-box">
              <div className="eh">Command</div>
              <div className="cli">
                <span>{cliTokens()}</span>
                <button className="cli-copy" title="Copy" onClick={copyCli}>{I.copy}</button>
              </div>
            </div>
            {sumWarn}
            {(isApply || isAuto) && reconcile?.hasIntegration && (reconcile.behind ?? 0) > 0 && (
              <div className="sum-warn amber reconcile-guard">
                {I.warn}
                <span>
                  Branch <b>{reconcile.currentBranch}</b> is {reconcile.behind} commit
                  {reconcile.behind === 1 ? '' : 's'} behind <b>{reconcile.integrationBranch}</b>.
                  Applying now reverts deployed changes.
                </span>
                <button
                  className="btn btn-normal reconcile-guard-btn"
                  onClick={() => { onDismiss(); navigate({ id: 'workspace', name: repoName }); }}
                >
                  Reconcile first
                </button>
              </div>
            )}
          </aside>
        </div>

        <div className="rm-foot">
          {confirm ? (
            <div className={`confirm-bar command-style ${commandStyleClass(cmd)}`}>
              <span className="cf-icon">{cfDanger ? I.warn : I.info}</span>
              <div className="cf-text">
                <span className="cf-title">{cfTitle}</span>
                <span className="cf-detail">{cfDetail}</span>
              </div>
              <div className="right">
                <button className="btn btn-normal" onClick={() => setConfirm(false)}>Back</button>
                <button
                  className={`btn command-action command-style ${commandStyleClass(cmd)}`}
                  disabled={submitting}
                  onClick={doRun}
                >
                  Confirm
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="left">
                {resourceAddressMissing
                  ? <span style={{ color: 'var(--red)' }}>Enter one resource address</span>
                  : n
                  ? <>{I.info}{n} target{n === 1 ? '' : 's'} selected</>
                  : <span style={{ color: 'var(--red)' }}>Select at least one target</span>}
              </div>
              <div className="right">
                <button className="btn btn-normal" onClick={onDismiss}>Cancel</button>
                <button
                  className={`btn command-action command-style ${commandStyleClass(cmd)}`}
                  disabled={n === 0 || resourceAddressMissing || submitting}
                  onClick={onRun}
                >
                  {submitting ? 'Starting…' : isAuto ? 'Run pipeline' : `Run ${cmd}`}
                </button>
              </div>
            </>
          )}
        </div>
        {error && (
          <div style={{ padding: '0 26px 16px', color: 'var(--red)', fontSize: 13 }}>{error}</div>
        )}
      </div>
    </div>
  );
}
