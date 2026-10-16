import { expect, test, type Page } from '@playwright/test';

/** S8: UI-Skin, Sprites, Szene-Effekte, Audio-Einstellungen. */

async function seedCoins(page: Page, coins: string): Promise<void> {
  await page.evaluate((c) => {
    window.dispatchEvent(new Event('pagehide'));
    const key = Object.keys(localStorage).find((k) => /^mce\.save\.v\d+$/.test(k));
    if (!key) throw new Error('no save');
    const save = JSON.parse(localStorage.getItem(key) ?? '{}') as {
      locations: Record<string, { coins: string }>;
    };
    const berlin = save.locations['berlin'];
    if (berlin) berlin.coins = c;
    localStorage.setItem(key, JSON.stringify(save));
    Storage.prototype.setItem = () => undefined;
  }, coins);
  await page.reload();
}

/** Erste ganze Zahl im Text: „Neues Design ab Lv 5“ → 5, „Lv 1/10“ → 1. */
function intIn(text: string): number {
  const m = /\d+/.exec(text);
  if (!m) throw new Error(`keine Zahl in „${text}“`);
  return Number(m[0]);
}

test('Assets laden lokal: Atlanten, Schriften, Icon-Sprite – keine fehlenden Frames', async ({
  page,
}) => {
  const urls: string[] = [];
  const problems: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  page.on('console', (m) => {
    if (/frame|texture|404|failed/i.test(m.text()) && !/GL Driver/.test(m.text()))
      problems.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`${String(r.status())} ${r.url()}`);
  });
  await page.goto('?lang=de&tutorial=0');
  await expect(page.getByTestId('hud')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect.poll(() => urls.some((u) => u.endsWith('/assets/sprites/common.png'))).toBe(true);
  // Ausstattung, Theke und Tische liegen in einem eigenen Atlas (eigene Palette).
  await expect.poll(() => urls.some((u) => u.endsWith('/assets/sprites/furniture.png'))).toBe(true);
  // Stadtviertel: Straßen-Objekte und Fahrzeuge für alle Standorte, Fassaden im Themen-Atlas.
  await expect.poll(() => urls.some((u) => u.endsWith('/assets/sprites/city.png'))).toBe(true);
  // Phaser startet im ersten Leerlauf (S9), der Themen-Atlas kommt also etwas später.
  await expect
    .poll(() => urls.some((u) => u.endsWith('/assets/sprites/theme-berlin.json')))
    .toBe(true);
  // Lazy-Loading: andere Standorte werden erst bei Bedarf geladen.
  expect(urls.some((u) => u.includes('theme-kyoto'))).toBe(false);
  expect(urls.some((u) => u.endsWith('.woff2'))).toBe(true);
  expect(urls.some((u) => /fonts\.(googleapis|gstatic)/.test(u))).toBe(false);
  expect(problems).toEqual([]);
  const fontOk = await page.evaluate(() => document.fonts.check('700 18px Poppins'));
  expect(fontOk).toBe(true);
});

