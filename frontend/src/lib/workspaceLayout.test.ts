import { describe, expect, it } from 'vitest';
import { clampDiffWidth, resizedWidth, storedDiffWidth } from './workspaceLayout';

describe('workspace diff width', () => {
  it('keeps the panel within usable desktop bounds', () => {
    expect(clampDiffWidth(100, 1440)).toBe(220);
    expect(clampDiffWidth(500, 1440)).toBe(500);
    expect(clampDiffWidth(1200, 1440)).toBe(792);
  });

  it('still permits a visible panel on narrow viewports', () => {
    expect(clampDiffWidth(500, 480)).toBe(280);
  });

  it('uses the normal default when no width has been stored', () => {
    expect(storedDiffWidth(null, 1280)).toBe(380);
    expect(storedDiffWidth('not-a-number', 1280)).toBe(380);
    expect(storedDiffWidth('460', 1280)).toBe(460);
  });

  it('makes a rightward diff drag wider', () => {
    expect(resizedWidth(380, 500, 560, 1, 220, 900)).toBe(440);
    expect(resizedWidth(380, 500, 440, 1, 220, 900)).toBe(320);
  });
});
