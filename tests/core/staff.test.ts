import { describe, expect, it } from 'vitest';
import { BALANCE } from '@data/balance';
import { STAFF_ROLES, foundingStaff, getStaffDef } from '@data/staff';
import { STATIONS, getStationDef } from '@data/stations';
import { getLocationDef } from '@data/locations';
import { getMetaUpgradeDef } from '@data/prestige';
import { DEMAND_CURVE, OPENING_HOURS, TIME } from '@data/time';
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
  getIncomePerHour,
  orderCapacity,
  paidHeads,
  peakIncomePerHour,
  productionCapacity,
  rentPerDay,
  roleWagePerHour,
  serviceCapacity,
  wagesPerOpenHour,
} from '@core/customers';
import {
  advanceRealSeconds,
  autoBuyReserve,
  autoBuyStep,
  buyStation,
  getCheapestStation,
  getOfflineCapDays,
  getOfflineCapMs,
  getStationSpeed,
  menuTier,
} from '@core/economy';
import { isOpenHour, openHoursPerDay, realSecondsPerDay, setOpeningHours } from '@core/time';
import { dailyMatchaCost } from '@core/supply';
import {
  advanceCleanliness,
  canAutoBuy,
  canFireStaff,
  cleanPerHour,
  cleanlinessEquilibrium,
  cleanlinessRatePerHour,
  dirtPerHour,
  fireStaff,
  getHireFee,
  getNextStaffCost,
  getNextStaffWage,
  getStaffLevel,
  hireStaff,
  isStaffMaxed,
  isStaffUnlocked,
  minStaff,
  peakHour,
  peakRates,
  previewStaffHire,
  setAutoBuy,
} from '@core/staff';

const LOC = 'berlin';
const SCALE = getLocationDef(LOC).scale;
const HOURS = OPENING_HOURS.default;
/** Stunde mit der höchsten Nachfrage in den Standard-Öffnungszeiten. */
const PEAK = Array.from({ length: HOURS.close - HOURS.open }, (_, i) => HOURS.open + i).reduce(
  (best, h) => ((DEMAND_CURVE[h] ?? 0) > (DEMAND_CURVE[best] ?? 0) ? h : best),
  HOURS.open,
);
/** Eine Stunde, zu der kein Café geöffnet haben kann. */
const NIGHT = OPENING_HOURS.earliestOpen - 1;

/** Spieluhr auf Tag 0, volle Stunde `hour` stellen. */
const at = (s: GameState, hour: number): GameState => ({ ...s, clock: hour * 60, hourMark: hour });
/** Startcafé zur Hauptzeit, alles freigeschaltet, Geld ohne Ende. */
const make = (patch: Partial<LocationState> = {}): GameState => {
  const s = at(createInitialState(0), PEAK);
  return withLocation(s, LOC, { ...getLocation(s, LOC), coins: D(1e15), level: 20, ...patch });
};
const loc = (s: GameState): LocationState => getLocation(s, LOC);
/** Personal relativ zum Gründungsteam setzen. */
const team = (extra: Record<string, number>): Record<string, number> => ({
  ...foundingStaff(),
  ...extra,
});
/** Matcha-Vorrat, der nie ausgeht. */
const plenty = (l: LocationState): LocationState['supply'] => ({
  ...l.supply,
  stock: l.supply.stock.map((g, i) => (i === l.supply.grade ? 1e9 : g)),
});
/** Großer Andrang (viele Tische und Follower, Boost ×5 auf Gäste), damit das Personal bremst. */
const busy = (staff: Record<string, number>, patch: Partial<LocationState> = {}): GameState => {
  const base = make();
  const l = loc(base);
  const s = withLocation(base, LOC, {
    ...l,
    ambience: { seats: 10, decor: 30 },
    stations: { ...l.stations, matchaStation: { level: 10, unlocked: true } },
    social: { ...l.social, followers: 1e6 },
    supply: plenty(l),
    staff: team(staff),
    ...patch,
  });
  return {
    ...s,
    boosts: [{ id: 'test', until: Infinity, spawnMult: 5, incomeMult: 1, speedMult: 1 }],
  };
};

describe('Personal: Rollen und Gründungsteam', () => {
  it('Rollen aus GAME_DESIGN § 6: vier Service-Rollen mit Köpfen, zwei Stufen-Rollen', () => {
    expect(STAFF_ROLES.map((r) => r.id).sort()).toEqual(
      ['barista', 'cashier', 'cleaner', 'manager', 'socialMedia', 'waiter'].sort(),
    );
    for (const r of STAFF_ROLES) {
      expect(r.maxLevel).toBeGreaterThan(0);
      expect(r.wage).toBeGreaterThan(0);
      expect(r.hireFee).toBeGreaterThan(0);
      expect(r.wagePerLevel).toBeGreaterThanOrEqual(0);
      expect(r.owner).toBeLessThanOrEqual(r.founding);
      expect(r.founding).toBeLessThanOrEqual(r.maxLevel);
      // Köpfe arbeiten an einer Stufe der Pipeline und kosten je Kopf gleich viel.
      expect(r.stage !== undefined).toBe(r.headcount);
      if (r.headcount) expect(r.wagePerLevel).toBe(0);
    }
    expect(getStaffDef('cashier').stage).toBe('order');
    expect(getStaffDef('barista').stage).toBe('production');
    expect(getStaffDef('waiter').stage).toBe('service');
    expect(getStaffDef('cleaner').stage).toBe('cleaning');
    expect(() => getStaffDef('nope')).toThrow();
    // Jede Ausstattung hat eine Rolle, die es gibt.
    for (const s of STATIONS) expect(getStaffDef(s.staffRole).headcount).toBe(true);
  });

  it('Gründungsteam: du an der Kasse (Inhaber/in, ohne Lohn) und ein Barista', () => {
    expect(foundingStaff()).toEqual({ cashier: 1, barista: 1 });
    expect(getStaffDef('cashier').owner).toBe(1);
    for (const r of STAFF_ROLES) if (r.id !== 'cashier') expect(r.owner).toBe(0);
    const l = getLocation(createInitialState(0), LOC);
    expect(l.staff).toEqual(foundingStaff());
    expect(paidHeads(l, 'cashier')).toBe(0);
    expect(roleWagePerHour(l, 'cashier', LOC)).toBe(0);
    expect(wagesPerOpenHour(l, LOC)).toBeCloseTo(getStaffDef('barista').wage * SCALE, 9);
  });
});