test('Touch-Ziele ≥ 44 px im Hochformat (HUD, Leiste, Stations-Panel, Verwaltung)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('?lang=de&tutorial=0');
  await expect(page.getByTestId('hud')).toBeVisible();
  /** Alle sichtbaren Bedienelemente unter `scope`; weich, damit jeder Screen seine Verstöße meldet. */
  const check = async (where: string, scope = '#ui'): Promise<void> => {
    const small = await page.evaluate(
      (sel) =>
        [
          ...document.querySelectorAll<HTMLInputElement>(
            `${sel} button, ${sel} select, ${sel} input`,
          ),
        ]
          .filter((el) => el.offsetParent !== null && el.type !== 'file')
          .map((el) => ({
            id: el.dataset['testid'] ?? el.className,
            // Checkboxen zählen mit ihrer klickbaren Zeile (Label toggelt mit).
            r: (el.type === 'checkbox'
              ? (el.closest('.field-check') ?? el)
              : el
            ).getBoundingClientRect(),
          }))
          .filter(({ r }) => r.width < 44 || r.height < 44)
          .map(
            ({ id, r }) => `${id} ${String(Math.round(r.width))}×${String(Math.round(r.height))}`,
          ),
      scope,
    );
    expect.soft(small, where).toEqual([]);
  };
  await check('HUD und Leiste');
  await page.getByTestId('nav-shop').click();
  await page.getByTestId('shop-station-matchaStation').click();
  await check('Stations-Panel', '#ui .panel');
  // Das Bottom-Sheet deckt Zahnrad und Leiste ab (wie im Vorbild); erst schließen.
  await page.getByTestId('panel-close').click();
  await page.getByTestId('nav-settings').click();
  await check('Einstellungen', '#ui .panel');
  await page.getByTestId('panel-close').click();
  // Verwaltung (Vollbild): Einkauf mit Bestellknöpfen, Personal mit Entlassen, Social Media, Öffnungszeiten.
  await page.getByTestId('nav-supply').click();
  await expect(page.getByTestId('panel-supply')).toBeVisible();
  await check('Einkauf', '#ui .panel');
  for (const tab of ['staff', 'social', 'stats'] as const) {
    await page.getByTestId(`manage-tab-${tab}`).click();
    await expect(page.getByTestId(`panel-${tab}`)).toBeVisible();
    await check(`Verwaltung: ${tab}`, '#ui .panel');
  }
});

test('Stations-Panel: Icon-Grid und Pfeile wechseln das Objekt, Ambiente kaufbar', async ({
  page,
}) => {
  await page.goto('?lang=en&tutorial=0');
  await expect(page.getByTestId('hud')).toBeVisible();
  await seedCoins(page, '5000');
  await page.getByTestId('nav-shop').click();
  await page.getByTestId('shop-station-matchaStation').click();
  await expect(page.getByTestId('tile-matchaStation')).toHaveAttribute('aria-current', 'true');
  await page.getByTestId('station-next').click();
  await expect(page.getByTestId('tile-coffeeMachine')).toHaveAttribute('aria-current', 'true');
  // Deko gibt es von Anfang an, aber noch ohne Stufe.
  await page.getByTestId('tile-ambience-decor').click();
  await expect(page.getByTestId('ambience-level')).toHaveText(/^Lv 0\/\d+$/);
  await page.getByTestId('ambience-buy-decor').click();
  await expect(page.getByTestId('ambience-level')).toHaveText(/^Lv 1\/\d+$/);
  await expect(page.getByTestId('tile-ambience-decor')).toContainText('1');
  // Der Parkplatz neben dem Café ist am Anfang noch gesperrt.
  await page.getByTestId('tile-ambience-parking').click();
  await expect(page.getByTestId('ambience-level')).toHaveText(/^Lv 0\/\d+$/);
  await expect(page.getByTestId('ambience-buy-parking')).toBeDisabled();
  await expect(page.locator('.station-card .locked-hint')).toHaveText(/^from café lv \d+$/);
});

test('Ausstattung wird mit dem Level edler: Panel zeigt die nächste Optik, Bild wechselt', async ({
  page,
}) => {
  await page.goto('?lang=de&tutorial=0');
  await expect(page.getByTestId('hud')).toBeVisible();
  await seedCoins(page, '1000000');
  await page.getByTestId('nav-shop').click();
  await page.getByTestId('shop-station-matchaStation').click();
  const level = page.getByTestId('station-level');
  const look = page.getByTestId('station-look');
  const icon = page.locator('.station-card-icon');
  await expect(level).toHaveText(/^Level 1\/\d+$/);
  await expect(look).toHaveText(/^Neues Design ab Lv \d+$/);
  await expect(icon).toHaveAttribute('src', /station-matchaStation-1\.png$/);
  // Bis zur angekündigten Stufe ausbauen: Das Gerät bekommt die nächste Optik.
  const next = intIn(await look.innerText());
  for (let lvl = 2; lvl <= next; lvl++) {
    await page.getByTestId('buy-1').click();
    await expect(level).toHaveText(new RegExp(`^Level ${String(lvl)}/\\d+$`));
  }
  await expect(icon).toHaveAttribute('src', /station-matchaStation-2\.png$/);
  await expect(look).toHaveText(/^(Neues Design ab Lv \d+|Edelste Ausführung erreicht)$/);
  await expect(look).not.toHaveText(`Neues Design ab Lv ${String(next)}`);
  await expect
    .poll(() => icon.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true);
  // Tische: eigene Optik-Stufen, Vorschau im selben Panel (ein Tisch steht schon).
  await page.getByTestId('tile-ambience-seats').click();
  const tables = page.getByTestId('ambience-look');
  await expect(tables).toHaveText(/^Neues Design ab Lv \d+$/);
  const seats = intIn(await page.getByTestId('ambience-level').innerText());
  expect(intIn(await tables.innerText())).toBeGreaterThan(seats);
  await page.getByTestId('ambience-buy-seats').click();
  await expect(page.getByTestId('ambience-level')).toHaveText(
    new RegExp(`^Lv ${String(seats + 1)}/\\d+$`),
  );
});

