import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

interface SavePatch {
  leaves?: string;
  coins?: string;
  ageMs?: number;
  freeBoostAt?: number;
  /** Event am Standort Berlin, Zeiten relativ zur gespeicherten Spielzeit. */
  event?: { id: string; startIn: number; endIn: number };
}

/** Spielstand ändern und neu laden; die alte Seite darf danach nicht mehr speichern. */
async function reloadWithSave(page: Page, patch: SavePatch): Promise<void> {
  await page.evaluate((p) => {
    window.dispatchEvent(new Event('pagehide'));
    const key = Object.keys(localStorage).find((k) => /^mce\.save\.v\d+$/.test(k));
    if (!key) throw new Error('no save');
    const save = JSON.parse(localStorage.getItem(key) ?? '{}') as {
      lastSavedAt: number;
      playtimeSec: number;
      freeBoostAt: number;
      meta: { goldenLeaves: string };
      locations: Record<string, { coins: string }>;
      activeEvents: unknown[];
    };
    if (p.leaves !== undefined) save.meta.goldenLeaves = p.leaves;
    const berlin = save.locations['berlin'];
    if (p.coins !== undefined && berlin) berlin.coins = p.coins;
    if (p.ageMs !== undefined) save.lastSavedAt -= p.ageMs;
    if (p.freeBoostAt !== undefined) save.freeBoostAt = p.freeBoostAt;
    if (p.event) {
      save.activeEvents = [
        {
          id: p.event.id,
          locationId: 'berlin',
          startedAt: save.playtimeSec + p.event.startIn,
          until: save.playtimeSec + p.event.endIn,
        },
      ];
    }
    localStorage.setItem(key, JSON.stringify(save));
    Storage.prototype.setItem = () => undefined;
  }, patch);
  await page.reload();
}

async function axe(page: Page): Promise<void> {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

const leavesInHud = async (page: Page): Promise<string> =>
  (await page.getByTestId('hud-leaves').innerText()).replace(/\D+/g, '');

test('Blätter-Shop: Zeitsprung, Boost, Skin – über das „+“ am Blätter-Stand', async ({ page }) => {
  await page.goto('?lang=de');
  await expect(page.getByTestId('hud')).toBeVisible();
  await reloadWithSave(page, { leaves: '40' });
  await page.getByTestId('hud-leaf-shop').click();
  const panel = page.getByTestId('panel-leafShop');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('leafshop-balance')).toContainText('40');
  await axe(page);

  // Boost zuerst: danach bringt der Zeitsprung Münzen, und Münz-Erfolge zahlen eigene Blätter aus.
  await page.getByTestId('leaf-boost').click();
  await expect(page.getByTestId('leafshop-balance')).toContainText('32');
  await expect(page.getByTestId('hud-boost-leaf')).toBeVisible();
  await expect(page.getByTestId('hud-boost-leaf')).toContainText('×2');

  const coinsBefore = await page.getByTestId('hud-coins').innerText();
  await page.getByTestId('leaf-skip8h').click();
  await expect(page.getByTestId('hud-coins')).not.toHaveText(coinsBefore);
  await expect.poll(async () => Number(await leavesInHud(page))).toBeLessThan(32);
});

test('Skin kaufen, ablegen, anlegen', async ({ page }) => {
  await page.goto('?lang=de');
  await expect(page.getByTestId('hud')).toBeVisible();
  await reloadWithSave(page, { leaves: '30' });
  await page.getByTestId('hud-leaf-shop').click();
  const skin = page.getByTestId('leaf-skin-sakuraBar');
  await skin.click();
  await expect(skin).toHaveText('Ablegen');
  await expect(page.getByTestId('leafshop-balance')).toContainText(' 0 ');
  await skin.click();
  await expect(skin).toHaveText('Anlegen');
});

test('Event: Karte, Detail, Lieferengpass beheben (+5 🍃), axe', async ({ page }) => {
  // Die Karte wippt sonst endlos und ist für Playwright nie „stabil“ klickbar.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('?lang=de');
  await expect(page.getByTestId('hud')).toBeVisible();
  await reloadWithSave(page, {
    leaves: '0',
    coins: '1e9',
    event: { id: 'supplyShortage', startIn: 0, endIn: 300 },
  });
  const card = page.getByTestId('event-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Lieferengpass');
  await card.click();
  await expect(page.getByTestId('panel-events')).toBeVisible();
  await expect(page.getByTestId('event-list')).toContainText('Qualität');
  await axe(page);
  await page.getByTestId('event-resolve-0').click();
  await expect(page.getByTestId('toasts')).toContainText('Event geschafft: Lieferengpass');
  await expect(card).toBeHidden();
  // 5 🍃 für das Event + 5 🍃 für den Erfolg „erstes Event“.
  await expect.poll(() => leavesInHud(page)).toBe('10');
});

test('Event endet während der Abwesenheit und wird beim Laden abgeschlossen', async ({ page }) => {
  await page.goto('?lang=de');
  await expect(page.getByTestId('hud')).toBeVisible();
  await reloadWithSave(page, {
    leaves: '0',
    ageMs: 10 * 60_000,
    event: { id: 'heatwave', startIn: -60, endIn: 120 },
  });
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('event-card')).toBeHidden();
  // 5 🍃 für die Hitzewelle + 5 🍃 für den Erfolg „erstes Event“.
  await expect.poll(() => leavesInHud(page)).toBe('10');
});

test('Gratis-Boost über den No-op-Provider; kein Netzwerk-Call außer der eigenen Seite', async ({
  page,
  baseURL,
}) => {
  const foreign: string[] = [];
  const origin = new URL(baseURL ?? 'http://localhost:5173').origin;
  page.on('request', (r) => {
    const url = r.url();
    if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:'))
      foreign.push(url);
  });
  await page.goto('?lang=de');
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('hud-free-boost')).toBeHidden();
  await reloadWithSave(page, { freeBoostAt: 0 });
  const free = page.getByTestId('hud-free-boost');
  await expect(free).toBeVisible();
  await free.click();
  await expect(page.getByTestId('hud-boost-free')).toBeVisible();
  await expect(free).toBeHidden();
  await expect(page.getByTestId('toasts')).toContainText('Gratis-Boost');
  await axe(page);
  expect(foreign).toEqual([]);
});