describe('Einstellen', () => {
  it('Gebühr = hireFee × Preisniveau, unabhängig davon, wie viele schon da sind', () => {
    for (const r of STAFF_ROLES) {
      for (const id of [LOC, 'kyoto', 'bali']) {
        expect(getHireFee(r, id).toNumber()).toBeCloseTo(r.hireFee * getLocationDef(id).scale, 9);
      }
    }
    const fee = getStaffDef('barista').hireFee * SCALE;
    expect(getNextStaffCost(make(), LOC, 'barista').toNumber()).toBeCloseTo(fee, 9);
    const five = make({ staff: team({ barista: 5 }) });
    expect(getNextStaffCost(five, LOC, 'barista').toNumber()).toBeCloseTo(fee, 9);
  });

  it('Zen-Rabatt senkt die Gebühr, gedeckelt bei maxDiscount', () => {
    const s = make();
    const fee = getStaffDef('waiter').hireFee * SCALE;
    const zen = (level: number): GameState => ({
      ...s,
      meta: { ...s.meta, metaUpgrades: { discount: level } },
    });
    const off = Math.min(BALANCE.maxDiscount, 3 * getMetaUpgradeDef('discount').perLevel);
    expect(getNextStaffCost(zen(3), LOC, 'waiter').toNumber()).toBeCloseTo(fee * (1 - off), 9);
    expect(getNextStaffCost(zen(1000), LOC, 'waiter').toNumber()).toBeCloseTo(
      fee * (1 - BALANCE.maxDiscount),
      9,
    );
  });

  it('zieht die Gebühr ab, bucht sie in die Tagesbilanz und erhöht die Anzahl', () => {
    const fee = getNextStaffCost(make(), LOC, 'barista').toNumber();
    const s = make({ coins: D(fee + 10) });
    const n = hireStaff(s, LOC, 'barista');
    expect(loc(n).staff['barista']).toBe(2);
    expect(loc(n).coins.toNumber()).toBeCloseTo(10, 9);
    expect(loc(n).ledger.today.hiring.toNumber()).toBeCloseTo(fee, 9);
    // Genau passend reicht auch.
    const exact = hireStaff(make({ coins: D(fee) }), LOC, 'barista');
    expect(loc(exact).staff['barista']).toBe(2);
    expect(loc(exact).coins.toNumber()).toBeCloseTo(0, 9);
  });

  it('gesperrt, zu teuer, im Minus oder voll → keine Einstellung', () => {
    const cleaner = getStaffDef('cleaner');
    const locked = make({ level: cleaner.unlockCafeLevel - 1 });
    expect(isStaffUnlocked(locked, LOC, 'cleaner')).toBe(false);
    expect(hireStaff(locked, LOC, 'cleaner')).toBe(locked);
    const fee = getNextStaffCost(make(), LOC, 'barista').toNumber();
    const poor = make({ coins: D(fee - 0.01) });
    expect(hireStaff(poor, LOC, 'barista')).toBe(poor);
    const debt = make({ coins: D(-500) });
    expect(hireStaff(debt, LOC, 'barista')).toBe(debt);
    const maxed = make({ staff: team({ manager: getStaffDef('manager').maxLevel }) });
    expect(isStaffMaxed(maxed, LOC, 'manager')).toBe(true);
    expect(hireStaff(maxed, LOC, 'manager')).toBe(maxed);
    // An der Kasse zählst du mit: höchstens maxLevel Köpfe inklusive Inhaber/in.
    const registers = make({ staff: team({ cashier: getStaffDef('cashier').maxLevel }) });
    expect(hireStaff(registers, LOC, 'cashier')).toBe(registers);
  });

  it('Stufen-Rollen: eine Stufe höher, eine bezahlte Kraft, mehr Lohn je Stufe', () => {
    const m = getStaffDef('manager');
    let s = make();
    expect(getNextStaffWage(s, LOC, 'manager')).toBeCloseTo(m.wage * SCALE, 9);
    s = hireStaff(s, LOC, 'manager');
    expect(getStaffLevel(loc(s), 'manager')).toBe(1);
    expect(paidHeads(loc(s), 'manager')).toBe(1);
    expect(roleWagePerHour(loc(s), 'manager', LOC)).toBeCloseTo(m.wage * SCALE, 9);
    expect(getNextStaffWage(s, LOC, 'manager')).toBeCloseTo(m.wagePerLevel * SCALE, 9);
    s = hireStaff(s, LOC, 'manager');
    expect(getStaffLevel(loc(s), 'manager')).toBe(2);
    expect(paidHeads(loc(s), 'manager')).toBe(1);
    expect(roleWagePerHour(loc(s), 'manager', LOC)).toBeCloseTo(
      (m.wage + m.wagePerLevel) * SCALE,
      9,
    );
  });
});

