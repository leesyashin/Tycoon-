import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type Phaser from 'phaser';

/** Café-Szene und Store über den Dev-Hook (`window.__mceGame`, nur im Dev-Server, auf dem die e2e-Tests laufen). */
type Win = Window & { __mceGame?: Phaser.Game };

interface SaveEdit {
  coins?: string;
  ageMs?: number;
  level?: number;
  bestLevel?: number;
  earnedThisRun?: string;
  zen?: string;
  leaves?: string;
  /** Spieluhr in Spielminuten seit Spielbeginn: `10 * 60` ist Tag 1, 10:00 (geöffnet), `20 * 60` abends (zu). */
  clock?: number;
  /** Matcha-Lager leer, keine Lieferung unterwegs. */
  noMatcha?: boolean;
  /** Express-Lieferung, die in so vielen Spielminuten ankommt. */
  delivery?: { grade: number; grams: number; inMinutes: number };
  stats?: Record<string, number>;
  /** Tagesaufgaben für den heutigen lokalen Tag (IDs aus data/quests). */
  questsToday?: string[];
}

/**
 * Schreibt einen geänderten Spielstand und lädt neu. Die alte Seite darf beim Verlassen
 * nicht mehr speichern, sonst überschreibt ihr Autosave die Änderung.
 */
async function reloadWithSave(page: Page, edit: SaveEdit): Promise<void> {
  await page.evaluate((e) => {
    window.dispatchEvent(new Event('pagehide'));
    const key = Object.keys(localStorage).find((k) => /^mce\.save\.v\d+$/.test(k));
    if (!key) throw new Error('no save');
    const save = JSON.parse(localStorage.getItem(key) ?? '{}') as {
      lastSavedAt: number;
      clock: number;
      locations: Record<
        string,
        {
          coins: string;
          level: number;
          bestLevel: number;
          earnedThisRun: string;
          supply: { stock: number[]; orders: unknown[] };
        }
      >;
      meta: { zen: string; goldenLeaves: string };
      stats: Record<string, number>;
      quests: unknown;
    };
    const berlin = save.locations['berlin'];
    if (!berlin) throw new Error('no berlin');
    if (e.coins !== undefined) berlin.coins = e.coins;
    if (e.level !== undefined) berlin.level = e.level;
    if (e.bestLevel !== undefined) berlin.bestLevel = e.bestLevel;
    if (e.earnedThisRun !== undefined) berlin.earnedThisRun = e.earnedThisRun;
    if (e.zen !== undefined) save.meta.zen = e.zen;
    if (e.leaves !== undefined) save.meta.goldenLeaves = e.leaves;
    if (e.ageMs !== undefined) save.lastSavedAt -= e.ageMs;
    if (e.clock !== undefined) save.clock = e.clock;
    if (e.noMatcha) {
      berlin.supply.stock = berlin.supply.stock.map(() => 0);
      berlin.supply.orders = [];
    }
    if (e.delivery) {
      const { grade, grams, inMinutes } = e.delivery;
      berlin.supply.orders = [{ grade, grams, arriveAt: save.clock + inMinutes, express: true }];
    }
    if (e.stats) save.stats = { ...save.stats, ...e.stats };
    if (e.questsToday) {
      const now = Date.now();
      const date = new Date(now - new Date(now).getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 10);
      const items = e.questsToday.map((id) => ({ id, base: 0, progress: 0, claimed: false }));
      save.quests = { date, items, bonusClaimed: false };
    }
    localStorage.setItem(key, JSON.stringify(save));
    Storage.prototype.setItem = () => undefined;
  }, edit);
  await page.reload();
}

/**
 * Wanduhr auf heute 12:00 Ortszeit: Zwischen 2 und 4 Uhr gäbe es sonst den geheimen Erfolg „Nachtschicht“
 * (+5 🍃) dazu, und Tests, die Blätter zählen, schlügen je nach Uhrzeit des CI-Laufs fehl.
 */
async function atNoon(page: Page): Promise<void> {
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  await page.clock.setFixedTime(noon);
}

/** Erste ganze Zahl im Text: „☯ Zen: 24“ → 24, „Kaufen (5 ☯)“ → 5, „Lv 3/10“ → 3. */
function intIn(text: string): number {
  const m = /\d+/.exec(text);
  if (!m) throw new Error(`keine Zahl in „${text}“`);
  return Number(m[0]);
}

/** Goldene Blätter im HUD (die Beschriftung davor enthält keine Ziffern). */
const leavesInHud = async (page: Page): Promise<number> =>
  intIn(await page.getByTestId('hud-leaves').innerText());

/** Spieluhr aus dem HUD („Tag 2 · 14:05“, nur Deutsch) in Spielminuten seit Spielbeginn. */
async function hudClock(page: Page): Promise<number> {
  const text = await page.getByTestId('hud-clock').innerText();
  const m = /Tag (\d+) · (\d+):(\d+)/.exec(text);
  if (!m) throw new Error(`Uhr nicht lesbar: „${text}“`);
  return (Number(m[1]) - 1) * 24 * 60 + Number(m[2]) * 60 + Number(m[3]);
}

/** Spielminuten je echter Sekunde, gemessen an der HUD-Uhr über `ms` Millisekunden. */
async function clockRate(page: Page, ms: number): Promise<number> {
  const c0 = await hudClock(page);
  const t0 = Date.now();
  await page.waitForTimeout(ms);
  const c1 = await hudClock(page);
  return (c1 - c0) / ((Date.now() - t0) / 1000);
}

