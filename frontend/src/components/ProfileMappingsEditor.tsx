import { useEffect, useRef, useState } from 'react';
import { profileMappingsApi, awsApi } from '../api';
import type { ProfileMapping } from '../api';

const ICON_DRAG = (
  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
    <circle cx="9"  cy="5"  r="1.5" /><circle cx="15" cy="5"  r="1.5" />
    <circle cx="9"  cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
    <circle cx="9"  cy="19" r="1.5" /><circle cx="15" cy="19" r="1.5" />
  </svg>
);

const ICON_FOLDER = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const ICON_ARROW = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const ICON_AWS = (
  <svg viewBox="0 0 80 48" fill="#f90" width="22" height="14">
    <path d="M22.9 21.3c0 .9.1 1.6.3 2.1.2.5.5 1 .9 1.6.1.2.2.4.2.6 0 .3-.2.5-.5.8l-1.7 1.1c-.2.1-.4.2-.6.2-.3 0-.5-.1-.8-.4-.4-.4-.7-.8-1-1.3-.3-.5-.6-1-.8-1.6-2.1 2.5-4.7 3.7-7.8 3.7-2.2 0-4-.6-5.3-1.9-1.3-1.3-2-3-2-5 0-2.2.8-4 2.4-5.4 1.6-1.4 3.7-2 6.3-2 .9 0 1.8.1 2.7.2.9.1 1.9.4 3 .6v-1.9c0-2-.4-3.4-1.2-4.1-.8-.8-2.2-1.2-4.2-1.2-.9 0-1.8.1-2.8.3-1 .2-1.9.5-2.7.9-.4.2-.7.3-.9.3-.3 0-.5-.2-.5-.7v-1.2c0-.4.1-.6.2-.8.1-.2.4-.3.7-.5.9-.5 2-.9 3.2-1.2 1.3-.3 2.6-.5 4-.5 3 0 5.3.7 6.7 2.1 1.4 1.4 2.1 3.5 2.1 6.3v8.3zm-10.8 2.9c.8 0 1.7-.2 2.6-.5.9-.3 1.7-.9 2.4-1.6.4-.5.7-1 .8-1.6.1-.6.2-1.3.2-2.1v-1c-.8-.2-1.6-.3-2.4-.4-.8-.1-1.5-.1-2.3-.1-1.6 0-2.8.3-3.6 1-.8.6-1.2 1.5-1.2 2.7 0 1.1.3 1.9.9 2.5.5.6 1.4.9 2.5.9h.1zm19.5 2.6c-.4 0-.7-.1-.8-.2-.2-.1-.3-.4-.5-.9l-5.3-17.3c-.1-.5-.2-.9-.2-.9 0-.4.2-.6.5-.6h2.2c.4 0 .7.1.8.2.2.1.3.4.4.9l3.8 14.8 3.5-14.8c.1-.5.2-.7.4-.9.2-.1.5-.2.9-.2h1.8c.4 0 .7.1.9.2.2.1.3.4.4.9l3.5 15 3.9-15c.1-.5.3-.7.4-.9.2-.1.5-.2.8-.2h2.1c.4 0 .6.2.6.6 0 .1 0 .2-.1.4l-.1.5-5.4 17.3c-.1.5-.3.7-.5.9-.2.1-.5.2-.8.2h-1.9c-.4 0-.7-.1-.9-.2-.2-.2-.3-.4-.4-.9l-3.5-14.5-3.5 14.5c-.1.5-.2.7-.4.9-.2.1-.5.2-.9.2h-1.9zm28.8.6c-1.3 0-2.6-.2-3.9-.5-1.3-.3-2.2-.7-2.9-1.1-.4-.2-.6-.5-.7-.7-.1-.2-.1-.5-.1-.7v-1.2c0-.5.2-.7.6-.7.1 0 .3 0 .4.1.1.1.3.1.5.2.7.3 1.5.6 2.4.7.9.2 1.7.3 2.6.3 1.4 0 2.4-.2 3.2-.7.7-.5 1.1-1.1 1.1-2 0-.6-.2-1.1-.6-1.5-.4-.4-1.1-.8-2.2-1.1l-3.2-.9c-1.6-.5-2.8-1.2-3.5-2.2-.7-.9-1.1-1.9-1.1-3.1 0-.9.2-1.7.6-2.4.4-.7.9-1.4 1.6-1.9.7-.5 1.4-.9 2.3-1.1.9-.3 1.8-.4 2.8-.4.5 0 1 .1 1.5.1.5.1 1 .2 1.5.3.4.1.9.2 1.3.4.4.2.7.3.9.4.3.2.5.4.6.6.1.2.2.5.2.8v1.1c0 .5-.2.7-.6.7-.2 0-.5-.1-.9-.3-1.4-.6-2.9-.9-4.5-.9-1.2 0-2.2.2-2.9.6-.7.4-1 1.1-1 2 0 .6.2 1.1.7 1.5.4.4 1.3.8 2.4 1.2l3.1 1c1.6.5 2.7 1.2 3.4 2.1.7.9 1 1.9 1 3 0 .9-.2 1.8-.6 2.5-.4.8-.9 1.4-1.6 1.9-.7.5-1.5.9-2.5 1.2-1 .5-2.2.7-3.4.7z"/>
  </svg>
);

