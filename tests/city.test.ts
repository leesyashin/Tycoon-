import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CITY,
  CITY_PALETTES,
  CITY_SPRITE,
  GROUND_CELLS,
  STREET_LIFE,
  UPPER_CELLS,
  buildingHeight,
  busStopClearance,
  crossingApproaches,
  doorFronts,
  groundAllows,
  groundAt,
  groundCellFor,
  hash01,
  propFacing,
  propFootprint,
  propFrame,
  roadMarkTiles,
  sidewalkJointLines,
  upperCellFor,
  type GridRect,
} from '@data/city';
import { LOCATIONS } from '@data/locations';
import { getLayout, pathToTable, waiterPathToTable } from '@data/layouts';
import { StreetLife } from '../src/scenes/city/streetLife';
import { ART_SCALE } from '../src/scenes/art';
import { toScreen } from '../src/scenes/iso/iso';
import { CHAR_SPRITE } from '@data/art';
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

/** Café-Grundstück: Raum ab der hinteren Ecke bis über Terrasse und Wintergarten. */
const CAFE: GridRect = {
  x0: getLayout('berlin').origin.x,
  y0: getLayout('berlin').origin.y,
  x1: 14,
  y1: 14,
};

/** Neun Prüfpunkte einer Grundfläche (Ecken knapp innen, Kantenmitten, Mitte). */
function samples(r: GridRect): [number, number][] {
  const e = 0.01;
  const xs = [r.x0 + e, (r.x0 + r.x1) / 2, r.x1 - e];
  const ys = [r.y0 + e, (r.y0 + r.y1) / 2, r.y1 - e];
  return xs.flatMap((x) => ys.map((y): [number, number] => [x, y]));
}
type Canvas = { w: number; h: number; ox: number; oy: number };
/** Liegt ein Sprite (Leinwand in logischen Pixeln, Bodenpunkt am Grid-Punkt) ganz außerhalb des Kamera-Ausschnitts? */
function offView(x: number, y: number, c: Canvas): boolean {
  const v = CITY.view;
  const s = toScreen(x, y);
  const k = ART_SCALE * 2; // Atlas in 2×, Szene skaliert mit ART_SCALE: logische Pixel
  const left = s.x - c.ox * k;
  const right = s.x + (c.w - c.ox) * k;
  const top = s.y - c.oy * k;
  const bottom = s.y + (c.h - c.oy) * k;
  return right < v.left || left > v.right || bottom < v.top || top > v.bottom;
}
const WALKER: Canvas = {
  w: CHAR_SPRITE.w,
  h: CHAR_SPRITE.h,
  ox: CHAR_SPRITE.w / 2,
  oy: CHAR_SPRITE.footY,
};

