import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CROWD,
  getLayout,
  inRoom,
  LAYOUTS,
  NAV,
  visibleTables,
  type CafeLayout,
  type GridPos,
} from '@data/layouts';
import { STATIONS } from '@data/stations';
import { CUSTOMER_TYPES } from '@data/customerTypes';
import { createInitialState, getLocation, type GameState } from '@core/GameState';
import { computeLocationRates, customerTypeShares, pickCustomerType } from '@core/customers';
import { createStore } from '@core/store';
import { serialize } from '@core/save';
import {
  CustomerCrowd,
  pickLook,
  serveDuration,
  walkInSec,
  type CrowdInput,
} from '@scenes/agents/crowd';
import { CafeNav, pathLength } from '@scenes/agents/nav';
import { CUSTOMER_LOOKS, SUPPLY_ITEMS, storageLookTier, type StorageTier } from '@data/art';
import { FRAME } from '@scenes/art';

/** Deterministischer Zufall für reproduzierbare Tests. */
function lcg(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const input = (patch: Partial<CrowdInput> = {}): CrowdInput => ({
  served: 1,
  orderCap: 2,
  waiters: 2,
  cleaners: 1,
  tables: 6,
  cleanliness: 100,
  ...patch,
});

function run(crowd: CustomerCrowd, inp: CrowdInput, seconds: number): number {
  let purchases = 0;
  for (let t = 0; t < seconds * 60; t++) purchases += crowd.update(1 / 60, inp).purchases.length;
  return purchases;
}

describe('Grundriss (Phase 2)', () => {
  it('jede Ausstattung hat genau eine Platzierung im Raster, Theke und Tische liegen im Raum', () => {
    for (const layout of Object.values(LAYOUTS)) {
      const ids = layout.stations.map((s) => s.stationId).sort();
      expect(ids).toEqual(STATIONS.map((s) => s.id).sort());
      const { origin: o, gridSize: n } = layout;
      const inGrid = (p: { x: number; y: number }) =>
        p.x >= o.x && p.y >= o.y && p.x < n && p.y < n;
      for (const s of layout.stations) expect(inGrid(s.tile) && inGrid(s.workSpot)).toBe(true);
      expect(inRoom(layout, o.x, 12)).toBe(true);
      expect(inRoom(layout, 8, 12)).toBe(false);
      expect(inRoom(layout, o.x - 1, 5)).toBe(false);
      for (const c of layout.counter) expect(inGrid(c)).toBe(true);
      expect(layout.order.queue[0]).toEqual(layout.order.access);
      for (const q of [...layout.order.queue, layout.order.crowd]) expect(inGrid(q)).toBe(true);
      for (const tb of layout.tables) {
        // Kein Tisch auf einer Theken-, Geräte- oder Gangkachel.
        expect(layout.counter.some((c) => c.x === tb.tile.x && c.y === tb.tile.y)).toBe(false);
        if (tb.outside) {
          // Terrasse: vor der Fassade, auf einer Terrassenfläche ihrer Stufe
          const area = layout.terrace.find((a) => a.minLevel === tb.outside?.minTerrace);
          expect(area).toBeDefined();
          if (!area) continue;
          expect(tb.tile.x).toBeGreaterThanOrEqual(area.from.x - 0.5);
          expect(tb.tile.x).toBeLessThanOrEqual(area.to.x + 0.5);
          expect(tb.tile.y).toBeGreaterThanOrEqual(area.from.y - 0.5);
          expect(tb.tile.y).toBeLessThanOrEqual(area.to.y + 0.5);
          continue;
        }
        expect(inRoom(layout, Math.round(tb.tile.x), Math.round(tb.tile.y))).toBe(true);
        expect(inRoom(layout, Math.round(tb.side.x), Math.round(tb.side.y))).toBe(true);
        // Vor der Theke bleibt eine Laufzeile frei (Abholplätze, Barhocker, Weg zu den Tischen).
        const counterY = Math.max(...layout.counter.filter((c) => !c.facesX).map((c) => c.y));
        expect(tb.tile.y).toBeGreaterThan(counterY + 2);
      }
      expect(layout.tables.filter((t) => !t.outside)).toHaveLength(10);
      expect(visibleTables(layout, 0)).toHaveLength(0);
      expect(visibleTables(layout, 3)).toHaveLength(3);
      expect(visibleTables(layout, 50)).toHaveLength(10);
      // Monoton je `seats`-Stufe, ab Stufe 1 mindestens ein Tisch
      let before = 0;
      for (let s = 0; s <= 60; s++) {
        const k = visibleTables(layout, s).length;
        expect(k).toBeGreaterThanOrEqual(before);
        if (s >= 1) expect(k).toBeGreaterThan(0);
        before = k;
      }
      // Draußen mehr Tische mit jeder Terrassen-Stufe
      const out = (t: number) => visibleTables(layout, 50, t).length - 10;
      expect(out(0)).toBe(0);
      expect(out(1)).toBeGreaterThan(0);
      expect(out(2)).toBeGreaterThan(out(1));
      expect(out(3)).toBeGreaterThan(out(2));
      expect(layout.pickup.waiterHomes.length).toBeGreaterThanOrEqual(CROWD.maxWaiters);
    }
    expect(() => getLayout('atlantis')).toThrow();
  });

  it('ist kompakter als 12×12, die Ecke an der Kreuzung bleibt', () => {
    for (const layout of Object.values(LAYOUTS)) {
      const w = layout.gridSize - layout.origin.x;
      const h = layout.gridSize - layout.origin.y;
      expect(w * h).toBeLessThanOrEqual(110);
      expect(layout.gridSize).toBe(12);
    }
  });

  it('die Theke ist ein L: quer gestellte Module, ein Eckmodul, die Kasse quer zur Tür', () => {
    for (const layout of Object.values(LAYOUTS)) {
      const corners = layout.counter.filter((c) => c.corner);
      expect(corners).toHaveLength(1);
      const corner = corners[0];
      if (!corner) continue;
      const at = (x: number, y: number) =>
        layout.counter.find((c) => c.x === x && c.y === y) ??
        layout.stations.find((s) => s.tile.x === x && s.tile.y === y);
      // Langer Schenkel links von der Ecke (Front nach +y), kurzer dahinter (Front nach +x).
      const left = layout.counter.find((c) => c.x === corner.x - 1 && c.y === corner.y);
      const behind = at(corner.x, corner.y - 1);
      expect(left && !left.facesX).toBeTruthy();
      expect(behind && behind.facesX).toBeTruthy();
      const register = layout.stations.find((s) => s.stationId === 'register');
      expect(register?.facesX).toBe(true);
      expect(register?.tile.x).toBe(corner.x);
    }
  });
});

/** Alle Punkte entlang eines Wegs (Abstand ~0,1 Kacheln). */
function samples(path: readonly { x: number; y: number }[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (!a || !b) continue;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.1));
    for (let k = 0; k <= n; k++)
      out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

/** Punkte auf dem Gehweg, an denen Gäste auftauchen bzw. verschwinden (beide Richtungen, mittlere Streuung). */
function sidewalkEnds(layout: CafeLayout): GridPos[] {
  const { curb, axis, spreadMin, spreadMax } = layout.street;
  return [-1, 1].flatMap((side) =>
    [spreadMin, (spreadMin + spreadMax) / 2, spreadMax].map((d) =>
      axis === 'u' ? { x: curb.x + side * d, y: curb.y } : { x: curb.x, y: curb.y + side * d },
    ),
  );
}

/**
 * Wege der Abgänger, Bedienungen und Putzkräfte (ohne die Schlange selbst) aus der Wegsuche, alle Tische sichtbar;
 * `trim`: ohne das Stück nahe Start und Ziel (dort darf man Wartende, Stühle und Hocker streifen).
 */
function servicePaths(layout: CafeLayout, trim = false): GridPos[][] {
  const nav = new CafeNav(layout);
  const access = layout.order.access;
  const ends = sidewalkEnds(layout);
  const out: GridPos[][] = [];
  const add = (role: 'guest' | 'staff', from: GridPos, to: GridPos) => {
    const path = [from, ...nav.path(role, from, to)];
    out.push(trim ? samples(path).filter((p) => !near(p, from) && !near(p, to)) : path);
  };
  const near = (p: GridPos, q: GridPos) => Math.hypot(p.x - q.x, p.y - q.y) < NAV.endRadius;
  for (const [i, spot] of layout.pickup.spots.entries()) {
    add('guest', access, spot);
    add('guest', spot, ends[i % ends.length] ?? access);
    for (const stool of layout.bar.stools) add('guest', spot, stool);
  }
  for (const [i, stool] of layout.bar.stools.entries())
    add('guest', stool, ends[(i + 2) % ends.length] ?? access);
  const home = layout.pickup.waiterHomes[0] ?? access;
  for (const [i, t] of layout.tables.entries()) {
    for (const seat of t.seats) {
      add('guest', access, seat);
      add('guest', seat, ends[i % ends.length] ?? access);
      const serve = nav.standSpot('staff', seat, NAV.serveDist, home, t.side);
      add('staff', home, serve);
      add('staff', serve, home);
    }
    add(
      'guest',
      layout.cleanerHome,
      nav.standSpot('guest', t.tile, NAV.wipeDist, layout.cleanerHome, t.side),
    );
  }
  for (const m of layout.mopSpots) add('guest', layout.cleanerHome, m);
  return out;
}

/** Weg eines neuen Gasts vom Gehweg bis an die Kasse. */
function walkInPaths(layout: CafeLayout): GridPos[][] {
  const nav = new CafeNav(layout);
  const access = layout.order.access;
  return sidewalkEnds(layout).map((s) => [s, ...nav.path('guest', s, access)]);
}

describe('Wege im kompakten Grundriss', () => {
  const layout = getLayout('berlin');

  it('nach der Tür steht man nach wenigen Kacheln in der Schlange, direkt und ohne Haken', () => {
    const e = layout.entrance;
    const nav = new CafeNav(layout);
    const len = pathLength(e, nav.path('guest', e, layout.order.access));
    expect(len).toBeLessThanOrEqual(4);
    // Freie Strecke: gerade Linie statt erst neben die Schlange und dann seitlich hinein.
    const air = Math.hypot(layout.order.access.x - e.x, layout.order.access.y - e.y);
    expect(len).toBeLessThan(air * 1.05);
    // Bestellen → Abholen ist ein kurzer Weg um die Ecke
    const spot = layout.pickup.spots[0];
    if (!spot) throw new Error('no pickup');
    const d = Math.abs(spot.x - layout.order.access.x) + Math.abs(spot.y - layout.order.access.y);
    expect(d).toBeLessThanOrEqual(5);
  });

  it('die Schlange blockiert weder Tür noch die Wege von Abgängern, Bedienungen und Putzkräften', () => {
    const r = CROWD.crowdSpread / 2;
    const blocked = [
      ...layout.order.queue.map((q) => ({ ...q, r: 0.45 })),
      { ...layout.order.crowd, r: r + 0.3 },
    ];
    const e = layout.entrance;
    for (const b of blocked) expect(Math.hypot(b.x - e.x, b.y - e.y)).toBeGreaterThan(1.2);
    for (const path of servicePaths(layout, true))
      for (const p of path)
        for (const b of blocked)
          expect(Math.hypot(p.x - b.x, p.y - b.y), `${String(p.x)},${String(p.y)}`).toBeGreaterThan(
            b.r,
          );
  });

  it('kein Weg führt durch Theke, Geräte oder das Lager', () => {
    const solid = [
      ...layout.counter.map((c) => ({ x: c.x, y: c.y })),
      ...layout.stations.map((s) => s.tile),
      ...layout.storage.pieces.map((p) => p.tile),
    ];
    const inside = (p: { x: number; y: number }) =>
      solid.some((t) => Math.abs(p.x - t.x) < 0.42 && Math.abs(p.y - t.y) < 0.42);
    const crowd = new CustomerCrowd(layout, 'berlin', lcg(21));
    const posts = layout.stations
      .filter((s) => s.tile.y === layout.origin.y || s.facesX)
      .filter((s) => s.stationId !== 'register')
      .map((s) => ({ station: s.stationId, home: s.workSpot }));
    for (const path of servicePaths(layout))
      for (const p of samples(path)) expect(inside(p), `${String(p.x)},${String(p.y)}`).toBe(false);
    for (let t = 0; t < 60 * 60; t++) {
      crowd.update(
        1 / 60,
        input({
          served: 2,
          waiters: 3,
          cleaners: 2,
          tables: 10,
          terrace: 3,
          cleanliness: 40,
          baristas: posts,
          prepSec: 2,
        }),
      );
      for (const a of [...crowd.agents, ...crowd.waiters, ...crowd.cleaners, ...crowd.baristas])
        if (a.active) expect(inside(a), `${String(a.x)},${String(a.y)}`).toBe(false);
    }
  });

  it('Deko, Ambiente und Putzkraft-Startplatz stehen nicht auf Wegen, Tischen oder der Theke', () => {
    // Barhocker sind Sitzplätze (eigener Test), Leuchten hängen über allem.
    const skip = ['deco-pendant', 'deco-pendant-bar', 'deco-chandelier', 'deco-stool'];
    const items = [
      ...layout.decor
        .filter((d) => !d.wall && !d.floor && !skip.includes(d.frame))
        .map((d) => ({ ...d.tile, frame: d.frame })),
      ...layout.ambience.map((a) => ({ ...a.tile, frame: `ambience-${a.id}` })),
    ];
    const paths = [...servicePaths(layout), ...walkInPaths(layout)].map(samples);
    for (const it of items) {
      for (const p of [it]) {
        for (const path of paths)
          for (const q of path)
            expect(Math.hypot(p.x - q.x, p.y - q.y), it.frame).toBeGreaterThan(0.45);
        for (const tb of layout.tables.filter((t) => !t.outside)) {
          for (const s of [tb.tile, tb.side, ...tb.seats])
            expect(Math.hypot(p.x - s.x, p.y - s.y), it.frame).toBeGreaterThan(0.6);
        }
        expect(
          layout.counter.some((c) => Math.abs(c.x - p.x) < 0.5 && Math.abs(c.y - p.y) < 0.5),
        ).toBe(false);
      }
    }
    // Keine zwei Boden-Stücke auf demselben Platz
    for (const [i, a] of items.entries())
      for (const b of items.slice(i + 1))
        expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.frame}/${b.frame}`).toBeGreaterThan(0.9);
    const c = layout.cleanerHome;
    for (const tb of layout.tables)
      expect(Math.hypot(c.x - tb.tile.x, c.y - tb.tile.y)).toBeGreaterThanOrEqual(1);
  });

  it('Barhocker stehen vor der Theke, je einer als Deko, abseits aller anderen Wege', () => {
    const { stools } = layout.bar;
    expect(stools.length).toBeGreaterThanOrEqual(3);
    const decor = layout.decor.filter((d) => d.frame === 'deco-stool');
    expect(decor.map((d) => d.tile)).toEqual(stools);
    expect(decor.every((d) => d.minLevel === 0)).toBe(true);
    const counterY = Math.max(...layout.counter.filter((c) => !c.facesX).map((c) => c.y));
    // Wege, die nicht an einem Hocker beginnen oder enden, ohne ihre Enden (Abholplatz, Tisch).
    const others = [...walkInPaths(layout).map(samples), ...servicePaths(layout, true)];
    for (const [i, st] of stools.entries()) {
      // Direkt vor einem Thekenmodul (Blick zur Theke), nicht vor dem Durchgang der Bedienungen.
      expect(layout.counter.some((c) => Math.abs(c.x - st.x) < 0.5 && c.y === counterY)).toBe(true);
      expect(st.y - counterY).toBeGreaterThan(0.5);
      expect(st.y - counterY).toBeLessThan(1);
      for (const other of stools.slice(i + 1))
        expect(Math.hypot(other.x - st.x, other.y - st.y)).toBeGreaterThan(0.8);
      for (const path of others)
        for (const q of path)
          expect(
            Math.hypot(q.x - st.x, q.y - st.y),
            `${String(q.x)},${String(q.y)}`,
          ).toBeGreaterThan(0.45);
      for (const tb of layout.tables)
        for (const s of [tb.tile, tb.side, ...tb.seats])
          expect(Math.hypot(st.x - s.x, st.y - s.y)).toBeGreaterThan(1);
    }
    // Hin zum Hocker und von dort hinaus auf den Gehweg.
    const nav = new CafeNav(layout);
    const spot = layout.pickup.spots[0];
    const first = stools[0];
    const end = sidewalkEnds(layout)[0];
    if (!spot || !first || !end) throw new Error('no spot');
    expect(nav.path('guest', spot, first).at(-1)).toEqual(first);
    expect(nav.path('guest', first, end).at(-1)).toEqual(end);
  });

  it('das Lager liegt hinter dem Personal-Gang und wächst mit den Geräten', () => {
    const corner = layout.counter.find((c) => c.corner);
    if (!corner) throw new Error('no corner');
    for (const p of [...layout.storage.pieces.map((x) => x.tile), layout.storage.fetchSpot]) {
      expect(p.x).toBeLessThan(corner.x);
      expect(p.y).toBeLessThan(corner.y);
    }
    const tiers = layout.storage.pieces.map((p) => p.minTier);
    expect(Math.min(...tiers)).toBe(1);
    expect(Math.max(...tiers)).toBe(3);
    // Jedes Bild, das die Szene je Stufe anfordern kann, liegt im Möbel-Atlas (sonst warnt Phaser).
    const furniture = JSON.parse(readFileSync('public/assets/sprites/furniture.json', 'utf8')) as {
      frames: Record<string, unknown>;
    };
    for (const p of layout.storage.pieces)
      for (let tier = Math.max(1, p.minTier); tier <= 3; tier++) {
        const frame = FRAME.storage(p.piece, tier as StorageTier, p.facesX);
        expect(furniture.frames[frame], frame).toBeDefined();
      }
    for (const id of Object.values(SUPPLY_ITEMS))
      expect(furniture.frames[FRAME.supply(id)], id).toBeDefined();
    expect(storageLookTier(1)).toBe(1);
    expect(storageLookTier(3)).toBe(2);
    expect(storageLookTier(7)).toBe(3);
    for (let d = 1; d <= 7; d++)
      expect(storageLookTier(d)).toBeGreaterThanOrEqual(storageLookTier(d - 1));
  });
});

describe('Kundentypen', () => {
  it('Anteile sind normiert und verschieben sich je Standort', () => {
    const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
    const berlin = customerTypeShares('berlin');
    expect(sum(berlin)).toBeCloseTo(1, 9);
    expect(berlin.student).toBeCloseTo(0.4, 9);
    const kyoto = customerTypeShares('kyoto');
    expect(sum(kyoto)).toBeCloseTo(1, 9);
    expect(kyoto.tourist).toBeGreaterThan(berlin.tourist);
    expect(customerTypeShares('tokyo').influencer).toBeGreaterThan(berlin.influencer);
  });
  it('Ziehen folgt den Anteilen', () => {
    const shares = customerTypeShares('berlin');
    expect(pickCustomerType(shares, 0)).toBe('student');
    expect(pickCustomerType(shares, 0.39)).toBe('student');
    expect(pickCustomerType(shares, 0.41)).toBe('tourist');
    expect(pickCustomerType(shares, 0.999999)).toBe('critic');
    expect(pickCustomerType(shares, 1)).toBe(CUSTOMER_TYPES[CUSTOMER_TYPES.length - 1]?.id);
  });
});

describe('Gäste, Bedienungen und Putzkräfte (kosmetisch)', () => {
  it('jede Figur trägt eine Variante ihres Typs, gemischt über die Varianten', () => {
    expect(pickLook('student', 0)).toBe(CUSTOMER_LOOKS.student[0]);
    expect(pickLook('student', 0.999999)).toBe(CUSTOMER_LOOKS.student.at(-1));
    expect(pickLook('critic', 1)).toBe(CUSTOMER_LOOKS.critic.at(-1));
    expect(pickLook('critic', -1)).toBe(CUSTOMER_LOOKS.critic[0]);
    const crowd = new CustomerCrowd(getLayout('berlin'), 'berlin', lcg(5));
    run(crowd, input({ served: 3 }), 20);
    const seen = new Set<string>();
    for (const a of crowd.agents) {
      if (!a.active) continue;
      expect(CUSTOMER_LOOKS[a.type]).toContain(a.look);
      seen.add(a.look);
    }
    expect(seen.size).toBeGreaterThan(3);
  });
  it('bei 1 Gast/s stellen sich Gäste an, werden bedient und gehen wieder', () => {
    const crowd = new CustomerCrowd(getLayout('berlin'), 'berlin', lcg());
    const purchases = run(crowd, input(), 40);
    expect(crowd.activeCount).toBeGreaterThan(0);
    expect(crowd.activeCount).toBeLessThan(CROWD.maxAgents);
    // Bestellen, hinsetzen, bedient werden dauert; nach 40 s ist ein guter Teil durch.
    expect(purchases).toBeGreaterThanOrEqual(10);
    expect(crowd.hiddenCount).toBe(0);
    // Sitzgäste und Abholer kommen beide vor.
    const phases = new Set(crowd.agents.filter((a) => a.active).map((a) => a.phase));
    expect(phases.size).toBeGreaterThan(1);
    expect(crowd.agents.some((a) => a.active && a.table >= 0)).toBe(true);
  });
  it('Bedienungen laufen zu Tischen; ohne sichtbare Bedienung holen Gäste über die Theke ab', () => {
    const layout = getLayout('berlin');
    const withWaiter = new CustomerCrowd(layout, 'berlin', lcg(5));
    run(withWaiter, input({ waiters: 1 }), 30);
    expect(withWaiter.waiters.filter((w) => w.active)).toHaveLength(1);
    expect(withWaiter.waiters.some((w) => w.phase !== 'idle')).toBe(true);
    const none = new CustomerCrowd(layout, 'berlin', lcg(5));
    const purchases = run(none, input({ waiters: 0 }), 60);
    expect(none.waiters.every((w) => !w.active)).toBe(true);
    expect(purchases).toBeGreaterThan(0);
    // Höchstens `maxWaiters` Figuren, egal wie viele eingestellt sind.
    const many = new CustomerCrowd(layout, 'berlin', lcg(5));
    run(many, input({ waiters: 20 }), 5);
    expect(many.waiters.filter((w) => w.active)).toHaveLength(CROWD.maxWaiters);
  });
  it('bei 100/s bleibt die Schlange aufgeräumt, der Rest steht auf der Tafel bzw. als +N', () => {
    const crowd = new CustomerCrowd(getLayout('berlin'), 'berlin', lcg(7));
    for (let t = 0; t < 20 * 60; t++) {
      crowd.update(1 / 60, input({ served: 100, orderCap: 120, waiters: 3, tables: 12 }));
      const queued = crowd.agents.filter(
        (a) => a.active && (a.phase === 'queue' || a.phase === 'order'),
      );
      expect(queued.length).toBeLessThanOrEqual(CROWD.maxQueueFigures);
      expect(crowd.activeCount).toBeLessThanOrEqual(CROWD.maxAgents);
    }
    expect(crowd.waitingCount).toBeGreaterThan(CROWD.maxQueueFigures);
    expect(crowd.hiddenCount).toBeGreaterThan(0);
  });
  it('Wartende auf der Tafel kommen nach, sobald die Schlange Platz hat', () => {
    const crowd = new CustomerCrowd(getLayout('berlin'), 'berlin', lcg(8));
    run(crowd, input({ served: 20, orderCap: 1 }), 10);
    expect(crowd.waitingCount).toBeGreaterThan(CROWD.maxQueueFigures);
    run(crowd, input({ served: 0.0001, orderCap: 3 }), 120);
    expect(crowd.waitingCount).toBe(0);
  });
  it('ohne Rate kommt niemand', () => {
    const crowd = new CustomerCrowd(getLayout('berlin'), 'berlin', lcg());
    expect(run(crowd, input({ served: 0 }), 10)).toBe(0);
    expect(crowd.activeCount).toBe(0);
  });
  it('Agenten verlassen das Café wieder, wenn die Rate wegfällt', () => {
    const crowd = new CustomerCrowd(getLayout('berlin'), 'berlin', lcg(3));
    run(crowd, input({ served: 2 }), 10);
    expect(crowd.activeCount).toBeGreaterThan(0);
    run(crowd, input({ served: 0.0001 }), 120);
    expect(crowd.activeCount).toBe(0);
    expect(crowd.waitingCount).toBe(0);
    expect(crowd.awaitingServiceCount).toBe(0);
  });
  it('dreckige Tische folgen der Sauberkeit und werden von Putzkräften gewischt', () => {
    const crowd = new CustomerCrowd(getLayout('berlin'), 'berlin', lcg(9));
    run(crowd, input({ tables: 12, cleanliness: 0, cleaners: 0 }), 60);
    expect(crowd.dirty.size).toBeGreaterThan(0);
    expect(crowd.cleaners.every((c) => !c.active)).toBe(true);
    const before = crowd.dirty.size;
    run(crowd, input({ tables: 12, cleanliness: 100, cleaners: 2 }), 60);
    expect(crowd.dirty.size).toBeLessThan(before);
    expect(crowd.cleaners.filter((c) => c.active)).toHaveLength(2);
  });
  it('Baristas bereiten zu, bringen den Becher zur Ausgabe, holen Nachschub und bleiben hinter der Theke', () => {
    const layout = getLayout('berlin');
    const crowd = new CustomerCrowd(layout, 'berlin', lcg(12));
    const corner = layout.counter.find((c) => c.corner);
    if (!corner) throw new Error('no corner');
    const posts = ['matchaStation', 'coffeeMachine', 'oven'].map((id) => {
      const p = layout.stations.find((x) => x.stationId === id);
      if (!p) throw new Error(id);
      return { station: id, home: p.workSpot };
    });
    const phases = new Set<string>();
    let maxItems = 0;
    for (let t = 0; t < 60 * 60; t++) {
      crowd.update(1 / 60, input({ served: 1, waiters: 0, baristas: posts, prepSec: 2 }));
      for (const b of crowd.baristas.filter((x) => x.active)) {
        phases.add(b.phase);
        // Nie vor die Theke: Arbeitsplatz, Ausgabe und Lager liegen im Personal-Bereich hinter der Theke.
        expect(b.y).toBeLessThan(corner.y - 0.5);
        expect(b.y).toBeGreaterThan(layout.origin.y + 0.5);
        expect(b.x).toBeLessThan(corner.x - 0.5);
        expect(b.x).toBeGreaterThan(layout.origin.x + 0.5);
        if (b.phase === 'work') expect(b.workTotal).toBeGreaterThanOrEqual(CROWD.minPrepSec);
      }
      maxItems = Math.max(maxItems, crowd.passItems.length);
    }
    expect(crowd.baristas.filter((b) => b.active)).toHaveLength(3);
    for (const p of ['work', 'toPass', 'drop', 'back', 'toStore', 'fetch', 'fromStore'])
      expect(phases).toContain(p);
    // Ohne Bedienung stapelt sich höchstens `passItemsMax` auf der Ausgabe.
    expect(maxItems).toBe(CROWD.passItemsMax);
    // Bedienungen nehmen je Auftrag einen Teller mit.
    run(crowd, input({ served: 1, waiters: 3, baristas: posts, prepSec: 30 }), 30);
    expect(crowd.passItems.length).toBeLessThan(CROWD.passItemsMax);
    // Ohne Gäste stehen Baristas an ihrem Gerät.
    run(crowd, input({ served: 0, baristas: posts, prepSec: 0 }), 10);
    for (const b of crowd.baristas.filter((x) => x.active)) {
      expect(b.phase).toBe('idle');
      expect(b.x).toBeCloseTo(b.home.x);
    }
  });
  it('Kassieren meldet jede fertige Bestellung', () => {
    const crowd = new CustomerCrowd(getLayout('berlin'), 'berlin', lcg(13));
    let orders = 0;
    for (let t = 0; t < 20 * 60; t++) orders += crowd.update(1 / 60, input()).orders.length;
    expect(orders).toBeGreaterThan(5);
  });
  it('ohne dreckige Tische wischen Putzkräfte den Boden an freien Stellen', () => {
    const layout = getLayout('berlin');
    const crowd = new CustomerCrowd(layout, 'berlin', lcg(14));
    const seen = new Set<string>();
    for (let t = 0; t < 40 * 60; t++) {
      crowd.update(1 / 60, input({ served: 0, cleaners: 2, cleanliness: 100 }));
      for (const c of crowd.cleaners) seen.add(c.phase);
    }
    expect(seen).toContain('mop');
    for (const p of layout.mopSpots) {
      expect(inRoom(layout, Math.floor(p.x), Math.floor(p.y))).toBe(true);
      for (const t of layout.tables)
        expect(Math.hypot(t.tile.x - p.x, t.tile.y - p.y)).toBeGreaterThan(0.9);
    }
  });
  it('Abholer setzen sich mit ihrem Getränk auf freie Barhocker, nie zwei auf einen', () => {
    const layout = getLayout('berlin');
    const crowd = new CustomerCrowd(layout, 'berlin', lcg(17));
    let seatedMax = 0;
    for (let t = 0; t < 90 * 60; t++) {
      // Ohne Tische holen alle ab; die Hocker sind dann die einzigen Sitzplätze.
      crowd.update(1 / 60, input({ served: 0.8, tables: 0, waiters: 2 }));
      const seated = crowd.agents.filter((a) => a.active && a.phase === 'consume' && a.stool >= 0);
      const stools = seated.map((a) => a.stool);
      expect(new Set(stools).size).toBe(stools.length);
      for (const a of seated) {
        const st = layout.bar.stools[a.stool];
        expect(a.x).toBeCloseTo(st?.x ?? NaN, 6);
        expect(a.y).toBeCloseTo(st?.y ?? NaN, 6);
        expect(a.table).toBe(-1);
      }
      seatedMax = Math.max(seatedMax, seated.length);
    }
    expect(seatedMax).toBe(layout.bar.stools.length);
    // Wer ausgetrunken hat, geht wieder; ohne neue Gäste sind die Hocker irgendwann frei.
    run(crowd, input({ served: 0, tables: 0 }), 60);
    expect(crowd.agents.some((a) => a.active)).toBe(false);
    expect(crowd.agents.every((a) => a.stool === -1)).toBe(true);
  });
  it('ungültige Zeitschritte bewegen nichts', () => {
    const crowd = new CustomerCrowd(getLayout('berlin'), 'berlin', lcg());
    expect(crowd.update(Number.NaN, input({ served: 5 })).spawned).toBe(0);
    expect(crowd.update(-1, input({ served: 5 })).spawned).toBe(0);
  });
  it('Bestellzeit folgt der Kapazität der Bestelltheke, begrenzt', () => {
    expect(serveDuration(1)).toBe(1);
    expect(serveDuration(1000)).toBe(CROWD.minServeSec);
    expect(serveDuration(0)).toBe(CROWD.maxServeSec);
  });
});

describe('Natürliche Laufwege', () => {
  const layout = getLayout('berlin');
  const posts = layout.stations
    .filter((s) => s.stationId !== 'register' && s.stationId !== 'servingStation')
    .slice(0, 4)
    .map((s) => ({ station: s.stationId, home: s.workSpot }));
  const busy = input({
    served: 0.7,
    orderCap: 3,
    waiters: 3,
    cleaners: 2,
    tables: 10,
    terrace: 3,
    cleanliness: 30,
    baristas: posts,
    prepSec: 4,
  });

  it('Wege sind rund und stetig: kaum harte Knicke, niemand springt', () => {
    const crowd = new CustomerCrowd(layout, 'berlin', lcg(41));
    type Fig = { active: boolean; x: number; y: number };
    const groups = [
      ['guest', crowd.agents, CROWD.walkTilesPerSec * (1 + CROWD.paceSpread)],
      ['waiter', crowd.waiters, CROWD.staffTilesPerSec],
      ['cleaner', crowd.cleaners, CROWD.staffTilesPerSec],
      ['barista', crowd.baristas, CROWD.staffTilesPerSec],
    ] as const;
    const last = new Map<Fig, { x: number; y: number; hx: number; hy: number }>();
    const walked: Record<string, number> = {};
    const sharp: Record<string, number> = {};
    for (let f = 0; f < 120 * 60; f++) {
      crowd.update(1 / 60, busy);
      for (const [role, list, speed] of groups)
        for (const a of list as readonly Fig[]) {
          const s = last.get(a);
          if (!a.active) {
            last.delete(a);
            continue;
          }
          if (!s) {
            last.set(a, { x: a.x, y: a.y, hx: 0, hy: 0 });
            continue;
          }
          const dx = a.x - s.x;
          const dy = a.y - s.y;
          const d = Math.hypot(dx, dy);
          // Höchstens ein Schritt je Bild: kein Sprung, wenn sich ein Ziel unterwegs ändert.
          if (d > (speed / 60) * 1.001 + 1e-9) expect(d, role).toBeLessThanOrEqual(speed / 60);
          if (d > 1e-4) {
            walked[role] = (walked[role] ?? 0) + d;
            const h = Math.hypot(s.hx, s.hy);
            if (h > 1e-4 && (dx * s.hx + dy * s.hy) / (d * h) < Math.SQRT1_2)
              sharp[role] = (sharp[role] ?? 0) + 1;
            s.hx = dx;
            s.hy = dy;
          } else {
            s.hx = 0;
            s.hy = 0;
          }
          s.x = a.x;
          s.y = a.y;
        }
    }
    // Vorher (feste Wegpunkte, rechte Winkel): 22–29 Knicke über 45° je 100 Kacheln.
    for (const [role] of groups) {
      const tiles = walked[role] ?? 0;
      expect(tiles, role).toBeGreaterThan(50);
      expect(((sharp[role] ?? 0) / tiles) * 100, role).toBeLessThan(role === 'guest' ? 2.5 : 1);
    }
  });

  it('Putzkräfte gehen von Tisch zu Tisch, ohne Umweg über den Startplatz', () => {
    const crowd = new CustomerCrowd(layout, 'berlin', lcg(42));
    const c = crowd.cleaners[0];
    if (!c) throw new Error('no cleaner');
    let trip: { from: GridPos; walked: number } | null = null;
    let prev = { x: 0, y: 0, phase: c.phase as string };
    let hops = 0;
    let chained = 0;
    for (let f = 0; f < 120 * 60; f++) {
      // Viel Schmutz: oft wartet schon der nächste Tisch. Deko wie mitten im Spiel.
      const waiting = [...crowd.dirty].some((t) => t !== c.table);
      crowd.update(
        1 / 60,
        input({
          served: 1,
          tables: 10,
          cleaners: 1,
          cleanliness: 0,
          ambience: { decor: 12, music: 1, wifi: 1 },
        }),
      );
      if (!c.active) continue;
      const step = Math.hypot(c.x - prev.x, c.y - prev.y);
      if (c.phase === 'toTable') {
        trip =
          trip && prev.phase === 'toTable' ? trip : { from: { x: prev.x, y: prev.y }, walked: 0 };
        trip.walked += step;
      }
      if (prev.phase === 'toTable' && c.phase === 'wipe' && trip) {
        // Der Weg zum Tisch beginnt dort, wo sie gerade ist, und ist kaum länger als die Luftlinie
        // (vorher: zurück auf die Laufzeile bis zum Startpunkt, dann erst hin).
        const air = Math.hypot(c.x - trip.from.x, c.y - trip.from.y);
        expect(trip.walked).toBeLessThan(air * 1.3 + 0.6);
        hops++;
        trip = null;
      }
      // Wartet beim Fertigwischen schon ein Tisch, geht es ohne Pause dorthin.
      if (prev.phase === 'wipe' && c.phase !== 'wipe' && waiting) {
        expect(c.phase).toBe('toTable');
        chained++;
      }
      prev = { x: c.x, y: c.y, phase: c.phase };
    }
    expect(hops).toBeGreaterThan(5);
    expect(chained).toBeGreaterThan(0);
  });

  it('niemand läuft durch Tische; Gäste und Putzkräfte bleiben vor der Theke; Bedienungen treten neben den Gast', () => {
    const crowd = new CustomerCrowd(layout, 'berlin', lcg(43));
    const shown = visibleTables(layout, busy.tables, busy.terrace);
    const { from, to } = layout.staffArea;
    const behind = (p: GridPos) =>
      Math.round(p.x) >= from.x &&
      Math.round(p.x) <= to.x &&
      Math.round(p.y) >= from.y &&
      Math.round(p.y) <= to.y;
    let served = 0;
    for (let f = 0; f < 90 * 60; f++) {
      crowd.update(1 / 60, busy);
      // `expect` nur bei Verstoß: sonst kostet die Prüfung je Figur und Bild mehr als die Simulation.
      for (const a of [...crowd.agents, ...crowd.waiters, ...crowd.cleaners]) {
        if (!a.active) continue;
        for (const t of shown) {
          const d = Math.hypot(a.x - t.tile.x, a.y - t.tile.y);
          if (d <= NAV.tableR + NAV.body - 1e-6) expect(d).toBeGreaterThan(NAV.tableR + NAV.body);
        }
      }
      for (const a of [...crowd.agents, ...crowd.cleaners])
        if (a.active && behind(a)) expect(behind(a), `${String(a.x)},${String(a.y)}`).toBe(false);
      for (const w of crowd.waiters) {
        if (!w.active || w.phase !== 'serve' || w.target < 0) continue;
        const g = crowd.agents[w.target];
        if (!g || g.table < 0) continue;
        expect(Math.hypot(w.x - g.x, w.y - g.y)).toBeLessThan(NAV.serveDist + 0.3);
        served++;
      }
    }
    expect(served).toBeGreaterThan(0);
  });

  it('Gäste blenden auf dem Gehweg ein und am Ende ihres Wegs aus', () => {
    const crowd = new CustomerCrowd(layout, 'berlin', lcg(44));
    let fadedOut = 0;
    const seen = new Map<number, number>();
    for (let f = 0; f < 60 * 60; f++) {
      crowd.update(1 / 60, input({ served: 0.8 }));
      for (const a of crowd.agents) {
        if (!a.active) {
          const lastFade = seen.get(a.id);
          if (lastFade !== undefined && lastFade < 0.2) fadedOut++;
          seen.delete(a.id);
          continue;
        }
        // Drinnen immer ganz sichtbar.
        if (inRoom(layout, Math.round(a.x), Math.round(a.y))) expect(a.fade).toBe(1);
        seen.set(a.id, a.fade);
      }
    }
    expect(fadedOut).toBeGreaterThan(5);
  });
});

/** Kasse wie in `core` (`settleTill`): Fortschritt je Gast, ganze Gäste zahlen. */
function tillDriver(served: number) {
  let progress = 0;
  return (dt: number) => {
    progress += served * dt;
    const payments = Math.floor(progress);
    progress -= payments;
    return { payments, progress };
  };
}

describe('Kasse: Gäste bezahlen, wenn core die Zahlung bucht', () => {
  const layout = getLayout('berlin');
  it('niemand ist vor seiner Zahlung fertig; bei fast jeder Zahlung steht jemand an der Kasse', () => {
    for (const served of [0.12, 0.5, CROWD.maxVisiblePayPerSec]) {
      const crowd = new CustomerCrowd(layout, 'berlin', lcg(31));
      const till = tillDriver(served);
      let payments = 0;
      let paid = 0;
      for (let t = 0; t < 180 * 60; t++) {
        const inp = till(1 / 60);
        const r = crowd.update(1 / 60, input({ served, orderCap: 3, till: inp }));
        expect(r.payments).toBe(inp.payments);
        // Fertig bestellt wird nur in einem Schritt mit Zahlung, höchstens ein Gast je Zahlung.
        expect(r.orders.length).toBeLessThanOrEqual(inp.payments);
        if (t > 15 * 60) {
          payments += inp.payments;
          paid += r.orders.length;
        }
      }
      expect(payments).toBeGreaterThan(served * 150);
      expect(paid / payments, `served ${String(served)}`).toBeGreaterThanOrEqual(0.95);
    }
  });
  it('wer an der Kasse steht, wartet mit Ring auf die Zahlung', () => {
    const crowd = new CustomerCrowd(layout, 'berlin', lcg(32));
    // Szenenstart: Wer zur ersten Zahlung gebraucht wird, steht schon an der Kasse.
    crowd.update(1 / 60, input({ served: 0.25, till: { payments: 0, progress: 0.5 } }));
    const head = crowd.agents.find((a) => a.active);
    if (!head) throw new Error('no head');
    expect(head.phase).toBe('order');
    expect(head.x).toBe(layout.order.access.x);
    expect(head.y).toBe(layout.order.access.y);
    let progress = 0.5;
    for (let t = 0; t < 60; t++) {
      progress += 0.25 / 60;
      crowd.update(1 / 60, input({ served: 0.25, till: { payments: 0, progress } }));
    }
    expect(head.phase).toBe('order');
    expect(head.serveTotal).toBeGreaterThan(0);
    // Restzeit bis zur Zahlung = (1 − Fortschritt) / Gäste je Sekunde.
    expect(head.timer).toBeCloseTo((1 - progress) / 0.25, 6);
    crowd.update(1 / 60, input({ served: 0.25, till: { payments: 1, progress: 0 } }));
    expect(head.phase).not.toBe('order');
    expect(crowd.queueIndex(head)).toBe(-1);
  });
  it('bei sehr vielen Gästen bleibt die Theke aufgeräumt, gezahlt wird auch ohne Figur', () => {
    const crowd = new CustomerCrowd(layout, 'berlin', lcg(34));
    const till = tillDriver(100);
    let payments = 0;
    let paid = 0;
    for (let t = 0; t < 30 * 60; t++) {
      const inp = till(1 / 60);
      const r = crowd.update(1 / 60, input({ served: 100, orderCap: 120, tables: 12, till: inp }));
      payments += r.payments;
      paid += r.orders.length;
      const standing = crowd.agents.filter(
        (a) => a.active && (a.phase === 'queue' || a.phase === 'order'),
      );
      expect(standing.length).toBeLessThanOrEqual(CROWD.maxQueueFigures);
      expect(crowd.activeCount).toBeLessThanOrEqual(CROWD.maxAgents);
    }
    expect(payments).toBeGreaterThanOrEqual(2999);
    expect(paid).toBeGreaterThan(20);
    expect(paid).toBeLessThan(payments);
  });
  it('ohne Zahlung geht nach dem Sicherheitsventil trotzdem niemand verloren', () => {
    const crowd = new CustomerCrowd(layout, 'berlin', lcg(33));
    let orders = 0;
    for (let t = 0; t < (CROWD.maxPayWaitSec + 20) * 60; t++)
      orders += crowd.update(1 / 60, input({ served: 0.3, till: { payments: 0, progress: 0.9 } }))
        .orders.length;
    expect(orders).toBeGreaterThan(0);
  });
  it('der Vorlauf deckt den Weg vom Gehweg bis an die Kasse', () => {
    const sec = walkInSec(layout);
    expect(sec).toBeGreaterThan(2);
    expect(sec).toBeLessThan(8);
  });
});

describe('Kein Ruckeln bei vielen Gästen', () => {
  const layout = getLayout('berlin');
  it('rückt die Schlange auf, planen höchstens replansPerFrame Hereinkommende je Frame neu', () => {
    const crowd = new CustomerCrowd(layout, 'berlin', lcg(41));
    const served = CROWD.maxVisiblePayPerSec * 3;
    const till = tillDriver(served);
    let most = 0;
    let replans = 0;
    for (let t = 0; t < 90 * 60; t++) {
      const before = new Map(
        crowd.agents
          .filter((a) => a.active && a.phase === 'walkIn')
          .map((a) => [a, { ...a.goal }] as const),
      );
      crowd.update(1 / 60, input({ served, orderCap: 6, tables: 12, till: till(1 / 60) }));
      // Neues Ziel unterwegs = neu geplanter Weg (`spawn` setzt das erste Ziel, die zählen hier nicht).
      let n = 0;
      for (const [a, goal] of before) if (a.goal.x !== goal.x || a.goal.y !== goal.y) n++;
      most = Math.max(most, n);
      replans += n;
    }
    expect(replans).toBeGreaterThan(20);
    expect(most).toBeLessThanOrEqual(CROWD.replansPerFrame);
  });

  it('wer an der Kasse gebraucht wird, steht beim Szenenstart ohne berechneten Weg an', () => {
    const calls: GridPos[] = [];
    const nav = CafeNav.prototype.path;
    CafeNav.prototype.path = function (this: CafeNav, ...a: Parameters<typeof nav>) {
      calls.push(a[1]);
      return nav.apply(this, a);
    };
    try {
      const crowd = new CustomerCrowd(layout, 'berlin', lcg(42));
      calls.length = 0;
      crowd.update(1 / 60, input({ served: 1, till: { payments: 0, progress: 0.9 } }));
      const queued = crowd.agents.filter((a) => a.active && a.phase !== 'walkIn');
      expect(queued.length).toBeGreaterThan(0);
      // Wer schon ansteht, hat keinen Weg vom Gehweg berechnet bekommen.
      for (const a of queued) expect(a.path).toEqual([]);
      expect(calls.length).toBeLessThanOrEqual(crowd.activeCount - queued.length);
    } finally {
      CafeNav.prototype.path = nav;
    }
  });
});

describe('Szene beeinflusst keine Einnahmen', () => {
  function busyState(): GameState {
    const s = createInitialState(0);
    const loc = getLocation(s, 'berlin');
    return {
      ...s,
      locations: {
        berlin: {
          ...loc,
          level: 3,
          ambience: { seats: 5 },
          staff: { cashier: 2, barista: 3, waiter: 2, cleaner: 1 },
          stations: {
            ...loc.stations,
            matchaStation: { level: 30, unlocked: true },
            register: { level: 10, unlocked: true },
            coffeeMachine: { level: 5, unlocked: true },
          },
        },
      },
    };
  }
  it('mit und ohne Figuren sind die Zustände identisch', () => {
    const withScene = createStore(busyState());
    const without = createStore(busyState());
    const crowd = new CustomerCrowd(getLayout('berlin'), 'berlin', lcg(11));
    let visiblePurchases = 0;
    let lastPaid = 0;
    for (let f = 0; f < 60 * 60; f++) {
      withScene.advance(1000 / 60);
      const s = withScene.getState();
      const loc = getLocation(s, 'berlin');
      const rates = computeLocationRates(s, 'berlin');
      const paid = loc.till.paid;
      const payments = paid - lastPaid;
      lastPaid = paid;
      visiblePurchases += crowd.update(1 / 60, {
        served: rates.served,
        orderCap: rates.stages.order,
        waiters: loc.staff['waiter'] ?? 0,
        cleaners: loc.staff['cleaner'] ?? 0,
        tables: loc.ambience['seats'] ?? 0,
        cleanliness: loc.cleanliness,
        till: { payments, progress: loc.till.progress },
      }).purchases.length;
      without.advance(1000 / 60);
    }
    expect(visiblePurchases).toBeGreaterThan(0);
    expect(serialize(withScene.getState())).toBe(serialize(without.getState()));
    expect(getLocation(withScene.getState(), 'berlin').coins.gt(0)).toBe(true);
  });
});
