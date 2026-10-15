import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CHAR_FRAMES,
  CHAR_WALK,
  COUNTER_LOOK_CAFE_LEVELS,
  COUNTER_PROPS,
  CUSTOMER_LOOKS,
  STAFF_LOOKS,
  STAFF_WALKERS,
  STATION_LOOK_LEVELS,
  TABLE_LOOK_LEVELS,
  counterLookTier,
  counterPropsAt,
  nextStationLookLevel,
  nextTableLookLevel,
  staffLookFor,
  stationLookTier,
  tableLookTier,
} from '@data/art';
import { STATIONS } from '@data/stations';
import { AMBIENCE, getAmbienceDef } from '@data/ambience';
import { BALANCE } from '@data/balance';
import { CUSTOMER_TYPES } from '@data/customerTypes';
import { LAYOUTS } from '@data/layouts';
import { STAFF_ROLES } from '@data/staff';
import { characterSprites } from '../scripts/art/figures';
import {
  COUNTER_VARIANTS,
  EQUIPMENT_IDS,
  TABLE_TIERS,
  TIERS,
  stationSprites,
  tableSprites,
} from '../scripts/art/equipment';
import { ambienceSprites } from '../scripts/art/sprites';
import { decorSprites, tableOutSprites } from '../scripts/art/decor';

type Atlas = { frames: Record<string, unknown> };
const common = JSON.parse(readFileSync('public/assets/sprites/common.json', 'utf8')) as Atlas;
const furniture = JSON.parse(readFileSync('public/assets/sprites/furniture.json', 'utf8')) as Atlas;

describe('Ausstattungs-Optik', () => {
  it('fünf Stufen, Wechsel bei Level 10, 25, 50 und 100', () => {
    expect([0, 1, 9, 10, 24, 25, 49, 50, 99, 100, 500].map(stationLookTier)).toEqual([
      1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5,
    ]);
  });
  it('jede neue Optik kommt mit einem Meilenstein (×2 Tempo bzw. Preis)', () => {
    for (const level of STATION_LOOK_LEVELS.slice(1))
      expect(BALANCE.milestones.levels).toContain(level);
  });
  it('nennt das Level der nächsten Optik, auf der letzten Stufe nichts', () => {
    expect(nextStationLookLevel(0)).toBe(10);
    expect(nextStationLookLevel(1)).toBe(10);
    expect(nextStationLookLevel(10)).toBe(25);
    expect(nextStationLookLevel(99)).toBe(100);
    expect(nextStationLookLevel(100)).toBeNull();
  });
  it('Theke wird mit dem Café-Level edler, Stufen steigen monoton', () => {
    expect(counterLookTier(1)).toBe(1);
    expect(counterLookTier(COUNTER_LOOK_CAFE_LEVELS[1])).toBe(2);
    expect(counterLookTier(BALANCE.cafeLevel.max)).toBe(5);
    for (let l = 1; l < BALANCE.cafeLevel.max; l++)
      expect(counterLookTier(l + 1)).toBeGreaterThanOrEqual(counterLookTier(l));
  });
  it('Deko-Varianten der Theke sind gezeichnet', () => {
    for (const v of COUNTER_PROPS) expect(COUNTER_VARIANTS).toContain(v);
    expect(counterPropsAt(0)).toBe(COUNTER_PROPS[0]);
    expect(counterPropsAt(COUNTER_PROPS.length + 2)).toBe(COUNTER_PROPS[2]);
  });
  it('Tische: vier Stufen, alle mit der Höchststufe der Tische erreichbar', () => {
    expect(TABLE_TIERS).toHaveLength(TABLE_LOOK_LEVELS.length);
    expect(tableLookTier(0)).toBe(1);
    expect(tableLookTier(12)).toBe(1);
    expect(tableLookTier(13)).toBe(2);
    expect(tableLookTier(40)).toBe(4);
    expect(nextTableLookLevel(12)).toBe(13);
    expect(nextTableLookLevel(40)).toBeNull();
    const max = TABLE_LOOK_LEVELS[TABLE_LOOK_LEVELS.length - 1] ?? 0;
    expect(max).toBeLessThanOrEqual(getAmbienceDef('seats').maxLevel);
  });
  it('jede Ausstattung aus data/stations hat eine Zeichnung', () => {
    expect([...EQUIPMENT_IDS].sort()).toEqual(STATIONS.map((s) => s.id).sort());
    expect(TIERS).toHaveLength(STATION_LOOK_LEVELS.length);
  });
});

