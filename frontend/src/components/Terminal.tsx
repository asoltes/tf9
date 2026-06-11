/**
 * Terminal line renderer for the Runs split panel + fullscreen modal.
 *
 * Lines may arrive from the REAL backend SSE stream in two flavours:
 *   1. ANSI-coded (`\x1b[..m`) — terraform's normal coloured output.
 *   2. Plain text — headless runs with no ANSI; coloured by pattern match.
 *
 * Both are mapped onto the prototype's `tl-*` line classes (defined in
 * Runs.css with theme-adaptive terminal tokens) so the colours follow the
 * active light/dark theme.
 */
import { useEffect, useRef } from 'react';

const ANSI_SEQ = /\x1b\[([0-9;]*)m/g;
const STRIP_ANSI = /\x1b\[[0-9;]*[a-zA-Z]/g;

/** Strips ANSI escape codes, returning plain text. */
export function stripAnsi(s: string): string {
  return s.replace(STRIP_ANSI, '');
}

/** Maps an SGR color code (30-37/90-97) to a prototype line class. */
function ansiClass(code: number): string | undefined {
  switch (code) {
    case 31: case 91: return 'tl-del';
    case 32: case 92: return 'tl-add';
    case 33: case 93: return 'tl-chg';
    case 34: case 94: return 'tl-plan';
    case 90: case 30: return 'tl-dim';
    case 36: case 96: case 35: case 95: case 37: return 'tl-data';
    default:           return undefined;
  }
}

/** Pattern-based class for a plain (no-ANSI) line — mirrors prototype colorize(). */
export function lineClass(line: string): string {
  const t = line.replace(/^\s+/, '');
  if (/^\+ |^\+$/.test(t)) return 'tl-add';
  if (/^- |^-$/.test(t)) return 'tl-del';
  if (/^~ /.test(t)) return 'tl-chg';
  if (/^#\s/.test(t)) return 'tl-dim';
  if (/^Plan:/.test(t)) return 'tl-plan';
  if (/^(Apply complete|No changes|Destroy complete)/.test(t)) return 'tl-ok';
  if (/^Error|^\[FAILED\]/.test(t)) return 'tl-err';
  if (/^data\.|: (Creating|Creation complete|Refreshing|Still)/.test(t)) return 'tl-data';
  if (/Acquiring state lock|Reading\.\.\./.test(t)) return 'tl-dim';
  return '';
}

/** Renders a single output line (ANSI-aware) as a React node with a newline. */
export function renderLine(line: string, i: number): React.ReactNode {
  if (ANSI_SEQ.test(line)) {
    ANSI_SEQ.lastIndex = 0;
    const out: React.ReactNode[] = [];
    let cls: string | undefined;
    let last = 0;
    let m: RegExpExecArray | null;
    let key = 0;
    while ((m = ANSI_SEQ.exec(line)) !== null) {
      if (m.index > last) {
        const text = line.slice(last, m.index);
        out.push(cls ? <span key={key++} className={cls}>{text}</span> : <span key={key++}>{text}</span>);
      }
      last = m.index + m[0].length;
      for (const part of m[1].split(';')) {
        const n = parseInt(part || '0', 10);
        if (n === 0 || n === 39) cls = undefined;
        else { const c = ansiClass(n); if (c) cls = c; }
      }
    }
    if (last < line.length) {
      const text = line.slice(last);
      out.push(cls ? <span key={key++} className={cls}>{text}</span> : <span key={key++}>{text}</span>);
    }
    return <span key={i}>{out}{'\n'}</span>;
  }
  const cls = lineClass(line);
  return <span key={i} className={cls || undefined}>{line}{'\n'}</span>;
}

interface TerminalBodyProps {
  lines: string[];
  className?: string;
  style?: React.CSSProperties;
  /** Optional colored `[env]` prefix per line (Merged view). */
  prefix?: (line: string) => React.ReactNode;
  autoScroll?: boolean;
  innerRef?: React.RefObject<HTMLDivElement>;
}

/** Scrollable monospace terminal body that renders coloured output lines. */
export default function TerminalBody({ lines, className, style, prefix, autoScroll = true, innerRef }: TerminalBodyProps) {
  const localRef = useRef<HTMLDivElement>(null);
  const ref = innerRef ?? localRef;
  // Follow-mode: only autoscroll while the user is parked at the bottom. Once
  // they scroll up to inspect, stop forcing them back down; scrolling back to
  // the bottom re-arms it.
  const stickRef = useRef(true);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  useEffect(() => {
    if (autoScroll && stickRef.current && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines, autoScroll, ref]);

  return (
    <div ref={ref} className={className ?? 'tc-body'} style={style} onScroll={onScroll}>
      {lines.length === 0
        ? <span className="waiting">Waiting for output…</span>
        : lines.map((line, i) => (
            prefix
              ? <span key={i}>{prefix(line)}{renderLine(line, i)}</span>
              : renderLine(line, i)
          ))}
    </div>
  );
}
