const { test, expect } = require('@playwright/test');
const { createAccount, waitForMapShell } = require('./helpers');

test('approved 17.4 apparel controls are present', async ({ page }) => {
  await createAccount(page, 'app');
  await waitForMapShell(page);
  await expect(page.getByText('Footprints + clean streets')).toBeVisible();
  await expect(page.getByText('Print-ready map text')).toBeVisible();
  await expect(page.locator('#streetsToggle')).toBeChecked();
  await expect(page.locator('#locationLabelToggle')).toBeChecked();
  await page.locator('#customLabelInput').fill('ATLANTA · 30331');
  await expect(page.locator('#customLabelInput')).toHaveValue('ATLANTA · 30331');
});

test('map remains basemap-free in application source', async ({ request }) => {
  const response = await request.get('/static/js/app.js');
  const js = await response.text();
  expect(js).toContain("new Map({ basemap: null })");
});
