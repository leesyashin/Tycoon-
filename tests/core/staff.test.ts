import { describe, expect, it } from 'vitest';
import { BALANCE } from '@data/balance';
import { STAFF_ROLES, foundingStaff, getStaffDef } from '@data/staff';
import { STATIONS, getStationDef } from '@data/stations';
import {
  createInitialState,
  getLocation,
  withLocation,
  type GameState,
  type LocationState,
} from '@core/GameState';
import { tick } from '@core/GameLoop';
import { D } from '@core/math';
import {
  averageServeTime,
  computeLocationRates,
  computeSpawnRate,
  orderCapacity,
  productionCapacity,
  serviceCapacity,
} from '@core/customers';
import { autoBuyStep, getCheapestStation, getOfflineCapMs, getStationSpeed } from '@core/economy';
import {
  advanceCleanliness,
  canAutoBuy,
  cleanPerMin,
  cleanlinessEquilibrium,
  cleanlinessRatePerMin,
  dirtPerMin,
  getNextStaffCost,
  getStaffCost,
  hireStaff,
  isStaffMaxed,
  previewStaffHire,
  setAutoBuy,
} from '@core/staff';

const LOC = 'berlin';

const make = (patch: Partial<LocationState> = {}): GameState => {
  const s = createInitialState(0);
  return withLocation(s, LOC, { ...getLocation(s, LOC), coins: D(1e15), level: 20, ...patch });
};
const loc = (s: GameState): LocationState => getLocation(s, LOC);
/** Personal relativ zum Gründungsteam setzen. */
const team = (extra: Record<string, number>): Record<string, number> => ({
  ...foundingStaff(),
  ...extra,
});
/** Großes Café mit viel Nachfrage, damit das Personal der Engpass ist. */
const busy = (staff: Record<string, number>, patch: Partial<LocationState> = {}): GameState =>
  make({
    ambience: { seats: 50, wifi: 20 },
    marketing: { level: 30 },
    stations: {
      ...loc(make()).stations,
      register: { level: 10, unlocked: true },
      matchaStation: { level: 10, unlocked: true },
      servingStation: { level: 10, unlocked: true },
    },
    staff: team(staff),
    ...patch,
  });

describe('Personal: Daten und Kosten', () => {
  it('Rollen aus GAME_DESIGN § 6 (Phase 2): vier Köpfe-Rollen, zwei Stufen-Rollen', () => {
    expect(STAFF_ROLES.map((r) => r.id).sort()).toEqual(
      ['barista', 'cashier', 'cleaner', 'manager', 'socialMedia', 'waiter'].sort(),
    );
    for (const r of STAFF_ROLES) {
      expect(r.growth).toBe(r.headcount ? 1.7 : 1.5);
      expect(r.maxLevel).toBeGreaterThan(0);
      expect(r.founding).toBeGreaterThanOrEqual(0);
      if (r.stage) expect(r.headcount).toBe(true);
    }
    expect(() => getStaffDef('nope')).toThrow();
    // Jede Ausstattung hat eine Rolle, die es gibt.
    for (const s of STATIONS) expect(getStaffDef(s.staffRole).headcount).toBe(true);
  });

  it('Gründungsteam: je ein Verkäufer, Barista und Bedienung beim Start', () => {
    expect(foundingStaff()).toEqual({ cashier: 1, barista: 1, waiter: 1 });
    expect(getLocation(createInitialState(0), LOC).staff).toEqual(foundingStaff());
  });

  it('Kosten = base × g^Anzahl × Standort-Skalierung', () => {
    const b = getStaffDef('barista');
    expect(getStaffCost(b, 0, LOC).toNumber()).toBeCloseTo(100);
    expect(getStaffCost(b, 3, LOC).toNumber()).toBeCloseTo(100 * b.growth ** 3);
    expect(getStaffCost(b, 0, 'kyoto').toNumber()).toBeCloseTo(100 * 25);
    // Der zweite Barista (nach dem gratis ersten) kostet base × g.
    expect(getNextStaffCost(createInitialState(0), LOC, 'barista').toNumber()).toBeCloseTo(
      100 * b.growth,
    );
  });

  it('Einstellen zieht Münzen ab und erhöht die Anzahl', () => {
    const g = getStaffDef('barista').growth;
    const s = make({ coins: D(250) });
    const n = hireStaff(s, LOC, 'barista');
    expect(loc(n).staff['barista']).toBe(2);
    expect(loc(n).coins.toNumber()).toBeCloseTo(250 - 100 * g);
    expect(getNextStaffCost(n, LOC, 'barista').toNumber()).toBeCloseTo(100 * g ** 2);
  });

  it('gesperrt, zu teuer oder maximal → kein Kauf', () => {
    const locked = make({ level: getStaffDef('cleaner').unlockCafeLevel - 1 });
    expect(hireStaff(locked, LOC, 'cleaner')).toBe(locked);
    const poor = make({ coins: D(10) });
    expect(hireStaff(poor, LOC, 'barista')).toBe(poor);
    const maxed = make({ staff: team({ manager: 5 }) });
    expect(isStaffMaxed(maxed, LOC, 'manager')).toBe(true);
    expect(hireStaff(maxed, LOC, 'manager')).toBe(maxed);
  });
});