/** Wartet, bis der erste Kauf bezahlbar ist, und kauft ×1. Geräte haben ein Höchstlevel („Level 1/20“). */
async function buyFirstUpgrade(page: Page): Promise<void> {
  await page.getByTestId('nav-shop').click();
  await page.getByTestId('shop-station-matchaStation').click();
  await expect(page.getByTestId('station-level')).toHaveText(/^Level 1\/\d+$/);
  const buy = page.getByTestId('buy-1');
  await expect(buy).toBeEnabled({ timeout: 20_000 });
  await buy.click();
  await expect(page.getByTestId('station-level')).toHaveText(/^Level 2\/\d+$/);
}

/** Gezählte Taps aus dem Spielstand (Store in der Phaser-Registry, Dev-Hook). */
async function tapCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const store = (window as Win).__mceGame?.registry.get('store') as
      { getState(): { stats: { taps: number } } } | undefined;
    if (!store) throw new Error('kein Dev-Hook');
    return store.getState().stats.taps;
  });
}

/**
 * Freier Boden im Café: Geräte, Tische und Deko öffnen beim Antippen ihr Panel, nur der Boden feuert an.
 * Probiert ein paar Punkte durch, bis ein Tap zählt.
 */
async function findFloorSpot(page: Page): Promise<{ x: number; y: number }> {
  await page.waitForFunction(
    () => (window as Win).__mceGame?.scene.getScene('CafeScene')?.sys.settings.status === 5,
  );
  const box = await page.locator('#game canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  const candidates = [
    [0.5, 0.65],
    [0.5, 0.7],
    [0.4, 0.65],
    [0.6, 0.7],
    [0.5, 0.55],
    [0.35, 0.5],
    [0.3, 0.45],
  ] as const;
  for (const [fx, fy] of candidates) {
    const spot = { x: box.x + box.width * fx, y: box.y + box.height * fy };
    const before = await tapCount(page);
    await page.mouse.click(spot.x, spot.y);
    await page.waitForTimeout(300);
    if (await page.getByTestId('panel-close').isVisible()) {
      await page.getByTestId('panel-close').click();
      continue;
    }
    if ((await tapCount(page)) > before) return spot;
  }
  throw new Error('kein freier Boden zum Antippen gefunden');
}

test('Spielschleife ohne Debug-Tasten: kaufen, speichern, neu laden', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('?lang=de&tutorial=0');
  await buyFirstUpgrade(page);
  await page.reload();
  await page.getByTestId('nav-shop').click();
  await expect(page.getByTestId('shop-station-matchaStation')).toBeVisible();
  await page.getByTestId('shop-station-matchaStation').click();
  await expect(page.getByTestId('station-level')).toHaveText(/^Level 2\/\d+$/);
  expect(errors).toEqual([]);
});

test('Objekt-Panel: Verbessern ohne Scrollen sichtbar, auch auf kleinem Handy', async ({
  page,
}) => {
  // Antippen eines Objekts in der Szene öffnet dieses Panel; die Kauf-Buttons stehen direkt unter dem Level.
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('?lang=de&tutorial=0');
  await page.getByTestId('nav-shop').click();
  await page.getByTestId('shop-station-matchaStation').click();
  for (const amount of ['1', '5', 'max']) {
    await expect(page.getByTestId(`buy-${amount}`)).toBeInViewport({ ratio: 1 });
  }
  // Phase 3: Geräte gehen nur bis Level 20, deshalb ×1, ×5, Max statt ×10 und ×100.
  await expect(page.getByTestId('buy-10')).toHaveCount(0);
  await expect(page.getByTestId('buy-100')).toHaveCount(0);
  await page.getByTestId('tile-ambience-decor').click();
  await expect(page.getByTestId('ambience-level')).toBeVisible();
  await expect(page.getByTestId('ambience-buy-decor')).toBeInViewport({ ratio: 1 });
});

test('Ambiente lässt sich im Shop kaufen: Tische und Parkplatz', async ({ page }) => {
  await page.goto('?lang=en&tutorial=0');
  await reloadWithSave(page, { coins: '100000' });
  await page.getByTestId('nav-shop').click();
  await page.getByTestId('shop-tab-ambience').click();
  // Ein Tisch steht schon (Startausstattung), jeder weitere kostet.
  const seats = page.locator('li', { has: page.getByTestId('shop-ambience-seats') });
  await expect(seats).toContainText(/Lv 1\/\d+/);
  await page.getByTestId('shop-ambience-seats').click();
  await expect(seats).toContainText(/Lv 2\/\d+/);
  // Der Parkplatz neben dem Café kommt erst mit einem höheren Café-Level.
  const parking = page.locator('li', { has: page.getByTestId('shop-ambience-parking') });
  await expect(parking).toContainText(/from café lv \d+/);
  await expect(page.getByTestId('shop-ambience-parking')).toBeDisabled();

  await reloadWithSave(page, { level: 5 });
  await page.getByTestId('nav-build').click();
  await expect(parking).toContainText(/Lv 0\/\d+/);
  await page.getByTestId('shop-ambience-parking').click();
  await expect(parking).toContainText(/Lv 1\/\d+/);
});

test('HUD: Spieltag und Uhrzeit, geöffnet mit Umsatz pro Stunde, nachts zu und die Zeit spult vor', async ({
  page,
}) => {
  await page.goto('?lang=de&tutorial=0');
  await reloadWithSave(page, { clock: 10 * 60 });
  await expect(page.getByTestId('hud-clock')).toHaveText(/^Tag 1 · 10:\d\d$/);
  await expect(page.getByTestId('hud-open')).toHaveText('Geöffnet');
  await expect(page.getByTestId('hud-income')).toHaveText(/^\+[\d.]+(,\d\d)?\s€\/h$/);
  // Geöffnet: Eine Spielstunde dauert eine echte Minute.
  const openRate = await clockRate(page, 3000);
  expect(openRate).toBeGreaterThan(0.5);
  expect(openRate).toBeLessThan(2);

  // Abends ist zu: statt Umsatz pro Stunde der Gewinn des Tages, und die Nacht spult vor.
  await reloadWithSave(page, { clock: 20 * 60 });
  await expect(page.getByTestId('hud-open')).toHaveText(/^Geschlossen bis \d{1,2}:00$/);
  await expect(page.getByTestId('hud-income')).toHaveText(/^Heute -?[\d.]+(,\d\d)?\s€$/);
  const nightRate = await clockRate(page, 2000);
  expect(nightRate).toBeGreaterThan(openRate * 2);
});

