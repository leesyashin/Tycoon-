/**
 * 8-Bit-Palette-PNG für die Texture-Atlanten (`pnpm art`). Flat-Shaded-Sprites bestehen aus wenigen hundert
 * Lokalfarben plus Kantenglättung; mit ≤ 256 Farben sieht man keinen Unterschied, die Datei schrumpft aber
 * auf etwa ein Viertel des 32-Bit-PNGs aus Chromium (Ladezeit, Lighthouse). Eigener Encoder über `node:zlib`,
 * keine Abhängigkeit.
 *
 * Quantisierung: Varianz-Median-Cut (immer die Box mit dem größten Fehler teilen), danach einige k-Means-Runden.
 * Gerechnet wird mit vormultiplizierter Farbe (RGB · Alpha), also so, wie das Pixel am Bildschirm ankommt:
 * halbtransparente Verläufe (Lichtschein) bekommen genug Stufen, kaum sichtbare Kantenpixel wenig Gewicht.
 * Passen alle Farben in die Palette, bleibt das Bild verlustfrei. Deterministisch.
 */
import { crc32, deflateSync } from 'node:zlib';

const MAX_COLORS = 256;
/** Kaum sichtbare Pixel (Kantenreste) zählen als voll transparent. */
const ALPHA_CUTOFF = 4;
const REFINE_ROUNDS = 4;

interface Swatch {
  key: number;
  /** Vormultipliziert: R·A, G·A, B·A (0–255), A. */
  c: [number, number, number, number];
  n: number;
}

type Rgba = [number, number, number, number];

interface Box {
  items: Swatch[];
  sse: number;
}

const keyOf = (r: number, g: number, b: number, a: number): number =>
  ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;

function dist2(p: readonly number[], q: readonly number[]): number {
  let d = 0;
  for (let i = 0; i < 4; i++) {
    const x = (p[i] ?? 0) - (q[i] ?? 0);
    d += x * x;
  }
  return d;
}

function makeBox(items: Swatch[]): Box {
  let n = 0;
  const s = [0, 0, 0, 0];
  const q = [0, 0, 0, 0];
  for (const it of items) {
    n += it.n;
    for (let i = 0; i < 4; i++) {
      const v = it.c[i] ?? 0;
      s[i] = (s[i] ?? 0) + v * it.n;
      q[i] = (q[i] ?? 0) + v * v * it.n;
    }
  }
  let sse = 0;
  for (let i = 0; i < 4; i++) sse += (q[i] ?? 0) - ((s[i] ?? 0) * (s[i] ?? 0)) / Math.max(1, n);
  return { items, sse: items.length > 1 ? sse : 0 };
}

function mean(items: readonly Swatch[]): Rgba {
  let n = 0;
  const s = [0, 0, 0, 0];
  for (const it of items) {
    n += it.n;
    for (let i = 0; i < 4; i++) s[i] = (s[i] ?? 0) + (it.c[i] ?? 0) * it.n;
  }
  const m = (i: number) => (s[i] ?? 0) / Math.max(1, n);
  return [m(0), m(1), m(2), m(3)];
}

const premultiply = (r: number, g: number, b: number, a: number): Rgba => [
  (r * a) / 255,
  (g * a) / 255,
  (b * a) / 255,
  a,
];

/** Vormultipliziert → gerade RGBA-Bytes (so speichert PNG). */
function straight([pr, pg, pb, pa]: Rgba): Rgba {
  const a = Math.round(Math.min(255, Math.max(0, pa)));
  const c = (v: number) => (a === 0 ? 0 : Math.round(Math.min(255, Math.max(0, (v * 255) / a))));
  return [c(pr), c(pg), c(pb), a];
}

/** Teilt eine Box am gewichteten Median des Kanals mit der größten Streuung. */
function split(box: Box): [Box, Box] {
  let best = 0;
  let bestVar = -1;
  for (let ch = 0; ch < 4; ch++) {
    let n = 0;
    let s = 0;
    let q = 0;
    for (const it of box.items) {
      const v = it.c[ch] ?? 0;
      n += it.n;
      s += v * it.n;
      q += v * v * it.n;
    }
    const variance = q / n - (s / n) * (s / n);
    if (variance > bestVar) {
      bestVar = variance;
      best = ch;
    }
  }
  const items = [...box.items].sort((a, b) => (a.c[best] ?? 0) - (b.c[best] ?? 0) || a.key - b.key);
  const total = items.reduce((t, it) => t + it.n, 0);
  let acc = 0;
  let cut = 1;
  for (let i = 0; i < items.length - 1; i++) {
    acc += items[i]?.n ?? 0;
    cut = i + 1;
    if (acc >= total / 2) break;
  }
  return [makeBox(items.slice(0, cut)), makeBox(items.slice(cut))];
}

