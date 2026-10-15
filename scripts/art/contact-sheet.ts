/**
 * Kontaktbogen zum Prüfen der Sprites ohne Spielstart:
 *   PW_CHROMIUM=… pnpm tsx scripts/art/contact-sheet.ts stations out.png     (Geräte × 5 Stufen, je Zeile ein Gerät)
 *   PW_CHROMIUM=… pnpm tsx scripts/art/contact-sheet.ts counter out.png      (Thekenmodule je Stufe und Deko)
 *   PW_CHROMIUM=… pnpm tsx scripts/art/contact-sheet.ts furniture out.png    (Tische, Ambiente, Schmutz-Marker)
 *   PW_CHROMIUM=… pnpm tsx scripts/art/contact-sheet.ts figures out.png
 *   PW_CHROMIUM=… pnpm tsx scripts/art/contact-sheet.ts figures out.png 'waiter|sit-'   (nur passende Namen)
 *   PW_CHROMIUM=… pnpm tsx scripts/art/contact-sheet.ts city|facade|theme out.png      (Stadtviertel, Berlin)
 * Rendert die SVGs vergrößert in ein Raster mit Beschriftung. Nicht Teil von `pnpm art`.
 */
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { ambienceSprites, themeSprites, type SpriteDef } from './sprites';
import { citySprites, facadeSprites } from './city';
import { EQUIPMENT_IDS, TIERS, stationIconSvg, stationSprites, tableSprites } from './equipment';
import { characterSprites } from './figures';

const which = process.argv[2] ?? 'stations';
const out = process.argv[3] ?? 'contact-sheet.png';
// Kasse und Ausgabe mit ihrem Thekenmodul, wie sie in der Szene stehen.
const devices: SpriteDef[] = EQUIPMENT_IDS.flatMap((id) =>
  TIERS.map((tier) => ({ name: `${id}-${String(tier)}`, svg: stationIconSvg(id, tier) })),
);
const sets: Record<string, { list: () => SpriteDef[]; scale: number; cols: number }> = {
  stations: { list: () => devices, scale: 3, cols: 5 },
  counter: {
    list: () => stationSprites().filter((s) => /^counter-.*-a$/.test(s.name)),
    scale: 2.5,
    cols: 4,
  },
  furniture: { list: () => [...tableSprites(), ...ambienceSprites()], scale: 3, cols: 4 },
  figures: { list: characterSprites, scale: 4, cols: 10 },
  city: { list: citySprites, scale: 2, cols: 6 },
  facade: { list: () => facadeSprites('berlin'), scale: 2.5, cols: 12 },
  theme: { list: () => themeSprites('berlin'), scale: 3, cols: 5 },
};
const set = sets[which] ?? sets['stations'];
if (!set) throw new Error(`Unknown set: ${which}`);
// Optionaler dritter Parameter: zusätzlicher Filter als regulärer Ausdruck (z. B. 'waiter|sit-').
const only = process.argv[4] ? new RegExp(process.argv[4]) : /./;
const list = set.list().filter((s) => only.test(s.name));
const browser = await chromium.launch(
  process.env['PW_CHROMIUM'] ? { executablePath: process.env['PW_CHROMIUM'] } : {},
);
const page = await browser.newPage();
await page.setContent('<!doctype html><body></body>');
await page.evaluate('window.__name = (f) => f');
const png = await page.evaluate(
  async ({ list, scale, cols }) => {
    const load = (svg: string) =>
      new Promise<HTMLImageElement>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      });
    const imgs = await Promise.all(
      list.map(async (s) => ({ name: s.name, img: await load(s.svg) })),
    );
    const cw = (Math.max(...imgs.map((i) => i.img.width)) * scale) / 2 + 8;
    const ch = (Math.max(...imgs.map((i) => i.img.height)) * scale) / 2 + 18;
    const canvas = document.createElement('canvas');
    canvas.width = cw * cols;
    canvas.height = ch * Math.ceil(imgs.length / cols);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d');
    ctx.fillStyle = '#1d457b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    imgs.forEach(({ name, img }, i) => {
      const x = (i % cols) * cw + 4;
      const y = Math.floor(i / cols) * ch + 2;
      ctx.drawImage(img, x, y, (img.width * scale) / 2, (img.height * scale) / 2);
      ctx.fillStyle = '#fff';
      ctx.font = '11px sans-serif';
      ctx.fillText(name.replace(/^(ambience|customer|staff)-/, ''), x, y + ch - 6);
    });
    return canvas.toDataURL('image/png');
  },
  { list, scale: set.scale, cols: set.cols },
);
writeFileSync(out, Buffer.from(png.split(',')[1] ?? '', 'base64'));
await browser.close();
console.log(`${out}: ${String(list.length)} sprites`);