test('Betrieb: Öffnungszeiten über die Uhr einstellen, früher schließen wirkt sofort, Boni in der Tagesbilanz', async ({
  page,
}) => {
  await page.goto('?lang=de&tutorial=0');
  // Die Uhr im HUD führt zu „Betrieb“: dort steht, wann das Café schließt.
  await page.getByTestId('hud-clock').click();
  await expect(page.getByTestId('panel-stats')).toBeVisible();
  const close = intIn(await page.getByTestId('hours-close').innerText());
  const hh = (hour: number): string => `${String(hour)}:00`;
  // Kurz vor Feierabend, genug Geld für einen großen Ausbau.
  await reloadWithSave(page, { clock: (close - 1) * 60 + 15, coins: '1000000' });
  await expect(page.getByTestId('hud-open')).toHaveText('Geöffnet');
  // Ausbau bis zum nächsten Café-Level: Der Level-Bonus landet in der Tagesbilanz unter „Boni“.
  await page.getByTestId('nav-shop').click();
  await page.getByTestId('shop-station-matchaStation').click();
  await page.getByTestId('buy-max').click();
  await expect(page.getByTestId('toasts')).toContainText('Café-Level-Bonus');
  await page.getByTestId('panel-close').click();

  await page.getByTestId('hud-clock').click();
  await expect(page.getByTestId('panel-stats')).toBeVisible();
  await expect(page.getByTestId('manage-tab-stats')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('hours-text')).toHaveText(
    new RegExp(`^Geöffnet \\d+:00 – ${hh(close)} \\(\\d+ Std\\.\\)$`),
  );
  await expect(page.getByTestId('hour-chart')).toBeVisible();
  await expect(page.getByTestId('ledger-today-balance')).toContainText('Tagesbilanz');
  await expect(page.getByTestId('ledger-today-bonus')).toBeVisible();
  await expect(page.getByTestId('ledger-today-bonus')).toContainText('€');

  // Eine Stunde früher schließen: Diese Stunde hat schon begonnen, das Café macht sofort zu.
  await page.getByTestId('hours-close-dec').click();
  await expect(page.getByTestId('hours-close')).toHaveText(hh(close - 1));
  await expect(page.getByTestId('hud-open')).toHaveText(/^Geschlossen bis \d{1,2}:00$/);
  await expect(page.getByTestId('hours-shorten')).toContainText(hh(close - 2));

  // Früher öffnen geht nur bis zur frühesten erlaubten Stunde. Erst klicken, wenn die letzte Änderung
  // angezeigt wird: Label und Sperre setzt dasselbe Update.
  const openDec = page.getByTestId('hours-open-dec');
  const openLabel = page.getByTestId('hours-open');
  for (let i = 0; i < 24 && !(await openDec.isDisabled()); i++) {
    const before = await openLabel.innerText();
    await openDec.click();
    await expect(openLabel).not.toHaveText(before);
  }
  await expect(openDec).toBeDisabled();
  await expect(page.getByTestId('hours-open')).toHaveText(/^\d{1,2}:00$/);
  await expect(page.getByTestId('hours-text')).toContainText(
    `${await page.getByTestId('hours-open').innerText()} – ${hh(close - 1)}`,
  );
});

test('Sprachwechsel ändert Texte, Euro- und Uhrzeitformat sofort', async ({ page }) => {
  await page.goto('?lang=de&tutorial=0');
  // Geld kommt erst beim Bezahlen: ein Betrag mit Nachkommastellen, statt auf den ersten Gast zu warten.
  await reloadWithSave(page, { coins: '1234.56', clock: 10 * 60 });
  // Bottom-Bar ohne sichtbare Beschriftung (UI_STYLE § 6.2): Name steckt im aria-label.
  await expect(page.getByTestId('nav-settings')).toHaveAttribute('aria-label', 'Einstellungen');
  await expect(page.getByTestId('hud-coins')).toContainText(/\d\.\d{3},\d{2}\s€/);
  await expect(page.getByTestId('hud-clock')).toHaveText(/^Tag 1 · 1\d:\d\d$/);
  await expect(page.getByTestId('hud-open')).toHaveText('Geöffnet');
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('settings-lang').selectOption('en');
  await expect(page.getByTestId('nav-settings')).toHaveAttribute('aria-label', 'Settings');
  await expect(page.getByTestId('hud')).toContainText('Cash');
  await expect(page.getByTestId('hud-coins')).toContainText(/€\d,\d{3}\.\d{2}/);
  await expect(page.getByTestId('hud-income')).toHaveText(/^\+€[\d,]+(\.\d\d)?\/h$/);
  await expect(page.getByTestId('hud-clock')).toHaveText(/^Day 1 · \d{1,2}:\d\d\s[AP]M$/);
  await expect(page.getByTestId('hud-open')).toHaveText('Open');
  await expect(page.getByTestId('panel-settings')).toContainText('Language');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByTestId('settings-number-format').selectOption('scientific');
  await page.getByTestId('settings-lang').selectOption('de');
  await expect(page.getByTestId('hud')).toContainText('Geld');
});

