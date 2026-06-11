import { useEffect, useState } from 'react';
import { repoGit } from '../api';
import type { GitChangedFile, Run } from '../types';
import './RetryBranchModal.css';

const I = {
  check:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
  warn:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  pull:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M4 21h16" /></svg>,
  refresh: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>,
  close:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>,
  retry:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>,
};

function xyClass(xy: string): string {
  if (xy === '??') return 'untracked';
  const x = xy[0];
  if (x === 'A') return 'added';
  if (x === 'D' || xy[1] === 'D') return 'deleted';
  if (x === 'R') return 'renamed';
  return 'modified';
}

interface RepoStatus { branch: string; behind: number; hasRemote: boolean; changedFiles: GitChangedFile[] }

interface Props {
  run: Run;
  failedCount: number;
  onConfirm: () => void;
  onClose: () => void;
}

export default function RetryBranchModal({ run, failedCount, onConfirm, onClose }: Props) {
  const repoName = run.request.repo;

  const [branches, setBranches]     = useState<string[]>([]);
  const [repoStatus, setRepoStatus] = useState<RepoStatus | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [pulling, setPulling]       = useState(false);

  const branch = repoStatus?.branch ?? '';

  // Load on mount.
  useEffect(() => {
    if (!repoName) { setLoading(false); return; }
    Promise.all([
      repoGit.branches(repoName).catch(() => [] as string[]),
      repoGit.status(repoName).catch(() => null),
    ]).then(([b, s]) => {
      setBranches(b ?? []);
      setRepoStatus(s);
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRefresh() {
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

  async function handleCheckout(newBranch: string) {
    if (!repoName || newBranch === branch || checkingOut) return;
    setCheckingOut(true);
    try {
      await repoGit.checkout(repoName, newBranch);
      setRepoStatus(prev => prev ? { ...prev, branch: newBranch } : { branch: newBranch, behind: 0, hasRemote: false, changedFiles: [] });
      repoGit.status(repoName).then(s => { if (s) setRepoStatus(s); }).catch(() => {});
    } catch {
      // checkout failed — refresh to show real state
      repoGit.status(repoName).then(s => { if (s) setRepoStatus(s); }).catch(() => {});
    } finally {
      setCheckingOut(false);
    }
  }

  async function handlePull() {
    if (!repoName || pulling) return;
    setPulling(true);
    try {
      await repoGit.pull(repoName);
      const s = await repoGit.status(repoName).catch(() => null);
      if (s) setRepoStatus(s);
    } finally {
      setPulling(false);
    }
  }

  // Close on backdrop click.
  function onBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="run-overlay rbm-overlay" onClick={onBackdrop}>
      <div className="rbm-modal">

        {/* Header */}
        <div className="rbm-head">
          <div>
            <div className="rbm-title">Check branch before retrying</div>
            <div className="rbm-sub">
              <span className="rbm-repo">{repoName}</span>
              {' · '}
              <span className="rbm-count">{failedCount} failed target{failedCount === 1 ? '' : 's'}</span>
            </div>
          </div>
          <button className="rm-close" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>

        {/* Body */}
        <div className="rbm-body">
          {loading ? (
            <div className="rbm-loading">Loading branch status…</div>
          ) : (
            <>
              <label className="rbm-label">Branch</label>
              <div className="branch-row" style={{ marginBottom: 8 }}>
                <select
                  className="sel rbm-sel"
                  value={branch}
                  disabled={checkingOut || refreshing}
                  onChange={e => handleCheckout(e.target.value)}
                >
                  {branches.length === 0
                    ? <option value={branch}>{branch || '—'}</option>
                    : branches.map(b => <option key={b} value={b}>{b}</option>)
                  }
                </select>
                <button
                  className={`branch-refresh-btn${refreshing ? ' spinning' : ''}`}
                  title="Refresh branch status"
                  disabled={refreshing || checkingOut || pulling}
                  onClick={handleRefresh}
                >
                  {I.refresh}
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                {checkingOut ? (
                  <span className="git-pill checking"><span className="spin-xs" />Checking out…</span>
                ) : repoStatus && repoStatus.behind > 0 ? (
                  <>
                    <span className="git-pill behind">{I.warn}{repoStatus.behind} behind origin</span>
                    <button className="btn btn-normal btn-sm" disabled={pulling} onClick={handlePull}>
                      {I.pull}{pulling ? 'Pulling…' : 'Pull'}
                    </button>
                  </>
                ) : repoStatus ? (
                  <span className="git-pill ok">{I.check}Up to date</span>
                ) : null}
              </div>

              {repoStatus && repoStatus.changedFiles && repoStatus.changedFiles.length > 0 && (
                <div className="git-status-box" style={{ marginBottom: 10 }}>
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
            </>
          )}
        </div>

        {/* Footer */}
        <div className="rbm-foot">
          <button className="btn btn-normal" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-danger-outline"
            disabled={checkingOut || pulling}
            onClick={onConfirm}
          >
            {I.retry}Retry {failedCount} failed
          </button>
        </div>

      </div>
    </div>
  );
}
