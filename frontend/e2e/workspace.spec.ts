import { expect, test } from '@playwright/test';
import { shot } from './helpers';

test('workspace shows the repo tab, file tree and opens files', async ({ page }) => {
  await page.goto('/#workspace/e2e-repo');
  await expect(page.locator('.rw-workbench')).toBeVisible();

  // Open repository tab bar reflects the active repo.
  await expect(
    page.locator('.workspace-repo-tabs [role="tab"]', { hasText: 'e2e-repo' }),
  ).toBeVisible();

  // Top-level tree entries are present.
  for (const name of ['main.tf', 'outputs.tf', 'environments', 'modules']) {
    await expect(page.locator('.rw-tree-row', { hasText: name }).first()).toBeVisible();
  }

  // Expanding a directory reveals its children.
  await page.locator('.rw-tree-row', { hasText: 'environments' }).first().click();
  await expect(page.locator('.rw-tree-row', { hasText: 'dev' }).first()).toBeVisible();

  // Opening a modified file shows it in a tab with its git decoration.
  await page.locator('.rw-tree-row', { hasText: 'main.tf' }).first().click();
  await expect(page.locator('.rw-tabs')).toContainText('main.tf');
  await expect(page.locator('.rw-tab-git').first()).toHaveText('M');
  await expect(page.locator('.rw-editor-area')).toBeVisible();
  await shot(page, 'workspace');
});

test('an open file tab can be closed', async ({ page }) => {
  await page.goto('/#workspace/e2e-repo');
  await expect(page.locator('.rw-workbench')).toBeVisible();

  await page.locator('.rw-tree-row', { hasText: 'outputs.tf' }).first().click();
  const tab = page.locator('.rw-tabs', { hasText: 'outputs.tf' });
  await expect(tab).toBeVisible();

  await tab.locator('.rw-tab-close').first().click();
  await expect(page.locator('.rw-tabs')).not.toContainText('outputs.tf');
});
