import { expect, test } from '@playwright/test';
import { openNewRunModal, pickCommand, shot } from './helpers';

// The localtest seeds one cost report artifact (server.mjs) because a real
// breakdown needs the infracost binary + a pricing-API key, which the offline
// harness can't provide. These tests exercise the first-class cost report
// surfaces — list, filter, viewer — and confirm cost is decoupled from runs.

test('a cost report is first-class: listed, filterable, and opens the breakdown viewer', async ({ page }) => {
  await page.goto('/#reports');
  await expect(page.locator('.page-title', { hasText: 'Terraform Reports' })).toBeVisible();

  // ── Cost filter tab exists and isolates the seeded cost report ──
  const costFilter = page.locator('.rh-filter', { hasText: 'Cost' });
  await expect(costFilter).toBeVisible();
  await costFilter.click();

  const card = page.locator('.rh-card').first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.locator('.badge')).toContainText('cost');
  // Cost rows show monthly cost, not an Applied badge.
  await expect(card).toContainText('USD 742.50/mo');
  await expect(card).not.toContainText('Applied:');
  await shot(page, 'cost-report-card');

  // ── Open the cost report → breakdown viewer (shared CostBreakdownView) ──
  await card.click();
  await expect(page.locator('.report-viewer[data-cmd="cost"]')).toBeVisible();
  await expect(page.locator('.report-viewer .hdr-title')).toContainText('Cost Report');
  // Breakdown rollups rendered by the shared component.
  await expect(page.locator('.cost-card-title', { hasText: 'Cost by repository' })).toBeVisible();
  await expect(page.locator('.cost-card-title', { hasText: 'Cost by service' })).toBeVisible();
  await expect(page.locator('.cost-stat-val', { hasText: 'USD 742.50' }).first()).toBeVisible();
  // Both seeded targets appear in the targets table.
  await expect(page.locator('.cost-tbl')).toContainText('prod');
  await expect(page.locator('.cost-tbl')).toContainText('dev');
  await expect(page.getByRole('button', { name: /Back to Reports/ })).toBeVisible();
  await shot(page, 'cost-report-viewer');
});

test('the New Run modal has no cost toggle (cost is decoupled from terraform runs)', async ({ page }) => {
  const modal = await openNewRunModal(page);
  await pickCommand(page, 'plan');
  // The "Estimate cost" toggle was part of the removed embedded-cost path.
  await expect(modal.getByText('Estimate cost')).toHaveCount(0);
});
