import { describe, expect, it } from 'vitest';
import { BALANCE } from '@data/balance';
import { STAFF_ROLES, getStaffDef } from '@data/staff';
import { STATIONS } from '@data/stations';
import {
  createInitialState,
  getLocation,
  withLocation,
  type GameState,
  type LocationState,
} from '@core/GameState';
import { tick } from '@core/GameLoop';
import { D } from '@core/math';
import { computeLocationRates, computeSpawnRate } from '@core/customers';
import { autoBuyStep, getCheapestStation, getOfflineCapMs } from '@core/economy';
import {
  advanceCleanliness,
  canAutoBuy,
  cleanlinessEquilibrium,
  cleanlinessFloor,
  cleanlinessRatePerMin,
  getNextStaffCost,
  getStaffCost,
  hireStaff,
  isStaffMaxed,
  setAutoBuy,
  staffSpeedMults,
} from '@core/staff';

const LOC = 'berlin';

const make = (patch: Partial<LocationState> = {}): GameState => {
  const s = createInitialState(0);
  return withLocation(s, LOC, { ...getLocation(s, LOC), coins: D(1e15), level: 20, ...patch });
};
const loc = (s: GameState): LocationState => getLocation(s, LOC);

describe('Personal: Daten und Kosten', () => {
  it('jede Rolle aus GAME_DESIGN § 6 ist definiert und gültig', () => {
    expect(STAFF_ROLES.map((r) => r.id).sort()).toEqual(
      ['baker', 'barista', 'cashier', 'cleaner', 'manager', 'socialMedia', 'teaMaster'].sort(),
    );
    for (const r of STAFF_ROLES) {
      expect(r.growth).toBe(1.5);
      expect(r.maxLevel).toBeGreaterThan(0);
      for (const id of r.speed?.stations ?? [])
        expect(STATIONS.some((s) => s.id === id)).toBe(true);
    }
    expect(() => getStaffDef('nope')).toThrow();
  });

  it('Kosten = base × 1.5^level × Standort-Skalierung', () => {
    const b = getStaffDef('barista');
    expect(getStaffCost(b, 0, LOC).toNumber()).toBeCloseTo(100);
    expect(getStaffCost(b, 3, LOC).toNumber()).toBeCloseTo(100 * 1.5 ** 3);
    expect(getStaffCost(b, 0, 'kyoto').toNumber()).toBeCloseTo(100 * 25);
  });

  it('Einstellen zieht Münzen ab und erhöht die Stufe', () => {
    const s = make({ coins: D(250) });
    const n = hireStaff(s, LOC, 'barista');
    expect(loc(n).staff['barista']).toBe(1);
    expect(loc(n).coins.toNumber()).toBeCloseTo(150);
    expect(getNextStaffCost(n, LOC, 'barista').toNumber()).toBeCloseTo(150);
  });

  it('gesperrt, zu teuer oder maximal → kein Kauf', () => {
    const locked = make({ level: 2 });
    expect(hireStaff(locked, LOC, 'cleaner')).toBe(locked);
    const poor = make({ coins: D(10) });
    expect(hireStaff(poor, LOC, 'barista')).toBe(poor);
    const maxed = make({ staff: { manager: 5 } });
    expect(isStaffMaxed(maxed, LOC, 'manager')).toBe(true);
    expect(hireStaff(maxed, LOC, 'manager')).toBe(maxed);
  });
});

