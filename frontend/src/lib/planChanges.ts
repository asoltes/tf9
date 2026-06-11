import { stripAnsi } from './runStatus';

export interface ResourceChange {
  action: 'add' | 'change' | 'destroy' | 'replace';
  resource: string;
  blockLines: string[];
}

export function parseResourceChanges(lines: string[]): ResourceChange[] {
  const segments: { hdr: string; lines: string[] }[] = [];
  let cur: string[] | null = null;
  let hdr = '';
  for (const line of lines) {
    const t = stripAnsi(line).trimStart();
    if (t.startsWith('#')) {
      if (cur !== null) segments.push({ hdr, lines: cur });
      hdr = t;
      cur = [line];
    } else if (cur !== null) {
      cur.push(line);
    }
  }
  if (cur !== null) segments.push({ hdr, lines: cur });

  const out: ResourceChange[] = [];
  for (const seg of segments) {
    const addrM = seg.hdr.match(/^#\s+(.+?)\s+(?:will|must|has)\s+/);
    if (!addrM) continue;
    const resource = addrM[1];

    let action: ResourceChange['action'] | null = null;
    for (const line of seg.lines) {
      const t = stripAnsi(line).trimStart();
      if (/\b(?:resource|module)\b/.test(t)) {
        if (t.startsWith('-/+') || t.startsWith('+/-')) { action = 'replace'; break; }
        if (t.startsWith('+'))                           { action = 'add';     break; }
        if (t.startsWith('-'))                           { action = 'destroy'; break; }
        if (t.startsWith('~'))                           { action = 'change';  break; }
      }
    }
    if (action === null) continue;
    out.push({ action, resource, blockLines: seg.lines });
  }
  return out;
}

export function rctBadgeLabel(a: ResourceChange['action']): string {
  if (a === 'add')     return '+ add';
  if (a === 'destroy') return '− destroy';
  if (a === 'replace') return '± replace';
  return '~ change';
}
