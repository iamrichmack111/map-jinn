const { test, expect } = require('@playwright/test');
const { createAccount } = require('./helpers');

test('first-run account creation opens the footprint workspace', async ({ page }) => {
  await createAccount(page, 'auth');
  await expect(page.locator('#mapTitle')).toContainText('Atlanta');
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
});

test('health endpoint identifies Map Jinn 17.4', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(body.app).toContain('Map Jinn 17.4');
});
