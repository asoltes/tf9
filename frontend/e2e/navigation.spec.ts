import { expect, test } from '@playwright/test';
import { shot } from './helpers';

test('top nav links navigate between primary surfaces', async ({ page }) => {
  await page.goto('/#overview');

  await page.locator('.tn-item', { hasText: 'Runs' }).click();
  await expect(page.locator('.runs-page')).toBeVisible();

  await page.locator('.tn-item', { hasText: 'Reports' }).click();
  await expect(page.locator('.reports-page')).toBeVisible();

  // The bare Workspace link lands on the repository picker when no repo is open.
  await page.locator('.tn-item', { hasText: 'Workspace' }).click();
  await expect(page.locator('.workspace-picker')).toBeVisible();
  await expect(page.locator('.workspace-repo-card', { hasText: 'e2e-repo' })).toBeVisible();
});

test('side nav exposes settings links and breadcrumbs', async ({ page }) => {
  await page.goto('/#overview');

  const sidenav = page.locator('.sidenav');
  await expect(sidenav).toBeVisible();
  await expect(sidenav.locator('.nav-sec', { hasText: 'Settings' })).toBeVisible();

  await sidenav.getByRole('link', { name: 'Repositories' }).click();
  await expect(page.locator('.page-title', { hasText: 'Repositories' })).toBeVisible();

  // The active link is highlighted and breadcrumbs reflect the current page.
  await expect(sidenav.locator('a.active', { hasText: 'Repositories' })).toBeVisible();
  await expect(page.locator('.crumbs')).toBeVisible();
  await shot(page, 'nav-repositories');
});

test('sidebar collapse toggles and persists to localStorage', async ({ page }) => {
  await page.goto('/#overview');

  const layout = page.locator('.layout');
  await expect(layout).not.toHaveClass(/nav-collapsed/);

  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(layout).toHaveClass(/nav-collapsed/);
  expect(await page.evaluate(() => localStorage.getItem('tf9-nav-collapsed'))).toBe('1');

  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(layout).not.toHaveClass(/nav-collapsed/);
  expect(await page.evaluate(() => localStorage.getItem('tf9-nav-collapsed'))).toBe('0');
});
