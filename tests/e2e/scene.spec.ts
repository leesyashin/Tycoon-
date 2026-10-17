import { expect, test } from '@playwright/test';
import type Phaser from 'phaser';

/** Café-Szene über den Dev-Hook (`window.__mceGame`, nur im Dev-Server, auf dem die e2e-Tests laufen). */
type Win = Window & { __mceGame?: Phaser.Game };

test('Café-Szene läuft ohne Fehler, auch bei 100 Kunden/s', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('?lang=de&tutorial=0&debugSpawn=100');
  await expect(page.locator('#game canvas')).toBeVisible();
  await expect(page.getByTestId('hud-income')).toContainText('€');
  await page.waitForTimeout(3000);
  // Tap auf die Raummitte: darf nichts kaputt machen (Einkommen kommt nur aus core).
  const box = await page.locator('#game canvas').boundingBox();
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press('b');
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('Café-Szene mit Parkplatz, Matcha-Lieferung und Feierabend läuft ohne Fehler', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('?lang=de&tutorial=0');
  await expect(page.getByTestId('hud')).toBeVisible();
  // Kurz vor Feierabend, Parkplatz ausgebaut (Gäste kommen auch mit dem Fahrzeug), Lieferung gleich da.
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
    const key = Object.keys(localStorage).find((k) => /^mce\.save\.v\d+$/.test(k));
    if (!key) throw new Error('no save');
    const save = JSON.parse(localStorage.getItem(key) ?? '{}') as {
      clock: number;
      locations: Record<
        string,
        {
          coins: string;
          level: number;
          ambience: Record<string, number>;
          hours: { open: number; close: number };
          supply: { orders: unknown[] };
        }
      >;
    };
    const berlin = save.locations['berlin'];
    if (!berlin) throw new Error('no berlin');
    berlin.hours = { open: 8, close: 18 };
    save.clock = 17 * 60 + 50;
    berlin.level = 5;
    berlin.coins = '100000';
    berlin.ambience = { ...berlin.ambience, seats: 4, parking: 3 };
    berlin.supply.orders = [{ grade: 0, grams: 250, arriveAt: save.clock + 2, express: true }];
    localStorage.setItem(key, JSON.stringify(save));
    Storage.prototype.setItem = () => undefined;
  });
  await page.reload();
  await expect(page.getByTestId('hud-open')).toHaveText('Geöffnet');
  await expect(page.getByTestId('toasts')).toContainText('Matcha-Lieferung angekommen');
  await page.waitForFunction(
    () => (window as Win).__mceGame?.scene.getScene('CafeScene')?.sys.settings.status === 5,
  );
  // Um 18 Uhr ist Feierabend: Das Café schließt, das Team geht, die Nacht spult vor.
  await expect(page.getByTestId('hud-open')).toHaveText(/^Geschlossen bis/, { timeout: 20_000 });
  await page.waitForTimeout(3000);
  expect(errors).toEqual([]);
});
