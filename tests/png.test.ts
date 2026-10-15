import { crc32, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { encodePalettePng, quantize } from '../scripts/art/png';

/** Liest die Chunks eines PNG und prüft dabei jede Prüfsumme. */
function chunks(png: Buffer): Map<string, Buffer> {
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const out = new Map<string, Buffer>();
  let o = 8;
  while (o < png.length) {
    const len = png.readUInt32BE(o);
    const type = png.toString('ascii', o + 4, o + 8);
    const data = png.subarray(o + 8, o + 8 + len);
    expect(png.readUInt32BE(o + 8 + len)).toBe(crc32(png.subarray(o + 4, o + 8 + len)) >>> 0);
    out.set(type, Buffer.concat([out.get(type) ?? Buffer.alloc(0), data]));
    o += 12 + len;
  }
  return out;
}

/** Dekodiert ein 8-Bit-Palette-PNG (Filter 0) zurück nach RGBA. */
function decode(png: Buffer): { w: number; h: number; rgba: number[] } {
  const c = chunks(png);
  const ihdr = c.get('IHDR') ?? Buffer.alloc(13);
  const w = ihdr.readUInt32BE(0);
  const h = ihdr.readUInt32BE(4);
  expect([ihdr[8], ihdr[9]]).toEqual([8, 3]);
  const plte = c.get('PLTE') ?? Buffer.alloc(0);
  const trns = c.get('tRNS') ?? Buffer.alloc(0);
  const raw = inflateSync(c.get('IDAT') ?? Buffer.alloc(0));
  const rgba: number[] = [];
  for (let y = 0; y < h; y++) {
    expect(raw[y * (w + 1)]).toBe(0);
    for (let x = 0; x < w; x++) {
      const i = raw[y * (w + 1) + 1 + x] ?? 0;
      rgba.push(plte[i * 3] ?? 0, plte[i * 3 + 1] ?? 0, plte[i * 3 + 2] ?? 0, trns[i] ?? 255);
    }
  }
  return { w, h, rgba };
}

describe('Palette-PNG (pnpm art)', () => {
  it('bleibt bei ≤ 256 Farben verlustfrei; Transparenz liegt auf Index 0', () => {
    const px = [
      [255, 0, 0, 255],
      [0, 0, 0, 0],
      [20, 200, 90, 128],
      [255, 0, 0, 255],
      [1, 2, 3, 2], // fast unsichtbar → transparent
      [250, 240, 230, 255],
    ];
    const png = encodePalettePng(new Uint8Array(px.flat()), 3, 2);
    const { w, h, rgba } = decode(png);
    expect([w, h]).toEqual([3, 2]);
    expect(rgba).toEqual(px.map((p) => ((p[3] ?? 0) < 4 ? [0, 0, 0, 0] : p)).flat());
    expect(quantize(new Uint8Array(px.flat())).palette[0]).toEqual([0, 0, 0, 0]);
  });

  it('reduziert einen Verlauf mit 4096 Farben auf ≤ 256 mit kleinem Fehler, deterministisch', () => {
    const w = 64;
    const h = 64;
    const rgba = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) rgba.set([x * 4, y * 4, 128, 255], (y * w + x) * 4);
    const { palette, indices } = quantize(rgba);
    expect(palette.length).toBeLessThanOrEqual(256);
    let err = 0;
    for (let i = 0; i < w * h; i++) {
      const p = palette[indices[i] ?? 0] ?? [0, 0, 0, 0];
      for (let ch = 0; ch < 3; ch++) err += Math.abs((p[ch] ?? 0) - (rgba[i * 4 + ch] ?? 0));
    }
    expect(err / (w * h * 3)).toBeLessThan(4);
    expect(encodePalettePng(rgba, w, h).equals(encodePalettePng(rgba, w, h))).toBe(true);
  });
});