describe('Service-Pipeline (GAME_DESIGN § 7.2)', () => {
  it('Bestellung: Verkäufer × Kassen-Tempo / Bestellzeit; Handkasse ohne Kasse', () => {
    const register = getStationDef('register');
    expect(getStationSpeed(register, 0)).toBe(BALANCE.order.handRegisterSpeed);
    const l = loc(make({ staff: team({ cashier: 1 }) }));
    expect(orderCapacity(l)).toBeCloseTo(BALANCE.order.handRegisterSpeed / BALANCE.order.orderTime);
    const two = loc(make({ staff: team({ cashier: 2 }) }));
    expect(orderCapacity(two)).toBeCloseTo(orderCapacity(l) * 2);
    const withRegister = loc(
      make({ stations: { ...l.stations, register: { level: 1, unlocked: true } } }),
    );
    expect(orderCapacity(withRegister)).toBeCloseTo(1 / BALANCE.order.orderTime);
  });

  it('Zubereitung: Baristas / Barista-Sekunden je Gast (Warenkorb)', () => {
    const l = loc(make());
    // Nur die Matcha-Station (Level 1, 4 s, jeder Gast): 1 Barista = 0.25 Gäste/s.
    expect(productionCapacity(l, LOC)).toBeCloseTo(0.25);
    const three = loc(make({ staff: team({ barista: 3 }) }));
    expect(productionCapacity(three, LOC)).toBeCloseTo(0.75);
    // Kaffeemaschine dazu: ihr Anteil der Gäste × 3 s mehr Arbeit je Gast.
    const coffee = loc(
      make({ stations: { ...l.stations, coffeeMachine: { level: 1, unlocked: true } } }),
    );
    const attach = getStationDef('coffeeMachine').attachRate;
    expect(productionCapacity(coffee, LOC)).toBeCloseTo(1 / (4 + attach * 3));
  });

  it('Ausgabe: Bedienungen × Tempo / Ø Servicezeit (Übergabe und Tischservice gemischt)', () => {
    const s = BALANCE.service;
    expect(averageServeTime()).toBeCloseTo(
      (1 - s.dineInShare) * s.handoverTime + s.dineInShare * s.tableServiceTime,
    );
    const l = loc(make());
    expect(serviceCapacity(l)).toBeCloseTo(1 / averageServeTime());
    const four = loc(make({ staff: team({ waiter: 4 }) }));
    expect(serviceCapacity(four)).toBeCloseTo(4 / averageServeTime());
  });

  it('Gesamtdurchsatz ist die kleinste Stufe; der Engpass wird benannt', () => {
    const r = computeLocationRates(busy({ cashier: 1, barista: 10, waiter: 10 }), LOC);
    expect(r.totalThroughput).toBeCloseTo(r.stages.order);
    expect(r.bottleneck).toBe('order');
    const b = computeLocationRates(busy({ cashier: 10, barista: 1, waiter: 10 }), LOC);
    expect(b.bottleneck).toBe('production');
    const w = computeLocationRates(busy({ cashier: 10, barista: 10, waiter: 1 }), LOC);
    expect(w.bottleneck).toBe('service');
    const quiet = computeLocationRates(
      make({ staff: team({ cashier: 5, barista: 5, waiter: 5 }) }),
      LOC,
    );
    expect(quiet.bottleneck).toBe('demand');
    expect(quiet.served).toBeCloseTo(quiet.spawnRate);
  });

  it('jede weitere Kraft am Engpass erhöht Durchsatz und Einkommen', () => {
    for (const role of ['cashier', 'barista', 'waiter'] as const) {
      const others = { cashier: 10, barista: 10, waiter: 10, [role]: 1 };
      const a = computeLocationRates(busy(others), LOC);
      const b = computeLocationRates(busy({ ...others, [role]: 2 }), LOC);
      expect(a.bottleneck).toBe(getStaffDef(role).stage);
      expect(b.totalThroughput).toBeCloseTo(a.totalThroughput * 2);
      expect(b.incomePerSec.gt(a.incomePerSec)).toBe(true);
    }
  });

  it('eine Kraft an einer anderen Stufe bringt nichts, wenn die Nachfrage begrenzt', () => {
    const s = make({ staff: team({ cashier: 5, barista: 5, waiter: 5 }) });
    const more = withLocation(s, LOC, {
      ...loc(s),
      staff: team({ cashier: 6, barista: 5, waiter: 5 }),
    });
    expect(
      computeLocationRates(more, LOC).incomePerSec.eq(computeLocationRates(s, LOC).incomePerSec),
    ).toBe(true);
  });

  it('ohne Personal an einer Stufe steht die Pipeline', () => {
    const r = computeLocationRates(make({ staff: { cashier: 1, barista: 1 } }), LOC);
    expect(r.stages.service).toBe(0);
    expect(r.served).toBe(0);
    expect(r.incomePerSec.toNumber()).toBe(0);
  });

  it('Social-Media-Manager: +5 % Spawnrate je Stufe', () => {
    const a = computeSpawnRate(loc(make()));
    const b = computeSpawnRate(loc(make({ staff: team({ socialMedia: 3 }) })));
    expect(b).toBeCloseTo(a * 1.15);
  });

  it('Filialleiter: Offline-Cap +2 h je Stufe, gedeckelt bei 14 h', () => {
    expect(getOfflineCapMs(make())).toBe(4 * 3_600_000);
    expect(getOfflineCapMs(make({ staff: team({ manager: 2 }) }))).toBe(8 * 3_600_000);
    expect(getOfflineCapMs(make({ staff: team({ manager: 5 }) }))).toBe(14 * 3_600_000);
  });
});

