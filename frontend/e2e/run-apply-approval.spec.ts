import { expect, test } from '@playwright/test';
import { openNewRunModal, pickCommand, selectOnlyTarget, shot } from './helpers';

// The approval gate is driven by the real runner: `terraform apply` (no
// -auto-approve) blocks on "Enter a value:", the runner emits the approval
// sentinel over SSE, and the split panel shows the amber approval bar.

async function startApply(page: import('@playwright/test').Page) {
  const modal = await openNewRunModal(page);
  await pickCommand(page, 'apply');
  await selectOnlyTarget(page, 'staging'); // nonprod single target → no confirm bar
  await modal.getByRole('button', { name: /^Run apply$/ }).click();
  await expect(modal).toBeHidden();
  return page.locator('.splitpanel');
}

// Run Deny first: it never mutates terraform state, so the subsequent Approve
// test still sees a pending change to apply.
test('apply approval gate — Deny marks the run denied', async ({ page }) => {
  const panel = await startApply(page);

  const bar = panel.locator('.sp-approval-bar');
  await expect(bar).toBeVisible({ timeout: 45_000 });
  await shot(page, 'run-apply-approval-bar');

  await bar.getByRole('button', { name: 'Deny' }).click();
  await expect(panel.locator('.rstatus.denied')).toBeVisible({ timeout: 30_000 });
  await shot(page, 'run-apply-denied');
});

test('apply approval gate — Approve completes the apply', async ({ page }) => {
  const panel = await startApply(page);

  const bar = panel.locator('.sp-approval-bar');
  await expect(bar).toBeVisible({ timeout: 45_000 });

  await expect(bar.locator('.sp-approval-input')).toHaveCount(0);
  await expect(bar.getByRole('button', { name: 'Approve' })).toBeEnabled();
  await bar.getByRole('button', { name: 'Approve' }).click();

  await expect(panel.locator('.rstatus.success')).toBeVisible({ timeout: 45_000 });
  await expect(panel.locator('.tc-body')).toContainText(/Apply complete|Resources:/);
  await shot(page, 'run-apply-success');
});