test('Verwaltung: Karten-Tabs wechseln Shop, Einkauf, Personal, Social Media, Betrieb', async ({
  page,
}) => {
  await page.goto('?lang=de&tutorial=0');
  await page.getByTestId('nav-shop').click();
  await expect(page.getByTestId('panel-shop')).toBeVisible();
  await expect(page.locator('.manage-tabs .tab')).toHaveCount(5);
  const tabs = [
    ['supply', 'supply-stock'],
    ['staff', 'staff-team-cost'],
    ['social', 'social-followers'],
    ['stats', 'hours-text'],
  ] as const;
  for (const [tab, content] of tabs) {
    await page.getByTestId(`manage-tab-${tab}`).click();
    await expect(page.getByTestId(`panel-${tab}`)).toBeVisible();
    await expect(page.getByTestId(content)).toBeVisible();
    await expect(page.getByTestId(`manage-tab-${tab}`)).toHaveAttribute('aria-current', 'page');
  }
  await expect(page.getByTestId('ledger-today-balance')).toContainText('Tagesbilanz');
  await page.getByTestId('manage-tab-shop').click();
  await expect(page.getByTestId('panel-shop')).toBeVisible();
  await page.getByTestId('panel-close').click();
  // Abkürzungen: Matcha-Sorte im HUD → Einkauf, Uhr → Betrieb, Hammer → Ambiente mit Parkplatz.
  await page.getByTestId('hud-quality').click();
  await expect(page.getByTestId('supply-in-use')).toBeVisible();
  await page.getByTestId('panel-close').click();
  await page.getByTestId('hud-clock').click();
  await expect(page.getByTestId('hours-text')).toBeVisible();
  await page.getByTestId('panel-close').click();
  await page.getByTestId('nav-build').click();
  await expect(page.getByTestId('shop-ambience-seats')).toBeVisible();
  await expect(page.getByTestId('shop-ambience-parking')).toBeVisible();
});

test('Lautstärke-Regler wirken und bleiben nach Neuladen', async ({ page }) => {
  await page.goto('?lang=de&tutorial=0');
  await page.getByTestId('nav-settings').click();
  const music = page.getByTestId('settings-music-volume');
  await expect(music).toHaveValue('40');
  await music.fill('15');
  await page.getByTestId('settings-sfx-volume').fill('90');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await page.getByTestId('nav-settings').click();
  await expect(page.getByTestId('settings-music-volume')).toHaveValue('15');
  await expect(page.getByTestId('settings-sfx-volume')).toHaveValue('90');
});

test('prefers-reduced-motion: keine CSS-Animationen und Übergänge', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('?lang=de&tutorial=0');
  await expect(page.getByTestId('hud')).toBeVisible();
  const animated = await page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLElement>('#ui *')]
        .map((el) => getComputedStyle(el))
        .filter((cs) => cs.animationName !== 'none' || parseFloat(cs.transitionDuration) > 0)
        .length,
  );
  expect(animated).toBe(0);
});