const ICON_TRASH = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6M9 6V4h6v2" />
  </svg>
);

const ICON_CHECK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export default function ProfileMappingsEditor({ onSaved }: { onSaved?: () => void }) {
  const [rows, setRows]       = useState<ProfileMapping[]>([]);
  const [profiles, setProfiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // drag state
  const dragIdx  = useRef<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([profileMappingsApi.get(), awsApi.profiles()])
      .then(([mappings, profs]) => {
        if (!active) return;
        setRows(mappings ?? []);
        setProfiles(profs ?? []);
      })
      .catch(() => { if (active) setError('Failed to load profile mappings.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function addRow() {
    setRows(prev => [...prev, { dir: '', profile: profiles[0] ?? '' }]);
    setSavedOk(false);
  }

  function deleteRow(i: number) {
    setRows(prev => prev.filter((_, idx) => idx !== i));
    setSavedOk(false);
  }

  function updateDir(i: number, val: string) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, dir: val } : r));
    setSavedOk(false);
  }

  function updateProfile(i: number, val: string) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, profile: val } : r));
    setSavedOk(false);
  }

  // ── drag handlers ────────────────────────────────────────────────
  function onDragStart(e: React.DragEvent, i: number) {
    dragIdx.current = i;
    e.dataTransfer.effectAllowed = 'move';
    // ghost image: use the row itself
    e.dataTransfer.setDragImage(e.currentTarget, 20, 20);
  }

  function onDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (i !== overIdx) setOverIdx(i);
  }

  function onDrop(e: React.DragEvent, i: number) {
    e.preventDefault();
    const from = dragIdx.current;
    if (from === null || from === i) { reset(); return; }
    setRows(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(i, 0, moved);
      return next;
    });
    setSavedOk(false);
    reset();
  }

  function reset() {
    dragIdx.current = null;
    setOverIdx(null);
  }

  async function handleSave() {
    const clean = rows.filter(r => r.dir.trim() !== '');
    setSaving(true);
    setError(null);
    setSavedOk(false);
    try {
      await profileMappingsApi.save(clean);
      setRows(clean);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ padding: '20px', color: 'var(--text-2)', fontSize: 13 }}>Loading…</div>;
  }

  return (
    <div>
      {/* header row */}
      {rows.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '28px 32px 1fr 28px 1fr 36px',
          gap: 8,
          padding: '0 20px 6px',
          alignItems: 'center',
        }}>
          <div />
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textAlign: 'center' }}>#</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', paddingLeft: 28 }}>Directory</div>
          <div />
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', paddingLeft: 28 }}>AWS Profile</div>
          <div />
        </div>
      )}

      {/* rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: rows.length ? '0 20px 12px' : '0 20px 0' }}>
        {rows.length === 0 ? (
          <div style={{
            padding: '22px 16px',
            borderRadius: 8,
            border: '1px dashed var(--border)',
            background: 'var(--surface-2)',
            color: 'var(--text-2)',
            fontSize: 13,
            textAlign: 'center',
          }}>
            No mappings yet. Add a row to map directory names to AWS profiles.
          </div>
        ) : rows.map((row, i) => (
          <div
            key={i}
            draggable
            onDragStart={e => onDragStart(e, i)}
            onDragOver={e => onDragOver(e, i)}
            onDrop={e => onDrop(e, i)}
            onDragEnd={reset}
            style={{
              display: 'grid',
              gridTemplateColumns: '28px 32px 1fr 28px 1fr 36px',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              borderRadius: 8,
              border: `1px solid ${overIdx === i ? 'var(--blue)' : 'var(--border)'}`,
              background: overIdx === i ? 'color-mix(in srgb, var(--blue) 6%, var(--surface-1))' : 'var(--surface-1)',
              opacity: dragIdx.current === i ? 0.4 : 1,
              transition: 'border-color .12s, background .12s',
              cursor: 'default',
            }}
          >
            {/* drag handle */}
            <div
              title="Drag to reorder"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-2)',
                cursor: 'grab',
                userSelect: 'none',
              }}
            >
              {ICON_DRAG}
            </div>

            {/* row number badge */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: 'var(--surface-3)',
              border: '1px solid var(--border)',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text-2)',
              flexShrink: 0,
            }}>
              {i + 1}
            </div>

            {/* directory input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ color: 'var(--text-2)', flexShrink: 0, display: 'flex' }}>{ICON_FOLDER}</span>
              <input
                type="text"
                value={row.dir}
                onChange={e => updateDir(i, e.target.value)}
                placeholder="Directory name  (e.g. dev)"
                style={{
                  flex: 1,
                  padding: '5px 9px',
                  fontSize: 13,
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                  outline: 'none',
                  fontFamily: 'var(--font-mono, monospace)',
                  minWidth: 0,
                }}
              />
            </div>

            {/* arrow */}
            <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-2)', flexShrink: 0 }}>
              {ICON_ARROW}
            </div>

            {/* profile select */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{ICON_AWS}</span>
              <select
                value={row.profile}
                onChange={e => updateProfile(i, e.target.value)}
                style={{
                  flex: 1,
                  padding: '5px 9px',
                  fontSize: 13,
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                  outline: 'none',
                  cursor: 'pointer',
                  minWidth: 0,
                }}
              >
                <option value="">— select profile —</option>
                {profiles.map(p => <option key={p} value={p}>{p}</option>)}
                {row.profile && !profiles.includes(row.profile) && (
                  <option value={row.profile}>{row.profile}</option>
                )}
              </select>
            </div>

            {/* delete */}
            <button
              title="Remove"
              onClick={() => deleteRow(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-2)',
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'color .12s, background .12s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--red)';
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)';
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              {ICON_TRASH}
            </button>
          </div>
        ))}
      </div>

      {/* footer actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px 20px' }}>
        <button className="btn btn-normal btn-sm" onClick={addRow}>+ Add mapping</button>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {savedOk && (
          <span style={{ fontSize: 13, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {ICON_CHECK} Saved
          </span>
        )}
        {error && <span style={{ fontSize: 13, color: 'var(--red)' }}>{error}</span>}
        {rows.length > 1 && !savedOk && !error && (
          <span style={{ fontSize: 12, color: 'var(--text-2)', marginLeft: 'auto' }}>
            Drag rows to set execution order
          </span>
        )}
      </div>
    </div>
  );
}
