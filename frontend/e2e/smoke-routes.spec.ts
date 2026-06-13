import { expect, test } from '@playwright/test';
import { shot } from './helpers';

// Every hash route renders its page shell without crashing. Each route also
// drops a named screenshot so the report has a visual record of every surface.
const routes: { hash: string; selector: string; name: string }[] = [
  { hash: 'overview', selector: '.overview-page', name: 'overview' },
  { hash: 'runs', selector: '.runs-page', name: 'runs' },
  { hash: 'repos', selector: '.page-title:has-text("Repositories")', name: 'repos' },
  { hash: 'workspace/e2e-repo', selector: '.rw-workbench', name: 'workspace' },
  { hash: 'config', selector: '.config-page', name: 'config' },
  { hash: 'profile-mappings', selector: '.page-title', name: 'profile-mappings' },
  { hash: 'reports', selector: '.reports-page', name: 'reports' },
  { hash: 'graph', selector: '.graph-page', name: 'graph' },
  { hash: 'logs', selector: '.logs-page', name: 'logs' },
  { hash: 'help', selector: '.help-page', name: 'help' },
];

for (const r of routes) {
  test(`route #${r.hash} renders`, async ({ page }) => {
    await page.goto(`/#${r.hash}`);
    await expect(page.locator(r.selector).first()).toBeVisible();
    await shot(page, `route-${r.name}`);
  });
}

test('unknown hash falls back to a rendered page', async ({ page }) => {
  await page.goto('/#definitely-not-a-route');
  // The SPA never shows a blank screen — the topnav brand is always present.
  await expect(page.locator('.topnav .brand[aria-label="tf9"]')).toBeVisible();
});