describe('Entlassen', () => {
  it('du an der Kasse bleibst immer (Mindestzahl = Inhaber/in bzw. Mindestbesetzung)', () => {
    for (const r of STAFF_ROLES) expect(minStaff(r.id)).toBe(Math.max(r.owner, r.minimum));
    expect(minStaff('cashier')).toBe(getStaffDef('cashier').owner);
    const s = make();
    expect(canFireStaff(s, LOC, 'cashier')).toBe(false);
    expect(fireStaff(s, LOC, 'cashier')).toBe(s);
    const three = make({ staff: team({ cashier: 3 }) });
    expect(canFireStaff(three, LOC, 'cashier')).toBe(true);
    const two = fireStaff(three, LOC, 'cashier');
    expect(loc(two).staff['cashier']).toBe(2);
    expect(loc(fireStaff(two, LOC, 'cashier')).staff['cashier']).toBe(1);
  });

  it('Angestellte bis zur Mindestbesetzung, ohne Erstattung; ein Barista bleibt immer', () => {
    // Ohne Barista bereitete niemand etwas zu: der letzte ist nicht kündbar.
    const s = make({ coins: D(100) });
    expect(getStaffDef('barista').minimum).toBe(1);
    expect(canFireStaff(s, LOC, 'barista')).toBe(false);
    expect(fireStaff(s, LOC, 'barista')).toBe(s);
    const two = make({ coins: D(100), staff: team({ barista: 2 }) });
    expect(canFireStaff(two, LOC, 'barista')).toBe(true);
    const n = fireStaff(two, LOC, 'barista');
    expect(loc(n).staff['barista']).toBe(1);
    expect(loc(n).staff['cashier']).toBe(loc(two).staff['cashier']);
    expect(loc(n).coins.toNumber()).toBe(100);
    expect(loc(n).ledger).toEqual(loc(two).ledger);
    expect(canFireStaff(n, LOC, 'barista')).toBe(false);
    expect(computeLocationRates(n, LOC).stages.production).toBeGreaterThan(0);
    // Wer nicht da ist, kann nicht gehen; Rollen ohne Mindestbesetzung bis auf 0.
    expect(canFireStaff(s, LOC, 'waiter')).toBe(false);
    expect(fireStaff(s, LOC, 'waiter')).toBe(s);
    const w = fireStaff(make({ staff: team({ waiter: 1 }) }), LOC, 'waiter');
    expect('waiter' in loc(w).staff).toBe(false);
  });

  it('spart den Stundenlohn', () => {
    const s = make({ staff: team({ waiter: 2 }) });
    const n = fireStaff(s, LOC, 'waiter');
    expect(loc(n).staff['waiter']).toBe(1);
    expect(wagesPerOpenHour(loc(s), LOC) - wagesPerOpenHour(loc(n), LOC)).toBeCloseTo(
      getStaffDef('waiter').wage * SCALE,
      9,
    );
  });

  it('Stufen-Rollen eine Stufe tiefer; ohne Filialleiter geht der Auto-Kauf aus', () => {
    const s = setAutoBuy(make({ staff: team({ manager: 2 }) }), LOC, true);
    expect(loc(s).autoBuy).toBe(true);
    const one = fireStaff(s, LOC, 'manager');
    expect(loc(one).staff['manager']).toBe(1);
    expect(loc(one).autoBuy).toBe(true);
    const none = fireStaff(one, LOC, 'manager');
    expect('manager' in loc(none).staff).toBe(false);
    expect(loc(none).autoBuy).toBe(false);
  });
});

