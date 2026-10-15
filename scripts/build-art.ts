/**
 * Rendert die Sprites aus `scripts/art/sprites.ts` und `scripts/art/figures.ts` (SVG) mit Chromium in 2× und
 * packt sie in Texture-Atlanten (Phaser JSON-Hash). Eigener Shelf-Packer statt TexturePacker/free-tex-packer,
 * damit keine neue Abhängigkeit nötig ist; die Atlanten werden als 8-Bit-Palette-PNG geschrieben
 * (`art/png.ts`). Ausgabe wird eingecheckt; nur nach Änderungen an den Sprites neu ausführen: `pnpm art`.
 *
 *   public/assets/sprites/common.png|json      Stationen, Ambiente, Figuren (`art/figures.ts`), Effekte
 *   public/assets/sprites/theme-<ort>.png|json Boden/Wände je Standort (Lazy-Loading)
 *   public/assets/sprites/icons/*.png          beschnittene Einzelbilder für das DOM
 *   public/assets/ui/icon-192.png, icon-512.png PWA-Icons
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import {
  ambienceSprites,
  appIcon,
  fxSprites,
  stationSprites,
  themeSprites,
  type SpriteDef,
} from './art/sprites';
import { characterSprites, staffPortrait } from './art/figures';
import { encodePalettePng } from './art/png';

const OUT = 'public/assets/sprites';
const LOCATIONS = ['berlin', 'kyoto', 'tokyo', 'seoul', 'newyork', 'bali'];

interface Packed {
  /** RGBA-Pixel des Atlas, Base64. */
  rgba: string;
  w: number;
  h: number;
  frames: Record<string, { x: number; y: number; w: number; h: number }>;
}

const browser = await chromium.launch(
  process.env['PW_CHROMIUM'] ? { executablePath: process.env['PW_CHROMIUM'] } : {},
);
const page = await browser.newPage();
await page.setContent('<!doctype html><body></body>');
// tsx (esbuild, keepNames) ruft in übergebenen Funktionen `__name` auf – im Browser gibt es das nicht.
await page.evaluate('window.__name = (f) => f');

async function pack(sprites: SpriteDef[], maxW = 2048): Promise<Packed> {
  return page.evaluate(
    async ({ sprites, maxW }) => {
      const load = (svg: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('svg failed'));
          img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        });
      const imgs = await Promise.all(
        sprites.map(async (s) => ({ name: s.name, img: await load(s.svg) })),
      );
      imgs.sort((a, b) => b.img.height - a.img.height || a.name.localeCompare(b.name));
      const pad = 2;
      let x = pad;
      let y = pad;
      let rowH = 0;
      let width = 0;
      const frames: Record<string, { x: number; y: number; w: number; h: number }> = {};
      for (const { name, img } of imgs) {
        if (x + img.width + pad > maxW) {
          x = pad;
          y += rowH + pad;
          rowH = 0;
        }
        frames[name] = { x, y, w: img.width, h: img.height };
        x += img.width + pad;
        rowH = Math.max(rowH, img.height);
        width = Math.max(width, x);
      }
      const height = y + rowH + pad;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d');
      for (const { name, img } of imgs) {
        const f = frames[name];
        if (f) ctx.drawImage(img, f.x, f.y);
      }
      // Rohpixel statt PNG: Node schreibt daraus ein Palette-PNG.
      const data = ctx.getImageData(0, 0, width, height).data;
      let bin = '';
      for (let i = 0; i < data.length; i += 0x8000)
        bin += String.fromCharCode(...data.subarray(i, Math.min(data.length, i + 0x8000)));
      return { rgba: btoa(bin), w: width, h: height, frames };
    },
    { sprites, maxW },
  );
}

/** Einzelbild, auf den sichtbaren Inhalt beschnitten (für `<img>` im DOM). */
async function trimmed(svg: string, size?: number): Promise<string> {
  return page.evaluate(
    async ({ svg, size }) => {
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await img.decode();
      const w = size ?? img.width;
      const h = size ?? img.height;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('no 2d');
      ctx.drawImage(img, 0, 0, w, h);
      if (size) return c.toDataURL('image/png');
      const data = ctx.getImageData(0, 0, w, h).data;
      let x0 = w;
      let y0 = h;
      let x1 = 0;
      let y1 = 0;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          if ((data[(y * w + x) * 4 + 3] ?? 0) > 8) {
            x0 = Math.min(x0, x);
            y0 = Math.min(y0, y);
            x1 = Math.max(x1, x);
            y1 = Math.max(y1, y);
          }
      const side = Math.max(x1 - x0, y1 - y0) + 1;
      const out = document.createElement('canvas');
      out.width = side;
      out.height = side;
      out
        .getContext('2d')
        ?.drawImage(
          c,
          x0,
          y0,
          x1 - x0 + 1,
          y1 - y0 + 1,
          (side - (x1 - x0 + 1)) / 2,
          side - (y1 - y0 + 1),
          x1 - x0 + 1,
          y1 - y0 + 1,
        );
      return out.toDataURL('image/png');
    },
    { svg, size },
  );
}

const writePng = (path: string, dataUrl: string): void => {
  writeFileSync(path, Buffer.from(dataUrl.split(',')[1] ?? '', 'base64'));
};

function writeAtlas(name: string, p: Packed): void {
  const rgba = new Uint8Array(Buffer.from(p.rgba, 'base64'));
  writeFileSync(`${OUT}/${name}.png`, encodePalettePng(rgba, p.w, p.h));
  const frames = Object.fromEntries(
    Object.entries(p.frames)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, f]) => [
        k,
        {
          frame: f,
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h },
          sourceSize: { w: f.w, h: f.h },
        },
      ]),
  );
  const json = { frames, meta: { image: `${name}.png`, size: { w: p.w, h: p.h }, scale: '2' } };
  writeFileSync(`${OUT}/${name}.json`, `${JSON.stringify(json, null, 1)}\n`);
  console.log(
    `${name}: ${String(Object.keys(frames).length)} frames, ${String(p.w)}×${String(p.h)}`,
  );
}

mkdirSync(`${OUT}/icons`, { recursive: true });
const stations = stationSprites();
const ambience = ambienceSprites();
const characters = characterSprites();
writeAtlas('common', await pack([...stations, ...ambience, ...characters, ...fxSprites()]));
for (const loc of LOCATIONS) writeAtlas(`theme-${loc}`, await pack(themeSprites(loc), 1024));

// DOM-Icons: Stationen in Blickrichtung „a“, Ambiente, Filialleiter-Portrait.
for (const s of stations.filter((x) => x.name.endsWith('-a'))) {
  writePng(`${OUT}/icons/${s.name.replace(/-a$/, '')}.png`, await trimmed(s.svg));
}
for (const s of ambience) writePng(`${OUT}/icons/${s.name}.png`, await trimmed(s.svg));
writePng(`${OUT}/icons/staff-manager.png`, await trimmed(staffPortrait('manager')));
writeFileSync('public/assets/ui/icon.svg', `${appIcon()}\n`);
writePng('public/assets/ui/icon-192.png', await trimmed(appIcon(), 192));
writePng('public/assets/ui/icon-512.png', await trimmed(appIcon(), 512));
await browser.close();
