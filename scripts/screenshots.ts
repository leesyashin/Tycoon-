/**
 * Screenshots für docs/screenshots (PLAN S9/S12): lädt die App vom laufenden Dev-/Preview-Server, pflanzt
 * einen gewachsenen Spielstand ein und fotografiert Café, Personal-Panel und Ausstattungs-Panel in DE/EN,
 * Hochformat 390×844 und Desktop 1280×720.
 *   pnpm dev --port 5175 &  PW_CHROMIUM=… pnpm tsx scripts/screenshots.ts http://localhost:5175/Tycoon-/ docs/screenshots/s10
 * Umgebungsvariablen: SHOT_WAIT_MS (Wartezeit), SHOT_SPAWN (Gäste je Sekunde), SHOT_SCALE (Pixelverhältnis),
 * SHOT_STAGE (`grown` = Standard mit Panels; `start`, `mid`, `lux` = nur das Café in dieser Ausbaustufe, um die
 * Optik-Stufen der Ausstattung zu zeigen: Start / Café-Level 7 / alles über Level 100, Café-Level 16).
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:5173/Tycoon-/';
const out = process.argv[3] ?? 'docs/screenshots/s10';
/** Zum Prüfen der Figuren: länger warten, mehr Gäste zeigen (`?debugSpawn`, nur Optik), feiner rendern. */
const waitMs = Number(process.env['SHOT_WAIT_MS'] ?? 9000);
const spawn = Number(process.env['SHOT_SPAWN'] ?? 0);
/** Geräte-Pixelverhältnis (2 = doppelt so große PNGs, Figuren in Atlas-Auflösung). */
const scale = Number(process.env['SHOT_SCALE'] ?? 1);
mkdirSync(out, { recursive: true });

interface Seed {
  stations: Record<string, number>;
  staff: Record<string, number>;
  ambience: Record<string, number>;
  level: number;
  coins: string;
  cleanliness: number;
  satisfaction: number;
}

/** Gewachsenes Café (Café-Level 5, Σ Level 113): Ausstattung, Team, Tische, etwas Schmutz. */
const GROWN: Seed = {
  stations: {
    register: 12,
    matchaStation: 85,
    coffeeMachine: 9,
    iceBox: 3,
    oven: 2,
    servingStation: 2,
  } as Record<string, number>,
  staff: { cashier: 2, barista: 4, waiter: 3, cleaner: 1 },
  ambience: { seats: 8, decor: 2 },
  level: 5,
  coins: '450000',
  cleanliness: 55,
  satisfaction: 72,
};

const EQUIPMENT = [
  'register',
  'matchaStation',
  'coffeeMachine',
  'iceBox',
  'oven',
  'displayCase',
  'grinder',
  'ceremonySet',
  'servingStation',
];
const team = { cashier: 3, barista: 9, waiter: 3, cleaner: 2 };
/** Ausbaustufen für die Optik der Ausstattung (UI_STYLE § 4): Theke nach Café-Level, Geräte nach Level. */
const STAGES: Record<string, Seed> = {
  grown: GROWN,
  start: {
    ...GROWN,
    stations: { matchaStation: 1 },
    staff: team,
    ambience: { seats: 3 },
    level: 1,
  },
  mid: {
    ...GROWN,
    stations: {
      register: 30,
      matchaStation: 60,
      coffeeMachine: 26,
      iceBox: 25,
      oven: 12,
      displayCase: 10,
      servingStation: 25,
    },
    staff: team,
    ambience: { seats: 14, decor: 3, music: 1, wifi: 1, terrace: 1 },
    level: 7,
    cleanliness: 90,
  },
  lux: {
    ...GROWN,
    stations: Object.fromEntries(EQUIPMENT.map((id) => [id, 120])),
    staff: team,
    ambience: { seats: 45, decor: 3, music: 1, wifi: 1, terrace: 1 },
    level: 16,
    cleanliness: 90,
    satisfaction: 85,
  },
};
const stage = process.env['SHOT_STAGE'] ?? 'grown';
const picked = STAGES[stage];
if (!picked) throw new Error(`Unknown SHOT_STAGE: ${stage}`);
const seed: Seed = picked;

const browser = await chromium.launch(
  process.env['PW_CHROMIUM'] ? { executablePath: process.env['PW_CHROMIUM'] } : {},
);

async function shoot(lang: 'de' | 'en', width: number, height: number): Promise<void> {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: scale,
    reducedMotion: 'reduce',
  });
  const query = `?lang=${lang}&tutorial=0${spawn > 0 ? `&debugSpawn=${String(spawn)}` : ''}`;
  await page.goto(base + query);
  await page.getByTestId('hud').waitFor();
  await page.evaluate((g) => {
    window.dispatchEvent(new Event('pagehide'));
    const key = Object.keys(localStorage).find((k) => /^mce\.save\.v\d+$/.test(k));
    if (!key) throw new Error('no save');
    const save = JSON.parse(localStorage.getItem(key) ?? '{}') as {
      locations: Record<string, Record<string, unknown>>;
    };
    const berlin = save.locations['berlin'];
    if (!berlin) throw new Error('no berlin');
    const stations = berlin['stations'] as Record<string, { level: number; unlocked: boolean }>;
    for (const [id, level] of Object.entries(g.stations)) stations[id] = { level, unlocked: true };
    berlin['staff'] = g.staff;
    berlin['ambience'] = g.ambience;
    berlin['level'] = g.level;
    berlin['bestLevel'] = g.level;
    berlin['coins'] = g.coins;
    berlin['cleanliness'] = g.cleanliness;
    berlin['satisfaction'] = g.satisfaction;
    localStorage.setItem(key, JSON.stringify(save));
    Storage.prototype.setItem = () => undefined;
  }, seed);
  await page.reload();
  await page.getByTestId('hud').waitFor();
  await page.locator('#game canvas').waitFor();
  // Figuren brauchen ein paar Sekunden, bis Schlange, Tische und Bedienungen gefüllt sind.
  await page.waitForTimeout(waitMs);
  const tag = `${lang}-${String(width)}`;
  if (stage !== 'grown') {
    await page.screenshot({ path: `${out}/${tag}-cafe-${stage}.png` });
    await page.close();
    console.log(`${tag}: cafe (${stage})`);
    return;
  }
  await page.screenshot({ path: `${out}/${tag}-cafe.png` });
  await page.getByTestId('nav-staff').click();
  await page.getByTestId('pipeline').waitFor();
  await page.screenshot({ path: `${out}/${tag}-staff.png` });
  await page.getByTestId('panel-close').click();
  await page.getByTestId('nav-shop').click();
  await page.getByTestId('shop-station-oven').click();
  await page.getByTestId('station-level').waitFor();
  await page.screenshot({ path: `${out}/${tag}-station.png` });
  await page.close();
  console.log(`${tag}: cafe, staff, station`);
}

await shoot('de', 390, 844);
await shoot('en', 1280, 720);
await browser.close();
