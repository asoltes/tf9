/**
 * Unit tests for colors.ts
 * Requires vitest — run with: npm run test
 * (vitest is not yet configured in this project)
 */
import { describe, it, expect } from 'vitest';
import { envColor, isProd, commandColor } from './colors';

describe('envColor', () => {
  it('maps prod keyword to red', () => {
    expect(envColor('production')).toBe('#e5484d');
    expect(envColor('prod')).toBe('#e5484d');
    expect(envColor('my-prod-env')).toBe('#e5484d');
  });

  it('maps stag keyword to amber', () => {
    expect(envColor('staging')).toBe('#f5a623');
    expect(envColor('stag')).toBe('#f5a623');
    expect(envColor('my-stag-env')).toBe('#f5a623');
  });

  it('maps global keyword to purple', () => {
    expect(envColor('global')).toBe('#a371f7');
    expect(envColor('global-shared')).toBe('#a371f7');
  });

  it('maps dev keyword to green', () => {
    expect(envColor('dev')).toBe('#3fb950');
    expect(envColor('development')).toBe('#3fb950');
    expect(envColor('mydev')).toBe('#3fb950');
  });

  it('returns neutral grey for unmatched names', () => {
    expect(envColor('unknown')).toBe('#8b949e');
    expect(envColor('')).toBe('#8b949e');
    expect(envColor('qa')).toBe('#8b949e');
  });

  it('is case-insensitive', () => {
    expect(envColor('PROD')).toBe('#e5484d');
    expect(envColor('Staging')).toBe('#f5a623');
    expect(envColor('GLOBAL')).toBe('#a371f7');
    expect(envColor('DEV')).toBe('#3fb950');
  });

  it('prod wins over global when both are present (priority ordering)', () => {
    expect(envColor('prod-global')).toBe('#e5484d');
  });

  it('prod wins over stag when both are present', () => {
    expect(envColor('prod-stag')).toBe('#e5484d');
  });

  it('stag wins over global when prod is absent', () => {
    expect(envColor('stag-global')).toBe('#f5a623');
  });

  it('global wins over dev when prod/stag are absent', () => {
    expect(envColor('global-dev')).toBe('#a371f7');
  });
});

describe('isProd', () => {
  it('returns true for names containing prod', () => {
    expect(isProd('production')).toBe(true);
    expect(isProd('prod')).toBe(true);
    expect(isProd('my-prod-us-east')).toBe(true);
  });

  it('returns false for non-prod names', () => {
    expect(isProd('staging')).toBe(false);
    expect(isProd('dev')).toBe(false);
    expect(isProd('global')).toBe(false);
    expect(isProd('')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isProd('PROD')).toBe(true);
    expect(isProd('Production')).toBe(true);
  });
});

describe('commandColor', () => {
  it('maps plan to green', () => {
    expect(commandColor('plan')).toBe('#3fb950');
  });

  it('maps apply to orange', () => {
    expect(commandColor('apply')).toBe('#f5a623');
  });

  it('maps destroy to red', () => {
    expect(commandColor('destroy')).toBe('#e5484d');
  });

  it('maps init to blue', () => {
    expect(commandColor('init')).toBe('#58a6ff');
  });

  it('returns neutral grey for unknown commands', () => {
    expect(commandColor('validate')).toBe('#8b949e');
    expect(commandColor('')).toBe('#8b949e');
    expect(commandColor('import')).toBe('#8b949e');
  });

  it('is case-insensitive', () => {
    expect(commandColor('PLAN')).toBe('#3fb950');
    expect(commandColor('Apply')).toBe('#f5a623');
    expect(commandColor('DESTROY')).toBe('#e5484d');
    expect(commandColor('INIT')).toBe('#58a6ff');
  });
});
