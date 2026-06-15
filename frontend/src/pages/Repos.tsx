/**
 * Repositories page — verbatim pixel-port of design_handoff_tf9/repos/
 * (Repositories.html + app.js), wired to the real Go backend.
 *
 * - Repo list, targets, browse + reorder/edit persist through the existing
 *   `/api/repos` config endpoints.
 * - Per-target `disabled` + `group` overrides persist to localStorage under
 *   `tf9-repo-overrides` ({ "repo:env": { disabled, group } }), matching the
 *   README contract that the New Run modal reads.
 *
 * All @cloudscape-design/components usage has been removed; markup uses the
 * prototype's global CSS classes (.container, .tbl, .stage, .pipeline, …).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Shell from '../Shell';
import { api, awsApi, profileMappingsApi } from '../api';
import type { ProfileMapping, AWSProfileDetail } from '../api';
import type { Repo, RepoConfig, RepoTarget, BrowseResult, Paginated } from '../types';
import {
  IconRepo, IconKey, IconGlobe, IconId, IconArrow, IconPlus, IconEdit,
  IconCheck, IconCheckCircle, IconFolder, IconLock, IconList, IconFlow,
  IconTrash, IconUp, IconDown, IconFile,
} from '../components/repos/icons';
import {
  stageColor, groupKeyOf, deriveGroups, reorderWithinGroup, leafDir, autoStageName,
} from '../components/repos/repoModel';
import EditStageModal from '../components/repos/EditStageModal';

const OVR_KEY = 'tf9-repo-overrides';
const GROUP_OVR_KEY = 'tf9-group-overrides';

type TargetWithGate = RepoTarget & { gated?: boolean };
type RepoDefaults = Pick<RepoConfig,
  'default_aws_profile' | 'default_account_id' | 'default_region'
  | 'integration_branch' | 'active_branch_window_days' | 'active_branch_limit'>;

const EMPTY_REPO_DEFAULTS: RepoDefaults = {
  default_aws_profile: '',
  default_account_id: '',
  default_region: '',
  integration_branch: '',
};

// ── localStorage overrides ────────────────────────────────────────────────

function applyOverrides(repoName: string, targets: RepoTarget[]): RepoTarget[] {
  let d: Record<string, { disabled?: boolean; group?: string }> = {};
  try { d = JSON.parse(localStorage.getItem(OVR_KEY) || '{}'); } catch { /* ignore */ }
  return targets.map(t => {
    const o = d[`${repoName}:${t.name}`];
    if (!o) return { ...t };
    const next: RepoTarget = { ...t };
    if (o.disabled !== undefined) next.disabled = o.disabled;
    if (o.group) next.group = o.group; else delete next.group;
    return next;
  });
}

function saveOverrides(repoName: string, targets: RepoTarget[]) {
  try {
    const d: Record<string, { disabled: boolean; group: string }> =
      JSON.parse(localStorage.getItem(OVR_KEY) || '{}');
    targets.forEach(t => {
      d[`${repoName}:${t.name}`] = { disabled: !!t.disabled, group: t.group || '' };
    });
    localStorage.setItem(OVR_KEY, JSON.stringify(d));
  } catch { /* ignore */ }
}

// ── Toast (prototype's bottom-center pill) ─────────────────────────────────

function useProtoToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 1900);
  }, []);
  const node = (
    <div className={'toast' + (msg ? ' show' : '')}>
      {msg && <><IconCheck />{msg}</>}
    </div>
  );
  return { toast, node };
}

// ── Repo list table ────────────────────────────────────────────────────────

interface RepoRowData {
  repo: Repo;
  targets: RepoTarget[];
}

function MiniPipe({ groups, targets }: { groups: ReturnType<typeof deriveGroups>; targets: RepoTarget[] }) {
  return (
    <div className="mini-pipe">
      {groups.map((g, gi) => (
        <span key={g.key} style={{ display: 'contents' }}>
          {gi > 0 && <span style={{ width: 9, display: 'inline-block' }} />}
          {g.idxs.map((idx, p) => {
            const t = targets[idx];
            return (
              <span key={idx} style={{ display: 'contents' }}>
                {p > 0 && <span className="ar"><IconArrow /></span>}
                <i className={t.disabled ? 'off' : ''} title={t.name} />
              </span>
            );
          })}
        </span>
      ))}
    </div>
  );
}