describe('Löhne', () => {
  it('bezahlte Köpfe: alle außer dir; Stufen-Rollen sind eine Kraft', () => {
    const l = loc(
      make({ staff: team({ cashier: 3, barista: 2, waiter: 1, manager: 3, socialMedia: 1 }) }),
    );
    expect(paidHeads(l, 'cashier')).toBe(3 - getStaffDef('cashier').owner);
    expect(paidHeads(l, 'barista')).toBe(2);
    expect(paidHeads(l, 'waiter')).toBe(1);
    expect(paidHeads(l, 'cleaner')).toBe(0);
    expect(paidHeads(l, 'manager')).toBe(1);
    expect(paidHeads(l, 'socialMedia')).toBe(1);
    expect(paidHeads(l, 'nope')).toBe(0);
  });

  it('Stundenlohn je Rolle × Preisniveau, das Team kostet die Summe', () => {
    const def = (id: string) => getStaffDef(id);
    const base = make({ staff: team({ cashier: 2, barista: 3, cleaner: 1, manager: 2 }) });
    const s = withLocation(base, 'kyoto', loc(base));
    for (const id of [LOC, 'kyoto']) {
      const sc = getLocationDef(id).scale;
      const l = getLocation(s, id);
      const expected: Record<string, number> = {
        cashier: (2 - def('cashier').owner) * def('cashier').wage * sc,
        barista: 3 * def('barista').wage * sc,
        waiter: 0,
        cleaner: def('cleaner').wage * sc,
        manager: (def('manager').wage + def('manager').wagePerLevel) * sc,
        socialMedia: 0,
      };
      let sum = 0;
      for (const r of STAFF_ROLES) {
        expect(roleWagePerHour(l, r.id, id)).toBeCloseTo(expected[r.id] ?? NaN, 9);
        sum += expected[r.id] ?? 0;
      }
      expect(roleWagePerHour(l, 'nope', id)).toBe(0);
      expect(wagesPerOpenHour(l, id)).toBeCloseTo(sum, 9);
      // Die nächste Kraft an der Kasse kostet Lohn, auch wenn du schon dort stehst.
      expect(getNextStaffWage(s, id, 'cashier')).toBeCloseTo(def('cashier').wage * sc, 9);
      expect(getNextStaffWage(s, id, 'barista')).toBeCloseTo(def('barista').wage * sc, 9);
    }
  });

  it('nur in der Öffnungszeit', () => {
    const s = make({ staff: team({ waiter: 1 }) });
    const open = computeLocationRates(s, LOC);
    expect(open.open).toBe(true);
    expect(open.wagesPerHour.toNumber()).toBeCloseTo(wagesPerOpenHour(loc(s), LOC), 9);
    const night = computeLocationRates(s, LOC, { hour: NIGHT });
    expect(night.open).toBe(false);
    expect(night.wagesPerHour.toNumber()).toBe(0);
  });
});

