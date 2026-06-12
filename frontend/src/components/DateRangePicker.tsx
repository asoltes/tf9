import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  fromLocalDay, presetRange, toLocalDay, validateRange,
  type DatePreset,
} from '../lib/runFilters';
import './DateRangePicker.css';

interface DateRangePickerProps {
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
}

const ICON_CAL = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="15" height="15" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const PRESETS: { key: DatePreset | 'all'; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
];

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function dayLabel(day: string): string {
  const d = fromLocalDay(day);
  return d ? d.toLocaleDateString(undefined, { dateStyle: 'long' }) : day;
}

/** All cells for the month grid of `view`, padded to full Monday-first weeks. */
function monthCells(view: Date): { day: string; inMonth: boolean }[] {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // days before the 1st, Monday-first
  const start = new Date(view.getFullYear(), view.getMonth(), 1 - lead);
  const cells: { day: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({ day: toLocalDay(d), inMonth: d.getMonth() === view.getMonth() });
  }
  return cells;
}

export default function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(() => fromLocalDay(from ?? '') ?? new Date());
  const [focusDay, setFocusDay] = useState<string>(() => from ?? toLocalDay(new Date()));
  const [fromDraft, setFromDraft] = useState(from ?? '');
  const [toDraft, setToDraft] = useState(to ?? '');
  const [inputError, setInputError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const errorId = useId();
  const today = toLocalDay(new Date());

  // Keep drafts in sync when the applied range changes externally (chips, clear all).
  useEffect(() => { setFromDraft(from ?? ''); setToDraft(to ?? ''); setInputError(null); }, [from, to]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const cells = useMemo(() => monthCells(view), [view]);

  function applyDays(nextFrom: string | null, nextTo: string | null) {
    setInputError(null);
    onChange(nextFrom, nextTo);
  }

  function pickDay(day: string) {
    if (!from || (from && to)) {
      applyDays(day, null);            // start a new range
    } else if (day < from) {
      applyDays(day, from);            // picked backwards — swap
    } else {
      applyDays(from, day);            // complete the range
    }
    setFocusDay(day);
  }

  function applyPreset(key: DatePreset | 'all') {
    if (key === 'all') {
      applyDays(null, null);
    } else {
      const r = presetRange(key);
      applyDays(r.from, r.to);
      const d = fromLocalDay(r.from);
      if (d) { setView(new Date(d.getFullYear(), d.getMonth(), 1)); setFocusDay(r.from); }
    }
  }

  function commitInputs() {
    const f = fromDraft.trim() || null;
    const t = toDraft.trim() || null;
    const err = validateRange({ from: f, to: t, commands: [], statuses: [] });
    if (err) { setInputError(err); return; }
    setInputError(null);
    applyDays(f, t);
    const d = fromLocalDay(f ?? t ?? '');
    if (d) { setView(new Date(d.getFullYear(), d.getMonth(), 1)); setFocusDay(toLocalDay(d)); }
  }

  function moveFocus(deltaDays: number) {
    const cur = fromLocalDay(focusDay) ?? new Date();
    const next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + deltaDays);
    const day = toLocalDay(next);
    setFocusDay(day);
    if (next.getMonth() !== view.getMonth() || next.getFullYear() !== view.getFullYear()) {
      setView(new Date(next.getFullYear(), next.getMonth(), 1));
    }
    // Focus lands after re-render.
    requestAnimationFrame(() => {
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${day}"]`)?.focus();
    });
  }

  function onGridKeyDown(e: React.KeyboardEvent) {
    const moves: Record<string, number> = {
      ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, PageUp: -30, PageDown: 30,
    };
    if (e.key in moves) { e.preventDefault(); moveFocus(moves[e.key]); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickDay(focusDay); }
  }

  function onPopoverKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  const summary = from && to
    ? (from === to ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}`)
    : from ? `From ${dayLabel(from)}` : to ? `Until ${dayLabel(to)}` : 'All time';

  const rows = [];
  for (let r = 0; r < 6; r++) rows.push(cells.slice(r * 7, r * 7 + 7));

  return (
    <div className="drp" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`drp-trigger${from || to ? ' has-value' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {ICON_CAL}
        <span className="drp-trigger-label">{summary}</span>
      </button>

      {open && (
        <div className="drp-pop" role="dialog" aria-label="Filter by date range" onKeyDown={onPopoverKeyDown}>
          <div className="drp-presets" role="group" aria-label="Date presets">
            {PRESETS.map(p => (
              <button key={p.key} type="button" className="drp-preset" onClick={() => applyPreset(p.key)}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="drp-main">
            <div className="drp-inputs">
              <label>
                <span className="drp-input-label">Start date</span>
                <input
                  className="inp drp-input"
                  placeholder="YYYY-MM-DD"
                  value={fromDraft}
                  aria-invalid={!!inputError}
                  aria-describedby={inputError ? errorId : undefined}
                  onChange={e => setFromDraft(e.target.value)}
                  onBlur={commitInputs}
                  onKeyDown={e => { if (e.key === 'Enter') commitInputs(); }}
                />
              </label>
              <label>
                <span className="drp-input-label">End date</span>
                <input
                  className="inp drp-input"
                  placeholder="YYYY-MM-DD"
                  value={toDraft}
                  aria-invalid={!!inputError}
                  aria-describedby={inputError ? errorId : undefined}
                  onChange={e => setToDraft(e.target.value)}
                  onBlur={commitInputs}
                  onKeyDown={e => { if (e.key === 'Enter') commitInputs(); }}
                />
              </label>
            </div>
            {inputError && <div className="drp-error" id={errorId} role="alert">{inputError}</div>}

            <div className="drp-cal-head">
              <button
                type="button" className="drp-nav" aria-label="Previous month"
                onClick={() => setView(v => new Date(v.getFullYear(), v.getMonth() - 1, 1))}
              >‹</button>
              <span className="drp-month" aria-live="polite">{monthLabel(view)}</span>
              <button
                type="button" className="drp-nav" aria-label="Next month"
                onClick={() => setView(v => new Date(v.getFullYear(), v.getMonth() + 1, 1))}
              >›</button>
            </div>

            <div className="drp-grid" role="grid" aria-label={monthLabel(view)} ref={gridRef} onKeyDown={onGridKeyDown}>
              <div className="drp-row drp-weekdays" role="row">
                {WEEKDAYS.map(w => <span key={w} role="columnheader" className="drp-wd">{w}</span>)}
              </div>
              {rows.map((row, ri) => (
                <div className="drp-row" role="row" key={ri}>
                  {row.map(({ day, inMonth }) => {
                    const isStart = day === from;
                    const isEnd = day === to;
                    const inRange = !!from && !!to && day > from && day < to;
                    const cls = [
                      'drp-day',
                      inMonth ? '' : 'out',
                      isStart || isEnd ? 'sel' : '',
                      isStart ? 'start' : '',
                      isEnd ? 'end' : '',
                      inRange ? 'range' : '',
                      day === today ? 'today' : '',
                    ].filter(Boolean).join(' ');
                    return (
                      <button
                        key={day}
                        type="button"
                        role="gridcell"
                        data-day={day}
                        className={cls}
                        tabIndex={day === focusDay ? 0 : -1}
                        aria-selected={isStart || isEnd || inRange}
                        aria-label={`${dayLabel(day)}${isStart ? ', range start' : isEnd ? ', range end' : ''}${day === today ? ', today' : ''}`}
                        onClick={() => pickDay(day)}
                      >
                        {Number(day.slice(8))}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="drp-foot">
              <span className="drp-summary" aria-live="polite">{summary}</span>
              <button
                type="button"
                className="btn btn-link btn-sm"
                disabled={!from && !to}
                onClick={() => applyDays(null, null)}
              >
                Clear dates
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
