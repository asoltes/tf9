/**
 * Pure helpers for AWS identity / ARN parsing.
 * Dependency-free, unit-testable.
 */

/**
 * Derive a human-readable label from an AWS ARN.
 *
 * Examples:
 *   arn:aws:sts::123456789012:assumed-role/RoleName/session → "RoleName"
 *   arn:aws:iam::123456789012:user/alice                    → "alice"
 *   arn:aws:iam::123456789012:root                          → "root"
 *   "anything/with/slashes"                                 → last segment
 *   "no-slashes"                                            → truncated whole
 */
export function identityLabel(arn: string): string {
  if (!arn) return '';

  // assumed-role: …:assumed-role/RoleName/session → return RoleName (index 1 of slash-split)
  const assumedRoleMatch = arn.match(/:assumed-role\/([^/]+)/);
  if (assumedRoleMatch) return assumedRoleMatch[1];

  // Everything else: return last slash-delimited segment
  const slashIdx = arn.lastIndexOf('/');
  if (slashIdx !== -1) return arn.slice(slashIdx + 1);

  // No slash but ARN-shaped (e.g. …:root): return the last colon segment
  if (arn.startsWith('arn:')) {
    const colonIdx = arn.lastIndexOf(':');
    if (colonIdx !== -1) return arn.slice(colonIdx + 1);
  }

  // Bare string: return it truncated to 40 chars
  return arn.length > 40 ? arn.slice(0, 37) + '…' : arn;
}
