import { describe, expect, it } from 'vitest';
import { CROWD, getLayout, LAYOUTS } from '@data/layouts';
import { STATIONS } from '@data/stations';
import { CUSTOMER_TYPES } from '@data/customerTypes';
import { createInitialState, getLocation, type GameState } from '@core/GameState';
import { computeLocationRates, customerTypeShares, pickCustomerType } from '@core/customers';
import { createStore } from '@core/store';
import { serialize } from '@core/save';
import { CustomerCrowd, serveDuration } from '@scenes/agents/crowd';

/** Deterministischer Zufall für reproduzierbare Tests. */
function lcg(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function run(crowd: CustomerCrowd, perStation: Record<string, number>, seconds: number) {
  let purchases = 0;
  for (let t = 0; t < seconds * 60; t++)
    purchases += crowd.update(1 / 60, perStation).purchases.length;
  return purchases;
}

describe('Layouts', () => {
  it('jede Station hat genau eine Platzierung im Raster', () => {
    for (const layout of Object.values(LAYOUTS)) {
      const ids = layout.stations.map((s) => s.stationId).sort();
      expect(ids).toEqual(STATIONS.map((s) => s.id).sort());
      const inGrid = (p: { x: number; y: number }) =>
        p.x >= 0 && p.y >= 0 && p.x < layout.gridSize && p.y < layout.gridSize;
      for (const s of layout.stations) {
        expect(inGrid(s.tile) && inGrid(s.access)).toBe(true);
        for (const w of s.path) expect(inGrid(w)).toBe(true);
        expect(Math.abs(s.queueDir.x) + Math.abs(s.queueDir.y)).toBe(1);
      }
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

describe('Kunden-Agenten (kosmetisch)', () => {
  it('bei 1 Kunde/s sind Kunden unterwegs und kaufen', () => {
    const crowd = new CustomerCrowd(getLayout('berlin'), 'berlin', lcg());
    const purchases = run(crowd, { matchaBar: 1 }, 30);
    expect(crowd.activeCount).toBeGreaterThan(0);
    expect(crowd.activeCount).toBeLessThan(CROWD.maxAgents);
    expect(purchases).toBeGreaterThan(15);
    expect(crowd.hiddenCount).toBe(0);
  });
  it('bei 100/s bleibt es bei 40 Agenten, der Rest wird als +N gezählt', () => {
    const crowd = new CustomerCrowd(getLayout('berlin'), 'berlin', lcg(7));
    run(crowd, { matchaBar: 60, togoWindow: 40 }, 20);
    expect(crowd.activeCount).toBe(CROWD.maxAgents);
    expect(crowd.hiddenCount).toBeGreaterThan(0);
    expect(crowd.queueLength('matchaBar') + crowd.queueLength('togoWindow')).toBeGreaterThan(0);
  });
  it('ohne Rate kommt niemand, Stationen ohne Platzierung werden ignoriert', () => {
    const crowd = new CustomerCrowd(getLayout('berlin'), 'berlin', lcg());
    expect(run(crowd, { matchaBar: 0, unknown: 5 }, 10)).toBe(0);
    expect(crowd.activeCount).toBe(0);
  });
  it('Agenten verlassen das Café wieder, wenn die Rate wegfällt', () => {
    const crowd = new CustomerCrowd(getLayout('berlin'), 'berlin', lcg(3));
    run(crowd, { matchaBar: 2 }, 10);
    expect(crowd.activeCount).toBeGreaterThan(0);
    run(crowd, { matchaBar: 0.0001 }, 120);
    expect(crowd.activeCount).toBe(0);
    expect(crowd.queueLength('matchaBar')).toBe(0);
  });
  it('ungültige Zeitschritte bewegen nichts', () => {
    const crowd = new CustomerCrowd(getLayout('berlin'), 'berlin', lcg());
    expect(crowd.update(Number.NaN, { matchaBar: 5 }).spawned).toBe(0);
    expect(crowd.update(-1, { matchaBar: 5 }).spawned).toBe(0);
  });
  it('Bedienzeit folgt der Stationsrate, begrenzt', () => {
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
          stations: {
            ...loc.stations,
            matchaBar: { level: 30, unlocked: true },
            checkout: { level: 10, unlocked: true },
            togoWindow: { level: 5, unlocked: true },
          },
        },
      },
    };
  }
  it('mit und ohne Kunden-Agenten sind die Zustände identisch', () => {
    const withScene = createStore(busyState());
    const without = createStore(busyState());
    const crowd = new CustomerCrowd(getLayout('berlin'), 'berlin', lcg(11));
    let visiblePurchases = 0;
    for (let f = 0; f < 60 * 60; f++) {
      withScene.advance(1000 / 60);
      const rates = computeLocationRates(withScene.getState(), 'berlin');
      visiblePurchases += crowd.update(1 / 60, rates.perStation).purchases.length;
      without.advance(1000 / 60);
    }
    expect(visiblePurchases).toBeGreaterThan(0);
    expect(serialize(withScene.getState())).toBe(serialize(without.getState()));
    expect(getLocation(withScene.getState(), 'berlin').coins.gt(0)).toBe(true);
  });
});