test('Offline-Dialog: Abwesenheit zählt in Spieltagen, mit Deckel', async ({ page }) => {
  await page.goto('?lang=de&tutorial=0');
  const dlg = page.getByTestId('dialog-offline');
  // Kurz weg, mitten am Tag: kein Tageswechsel, also keine Spieltage im Text und kein Deckel.
  await reloadWithSave(page, { clock: 10 * 60, ageMs: 2 * 60 * 1000 });
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText(/Du warst 2 min( \d+ s)? weg\. Seitdem: \d+ Gäste, Umsatz /);
  await expect(dlg).not.toContainText('Spieltag');
  await expect(dlg).not.toContainText('Angerechnet');
  await page.getByTestId('dialog-confirm').click();
  await expect(dlg).toBeHidden();
  await expect(page.getByTestId('hud-clock')).toHaveText(/^Tag 1 · /);

  // Kurz vor Feierabend gegangen, zwei Stunden später zurück: Das Café lief über die Nacht in den nächsten Tag.
  await reloadWithSave(page, { clock: 17 * 60, ageMs: 2 * 3600 * 1000 });
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('Du warst 2 h weg');
  // „1 Spieltag“ bzw. „2 Spieltage“ – nie „1 Spieltage“.
  await expect(dlg).toContainText(
    /Seitdem: [1-9]\d* Spieltage?, \d+ Gäste, Umsatz [\d.]+(,\d\d)?\s€/,
  );
  await expect(dlg).not.toContainText(/\b1 Spieltage\b/);
  await expect(dlg).toContainText(/(Gewinn|Verlust) nach allen Kosten: [\d.]+(,\d\d)?\s€/);
  // Zwei echte Stunden sind viele Spieltage; angerechnet wird nur bis zum Deckel.
  await expect(dlg).toContainText('Angerechnet wurden höchstens');
  await page.getByTestId('dialog-confirm').click();
  await expect(dlg).toBeHidden();
  await expect(page.getByTestId('hud-clock')).toHaveText(/^Tag [2-9] · /);
});

test('Export, Import und Löschen mit doppelter Bestätigung', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('?lang=de&tutorial=0');
  await buyFirstUpgrade(page);
  await page.getByTestId('nav-settings').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('settings-export').click(),
  ]);
  const path = await download.path();

  // Kaputte Datei: Fehler-Toast, Spielstand bleibt.
  await page.getByTestId('settings-import-file').setInputFiles({
    name: 'x.json',
    mimeType: 'application/json',
    buffer: Buffer.from('kein json'),
  });
  await expect(page.getByTestId('toasts')).toContainText('Import fehlgeschlagen');

  // Löschen: erste Bestätigung abbrechen ändert nichts.
  await page.getByTestId('settings-delete').click();
  await page.getByTestId('dialog-cancel').click();
  await page.getByTestId('settings-delete').click();
  await page.getByTestId('dialog-confirm').click();
  await page.getByTestId('dialog-confirm').click();
  await expect(page.getByTestId('toasts')).toContainText('gelöscht');
  await page.getByTestId('nav-shop').click();
  await page.getByTestId('shop-station-matchaStation').click();
  await expect(page.getByTestId('station-level')).toHaveText(/^Level 1\/\d+$/);

  // Export wieder einspielen: Level 2 ist zurück.
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('settings-import-file').setInputFiles(path);
  await expect(page.getByTestId('toasts')).toContainText('importiert');
  await page.getByTestId('nav-shop').click();
  await page.getByTestId('shop-station-matchaStation').click();
  await expect(page.getByTestId('station-level')).toHaveText(/^Level 2\/\d+$/);
});

