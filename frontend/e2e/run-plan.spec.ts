import { expect, test } from '@playwright/test';
import { openNewRunModal, pickCommand, selectOnlyTarget, shot } from './helpers';

// Runs a real `terraform plan` end-to-end against the offline terraform_data
// fixture: submit → SSE stream → success → plan output visible.
test('plan run streams output and completes successfully', async ({ page }) => {
  const modal = await openNewRunModal(page);
  await pickCommand(page, 'plan');
  // Sequential mode so submission skips the parallel confirmation bar.
  await modal.locator('.tile', { hasText: 'Promotion' }).click();
  await selectOnlyTarget(page, 'dev');

  await modal.getByRole('button', { name: /^Run plan$/ }).click();

  // The modal closes and the new run is auto-selected in the split panel.
  await expect(modal).toBeHidden();
  const panel = page.locator('.splitpanel');
  await expect(panel).toBeVisible();

  // Live status badge settles on success once terraform plan finishes.
  await expect(panel.locator('.rstatus.success')).toBeVisible({ timeout: 45_000 });

  // Terraform's plan output reached the terminal pane.
  await expect(panel.locator('.tc-body')).toContainText(/Plan:|Terraform|terraform_data/);
  await shot(page, 'run-plan-success');

  // The finished run is listed in the runs table with a plan badge.
  await expect(page.locator('.runs-tbl .rstatus.success').first()).toBeVisible();
});
