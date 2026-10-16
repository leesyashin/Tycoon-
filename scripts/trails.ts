/**
 * Laufspuren der Café-Figuren als Draufsicht (PNG), um Wege zu prüfen: simuliert die Figuren (`CustomerCrowd`) mit
 * festem Zufall und zeichnet jede Figur als Linie über den Grundriss (Wände, Tür, Theke, Geräte, Lager, Tische,
 * Hocker, sichtbare Deko, Terrasse). Gäste grün, Bedienungen blau, Putzkräfte orange, Baristas lila; Punkte = Start.
 *   PW_CHROMIUM=… pnpm tsx scripts/trails.ts out.png [Sekunden] [Gäste/s] [Deko-Level] [Titel]
 */
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { getLayout, inRoom, visibleTables, type GridPos } from '@data/layouts';
import { CustomerCrowd, type BaristaPost } from '@scenes/agents/crowd';

const out = process.argv[2] ?? 'trails.png';
const seconds = Number(process.argv[3] ?? 60);
const served = Number(process.argv[4] ?? 0.6);
const decorLevel = Number(process.argv[5] ?? 10);
const title = process.argv[6] ?? '';

const layout = getLayout('berlin');
let seed = 7;
const rng = (): number => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const crowd = new CustomerCrowd(layout, 'berlin', rng);
const posts: BaristaPost[] = layout.stations
  .filter((s) => s.stationId !== 'register' && s.stationId !== 'servingStation')
  .slice(0, 4)
  .map((s) => ({ station: s.stationId, home: s.workSpot }));
const input = {
  served,
  orderCap: 3,
  waiters: 3,
  cleaners: 2,
  tables: 10,
  terrace: 2,
  ambience: { decor: decorLevel, music: 1, wifi: 1, terrace: 2 },
  cleanliness: 55,
  baristas: posts,
  prepSec: 4,
};

type Trail = { role: string; pts: GridPos[] };
const trails: Trail[] = [];
const open = new Map<string, Trail>();
const groups = [
  ['guest', crowd.agents],
  ['waiter', crowd.waiters],
  ['cleaner', crowd.cleaners],
  ['barista', crowd.baristas],
] as const;
for (let f = 0; f < seconds * 60; f++) {
  crowd.update(1 / 60, input);
  for (const [role, list] of groups)
    list.forEach((a, i) => {
      const key = `${role}${String(i)}`;
      const t = open.get(key);
      if (!a.active) {
        open.delete(key);
        return;
      }
      if (!t) {
        const n = { role, pts: [{ x: a.x, y: a.y }] };
        trails.push(n);
        open.set(key, n);
        return;
      }
      const last = t.pts[t.pts.length - 1];
      if (last && Math.hypot(a.x - last.x, a.y - last.y) > 0.03) t.pts.push({ x: a.x, y: a.y });
    });
}

const S = 48;
const X0 = -0.5;
const Y0 = 0.5;
const W = 15.5;
const H = 15;
const px = (x: number) => (x - X0) * S;
const py = (y: number) => (y - Y0) * S;
const parts: string[] = [];
const rect = (x: number, y: number, w: number, h: number, fill: string, extra = '') =>
  parts.push(
    `<rect x="${String(px(x))}" y="${String(py(y))}" width="${String(w * S)}" height="${String(h * S)}" fill="${fill}" ${extra}/>`,
  );
const circle = (x: number, y: number, r: number, fill: string, extra = '') =>
  parts.push(
    `<circle cx="${String(px(x))}" cy="${String(py(y))}" r="${String(r * S)}" fill="${fill}" ${extra}/>`,
  );
// Gehweg, Fahrbahn, Raum
rect(X0, Y0, W, H, '#cfd3d6');
rect(14.5, Y0, 1, H, '#7d8288');
rect(X0, 14.5, W, 1, '#7d8288');
for (let y = 0; y < 15; y++)
  for (let x = 0; x < 15; x++) if (inRoom(layout, x, y)) rect(x - 0.5, y - 0.5, 1, 1, '#f6f1e7');
