import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CITY,
  CITY_PALETTES,
  GROUND_CELLS,
  STREET_LIFE,
  UPPER_CELLS,
  buildingHeight,
  groundAllows,
  groundAt,
  groundCellFor,
  hash01,
  propFacing,
  propFootprint,
  propFrame,
  upperCellFor,
  type GridRect,
} from '@data/city';
import { LOCATIONS } from '@data/locations';
import { getLayout, pathToTable, waiterPathToTable } from '@data/layouts';
import { StreetLife } from '../src/scenes/city/streetLife';
import { CustomerCrowd } from '../src/scenes/agents/crowd';
import { citySprites } from '../scripts/art/city';

type Atlas = { frames: Record<string, unknown> };
const atlas = (name: string) =>
  JSON.parse(readFileSync(`public/assets/sprites/${name}.json`, 'utf8')) as Atlas;

const overlap = (a: GridRect, b: GridRect) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const inside = (r: GridRect, x: number, y: number) =>
  x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

/** Deterministischer Zufall für die Straßen-Simulation. */
function seeded(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const CAFE: GridRect = { x0: 0, y0: 0, x1: 14, y1: 14 };

/** Neun Prüfpunkte einer Grundfläche (Ecken knapp innen, Kantenmitten, Mitte). */
function samples(r: GridRect): [number, number][] {
  const e = 0.01;
  const xs = [r.x0 + e, (r.x0 + r.x1) / 2, r.x1 - e];
  const ys = [r.y0 + e, (r.y0 + r.y1) / 2, r.y1 - e];
  return xs.flatMap((x) => ys.map((y): [number, number] => [x, y]));
}
const label = (p: { kind: string; x: number; y: number }) =>
  `${p.kind} (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`;

describe('Stadtviertel: Grundriss', () => {
  it('Häuser überlappen sich nicht und stehen weder auf dem Café-Grundstück noch auf Straße oder Gehweg', () => {
    const open = CITY.ground
      .filter((g) => !['courtyard', 'sidewalk', 'yard', 'grass'].includes(g.kind))
      .map((g) => g.rect);
    CITY.buildings.forEach((a, i) => {
      expect(overlap(a.rect, CAFE), `Haus ${String(i)} auf dem Café`).toBe(false);
      for (const r of open) expect(overlap(a.rect, r), `Haus ${String(i)}`).toBe(false);
      CITY.buildings.forEach((b, j) => {
        if (i !== j) expect(overlap(a.rect, b.rect), `${String(i)}/${String(j)}`).toBe(false);
      });
      expect(Number.isInteger(a.rect.x0 + a.rect.x1 + a.rect.y0 + a.rect.y1)).toBe(true);
    });
  });

  it('Objekte stehen nicht in Häusern oder im Café-Raum; Bäume halten den Blick auf das Café frei', () => {
    for (const p of CITY.props) {
      for (const b of CITY.buildings)
        expect(inside(b.rect, p.x, p.y) && !(p.x === b.rect.x1 || p.y === b.rect.y1)).toBe(false);
      expect(p.x >= 0 && p.x < 12 && p.y >= 0 && p.y < 12, `${p.kind} im Raum`).toBe(false);
      if (p.kind === 'linden' || p.kind === 'lindenSmall')
        expect(p.x >= 0 && p.x <= 14 && p.y < 19, `${p.kind} vor dem Café`).toBe(false);
    }
  });

  it('Objekte stehen auf passendem Boden: nicht auf Fahrbahn, Brücke, Wasser oder Überweg', () => {
    const crossing = (x: number, y: number) =>
      CITY.crossings.some(
        (c) => x >= c.rect.x0 && x < c.rect.x1 && y >= c.rect.y0 && y < c.rect.y1,
      );
    const roads = CITY.roads.map((r) =>
      r.axis === 'u'
        ? { axis: r.axis, x0: CITY.extent.x0, x1: CITY.extent.x1, y0: r.at, y1: r.at + 4 }
        : { axis: r.axis, x0: r.at, x1: r.at + 4, y0: CITY.extent.y0, y1: CITY.extent.y1 },
    );
    const bad = new Set<string>();
    for (const p of [...CITY.props, ...CITY.backProps]) {
      const f = propFootprint(p);
      for (const [x, y] of samples(f)) {
        if (!groundAllows(p.kind, groundAt(x, y)))
          bad.add(`${label(p)} auf ${String(groundAt(x, y))}`);
        if (crossing(x, y)) bad.add(`${label(p)} auf dem Überweg`);
      }
      // Parker nur am Rand ihrer Fahrbahn, nicht auf Kreuzungen
      if (p.kind === 'parked')
        for (const r of roads)
          if (r.axis !== (p.axis ?? 'u') && overlap(f, r)) bad.add(`${label(p)} auf der Kreuzung`);
    }
    expect([...bad]).toEqual([]);
  });

  it('Passanten bleiben auf Gehwegen und Überwegen', () => {
    const walkable = [
      ...CITY.ground.filter((g) => g.kind === 'sidewalk').map((g) => g.rect),
      ...CITY.crossings.map((c) => c.rect),
    ];
    for (const w of CITY.walks) {
      for (let i = 0; i + 1 < w.points.length; i++) {
        const a = w.points[i];
        const b = w.points[i + 1];
        if (!a || !b) continue;
        for (let t = 0; t <= 1; t += 0.05) {
          const x = a.x + (b.x - a.x) * t;
          const y = a.y + (b.y - a.y) * t;
          // Start/Ende liegen knapp außerhalb der gezeichneten Fläche.
          if (x < CITY.extent.x0 || y < CITY.extent.y0) continue;
          expect(
            walkable.some((r) => inside(r, x, y)),
            `${String(x)},${String(y)}`,
          ).toBe(true);
        }
      }
    }
  });

  it('Gäste kommen über den Gehweg ins Café', () => {
    const layout = getLayout('berlin');
    const sidewalk = CITY.ground.filter((g) => g.kind === 'sidewalk').map((g) => g.rect);
    // Agenten-Koordinaten sind Kachel-Indizes (Mitte = ganze Zahl) → Grid-Punkt + 0,5.
    const { curb } = layout.street;
    expect(sidewalk.some((r) => inside(r, curb.x + 0.5, curb.y + 0.5))).toBe(true);
    const crowd = new CustomerCrowd(layout, 'berlin', seeded(3));
    const input = { served: 5, orderCap: 5, waiters: 1, cleaners: 0, tables: 4, cleanliness: 100 };
    let first = crowd.agents.find((a) => a.active);
    for (let i = 0; i < 50 && !first; i++) {
      crowd.update(0.02, input);
      first = crowd.agents.find((a) => a.active);
    }
    expect(first).toBeDefined();
    expect(first?.y).toBeCloseTo(curb.y);
    expect(Math.abs((first?.x ?? 0) - curb.x)).toBeGreaterThanOrEqual(layout.street.spreadMin);
  });
});

describe('Stadtviertel: Ausrichtung', () => {
  it('Haltestellen öffnen sich zur Fahrbahn (Bank und Schild am Bordstein, Rückwand zum Gehweg)', () => {
    const stops = CITY.props.filter((p) => p.kind === 'busstop');
    expect(stops.length).toBeGreaterThan(0);
    for (const p of stops) {
      const [dx, dy] = propFacing(p) ?? [0, 0];
      const at = `${String(p.x)},${String(p.y)}`;
      expect(groundAt(p.x + dx * 1.2, p.y + dy * 1.2), `vor ${at}`).toBe('road');
      expect(groundAt(p.x - dx * 1.2, p.y - dy * 1.2), `hinter ${at}`).not.toBe('road');
    }
  });
});

describe('Stadtviertel: Kamera und Wege', () => {
  it('die Kamera-Grenzen liegen ganz in der gezeichneten Fläche (kein Rand sichtbar)', () => {
    const v = CITY.view;
    const e = CITY.extent;
    // Bildschirm (sx, sy) → Grid: u − v = sx / 32, u + v = sy / 16
    for (const [sx, sy] of [
      [v.left, v.top],
      [v.right, v.top],
      [v.left, v.bottom],
      [v.right, v.bottom],
    ] as const) {
      const d = sx / 32;
      const sum = sy / 16;
      const x = (sum + d) / 2;
      const y = (sum - d) / 2;
      expect(x).toBeGreaterThan(e.x0);
      expect(y).toBeGreaterThan(e.y0);
      expect(x).toBeLessThan(e.x1);
      expect(y).toBeLessThan(e.y1);
    }
  });

  it('Terrassen-Gäste und Bedienungen gehen durch die Tür nach draußen', () => {
    const layout = getLayout('berlin');
    const out = layout.tables.find((t) => t.outside);
    if (!out) throw new Error('no terrace table');
    const through = (path: readonly { x: number; y: number }[]) =>
      path.some((p) => p.x === layout.entrance.x && p.y === layout.entrance.y);
    expect(through(pathToTable(layout, layout.order.access, out))).toBe(true);
    expect(through(waiterPathToTable(layout, out))).toBe(true);
  });
});

describe('Stadtviertel: Fassaden und Atlanten', () => {
  it('jeder Standort hat eine Palette mit genug Fassadenfarben', () => {
    const maxFacade = Math.max(...CITY.buildings.map((b) => b.facade));
    for (const l of LOCATIONS)
      expect(CITY_PALETTES[l.id]?.facades.length).toBeGreaterThan(maxFacade);
  });

  it('Themen-Atlas jedes Standorts enthält alle Fassaden-Module', () => {
    for (const l of LOCATIONS) {
      const frames = atlas(`theme-${l.id}`).frames;
      for (const face of ['a', 'b']) {
        for (const g of GROUND_CELLS) expect(frames[`fac-${g}-${face}`], l.id).toBeDefined();
        for (const u of UPPER_CELLS) expect(frames[`fac-lit-${u}-${face}`], l.id).toBeDefined();
        for (const b of CITY.buildings) {
          for (const u of UPPER_CELLS)
            expect(frames[`fac-${u}-${String(b.facade)}-${face}`], l.id).toBeDefined();
          expect(frames[`fac-cornice-${String(b.facade)}-${face}`], l.id).toBeDefined();
        }
      }
    }
  });

  it('Stadt-Atlas ist aktuell (alle gezeichneten Objekte, Autos und Ampeln)', () => {
    const frames = atlas('city').frames;
    for (const s of citySprites()) expect(frames[s.name], s.name).toBeDefined();
    for (let t = 0; t < STREET_LIFE.carTypes; t++)
      for (const f of ['f', 'b']) expect(frames[`car-${String(t)}-${f}`]).toBeDefined();
    for (const p of [...CITY.props, ...CITY.backProps])
      expect(frames[propFrame(p)], propFrame(p)).toBeDefined();
  });

  it('Läden nur zur Straße, Balkone nie im obersten Geschoss, Höhe aus den Geschossen', () => {
    const b = CITY.buildings[0];
    if (!b) throw new Error('no building');
    for (let i = 0; i < 20; i++) {
      expect(groundCellFor(b, i, false)).toBe('base');
      expect(groundCellFor(b, i, true)).not.toBe('base');
      expect(upperCellFor(b, i, b.floors - 1)).toBe('win');
    }
    expect(buildingHeight({ ...b, floors: 1 })).toBeLessThan(buildingHeight(b));
    expect(hash01(1, 2, 3)).toBe(hash01(1, 2, 3));
    expect(hash01(1, 2, 3)).not.toBe(hash01(3, 2, 1));
  });
});

describe('Stadtviertel: Verkehr und Passanten', () => {
  it('Autos halten Abstand und fahren bei Rot nicht über die Haltelinie', () => {
    const life = new StreetLife(CITY, seeded(7));
    for (let step = 0; step < 2000; step++) {
      const before = new Map(life.cars.map((c) => [c, c.pos]));
      life.update(0.05);
      // Die Autos sehen die Ampel nach dem Weiterzählen der Uhr.
      const red = life.signal();
      CITY.lanes.forEach((lane, li) => {
        const cars = life.cars
          .filter((c) => c.active && c.lane === li)
          .map((c) => c.pos * lane.dir)
          .sort((a, b) => a - b);
        for (let i = 1; i < cars.length; i++)
          expect((cars[i] ?? 0) - (cars[i - 1] ?? 0)).toBeGreaterThanOrEqual(
            STREET_LIFE.carGap - 1e-6,
          );
      });
      for (const c of life.cars) {
        const lane = life.lane(c);
        const was = before.get(c);
        if (!c.active || !lane || was === undefined || red === lane.axis) continue;
        const stop = lane.stopAt * lane.dir - STREET_LIFE.carHalfLength;
        if (was * lane.dir <= stop) expect(c.pos * lane.dir).toBeLessThanOrEqual(stop + 1e-6);
      }
    }
    expect(life.cars.some((c) => c.active)).toBe(true);
  });

  it('Ampel wechselt zwischen den Achsen mit Räumzeit', () => {
    const life = new StreetLife(CITY, seeded(2));
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      life.update(0.05);
      seen.add(life.signal());
      if (life.signal() === 'u') expect(life.greenLeft('v')).toBe(0);
    }
    expect([...seen].sort()).toEqual(['none', 'u', 'v']);
  });

  it('Autoampel: Rot → Rot-Gelb → Grün → Gelb → Rot, nie beide Achsen zugleich frei', () => {
    const life = new StreetLife(CITY, seeded(3));
    const order: Record<string, string> = {
      red: 'redYellow',
      redYellow: 'green',
      green: 'yellow',
      yellow: 'red',
    };
    let last = { u: life.lightState('u'), v: life.lightState('v') };
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      life.update(0.05);
      const now = { u: life.lightState('u'), v: life.lightState('v') };
      for (const axis of ['u', 'v'] as const) {
        seen.add(now[axis]);
        if (now[axis] !== last[axis]) expect(now[axis]).toBe(order[last[axis]]);
      }
      const free = (st: string) => st === 'green' || st === 'yellow';
      expect(free(now.u) && free(now.v)).toBe(false);
      // Grün/Gelb an der Ampel heißt: die Achse hat freie Fahrt in der Schaltung.
      if (free(now.u)) expect(life.signal()).toBe('u');
      last = now;
    }
    expect([...seen].sort()).toEqual(['green', 'red', 'redYellow', 'yellow']);
  });

  it('Passanten queren die Fahrbahn nur bei Grün für die Gegenrichtung', () => {
    const life = new StreetLife(CITY, seeded(5));
    for (let step = 0; step < 4000; step++) {
      const before = life.walkers.map((w) => ({ x: w.x, y: w.y, active: w.active }));
      life.update(0.05);
      life.walkers.forEach((w, i) => {
        const b = before[i];
        if (!b?.active || !w.active) return;
        // Betritt die vordere Fahrbahn (y 15..19) nur, wenn die Fahrbahn entlang x Rot hat.
        const entersU = b.y < 15 && w.y >= 15 && w.x > 12 && w.x < 15;
        if (entersU) expect(life.signal()).not.toBe('u');
        const entersV = b.x > 19 && w.x <= 19 && w.y > 12 && w.y < 15;
        if (entersV) expect(life.signal()).not.toBe('v');
      });
    }
    expect(life.walkers.some((w) => w.active)).toBe(true);
  });
});
