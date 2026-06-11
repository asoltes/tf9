/**
 * Pure helpers for the Repo list page: mini pipeline preview derivation,
 * enabled count, distinct AWS profiles.
 *
 * Dependency-free and synchronous so they can be unit-tested in isolation.
 */
import type { RepoTarget } from '../types';
import { groupKey } from './runPreview';
import { envColor } from './colors';

export interface MiniPipelineDot {
  name: string;
  color: string;
}

/** Re-export groupKey as groupOf for consumers that prefer that name. */
export { groupKey as groupOf } from './runPreview';

/**
 * Returns mini-pipeline dots (one per enabled target, in order) for the
 * repo-list preview strip.
 */
export function miniPipelineDots(targets: RepoTarget[]): MiniPipelineDot[] {
  return targets
    .filter(t => !t.disabled)
    .map(t => ({ name: t.name, color: envColor(t.name) }));
}

/**
 * Returns the number of enabled targets out of the total.
 */
export function enabledCount(targets: RepoTarget[]): { enabled: number; total: number } {
  return {
    enabled: targets.filter(t => !t.disabled).length,
    total: targets.length,
  };
}

/**
 * Returns distinct AWS profiles used across the targets.
 */
export function distinctProfiles(targets: RepoTarget[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of targets) {
    if (t.aws_profile && !seen.has(t.aws_profile)) {
      seen.add(t.aws_profile);
      out.push(t.aws_profile);
    }
  }
  return out;
}

/**
 * Returns existing group names across all targets (for datalist autocomplete).
 */
export function existingGroups(targets: RepoTarget[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of targets) {
    const g = groupKey(t);
    if (g && !seen.has(g)) {
      seen.add(g);
      out.push(g);
    }
  }
  return out;
}

