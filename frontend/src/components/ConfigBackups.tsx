import { useCallback, useEffect, useState } from 'react';
import { backupsApi, type ConfigBackup } from '../api';
import { relativeTime } from '../lib/relativeTime';
import ConfirmModal from './ConfirmModal';
import { IconList, IconDown, IconTrash } from './repos/icons';

/**
 * Backups panel for the Configuration page. Lists the rolling config.yaml
 * snapshots (auto-created before every write, plus on demand) and lets the user
 * take a manual backup or restore a prior one. Restore overwrites config.yaml
 * after snapshotting the current state, so it is itself undoable.
 */
export default function ConfigBackups({
  notify,
  onRestored,
}: {
  notify: (message: string) => void;
  onRestored: () => Promise<void>;
}) {
  const [backups, setBackups] = useState<ConfigBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [confirmName, setConfirmName] = useState<string | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await backupsApi.list();
      setBackups(res.backups ?? []);
    } catch {
      /* a backup-list failure is non-fatal; leave the prior list shown */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function backupNow() {
    setBusy(true);
    try {
      const res = await backupsApi.create();
      setBackups(res.backups ?? []);
      notify('Backup created');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not create backup');
    } finally {
      setBusy(false);
    }
  }

  async function restore(name: string) {
    setBusy(true);
    try {
      await backupsApi.restore(name);
      await onRestored();
      await refresh();
      notify('Configuration restored from backup');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not restore backup');
    } finally {
      setBusy(false);
      setConfirmName(null);
    }
  }

  async function remove(name: string) {
    setBusy(true);
    try {
      const res = await backupsApi.remove(name);
      setBackups(res.backups ?? []);
      notify('Backup deleted');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not delete backup');
    } finally {
      setBusy(false);
      setConfirmDeleteName(null);
    }
  }

  function fmtSize(bytes: number): string {
    return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
  }

  return (
    <section className="container config-backups" aria-labelledby="config-backups-title">
      <div className="c-head">
        <div>
          <div className="c-title" id="config-backups-title">Backups</div>
          <div className="c-desc">
            Snapshots of <code>config.yaml</code>, taken automatically before every change and kept (most recent 20). Restore overwrites the live file after backing up the current state.
          </div>
        </div>
        <button className="btn btn-normal btn-sm" disabled={busy} onClick={() => void backupNow()}>
          {busy ? 'Working…' : 'Back up now'}
        </button>
      </div>

      <div className="config-backups-body">
        {loading ? (
          <p className="config-backups-empty">Loading backups…</p>
        ) : backups.length === 0 ? (
          <p className="config-backups-empty">
            <span className="config-backups-icon"><IconList /></span>
            No backups yet. One is created automatically the next time the configuration changes.
          </p>
        ) : (
          <>
            <button
              type="button"
              className="config-backups-toggle"
              aria-expanded={expanded}
              onClick={() => setExpanded(v => !v)}
            >
              <span className={'config-backups-chevron' + (expanded ? ' open' : '')}><IconDown /></span>
              <span className="config-backups-summary">
                {backups.length} backup{backups.length === 1 ? '' : 's'}
              </span>
              <span className="config-backups-latest">latest {relativeTime(backups[0].modTime)}</span>
            </button>
            {expanded && (
              <ul className="config-backups-list">
                {backups.map(b => (
                  <li key={b.name} className="config-backup-row">
                    <div className="config-backup-meta">
                      <span className="config-backup-name mono">{b.name}</span>
                      <span className="config-backup-sub">{relativeTime(b.modTime)} · {fmtSize(b.size)}</span>
                    </div>
                    <div className="config-backup-actions">
                      <button
                        className="btn btn-normal btn-sm"
                        disabled={busy}
                        onClick={() => setConfirmName(b.name)}
                      >
                        Restore
                      </button>
                      <button
                        className="btn btn-icon config-backup-delete"
                        disabled={busy}
                        aria-label={`Delete backup ${b.name}`}
                        title="Delete backup"
                        onClick={() => setConfirmDeleteName(b.name)}
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <ConfirmModal
        visible={confirmName !== null}
        header="Restore configuration"
        confirmLabel="Restore"
        confirmVariant="primary"
        loading={busy}
        onConfirm={() => confirmName && void restore(confirmName)}
        onCancel={() => setConfirmName(null)}
      >
        <p style={{ margin: 0 }}>
          Replace the current <code>config.yaml</code> with <span className="mono">{confirmName}</span>?
          The current configuration is backed up first, so you can undo this.
        </p>
      </ConfirmModal>

      <ConfirmModal
        visible={confirmDeleteName !== null}
        header="Delete backup"
        confirmLabel="Delete"
        confirmVariant="normal"
        loading={busy}
        onConfirm={() => confirmDeleteName && void remove(confirmDeleteName)}
        onCancel={() => setConfirmDeleteName(null)}
      >
        <p style={{ margin: 0 }}>
          Permanently delete <span className="mono">{confirmDeleteName}</span>? This cannot be undone.
        </p>
      </ConfirmModal>
    </section>
  );
}
