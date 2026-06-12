import { expect, test } from '@playwright/test';
import { openNewRunModal, pickCommand, shot } from './helpers';

test('new run modal loads repo targets and command chips', async ({ page }) => {
  const modal = await openNewRunModal(page);

  // The fixture repo exposes three targets in one "environments" pipeline.
  await expect(modal.locator('.tgt')).toHaveCount(3);
  for (const name of ['dev', 'prod', 'staging']) {
    await expect(modal.locator('.tgt .nm', { hasText: name })).toBeVisible();
  }
  for (const cmd of ['auto', 'init', 'plan', 'apply', 'destroy']) {
    await expect(modal.locator(`.cmd-chip.${cmd}`)).toBeVisible();
  }
  await shot(page, 'new-run-modal');
});

test('selecting no targets disables submission', async ({ page }) => {
  const modal = await openNewRunModal(page);
  await pickCommand(page, 'plan');

  await modal.getByRole('button', { name: 'None' }).click();
  await expect(modal.getByText('Select at least one target')).toBeVisible();
  await expect(modal.getByRole('button', { name: /^Run plan$/ })).toBeDisabled();

  await modal.getByRole('button', { name: 'Select all', exact: true }).click();
  await expect(modal.getByRole('button', { name: /^Run plan$/ })).toBeEnabled();
});

test('"Skip prod" unchecks production targets', async ({ page }) => {
  const modal = await openNewRunModal(page);
  await modal.getByRole('button', { name: 'Skip prod' }).click();

  const prodRow = modal.locator('.tgt', { hasText: 'prod' });
  await expect(prodRow).toHaveClass(/\boff\b/);
  // Summary rail reflects 2 of 3 targets selected.
  await expect(modal.locator('.sum-row', { hasText: 'Targets' })).toContainText('2 of 3');
});

test('command selection switches run mode and submit label', async ({ page }) => {
  const modal = await openNewRunModal(page);

  await pickCommand(page, 'apply');
  await expect(modal.locator('.tile', { hasText: 'Promotion' })).toHaveClass(/\bon\b/);
  await expect(modal.locator('.aa-control')).toBeVisible(); // --auto-approve toggle
  await expect(modal.getByRole('button', { name: /^Run apply$/ })).toBeVisible();

  await pickCommand(page, 'destroy');
  await expect(modal.locator('.destroy-warn')).toBeVisible();
});

test('modal closes via the close button', async ({ page }) => {
  const modal = await openNewRunModal(page);
  await modal.getByRole('button', { name: 'Close' }).click();
  await expect(modal).toBeHidden();
});