/** Palette (RGBA) und Index je Pixel. Index 0 ist voll transparent, falls das Bild Transparenz hat. */
export function quantize(
  rgba: Uint8Array,
  maxColors = MAX_COLORS,
): { palette: Rgba[]; indices: Uint8Array } {
  const counts = new Map<number, number>();
  const px = rgba.length / 4;
  const keys = new Uint32Array(px);
  for (let i = 0; i < px; i++) {
    const a = rgba[i * 4 + 3] ?? 0;
    const k =
      a < ALPHA_CUTOFF ? 0 : keyOf(rgba[i * 4] ?? 0, rgba[i * 4 + 1] ?? 0, rgba[i * 4 + 2] ?? 0, a);
    keys[i] = k;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const transparent = counts.has(0);
  const swatches: Swatch[] = [];
  for (const [key, n] of counts) {
    if (key === 0) continue;
    swatches.push({
      key,
      c: premultiply((key >>> 24) & 255, (key >>> 16) & 255, (key >>> 8) & 255, key & 255),
      n,
    });
  }
  swatches.sort((a, b) => b.n - a.n || a.key - b.key);
  const slots = maxColors - (transparent ? 1 : 0);
  let palette: Rgba[];
  const lookup = new Map<number, number>();
  if (swatches.length <= slots) {
    palette = swatches.map((s) => [
      (s.key >>> 24) & 255,
      (s.key >>> 16) & 255,
      (s.key >>> 8) & 255,
      s.key & 255,
    ]);
    swatches.forEach((s, i) => lookup.set(s.key, i));
  } else {
    let boxes: Box[] = [makeBox(swatches)];
    while (boxes.length < slots) {
      let pick = -1;
      for (let i = 0; i < boxes.length; i++)
        if (
          (boxes[i]?.sse ?? 0) > 0 &&
          (pick < 0 || (boxes[i]?.sse ?? 0) > (boxes[pick]?.sse ?? 0))
        )
          pick = i;
      const box = boxes[pick];
      if (!box) break;
      boxes = [...boxes.slice(0, pick), ...split(box), ...boxes.slice(pick + 1)];
    }
    palette = boxes.map((b) => mean(b.items));
    const nearest = (c: readonly number[]): number => {
      let bi = 0;
      let bd = Infinity;
      for (let i = 0; i < palette.length; i++) {
        const d = dist2(c, palette[i] ?? []);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      return bi;
    };
    for (let round = 0; round <= REFINE_ROUNDS; round++) {
      const groups: Swatch[][] = palette.map(() => []);
      for (const s of swatches) {
        const i = nearest(s.c);
        groups[i]?.push(s);
        if (round === REFINE_ROUNDS) lookup.set(s.key, i);
      }
      if (round < REFINE_ROUNDS)
        palette = palette.map((p, i) => ((groups[i]?.length ?? 0) > 0 ? mean(groups[i] ?? []) : p));
    }
    palette = palette.map(straight);
  }
  const offset = transparent ? 1 : 0;
  const indices = new Uint8Array(px);
  for (let i = 0; i < px; i++) {
    const k = keys[i] ?? 0;
    indices[i] = k === 0 && transparent ? 0 : (lookup.get(k) ?? 0) + offset;
  }
  return { palette: transparent ? [[0, 0, 0, 0], ...palette] : palette, indices };
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const body = Buffer.concat([head.subarray(4), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([head.subarray(0, 4), body, crc]);
}

/** RGBA (Zeile für Zeile, 4 Byte je Pixel) → 8-Bit-Palette-PNG mit tRNS. */
export function encodePalettePng(rgba: Uint8Array, width: number, height: number): Buffer {
  if (rgba.length !== width * height * 4) throw new Error('rgba size mismatch');
  const { palette, indices } = quantize(rgba);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bittiefe
  ihdr[9] = 3; // Palette
  const plte = Buffer.from(palette.flatMap(([r, g, b]) => [r, g, b]));
  // tRNS nur bis zum letzten nicht deckenden Eintrag (Rest gilt als 255).
  let last = -1;
  palette.forEach((p, i) => {
    if (p[3] < 255) last = i;
  });
  const trns = Buffer.from(palette.slice(0, last + 1).map((p) => p[3]));
  // Filter 0 je Zeile: bei Palettenbildern meist am kleinsten.
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    raw.set(indices.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    ...(trns.length > 0 ? [chunk('tRNS', trns)] : []),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}
