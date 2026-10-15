import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Der Tutorial-Ring pulsiert; Playwright klickt nur „stabile“ Elemente.
test.use({ reducedMotion: 'reduce' });

/** Spielstand ändern und neu laden; die alte Seite darf danach nicht mehr speichern. */
async function editSaveAndReload(page: Page, coins: string): Promise<void> {
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

test('Tutorial: Schritte, Highlight, Aufgabe erkennt Kauf, überspringen bleibt gespeichert', async ({
  page,
}) => {
  await page.goto('?lang=de');
  const tut = page.getByTestId('tutorial');
  await expect(tut).toBeVisible();
  await expect(page.getByTestId('tutorial-count')).toHaveText('Schritt 1 von 8');
  await expect(tut).toContainText('Willkommen in deinem Café!');
  await expect(page.locator('.tutorial-ring')).toBeVisible();
  const r = await new AxeBuilder({ page })
    .include('[data-testid="tutorial"]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);

  await page.getByTestId('tutorial-next').click();
  await expect(tut).toContainText('Matcha-Bar verbessern');
  // Aufgaben-Schritt: kein „Weiter“, nur Überspringen.
  await expect(page.getByTestId('tutorial-next')).toBeHidden();

  await editSaveAndReload(page, '1000000');
  await expect(tut).toContainText('Matcha-Bar verbessern');
  await page.getByTestId('nav-shop').click();
  await page.getByTestId('shop-station-matchaBar').click();
  await page.getByTestId('buy-10').click();
  await page.getByTestId('panel-close').click();
  // Aufgabe erledigt → nächster Schritt (Prüfung läuft 1×/s).
  await expect(tut).toContainText('Eine neue Station', { timeout: 5000 });

  await page.getByTestId('tutorial-skip').click();
  await expect(tut).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(tut).toBeHidden();

  await page.getByTestId('nav-settings').click();
  await page.getByTestId('settings-tutorial').click();
  await expect(tut).toBeVisible();
  await expect(page.getByTestId('tutorial-count')).toHaveText('Schritt 1 von 8');
});

test('Tutorial läuft bis zum Ende durch (manuelle Schritte, Englisch)', async ({ page }) => {
  await page.goto('?lang=en');
  const next = page.getByTestId('tutorial-next');
  await next.click();
  // Aufgaben überspringen wir hier, indem der Spielstand sie schon erfüllt.
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
    const key = Object.keys(localStorage).find((k) => /^mce\.save\.v\d+$/.test(k));
    if (!key) throw new Error('no save');
    const save = JSON.parse(localStorage.getItem(key) ?? '{}') as {
      locations: Record<
        string,
        { stations: Record<string, { level: number }>; staff: Record<string, number> }
      >;
    };
    const berlin = save.locations['berlin'];
    if (!berlin) throw new Error('no berlin');
    berlin.stations['matchaBar'] = { ...berlin.stations['matchaBar'], level: 5 };
    berlin.stations['checkout'] = { ...berlin.stations['checkout'], level: 1 };
    berlin.staff = { barista: 1 };
    localStorage.setItem(key, JSON.stringify(save));
    Storage.prototype.setItem = () => undefined;
  });
  await page.reload();
  const tut = page.getByTestId('tutorial');
  await expect(tut).toContainText('Happy guests', { timeout: 5000 });
  await next.click();
  await expect(tut).toContainText('Your tools');
  await next.click();
  await expect(tut).toContainText('Even while you’re away');
  await expect(tut).toContainText('up to 4 hours');
  await next.click();
  await expect(tut).toContainText('The world is waiting');
  await expect(next).toHaveText('Let’s go');
  await next.click();
  await expect(tut).toBeHidden();
});

test('Kaputter Spielstand: Sicherung aus IndexedDB wird angeboten und geladen', async ({
  page,
}) => {
  await page.goto('?lang=de&tutorial=0');
  await expect(page.getByTestId('hud')).toBeVisible();
  // `pagehide` speichert und legt eine IndexedDB-Sicherung an.
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const req = indexedDB.open('mce-backups', 1);
        req.onsuccess = () => {
          const count = req.result.transaction('saves').objectStore('saves').count();
          count.onsuccess = () => resolve(count.result > 0);
        };
        req.onerror = () => resolve(false);
      }),
  );
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /^mce\.save\.v\d+$/.test(k));
    if (!key) throw new Error('no save');
    localStorage.setItem(key, '{kaputt');
    Storage.prototype.setItem = () => undefined;
  });
  await page.reload();
  const dlg = page.getByTestId('dialog-corrupt');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('Café-Level 1');
  await page.getByTestId('dialog-confirm').click();
  await expect(page.getByText('Spielstand importiert')).toBeVisible();
  await page.getByTestId('nav-settings').click();
  await expect(page.getByTestId('settings-backup-0')).toBeVisible();
});

test('Fehler-Boundary: Hinweis mit Export und Neu laden', async ({ page }) => {
  await page.goto('?lang=de&tutorial=0');
  await expect(page.getByTestId('hud')).toBeVisible();
  await page.evaluate(() => {
    window.setTimeout(() => {
      throw new Error('Testfehler');
    });
  });
  const box = page.getByTestId('error-boundary');
  await expect(box).toBeVisible();
  await expect(box).toContainText('Da ist etwas schiefgelaufen');
  await expect(box).toContainText('Testfehler');
  const download = page.waitForEvent('download');
  await page.getByTestId('error-export').click();
  expect((await download).suggestedFilename()).toMatch(/^matcha-cafe-empire-.*\.json$/);
  await page.getByTestId('error-reload').click();
  await expect(box).toBeHidden();
  await expect(page.getByTestId('hud')).toBeVisible();
});

test('PWA: Manifest mit Icons und Splash verschwindet', async ({ page }) => {
  await page.goto('?lang=de&tutorial=0');
  await expect(page.locator('#splash')).toHaveCount(0, { timeout: 10_000 });
  // Im Seitenkontext laden: so gilt dieselbe Basis-URL wie für den Browser.
  const result = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return null;
    const res = await fetch(link.href);
    const manifest = (await res.json()) as {
      display: string;
      icons: { src: string; sizes: string }[];
    };
    const icons = await Promise.all(
      manifest.icons.map(async (i) => (await fetch(new URL(i.src, res.url))).ok),
    );
    return { display: manifest.display, sizes: manifest.icons.map((i) => i.sizes), icons };
  });
  expect(result?.display).toBe('standalone');
  expect(result?.sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(result?.icons.every(Boolean)).toBe(true);
  // Ohne Install-Prompt des Browsers bleibt der Knopf versteckt.
  await page.getByTestId('nav-settings').click();
  await expect(page.getByTestId('settings-install')).toBeHidden();
});