test('Barrierefreiheit: keine axe-Verstöße (WCAG 2 A/AA) in HUD und allen Panels', async ({
  page,
}) => {
  // Rund 30 axe-Scans brauchen auf dem CI-Runner deutlich mehr als die Standard-30 s.
  test.setTimeout(240_000);
  await page.goto('?lang=de&tutorial=0');
  await reloadWithSave(page, { clock: 10 * 60 });
  // Weich: alle Screens scannen und alle Verstöße auf einmal melden, jeweils mit dem Ort.
  const scan = async (where: string): Promise<void> => {
    // Toasts blenden 0,25 s ein: Mitten im Einblenden ist die Schrift halb durchsichtig, axe würde das als
    // Kontrastfehler werten (auf dem langsameren CI-Runner passiert das). Gescannt wird der fertige Zustand.
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.toast')].every((t) =>
        t.getAnimations().every((a) => a.playState === 'finished'),
      ),
    );
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect
      .soft(
        r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
        where,
      )
      .toEqual([]);
  };
  await expect(page.getByTestId('hud-open')).toHaveText('Geöffnet');
  await scan('HUD geöffnet');
  // Jedes Ziel der Navigation, auch Einkauf und Social Media (Phase 3).
  const screens = [
    ['shop', 'shop'],
    ['build', 'shop'],
    ['supply', 'supply'],
    ['staff', 'staff'],
    ['social', 'social'],
    ['stats', 'stats'],
    ['locations', 'locations'],
    ['achievements', 'achievements'],
    ['settings', 'settings'],
  ] as const;
  for (const [nav, panel] of screens) {
    await page.getByTestId(`nav-${nav}`).click();
    await expect(page.getByTestId(`panel-${panel}`)).toBeVisible();
    await scan(`nav-${nav}`);
  }
  await page.getByTestId('nav-achievements').click();
  for (const tab of ['quests', 'stats']) {
    await page.getByTestId(`progress-tab-${tab}`).click();
    await scan(`progress-tab-${tab}`);
  }
  await page.getByTestId('nav-locations').click();
  await page.getByTestId('locations-tab-zen').click();
  await scan('locations-tab-zen');
  await page.getByTestId('hud-satisfaction').click();
  await expect(page.getByTestId('panel-satisfaction')).toBeVisible();
  await scan('panel-satisfaction');
  await page.getByTestId('nav-shop').click();
  await page.getByTestId('shop-station-matchaStation').click();
  await scan('panel-station');
  await page.getByTestId('tile-ambience-seats').click();
  await scan('tile-ambience-seats');

  // Zustände, die erst durch Handeln entstehen: Lieferung unterwegs (Express), gepostetes Video,
  // eingestellte Bedienung mit Entlassen-Knopf, Tagesbilanz mit Ausgaben.
  await page.getByTestId('nav-supply').click();
  await page.getByTestId('supply-express').check();
  await page.getByTestId('supply-order-0').click();
  await expect(page.getByTestId('supply-orders').locator('li')).toHaveCount(1);
  await scan('Einkauf mit Lieferung unterwegs');
  await page.getByTestId('manage-tab-social').click();
  await page.getByTestId('social-post-latteArt').click();
  await expect(page.getByTestId('social-recent').locator('li')).toHaveCount(1);
  await scan('Social Media nach dem ersten Video');
  await page.getByTestId('manage-tab-staff').click();
  await page.getByTestId('staff-hire-waiter').click();
  await expect(page.getByTestId('staff-fire-waiter')).toBeEnabled();
  await scan('Personal mit Bedienung');
  await page.getByTestId('manage-tab-stats').click();
  await expect(page.getByTestId('ledger-today-matcha')).toBeVisible();
  await scan('Betrieb mit Ausgaben');

  // Nachts geschlossen, Konto im Minus, Matcha aus: Warn-Chips im HUD.
  await reloadWithSave(page, { clock: 20 * 60, coins: '-50', noMatcha: true });
  await expect(page.getByTestId('hud-open')).toHaveText(/^Geschlossen bis/);
  await expect(page.getByTestId('hud-debt')).toBeVisible();
  await expect(page.getByTestId('hud-matcha')).toBeVisible();
  await scan('HUD nachts, im Minus, ohne Matcha');
  await page.getByTestId('nav-stats').click();
  await expect(page.getByTestId('stats-pipeline-served')).toBeVisible();
  await scan('Betrieb nachts');
});

test('Personal: einstellen und entlassen, Löhne sichtbar, Mindestbesetzung bleibt', async ({
  page,
}) => {
  await page.goto('?lang=en&tutorial=0');
  await reloadWithSave(page, { coins: '100000', level: 5 });
  await page.getByTestId('nav-staff').click();
  // Pipeline-Karte: vier Stufen in Gästen pro Spielstunde, Engpass benannt.
  await expect(page.getByTestId('pipeline-bottleneck')).toContainText('Bottleneck:');
  await expect(page.getByTestId('pipeline-order')).toContainText('/h');
  // Gründungsteam: du an der Kasse (ohne Lohn) und ein Barista; die Teamkosten stehen oben.
  const team = page.getByTestId('staff-team-cost');
  await expect(team).toContainText('Team: 2 people');
  await expect(team).toContainText(/wages €[\d.,]+\/h · €[\d.,]+ per day/);
  await expect(page.getByTestId('staff-row-cashier')).toContainText('incl. you');
  await expect(page.getByTestId('staff-fire-cashier')).toBeHidden();
  const barista = page.getByTestId('staff-row-barista');
  await expect(barista).toContainText(/1\/\d+ hired/);
  await expect(page.getByTestId('staff-wage-barista')).toContainText(
    /Wages: €[\d.,]+\/h · €[\d.,]+ per day/,
  );
  // Ohne Barista bereitet niemand zu: Der letzte lässt sich nicht entlassen, der Tooltip sagt warum.
  const fireBarista = page.getByTestId('staff-fire-barista');
  await expect(fireBarista).toBeDisabled();
  await expect(fireBarista).toHaveAttribute('title', /Barista/);

  // Einstellen kostet einmalig eine Gebühr; danach lässt sich der zweite Barista wieder entlassen.
  await expect(page.getByTestId('staff-hire-barista')).toHaveText(/^Hire · €[\d.,]+$/);
  await page.getByTestId('staff-hire-barista').click();
  await expect(barista).toContainText(/2\/\d+ hired/);
  await expect(team).toContainText('Team: 3 people');
  await expect(fireBarista).toBeEnabled();
  await fireBarista.click();
  await expect(barista).toContainText(/1\/\d+ hired/);
  await expect(team).toContainText('Team: 2 people');
  await expect(fireBarista).toBeDisabled();

  // Bedienung: einstellen, Lohn erscheint, wieder entlassen.
  const waiter = page.getByTestId('staff-row-waiter');
  await expect(waiter).toContainText(/0\/\d+ hired/);
  await expect(page.getByTestId('staff-fire-waiter')).toBeHidden();
  await page.getByTestId('staff-hire-waiter').click();
  await expect(waiter).toContainText(/1\/\d+ hired/);
  await expect(page.getByTestId('staff-wage-waiter')).toContainText('per day');
  await page.getByTestId('staff-fire-waiter').click();
  await expect(waiter).toContainText(/0\/\d+ hired/);
  await expect(page.getByTestId('staff-fire-waiter')).toBeHidden();

  // Filialleiter schaltet den Auto-Kauf frei; eine Stufe zurück nimmt ihn wieder weg.
  const autobuy = page.getByTestId('staff-autobuy');
  await expect(autobuy).toBeDisabled();
  await page.getByTestId('staff-hire-manager').click();
  await expect(autobuy).toBeEnabled();
  await autobuy.check();
  await expect(autobuy).toBeChecked();
  await expect(page.getByTestId('hud-avatar')).toBeVisible();
  await page.getByTestId('staff-fire-manager').click();
  await expect(autobuy).toBeDisabled();
  await expect(autobuy).not.toBeChecked();
  await expect(page.getByTestId('hud-avatar')).toBeHidden();
});

