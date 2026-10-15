import { describe, expect, it } from 'vitest';
import { CROWD, getLayout, inRoom, LAYOUTS, visibleTables } from '@data/layouts';
import { STATIONS } from '@data/stations';
import { CUSTOMER_TYPES } from '@data/customerTypes';
import { createInitialState, getLocation, type GameState } from '@core/GameState';
import { computeLocationRates, customerTypeShares, pickCustomerType } from '@core/customers';
import { createStore } from '@core/store';
import { serialize } from '@core/save';
import { CustomerCrowd, pickLook, serveDuration, type CrowdInput } from '@scenes/agents/crowd';
import { CUSTOMER_LOOKS } from '@data/art';

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
      const inGrid = (p: { x: number; y: number }) =>
        p.x >= 0 && p.y >= 0 && p.x < layout.gridSize && p.y < layout.gridSize;
      for (const s of layout.stations) expect(inGrid(s.tile) && inGrid(s.workSpot)).toBe(true);
      expect(inRoom(layout, 0, 12)).toBe(true);
      expect(inRoom(layout, 8, 12)).toBe(false);
      for (const c of layout.counter) expect(inGrid(c)).toBe(true);
      for (const w of layout.order.path) expect(inGrid(w)).toBe(true);
      expect(Math.abs(layout.order.queueDir.x) + Math.abs(layout.order.queueDir.y)).toBe(1);
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
        expect(tb.tile.y).toBeGreaterThan(layout.walkRows.top);
        // Gastraum-Tische zwischen den Laufzeilen, Wintergarten-Tische davor
        const annex = tb.tile.y >= layout.annex.from.y - 0.5;
        if (!annex) expect(tb.tile.y).toBeLessThan(layout.walkRows.bottom);
      }
      expect(layout.tables.filter((t) => !t.outside)).toHaveLength(14);
      expect(visibleTables(layout, 0)).toHaveLength(0);
      expect(visibleTables(layout, 3)).toHaveLength(3);
      expect(visibleTables(layout, 50)).toHaveLength(14);
      // Draußen mehr Tische mit jeder Terrassen-Stufe
      const out = (t: number) => visibleTables(layout, 50, t).length - 14;
      expect(out(0)).toBe(0);
      expect(out(1)).toBeGreaterThan(0);
      expect(out(2)).toBeGreaterThan(out(1));
      expect(out(3)).toBeGreaterThan(out(2));
      expect(layout.pickup.waiterHomes.length).toBeGreaterThanOrEqual(CROWD.maxWaiters);
    }
    expect(() => getLayout('atlantis')).toThrow();
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
  it('Baristas bereiten zu, bringen den Becher zur Ausgabe und bleiben im Personal-Gang', () => {
    const layout = getLayout('berlin');
    const crowd = new CustomerCrowd(layout, 'berlin', lcg(12));
    const posts = ['matchaStation', 'coffeeMachine', 'oven'].map((id) => {
      const p = layout.stations.find((x) => x.stationId === id);
      if (!p) throw new Error(id);
      return { station: id, home: p.workSpot };
    });
    const phases = new Set<string>();
    let maxItems = 0;
    for (let t = 0; t < 40 * 60; t++) {
      crowd.update(1 / 60, input({ served: 1, waiters: 0, baristas: posts, prepSec: 2 }));
      for (const b of crowd.baristas.filter((x) => x.active)) {
        phases.add(b.phase);
        // Nie vor die Theke: Arbeitsplatz und Ausgabe liegen im Gang hinter der Theke.
        expect(b.y).toBeLessThan(2);
        expect(b.y).toBeGreaterThan(0.5);
        if (b.phase === 'work') expect(b.workTotal).toBeGreaterThanOrEqual(CROWD.minPrepSec);
      }
      maxItems = Math.max(maxItems, crowd.passItems.length);
    }
    expect(crowd.baristas.filter((b) => b.active)).toHaveLength(3);
    for (const p of ['work', 'toPass', 'drop', 'back']) expect(phases).toContain(p);
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
    for (let f = 0; f < 60 * 60; f++) {
      withScene.advance(1000 / 60);
      const s = withScene.getState();
      const loc = getLocation(s, 'berlin');
      const rates = computeLocationRates(s, 'berlin');
      visiblePurchases += crowd.update(1 / 60, {
        served: rates.served,
        orderCap: rates.stages.order,
        waiters: loc.staff['waiter'] ?? 0,
        cleaners: loc.staff['cleaner'] ?? 0,
        tables: loc.ambience['seats'] ?? 0,
        cleanliness: loc.cleanliness,
      }).purchases.length;
      without.advance(1000 / 60);
    }
    expect(visiblePurchases).toBeGreaterThan(0);
    expect(serialize(withScene.getState())).toBe(serialize(without.getState()));
    expect(getLocation(withScene.getState(), 'berlin').coins.gt(0)).toBe(true);
  });
});
