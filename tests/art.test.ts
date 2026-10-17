import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CHAR_CARRY,
  CHAR_FRAMES,
  CHAR_LOW,
  CHAR_WALK,
  CHAR_WHISK,
  CHAR_WORK,
  COUNTER_LOOK_CAFE_LEVELS,
  COUNTER_PROPS,
  CUSTOMER_FRAMES,
  CUSTOMER_LOOKS,
  STAFF_FRAMES,
  STAFF_LOOKS,
  STATION_LOOK_LEVELS,
  TABLE_LOOK_LEVELS,
  WORK_SCRIPTS,
  counterLookTier,
  counterPropsAt,
  decorFrame,
  roomLook,
  nextStationLookLevel,
  nextTableLookLevel,
  staffLookFor,
  stationLookTier,
  tableLookTier,
  workStepAt,
  type WorkPose,
} from '@data/art';
import { MENU_LEVELS, PRODUCT_LINES, STATIONS, menuTierIndex } from '@data/stations';
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
import { storageSprites } from '../scripts/art/storage';

type Atlas = { frames: Record<string, unknown> };
const common = JSON.parse(readFileSync('public/assets/sprites/common.json', 'utf8')) as Atlas;
const furniture = JSON.parse(readFileSync('public/assets/sprites/furniture.json', 'utf8')) as Atlas;
/** Frame-Nummern einer Pose (`CHAR_FRAMES` mischt einzelne Frames und Zyklen). */
const framesOf = (f: number | readonly number[]): readonly number[] =>
  typeof f === 'number' ? [f] : f;
const ALL_FRAMES = Object.values(CHAR_FRAMES).flatMap(framesOf);

describe('Ausstattungs-Optik', () => {
  it('fünf Stufen, Wechsel bei Level 5, 10, 15 und 20 – wie die Speisekarte', () => {
    expect(STATION_LOOK_LEVELS).toEqual([1, 5, 10, 15, 20]);
    expect(STATION_LOOK_LEVELS).toEqual(MENU_LEVELS);
    expect([0, 1, 4, 5, 9, 10, 14, 15, 19, 20, 500].map(stationLookTier)).toEqual([
      1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5,
    ]);
  });
  it('jede neue Optik bringt ein neues Produkt auf die Karte; das Höchstlevel zeigt die edelste', () => {
    for (let level = 0; level <= 25; level++)
      expect(stationLookTier(level), `Level ${String(level)}`).toBe(menuTierIndex(level));
    for (const d of PRODUCT_LINES) expect(d.menu, d.id).toHaveLength(STATION_LOOK_LEVELS.length);
    for (const d of STATIONS) expect(stationLookTier(d.maxLevel), d.id).toBe(5);
  });
  it('nennt das Level der nächsten Optik, auf der letzten Stufe nichts', () => {
    expect(nextStationLookLevel(0)).toBe(5);
    expect(nextStationLookLevel(1)).toBe(5);
    expect(nextStationLookLevel(5)).toBe(10);
    expect(nextStationLookLevel(19)).toBe(20);
    expect(nextStationLookLevel(20)).toBeNull();
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
    expect(TABLE_LOOK_LEVELS).toEqual([1, 4, 7, 10]);
    expect([0, 1, 3, 4, 6, 7, 9, 10].map(tableLookTier)).toEqual([1, 1, 1, 2, 2, 3, 3, 4]);
    expect(nextTableLookLevel(0)).toBe(4);
    expect(nextTableLookLevel(3)).toBe(4);
    expect(nextTableLookLevel(7)).toBe(10);
    expect(nextTableLookLevel(10)).toBeNull();
    const seats = getAmbienceDef('seats').maxLevel;
    const max = TABLE_LOOK_LEVELS[TABLE_LOOK_LEVELS.length - 1] ?? 0;
    expect(max).toBeLessThanOrEqual(seats);
    expect(tableLookTier(seats)).toBe(TABLE_LOOK_LEVELS.length);
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
        // Endausbau-Tausch (`DECOR_UPGRADES`) muss ebenfalls gezeichnet sein
        const lux = decorFrame(d.frame, 30);
        const luxFrame = d.wall ? `${lux}-${d.wall}` : lux;
        expect(furniture.frames[luxFrame], luxFrame).toBeDefined();
      }
  });
  it('enthält Ambiente (Tische als `table-*`)', () => {
    for (const a of AMBIENCE.filter((x) => x.id !== 'seats'))
      expect(furniture.frames[`ambience-${a.id}`], `ambience-${a.id}`).toBeDefined();
  });
  it('ist aktuell (nach Änderungen an der Ausstattung `pnpm art`)', () => {
    const drawn = [
      ...stationSprites(),
      ...tableSprites(),
      ...tableOutSprites(),
      ...ambienceSprites(),
      ...decorSprites(),
      ...storageSprites(),
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
    const missing = (name: string): string[] => (existsSync(icon(name)) ? [] : [name]);
    const names = [
      ...STATIONS.flatMap((s) => TIERS.map((tier) => `station-${s.id}-${String(tier)}`)),
      ...TABLE_TIERS.map((tier) => `ambience-seats-${String(tier)}`),
      ...AMBIENCE.filter((x) => x.id !== 'seats').map((a) => `ambience-${a.id}`),
    ];
    expect(names.flatMap(missing)).toEqual([]);
  });
});

