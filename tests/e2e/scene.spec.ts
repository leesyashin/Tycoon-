import { expect, test, type Page } from '@playwright/test';
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

interface ScenePatch {
  clock?: number;
  /** Regentag-Event am Standort für so viele Sekunden Spielzeit. */
  rainyDaySec?: number;
  terrace?: number;
  /** Lieferung in so vielen Spielminuten. */
  delivery?: { grams: number; inMinutes: number };
  /** Matcha im Lager (Gramm je Sorte). */
  stock?: number[];
}

/** Spielstand ändern und neu laden (Szene steht danach). */
async function reloadWith(page: Page, patch: ScenePatch): Promise<void> {
  await page.evaluate((p) => {
    window.dispatchEvent(new Event('pagehide'));
    const key = Object.keys(localStorage).find((k) => /^mce\.save\.v\d+$/.test(k));
    if (!key) throw new Error('no save');
    const save = JSON.parse(localStorage.getItem(key) ?? '{}') as {
      playtimeSec: number;
      clock: number;
      activeEvents: unknown[];
      locations: Record<
        string,
        { ambience: Record<string, number>; supply: { orders: unknown[]; stock: number[] } }
      >;
    };
    const b = save.locations['berlin'];
    if (!b) throw new Error('no berlin');
    if (p.clock !== undefined) save.clock = p.clock;
    if (p.rainyDaySec !== undefined)
      save.activeEvents = [
        {
          id: 'rainyDay',
          locationId: 'berlin',
          startedAt: save.playtimeSec,
          until: save.playtimeSec + p.rainyDaySec,
        },
      ];
    if (p.terrace !== undefined) b.ambience = { ...b.ambience, terrace: p.terrace };
    if (p.stock) b.supply.stock = p.stock;
    if (p.delivery)
      b.supply.orders = [
        {
          grade: 0,
          grams: p.delivery.grams,
          arriveAt: save.clock + p.delivery.inMinutes,
          express: true,
        },
      ];
    localStorage.setItem(key, JSON.stringify(save));
    Storage.prototype.setItem = () => undefined;
  }, patch);
  await page.reload();
  await page.waitForFunction(
    () => (window as Win).__mceGame?.scene.getScene('CafeScene')?.sys.settings.status === 5,
  );
}

test('Wetter: Regen mit Schirmen draußen, das HUD zeigt Regen; der erste Tag ist sonnig', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('?lang=de&tutorial=0');
  // Neues Spiel: Tag 1 morgens, sonnig.
  await expect(page.getByTestId('hud-sky')).toHaveAttribute('data-sky', 'sun');
  // Regentag-Event am Standort: Es regnet durchgehend.
  await reloadWith(page, { clock: 10 * 60, rainyDaySec: 900, terrace: 3 });
  await expect(page.getByTestId('hud-sky')).toHaveAttribute('data-sky', 'rain');
  await expect(page.getByRole('button', { name: /Wetter: Regen/ })).toBeVisible();
  // Regen über der Szene und Gäste draußen mit Schirm.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const s = (window as Win).__mceGame?.scene.getScene('CafeScene') as unknown as {
            umbrellas: { visible: boolean }[];
            weather: { isRaining(): boolean };
          };
          return s.weather.isRaining() && s.umbrellas.some((u) => u.visible);
        }),
      { timeout: 25_000 },
    )
    .toBe(true);
  expect(errors).toEqual([]);
});

test('Stammgast kommt zu seiner Stunde, winkt und die Kasse grüßt zurück; der Lieferant bringt die Kartons ins Lager', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('?lang=de&tutorial=0');
  // Tag 2 um 8 Uhr (Lena kommt um 8), das Lager ist leer, 1 kg Matcha kommt gleich (zwei Kartons) – mit ein paar
  // Spielminuten Vorlauf, damit die Szene schon läuft, wenn der Wagen vorfahren soll.
  await reloadWith(page, {
    clock: 24 * 60 + 8 * 60,
    stock: [0, 0, 0, 0, 0, 0, 0],
    delivery: { grams: 1000, inMinutes: 5 },
  });
  // Namensschild und Gruß sind nur kurz zu sehen: die Seite merkt sich, was zu sehen war.
  await page.evaluate(() => {
    const w = window as Win & { __life?: { label: string; heart: boolean } };
    const life = { label: '', heart: false };
    w.__life = life;
    window.setInterval(() => {
      const s = w.__mceGame?.scene.getScene('CafeScene') as unknown as {
        regularLabels: { text: { visible: boolean; text: string } }[];
        chatter: { bubbles: { agent: number; kind: string }[] };
      };
      const label = s.regularLabels.find((l) => l.text.visible)?.text.text;
      if (label) life.label = label;
      if (s.chatter.bubbles.some((b) => b.agent === -1 && b.kind === 'heart')) life.heart = true;
    }, 50);
  });
  const scene = () =>
    page.evaluate(() => {
      const w = window as Win & { __life?: { label: string; heart: boolean } };
      const s = w.__mceGame?.scene.getScene('CafeScene') as unknown as {
        street: {
          courier: { visible: boolean; frame: { name: string } };
          isIndoors(): boolean;
        };
        storage: { piece: string; sprite: { frame: { name: string } } }[];
      };
      return {
        label: w.__life?.label ?? '',
        cashierHeart: w.__life?.heart ?? false,
        courier: s.street.courier.visible ? s.street.courier.frame.name : '',
        indoors: s.street.isIndoors(),
        shelf: s.storage.find((v) => v.piece === 'corner')?.sprite.frame.name ?? '',
      };
    });
  // Leeres Regal, bis der Lieferant mit der vollen Karre im Café ist …
  await expect
    .poll(async () => (await scene()).courier, { timeout: 20_000 })
    .toMatch(/^courier-2-/);
  expect((await scene()).shelf).toMatch(/-0$/);
  await expect.poll(async () => (await scene()).indoors, { timeout: 15_000 }).toBe(true);
  expect((await scene()).shelf).toMatch(/-0$/);
  // … im Lager lädt er ab: die Dosen stehen im Regal, er schiebt die leere Karre zurück.
  await expect.poll(async () => (await scene()).shelf, { timeout: 30_000 }).toMatch(/-3$/);
  expect((await scene()).courier).toMatch(/^courier-0-/);
  await expect.poll(async () => (await scene()).label, { timeout: 40_000 }).toBe('Stammgast Lena');
  await expect.poll(async () => (await scene()).cashierHeart, { timeout: 5_000 }).toBe(true);
  expect(errors).toEqual([]);
});
