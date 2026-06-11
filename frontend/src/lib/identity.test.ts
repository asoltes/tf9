/**
 * Unit tests for identity.ts
 * Requires vitest — run with: npm run test
 * (vitest is not yet configured in this project)
 */
import { describe, it, expect } from 'vitest';
import { identityLabel } from './identity';

describe('identityLabel', () => {
  it('extracts role name from assumed-role ARN', () => {
    expect(identityLabel('arn:aws:sts::123456789012:assumed-role/MyRole/my-session')).toBe('MyRole');
    expect(identityLabel('arn:aws:sts::123456789012:assumed-role/AdminRole/cli-session')).toBe('AdminRole');
  });

  it('ignores session name for assumed-role', () => {
    expect(identityLabel('arn:aws:sts::123456789012:assumed-role/DevRole/dev-session-123')).toBe('DevRole');
  });

  it('extracts username from IAM user ARN', () => {
    expect(identityLabel('arn:aws:iam::123456789012:user/alice')).toBe('alice');
    expect(identityLabel('arn:aws:iam::123456789012:user/bob.smith')).toBe('bob.smith');
  });

  it('handles root ARN (no slash after type)', () => {
    // "arn:aws:iam::123456789012:root" has no slash after colon — returns "root"
    expect(identityLabel('arn:aws:iam::123456789012:root')).toBe('root');
  });

  it('returns last slash segment for arbitrary ARNs', () => {
    expect(identityLabel('arn:aws:iam::123456789012:role/some/nested/RoleName')).toBe('RoleName');
  });

  it('returns empty string for empty input', () => {
    expect(identityLabel('')).toBe('');
  });

  it('returns truncated value when no slash and arn is long', () => {
    const longArn = 'a'.repeat(50);
    const result = identityLabel(longArn);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result.endsWith('…')).toBe(true);
  });

  it('returns full value when no slash and arn is short', () => {
    const shortArn = 'short-arn';
    expect(identityLabel(shortArn)).toBe('short-arn');
  });
});