describe('Service-Pipeline (GAME_DESIGN § 7.2)', () => {
  it('Bestellung: Verkäufer × Kassen-Tempo × 60 / Bestellzeit; ohne Kasse die Handkasse', () => {
    const o = BALANCE.order;
    const register = getStationDef('register');
    expect(getStationSpeed(register, 0)).toBe(o.handRegisterSpeed);
    const one = loc(make({ staff: team({ cashier: 1 }) }));
    expect(orderCapacity(one)).toBeCloseTo((o.handRegisterSpeed * 60) / o.orderMin, 9);
    expect(orderCapacity(loc(make({ staff: team({ cashier: 3 }) })))).toBeCloseTo(
      3 * orderCapacity(one),
      9,
    );
    const bought = {
      ...one,
      stations: { ...one.stations, register: { level: 1, unlocked: true } },
    };
    expect(orderCapacity(bought)).toBeCloseTo((getStationSpeed(register, 1) * 60) / o.orderMin, 9);
    // Tempo-Boosts wirken auf alle Theken.
    expect(orderCapacity(one, 2)).toBeCloseTo(2 * orderCapacity(one), 9);
  });

  it('Zubereitung: Barista-Minuten / (Minuten je Gast + Abholung an der Theke)', () => {
    const s = make();
    const r = computeLocationRates(s, LOC);
    // Am Start steht nur die Matcha-Station auf der Karte.
    const bar = getStationDef('matchaStation');
    const lvl = loc(s).stations['matchaStation']?.level ?? 0;
    const attach = menuTier(bar, lvl)?.attach ?? NaN;
    expect(r.loadPerCustomer).toBeCloseTo((attach * bar.workMin) / getStationSpeed(bar, lvl), 9);
    const minutes = getStaffLevel(loc(s), 'barista') * 60;
    expect(r.stages.service).toBe(0);
    expect(r.stages.production).toBeCloseTo(
      minutes / (r.loadPerCustomer + BALANCE.service.pickupMin),
      9,
    );
    const three = computeLocationRates(make({ staff: team({ barista: 3 }) }), LOC);
    expect(three.stages.production).toBeCloseTo(3 * r.stages.production, 9);
  });

  it('Abholung an der Theke: Bedienungen nehmen sie den Baristas ab (productionCapacity)', () => {
    const pickup = BALANCE.service.pickupMin;
    // Ohne Bedienung reicht jeder Barista auch über die Theke.
    expect(productionCapacity(60, 2, 0)).toBeCloseTo(60 / (2 + pickup), 9);
    // Bedienungen mit genug Kapazität übernehmen alles: nur noch die Zubereitung zählt.
    expect(productionCapacity(60, 2, 1000)).toBeCloseTo(60 / 2, 9);
    // Dazwischen: Bedienungen übernehmen bis zu ihrer Kapazität, der Rest holt ab.
    const partial = productionCapacity(60, 2, 10);
    expect(partial).toBeCloseTo((60 + 10 * pickup) / (2 + pickup), 9);
    expect(partial).toBeGreaterThan(productionCapacity(60, 2, 0));
    expect(partial).toBeLessThan(productionCapacity(60, 2, 1000));
    // Stetig an der Grenze, wo die Bedienungen genau ausgelastet sind.
    expect(productionCapacity(60, 2, 30)).toBeCloseTo(30, 9);
    expect(productionCapacity(60, 2, 30 - 1e-9)).toBeCloseTo(30, 6);
    // Ohne Karte gibt es nichts zuzubereiten.
    expect(productionCapacity(60, 0, 10)).toBe(0);
  });

  it('Ausgabe: Bedienungen × Tempo / Ø Servicezeit (Übergabe und Tischservice gemischt)', () => {
    const s = BALANCE.service;
    expect(averageServeTime()).toBeCloseTo(
      (1 - s.dineInShare) * s.handoverMin + s.dineInShare * s.tableServiceMin,
      9,
    );
    const serving = getStationDef('servingStation');
    expect(serviceCapacity(loc(make()))).toBe(0);
    const one = loc(make({ staff: team({ waiter: 1 }) }));
    expect(serviceCapacity(one)).toBeCloseTo(
      (getStationSpeed(serving, 0) * 60) / averageServeTime(),
      9,
    );
    expect(serviceCapacity(loc(make({ staff: team({ waiter: 4 }) })))).toBeCloseTo(
      4 * serviceCapacity(one),
      9,
    );
  });

  it('eine Bedienung entlastet den Barista am Engpass und bringt Tischservice', () => {
    const without = computeLocationRates(busy({ cashier: 10, barista: 1 }), LOC);
    const withWaiter = computeLocationRates(busy({ cashier: 10, barista: 1, waiter: 1 }), LOC);
    expect(without.bottleneck).toBe('production');
    expect(without.tableServiceShare).toBe(0);
    expect(withWaiter.stages.production).toBeGreaterThan(without.stages.production);
    expect(withWaiter.stages.production).toBeCloseTo(
      productionCapacity(60, withWaiter.loadPerCustomer, withWaiter.stages.service),
      9,
    );
    expect(withWaiter.served).toBeGreaterThan(without.served);
    expect(withWaiter.tableServiceShare).toBeGreaterThan(0);
    expect(withWaiter.satisfaction.tableService).toBeCloseTo(
      withWaiter.tableServiceShare * BALANCE.service.tableServiceSatisfaction,
      9,
    );
  });

  it('Gesamtdurchsatz ist die kleinere Stufe von Bestellung und Zubereitung; der Engpass wird benannt', () => {
    const o = computeLocationRates(busy({ cashier: 1, barista: 10 }), LOC);
    expect(o.bottleneck).toBe('order');
    expect(o.totalThroughput).toBeCloseTo(o.stages.order, 9);
    expect(o.served).toBeCloseTo(o.stages.order, 9);
    expect(o.waitPressure).toBeGreaterThan(0);
    const p = computeLocationRates(busy({ cashier: 10, barista: 1 }), LOC);
    expect(p.bottleneck).toBe('production');
    expect(p.totalThroughput).toBeCloseTo(p.stages.production, 9);
    expect(p.served).toBeCloseTo(p.stages.production, 9);
    // Ohne Bedienung bremst die Ausgabe nie: die Gäste holen an der Theke ab.
    expect(p.stages.service).toBe(0);
    expect(p.served).toBeGreaterThan(0);
    const quiet = computeLocationRates(make(), LOC);
    expect(quiet.bottleneck).toBe('demand');
    expect(quiet.served).toBeCloseTo(quiet.spawnRate, 9);
    expect(quiet.waitPressure).toBe(0);
  });

  it('jede weitere Kraft am Engpass erhöht Durchsatz und Einkommen', () => {
    for (const role of ['cashier', 'barista'] as const) {
      const others = { cashier: 10, barista: 10, [role]: 1 };
      const a = computeLocationRates(busy(others), LOC);
      const b = computeLocationRates(busy({ ...others, [role]: 2 }), LOC);
      expect(a.bottleneck).toBe(getStaffDef(role).stage);
      expect(b.bottleneck).toBe(getStaffDef(role).stage);
      expect(b.totalThroughput).toBeCloseTo(a.totalThroughput * 2, 9);
      expect(b.incomePerHour.gt(a.incomePerHour)).toBe(true);
    }
  });

  it('eine Kraft an einer Stufe, die nicht bremst, bringt nichts', () => {
    const s = make();
    const more = withLocation(s, LOC, { ...loc(s), staff: team({ cashier: 2, barista: 2 }) });
    const a = computeLocationRates(s, LOC);
    const b = computeLocationRates(more, LOC);
    expect(a.bottleneck).toBe('demand');
    expect(b.served).toBeCloseTo(a.served, 9);
    expect(b.incomePerHour.eq(a.incomePerHour)).toBe(true);
  });
});

