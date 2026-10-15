/**
 * Figuren-Katalog für die Doku (`docs/screenshots/figuren/katalog.png`): alle Kunden-Varianten je Typ mit
 * Persona-Namen und das Personal je Rolle, Vorder-, Rück- und Sitzansicht. Nicht Teil von `pnpm art`.
 *   PW_CHROMIUM=… pnpm tsx scripts/art/catalog.ts docs/screenshots/figuren/katalog.png
 */
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { CUSTOMER_LOOKS, STAFF_LOOKS } from '@data/art';
import { CUSTOMER_TYPES } from '@data/customerTypes';
import { STAFF_ROLES } from '@data/staff';
import { customerTypeShares } from '@core/customers/types';
import { characterSprites } from './figures';

const out = process.argv[2] ?? 'docs/screenshots/figuren/katalog.png';

/** Persona-Namen und Klischee-Beschreibungen (nur Doku, nicht im Spiel). */
const PERSONAS: Record<string, [string, string]> = {
  softboy: [
    'Performative Male',
    'Jutebeutel mit Plüschmonster, Kabel-Kopfhörer, Pullunder, Schnurrbart, Iced Matcha',
  ],
  clawclip: [
    'Hausarbeits-Hanna',
    'Claw-Clip-Dutt, Oversize-Hoodie, eckiger Rucksack, Laptop, In-Ears',
  ],
  mullet: [
    'Mullet-Max',
    'Blondierter Vokuhila, Over-Ears teurer als die Miete, Cargo, Matcha-Print',
  ],
  gorpcore: [
    'Gorpcore-Gabriel',
    'Funktionsjacke, Fischermütze, Trailschuhe, Sling-Bag quer über der Brust',
  ],
  sandals: ['Socken-in-Sandalen-Siggi', 'Bucket Hat, Hawaiihemd, Sonnenbrand, Kamera um den Hals'],
  backpacker: ['Interrail-Ida', 'Rucksack größer als der Kopf, Cap rückwärts, Digicam'],
  sunhat: [
    'Sonnenhut-Sophie',
    'XXL-Sonnenhut, Sommerkleid, Sonnenbrille, Analogkamera, Erdbeer-Matcha',
  ],
  pilates: ['Pilates-Paula', 'Slick Bun, Salbei-Set, Yogamatte, Riesenbecher, Goldcreolen'],
  startup: ['Startup-Simon', 'Fleeceweste über Hemd, Chinos, Laptop, In-Ears, Hafer-Matcha'],
  raver: [
    'Sonntags-Raver',
    'Direkt aus dem Club: alles schwarz, Sonnenbrille drinnen, Buzzcut, Kette',
  ],
  ringlight: ['Matcha-Mia', 'Schleife im Haar, Crop-Cardigan, Ringlicht, Erdbeer-Matcha fürs Foto'],
  selfie: ['Selfie-Sven', 'Mint gefärbte Curtains, College-Jacke, Sonnenbrille, Selfie-Stick'],
  interview: ['Straßenumfrage-Zoe', '„Was ist deine Matcha-Order?“ – Fell-Mikro, Afro, Hoodie'],
  beret: [
    'Kritiker Klaus',
    'Der eine Boomer: Baskenmütze, Trenchcoat, Rollkragen, Brille, Notizbuch',
  ],
  sommelier: [
    'Matcha-Sommelière',
    'Trinkt nur Ceremonial Grade aus der Schale, Bob, Brille, Notizbuch',
  ],
  'barista-capBack': ['Barista', 'Cap rückwärts, Tattoos, In-Ears'],
  'barista-spaceBuns': ['Barista', 'Rosa Space Buns, Creolen, Plateau-Sneaker'],
  'barista-curly': ['Barista', 'Locken, Kette, Cargo'],
  'cashier-clawclip': ['Verkäufer (Kasse)', 'Claw-Clip, Creolen, Tablet'],
  'cashier-buzz': ['Verkäufer (Kasse)', 'Buzzcut, Tattoos, Boots'],
  'cashier-curls': ['Verkäufer (Kasse)', 'Locken, Kreolen, Tablet'],
  'waiter-bow': ['Bedienung', 'Schleife, Loafer, Tablett mit Iced Matcha und Matcha-Kuchen'],
  'waiter-sidePart': ['Bedienung', 'Seitenscheitel, In-Ears, Tablett'],
  'waiter-topknot': ['Bedienung', 'Topknot, Salbei-Longsleeve, Kette, Tablett'],
  'cleaner-bucket': ['Putzkraft', 'Bucket Hat, Kopfhörer, Mopp im Takt'],
  'cleaner-bun': ['Putzkraft', 'Dutt, In-Ears, Mopp'],
  'manager-blazer': ['Filialleiterin', 'Blazer über Hoodie, Slick Bun, Tablet (HUD-Portrait)'],
  'socialMedia-ringlight': ['Social Media', 'Schleife, Ringlicht'],
};

