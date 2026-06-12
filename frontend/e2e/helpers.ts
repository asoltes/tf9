import { expect, type Page } from '@playwright/test';

// Named screenshot gallery — in addition to Playwright's per-test screenshots,
// every spec drops a clean, stable-named full-page PNG under e2e/screenshots/
// so the run produces a browsable visual record of each page/workflow.
export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true });
}

// Navigate to a hash route and wait for the SPA to settle.
export async function goRoute(page: Page, hash: string): Promise<void> {
  await page.goto(`/#${hash}`);
}

// Open the New Run modal from the runs page and wait for it to render.
export async function openNewRunModal(page: Page) {
  await page.goto('/#runs/new');
  const modal = page.locator('.run-modal[role="dialog"]');
  await expect(modal).toBeVisible();
  // Targets load asynchronously from /api/repos/{name}/config.
  await expect(modal.locator('.tgt').first()).toBeVisible();
  return modal;
}

// Pick a single command chip in the New Run modal (auto/init/plan/apply/destroy).
export async function pickCommand(page: Page, cmd: string): Promise<void> {
  await page.locator(`.cmd-chip.${cmd}`).click();
}

// Select exactly one target by name (clears all others first).
export async function selectOnlyTarget(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'None' }).click();
  const row = page.locator('.tgt', { hasText: name });
  await row.locator('.cbox').click();
}