describe('Sauberkeit (GAME_DESIGN § 7.3), pro Spielstunde', () => {
  const c = BALANCE.cleanliness;
  const power = c.cleanPerCleanerPerHour * c.dirtFactor;

  it('Schmutz wächst mit den Gästen', () => {
    expect(dirtPerHour(0)).toBe(c.decayPerHour);
    expect(dirtPerHour(10)).toBeCloseTo(c.decayPerHour + 10 * c.dirtPerCustomer, 12);
    expect(dirtPerHour(-5)).toBe(c.decayPerHour);
  });

  it('ohne Putzkraft fällt sie mit dem Schmutz bis 0', () => {
    const l = loc(make({ cleanliness: 100 }));
    expect(cleanPerHour(l)).toBe(0);
    expect(cleanlinessRatePerHour(l, 0)).toBe(-c.decayPerHour);
    expect(advanceCleanliness(l, 1, 0)).toBeCloseTo(100 - c.decayPerHour, 12);
    expect(advanceCleanliness(l, 2, 10)).toBeCloseTo(100 - 2 * dirtPerHour(10), 12);
    expect(advanceCleanliness(l, 1e4, 0)).toBe(0);
    expect(cleanlinessEquilibrium(l, 0)).toBe(0);
  });

  it('eine Putzkraft putzt umso mehr, je dreckiger es ist', () => {
    const clean = loc(make({ cleanliness: 100, staff: team({ cleaner: 1 }) }));
    expect(cleanPerHour(clean)).toBe(0);
    const half = loc(make({ cleanliness: 50, staff: team({ cleaner: 1 }) }));
    expect(cleanPerHour(half)).toBeCloseTo(power * 0.5, 12);
    expect(cleanPerHour(half, 0)).toBeCloseTo(power, 12);
    expect(cleanlinessRatePerHour(half, 0)).toBeCloseTo(power * 0.5 - c.decayPerHour, 12);
    expect(cleanlinessRatePerHour(half, 20)).toBeCloseTo(power * 0.5 - dirtPerHour(20), 12);
  });

  it('Gleichgewicht: 100 × (1 − Schmutz/Putzleistung), mehr Putzkräfte → sauberer', () => {
    const one = loc(make({ staff: team({ cleaner: 1 }) }));
    expect(cleanlinessEquilibrium(one, 0)).toBeCloseTo(100 * (1 - c.decayPerHour / power), 9);
    const two = loc(make({ staff: team({ cleaner: 2 }) }));
    expect(cleanlinessEquilibrium(two, 0)).toBeGreaterThan(cleanlinessEquilibrium(one, 0));
    // Viele Gäste machen mehr Dreck, als eine Putzkraft schafft.
    const crowd = (2 * (power - c.decayPerHour)) / c.dirtPerCustomer;
    expect(cleanlinessEquilibrium(one, crowd)).toBe(0);
    expect(
      cleanlinessEquilibrium(loc(make({ staff: team({ cleaner: 20 }) })), crowd),
    ).toBeGreaterThan(0);
  });

  it('advanceCleanliness löst die Gleichung exakt: ein langer Schritt = viele kurze', () => {
    const l = loc(make({ cleanliness: 30, staff: team({ cleaner: 2 }) }));
    let cur = l;
    for (let i = 0; i < 600; i++) {
      cur = { ...cur, cleanliness: advanceCleanliness(cur, 1 / 60, 12) };
    }
    expect(cur.cleanliness).toBeCloseTo(advanceCleanliness(l, 10, 12), 9);
    // Es konvergiert gegen das Gleichgewicht und bleibt dort.
    const eq = cleanlinessEquilibrium(l, 12);
    expect(advanceCleanliness(l, 1e4, 12)).toBeCloseTo(eq, 6);
    expect(advanceCleanliness({ ...l, cleanliness: eq }, 10, 12)).toBeCloseTo(eq, 9);
    expect(advanceCleanliness({ ...l, cleanliness: 150 }, 0, 12)).toBe(100);
    expect(advanceCleanliness(l, -5, 12)).toBeCloseTo(30, 12);
  });

  it('Sauberkeit geht in das Zufriedenheits-Ziel ein: (c − neutral) × Gewicht', () => {
    const s = BALANCE.satisfaction;
    const clean = computeLocationRates(make({ cleanliness: 100 }), LOC).satisfaction;
    const dirty = computeLocationRates(make({ cleanliness: 0 }), LOC).satisfaction;
    expect(clean.cleanliness).toBeCloseTo((100 - s.cleanlinessNeutral) * s.cleanlinessWeight, 9);
    expect(dirty.cleanliness).toBeCloseTo(-s.cleanlinessNeutral * s.cleanlinessWeight, 9);
    expect(clean.target - dirty.target).toBeCloseTo(100 * s.cleanlinessWeight, 9);
  });

  it('im Betrieb fällt sie mit dem Verkehr, nachts bleibt sie stehen', () => {
    const s = make({ cleanliness: 100 });
    const served = computeLocationRates(s, LOC).served;
    // Eine geöffnete Spielstunde in einem Tick.
    const hour = tick(s, (60 / TIME.openMinutesPerSec) * 1000);
    expect(loc(hour).cleanliness).toBeCloseTo(advanceCleanliness(loc(s), 1, served), 6);
    expect(loc(hour).cleanliness).toBeLessThan(100 - c.decayPerHour);
    const night = at(make({ cleanliness: 50 }), NIGHT);
    expect(loc(tick(night, 10_000)).cleanliness).toBe(50);
  });
});

describe('Abnahme: Putzkräfte halten Zufriedenheit und Einnahmen stabil', () => {
  const daySec = realSecondsPerDay(HOURS);
  /** Startcafé mit genug Matcha: ein Tag Anlauf, dann drei Tage ohne Eingriff. */
  const run = (cleaners: number): { s0: GameState; s1: GameState } => {
    const s = createInitialState(0);
    const l = loc(s);
    const start = withLocation(s, LOC, {
      ...l,
      supply: plenty(l),
      staff: cleaners > 0 ? team({ cleaner: cleaners }) : l.staff,
    });
    const s0 = advanceRealSeconds(start, daySec);
    return { s0, s1: advanceRealSeconds(s0, 3 * daySec) };
  };

  it('ohne Putzkraft sinken Zufriedenheit und Einkommen sichtbar', () => {
    const { s0, s1 } = run(0);
    expect(loc(s1).satisfaction).toBeLessThan(loc(s0).satisfaction - 5);
    expect(peakIncomePerHour(s1, LOC).lt(peakIncomePerHour(s0, LOC))).toBe(true);
  });

  it('mit Putzkräften bleibt beides stabil', () => {
    const { s0, s1 } = run(getStaffDef('cleaner').maxLevel);
    expect(Math.abs(loc(s1).satisfaction - loc(s0).satisfaction)).toBeLessThan(1);
    expect(loc(s1).cleanliness).toBeGreaterThan(85);
    expect(peakIncomePerHour(s1, LOC).toNumber()).toBeGreaterThanOrEqual(
      peakIncomePerHour(s0, LOC).toNumber() * 0.99,
    );
  });
});

