import { describe, expect, it } from 'vitest';
import { depth, toGrid, toScreen } from '../src/scenes/iso/iso';

describe('iso', () => {
  it('toGrid ist die Umkehrung von toScreen', () => {
    for (const [x, y] of [
      [0, 0],
      [3, 5],
      [11, 2],
    ] as const) {
      const s = toScreen(x, y);
      const g = toGrid(s.x, s.y);
      expect(g.x).toBeCloseTo(x);
      expect(g.y).toBeCloseTo(y);
    }
  });

  it('weiter hinten liegende Kacheln haben kleinere Tiefe', () => {
    expect(depth(1, 1)).toBeLessThan(depth(2, 1));
  });
});

describe('Standort-Skins', () => {
  it('jeder Standort hat Layout und Theme', async () => {
    const { LOCATIONS } = await import('../src/data/locations');
    const { getLayout } = await import('../src/data/layouts');
    const { readFileSync } = await import('node:fs');
    // Lazy-Loading je Standort: jeder braucht seinen Themen-Atlas mit allen Frames, die CafeScene nutzt.
    const needed = ['floor-a', 'floor-b', 'entrance', 'terrace', 'wall-u', 'wall-u-deco'];
    for (const l of LOCATIONS) {
      expect(getLayout(l.id).gridSize).toBeGreaterThan(0);
      const atlas = JSON.parse(
        readFileSync(`public/assets/sprites/theme-${l.id}.json`, 'utf8'),
      ) as { frames: Record<string, unknown> };
      // Endausbau nach Deko-Level (`roomLook`): Boden 2/3, Wände 2, Vorderwände mit Blumenkästen
      const lux = [
        'floor-2-a',
        'floor-2-b',
        'floor-3-a',
        'floor-3-b',
        'wall-u-2',
        'wall-u-2-deco',
        'wall-v-2',
        'wall-v-2-deco',
        'front-u-2',
        'front-v-2',
      ];
      for (const f of [...needed, 'wall-v', 'wall-v-deco', 'front-u', 'front-v', ...lux]) {
        expect(atlas.frames[f], `${l.id}:${f}`).toBeDefined();
      }
    }
  });
});
