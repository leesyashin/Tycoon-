import { expect, test } from '@playwright/test';

test('Café-Szene läuft ohne Fehler, auch bei 100 Kunden/s', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('?lang=de&debugSpawn=100');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.getByTestId('hud-income')).toContainText('pro Sek.');
  await page.waitForTimeout(3000);
  // Tap auf die Raummitte: darf nichts kaputt machen (Einkommen kommt nur aus core).
  const box = await page.locator('#game canvas').boundingBox();
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press('b');
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
