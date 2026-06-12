import { expect, test } from '@playwright/test';
import { shot } from './helpers';

test('logs page lists lines, filters by level and refreshes', async ({ page }) => {
  await page.goto('/#logs');
  await expect(page.locator('.page-title', { hasText: 'System Logs' })).toBeVisible();

  // The server has logged at least its startup, so lines are present.
  await expect(page.locator('.logs-body .logs-line').first()).toBeVisible({ timeout: 15_000 });

  // Switching level activates the chosen button.
  const debugBtn = page.locator('.logs-level-btn', { hasText: 'debug' });
  await debugBtn.click();
  await expect(debugBtn).toHaveClass(/\bon\b/);

  // Auto-refresh is on by default and can be toggled off.
  const auto = page.locator('.logs-auto input[type="checkbox"]');
  await expect(auto).toBeChecked();
  await auto.uncheck();
  await expect(auto).not.toBeChecked();

  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.locator('.logs-body .logs-line').first()).toBeVisible();
  await shot(page, 'logs');
});