describe('Sauberkeit (GAME_DESIGN § 7.3, Phase 2)', () => {
  const c = BALANCE.cleanliness;
  it('Schmutz wächst mit den Gästen', () => {
    expect(dirtPerMin(0)).toBe(c.decayPerMin);
    expect(dirtPerMin(1)).toBeCloseTo(c.decayPerMin + 60 * c.dirtPerCustomer);
    expect(dirtPerMin(-5)).toBe(c.decayPerMin);
  });

  it('ohne Putzkraft: fällt mit dem Schmutz bis 0', () => {
    const l = loc(make({ cleanliness: 100 }));
    expect(cleanPerMin(l)).toBe(0);
    expect(cleanlinessRatePerMin(l, 0)).toBe(-c.decayPerMin);
    expect(advanceCleanliness(l, 60, 0)).toBeCloseTo(100 - c.decayPerMin);
    expect(advanceCleanliness(l, 3600, 0)).toBe(0);
    expect(cleanlinessEquilibrium(l, 0)).toBe(0);
  });

  it('eine Putzkraft putzt umso mehr, je dreckiger es ist', () => {
    const power = c.cleanPerCleanerPerMin * c.dirtFactor;
    const clean = loc(make({ cleanliness: 100, staff: team({ cleaner: 1 }) }));
    expect(cleanPerMin(clean)).toBe(0);
    const half = loc(make({ cleanliness: 50, staff: team({ cleaner: 1 }) }));
    expect(cleanPerMin(half)).toBeCloseTo(power * 0.5);
    expect(cleanlinessRatePerMin(half, 0)).toBeCloseTo(power * 0.5 - c.decayPerMin);
  });

  it('Gleichgewicht: 100 × (1 − Schmutz/Putzleistung), mehr Putzkräfte → sauberer', () => {
    const power = c.cleanPerCleanerPerMin * c.dirtFactor;
    const one = loc(make({ staff: team({ cleaner: 1 }) }));
    expect(cleanlinessEquilibrium(one, 0)).toBeCloseTo(100 * (1 - c.decayPerMin / power));
    const two = loc(make({ staff: team({ cleaner: 2 }) }));
    expect(cleanlinessEquilibrium(two, 0)).toBeGreaterThan(cleanlinessEquilibrium(one, 0));
    // Viele Gäste machen mehr Dreck als eine Putzkraft schafft.
    expect(cleanlinessEquilibrium(one, 5)).toBe(0);
    expect(cleanlinessEquilibrium(loc(make({ staff: team({ cleaner: 20 }) })), 5)).toBeGreaterThan(
      0,
    );
  });

  it('advanceCleanliness löst die Gleichung exakt: ein langer Schritt = viele kurze', () => {
    const l = loc(make({ cleanliness: 30, staff: team({ cleaner: 2 }) }));
    let cur = l;
    for (let i = 0; i < 600; i++) cur = { ...cur, cleanliness: advanceCleanliness(cur, 1, 0.5) };
    expect(cur.cleanliness).toBeCloseTo(advanceCleanliness(l, 600, 0.5), 3);
    // Es konvergiert gegen das Gleichgewicht und bleibt dort.
    const eq = cleanlinessEquilibrium(l, 0.5);
    expect(advanceCleanliness(l, 1e6, 0.5)).toBeCloseTo(eq, 6);
    expect(advanceCleanliness({ ...l, cleanliness: eq }, 120, 0.5)).toBeCloseTo(eq, 9);
    expect(advanceCleanliness({ ...l, cleanliness: 150 }, 0, 0.5)).toBe(100);
  });

  it('Sauberkeit geht in das Zufriedenheits-Ziel ein: (c − 70) × 0.3', () => {
    const clean = computeLocationRates(make({ cleanliness: 100 }), LOC).satisfaction;
    const dirty = computeLocationRates(make({ cleanliness: 0 }), LOC).satisfaction;
    expect(clean.cleanliness).toBeCloseTo(9);
    expect(dirty.cleanliness).toBeCloseTo(-21);
  });

  it('tick lässt die Sauberkeit mit dem Verkehr fallen', () => {
    const s = make({ cleanliness: 100 });
    const served = computeLocationRates(s, LOC).served;
    expect(loc(tick(s, 60_000)).cleanliness).toBeCloseTo(100 - dirtPerMin(served), 3);
  });
});

