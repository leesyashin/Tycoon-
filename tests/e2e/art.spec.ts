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
  expect(urls.some((u) => u.endsWith('/assets/sprites/theme-berlin.json'))).toBe(true);
  // Lazy-Loading: andere Standorte werden erst bei Bedarf geladen.
  expect(urls.some((u) => u.includes('theme-kyoto'))).toBe(false);
  expect(urls.some((u) => u.endsWith('.woff2'))).toBe(true);
  expect(urls.some((u) => /fonts\.(googleapis|gstatic)/.test(u))).toBe(false);
  expect(problems).toEqual([]);
  const fontOk = await page.evaluate(() => document.fonts.check('700 18px Poppins'));
  expect(fontOk).toBe(true);
});

test('Touch-Ziele ≥ 44 px im Hochformat (HUD, Leiste, Stations-Panel)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('?lang=de&tutorial=0');
  await expect(page.getByTestId('hud')).toBeVisible();
  const check = async (): Promise<void> => {
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLInputElement>('#ui button, #ui select, #ui input')]
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
        .map(({ id, r }) => `${id} ${String(Math.round(r.width))}×${String(Math.round(r.height))}`),
    );
    expect(small).toEqual([]);
  };
  await check();
  await page.getByTestId('nav-shop').click();
  await page.getByTestId('shop-station-matchaBar').click();
  await check();
  // Das Bottom-Sheet deckt Zahnrad und Leiste ab (wie im Vorbild); erst schließen.
  await page.getByTestId('panel-close').click();
  await page.getByTestId('nav-settings').click();
  await check();
});

test('Stations-Panel: Icon-Grid und Pfeile wechseln das Objekt, Ambiente kaufbar', async ({
  page,
}) => {
  await page.goto('?lang=en&tutorial=0');
  await expect(page.getByTestId('hud')).toBeVisible();
  await seedCoins(page, '5000');
  await page.getByTestId('nav-shop').click();
  await page.getByTestId('shop-station-matchaBar').click();
  await expect(page.getByTestId('tile-matchaBar')).toHaveAttribute('aria-current', 'true');
  await page.getByTestId('station-next').click();
  await expect(page.getByTestId('tile-checkout')).toHaveAttribute('aria-current', 'true');
  await page.getByTestId('tile-ambience-seats').click();
  await expect(page.getByTestId('ambience-level')).toHaveText('Lv 0/50');
  await page.getByTestId('ambience-buy-seats').click();
  await expect(page.getByTestId('ambience-level')).toHaveText('Lv 1/50');
  await expect(page.getByTestId('tile-ambience-seats')).toContainText('1');
});

test('Verwaltung: Karten-Tabs wechseln Shop, Marketing, Personal, Statistik', async ({ page }) => {
  await page.goto('?lang=de&tutorial=0');
  await page.getByTestId('nav-shop').click();
  await expect(page.getByTestId('panel-shop')).toBeVisible();
  await page.getByTestId('manage-tab-marketing').click();
  await expect(page.getByTestId('panel-marketing')).toBeVisible();
  await page.getByTestId('manage-tab-staff').click();
  await expect(page.getByTestId('panel-staff')).toBeVisible();
  await page.getByTestId('manage-tab-stats').click();
  await expect(page.getByTestId('stats-balance')).toContainText('Tagesbilanz');
  await expect(page.getByTestId('manage-tab-stats')).toHaveAttribute('aria-current', 'page');
  await page.getByTestId('panel-close').click();
  await page.getByTestId('hud-quality').click();
  await expect(page.getByTestId('quality-current')).toBeVisible();
  await page.getByTestId('nav-build').click();
  await expect(page.getByTestId('shop-ambience-seats')).toBeVisible();
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
