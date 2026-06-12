import { expect, test } from '@playwright/test';
import { shot } from './helpers';

test('repositories list shows the fixture repo and its pipeline', async ({ page }) => {
  await page.goto('/#repos');
  await expect(page.locator('.page-title', { hasText: 'Repositories' })).toBeVisible();

  const row = page.locator('table.tbl tbody tr', { hasText: 'e2e-repo' });
  await expect(row).toBeVisible();
  await expect(row.locator('.mini-pipe')).toBeVisible();
  await shot(page, 'repos-list');
});

// Full add → rename → remove lifecycle through the real /api/repos endpoints.
test('add, rename and remove a repository', async ({ page }) => {
  await page.goto('/#repos');

  // ── Add ──
  await page.getByRole('button', { name: 'Add repository' }).click();
  const modal = page.locator('.modal', { hasText: 'Add repository' });
  await expect(modal).toBeVisible();
  await modal.locator('input.inp').first().fill('e2e-extra');
  await modal.locator('input.inp.mono').fill('/tmp/tf9-playwright');
  await modal.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.toast.show')).toContainText('e2e-extra');
  await expect(page.locator('table.tbl tbody tr', { hasText: 'e2e-extra' })).toBeVisible();

  // ── Rename ──
  await page.getByRole('button', { name: 'Rename e2e-extra' }).click();
  const renameInput = page.getByRole('textbox', { name: 'New repository name' });
  await renameInput.fill('e2e-renamed');
  await renameInput.press('Enter');
  await expect(page.locator('.toast.show')).toContainText('Renamed');
  await expect(page.locator('table.tbl tbody tr', { hasText: 'e2e-renamed' })).toBeVisible();

  // ── Remove (via confirm modal) ──
  await page.getByRole('button', { name: 'Remove e2e-renamed' }).click();
  const confirm = page.locator('.modal', { hasText: 'Remove repository' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.locator('.toast.show')).toContainText('Removed e2e-renamed');
  await expect(page.locator('table.tbl tbody tr', { hasText: 'e2e-renamed' })).toHaveCount(0);

  // The original fixture repo is untouched.
  await expect(page.locator('table.tbl tbody tr', { hasText: 'e2e-repo' })).toBeVisible();
});
