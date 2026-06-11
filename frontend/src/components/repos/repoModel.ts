/**
 * Pipeline grouping + reorder helpers for the Repositories page, ported from
 * design_handoff_tfops/repos/app.js. Targets are grouped by their top-level
 * directory (or explicit `group` override); reordering rewrites the flat
 * targets array in place so each group keeps occupying the same global slots —
 * matching the prototype's promotion-order semantics exactly.
 */
import type { RepoTarget } from '../../types';

/** Prototype env-dot color (verbatim from app.js `envColor`). */
export function stageColor(t: RepoTarget): string {
  if (t.disabled) return '#8b97a3';
  const n = t.name.toLowerCase();
  if (/prod/.test(n)) return '#d91515';
  if (/stag|pre/.test(n)) return '#8d6605';
  if (/boot|global|shared/.test(n)) return '#7d4bd1';
  return '#037f0c';
}

/** group key — explicit override, else first directory segment, else "(root)". */
export function groupKeyOf(t: RepoTarget): string {
  return t.group || (t.directory || '').split('/')[0] || '(root)';
}

export interface DerivedGroup {
  key: string;
  /** indexes into the flat targets array, in promotion order */
  idxs: number[];
}

/** Group targets by their group key, preserving first-appearance order. */
export function deriveGroups(targets: RepoTarget[]): DerivedGroup[] {
  const order: DerivedGroup[] = [];
  const map: Record<string, DerivedGroup> = {};
  targets.forEach((t, gi) => {
    const k = groupKeyOf(t);
    if (!map[k]) {
      map[k] = { key: k, idxs: [] };
      order.push(map[k]);
    }
    map[k].idxs.push(gi);
  });
  return order;
}

function arrayMove<T>(a: T[], from: number, to: number): T[] {
  const x = a.splice(from, 1)[0];
  a.splice(to, 0, x);
  return a;
}

/**
 * Returns a new targets array with one item moved within its group, keeping the
 * group's global slots fixed. Positions are relative to the group order.
 */
export function reorderWithinGroup(
  targets: RepoTarget[],
  key: string,
  fromPos: number,
  toPos: number,
): RepoTarget[] {
  const next = targets.slice();
  const g = deriveGroups(next).find(x => x.key === key);
  if (!g) return next;
  if (toPos < 0 || toPos >= g.idxs.length) return next;
  const arr = g.idxs.map(i => next[i]);
  arrayMove(arr, fromPos, toPos);
  g.idxs.forEach((slot, p) => { next[slot] = arr[p]; });
  return next;
}

/** The leaf path shown on a stage card (directory minus its first segment). */
export function leafDir(directory: string): string {
  return directory.split('/').slice(1).join('/') || directory;
}
