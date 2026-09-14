async function createAccount(page, prefix = 'playwright') {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Create account' }).click();
  const username = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  await page.locator('#username').fill(username);
  await page.locator('#password').fill('MapJinnTest!174');
  await page.getByRole('button', { name: 'Create account' }).last().click();
  await page.waitForURL('**/');
  await page.getByText('Map Jinn', { exact: true }).first().waitFor();
  return username;
}

async function waitForMapShell(page) {
  await page.locator('#viewDiv').waitFor({ state: 'visible' });
  await page.locator('#areaInput').waitFor({ state: 'visible' });
  await page.waitForTimeout(2500);
}

module.exports = { createAccount, waitForMapShell };
