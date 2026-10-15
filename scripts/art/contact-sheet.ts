/**
 * Kontaktbogen zum Prüfen der Sprites ohne Spielstart (Phase 2):
 *   PW_CHROMIUM=… pnpm tsx scripts/art/contact-sheet.ts stations out.png
 *   PW_CHROMIUM=… pnpm tsx scripts/art/contact-sheet.ts figures out.png
 *   PW_CHROMIUM=… pnpm tsx scripts/art/contact-sheet.ts figures out.png 'waiter|sit-'   (nur passende Namen)
 * Rendert die SVGs aus `sprites.ts` vergrößert in ein Raster mit Beschriftung. Nicht Teil von `pnpm art`.
 */
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { ambienceSprites, stationSprites } from './sprites';
import { characterSprites } from './figures';

const which = process.argv[2] ?? 'stations';
const out = process.argv[3] ?? 'contact-sheet.png';
const all = [...stationSprites(), ...ambienceSprites(), ...characterSprites()];
const sets: Record<string, { re: RegExp; scale: number; cols: number }> = {
  stations: {
    re: /^station-.*-a$|^counter-a$|^ambience-seats|^fx-dirt$|^ambience-(decor|terrace)$/,
    scale: 3,
    cols: 6,
  },
  figures: { re: /^(customer|staff)-/, scale: 4, cols: 10 },
};
const set = sets[which] ?? { re: /./, scale: 2, cols: 8 };
// Optionaler dritter Parameter: zusätzlicher Filter als regulärer Ausdruck (z. B. 'waiter|sit-').
const only = process.argv[4] ? new RegExp(process.argv[4]) : /./;
const list = all.filter((s) => set.re.test(s.name) && only.test(s.name));
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
      ctx.font = '10px sans-serif';
      ctx.fillText(name.replace(/^(station|ambience|customer|staff)-/, ''), x, y + ch - 6);
    });
    return canvas.toDataURL('image/png');
  },
  { list, scale: set.scale, cols: set.cols },
);
writeFileSync(out, Buffer.from(png.split(',')[1] ?? '', 'base64'));
await browser.close();
console.log(`${out}: ${String(list.length)} sprites`);
