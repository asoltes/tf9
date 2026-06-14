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
  await expect(modal.locator('.command-description')).toContainText('Initializes Terraform');

  const moreCommands = modal.locator('.command-select');
  await expect(moreCommands.locator('option')).toHaveCount(9);
  await moreCommands.selectOption('force-unlock');
  await expect(modal.locator('.command-description')).toContainText('Manually removes a Terraform state lock');
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

  await expect(modal.locator('.auto-steps .as-init')).toHaveCSS('background-color', 'rgb(9, 105, 218)');
  await expect(modal.locator('.auto-steps .as-plan')).toHaveCSS('background-color', 'rgb(26, 127, 55)');
  await expect(modal.locator('.auto-steps .as-apply')).toHaveCSS('background-color', 'rgb(188, 76, 0)');

  await pickCommand(page, 'apply');
  await expect(modal.locator('.tile', { hasText: 'Promotion' })).toHaveClass(/\bon\b/);
  await expect(modal.locator('.aa-control')).toBeVisible(); // --auto-approve toggle
  await expect(modal.getByRole('button', { name: /^Run apply$/ })).toBeVisible();

  await pickCommand(page, 'destroy');
  await expect(modal.locator('.destroy-warn')).toBeVisible();
  await expect(modal).toHaveClass(/\bis-destroy\b/);
  await expect(modal.locator('.command-description.danger')).toContainText('Permanently removes');
  await expect(modal.getByRole('button', { name: /^Run destroy$/ })).toHaveClass(/\bcommand-destroy\b/);
});

test('resource targeting and taint address controls are command-aware', async ({ page }) => {
  const modal = await openNewRunModal(page);

  await pickCommand(page, 'plan');
  await modal.getByLabel('Resource target 1').fill('module.network');
  await modal.getByRole('button', { name: 'Add another target' }).click();
  await modal.getByRole('textbox', { name: 'Resource target 2' }).fill('aws_instance.web');
  await expect(modal.locator('.cli-box')).toContainText('--target module.network');
  await expect(modal.locator('.cli-box')).toContainText('--target aws_instance.web');

  await modal.locator('.command-select').selectOption('taint');
  await expect(modal.getByLabel('Resource address')).toHaveValue('module.network');
  await modal.getByLabel('Resource address').fill('');
  await expect(modal.getByRole('button', { name: /^Run taint$/ })).toBeDisabled();
  await modal.getByLabel('Resource address').fill('aws_instance.web');
  await expect(modal.getByRole('button', { name: /^Run taint$/ })).toBeEnabled();
  await expect(modal.locator('.cli-box')).toContainText('aws_instance.web');
});

test('modal closes via the close button', async ({ page }) => {
  const modal = await openNewRunModal(page);
  await modal.getByRole('button', { name: 'Close' }).click();
  await expect(modal).toBeHidden();
});
