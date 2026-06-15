import { useEffect, useRef, useState } from 'react';
import { awsApi } from '../api';
import type { Identity } from '../types';
import './StsBadge.css';

type AuthState = 'checking' | 'ok' | 'fail';
type ActionState = 'idle' | 'running' | 'done' | 'error' | 'logging-out';

const MIN_CHECK_MS = 900;
const STS_PROFILE_KEY = 'tf9-sts-profile';

export default function StsBadge() {
  const [state, setState] = useState<AuthState>('checking');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [popover, setPopover] = useState(false);
  const [profiles, setProfiles] = useState<string[]>([]);
  const [selectedProfile, setSelectedProfile] = useState(() => localStorage.getItem(STS_PROFILE_KEY) ?? '');
  const [actionState, setActionState] = useState<ActionState>('idle');
  const [loginLines, setLoginLines] = useState<string[]>([]);
  const termRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  function runCheck(profile?: string) {
    const start = Date.now();
    setState('checking');
    setIdentity(null);
    awsApi
      .identity(profile)
      .then((id) => {
        const delay = Math.max(0, MIN_CHECK_MS - (Date.now() - start));
        setTimeout(() => { setIdentity(id); setState('ok'); }, delay);
      })
      .catch(() => {
        const delay = Math.max(0, MIN_CHECK_MS - (Date.now() - start));
        setTimeout(() => setState('fail'), delay);
      });
  }

  useEffect(() => {
    runCheck(selectedProfile || undefined);
    awsApi.profiles().then(p => setProfiles(p ?? [])).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Selecting a profile re-checks identity against it and persists the choice
  // so the badge reflects the chosen profile on subsequent loads.
  function handleProfileChange(profile: string) {
    setSelectedProfile(profile);
    if (profile) localStorage.setItem(STS_PROFILE_KEY, profile);
    else localStorage.removeItem(STS_PROFILE_KEY);
    runCheck(profile || undefined);
  }

  // Auto-scroll terminal output.
  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [loginLines]);

  // Close popover on outside click.
  useEffect(() => {
    if (!popover) return;
    function onDown(e: MouseEvent) {
      const el = document.getElementById('sts-popover');
      if (el && !el.contains(e.target as Node)) setPopover(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [popover]);

  function handleBadgeClick() {
    if (state === 'checking') return;
    setPopover(p => !p);
    if (!popover) {
      setActionState('idle');
      setLoginLines([]);
    }
  }

  function startLogin() {
    if (actionState === 'running') return;
    esRef.current?.close();
    setActionState('running');
    setLoginLines([]);

    const profile = selectedProfile || identity?.profile || '';
    const qs = profile ? `?profile=${encodeURIComponent(profile)}` : '';
    const es = new EventSource(`/api/aws/sso-login${qs}`);
    esRef.current = es;

    es.onmessage = (e) => {
      let line: string;
      try { line = JSON.parse(`"${e.data}"`); } catch { line = e.data; }
      setLoginLines(prev => [...prev, line]);
    };

    es.addEventListener('url', (e: MessageEvent) => {
      // aws sso login couldn't open the browser itself — open from the JS context instead.
      window.open(e.data, '_blank', 'noopener');
    });

    es.addEventListener('done', (e: MessageEvent) => {
      es.close();
      esRef.current = null;
      const success = e.data === 'ok';
      setActionState(success ? 'done' : 'error');
      if (success) {
        setTimeout(() => {
          runCheck(profile || undefined);
          setPopover(false);
          setActionState('idle');
          setLoginLines([]);
        }, 800);
      }
    });

    es.onerror = () => {
      es.close();
      esRef.current = null;
      setActionState('error');
      setLoginLines(prev => [...prev, '[Connection lost]']);
    };
  }

  async function startLogout() {
    if (actionState === 'logging-out') return;
    setActionState('logging-out');
    const profile = selectedProfile || identity?.profile || '';
    try {
      await awsApi.logout(profile || undefined);
      setState('fail');
      setIdentity(null);
      setActionState('idle');
      setLoginLines([]);
    } catch {
      setActionState('error');
    }
  }

  function closePopover() {
    esRef.current?.close();
    esRef.current = null;
    setPopover(false);
    setActionState('idle');
    setLoginLines([]);
  }

  const profileName = identity?.profile || '';
  const label = state === 'ok' && profileName ? profileName : {
    checking: 'Checking…',
    ok: 'Authenticated',
    fail: 'Session expired',
  }[state];
  const title = state === 'ok' && identity
    ? `${profileName ? `Profile: ${profileName} · ` : ''}${identity.arn}`
    : state === 'fail'
      ? 'SSO token expired — click to re-authenticate'
      : 'AWS STS · Checking…';

  const busy = actionState === 'running' || actionState === 'logging-out';

  return (
    <div style={{ position: 'relative' }}>
      <div
        className={`sts-badge ${state}`}
        title={title}
        role="button"
        tabIndex={0}
        onClick={handleBadgeClick}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && state !== 'checking') {
            e.preventDefault();
            handleBadgeClick();
          }
        }}
      >
        <span className="sts-dot" />
        <span className="sts-lbl">{label}</span>
      </div>

      {popover && (
        <div id="sts-popover" className="sts-popover">
          <div className="ssp-head">
            <span className="ssp-title">
              {state === 'ok' ? 'AWS session' : 'Re-authenticate with AWS SSO'}
            </span>
            <button className="ssp-close" onClick={closePopover}>✕</button>
          </div>

          {state === 'ok' && identity && (
            <div className="ssp-identity">
              <div className="ssp-id-row"><span className="ssp-id-k">Profile</span><span className="ssp-id-v mono">{identity.profile || 'default'}</span></div>
              {identity.account && <div className="ssp-id-row"><span className="ssp-id-k">Account</span><span className="ssp-id-v mono">{identity.account}</span></div>}
              {identity.arn && <div className="ssp-id-row"><span className="ssp-id-k">ARN</span><span className="ssp-id-v mono ssp-arn">{identity.arn}</span></div>}
            </div>
          )}

          <div className="ssp-row">
            <label className="ssp-label">Profile</label>
            <select
              className="ssp-sel"
              value={selectedProfile || identity?.profile || ''}
              onChange={e => handleProfileChange(e.target.value)}
              disabled={busy}
            >
              {profiles.length === 0 && <option value="">default</option>}
              {profiles.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {loginLines.length > 0 && (
            <div className="ssp-term" ref={termRef}>
              {loginLines.map((l, i) => <div key={i} className="ssp-line">{l}</div>)}
            </div>
          )}

          {actionState === 'error' && (
            <div className="ssp-msg error">
              {actionState === 'error' ? 'Operation failed — check output above.' : ''}
            </div>
          )}

          <div className="ssp-foot">
            {actionState === 'running' ? (
              <button className="ssp-btn running" disabled>
                <span className="ssp-spin" />Waiting for browser…
              </button>
            ) : actionState === 'done' ? (
              <button className="ssp-btn ok" disabled>Authenticated ✓</button>
            ) : actionState === 'logging-out' ? (
              <button className="ssp-btn running" disabled>
                <span className="ssp-spin" />Logging out…
              </button>
            ) : (
              <div className="ssp-actions">
                <button className="ssp-btn primary" onClick={startLogin} disabled={busy}>
                  {state === 'ok' ? 'Reauthenticate' : 'Login with SSO'}
                </button>
                {state === 'ok' && (
                  <button className="ssp-btn danger" onClick={startLogout} disabled={busy}>
                    Logout
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
