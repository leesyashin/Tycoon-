import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CHAR_FRAMES,
  CHAR_WALK,
  CUSTOMER_LOOKS,
  STAFF_LOOKS,
  STAFF_WALKERS,
  staffLookFor,
  stationLookTier,
} from '@data/art';
import { STATIONS } from '@data/stations';
import { AMBIENCE } from '@data/ambience';
import { CUSTOMER_TYPES } from '@data/customerTypes';
import { STAFF_ROLES } from '@data/staff';
import { characterSprites } from '../scripts/art/figures';

const common = JSON.parse(readFileSync('public/assets/sprites/common.json', 'utf8')) as {
  frames: Record<string, unknown>;
};

describe('Stations-Optik', () => {
  it('Stufen wechseln bei Level 25 und 100', () => {
    expect(stationLookTier(0)).toBe(1);
    expect(stationLookTier(24)).toBe(1);
    expect(stationLookTier(25)).toBe(2);
    expect(stationLookTier(99)).toBe(2);
    expect(stationLookTier(100)).toBe(3);
  });
});

describe('Atlas (pnpm art)', () => {
  it('enthält jede Station in 3 Stufen und 2 Blickrichtungen', () => {
    for (const s of STATIONS)
      for (const tier of [1, 2, 3])
        for (const f of ['a', 'b'])
          expect(common.frames[`station-${s.id}-${String(tier)}-${f}`]).toBeDefined();
  });
  it('enthält Ambiente', () => {
    for (const a of AMBIENCE) expect(common.frames[`ambience-${a.id}`]).toBeDefined();
  });
  it('enthält jede Kunden-Variante mit 2 Richtungen × (Stehen + 2 Lauf-Frames) und Sitzpose', () => {
    const frames = [CHAR_FRAMES.stand, ...CHAR_FRAMES.walk];
    for (const c of CUSTOMER_TYPES) {
      const looks = CUSTOMER_LOOKS[c.id];
      expect(looks.length).toBeGreaterThanOrEqual(2);
      for (const look of looks)
        for (const dir of ['front', 'back']) {
          for (const f of frames)
            expect(common.frames[`customer-${c.id}-${look}-${dir}-${String(f)}`]).toBeDefined();
          expect(common.frames[`customer-${c.id}-${look}-sit-${dir}`]).toBeDefined();
        }
    }
  });
  it('enthält jeden Personal-Look; Lauf-Frames nur für Rollen, die laufen', () => {
    for (const r of STAFF_ROLES) {
      const walks = STAFF_WALKERS.includes(r.id);
      expect(STAFF_LOOKS[r.id].length).toBeGreaterThan(0);
      for (const look of STAFF_LOOKS[r.id])
        for (const dir of ['front', 'back']) {
          const name = (f: number) => `staff-${r.id}-${look}-${dir}-${String(f)}`;
          expect(common.frames[name(CHAR_FRAMES.stand)]).toBeDefined();
          for (const f of CHAR_FRAMES.walk)
            expect(common.frames[name(f)] !== undefined).toBe(walks);
        }
    }
  });
  it('Bedienungen und Putzkräfte laufen durchs Café, Verkäufer und Baristas stehen', () => {
    expect(STAFF_WALKERS).toContain('waiter');
    expect(STAFF_WALKERS).toContain('cleaner');
    expect(STAFF_WALKERS).not.toContain('cashier');
    expect(STAFF_WALKERS).not.toContain('barista');
  });
  it('Lauf-Zyklus nutzt nur gerenderte Frames', () => {
    for (const f of CHAR_WALK.cycle) expect([CHAR_FRAMES.stand, ...CHAR_FRAMES.walk]).toContain(f);
  });
  it('enthält Thekenmodul, Tisch mit Tischdecke und Schmutz-Marker (Phase 2)', () => {
    for (const f of ['counter-a', 'counter-b', 'ambience-seats-2', 'fx-dirt', 'station-ghost'])
      expect(common.frames[f]).toBeDefined();
  });
});

describe('Personal-Looks', () => {
  it('verteilen sich zyklisch auf Figuren derselben Rolle', () => {
    const baristas = STAFF_LOOKS.barista;
    expect(new Set(baristas).size).toBe(baristas.length);
    expect(staffLookFor('barista', 0)).toBe(baristas[0]);
    expect(staffLookFor('barista', 1)).toBe(baristas[1]);
    expect(staffLookFor('barista', baristas.length)).toBe(baristas[0]);
    expect(staffLookFor('cleaner', 4)).toBe(STAFF_LOOKS.cleaner[0]);
  });
});

describe('Figuren (scripts/art/figures.ts)', () => {
  const sprites = characterSprites();
  const svg = new Map(sprites.map((s) => [s.name, s.svg]));
  it('zeichnen ohne ungültige Koordinaten, Namen eindeutig', () => {
    expect(svg.size).toBe(sprites.length);
    for (const s of sprites) expect(s.svg).not.toMatch(/NaN|undefined|Infinity/);
  });
  it('Lauf-Frames unterscheiden sich vom Stehen', () => {
    for (const s of sprites.filter((x) => /-(front|back)-[12]$/.test(x.name)))
      expect(s.svg).not.toBe(svg.get(s.name.replace(/-[12]$/, '-0')));
  });
  it('Sitzpose unterscheidet sich vom Stehen', () => {
    const seated = sprites.filter((x) => /-sit-(front|back)$/.test(x.name));
    expect(seated.length).toBeGreaterThan(0);
    for (const s of seated)
      expect(s.svg).not.toBe(svg.get(s.name.replace(/-sit-(front|back)$/, '-$1-0')));
  });
  it('Atlas ist aktuell (nach Änderungen an Figuren `pnpm art`)', () => {
    const inAtlas = Object.keys(common.frames).filter((k) => /^(customer|staff)-/.test(k));
    expect(inAtlas.sort()).toEqual([...svg.keys()].sort());
  });
});