describe('Figuren-Atlas (pnpm art)', () => {
  it('enthält keine Möbel (eigener Atlas mit eigener Palette)', () => {
    expect(
      Object.keys(common.frames).filter((k) => /^(station|counter|table|ambience)-/.test(k)),
    ).toEqual([]);
  });
  it('enthält jede Kunden-Variante mit 2 Richtungen × Gäste-Frames (Stehen, Laufen, Tragen) und Sitzpose', () => {
    // Gäste holen an der Theke ab und tragen selbst (Selbstbedienung).
    for (const f of [CHAR_FRAMES.stand, ...CHAR_FRAMES.walk, ...CHAR_FRAMES.carry])
      expect(CUSTOMER_FRAMES).toContain(f);
    for (const c of CUSTOMER_TYPES) {
      const looks = CUSTOMER_LOOKS[c.id];
      expect(looks.length).toBeGreaterThanOrEqual(2);
      for (const look of looks)
        for (const dir of ['front', 'back']) {
          for (const f of CUSTOMER_FRAMES) {
            const name = `customer-${c.id}-${look}-${dir}-${String(f)}`;
            expect(common.frames[name], name).toBeDefined();
          }
          expect(common.frames[`customer-${c.id}-${look}-sit-${dir}`]).toBeDefined();
        }
    }
  });
  it('enthält jeden Personal-Look genau mit den Frames seiner Rolle (beide Richtungen)', () => {
    const all = ALL_FRAMES;
    for (const r of STAFF_ROLES) {
      expect(STAFF_LOOKS[r.id].length).toBeGreaterThan(0);
      expect(STAFF_FRAMES[r.id]).toContain(CHAR_FRAMES.stand);
      for (const look of STAFF_LOOKS[r.id])
        for (const dir of ['front', 'back']) {
          const name = (f: number) => `staff-${r.id}-${look}-${dir}-${String(f)}`;
          for (const f of all)
            expect(common.frames[name(f)] !== undefined, name(f)).toBe(
              STAFF_FRAMES[r.id].includes(f),
            );
        }
    }
  });
  it('Baristas arbeiten in allen Posen, laufen und tragen; Verkäufer tippen und gehen; Bedienungen stellen ab', () => {
    const f = CHAR_FRAMES;
    const poses = [...f.work, ...f.whisk, ...f.low, f.pour, f.place];
    for (const x of [...f.walk, ...f.carry, ...poses]) expect(STAFF_FRAMES.barista).toContain(x);
    // Verkäufer tippen an der Kasse und gehen morgens herein bzw. abends hinaus.
    for (const x of [...f.work, ...f.walk]) expect(STAFF_FRAMES.cashier).toContain(x);
    for (const x of [...f.walk, f.place]) expect(STAFF_FRAMES.waiter).toContain(x);
    for (const x of [...f.walk, ...f.work]) expect(STAFF_FRAMES.cleaner).toContain(x);
    expect(STAFF_FRAMES.manager).toEqual([f.stand]);
    expect(STAFF_FRAMES.socialMedia).toEqual([f.stand]);
    for (const frames of Object.values(STAFF_FRAMES))
      for (const x of frames) expect(ALL_FRAMES).toContain(x);
  });
  it('Lauf-, Trage-, Arbeits-, Besen- und Greif-Zyklus nutzen nur gerenderte Frames', () => {
    for (const f of CHAR_WALK.cycle) expect([CHAR_FRAMES.stand, ...CHAR_FRAMES.walk]).toContain(f);
    for (const f of CHAR_CARRY.cycle) expect(CHAR_FRAMES.carry).toContain(f);
    for (const f of CHAR_WORK.cycle) expect(CHAR_FRAMES.work).toContain(f);
    for (const f of CHAR_WHISK.cycle) expect(CHAR_FRAMES.whisk).toContain(f);
    for (const f of CHAR_LOW.cycle) expect(CHAR_FRAMES.low).toContain(f);
  });
  it('Arbeitsschritte je Gerät: Anteile ergeben 1, jede Pose hat der Barista gerendert', () => {
    const poseFrames = (pose: WorkPose): readonly number[] => framesOf(CHAR_FRAMES[pose]);
    for (const [id, steps] of Object.entries(WORK_SCRIPTS)) {
      expect(
        steps.reduce((a, x) => a + x.share, 0),
        id,
      ).toBeCloseTo(1, 9);
      for (const x of steps)
        for (const f of poseFrames(x.pose)) expect(STAFF_FRAMES.barista, id).toContain(f);
      expect(workStepAt(id, 0)).toBe(steps[0]);
      expect(workStepAt(id, 1)).toBe(steps[steps.length - 1]);
      expect(workStepAt(id, -5)).toBe(steps[0]);
    }
    for (const d of PRODUCT_LINES) expect(WORK_SCRIPTS[d.id], d.id).toBeDefined();
    expect(workStepAt('register', 0.5).pose).toBe('work');
  });
});