describe('Filialleiter', () => {
  it('Offline-Deckel in Spieltagen: 2 ohne, bis 6 mit Filialleiter; der beste Filialleiter zählt', () => {
    const table = BALANCE.offline.capDaysByManagerLevel;
    const max = getStaffDef('manager').maxLevel;
    // Vorgabe Vincent: ohne Filialleiter 2 Spieltage, mit Filialleiter bis 6; jede Stufe bringt mehr.
    expect(table).toHaveLength(max + 1);
    expect(table[0]).toBe(2);
    expect(table[max]).toBe(6);
    for (let lvl = 1; lvl <= max; lvl++) {
      expect(table[lvl]).toBeGreaterThan(table[lvl - 1] ?? Infinity);
      expect(getOfflineCapDays(make({ staff: team({ manager: lvl }) }))).toBe(table[lvl]);
    }
    expect(getOfflineCapDays(make())).toBe(table[0]);
    expect(getOfflineCapDays(make({ staff: team({ manager: 100 }) }))).toBe(table[max]);
    const s = make();
    const two = withLocation(s, 'kyoto', { ...loc(s), staff: team({ manager: 2 }) });
    expect(getOfflineCapDays(two)).toBe(table[2]);
    // In echter Zeit: so lange dauern die Spieltage mit den Öffnungszeiten des aktiven Cafés.
    const day = realSecondsPerDay(loc(s).hours) * 1000;
    expect(getOfflineCapMs(s)).toBeCloseTo(table[0] * day, 6);
  });

  it('Auto-Kauf-Schalter geht nur mit Filialleiter an', () => {
    const s = make();
    expect(canAutoBuy(loc(s))).toBe(false);
    expect(setAutoBuy(s, LOC, true)).toBe(s);
    const m = make({ staff: team({ manager: BALANCE.manager.autoBuyFromLevel }) });
    expect(canAutoBuy(loc(m))).toBe(true);
    const on = setAutoBuy(m, LOC, true);
    expect(loc(on).autoBuy).toBe(true);
    expect(setAutoBuy(on, LOC, true)).toBe(on);
    expect(loc(setAutoBuy(on, LOC, false)).autoBuy).toBe(false);
  });
});

describe('Filialleiter: Auto-Kauf mit Reserve', () => {
  /** Kleines Café (Café-Level 1) mit Filialleiter und `coins` Euro. */
  const managed = (coins: number, autoBuy = true): GameState => {
    const s = at(createInitialState(0), PEAK);
    const m = withLocation(s, LOC, { ...loc(s), coins: D(coins), staff: team({ manager: 1 }) });
    return autoBuy ? setAutoBuy(m, LOC, true) : m;
  };

  it('Reserve: Löhne eines Öffnungstags, Tagesmiete und Matcha-Einkauf eines Tags', () => {
    const s = managed(0);
    const l = loc(s);
    // Sonst gibt der Auto-Kauf das Geld aus, das um Mitternacht die Nachbestellung braucht.
    expect(dailyMatchaCost(s, LOC).toNumber()).toBeGreaterThan(0);
    expect(autoBuyReserve(s, LOC).toNumber()).toBeCloseTo(
      (wagesPerOpenHour(l, LOC) * openHoursPerDay(l.hours) +
        rentPerDay(l, LOC) +
        dailyMatchaCost(s, LOC).toNumber()) *
        BALANCE.manager.autoBuyReserveDays,
      9,
    );
    // Länger geöffnet = mehr Löhne = mehr Reserve.
    const long = setOpeningHours(s, LOC, { open: 6, close: 22 });
    expect(autoBuyReserve(long, LOC).gt(autoBuyReserve(s, LOC))).toBe(true);
  });

  it('kauft das günstigste Gerät, wenn danach die Reserve bleibt', () => {
    const probe = managed(0);
    const pick = getCheapestStation(probe, LOC);
    expect(pick).not.toBeNull();
    if (!pick) return;
    const reserve = autoBuyReserve(probe, LOC).toNumber();
    const enough = managed(reserve + pick.cost.toNumber() + 1);
    const n = autoBuyStep(enough, LOC);
    expect(n).toEqual(buyStation(enough, LOC, pick.id, 1));
    expect(loc(n).stations[pick.id]?.level).toBe((loc(enough).stations[pick.id]?.level ?? 0) + 1);
    expect(loc(n).coins.toNumber()).toBeGreaterThanOrEqual(reserve);
    // Ein Cent zu wenig: die Reserve bleibt unangetastet.
    const tight = managed(reserve + pick.cost.toNumber() - 0.01);
    expect(autoBuyStep(tight, LOC)).toBe(tight);
    // Nicht eingeschaltet: nichts.
    const off = managed(1e6, false);
    expect(autoBuyStep(off, LOC)).toBe(off);
  });

  it('ohne Geld oder ohne Filialleiter passiert nichts; tick kauft automatisch', () => {
    const poor = managed(0);
    expect(autoBuyStep(poor, LOC)).toBe(poor);
    const fired = fireStaff(managed(1e6), LOC, 'manager');
    expect(autoBuyStep(fired, LOC)).toBe(fired);
    // Auch ein alter Spielstand mit eingeschaltetem Schalter kauft ohne Filialleiter nicht.
    const stale = withLocation(fired, LOC, { ...loc(fired), autoBuy: true });
    expect(autoBuyStep(stale, LOC)).toBe(stale);
    const rich = managed(1e6);
    const pick = getCheapestStation(rich, LOC);
    expect(pick).not.toBeNull();
    if (!pick) return;
    const before = loc(rich).stations[pick.id]?.level ?? 0;
    expect(loc(tick(rich, BALANCE.tickMs)).stations[pick.id]?.level).toBe(before + 1);
  });

  it('ohne freigeschaltete Ausstattung gibt es keinen Kandidaten', () => {
    expect(getCheapestStation(make({ level: 0 }), LOC)).toBeNull();
  });
});