describe('Personal: Tempo-Multiplikatoren je Station', () => {
  it('ohne Personal überall 1', () => {
    for (const v of Object.values(staffSpeedMults(loc(make())))) expect(v).toBe(1);
  });

  it('Barista wirkt nur an Bar-Stationen (+15 %/Stufe)', () => {
    const m = staffSpeedMults(loc(make({ staff: { barista: 2 } })));
    expect(m['matchaBar']).toBeCloseTo(1.3);
    expect(m['togoWindow']).toBeCloseTo(1.3);
    expect(m['icedBar']).toBeCloseTo(1.3);
    expect(m['bakery']).toBe(1);
  });

  it('Kassierer +10 % Merch, Bäcker +15 % Bäckerei, Tee-Meister +15 % Zeremonie/Workshop', () => {
    const m = staffSpeedMults(loc(make({ staff: { cashier: 1, baker: 2, teaMaster: 1 } })));
    expect(m['merchShelf']).toBeCloseTo(1.1);
    expect(m['bakery']).toBeCloseTo(1.3);
    expect(m['ceremonyCorner']).toBeCloseTo(1.15);
    expect(m['workshopRoom']).toBeCloseTo(1.15);
    expect(m['matchaBar']).toBe(1);
  });

  it('Barista erhöht Durchsatz und Einkommen, wenn die Bar der Engpass ist', () => {
    // Viele Sitzplätze: Nachfrage übersteigt den Bar-Durchsatz.
    const base = make({
      ambience: { seats: 50 },
      stations: { ...loc(make()).stations, checkout: { level: 50, unlocked: true } },
    });
    const more = withLocation(base, LOC, { ...loc(base), staff: { barista: 4 } });
    const a = computeLocationRates(base, LOC);
    const b = computeLocationRates(more, LOC);
    expect(b.totalThroughput).toBeCloseTo(a.totalThroughput * 1.6);
    expect(b.incomePerSec.gt(a.incomePerSec)).toBe(true);
  });

  it('Kassierer: +20 % Kassen-Durchsatz je Stufe', () => {
    const stations = {
      ...loc(make()).stations,
      checkout: { level: 1, unlocked: true },
      matchaBar: { level: 200, unlocked: true },
    };
    const a = computeLocationRates(make({ stations }), LOC);
    const b = computeLocationRates(make({ stations, staff: { cashier: 2 } }), LOC);
    expect(b.totalThroughput).toBeCloseTo(a.totalThroughput * 1.4);
  });

  it('Social-Media-Manager: +5 % Spawnrate je Stufe', () => {
    const a = computeSpawnRate(loc(make()));
    const b = computeSpawnRate(loc(make({ staff: { socialMedia: 3 } })));
    expect(b).toBeCloseTo(a * 1.15);
  });

  it('Tee-Meister: +2 Zufriedenheits-Ziel je Stufe', () => {
    const a = computeLocationRates(make(), LOC).satisfaction;
    const b = computeLocationRates(make({ staff: { teaMaster: 3 } }), LOC).satisfaction;
    expect(b.teaMaster).toBe(6);
    expect(b.target - a.target).toBeCloseTo(6);
  });

  it('Filialleiter: Offline-Cap +2 h je Stufe, gedeckelt bei 14 h', () => {
    expect(getOfflineCapMs(make())).toBe(4 * 3_600_000);
    expect(getOfflineCapMs(make({ staff: { manager: 2 } }))).toBe(8 * 3_600_000);
    expect(getOfflineCapMs(make({ staff: { manager: 5 } }))).toBe(14 * 3_600_000);
  });
});

describe('Sauberkeit', () => {
  it('ohne Reinigung: −2/min bis 0', () => {
    const l = loc(make({ cleanliness: 100 }));
    expect(cleanlinessRatePerMin(l)).toBe(-2);
    expect(cleanlinessFloor(l)).toBe(0);
    expect(advanceCleanliness(l, 60)).toBeCloseTo(98);
    expect(advanceCleanliness(l, 3600)).toBe(0);
    expect(cleanlinessEquilibrium(l)).toBe(0);
  });

  it('Stufe 1: Verfall −25 % und Untergrenze 60', () => {
    const l = loc(make({ cleanliness: 100, staff: { cleaner: 1 } }));
    expect(cleanlinessRatePerMin(l)).toBeCloseTo(-1.5);
    expect(advanceCleanliness(l, 3600)).toBe(BALANCE.cleanliness.floorWithCleaner);
    expect(cleanlinessEquilibrium(l)).toBe(60);
  });

  it('liegt sie schon unter der Untergrenze, sinkt sie nur nicht weiter', () => {
    const l = loc(make({ cleanliness: 40, staff: { cleaner: 1 } }));
    expect(advanceCleanliness(l, 600)).toBe(40);
  });

  it('ab Stufe 3 wird aufgewischt (+5/min), gedeckelt bei 100', () => {
    const l = loc(make({ cleanliness: 50, staff: { cleaner: 3 } }));
    expect(cleanlinessRatePerMin(l)).toBeCloseTo(4.5);
    expect(advanceCleanliness(l, 60)).toBeCloseTo(54.5);
    expect(advanceCleanliness(l, 3600)).toBe(100);
    expect(cleanlinessEquilibrium(l)).toBe(100);
  });

  it('ab Stufe 4 kein Verfall mehr (nicht negativ)', () => {
    const l = loc(make({ cleanliness: 80, staff: { cleaner: 10 } }));
    expect(cleanlinessRatePerMin(l)).toBe(BALANCE.cleanliness.regenPerMin);
  });

  it('Sauberkeit geht in das Zufriedenheits-Ziel ein: (c − 70) × 0.3', () => {
    const clean = computeLocationRates(make({ cleanliness: 100 }), LOC).satisfaction;
    const dirty = computeLocationRates(make({ cleanliness: 0 }), LOC).satisfaction;
    expect(clean.cleanliness).toBeCloseTo(9);
    expect(dirty.cleanliness).toBeCloseTo(-21);
  });

  it('tick lässt die Sauberkeit fallen', () => {
    const s = tick(make({ cleanliness: 100 }), 60_000);
    expect(loc(s).cleanliness).toBeCloseTo(98);
  });
});

