import { expect, test } from '@playwright/test';

test('cherry-picks selected commits and rebases the current branch', async ({ page }) => {
  await page.goto('/#workspace/e2e-service');
  await expect(page.locator('.rw-workbench')).toBeVisible();

  await page.getByRole('button', { name: 'Git ops' }).click();
  const modal = page.getByRole('dialog', { name: 'Git operations' });
  await expect(modal).toBeVisible();

  await modal.getByRole('tab', { name: 'Cherry-pick' }).click();
  await modal.getByLabel('Cherry-pick source branch').selectOption('source-feature');
  const featureCommit = modal.locator('.rw-commit-row', { hasText: 'Add feature module' });
  await expect(featureCommit).toBeVisible();
  await featureCommit.getByRole('checkbox').check();
  await expect(modal.getByRole('region', { name: 'Selected commit changes' })).toContainText('feature.tf');
  await expect(modal.getByRole('button', { name: 'Cherry-pick selected' })).toBeEnabled();

  page.once('dialog', dialog => dialog.accept());
  await modal.getByRole('button', { name: 'Cherry-pick selected' }).click();
  await expect(modal).toBeHidden();
  await expect(page.locator('.rw-tree-row', { hasText: 'feature.tf' })).toBeVisible();

  await page.getByRole('button', { name: 'Git ops' }).click();
  await modal.getByLabel('Rebase onto branch').selectOption('base-update');
  page.once('dialog', dialog => dialog.accept());
  await modal.getByRole('button', { name: 'Rebase branch' }).click();
  await expect(modal).toBeHidden();
  await expect(page.locator('.rw-tree-row', { hasText: 'base.tf' })).toBeVisible();
});

test('warns but allows Git operations when the working tree has changes', async ({ page }) => {
  await page.goto('/#workspace/e2e-repo');
  await expect(page.locator('.rw-workbench')).toBeVisible();

  await page.getByRole('button', { name: 'Git ops' }).click();
  const modal = page.getByRole('dialog', { name: 'Git operations' });
  await expect(modal).toContainText('Commit, stash, or discard working-tree changes');
  await expect(modal.getByRole('button', { name: 'Rebase branch' })).toBeEnabled();
});