describe('Möbel-Atlas (pnpm art)', () => {
  it('enthält jede Ausstattung in 5 Stufen; Variante „b“ nur, wo ein Grundriss sie braucht', () => {
    for (const s of STATIONS)
      for (const tier of TIERS)
        expect(furniture.frames[`station-${s.id}-${String(tier)}-a`]).toBeDefined();
    for (const layout of Object.values(LAYOUTS))
      for (const p of layout.stations.filter((x) => x.facesX))
        for (const tier of TIERS)
          expect(furniture.frames[`station-${p.stationId}-${String(tier)}-b`]).toBeDefined();
  });
  it('enthält die Theke in 5 Stufen je Deko-Variante, Tische in 4 Stufen, Bauplatz', () => {
    for (const tier of TIERS)
      for (const v of COUNTER_VARIANTS)
        expect(furniture.frames[`counter-${String(tier)}-${String(v)}-a`]).toBeDefined();
    for (const tier of TABLE_TIERS) expect(furniture.frames[`table-${String(tier)}`]).toBeDefined();
    for (const f of ['station-ghost', 'fx-dirt']) expect(furniture.frames[f]).toBeDefined();
  });
  it('enthält Terrassen-Tische je Stufe und jedes Deko-Stück des Grundrisses', () => {
    for (const tier of TABLE_TIERS)
      expect(furniture.frames[`table-out-${String(tier)}`]).toBeDefined();
    for (const layout of Object.values(LAYOUTS))
      for (const d of layout.decor) {
        const frame = d.wall ? `${d.frame}-${d.wall}` : d.frame;
        expect(furniture.frames[frame], frame).toBeDefined();
      }
  });
  it('enthält Ambiente (Tische als `table-*`)', () => {
    for (const a of AMBIENCE.filter((x) => x.id !== 'seats'))
      expect(furniture.frames[`ambience-${a.id}`]).toBeDefined();
  });
  it('ist aktuell (nach Änderungen an der Ausstattung `pnpm art`)', () => {
    const drawn = [
      ...stationSprites(),
      ...tableSprites(),
      ...tableOutSprites(),
      ...ambienceSprites(),
      ...decorSprites(),
    ].map((s) => s.name);
    expect(Object.keys(furniture.frames).sort()).toEqual(drawn.sort());
  });
  it('Zeichnungen sind gültig und eindeutig benannt', () => {
    const sprites = [...stationSprites(), ...tableSprites()];
    expect(new Set(sprites.map((s) => s.name)).size).toBe(sprites.length);
    for (const s of sprites) expect(s.svg).not.toMatch(/NaN|undefined|Infinity/);
  });
  it('DOM-Icons gibt es für jede Stufe', () => {
    const icon = (name: string) => `public/assets/sprites/icons/${name}.png`;
    for (const s of STATIONS)
      for (const tier of TIERS)
        expect(existsSync(icon(`station-${s.id}-${String(tier)}`))).toBe(true);
    for (const tier of TABLE_TIERS)
      expect(existsSync(icon(`ambience-seats-${String(tier)}`))).toBe(true);
    for (const a of AMBIENCE.filter((x) => x.id !== 'seats'))
      expect(existsSync(icon(`ambience-${a.id}`))).toBe(true);
  });
});

describe('Figuren-Atlas (pnpm art)', () => {
  it('enthält keine Möbel (eigener Atlas mit eigener Palette)', () => {
    expect(
      Object.keys(common.frames).filter((k) => /^(station|counter|table|ambience)-/.test(k)),
    ).toEqual([]);
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