function RepoTable({
  rows, selected, onSelect, onConfigure, onRename, onDelete, onToggleDisabled,
}: {
  rows: RepoRowData[];
  selected: string | null;
  onSelect: (name: string) => void;
  onConfigure: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
  onToggleDisabled: (name: string, disabled: boolean) => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');

  function startRename(name: string) {
    setRenaming(name);
    setRenameVal(name);
  }

  function confirmRename(oldName: string) {
    const trimmed = renameVal.trim();
    setRenaming(null);
    if (trimmed && trimmed !== oldName) onRename(oldName, trimmed);
  }

  return (
    <table className="tbl">
      <thead>
        <tr>
          <th></th>
          <th>Repository</th>
          <th>Promotion pipeline</th>
          <th>AWS profiles</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ repo, targets }) => {
          const groups = deriveGroups(targets);
          const act = targets.filter(t => !t.disabled).length;
          const profs = Array.from(new Set(targets.map(t => t.aws_profile).filter(Boolean))).slice(0, 3);
          const sel = repo.name === selected;
          const isRenaming = renaming === repo.name;
          return (
            <tr
              key={repo.name}
              className={'selectable' + (sel ? ' selected' : '') + (repo.disabled ? ' row-disabled' : '')}
              style={repo.disabled ? { opacity: 0.55 } : undefined}
              onClick={() => { if (!isRenaming) onSelect(repo.name); }}
            >
              <td style={{ width: 34 }}><span className={'radio' + (sel ? ' on' : '')} /></td>
              <td>
                {isRenaming ? (
                  <div className="cell-name" style={{ gap: 6 }}>
                    <IconRepo />
                    <input
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                      className="inp"
                      value={renameVal}
                      style={{ flex: 1, minWidth: 0, height: 28, padding: '2px 8px' }}
                      aria-label="New repository name"
                      onChange={e => setRenameVal(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') confirmRename(repo.name);
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                    <button
                      className="btn btn-icon"
                      style={{ width: 26, height: 26, flexShrink: 0, color: 'var(--green)' }}
                      aria-label="Confirm rename"
                      onClick={e => { e.stopPropagation(); confirmRename(repo.name); }}
                    >
                      <IconCheck />
                    </button>
                  </div>
                ) : (
                  <div className="cell-name"><IconRepo />{repo.name}</div>
                )}
                <div className="cell-sub mono">{repo.path}</div>
              </td>
              <td>
                <MiniPipe groups={groups} targets={targets} />
                <div className="cell-sub">
                  {groups.length} pipeline{groups.length === 1 ? '' : 's'} · {targets.length} stage{targets.length === 1 ? '' : 's'} · {act} enabled
                </div>
              </td>
              <td>
                <div className="chips">
                  {profs.map(p => <span key={p} className="badge"><IconKey />{p}</span>)}
                </div>
              </td>
              <td style={{ textAlign: 'right', width: 270 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                  <span
                    className="switch-wrap"
                    title={repo.disabled ? 'Repository disabled — click to enable' : 'Disable this repository'}
                    style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-2)' }}
                    onClick={e => { e.stopPropagation(); onToggleDisabled(repo.name, !repo.disabled); }}
                  >
                    <span className={'switch' + (repo.disabled ? '' : ' on')} />
                    {repo.disabled ? 'Disabled' : 'Enabled'}
                  </span>
                  <button
                    className="btn btn-icon"
                    title="Rename repository"
                    aria-label={`Rename ${repo.name}`}
                    onClick={e => { e.stopPropagation(); startRename(repo.name); }}
                  >
                    <IconEdit />
                  </button>
                  <button
                    className="btn btn-icon"
                    title="Remove repository"
                    aria-label={`Remove ${repo.name}`}
                    style={{ color: 'var(--red)' }}
                    onClick={e => { e.stopPropagation(); onDelete(repo.name); }}
                  >
                    <IconTrash />
                  </button>
                  <button
                    className="btn btn-normal btn-sm"
                    onClick={e => {
                      e.stopPropagation();
                      window.location.hash = `#workspace/${encodeURIComponent(repo.name)}`;
                    }}
                  >
                    Workspace
                  </button>
                  <button
                    className="btn btn-normal btn-sm"
                    onClick={e => { e.stopPropagation(); onConfigure(repo.name); }}
                  >
                    Configure
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Stage card (pipeline view) ─────────────────────────────────────────────

function StageCard({
  target, idx, gpos, onToggle, onEdit, onDelete, onGripDown,
}: {
  target: TargetWithGate;
  idx: number;
  gpos: number;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onGripDown: (e: React.PointerEvent) => void;
}) {
  const col = stageColor(target);
  return (
    <div className={'stage' + (target.disabled ? ' disabled' : '')} data-idx={idx} data-gpos={gpos}>
      <div className="stage-top">
        <span className="order-badge">{gpos + 1}</span>
        <span className="stage-grip" title="Drag to reorder within this pipeline" onPointerDown={onGripDown}>
          <span className="col"><i /><i /><i /></span>
          <span className="col"><i /><i /><i /></span>
        </span>
      </div>
      <div className="stage-name"><span className="st-dot" style={{ background: col }} />{target.name}</div>
      <div className="stage-dir">{leafDir(target.directory)}</div>
      <div className="stage-meta">
        <div className="row"><span title="AWS profile"><IconKey /></span><span className="v">{target.aws_profile || '—'}</span></div>
        <div className="row"><span title="Region"><IconGlobe /></span><span className="v">{target.region || 'default region'}</span></div>
        <div className="row"><span title="Account ID"><IconId /></span><span className={'v ' + (target.account_id ? 'mono' : 'muted')}>{target.account_id || 'any account'}</span></div>
      </div>
      <div className="stage-foot">
        <span className="switch-wrap">
          <span className={'switch' + (target.disabled ? '' : ' on')} onClick={e => { e.stopPropagation(); onToggle(); }} />
          {target.disabled ? 'Disabled' : 'Enabled'}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {target.gated && <span className="gate" title="Manual approval before this stage"><IconLock />Approval</span>}
          <button className="btn btn-icon" title="Edit stage" aria-label={`Edit ${target.name} stage`} style={{ width: 28, height: 28 }} onClick={onEdit}><IconEdit /></button>
          <button className="btn btn-icon" title="Delete stage" aria-label={`Delete ${target.name} stage`} style={{ width: 28, height: 28, color: 'var(--red)' }} onClick={onDelete}><IconTrash /></button>
        </span>
      </div>
    </div>
  );
}

// ── Drag state ──────────────────────────────────────────────────────────────

interface DragState {
  gk: string;
  pos: number;
  offX: number;
  offY: number;
  clone: HTMLElement;
}

// ── Configure section ───────────────────────────────────────────────────────

interface ConfigureProps {
  repo: Repo;
  targets: RepoTarget[];
  view: 'pipeline' | 'table';
  setView: (v: 'pipeline' | 'table') => void;
  onTargetsChange: (next: RepoTarget[], persistOverrides?: boolean) => void;
  onEdit: (idx: number) => void;
  onAddStageGroup: (group: string) => void;
  onDeleteTarget: (idx: number) => void;
  onDeleteGroup: (key: string) => void;
  toast: (m: string) => void;
}

function ConfigureSection({
  repo, targets, view, setView, onTargetsChange, onEdit, onAddStageGroup,
  onDeleteTarget, onDeleteGroup, toast,
}: ConfigureProps) {
  const pipelineRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  // keep the latest targets/callback available to the window-bound drag handlers
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const changeRef = useRef(onTargetsChange);
  changeRef.current = onTargetsChange;

  const groups = deriveGroups(targets);

  const [groupOvr, setGroupOvr] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(GROUP_OVR_KEY) || '{}'); } catch { return {}; }
  });

  function toggleGroupPipeline(gk: string) {
    const key = `${repo.name}:${gk}`;
    const next = { ...groupOvr };
    if (next[key]) delete next[key]; else next[key] = true;
    setGroupOvr(next);
    localStorage.setItem(GROUP_OVR_KEY, JSON.stringify(next));
    toast(next[key] ? `${gk}/ pipeline disabled` : `${gk}/ pipeline enabled`);
  }

  function toggle(idx: number) {
    const next = targets.map((t, i) => i === idx ? { ...t, disabled: !t.disabled } : t);
    onTargetsChange(next, true);
  }

  // ── pointer drag reorder within a group ──
  function groupPipeEl(gk: string): HTMLElement | null {
    const root = pipelineRef.current;
    if (!root) return null;
    return root.querySelector<HTMLElement>(`.pipeline[data-gk="${(window.CSS && CSS.escape) ? CSS.escape(gk) : gk}"]`);
  }

  function startDrag(e: React.PointerEvent, gk: string, gpos: number) {
    e.preventDefault();
    const el = (e.target as HTMLElement).closest('.stage') as HTMLElement | null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const clone = el.cloneNode(true) as HTMLElement;
    clone.classList.add('dragging');
    clone.style.position = 'fixed';
    clone.style.left = rect.left + 'px';
    clone.style.top = rect.top + 'px';
    clone.style.width = rect.width + 'px';
    clone.style.margin = '0';
    clone.style.pointerEvents = 'none';
    document.body.appendChild(clone);
    el.classList.add('placeholder');
    drag.current = { gk, pos: gpos, offX: e.clientX - rect.left, offY: e.clientY - rect.top, clone };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }

  function onDragMove(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    d.clone.style.left = (e.clientX - d.offX) + 'px';
    d.clone.style.top = (e.clientY - d.offY) + 'px';
    const pipe = groupPipeEl(d.gk);
    if (!pipe) return;
    const cards = Array.from(pipe.querySelectorAll('.stage'));
    let toPos = cards.length - 1;
    for (let i = 0; i < cards.length; i++) {
      const rc = cards[i].getBoundingClientRect();
      if (e.clientX < rc.left + rc.width / 2) { toPos = i; break; }
    }
    if (toPos !== d.pos) {
      changeRef.current(reorderWithinGroup(targetsRef.current, d.gk, d.pos, toPos));
      d.pos = toPos;
      // Sync the placeholder to the new slot after React re-renders.
      // Always remove from ALL cards first so only one slot is highlighted.
      requestAnimationFrame(() => {
        const np = groupPipeEl(d.gk);
        if (!np) return;
        const nc = np.querySelectorAll('.stage');
        nc.forEach(el => el.classList.remove('placeholder'));
        if (nc[toPos]) nc[toPos].classList.add('placeholder');
      });
    }
  }

  function endDrag() {
    const d = drag.current;
    if (!d) return;
    // Remove placeholder highlight from ALL cards before detaching the clone,
    // so the real card becomes visible again after the drop.
    const pipe = groupPipeEl(d.gk);
    if (pipe) pipe.querySelectorAll('.stage.placeholder').forEach(el => el.classList.remove('placeholder'));
    if (d.clone.parentNode) d.clone.parentNode.removeChild(d.clone);
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    const gk = d.gk;
    drag.current = null;
    changeRef.current(targetsRef.current, true);
    toast('Updated ' + gk + '/ promotion order');
  }

  // mirror "from" position changes onto the live ref so onDragMove sees current targets
  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function moveRow(gk: string, pos: number, delta: number) {
    onTargetsChange(reorderWithinGroup(targets, gk, pos, pos + delta), true);
  }

  return (
    <section id="cfgSection">
      <div className="container">
        <div className="c-head noborder" style={{ paddingBottom: 0 }}>
          <div>
            <div className="c-title">
              <span style={{ display: 'flex', color: 'var(--text-2)' }}><IconRepo /></span>
              {repo.name} · promotion pipeline
            </div>
            <div className="c-desc mono">{repo.path}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="view-toggle">
              <button className={view === 'pipeline' ? 'on' : ''} onClick={() => setView('pipeline')}>
                <span style={{ display: 'flex' }}><IconFlow /></span>Pipeline
              </button>
              <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>
                <span style={{ display: 'flex' }}><IconList /></span>Table
              </button>
            </div>
          </div>
        </div>

        <div className="c-body">
          <div className="pipe-toolbar">
            <div className="seq-summary">
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                {groups.length} promotion pipeline{groups.length === 1 ? '' : 's'}
              </span>
              <span className="gsub" style={{ color: 'var(--text-2)' }}>grouped by directory prefix</span>
            </div>
          </div>

          {view === 'pipeline' ? (
            <div ref={pipelineRef}>
              {targets.length === 0 ? (
                <div className="pipe-empty">
                  <IconFlow />
                  <div className="t">No pipelines yet</div>
                  <div>Add a Terraform directory from the browser below. Each top-level directory becomes its own promotion pipeline.</div>
                </div>
              ) : (
                groups.map(g => {
                  const act = g.idxs.filter(i => !targets[i].disabled).length;
                  const grpDisabled = !!groupOvr[`${repo.name}:${g.key}`];
                  return (
                    <div className={'group' + (grpDisabled ? ' grp-disabled' : '')} key={g.key}>
                      <div className="group-head">
                        <div className="group-title">
                          <span className="gfolder"><IconFolder /></span>
                          <span className="path">{g.key}/</span>
                          <span className="gsub">{g.idxs.length} stage{g.idxs.length === 1 ? '' : 's'} · {act} enabled</span>
                        </div>
                        <div className="group-actions" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                          <span className="switch-wrap" title={grpDisabled ? 'Pipeline disabled in run modal — click to enable' : 'Disable this pipeline in run modal'} style={{ cursor: 'pointer' }} onClick={() => toggleGroupPipeline(g.key)}>
                            <span className={'switch' + (grpDisabled ? '' : ' on')} />
                            <span>{grpDisabled ? 'Skip in runs' : 'Active in runs'}</span>
                          </span>
                          <button className="btn btn-icon" title="Delete this pipeline" aria-label={`Delete ${g.key} pipeline`} style={{ color: 'var(--red)' }} onClick={() => onDeleteGroup(g.key)}>
                            <IconTrash />
                          </button>
                          <span className="seq-summary">
                            {g.idxs.map((i, p) => {
                              const t = targets[i];
                              return (
                                <span key={i} style={{ display: 'contents' }}>
                                  {p > 0 && <span style={{ display: 'inline-flex' }}><IconArrow /></span>}
                                  <span className={'s-node' + (t.disabled ? ' off' : '')}>{t.name}</span>
                                </span>
                              );
                            })}
                          </span>
                        </div>
                      </div>
                      <div className="pipe-scroll">
                        <div className="pipeline" data-gk={g.key}>
                          {g.idxs.map((gi, pos) => (
                            <span key={gi} style={{ display: 'contents' }}>
                              {pos > 0 && (
                                <div className="conn">
                                  <div className="line"><IconArrow /></div>
                                  <div className="lbl">then</div>
                                </div>
                              )}
                              <StageCard
                                target={targets[gi]}
                                idx={gi}
                                gpos={pos}
                                onToggle={() => toggle(gi)}
                                onEdit={() => onEdit(gi)}
                                onDelete={() => onDeleteTarget(gi)}
                                onGripDown={e => startDrag(e, g.key, pos)}
                              />
                            </span>
                          ))}
                          <div className="conn" style={{ width: 26 }}><div className="line" /></div>
                          <button className="add-stage" onClick={() => onAddStageGroup(g.key)}>
                            <span className="plus"><IconPlus /></span>Add stage
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div>
              {groups.map(g => {
                const act = g.idxs.filter(i => !targets[i].disabled).length;
                const grpDisabled = !!groupOvr[`${repo.name}:${g.key}`];
                return (
                  <div className={'group' + (grpDisabled ? ' grp-disabled' : '')} key={g.key} style={{ padding: 0, overflow: 'hidden' }}>
                    <div
                      className="group-head"
                      style={{ padding: '13px 16px', margin: 0, background: '#f7f9fb', borderBottom: '1px solid var(--divider)' }}
                    >
                      <div className="group-title">
                        <span className="gfolder"><IconFolder /></span>
                        <span className="path">{g.key}/</span>
                        <span className="gsub">{g.idxs.length} stage{g.idxs.length === 1 ? '' : 's'} · {act} enabled</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span className="switch-wrap" title={grpDisabled ? 'Pipeline disabled in run modal — click to enable' : 'Disable this pipeline in run modal'} style={{ cursor: 'pointer' }} onClick={() => toggleGroupPipeline(g.key)}>
                          <span className={'switch' + (grpDisabled ? '' : ' on')} />
                          <span>{grpDisabled ? 'Skip in runs' : 'Active in runs'}</span>
                        </span>
                        <button className="btn btn-icon" title="Delete this pipeline" aria-label={`Delete ${g.key} pipeline`} style={{ color: 'var(--red)' }} onClick={() => onDeleteGroup(g.key)}>
                          <IconTrash />
                        </button>
                      </div>
                    </div>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Order</th><th>Stage</th><th>Directory</th><th>AWS profile</th>
                          <th>Account ID</th><th>Region</th><th>Enabled</th><th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.idxs.map((gi, pos) => {
                          const t = targets[gi];
                          return (
                            <tr key={gi} style={t.disabled ? { opacity: 0.6 } : undefined}>
                              <td style={{ width: 96 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span className="order-badge" style={{ width: 22, height: 22, fontSize: 12 }}>{pos + 1}</span>
                                  <button className="btn btn-icon" style={{ width: 24, height: 24 }} disabled={pos === 0} onClick={() => moveRow(g.key, pos, -1)}><IconUp /></button>
                                  <button className="btn btn-icon" style={{ width: 24, height: 24 }} disabled={pos === g.idxs.length - 1} onClick={() => moveRow(g.key, pos, 1)}><IconDown /></button>
                                </div>
                              </td>
                              <td><div className="cell-name" style={{ gap: 8 }}><span className="st-dot dot" style={{ background: stageColor(t) }} />{t.name}</div></td>
                              <td><code>{leafDir(t.directory)}</code></td>
                              <td><span className="badge"><IconKey />{t.aws_profile}</span></td>
                              <td>{t.account_id ? <code>{t.account_id}</code> : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                              <td>{t.region || '—'}</td>
                              <td><span className={'switch' + (t.disabled ? '' : ' on')} onClick={() => toggle(gi)} /></td>
                              <td style={{ textAlign: 'right' }}>
                                <button className="btn btn-icon" aria-label={`Edit ${t.name} stage`} onClick={() => onEdit(gi)}><IconEdit /></button>
                                <button className="btn btn-icon" aria-label={`Delete ${t.name} stage`} onClick={() => onDeleteTarget(gi)}><IconTrash /></button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Browse section ──────────────────────────────────────────────────────────

function BrowseSection({
  browsePath, browseResult, targets, onNavigate, onAdd,
}: {
  browsePath: string;
  browseResult: BrowseResult | null;
  targets: RepoTarget[];
  onNavigate: (path: string) => void;
  onAdd: (directory: string) => void;
}) {
  const parts = browsePath.split('/').filter(Boolean);
  let acc = '';
  const entries = (browseResult?.entries || []).filter(e => e.isDir);

  return (
    <div className="container" id="browseSection">
      <div className="c-head">
        <div>
          <div className="c-title">Add targets from repository</div>
          <div className="c-desc">Browse the repository and add any directory that contains <code>.tf</code> files as a new pipeline stage.</div>
        </div>
      </div>
      <div className="c-body">
        <div className="browse-path">
          <a onClick={() => onNavigate('')}>root</a>
          {parts.map(p => {
            acc = acc ? acc + '/' + p : p;
            const target = acc;
            return (
              <span key={target} style={{ display: 'contents' }}>
                <span className="sep">/</span>
                <a onClick={() => onNavigate(target)}>{p}</a>
              </span>
            );
          })}
        </div>
        <div>
          {entries.length === 0 ? (
            <div style={{ color: 'var(--text-2)', padding: 12 }}>No subdirectories.</div>
          ) : entries.map(en => {
            const full = browsePath ? browsePath + '/' + en.name : en.name;
            const added = targets.some(t => t.directory === full);
            return (
              <div className="dir-row" key={en.name}>
                <span className="ic">{en.hasTf ? <IconFile /> : <IconFolder />}</span>
                <span className="nm" onClick={() => onNavigate(full)}>{en.name}</span>
                {en.hasTf && <span className="badge blue">.tf</span>}
                <span className="spacer" />
                {!en.hasTf
                  ? <button className="btn btn-link" onClick={() => onNavigate(full)}>Open</button>
                  : added
                    ? <span className="status ok"><IconCheckCircle />Added</span>
                    : <button className="btn btn-normal btn-sm" onClick={() => onAdd(full)}><IconPlus />Add to pipeline</button>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Add repository modal ────────────────────────────────────────────────────

function AddRepoModal({
  onAdd, onCancel, error,
}: {
  onAdd: (name: string, path: string) => void;
  onCancel: () => void;
  error: string;
}) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="overlay show" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal">
        <div className="modal-head">Add repository</div>
        <div className="modal-body">
          {error && <div className="alert" style={{ background: 'var(--red-bg)', borderColor: '#f0b3b3', color: 'var(--red)' }}>{error}</div>}
          <div style={{ marginBottom: 16 }}>
            <label className="field-label">Name</label>
            <input className="inp" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div style={{ marginBottom: 4 }}>
            <label className="field-label">Absolute path</label>
            <input className="inp mono" value={path} onChange={e => setPath(e.target.value)} placeholder="/Users/you/src/infrastructure" />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-normal" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onAdd(name, path)}>Add</button>
        </div>
      </div>
    </div>
  );
}

// ── Remove confirm modal ────────────────────────────────────────────────────

function ConfirmRemove({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="overlay show" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal">
        <div className="modal-head">Remove repository</div>
        <div className="modal-body">
          Remove repository <strong>{name}</strong> and its target configuration?
        </div>
        <div className="modal-foot">
          <button className="btn btn-normal" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={onConfirm}>Remove</button>
        </div>
      </div>
    </div>
  );
}

// ── Delete pipeline confirm modal ───────────────────────────────────────────

function ConfirmDeleteGroup({ groupKey, count, onConfirm, onCancel }: { groupKey: string; count: number; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="overlay show" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal">
        <div className="modal-head">Delete pipeline</div>
        <div className="modal-body">
          Remove pipeline <strong>{groupKey}/</strong> and its {count} stage{count === 1 ? '' : 's'} from config.yaml?
        </div>
        <div className="modal-foot">
          <button className="btn btn-normal" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteStage({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="overlay show" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal">
        <div className="modal-head">Delete stage</div>
        <div className="modal-body">
          Remove stage <strong>{name}</strong> from config.yaml?
        </div>
        <div className="modal-foot">
          <button className="btn btn-normal" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function Repos() {
  const { toast, node: toastNode } = useProtoToast();

  const [repos, setRepos] = useState<Repo[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [repoTargets, setRepoTargets] = useState<Record<string, RepoTarget[]>>({});
  const [awsProfiles, setAwsProfiles] = useState<string[]>([]);
  const [profileMappings, setProfileMappings] = useState<ProfileMapping[]>([]);
  const [profileDetails, setProfileDetails] = useState<Record<string, AWSProfileDetail>>({});

  const [cfgRepo, setCfgRepo] = useState<Repo | null>(null);
  const [cfgTargets, setCfgTargets] = useState<RepoTarget[]>([]);
  const [cfgDefaults, setCfgDefaults] = useState<RepoDefaults>(EMPTY_REPO_DEFAULTS);
  const [cfgError, setCfgError] = useState('');
  const [cfgSaving, setCfgSaving] = useState(false);
  const [view, setView] = useState<'pipeline' | 'table'>('pipeline');

  const [browsePath, setBrowsePath] = useState('');
  const [browseResult, setBrowseResult] = useState<BrowseResult | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<string | null>(null);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<number | null>(null);
  const [editIdx, setEditIdx] = useState<number>(-1);

  const cfgSectionRef = useRef<HTMLDivElement>(null);
  const browseSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    awsApi.profiles().then(setAwsProfiles).catch(() => setAwsProfiles([]));
    profileMappingsApi.get().then(m => setProfileMappings(m ?? [])).catch(() => {});
    awsApi.profileDetails().then(d => setProfileDetails(d ?? {})).catch(() => {});
  }, []);

  const loadRepos = useCallback(() => {
    setLoadError(null);
    api.get<Paginated<Repo>>('/api/repos')
      .then(res => setRepos(res?.items || []))
      .catch(e => setLoadError(e instanceof Error ? e.message : 'Failed to load repositories.'));
  }, []);

  useEffect(loadRepos, [loadRepos]);

  // fetch + apply overrides for every repo (for the list preview)
  useEffect(() => {
    repos.forEach(repo => {
      api.get<RepoConfig>(`/api/repos/${encodeURIComponent(repo.name)}/config`)
        .then(cfg => {
          setRepoTargets(prev => ({ ...prev, [repo.name]: applyOverrides(repo.name, cfg.targets || []) }));
        })
        .catch(() => {});
    });
  }, [repos]);

  async function loadBrowse(name: string, path: string) {
    const result = await api.get<BrowseResult>(
      `/api/repos/${encodeURIComponent(name)}/browse?path=${encodeURIComponent(path)}`,
    ).catch(() => null);
    setBrowseResult(result);
    setBrowsePath(path);
  }

  async function openConfig(repo: Repo) {
    setCfgError('');
    setCfgRepo(repo);
    setView('pipeline');
    const cfg = await api.get<RepoConfig>(`/api/repos/${encodeURIComponent(repo.name)}/config`).catch(() => ({ targets: [] } as RepoConfig));
    const targets = applyOverrides(repo.name, cfg.targets || []);
    setCfgDefaults({
      default_aws_profile: cfg.default_aws_profile || '',
      default_account_id: cfg.default_account_id || '',
      default_region: cfg.default_region || '',
      integration_branch: cfg.integration_branch || '',
      active_branch_window_days: cfg.active_branch_window_days,
      active_branch_limit: cfg.active_branch_limit,
    });
    setCfgTargets(targets);
    setRepoTargets(prev => ({ ...prev, [repo.name]: targets }));
    await loadBrowse(repo.name, '');
    requestAnimationFrame(() => cfgSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function selectRepo(name: string) {
    const repo = repos.find(r => r.name === name);
    if (repo) openConfig(repo);
  }

  /** Apply a targets change. When persistOverrides, also write disabled/group to localStorage. */
  function changeTargets(next: RepoTarget[], persistOverrides = false) {
    setCfgTargets(next);
    if (cfgRepo) {
      setRepoTargets(prev => ({ ...prev, [cfgRepo.name]: next }));
      if (persistOverrides) saveOverrides(cfgRepo.name, next);
    }
  }

  async function addRepo(name: string, path: string) {
    setAddError('');
    if (!name.trim() || !path.trim()) { setAddError('Name and path are required'); return; }
    try {
      const n = name.trim();
      await api.post('/api/repos', { name: n, path: path.trim() });
      setAddOpen(false);
      toast(`Repository ${n} added to config.yaml`);
      loadRepos();
      const repo: Repo = { name: n, path: path.trim() };
      await openConfig(repo);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to add repository');
    }
  }

  async function toggleRepoDisabled(name: string, disabled: boolean) {
    try {
      await api.patch(`/api/repos/${encodeURIComponent(name)}`, { disabled });
      loadRepos();
      toast(disabled ? `${name} disabled` : `${name} enabled`);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to update repository.');
    }
  }

  async function removeRepo(name: string) {
    await api.delete(`/api/repos/${encodeURIComponent(name)}`).catch(() => {});
    setConfirmRemove(null);
    if (cfgRepo?.name === name) {
      setCfgRepo(null);
      setCfgTargets([]);
      setCfgDefaults(EMPTY_REPO_DEFAULTS);
    }
    loadRepos();
    toast(`Removed ${name}`);
  }

  async function renameRepo(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    try {
      await api.patch(`/api/repos/${encodeURIComponent(oldName)}`, { name: trimmed });
      // Keep the configure panel in sync if this repo was open
      if (cfgRepo?.name === oldName) setCfgRepo(r => r ? { ...r, name: trimmed } : r);
      toast(`Renamed "${oldName}" → "${trimmed}"`);
      loadRepos();
    } catch (e) {
      setLoadError(
        `Rename failed: ${e instanceof Error ? e.message : 'Unknown error'}. Try a different name.`
      );
    }
  }

  /**
   * Optimistically apply a targets change, then persist it to config.yaml.
   * If any target is missing a name/directory/AWS profile the backend would
   * reject the write, so the change is left pending in state and the explicit
   * "Save targets" button commits it once the profile is set.
   */
  async function persistTargets(next: RepoTarget[], successMsg: string, persistOverrides = false, showToast = true): Promise<boolean> {
    changeTargets(next, persistOverrides);
    if (!cfgRepo) return false;
    const invalid = next.find(t => !t.name.trim() || !t.directory.trim() || !t.aws_profile.trim());
    if (invalid) {
      setCfgError(`Target "${invalid.name || invalid.directory || '(unnamed)'}" needs an AWS profile before it can be saved to config.yaml.`);
      return false;
    }
    const defaultAccountID = (cfgDefaults.default_account_id || '').trim();
    if (defaultAccountID && !/^\d{12}$/.test(defaultAccountID)) {
      setCfgError('Default account ID must be exactly 12 digits.');
      return false;
    }
    setCfgError('');
    setCfgSaving(true);
    try {
      await api.put(`/api/repos/${encodeURIComponent(cfgRepo.name)}/config`, { ...cfgDefaults, targets: next });
      const cfg = await api.get<RepoConfig>(`/api/repos/${encodeURIComponent(cfgRepo.name)}/config`);
      const saved = applyOverrides(cfgRepo.name, cfg.targets || []);
      setCfgDefaults({
        default_aws_profile: cfg.default_aws_profile || '',
        default_account_id: cfg.default_account_id || '',
        default_region: cfg.default_region || '',
        integration_branch: cfg.integration_branch || '',
        active_branch_window_days: cfg.active_branch_window_days,
        active_branch_limit: cfg.active_branch_limit,
      });
      setCfgTargets(saved);
      setRepoTargets(prev => ({ ...prev, [cfgRepo.name]: saved }));
      if (showToast) toast(successMsg);
      return true;
    } catch (e) {
      setCfgError(e instanceof Error ? e.message : 'Failed to save targets.');
      return false;
    } finally {
      setCfgSaving(false);
    }
  }

  function addTarget(directory: string) {
    if (cfgTargets.some(t => t.directory === directory)) return;

    const name = autoStageName(directory);
    const leaf = directory.split('/').pop() || directory;

    // profile: profile_mappings(leaf) -> repo default -> single-profile fallback
    const mapped = profileMappings.find(m => m.dir === leaf)?.profile;
    const profile = mapped || cfgDefaults.default_aws_profile
      || (awsProfiles.length === 1 ? awsProfiles[0] : '');

    // region/account: ~/.aws/config for the resolved profile -> repo defaults
    const detail = profile ? profileDetails[profile] : undefined;
    const region     = detail?.region     || cfgDefaults.default_region     || undefined;
    const account_id = detail?.account_id || cfgDefaults.default_account_id || undefined;

    const target = { name, directory, aws_profile: profile, account_id, region } as RepoTarget;
    const next = [...cfgTargets, target];

    // collision -> add, then open the Edit modal pre-filled to disambiguate
    if (cfgTargets.some(t => t.name === name)) {
      persistTargets(next, `Added ${name} — name clash, please adjust`);
      setEditIdx(next.length - 1);
      return;
    }
    persistTargets(next, `Added ${name} to the ${groupKeyOf(target)}/ pipeline`);
  }

  function deleteTarget(idx: number) {
    const t = cfgTargets[idx];
    persistTargets(cfgTargets.filter((_, i) => i !== idx), `Removed ${t.name}`);
  }

  function deleteGroup(key: string) {
    const g = deriveGroups(cfgTargets).find(x => x.key === key);
    if (!g) return;
    const drop = new Set(g.idxs);
    const remaining = cfgTargets.filter((_, i) => !drop.has(i));
    persistTargets(remaining, `Removed ${key}/ pipeline`);
    // Drop the group's run-modal override so a future same-named group starts clean.
    if (cfgRepo) {
      try {
        const d = JSON.parse(localStorage.getItem(GROUP_OVR_KEY) || '{}');
        delete d[`${cfgRepo.name}:${key}`];
        localStorage.setItem(GROUP_OVR_KEY, JSON.stringify(d));
      } catch { /* ignore */ }
    }
  }

  function handleEditSave(updated: RepoTarget) {
    const next = cfgTargets.map((t, i) => i === editIdx ? updated : t);
    // group/disabled overrides persist to localStorage; config fields persist to config.yaml.
    persistTargets(next, 'Stage saved', true);
    setEditIdx(-1);
  }

  function onAddStageGroup(_group: string) {
    requestAnimationFrame(() => {
      browseSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  const listRows: RepoRowData[] = repos.map(repo => ({ repo, targets: repoTargets[repo.name] ?? [] }));
  const editTarget = editIdx >= 0 ? cfgTargets[editIdx] : null;

  return (
    <Shell>
      <div className="page-head">
        <div>
          <div className="page-title">Repositories <span className="counter">({repos.length})</span></div>
          <div className="page-desc">
            Repositories and their ordered Terraform targets, stored in <code>~/.config/tf9/config.yaml</code>.
            Apply and destroy run targets top-to-bottom and stop on the first failure.
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => { setAddError(''); setAddOpen(true); }}>
          <span style={{ display: 'flex' }}><IconPlus /></span>Add repository
        </button>
      </div>

      {loadError && (
        <div className="alert" style={{ background: 'var(--red-bg)', borderColor: '#f0b3b3', color: 'var(--red)' }}>
          <div>
            <div className="a-title">Couldn't load repositories</div>
            {loadError} <a style={{ cursor: 'pointer', color: 'var(--link)' }} onClick={loadRepos}>Retry</a>
          </div>
        </div>
      )}

      <div className="container flush">
        <div className="c-head">
          <div>
            <div className="c-title">All repositories</div>
            <div className="c-desc">Select a repository to configure its promotion pipeline.</div>
          </div>
        </div>
        <RepoTable
          rows={listRows}
          selected={cfgRepo?.name ?? null}
          onSelect={selectRepo}
          onConfigure={selectRepo}
          onRename={renameRepo}
          onDelete={name => setConfirmRemove(name)}
          onToggleDisabled={toggleRepoDisabled}
        />
      </div>

      {cfgRepo && (
        <div ref={cfgSectionRef}>
          {cfgError && (
            <div className="alert" style={{ background: 'var(--red-bg)', borderColor: '#f0b3b3', color: 'var(--red)' }}>
              <div><div className="a-title">Targets not saved</div>{cfgError}</div>
            </div>
          )}
          <ConfigureSection
            repo={cfgRepo}
            targets={cfgTargets}
            view={view}
            setView={setView}
            onTargetsChange={changeTargets}
            onEdit={setEditIdx}
            onAddStageGroup={onAddStageGroup}
            onDeleteTarget={setConfirmDeleteTarget}
            onDeleteGroup={key => setConfirmDeleteGroup(key)}
            toast={toast}
          />
          <div ref={browseSectionRef}>
            <BrowseSection
              browsePath={browsePath}
              browseResult={browseResult}
              targets={cfgTargets}
              onNavigate={path => cfgRepo && loadBrowse(cfgRepo.name, path)}
              onAdd={addTarget}
            />
          </div>
        </div>
      )}

      <EditStageModal
        target={editTarget}
        awsProfiles={awsProfiles}
        onSave={handleEditSave}
        onCancel={() => setEditIdx(-1)}
      />

      {addOpen && <AddRepoModal onAdd={addRepo} onCancel={() => setAddOpen(false)} error={addError} />}
      {confirmRemove && <ConfirmRemove name={confirmRemove} onConfirm={() => removeRepo(confirmRemove)} onCancel={() => setConfirmRemove(null)} />}
      {confirmDeleteGroup && (
        <ConfirmDeleteGroup
          groupKey={confirmDeleteGroup}
          count={deriveGroups(cfgTargets).find(g => g.key === confirmDeleteGroup)?.idxs.length ?? 0}
          onConfirm={() => { deleteGroup(confirmDeleteGroup); setConfirmDeleteGroup(null); }}
          onCancel={() => setConfirmDeleteGroup(null)}
        />
      )}
      {confirmDeleteTarget !== null && cfgTargets[confirmDeleteTarget] && (
        <ConfirmDeleteStage
          name={cfgTargets[confirmDeleteTarget].name}
          onConfirm={() => {
            deleteTarget(confirmDeleteTarget);
            setConfirmDeleteTarget(null);
          }}
          onCancel={() => setConfirmDeleteTarget(null)}
        />
      )}

      {toastNode}
    </Shell>
  );
}
