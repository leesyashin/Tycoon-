import { expect, test, type Page } from '@playwright/test';
import type Phaser from 'phaser';

/** Café-Szene über den Dev-Hook (`window.__mceGame`, nur im Dev-Server, auf dem die e2e-Tests laufen). */
type Win = Window & { __mceGame?: Phaser.Game };

interface CamView {
  cx: number;
  cy: number;
  zoom: number;
  h: number;
}

async function ready(page: Page): Promise<void> {
  await page.goto('?lang=de&tutorial=0');
  await expect(page.getByTestId('hud-income')).toContainText('pro Sek.');
  await page.waitForFunction(
    () => (window as Win).__mceGame?.scene.getScene('CafeScene')?.sys.settings.status === 5,
  );
  await page.waitForTimeout(500);
}

/** Weltpunkt in der Bildmitte und Zoom der Szenen-Kamera. */
async function camera(page: Page): Promise<CamView> {
  return page.evaluate(() => {
    const game = (window as Win).__mceGame;
    if (!game) throw new Error('kein Dev-Hook');
    const c = game.scene.getScene('CafeScene').cameras.main;
    return { cx: c.scrollX + c.width / 2, cy: c.scrollY + c.height / 2, zoom: c.zoom, h: c.height };
  });
}

/** Phaser prüft die Größe der Spielfläche alle 500 ms. */
const settle = (page: Page) => page.waitForTimeout(1200);

test('Kamera bleibt, wo man sie hinschiebt – auch wenn die Leinwand verrutscht oder die Höhe sich ändert', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const start = await camera(page);
  await page.mouse.move(200, 520);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(200 + i * 13, 520);
  await page.mouse.up();
  const moved = await camera(page);
  expect(moved.cx).toBeLessThan(start.cx - 100);

  // Leinwand verrutscht um 1 px (Gummiband-Scrollen, Adressleiste): vorher sprang die Kamera zurück zum Café.
  await page.evaluate(() => {
    const app = document.getElementById('app');
    if (app) app.style.transform = 'translateY(1px)';
  });
  await settle(page);
  let now = await camera(page);
  expect(now.cx).toBeCloseTo(moved.cx, 3);
  expect(now.cy).toBeCloseTo(moved.cy, 3);

  // Adressleiste blendet ein: weniger Höhe, der Ausschnitt des Spielers bleibt.
  await page.setViewportSize({ width: 390, height: 760 });
  await settle(page);
  now = await camera(page);
  expect(now.h).toBe(760);
  expect(now.zoom).toBeCloseTo(moved.zoom, 6);
  expect(now.cx).toBeCloseTo(moved.cx, 3);
  expect(now.cy).toBeCloseTo(moved.cy, 3);
  // Gesten auf der Szene gehören dem Spiel, nicht dem Browser (kein Zurückfedern der Seite).
  await expect(page.locator('#game')).toHaveCSS('touch-action', 'none');
});

test('Unbewegte Kamera passt die Startansicht nach einer Größenänderung neu ein', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const start = await camera(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await settle(page);
  const now = await camera(page);
  expect(now.zoom).toBeGreaterThan(start.zoom * 1.5);
  expect(now.cx).toBeCloseTo(start.cx, 0);
});

test('Geldschein ist am Handy gut zu sehen und fliegt ins Geld-Feld', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  // Flug des ersten Scheins in Bildschirm-Pixeln: Breite und Position je Frame, bis er ankommt.
  const flight = await page.evaluate(
    () =>
      new Promise<{ w: number; x: number; y: number }[]>((resolve, reject) => {
        const scene = (window as Win).__mceGame?.scene.getScene('CafeScene');
        if (!scene) {
          reject(new Error('keine Szene'));
          return;
        }
        const cam = scene.cameras.main;
        const seen: { w: number; x: number; y: number }[] = [];
        let bill: Phaser.GameObjects.Image | null = null;
        const onFrame = (): void => {
          // Der fliegende Schein liegt über allem (Tiefe über dem Overlay der Szene).
          bill ??=
            (scene.children.list.find(
              (o) =>
                o.type === 'Image' &&
                (o as Phaser.GameObjects.Image).frame.name === 'cash' &&
                (o as Phaser.GameObjects.Image).depth > 20_000 &&
                (o as Phaser.GameObjects.Image).visible,
            ) as Phaser.GameObjects.Image | undefined) ?? null;
          if (!bill) return;
          if (!bill.active) {
            scene.events.off('postupdate', onFrame);
            resolve(seen);
            return;
          }
          if (bill.visible)
            seen.push({
              w: bill.displayWidth * cam.zoom,
              x: (bill.x - cam.worldView.x) * cam.zoom,
              y: (bill.y - cam.worldView.y) * cam.zoom,
            });
        };
        scene.events.on('postupdate', onFrame);
        setTimeout(() => reject(new Error('kein Geldschein in 25 s')), 25_000);
      }),
  );
  expect(flight.length).toBeGreaterThan(3);
  const first = flight[0];
  const last = flight[flight.length - 1];
  if (!first || !last) throw new Error('kein Flug');
  // Vorher ~10 px breit (Weltgröße bei Zoom ≈ 0,5); jetzt in jeder Zoomstufe gut 30 px.
  expect(first.w).toBeGreaterThanOrEqual(30);
  // Er fliegt zum Geld oben links im HUD (der letzte gezeichnete Frame liegt je nach Bildrate kurz davor).
  const toHud = (p: { x: number; y: number }) => Math.hypot(p.x - 34, p.y - 34);
  expect(toHud(last)).toBeLessThan(toHud(first) * 0.8);
  expect(last.y).toBeLessThan(first.y);
});