test('Social Media: Videos posten bis zum Tageslimit, Bonus-Video gegen Blätter', async ({
  page,
}) => {
  await atNoon(page);
  await page.goto('?lang=en&tutorial=0');
  await reloadWithSave(page, { leaves: '10', clock: 10 * 60 });
  await page.getByTestId('nav-social').click();
  await expect(page.getByTestId('panel-social')).toBeVisible();
  const posts = page.getByTestId('social-posts');
  await expect(posts).toHaveText(/^0\/\d+ videos today$/);
  const limit = Number(/\/(\d+)/.exec(await posts.innerText())?.[1]);
  const followers = page.getByTestId('social-followers');
  const startFollowers = intIn(await followers.innerText());
  const recent = page.getByTestId('social-recent').locator('li');
  await expect(recent).toHaveCount(0);

  // Gratis-Clip und bezahltes Barista-Tutorial im Wechsel, bis das Tageslimit erreicht ist.
  for (let i = 1; i <= limit; i++) {
    await page.getByTestId(i % 2 === 0 ? 'social-post-tutorial' : 'social-post-latteArt').click();
    await expect(posts).toHaveText(new RegExp(`^${String(i)}/${String(limit)} videos today$`));
    await expect(recent).toHaveCount(i);
  }
  await expect(page.getByTestId('toasts')).toContainText(/Video posted|Viral!/);
  await expect.poll(async () => intIn(await followers.innerText())).toBeGreaterThan(startFollowers);
  for (const format of ['latteArt', 'tutorial']) {
    await expect(page.getByTestId(`social-post-${format}`)).toHaveText('Again tomorrow');
    await expect(page.getByTestId(`social-post-${format}`)).toBeDisabled();
  }

  // Über das Limit hinaus: Bonus-Video gegen Goldene Blätter (nach dem Erfolg fürs erste Video).
  const bonus = page.getByTestId('social-bonus');
  await expect(bonus).toBeEnabled();
  const cost = intIn(await bonus.innerText());
  await page.waitForTimeout(1500);
  const leaves = await leavesInHud(page);
  await bonus.click();
  await expect.poll(() => leavesInHud(page)).toBe(leaves - cost);
  await expect(recent).toHaveCount(limit + 1);
  await expect(posts).toHaveText(new RegExp(`^${String(limit)}/${String(limit)} videos today$`));

  // Das bezahlte Video steht in der Tagesbilanz.
  await page.getByTestId('manage-tab-stats').click();
  await expect(page.getByTestId('ledger-today-marketing')).toBeVisible();
  await expect(page.getByTestId('ledger-today-marketing')).toContainText('Social media');
});

test('Zufriedenheits-Detail zeigt Beiträge, auch wenn der Matcha ausgeht', async ({ page }) => {
  await page.goto('?lang=de&tutorial=0');
  await page.getByTestId('hud-satisfaction').click();
  await expect(page.getByTestId('panel-satisfaction')).toBeVisible();
  await expect(page.getByTestId('sat-part-base')).toHaveText(/^\+\d+$/);
  // Frisch geputzt: Sauberkeit hebt die Zufriedenheit.
  await expect(page.getByTestId('sat-part-cleanliness')).toHaveText(/^\+\d/);
  await expect(page.getByTestId('sat-part-matcha')).toBeHidden();
  await page.getByTestId('hud-satisfaction').click();
  await expect(page.getByTestId('panel-satisfaction')).toBeHidden();

  // Matcha alle: Hinweis im HUD, Abzug bei der Zufriedenheit, der Hinweis führt zum Einkauf.
  await reloadWithSave(page, { clock: 10 * 60, noMatcha: true });
  const chip = page.getByTestId('hud-matcha');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('Matcha aus');
  await page.getByTestId('hud-satisfaction').click();
  await expect(page.getByTestId('sat-part-matcha')).toBeVisible();
  await expect(page.getByTestId('sat-part-matcha')).toHaveText(/^[-−]\d/);
  await expect(page.getByTestId('sat-hint')).toContainText('Einkauf');
  await page.getByTestId('hud-satisfaction').click();
  await chip.click();
  await expect(page.getByTestId('panel-supply')).toBeVisible();
  await expect(page.getByTestId('supply-in-use')).toHaveText('Kein Matcha mehr im Lager!');
  await expect(page.getByTestId('supply-out')).toBeVisible();
});