const TYPE_NAMES: Record<string, string> = {
  student: 'Studierende',
  tourist: 'Touristen',
  regular: 'Stammgäste',
  influencer: 'Influencer',
  critic: 'Kritiker',
};

const svgs = new Map(characterSprites().map((s) => [s.name, s.svg]));
const img = (name: string, h: number): string => {
  const svg = svgs.get(name);
  if (!svg) throw new Error(`No sprite: ${name}`);
  return `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" style="height:${String(h)}px" alt="${name}">`;
};
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function card(prefix: string, key: string, sit: boolean): string {
  const [name, desc] = PERSONAS[key] ?? [key, ''];
  const views = [img(`${prefix}-front-0`, 168), img(`${prefix}-back-0`, 112)];
  if (sit) views.push(img(`${prefix}-sit-front`, 112));
  return `<div class="card"><div class="stage">${views.join('')}</div><b>${esc(name)}</b><p>${esc(desc)}</p></div>`;
}

const shares = customerTypeShares('berlin');
const sections: string[] = [];
for (const c of CUSTOMER_TYPES) {
  const pct = Math.round((shares[c.id] ?? 0) * 100);
  const cards = CUSTOMER_LOOKS[c.id].map((look) => card(`customer-${c.id}-${look}`, look, true));
  sections.push(
    `<h2><span>${esc(TYPE_NAMES[c.id] ?? c.id)} · ${String(pct)} %</span></h2><div class="grid">${cards.join('')}</div>`,
  );
}
const staffCards = STAFF_ROLES.flatMap((r) =>
  STAFF_LOOKS[r.id].map((look) => card(`staff-${r.id}-${look}`, `${r.id}-${look}`, false)),
);
sections.push(
  `<h2><span>Personal (Schürze)</span></h2><div class="grid">${staffCards.join('')}</div>`,
);

const html = `<!doctype html><html lang="de"><meta charset="utf-8"><style>
  body { margin: 0; padding: 24px 28px 36px; width: 1344px; background: #14244a; color: #fff;
    font-family: Poppins, 'Segoe UI', system-ui, sans-serif; }
  h1 { font-size: 26px; font-weight: 500; margin: 0 0 4px; }
  .sub { color: #b8c4dc; font-size: 13px; margin: 0 0 18px; }
  h2 { margin: 18px 0 10px; font-size: 15px; font-weight: 500; }
  h2 span { background: #243866; border-radius: 999px; padding: 4px 14px; }
  .grid { display: flex; flex-wrap: wrap; gap: 12px; }
  .card { width: 232px; background: #fff; color: #2c3350; border-radius: 16px; padding: 10px; box-sizing: border-box; }
  .stage { height: 196px; background: #e8c48a; border-radius: 10px; display: flex; align-items: flex-end;
    justify-content: center; gap: 6px; padding-bottom: 10px; box-sizing: border-box; }
  .stage img { image-rendering: auto; }
  b { display: block; font-size: 13px; margin: 8px 0 2px; }
  p { margin: 0; font-size: 11px; line-height: 1.35; color: #5b6480; }
</style><body>
  <h1>Matcha Café Empire – Figuren</h1>
  <p class="sub">Gen-Z-Matcha-Klischees als Blockfiguren im Hotel-Empire-Look · Vorder-, Rück- und Sitzansicht · Personal der Phase 2 (Verkäufer, Barista, Bedienung, Putzkraft) · selbst gezeichnet (CC0)</p>
  ${sections.join('')}
</body></html>`;

const browser = await chromium.launch(
  process.env['PW_CHROMIUM'] ? { executablePath: process.env['PW_CHROMIUM'] } : {},
);
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.setContent(html);
await page.waitForLoadState('networkidle');
writeFileSync(out, await page.screenshot({ fullPage: true }));
await browser.close();
console.log(
  `${out}: ${String(svgs.size)} Figuren-Frames, ${String(Object.keys(PERSONAS).length)} Karten`,
);
