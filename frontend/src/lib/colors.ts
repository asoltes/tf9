/**
 * Shared color helpers for tf9 UI.
 * Pure, dependency-free, synchronous utilities.
 */

/** Maps an environment/group name to a dot/badge hex color.
 *  Priority (case-insensitive substring):
 *    prod > stag > global > dev > fallback (neutral grey)
 */
export function envColor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('prod'))   return '#e5484d';
  if (n.includes('stag'))   return '#f5a623';
  if (n.includes('global')) return '#a371f7';
  if (n.includes('dev'))    return '#3fb950';
  return '#8b949e';
}

/** True when the name indicates a production target. */
export function isProd(name: string): boolean {
  return name.toLowerCase().includes('prod');
}

/** Maps a terraform command to a badge hex color.
 *  plan → green, apply → orange, destroy → red, init → blue, others → neutral grey.
 */
export function commandColor(command: string): string {
  switch (command.toLowerCase()) {
    case 'plan':    return '#3fb950';
    case 'apply':   return '#f5a623';
    case 'destroy': return '#e5484d';
    case 'init':    return '#58a6ff';
    default:        return '#8b949e';
  }
}