/** Punkte auf allen Passanten-Wegen (alle 0,05 Kacheln), nur innerhalb der gezeichneten Fläche. */
function walkSamples(): [number, number][] {
  const out: [number, number][] = [];
  for (const w of CITY.walks)
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i];
      const b = w.points[i + 1];
      if (!a || !b) continue;
      const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.05);
      for (let k = 0; k <= n; k++) {
        const x = a.x + ((b.x - a.x) * k) / n;
        const y = a.y + ((b.y - a.y) * k) / n;
        if (x >= CITY.extent.x0 && y >= CITY.extent.y0) out.push([x, y]);
      }
    }
  return out;
}
const grow = (r: GridRect, d: number): GridRect => ({
  x0: r.x0 - d,
  y0: r.y0 - d,
  x1: r.x1 + d,
  y1: r.y1 + d,
});
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

  it('keine zwei Objekte auf derselben Stelle', () => {
    const all = [...CITY.props, ...CITY.backProps];
    const bad: string[] = [];
    all.forEach((a, i) => {
      const fa = grow(propFootprint(a), 0.04);
      for (const b of all.slice(i + 1)) {
        if (a.kind === 'railing' && b.kind === 'railing') continue;
        if (overlap(fa, propFootprint(b))) bad.push(`${label(a)} / ${label(b)}`);
      }
    });
    expect(bad).toEqual([]);
  });

  it('vor Haltestellen, Haus- und Ladentüren und an den Überwegen bleibt Platz', () => {
    const zones = [
      ...CITY.props
        .filter((p) => p.kind === 'busstop')
        .map((p) => ({ owner: p, rect: busStopClearance(p), what: 'vor der Haltestelle' })),
      ...doorFronts().map((rect) => ({ owner: null, rect, what: 'vor einer Tür' })),
      ...crossingApproaches().map((rect) => ({ owner: null, rect, what: 'am Überweg' })),
    ];
    // Ampeln und Poller gehören an den Überweg
    const crossingFurniture = ['pedLight', 'trafficLight', 'bollard'];
    const bad: string[] = [];
    for (const p of CITY.props)
      for (const z of zones) {
        if (z.owner === p || (z.what === 'am Überweg' && crossingFurniture.includes(p.kind)))
          continue;
        if (overlap(propFootprint(p), z.rect)) bad.push(`${label(p)} ${z.what}`);
      }
    expect(bad).toEqual([]);
  });

  it('Passanten bleiben auf Gehwegen, Parkwegen und Überwegen (Fahrbahn mit Verkehr nur am Zebrastreifen)', () => {
    const crossing = (x: number, y: number) => CITY.crossings.some((c) => inside(c.rect, x, y));
    // Fahrbahnen mit Fahrstreifen (Verkehr): nur über den Zebrastreifen
    const busy = CITY.lanes.map((l) =>
      l.axis === 'u'
        ? { x0: CITY.extent.x0, x1: CITY.extent.x1, y0: Math.floor(l.at), y1: Math.floor(l.at) + 1 }
        : {
            x0: Math.floor(l.at),
            x1: Math.floor(l.at) + 1,
            y0: CITY.extent.y0,
            y1: CITY.extent.y1,
          },
    );
    const bad = new Set<string>();
    for (const [x, y] of walkSamples()) {
      if (crossing(x, y)) continue;
      const g = groundAt(x, y);
      const ok =
        g === 'sidewalk' ||
        g === 'path' ||
        g === 'plaza' ||
        (g === 'road' && !busy.some((r) => inside(r, x, y)));
      if (!ok) bad.add(`${x.toFixed(1)},${y.toFixed(1)} auf ${String(g)}`);
    }
    expect([...bad]).toEqual([]);
  });

  it('Fahrradbügel: Räder stehen quer zum Bordstein der nächsten Fahrbahn', () => {
    const bikes = CITY.props.filter((p) => p.kind === 'bikes');
    expect(bikes.length).toBeGreaterThan(0);
    for (const p of bikes) {
      const dist = (r: (typeof CITY.roads)[number]) =>
        Math.max(0, Math.abs((r.axis === 'u' ? p.y : p.x) - (r.at + 2)) - 2);
      const road = [...CITY.roads].sort((a, b) => dist(a) - dist(b))[0];
      // Räder entlang u gezeichnet; quer gestellt (axis v) entlang y
      expect(p.axis ?? 'u', label(p)).not.toBe(road?.axis);
    }
  });

  it('Passanten laufen nicht durch Objekte (Bäume, Laternen, Räder, Säulen, Brunnen, Ampeln …)', () => {
    const body = 0.12;
    const bad = new Set<string>();
    for (const [x, y] of walkSamples())
      for (const p of CITY.props) if (inside(grow(propFootprint(p), body), x, y)) bad.add(label(p));
    expect([...bad]).toEqual([]);
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
    // Sie tauchen auf dem Gehweg seitlich der Tür auf (entlang der Gehweg-Richtung).
    const along = layout.street.axis === 'u' ? 'x' : 'y';
    const across = along === 'x' ? 'y' : 'x';
    expect(first?.[across]).toBeCloseTo(curb[across]);
    expect(Math.abs((first?.[along] ?? 0) - curb[along])).toBeGreaterThanOrEqual(
      layout.street.spreadMin,
    );
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

describe('Stadtviertel: Ausrichtung der Fahrzeuge und Ampeln', () => {
  it('Parker stehen in Fahrtrichtung des Fahrstreifens daneben (nicht gegen den Verkehr)', () => {
    const parked = CITY.props.filter((p) => p.kind === 'parked');
    expect(parked.length).toBeGreaterThan(0);
    for (const p of parked) {
      const axis = p.axis ?? 'u';
      const across = axis === 'v' ? p.x : p.y;
      const lane = CITY.lanes
        .filter((l) => l.axis === axis)
        .sort((a, b) => Math.abs(a.at - across) - Math.abs(b.at - across))[0];
      const [dx, dy] = propFacing(p) ?? [0, 0];
      expect(axis === 'v' ? dy : dx, label(p)).toBe(lane?.dir);
    }
  });

  it('Briefkästen am Bordstein zeigen den Einwurf quer zur Straße, zum Gehweg hin', () => {
    const boxes = CITY.props.filter((p) => p.kind === 'mailbox');
    expect(boxes.length).toBeGreaterThan(0);
    for (const p of boxes) {
      const [dx, dy] = propFacing(p) ?? [0, 0];
      const road = groundAt(p.x - dx, p.y - dy) === 'road';
      expect(road, `${label(p)} Rücken zur Fahrbahn`).toBe(true);
    }
  });

  it('Fußgängerampeln zeigen quer über ihre Fahrbahn zu den Wartenden gegenüber', () => {
    const lights = CITY.props.filter((p) => p.kind === 'pedLight');
    expect(lights.length).toBeGreaterThan(0);
    for (const p of lights) {
      const [dx, dy] = propFacing(p) ?? [0, 0];
      // axis = Fahrbahn, über die der Überweg führt: Blick quer dazu und zur Fahrbahn hin
      expect(Math.abs(p.axis === 'v' ? dx : dy), label(p)).toBe(1);
      expect(groundAt(p.x + dx, p.y + dy), label(p)).toBe('road');
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

describe('Stadtviertel: Ränder', () => {
  it('Autos fahren nur auf Fahrbahn oder Brücke und tauchen außerhalb des Bilds auf bzw. ab', () => {
    const { laneFrom, laneTo } = STREET_LIFE;
    for (const lane of CITY.lanes) {
      const at = (s: number): [number, number] => (lane.axis === 'u' ? [s, lane.at] : [lane.at, s]);
      for (let s = laneFrom; s <= laneTo; s += 0.5) {
        const g = groundAt(...at(s));
        expect(['road', 'bridge'], `${lane.axis} ${String(lane.at)} bei ${String(s)}`).toContain(g);
      }
      for (const end of [laneFrom, laneTo])
        expect(
          offView(...at(end), CITY_SPRITE.car),
          `${lane.axis} ${String(lane.at)} Ende ${String(end)}`,
        ).toBe(true);
    }
  });

  it('Dampfer fahren nur auf dem Wasser (oder unter Brücken) und begegnen sich nicht', () => {
    const area = (b: (typeof CITY.boats)[number]) => {
      const [a0, a1] = [Math.min(b.from, b.to) - 1.3, Math.max(b.from, b.to) + 1.3];
      return b.axis === 'u'
        ? { x0: a0, x1: a1, y0: b.at - 0.45, y1: b.at + 0.45 }
        : { x0: b.at - 0.45, x1: b.at + 0.45, y0: a0, y1: a1 };
    };
    CITY.boats.forEach((b, i) => {
      // Rumpf ±1,25 entlang, ±0,4 quer
      for (let t = b.from - 1.25; t <= b.to + 1.25; t += 0.25)
        for (const d of [-0.4, 0, 0.4]) {
          const [x, y] = b.axis === 'u' ? [t, b.at + d] : [b.at + d, t];
          expect(
            ['water', 'bridge'],
            `Boot ${String(i)} bei ${x.toFixed(2)},${y.toFixed(2)}`,
          ).toContain(groundAt(x, y));
        }
      CITY.boats.forEach((o, j) => {
        if (j > i) expect(overlap(area(b), area(o)), `Boote ${String(i)}/${String(j)}`).toBe(false);
      });
    });
  });

  it('Dampfer wenden außerhalb des Bilds oder verdeckt unter einer Brücke', () => {
    // Aufbauten bis ~24 px hoch: ihr Bild fällt bis 0,75 Kacheln nach hinten (−x/−y) auf den Boden
    const hidden = (x: number, y: number, axis: 'u' | 'v') =>
      CITY.bridges.some((br) => {
        const r = br.rect;
        const [hx, hy] = axis === 'u' ? [1.25, 0.4] : [0.4, 1.25];
        return x - hx - 0.75 >= r.x0 && x + hx <= r.x1 && y - hy - 0.75 >= r.y0 && y + hy <= r.y1;
      });
    for (const b of CITY.boats)
      for (const end of [b.from, b.to]) {
        const [x, y] = b.axis === 'u' ? [end, b.at] : [b.at, end];
        expect(
          offView(x, y, CITY_SPRITE.boat) || hidden(x, y, b.axis),
          `${b.axis} ${String(end)}`,
        ).toBe(true);
      }
  });

  it('Passanten starten und enden außerhalb des Bilds', () => {
    for (const w of CITY.walks)
      for (const p of [w.points[0], w.points[w.points.length - 1]])
        if (p) expect(offView(p.x, p.y, WALKER), `${String(p.x)},${String(p.y)}`).toBe(true);
  });
});

describe('Stadtviertel: Boden-Details', () => {
  it('Bordsteine und Mittellinien nur auf Fahrbahn oder Brücke, nie auf Kreuzungen', () => {
    for (const r of CITY.roads) {
      const tiles = roadMarkTiles(r, -70, 70);
      expect(tiles.length, `${r.axis} ${String(r.at)}`).toBeGreaterThan(0);
      for (const s of tiles) {
        const [x, y] = r.axis === 'u' ? [s + 0.5, r.at + 2] : [r.at + 2, s + 0.5];
        expect(['road', 'bridge'], `${r.axis} ${String(r.at)} bei ${String(s)}`).toContain(
          groundAt(x, y),
        );
        const cross = CITY.roads.some(
          (q) => q.axis !== r.axis && s + 0.5 > q.at && s + 0.5 < q.at + 4,
        );
        expect(cross, `${r.axis} ${String(r.at)} bei ${String(s)}`).toBe(false);
      }
    }
  });

  it('Gehwegfugen nur auf dem Gehweg (nicht über Kanal, Spree oder Kreuzungen), vor dem Café vorhanden', () => {
    const lines = sidewalkJointLines();
    for (const [x0, y0, x1, y1] of lines) {
      const g = groundAt((x0 + x1) / 2 + 0.01, (y0 + y1) / 2 + 0.01);
      expect(g, `${String(x0)},${String(y0)} → ${String(x1)},${String(y1)}`).toBe('sidewalk');
    }
    // Gehweg vor dem Café hat Fugen, der Kanal unter der Brücke keine
    expect(lines.some(([x0, y0]) => x0 === 6 && y0 >= 12 && y0 < 15)).toBe(true);
    expect(lines.some(([x0, , x1]) => (x0 + x1) / 2 > 21.5 && (x0 + x1) / 2 < 26.5)).toBe(false);
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

  it('bei Gelb fährt nur noch über die Haltelinie, wer beim Umschalten schon dicht davor war', () => {
    const life = new StreetLife(CITY, seeded(11));
    const dt = 0.05;
    const yellowSince: Record<'u' | 'v', number | null> = { u: null, v: null };
    let t = 0;
    let crossed = 0;
    for (let step = 0; step < 8000; step++) {
      const before = life.cars.map((c) => c.pos);
      life.update(dt);
      t += dt;
      for (const axis of ['u', 'v'] as const) {
        const yellow = life.lightState(axis) === 'yellow';
        if (!yellow) yellowSince[axis] = null;
        else yellowSince[axis] ??= t - dt;
      }
      life.cars.forEach((c, i) => {
        const lane = life.lane(c);
        const since = lane ? yellowSince[lane.axis] : null;
        if (!c.active || !lane || since === null) return;
        const line = lane.stopAt * lane.dir - STREET_LIFE.carHalfLength;
        const was = (before[i] ?? 0) * lane.dir;
        if (was > line || c.pos * lane.dir <= line) return;
        crossed++;
        const speed =
          STREET_LIFE.carTilesPerSec * (StreetLife.isBike(c.type) ? STREET_LIFE.bikeSpeed : 1);
        expect(t - since).toBeLessThanOrEqual(STREET_LIFE.yellowCommit / speed + 2 * dt);
      });
    }
    expect(crossed).toBeGreaterThan(0);
  });

  it('nie Fahrzeuge beider Richtungen zugleich auf der Kreuzung, nie eins am Zebrastreifen über einem Passanten', () => {
    const life = new StreetLife(CITY, seeded(11));
    const half = (type: number) => (StreetLife.isBike(type) ? 0.35 : STREET_LIFE.carHalfLength);
    let clash = 0;
    let onZebra = 0;
    for (let step = 0; step < 16000; step++) {
      life.update(0.05);
      const cars = life.cars
        .filter((c) => c.active)
        .map((c) => ({ c, p: life.carPosition(c), axis: life.lane(c)?.axis }));
      for (const a of cars)
        for (const b of cars)
          if (
            a.axis === 'u' &&
            b.axis === 'v' &&
            Math.abs(a.p.x - b.p.x) < half(a.c.type) + 0.3 &&
            Math.abs(a.p.y - b.p.y) < half(b.c.type) + 0.3
          )
            clash++;
      for (const w of life.walkers) {
        if (!w.active || !CITY.crossings.some((c) => inside(c.rect, w.x, w.y))) continue;
        for (const a of cars) {
          const along = a.axis === 'u' ? Math.abs(w.x - a.p.x) : Math.abs(w.y - a.p.y);
          const across = a.axis === 'u' ? Math.abs(w.y - a.p.y) : Math.abs(w.x - a.p.x);
          if (along < half(a.c.type) + 0.15 && across < 0.45) onZebra++;
        }
      }
    }
    expect({ clash, onZebra }).toEqual({ clash: 0, onZebra: 0 });
  });

  it('Tauben blenden beim Wegfliegen aus und beim Landen ein (verschwinden nicht mitten in der Luft)', () => {
    const life = new StreetLife(CITY, seeded(4));
    const dt = 0.05;
    const step = dt / STREET_LIFE.pigeonFadeSec + 1e-6;
    let last = life.pigeons.map((p) => p.alpha);
    let flown = 0;
    for (let i = 0; i < 6000; i++) {
      life.update(dt);
      life.pigeons.forEach((p, k) => {
        const before = last[k] ?? 1;
        expect(Math.abs(p.alpha - before), `Taube ${String(k)} ${p.state}`).toBeLessThanOrEqual(
          step,
        );
        if (p.state === 'away') expect(p.alpha).toBe(0);
        if (p.state === 'peck') expect(p.alpha).toBe(1);
        if (p.state === 'fly') flown++;
      });
      last = life.pigeons.map((p) => p.alpha);
    }
    expect(flown).toBeGreaterThan(0);
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
        // Betritt die Fahrbahn entlang x (y 15..19) von einer der beiden Seiten nur, wenn sie Rot hat; ebenso entlang y.
        const onU = (y: number) => y >= 15 && y <= 19;
        const onV = (x: number) => x >= 15 && x <= 19;
        if (!onU(b.y) && onU(w.y) && w.x > 12 && w.x < 15) expect(life.signal()).not.toBe('u');
        if (!onV(b.x) && onV(w.x) && w.y > 12 && w.y < 15) expect(life.signal()).not.toBe('v');
      });
    }
    expect(life.walkers.some((w) => w.active)).toBe(true);
  });
});