test('Einkauf: Lieferung kommt an, Sorte ausschenken, bestellen mit Express, Nachbestellung abschalten', async ({
  page,
}) => {
  await page.goto('?lang=en&tutorial=0');
  // Café-Lv 3: die zweite Sorte ist freigeschaltet, eine Express-Lieferung davon ist gleich da.
  await reloadWithSave(page, {
    coins: '100000',
    level: 3,
    clock: 10 * 60,
    delivery: { grade: 1, grams: 250, inMinutes: 2 },
  });
  await page.getByTestId('nav-supply').click();
  await expect(page.getByTestId('panel-supply')).toBeVisible();
  await expect(page.getByTestId('supply-in-use')).toHaveText('Serving: Culinary Grade');
  await expect(page.getByTestId('supply-stock')).toContainText(/In stock: [\d.,]+ (k?g) matcha/);
  // Automatische Nachbestellung ist ab Werk an.
  await expect(page.getByTestId('supply-auto')).toBeChecked();

  // Die Lieferung kommt an: Toast, Vorrat der Sorte steigt, sie lässt sich ausschenken.
  await expect(page.getByTestId('toasts')).toContainText('Matcha delivery arrived', {
    timeout: 15_000,
  });
  const cafeGrade = page.locator('li', { has: page.getByTestId('supply-serve-1') });
  await expect(cafeGrade).toContainText('In stock: 250 g');
  await page.getByTestId('supply-serve-1').click();
  await expect(page.getByTestId('supply-in-use')).toHaveText('Serving: Café Grade');
  await expect(page.getByTestId('supply-serve-1')).toBeDisabled();
  await expect(page.getByTestId('hud-quality')).toHaveAttribute('aria-label', /Café Grade/);
  // Die beste Sorte liefert der Händler erst ab einem viel höheren Café-Level.
  await expect(page.getByTestId('supply-grade-6')).toBeDisabled();

  // Bestellen: Sorte wählen, Packung kaufen – normale Lieferung am nächsten Morgen.
  const orders = page.getByTestId('supply-orders').locator('li');
  await expect(orders).toHaveCount(0);
  await page.getByTestId('supply-grade-1').click();
  await expect(page.getByTestId('supply-grade-1')).toBeDisabled();
  await expect(page.getByTestId('supply-delivery')).toContainText('Delivered tomorrow');
  const standard = await page.getByTestId('supply-order-0').innerText();
  await page.getByTestId('supply-order-0').click();
  await expect(orders).toHaveCount(1);
  await expect(orders.first()).toContainText(/Café Grade · arrives day 2/);
  // Express kommt noch heute und kostet Aufpreis.
  await page.getByTestId('supply-express').check();
  await expect(page.getByTestId('supply-delivery')).toContainText(/Delivered in \d+ game hours/);
  await expect(page.getByTestId('supply-order-0')).not.toHaveText(standard);
  await page.getByTestId('supply-order-0').click();
  await expect(orders).toHaveCount(2);
  await expect(orders.nth(1)).toContainText(/Café Grade · arrives day 1/);

  // Der Einkauf steht in der Tagesbilanz.
  await page.getByTestId('manage-tab-stats').click();
  await expect(page.getByTestId('ledger-today-matcha')).toBeVisible();
  await expect(page.getByTestId('ledger-today-matcha')).toContainText('Matcha purchases');

  // Nachbestellung abschalten bleibt nach dem Neuladen aus, die Lieferungen bleiben unterwegs.
  await page.getByTestId('manage-tab-supply').click();
  await page.getByTestId('supply-auto').uncheck();
  await expect(page.getByTestId('supply-auto')).not.toBeChecked();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await page.getByTestId('nav-supply').click();
  await expect(page.getByTestId('supply-auto')).not.toBeChecked();
  await expect(page.getByTestId('supply-orders').locator('li')).toHaveCount(2);
});

