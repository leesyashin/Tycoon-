import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Schreibt einen geänderten Spielstand und lädt neu. Die alte Seite darf beim Verlassen
 * nicht mehr speichern, sonst überschreibt ihr Autosave die Änderung.
 */
async function reloadWithSave(
  page: Page,
  edit: { coins?: string; ageMs?: number; level?: number },
): Promise<void> {
  await page.evaluate((e) => {
    window.dispatchEvent(new Event('pagehide'));
    const key = Object.keys(localStorage).find((k) => /^mce\.save\.v\d+$/.test(k));
    if (!key) throw new Error('no save');
    const save = JSON.parse(localStorage.getItem(key) ?? '{}') as {
      lastSavedAt: number;
      locations: Record<string, { coins: string; level: number }>;
    };
    const berlin = save.locations['berlin'];
    if (e.coins !== undefined && berlin) berlin.coins = e.coins;
    if (e.level !== undefined && berlin) berlin.level = e.level;
    if (e.ageMs !== undefined) save.lastSavedAt -= e.ageMs;
    localStorage.setItem(key, JSON.stringify(save));
    Storage.prototype.setItem = () => undefined;
  }, edit);
  await page.reload();
}

/** Wartet, bis der erste Kauf bezahlbar ist (Startmünzen + Einkommen, ~10 s), und kauft ×1. */
async function buyFirstUpgrade(page: Page): Promise<void> {
  await page.getByTestId('nav-shop').click();
  await page.getByTestId('shop-station-matchaBar').click();
  await expect(page.getByTestId('station-level')).toHaveText(/1$/);
  const buy = page.getByTestId('buy-1');
  await expect(buy).toBeEnabled({ timeout: 20_000 });
  await buy.click();
  await expect(page.getByTestId('station-level')).toHaveText(/2$/);
}

test('Spielschleife ohne Debug-Tasten: kaufen, speichern, neu laden', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('?lang=de');
  await buyFirstUpgrade(page);
  await page.reload();
  await page.getByTestId('nav-shop').click();
  await expect(page.getByTestId('shop-station-matchaBar')).toBeVisible();
  await page.getByTestId('shop-station-matchaBar').click();
  await expect(page.getByTestId('station-level')).toHaveText('Level 2');
  expect(errors).toEqual([]);
});

test('Ambiente lässt sich im Shop kaufen', async ({ page }) => {
  await page.goto('?lang=en');
  await reloadWithSave(page, { coins: '1000' });
  await page.getByTestId('nav-shop').click();
  await page.getByTestId('shop-tab-ambience').click();
  const row = page.locator('li', { has: page.getByTestId('shop-ambience-seats') });
  await expect(row).toContainText('Lv 0/50');
  await page.getByTestId('shop-ambience-seats').click();
  await expect(row).toContainText('Lv 1/50');
});

test('Sprachwechsel ändert Texte und Zahlenformat sofort', async ({ page }) => {
  await page.goto('?lang=de');
  await expect(page.getByTestId('nav-settings')).toContainText('Einstellungen');
  await expect(page.getByTestId('hud-coins')).toContainText(/\d,\d/);
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('settings-lang').selectOption('en');
  await expect(page.getByTestId('nav-settings')).toContainText('Settings');
  await expect(page.getByTestId('hud')).toContainText('Coins');
  await expect(page.getByTestId('hud-income')).toContainText('per sec');
  await expect(page.getByTestId('hud-coins')).toContainText(/\d\.\d/);
  await expect(page.getByTestId('panel-settings')).toContainText('Language');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByTestId('settings-number-format').selectOption('scientific');
  await page.getByTestId('settings-lang').selectOption('de');
  await expect(page.getByTestId('hud')).toContainText('Münzen');
});

test('Offline-Dialog nach längerer Abwesenheit', async ({ page }) => {
  await page.goto('?lang=de');
  await reloadWithSave(page, { ageMs: 2 * 3600 * 1000 });
  const dlg = page.getByTestId('dialog-offline');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('2 h');
  await page.getByTestId('dialog-confirm').click();
  await expect(dlg).toBeHidden();
});

test('Export, Import und Löschen mit doppelter Bestätigung', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('?lang=de');
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
  await page.getByTestId('shop-station-matchaBar').click();
  await expect(page.getByTestId('station-level')).toHaveText('Level 1');

  // Export wieder einspielen: Level 2 ist zurück.
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('settings-import-file').setInputFiles(path);
  await expect(page.getByTestId('toasts')).toContainText('importiert');
  await page.getByTestId('nav-shop').click();
  await page.getByTestId('shop-station-matchaBar').click();
  await expect(page.getByTestId('station-level')).toHaveText('Level 2');
});

test('Barrierefreiheit: keine axe-Verstöße (WCAG 2 A/AA) in HUD und Panels', async ({ page }) => {
  await page.goto('?lang=de');
  const scan = async (): Promise<void> => {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(
      r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([]);
  };
  await scan();
  for (const id of ['shop', 'settings', 'staff', 'marketing', 'locations']) {
    await page.getByTestId(`nav-${id}`).click();
    await scan();
  }
  await page.getByTestId('hud-satisfaction').click();
  await expect(page.getByTestId('panel-satisfaction')).toBeVisible();
  await scan();
  await page.getByTestId('nav-shop').click();
  await page.getByTestId('shop-station-matchaBar').click();
  await scan();
});

test('Personal einstellen: Stufe steigt, Effekt wird erklärt', async ({ page }) => {
  await page.goto('?lang=en');
  await reloadWithSave(page, { coins: '100000', level: 4 });
  await page.getByTestId('nav-staff').click();
  const row = page.getByTestId('staff-row-barista');
  await expect(row).toContainText('Tier 0/20');
  await expect(row).toContainText('Next tier:');
  await page.getByTestId('staff-hire-barista').click();
  await expect(row).toContainText('Tier 1/20');
  await expect(row).toContainText('bar speed +15%');
  // Filialleiter schaltet den Auto-Kauf frei.
  await expect(page.getByTestId('staff-autobuy')).toBeDisabled();
  await page.getByTestId('staff-hire-manager').click();
  await expect(page.getByTestId('staff-autobuy')).toBeEnabled();
  await page.getByTestId('staff-autobuy').check();
  await expect(page.getByTestId('staff-autobuy')).toBeChecked();
});

test('Marketing: Kampagne starten, Abklingzeit läuft', async ({ page }) => {
  await page.goto('?lang=en');
  await reloadWithSave(page, { coins: '100000', level: 2 });
  await page.getByTestId('nav-marketing').click();
  await expect(page.getByTestId('marketing-campaign-status')).toHaveText('Ready');
  await page.getByTestId('marketing-campaign-start').click();
  await expect(page.getByTestId('marketing-campaign-status')).toContainText('Running for');
  await expect(page.getByTestId('marketing-campaign-start')).toBeDisabled();
  await page.getByTestId('marketing-level-buy').click();
  await expect(page.getByTestId('marketing-level-status')).toContainText('Lv 1/30');
});

test('Zufriedenheits-Detail zeigt Beiträge', async ({ page }) => {
  await page.goto('?lang=de');
  await page.getByTestId('hud-satisfaction').click();
  await expect(page.getByTestId('panel-satisfaction')).toBeVisible();
  await expect(page.getByTestId('sat-part-cleanliness')).toHaveText(/^\+[89]/);
  await expect(page.getByTestId('sat-part-base')).toHaveText('+50');
  await page.getByTestId('hud-satisfaction').click();
  await expect(page.getByTestId('panel-satisfaction')).toBeHidden();
});
