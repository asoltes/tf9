import { expect, test } from '@playwright/test';
import { openNewRunModal, pickCommand, selectOnlyTarget, shot } from './helpers';

// The live terminal exposes a "Reconcile with AI" button on finished
// plan/apply/auto runs. It builds a drift-reconcile prompt from the run's repo
// state plus the terraform output already on screen, then hands off to the
// Repository Workspace where the AI chat is prefilled with it. This guards the
// cross-page seed handoff (which survives the lazy-load + hashchange round-trip
// via a transient store) and the command gating.
test('reconcile-with-ai button seeds the workspace chat from a finished run', async ({ page }) => {
  const modal = await openNewRunModal(page);
  await pickCommand(page, 'plan');
  await modal.locator('.tile', { hasText: 'Promotion' }).click();
  await selectOnlyTarget(page, 'dev');
  await modal.getByRole('button', { name: /^Run plan$/ }).click();

  const panel = page.locator('.splitpanel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.rstatus.success')).toBeVisible({ timeout: 45_000 });

  const reconcileBtn = panel.getByRole('button', { name: /Reconcile with AI/ });
  await expect(reconcileBtn).toBeVisible();
  await shot(page, 'reconcile-ai-terminal-button');

  // Remote git reconciliation can be slow. It must not block opening the
  // workspace; the prompt is populated after the page mounts.
  await page.route('**/api/repos/e2e-repo/reconcile', async route => {
    await new Promise(resolve => setTimeout(resolve, 2_000));
    await route.continue();
  });

  // Click → navigate immediately, then fill the chat when git context arrives.
  await reconcileBtn.click();
  await expect(page).toHaveURL(/#workspace\/e2e-repo/, { timeout: 1_000 });

  const textarea = page.getByLabel('Message Claude');
  await expect(textarea).toBeVisible();
  await expect(textarea).toHaveValue(/reconciling Terraform drift on the repo "e2e-repo"/);
  await expect(textarea).toHaveValue(/Current working branch:/);
  await expect(textarea).toHaveValue(/Recent teammate branches/);
  await expect(textarea).not.toHaveValue(/Integration branch:/);
  // The run's terraform output is embedded so Claude can see what drifted.
  await expect(textarea).toHaveValue(/terraform run produced this output/);
  await expect(textarea).toHaveValue(/terraform_data|Plan:|No changes/);
  await shot(page, 'reconcile-ai-terminal-seeded');
});

// The button is gated to plan/apply/auto — re-running as `init` hides it.
test('reconcile-with-ai button is hidden for unsupported commands', async ({ page }) => {
  const modal = await openNewRunModal(page);
  await pickCommand(page, 'plan');
  await modal.locator('.tile', { hasText: 'Promotion' }).click();
  await selectOnlyTarget(page, 'dev');
  await modal.getByRole('button', { name: /^Run plan$/ }).click();

  const panel = page.locator('.splitpanel');
  await expect(panel.locator('.rstatus.success')).toBeVisible({ timeout: 45_000 });
  await expect(panel.getByRole('button', { name: /Reconcile with AI/ })).toBeVisible();

  await panel.locator('.rerun-menu summary').click();
  await panel.getByRole('button', { name: /Run\s*init/ }).click();
  await expect(panel.locator('.rstatus.success, .rstatus.failed')).toBeVisible({ timeout: 45_000 });
  await expect(panel.getByRole('button', { name: /Reconcile with AI/ })).toHaveCount(0);
});
