import React from 'react';

// Minimal markdown renderer for AI insight advisories. Handles the subset the
// advisory prompt produces — headings, paragraphs, bold, inline code, bullet
// lists, horizontal rules, and pipe tables. Not a general-purpose parser.

// renderInline tokenizes **bold** and `code` within a line. A bold run that
// opens with "Heuristic" is the advisory's inference disclaimer and is flagged
// distinctly so it never reads as fact.
function renderInline(text: string, kp: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      const b = m[2];
      out.push(
        /^heuristic/i.test(b.trim())
          ? <span key={`${kp}-${i}`} className="ins-flag">{b}</span>
          : <strong key={`${kp}-${i}`}>{b}</strong>,
      );
    } else if (m[3] !== undefined) {
      out.push(<code key={`${kp}-${i}`}>{m[3]}</code>);
    }
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
}

// extractRisk returns 'low' | 'medium' | 'high' | null from insight text.
export function extractRisk(text: string): 'low' | 'medium' | 'high' | null {
  const m = /RISK:\s*(LOW|MEDIUM|HIGH)/i.exec(text);
  if (!m) return null;
  return m[1].toLowerCase() as 'low' | 'medium' | 'high';
}

export default function InsightMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let key = 0;

  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={key++} className="ins-p">{renderInline(para.join(' '), `p${key}`)}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      const items = list;
      blocks.push(
        <ul key={key++} className="ins-ul">
          {items.map((li, idx) => <li key={idx}>{renderInline(li, `l${key}-${idx}`)}</li>)}
        </ul>,
      );
      list = [];
    }
  };
  const flush = () => { flushPara(); flushList(); };

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '') { flush(); continue; }

    if (/^---+$/.test(t)) { flush(); blocks.push(<hr key={key++} className="ins-hr" />); continue; }

    if (t.startsWith('|')) {
      flush();
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i]); i++; }
      i--;
      const header = splitRow(rows[0]);
      const bodyStart = rows[1] && /^[\s|:-]+$/.test(rows[1].trim()) ? 2 : 1;
      const body = rows.slice(bodyStart).map(splitRow);
      blocks.push(
        <div key={key++} className="ins-table-wrap">
          <table className="ins-table">
            <thead><tr>{header.map((h, hi) => <th key={hi}>{renderInline(h, `th${key}-${hi}`)}</th>)}</tr></thead>
            <tbody>
              {body.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{renderInline(c, `td${key}-${ri}-${ci}`)}</td>)}</tr>)}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const h = /^(#{1,4})\s+(.*)$/.exec(t);
    if (h) {
      flush();
      const level = h[1].length;
      const num = /^(\d+)\.\s+(.*)$/.exec(h[2]);
      if (level >= 3 && num) {
        blocks.push(
          <h3 key={key++} className="ins-section">
            <span className="ins-num">{num[1]}</span>
            <span>{renderInline(num[2], `h${key}`)}</span>
          </h3>,
        );
      } else if (level <= 2) {
        blocks.push(<h2 key={key++} className="ins-h2">{renderInline(h[2], `h${key}`)}</h2>);
      } else {
        blocks.push(<h4 key={key++} className="ins-h4">{renderInline(h[2], `h${key}`)}</h4>);
      }
      continue;
    }

    const li = /^[-*]\s+(.*)$/.exec(t);
    if (li) { flushPara(); list.push(li[1]); continue; }

    const risk = /^RISK:\s*(LOW|MEDIUM|HIGH)\b(.*)/i.exec(t);
    if (risk) {
      flush();
      const level = risk[1].toUpperCase();
      const rest = risk[2].trim();
      blocks.push(
        <div key={key++} className={`ins-risk ins-risk-${level.toLowerCase()}`}>
          <span className="ins-risk-badge">{level}</span>
          {rest && <span className="ins-risk-text">{renderInline(rest, `risk${key}`)}</span>}
        </div>,
      );
      continue;
    }

    flushList();
    para.push(t);
  }
  flush();
  return <div className="ins-md">{blocks}</div>;
}
