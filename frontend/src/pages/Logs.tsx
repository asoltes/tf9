import { useState, useEffect, useCallback, useRef } from 'react';
import Shell from '../Shell';
import { logsApi } from '../api';
import type { LogLevel } from '../types';
import './Logs.css';

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

// Classify a log line by its level= field so rows can be tinted.
function lineLevel(line: string): LogLevel | 'other' {
  const m = line.match(/level=([A-Z]+)/);
  if (!m) return 'other';
  switch (m[1]) {
    case 'DEBUG': return 'debug';
    case 'INFO':  return 'info';
    case 'WARN':  return 'warn';
    case 'ERROR': return 'error';
    default:      return 'other';
  }
}

export default function LogsPage() {
  const [lines, setLines] = useState<string[]>([]);
  const [level, setLevel] = useState<LogLevel>('info');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [savingLevel, setSavingLevel] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  const load = useCallback(() => {
    logsApi.get(500)
      .then(res => {
        setLines(res?.lines ?? []);
        setLevel(res?.level ?? 'info');
        setError(null);
        setLoading(false);
      })
      .catch(e => {
        setError(e instanceof Error ? e.message : 'Failed to load logs.');
        setLoading(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  // Keep the view pinned to the newest lines unless the user scrolled up.
  useEffect(() => {
    const el = bodyRef.current;
    if (el && pinnedToBottom.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  function onScroll() {
    const el = bodyRef.current;
    if (!el) return;
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  function changeLevel(next: LogLevel) {
    if (next === level || savingLevel) return;
    setSavingLevel(true);
    logsApi.setLevel(next)
      .then(res => { setLevel(res?.level ?? next); load(); })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to set level.'))
      .finally(() => setSavingLevel(false));
  }

  return (
    <Shell>
      <div className="logs-page">
        <div className="logs-head">
          <div>
            <div className="page-title">
              Logs <span className="counter">({lines.length})</span>
            </div>
            <div className="page-desc">
              Application logs from <code>tf9 serve</code> — also written to the log file on disk.
            </div>
          </div>
        </div>

        <div className="logs-toolbar">
          <div className="logs-level">
            <span className="logs-level-label">Level</span>
            {LEVELS.map(l => (
              <button
                key={l}
                className={`logs-level-btn${level === l ? ' on' : ''}`}
                disabled={savingLevel}
                onClick={() => changeLevel(l)}
              >
                {l}
              </button>
            ))}
          </div>
          <span className="logs-spacer" />
          <label className="logs-auto">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button className="logs-refresh" onClick={load}>Refresh</button>
        </div>

        {error && <div className="logs-error">{error}</div>}

        <div className="logs-body" ref={bodyRef} onScroll={onScroll}>
          {loading && lines.length === 0 ? (
            <div className="logs-empty">Loading logs…</div>
          ) : lines.length === 0 ? (
            <div className="logs-empty">No log lines yet.</div>
          ) : (
            lines.map((line, i) => (
              <div key={i} className={`logs-line lvl-${lineLevel(line)}`}>{line}</div>
            ))
          )}
        </div>
      </div>
    </Shell>
  );
}