for (let x = 0; x < 15; x++) {
  for (let y = 0; y < 15; y++) {
    if (!inRoom(layout, x, y)) continue;
    const door = x === layout.entrance.x && y === layout.entrance.y;
    if (!inRoom(layout, x + 1, y) && !door) rect(x + 0.45, y - 0.5, 0.1, 1, '#333');
    if (!inRoom(layout, x - 1, y)) rect(x - 0.55, y - 0.5, 0.1, 1, '#333');
    if (!inRoom(layout, x, y + 1)) rect(x - 0.5, y + 0.45, 1, 0.1, '#333');
    if (!inRoom(layout, x, y - 1)) rect(x - 0.5, y - 0.55, 1, 0.1, '#333');
  }
}
for (const a of layout.terrace)
  rect(
    a.from.x - 0.5,
    a.from.y - 0.5,
    a.to.x - a.from.x + 1,
    a.to.y - a.from.y + 1,
    'none',
    'stroke="#b9a" stroke-dasharray="4 4"',
  );
for (const c of layout.counter) rect(c.x - 0.5, c.y - 0.5, 1, 1, '#2146f2', 'opacity="0.7"');
for (const s of layout.stations)
  rect(s.tile.x - 0.5, s.tile.y - 0.5, 1, 1, '#555', 'opacity="0.7"');
for (const p of layout.storage.pieces)
  rect(p.tile.x - 0.5, p.tile.y - 0.5, 1, 1, '#8a6', 'opacity="0.7"');
for (const t of visibleTables(layout, input.tables, input.terrace)) {
  circle(t.tile.x, t.tile.y, 0.3, '#a07040');
  for (const s of t.seats) circle(s.x, s.y, 0.16, '#d0a070');
}
for (const s of layout.bar.stools) circle(s.x, s.y, 0.16, '#d0a070');
for (const d of layout.decor)
  if (!d.wall && !d.floor && !/pendant|chandelier|stool/.test(d.frame) && d.minLevel <= decorLevel)
    circle(d.tile.x, d.tile.y, 0.3, '#4a8', 'opacity="0.6"');
for (const a of layout.ambience)
  if ((input.ambience[a.id as keyof typeof input.ambience] ?? 0) >= a.minLevel)
    circle(a.tile.x, a.tile.y, 0.3, '#4a8', 'opacity="0.6"');
for (const q of layout.order.queue) circle(q.x, q.y, 0.1, 'none', 'stroke="#c33"');
for (const s of layout.pickup.spots) circle(s.x, s.y, 0.1, 'none', 'stroke="#33c"');
const color: Record<string, string> = {
  guest: '#1a9a4a',
  waiter: '#1f5fd6',
  cleaner: '#e07a10',
  barista: '#8a3fc0',
};
for (const t of trails) {
  if (t.pts.length < 2) continue;
  const d = t.pts
    .map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`)
    .join('');
  parts.push(
    `<path d="${d}" fill="none" stroke="${color[t.role] ?? '#000'}" stroke-width="1.4" opacity="0.45"/>`,
  );
  const s = t.pts[0];
  if (s) circle(s.x, s.y, 0.05, color[t.role] ?? '#000');
}
if (title)
  parts.push(
    `<text x="12" y="${String(H * S - 14)}" font-family="sans-serif" font-size="26" font-weight="700" fill="#fff">${title}</text>`,
  );
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(W * S)}" height="${String(H * S)}">${parts.join('')}</svg>`;
writeFileSync(out.replace(/\.png$/, '.svg'), svg);
const browser = await chromium.launch(
  process.env['PW_CHROMIUM'] ? { executablePath: process.env['PW_CHROMIUM'] } : {},
);
const page = await browser.newPage({ viewport: { width: W * S, height: H * S } });
await page.setContent(`<body style="margin:0">${svg}</body>`);
await page.screenshot({ path: out });
await browser.close();
console.log(`${out}: ${String(trails.length)} Spuren`);