describe('Personal-Vorschau', () => {
  it('Hauptzeit: die geöffnete Stunde mit den meisten Gästen, auch nachts', () => {
    const s = at(createInitialState(0), NIGHT);
    const l = loc(s);
    const h = peakHour(s, LOC);
    expect(isOpenHour(l.hours, h)).toBe(true);
    const spawn = (hour: number): number =>
      computeLocationRates(s, LOC, { hour, influencerHype: false }).spawnRate;
    for (let x = l.hours.open; x < l.hours.close; x++) {
      expect(spawn(x)).toBeLessThanOrEqual(spawn(h));
    }
    const p = peakRates(s, LOC);
    expect(p).toEqual(computeLocationRates(s, LOC, { hour: h, influencerHype: false }));
    // Nachts verdient das Café nichts, die Vorschau zeigt trotzdem die Hauptzeit.
    expect(getIncomePerHour(s, LOC).toNumber()).toBe(0);
    expect(p.open).toBe(true);
    expect(p.incomePerHour.gt(0)).toBe(true);
  });

  it('Barista am Engpass: Mehreinkommen zur Hauptzeit und sein Lohn', () => {
    const s = busy({ cashier: 10, barista: 1 });
    const p = previewStaffHire(s, LOC, 'barista');
    const h = peakHour(s, LOC);
    const after = withLocation(s, LOC, { ...loc(s), staff: team({ cashier: 10, barista: 2 }) });
    const income = (x: GameState): number =>
      computeLocationRates(x, LOC, { hour: h, influencerHype: false }).incomePerHour.toNumber();
    expect(p.incomeDelta.toNumber()).toBeCloseTo(income(after) - income(s), 6);
    expect(p.incomeDelta.gt(0)).toBe(true);
    expect(p.wageDelta).toBeCloseTo(getStaffDef('barista').wage * SCALE, 9);
  });

  it('eine Kraft an einer Stufe, die nicht bremst, bringt kein Einkommen', () => {
    const p = previewStaffHire(make(), LOC, 'cashier');
    expect(p.incomeDelta.toNumber()).toBe(0);
    expect(p.satisfactionDelta).toBe(0);
    expect(p.wageDelta).toBeCloseTo(getStaffDef('cashier').wage * SCALE, 9);
    const manager = previewStaffHire(make(), LOC, 'manager');
    expect(manager.incomeDelta.toNumber()).toBe(0);
    expect(manager.wageDelta).toBeCloseTo(getStaffDef('manager').wage * SCALE, 9);
  });

  it('Putzkraft: Zufriedenheit, sobald sich die Sauberkeit eingependelt hat', () => {
    const dirty = make({ cleanliness: 30 });
    const p = previewStaffHire(dirty, LOC, 'cleaner');
    const h = peakHour(dirty, LOC);
    const served = computeLocationRates(dirty, LOC, { hour: h, influencerHype: false }).served;
    const eq = cleanlinessEquilibrium({ ...loc(dirty), staff: team({ cleaner: 1 }) }, served);
    // Ohne Putzkraft geht die Sauberkeit langfristig auf 0, mit einer auf das Gleichgewicht.
    expect(p.satisfactionDelta).toBeCloseTo(BALANCE.satisfaction.cleanlinessWeight * eq, 6);
    expect(p.incomeDelta.toNumber()).toBe(0);
    expect(p.wageDelta).toBeCloseTo(getStaffDef('cleaner').wage * SCALE, 9);
  });

  it('Bedienung: Tischservice hebt Zufriedenheit und Trinkgeld', () => {
    const p = previewStaffHire(make(), LOC, 'waiter');
    expect(p.satisfactionDelta).toBeCloseTo(BALANCE.service.tableServiceSatisfaction, 6);
    expect(p.incomeDelta.gt(0)).toBe(true);
    expect(p.wageDelta).toBeCloseTo(getStaffDef('waiter').wage * SCALE, 9);
  });
});
