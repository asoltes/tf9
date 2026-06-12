import { expect, test } from '@playwright/test';
import { shot } from './helpers';

type Mode = 'light' | 'dark' | 'dim';

async function readTheme(page: import('@playwright/test').Page) {
  return page.evaluate(() => ({
    mode: localStorage.getItem('tf9-color-mode'),
    theme: document.documentElement.getAttribute('data-theme'),
    variant: document.documentElement.getAttribute('data-variant'),
  }));
}

// Each mode maps to a deterministic set of <html> attributes.
function expectAttrsFor(mode: string | null, theme: string | null, variant: string | null) {
  if (mode === 'light') {
    expect(theme).toBe('light');
    expect(variant).toBeNull();
  } else if (mode === 'dark') {
    expect(theme).toBe('dark');
    expect(variant).toBeNull();
  } else if (mode === 'dim') {
    expect(theme).toBe('dark');
    expect(variant).toBe('dim');
  }
}

test('theme toggle cycles light → dark → dim and persists', async ({ page }) => {
  await page.goto('/#overview');

  const button = page.locator('.tn-theme');
  await expect(button).toBeVisible();

  const seen: (string | null)[] = [];
  const start = (await readTheme(page)).mode;

  // Click three times — should pass through all three modes and return to start.
  for (let i = 0; i < 3; i++) {
    await button.click();
    const t = await readTheme(page);
    expectAttrsFor(t.mode, t.theme, t.variant);
    seen.push(t.mode);
    if (t.mode === 'dim') await shot(page, 'theme-dim');
    if (t.mode === 'light') await shot(page, 'theme-light');
  }

  // All three distinct modes were observed.
  expect(new Set(seen)).toEqual(new Set<Mode>(['light', 'dark', 'dim']));
  // A full cycle returns to the starting mode.
  expect((await readTheme(page)).mode).toBe(start);
});