describe('Abnahme: Putzkraft stabilisiert Zufriedenheit und Einnahmen', () => {
  // Kleines laufendes Café, 40 Minuten ohne Eingriff.
  const start = (): GameState => {
    const s = createInitialState(0);
    const l = getLocation(s, LOC);
    return withLocation(s, LOC, {
      ...l,
      level: 3,
      stations: {
        ...l.stations,
        matchaStation: { level: 25, unlocked: true },
        register: { level: 10, unlocked: true },
      },
      staff: team({ cashier: 2, barista: 2, waiter: 2 }),
    });
  };
  const run = (s: GameState, minutes: number): GameState => {
    let cur = s;
    for (let i = 0; i < minutes * 6; i++) cur = tick(cur, 10_000);
    return cur;
  };

  it('ohne Putzkraft sinken Zufriedenheit und Einkommen sichtbar', () => {
    const s0 = run(start(), 5);
    const s1 = run(s0, 40);
    expect(loc(s1).satisfaction).toBeLessThan(loc(s0).satisfaction - 5);
    expect(
      computeLocationRates(s1, LOC).incomePerSec.lt(computeLocationRates(s0, LOC).incomePerSec),
    ).toBe(true);
  });

  it('mit Putzkräften bleibt beides stabil', () => {
    const s = start();
    const withCleaners = withLocation(s, LOC, { ...loc(s), staff: team({ cleaner: 3 }) });
    const s0 = run(withCleaners, 5);
    const s1 = run(s0, 40);
    expect(Math.abs(loc(s1).satisfaction - loc(s0).satisfaction)).toBeLessThan(1);
    expect(loc(s1).cleanliness).toBeGreaterThan(85);
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
    const m = make({ staff: team({ manager: 1 }) });
    const on = setAutoBuy(m, LOC, true);
    expect(loc(on).autoBuy).toBe(true);
    expect(setAutoBuy(on, LOC, true)).toBe(on);
    expect(loc(setAutoBuy(on, LOC, false)).autoBuy).toBe(false);
  });

  it('kauft die günstigste Ausstattung, nur wenn aktiviert', () => {
    const m = make({ staff: team({ manager: 1 }), coins: D(1000) });
    expect(autoBuyStep(m, LOC)).toBe(m);
    const on = setAutoBuy(m, LOC, true);
    const pick = getCheapestStation(on, LOC);
    expect(pick?.id).toBe('matchaStation');
    const n = autoBuyStep(on, LOC);
    expect(loc(n).stations['matchaStation']?.level).toBe(2);
    expect(loc(n).coins.toNumber()).toBeCloseTo(1000 - (pick?.cost.toNumber() ?? 0));
  });

  it('ohne Geld oder ohne Filialleiter passiert nichts; tick kauft automatisch', () => {
    const poor = setAutoBuy(make({ staff: team({ manager: 1 }), coins: D(0) }), LOC, true);
    expect(autoBuyStep(poor, LOC)).toBe(poor);
    const fired = {
      ...poor,
      locations: { [LOC]: { ...loc(poor), staff: foundingStaff(), coins: D(1e6) } },
    };
    expect(autoBuyStep(fired, LOC)).toBe(fired);
    const rich = setAutoBuy(make({ staff: team({ manager: 1 }), coins: D(1e6) }), LOC, true);
    expect(loc(tick(rich, 100)).stations['matchaStation']?.level).toBe(2);
  });

  it('ohne freigeschaltete Ausstattung gibt es keinen Kandidaten', () => {
    expect(getCheapestStation(make({ level: 0 }), LOC)).toBeNull();
  });
});