describe('Abnahme: Reinigungskraft stabilisiert Zufriedenheit und Einnahmen', () => {
  // Kleines laufendes Café, 40 Minuten ohne Eingriff.
  const start = (): GameState => {
    const s = createInitialState(0);
    const l = getLocation(s, LOC);
    return withLocation(s, LOC, {
      ...l,
      level: 3,
      stations: {
        ...l.stations,
        matchaBar: { level: 25, unlocked: true },
        checkout: { level: 10, unlocked: true },
      },
    });
  };
  const run = (s: GameState, minutes: number): GameState => {
    let cur = s;
    for (let i = 0; i < minutes * 6; i++) cur = tick(cur, 10_000);
    return cur;
  };

  it('ohne Reinigung sinken Zufriedenheit und Einkommen sichtbar', () => {
    const s0 = run(start(), 5);
    const s1 = run(s0, 40);
    expect(loc(s1).satisfaction).toBeLessThan(loc(s0).satisfaction - 5);
    expect(
      computeLocationRates(s1, LOC).incomePerSec.lt(computeLocationRates(s0, LOC).incomePerSec),
    ).toBe(true);
  });

  it('mit Reinigungskraft bleibt beides stabil', () => {
    const s = start();
    const withCleaner = withLocation(s, LOC, { ...loc(s), staff: { cleaner: 3 } });
    const s0 = run(withCleaner, 5);
    const s1 = run(s0, 40);
    expect(Math.abs(loc(s1).satisfaction - loc(s0).satisfaction)).toBeLessThan(1);
    expect(loc(s1).cleanliness).toBe(100);
    const a = computeLocationRates(s0, LOC).incomePerSec.toNumber();
    const b = computeLocationRates(s1, LOC).incomePerSec.toNumber();
    expect(b).toBeGreaterThanOrEqual(a * 0.99);
  });
});

describe('Filialleiter: Auto-Kauf', () => {
  it('Schalter geht nur mit Filialleiter an', () => {
    const s = make();
    expect(canAutoBuy(loc(s))).toBe(false);
    expect(setAutoBuy(s, LOC, true)).toBe(s);
    const m = make({ staff: { manager: 1 } });
    const on = setAutoBuy(m, LOC, true);
    expect(loc(on).autoBuy).toBe(true);
    expect(setAutoBuy(on, LOC, true)).toBe(on);
    expect(loc(setAutoBuy(on, LOC, false)).autoBuy).toBe(false);
  });

  it('kauft die günstigste Station, nur wenn aktiviert', () => {
    const m = make({ staff: { manager: 1 }, coins: D(1000) });
    expect(autoBuyStep(m, LOC)).toBe(m);
    const on = setAutoBuy(m, LOC, true);
    const pick = getCheapestStation(on, LOC);
    expect(pick?.id).toBe('matchaBar');
    const n = autoBuyStep(on, LOC);
    expect(loc(n).stations['matchaBar']?.level).toBe(2);
    expect(loc(n).coins.toNumber()).toBeCloseTo(1000 - (pick?.cost.toNumber() ?? 0));
  });

  it('ohne Geld oder ohne Filialleiter passiert nichts; tick kauft automatisch', () => {
    const poor = setAutoBuy(make({ staff: { manager: 1 }, coins: D(0) }), LOC, true);
    expect(autoBuyStep(poor, LOC)).toBe(poor);
    const fired = { ...poor, locations: { [LOC]: { ...loc(poor), staff: {}, coins: D(1e6) } } };
    expect(autoBuyStep(fired, LOC)).toBe(fired);
    const rich = setAutoBuy(make({ staff: { manager: 1 }, coins: D(1e6) }), LOC, true);
    expect(loc(tick(rich, 100)).stations['matchaBar']?.level).toBe(2);
  });

  it('ohne freigeschaltete Station gibt es keinen Kandidaten', () => {
    expect(getCheapestStation(make({ level: 0 }), LOC)).toBeNull();
  });
});