test('Erfolg löst einmal aus: Toast und Blätter, nach Neuladen nicht erneut', async ({ page }) => {
  await atNoon(page);
  await page.goto('?lang=en&tutorial=0');
  await reloadWithSave(page, { stats: { customersServed: 150 } });
  const toasts = page.getByTestId('toasts');
  await expect(toasts).toContainText(/Achievement: Regular crowd I \(\+\d+ 🍃\)/);
  const reward = intIn(/Regular crowd I \(\+(\d+)/.exec(await toasts.innerText())?.[1] ?? '');
  await expect.poll(() => leavesInHud(page)).toBe(reward);
  await page.getByTestId('nav-achievements').click();
  await expect(page.getByTestId('achievements-count')).toHaveText(/^1\/\d+ unlocked$/);
  // Speichern erzwingen, neu laden: kein zweiter Toast, die Blätter bleiben.
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await page.waitForTimeout(1500);
  await expect(toasts).not.toContainText('Achievement');
  expect(await leavesInHud(page)).toBe(reward);
});

test('Tagesaufgaben erledigen und abholen: Matcha bestellen und 100× anfeuern', async ({
  page,
}) => {
  // 100 Taps im Takt > 11 s plus Bestellung und Screen-Wechsel.
  test.setTimeout(90_000);
  await atNoon(page);
  await page.goto('?lang=en&tutorial=0');
  await reloadWithSave(page, { questsToday: ['order1', 'tap100', 'serve500'], clock: 10 * 60 });
  await page.getByTestId('nav-achievements').click();
  await page.getByTestId('progress-tab-quests').click();
  await expect(page.getByTestId('quest-0')).toContainText('Order matcha from your supplier');
  await expect(page.getByTestId('quest-1')).toContainText('Tap the café 100 times');
  await expect(page.getByTestId('quest-claim-0')).toBeDisabled();
  await expect(page.getByTestId('quest-claim-1')).toBeDisabled();

  // Aufgabe 1: eine Packung Matcha beim Lieferanten bestellen.
  await page.getByTestId('nav-supply').click();
  await page.getByTestId('supply-order-0').click();
  await expect(page.getByTestId('supply-orders').locator('li')).toHaveCount(1);
  const badge = page.getByTestId('nav-badge-achievements');
  await expect(badge).toBeVisible();
  await page.getByTestId('nav-achievements').click();
  await page.getByTestId('progress-tab-quests').click();
  const claim0 = page.getByTestId('quest-claim-0');
  await expect(claim0).toBeEnabled({ timeout: 5_000 });
  const reward = intIn(await claim0.innerText());
  await claim0.click();
  await expect(claim0).toHaveText('Claimed');
  await expect.poll(() => leavesInHud(page)).toBeGreaterThanOrEqual(reward);
  await expect(badge).toBeHidden();

  // Aufgabe 2: 100 Taps auf den Boden des Cafés, verteilt über > 10 s (Deckel 10 Taps/s).
  // Der Fortschritts-Screen deckt das Café ab; zum Tippen schließen.
  await page.getByTestId('panel-close').click();
  const spot = await findFloorSpot(page);
  for (let i = 0; i < 100; i++) {
    await page.mouse.click(spot.x, spot.y);
    await page.waitForTimeout(110);
  }
  // Unter Last stauen sich Klicks hinter einem langen Frame und fallen in dieselbe Spielsekunde –
  // der Deckel verwirft dann einzelne. Nachtippen, bis die Quest erfüllt ist (höchstens 20 Mal).
  for (let i = 0; i < 20 && !(await badge.isVisible()); i++) {
    await page.mouse.click(spot.x, spot.y);
    await page.waitForTimeout(250);
  }
  await expect(badge).toBeVisible();
  await page.getByTestId('nav-achievements').click();
  await page.getByTestId('progress-tab-quests').click();
  const claim1 = page.getByTestId('quest-claim-1');
  await expect(claim1).toBeEnabled({ timeout: 5_000 });
  await claim1.click();
  await expect(claim1).toHaveText('Claimed');
  // Zwei Quest-Belohnungen (plus der Erfolg „Anfeuerer I“ für 100 Taps).
  await expect.poll(() => leavesInHud(page)).toBeGreaterThan(2 * reward);
  await page.getByTestId('progress-tab-stats').click();
  await expect(page.getByTestId('stats-list')).toContainText('Taps');
});

test('Standort eröffnen, wechseln und nach Neuladen dort bleiben', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('?lang=en&tutorial=0');
  // Berlin voll ausgebaut, Zen auf dem Konto und genug Geld in der Kasse für die Investition.
  await reloadWithSave(page, { level: 20, bestLevel: 20, zen: '500', coins: '10000000' });
  await page.getByTestId('nav-locations').click();
  await expect(page.getByTestId('zen-balance')).toHaveText('☯ Zen: 500');
  // Tokio hängt an Kyoto und bleibt gesperrt.
  await expect(page.getByTestId('location-action-tokyo')).toBeDisabled();
  const open = page.getByTestId('location-action-kyoto');
  await expect(open).toBeEnabled();
  await expect(open).toHaveText(/^Open \(.+\)$/);
  // Kostet die Eröffnung Zen, steht es auf dem Knopf.
  const zenCost = Number(/\((\d+) ☯\)/.exec(await open.innerText())?.[1] ?? 0);
  await open.click();
  await expect(page.getByText('New location opened: Kyoto Teahouse')).toBeVisible();
  await expect(page.getByTestId('zen-balance')).toHaveText(`☯ Zen: ${String(500 - zenCost)}`);
  await expect(open).toHaveText('Switch here');
  await open.click();
  await expect(page.getByTestId('hud-location')).toContainText('Kyoto Teahouse');
  await expect(page.getByTestId('location-status-kyoto')).toHaveText('You are here');
  await expect(page.getByTestId('location-action-berlin')).toHaveText('Switch here');
  // Shop zeigt die Kyoto-Stationen.
  await page.getByTestId('nav-shop').click();
  await expect(page.getByTestId('panel-shop')).toContainText('Usucha station');
  await page.reload();
  await expect(page.getByTestId('hud-location')).toContainText('Kyoto Teahouse');
  expect(errors).toEqual([]);
});

test('Franchise-Reset: Vorschau, Abbrechen, Bestätigen, Zen ausgeben', async ({ page }) => {
  await page.goto('?lang=de&tutorial=0');
  // Café-Lv 20 erlaubt den Reset sicher; der Umsatz des Laufs bestimmt das Zen (PRESTIGE.zen).
  await reloadWithSave(page, { level: 20, coins: '5000000', earnedThisRun: '20000000' });
  await page.getByTestId('nav-locations').click();
  const reset = page.getByTestId('location-reset-berlin');
  await expect(reset).toBeEnabled();
  await expect(reset).toHaveText(/^Franchise-Reset \(\+\d+ ☯\)$/);
  const zen = intIn(await reset.innerText());
  expect(zen).toBeGreaterThan(0);
  await reset.click();
  const dlg = page.getByTestId('dialog-reset');
  await expect(dlg).toContainText(`Du bekommst ${String(zen)} Zen`);
  await expect(dlg).toContainText(/\+\d+ % Einkommen/);
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
  await page.getByTestId('dialog-cancel').click();
  await expect(page.getByTestId('hud-location')).toContainText('Café-Lv 20');
  await reset.click();
  await page.getByTestId('dialog-confirm').click();
  await expect(page.getByText(`Kiez-Café Berlin zurückgesetzt: +${String(zen)} Zen`)).toBeVisible();
  await expect(page.getByTestId('hud-location')).toContainText('Café-Lv 1');
  await expect(page.getByTestId('zen-balance')).toHaveText(`☯ Zen: ${String(zen)}`);
  await expect(page.getByTestId('location-status-berlin')).toHaveText('Hier bist du');
  await expect(reset).toBeDisabled();
  await page.getByTestId('locations-tab-zen').click();
  const buy = page.getByTestId('zen-globalIncome');
  const cost = intIn(await buy.innerText());
  await buy.click();
  await expect(page.getByTestId('zen-balance')).toHaveText(`☯ Zen: ${String(zen - cost)}`);
  await expect(page.getByTestId('zen-effect-globalIncome')).toHaveText(
    /^Jetzt: \+[1-9]\d* % Einkommen$/,
  );
});