describe('Personal-Vorschau', () => {
  it('Barista am Engpass zeigt Mehreinkommen, Putzkraft die langfristige Zufriedenheit', () => {
    const s = busy({ cashier: 10, barista: 1, waiter: 10 });
    const barista = previewStaffHire(s, LOC, 'barista');
    expect(barista.incomeDelta.gt(0)).toBe(true);
    expect(barista.satisfactionDelta).toBe(0);
    const dirty = make({ cleanliness: 30 });
    const cleaner = previewStaffHire(dirty, LOC, 'cleaner');
    const served = computeLocationRates(dirty, LOC).served;
    const eq = cleanlinessEquilibrium({ ...loc(dirty), staff: team({ cleaner: 1 }) }, served);
    // Ohne Putzkraft geht es langfristig auf 0; mit einer auf das Gleichgewicht.
    expect(cleaner.satisfactionDelta).toBeCloseTo(BALANCE.satisfaction.cleanlinessWeight * eq, 6);
    // Eine Kraft an einer Stufe, die nicht bremst, bringt kein Einkommen.
    const idle = previewStaffHire(
      make({ staff: team({ cashier: 5, barista: 5, waiter: 5 }) }),
      LOC,
      'cashier',
    );
    expect(idle.incomeDelta.toNumber()).toBe(0);
  });
});
