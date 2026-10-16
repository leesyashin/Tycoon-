import { expect, test } from '@playwright/test';

test('HUD erscheint in beiden Sprachen', async ({ page }) => {
  await page.goto('?lang=de&tutorial=0');
  await expect(page.getByTestId('hud')).toContainText('Geld');
  // Phase 3: Geld in Euro, Spieltag mit Uhrzeit, geöffnet oder geschlossen.
  await expect(page.getByTestId('hud-coins')).toContainText('€');
  await expect(page.getByTestId('hud-clock')).toHaveText(/^Tag 1 · \d{1,2}:\d\d$/);
  await expect(page.getByTestId('hud-open')).toHaveText(/^(Geöffnet|Geschlossen bis \d{1,2}:00)$/);
  await page.goto('?lang=en&tutorial=0');
  await expect(page.getByTestId('hud')).toContainText('Cash');
  await expect(page.getByTestId('hud-coins')).toContainText('€');
  await expect(page.getByTestId('hud-clock')).toHaveText(/^Day 1 · \d{1,2}:\d\d\s[AP]M$/);
  await expect(page.getByTestId('hud-open')).toHaveText(/^(Open|Closed until .+)$/);
  await expect(page.locator('#game canvas')).toBeVisible();
});
