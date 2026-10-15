import { expect, test } from '@playwright/test';

test('HUD erscheint in beiden Sprachen', async ({ page }) => {
  await page.goto('?lang=de&tutorial=0');
  await expect(page.getByTestId('hud')).toContainText('Geld');
  await page.goto('?lang=en&tutorial=0');
  await expect(page.getByTestId('hud')).toContainText('Cash');
  await expect(page.locator('#game canvas')).toBeVisible();
});
