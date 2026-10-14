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
    const { getTheme } = await import('../src/data/themes');
    for (const l of LOCATIONS) {
      expect(getLayout(l.id).gridSize).toBeGreaterThan(0);
      expect(getTheme(l.id).floorTint).toBeGreaterThan(0);
    }
    expect(() => getTheme('nowhere')).toThrow();
  });
});