describe('Endausbau', () => {
  it('Raum wird mit dem Deko-Level edler: Boden 1→3, Wände 1→2, Fassade 1→2, monoton', () => {
    expect(roomLook(0)).toEqual({ floor: 1, wall: 1, front: 1 });
    expect(roomLook(30)).toEqual({ floor: 3, wall: 2, front: 2 });
    for (let l = 0; l < 30; l++) {
      const a = roomLook(l);
      const b = roomLook(l + 1);
      expect(b.floor).toBeGreaterThanOrEqual(a.floor);
      expect(b.wall).toBeGreaterThanOrEqual(a.wall);
      expect(b.front).toBeGreaterThanOrEqual(a.front);
    }
    expect(getAmbienceDef('decor').maxLevel).toBeGreaterThanOrEqual(24);
  });
  it('Pendelleuchten werden im Endausbau zu Messing-Kugeln', () => {
    expect(decorFrame('deco-pendant', 0)).toBe('deco-pendant');
    expect(decorFrame('deco-pendant', 30)).toBe('deco-pendant-lux');
    expect(decorFrame('deco-monstera', 30)).toBe('deco-monstera');
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
  it('Lauf-, Arbeits- und Trage-Frames unterscheiden sich vom Stehen', () => {
    for (const s of sprites.filter((x) => /-(front|back)-[1-9]\d*$/.test(x.name)))
      expect(s.svg, s.name).not.toBe(svg.get(s.name.replace(/-\d+$/, '-0')));
  });
  it('Arbeits-Zyklen wechseln die Haltung (Tippen, Besen, tief Greifen)', () => {
    for (const [a, b] of [CHAR_FRAMES.work, CHAR_FRAMES.whisk, CHAR_FRAMES.low]) {
      const first = sprites.filter((x) => x.name.endsWith(`-${String(a)}`));
      expect(first.length, `Frame ${String(a)}`).toBeGreaterThan(0);
      for (const s of first)
        expect(s.svg, s.name).not.toBe(svg.get(s.name.replace(/-\d+$/, `-${String(b)}`)));
    }
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
