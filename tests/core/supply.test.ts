import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  createSupply,
  getLocation,
  withLocation,
  type GameState,
  type LocationState,
  type StationState,
  type SupplyOrder,
  type SupplyState,
} from '@core/GameState';
import { D } from '@core/math';
import { advanceRealSeconds, getItemPrice, menuTier } from '@core/economy';
import { computeLocationRates, type LocationRates } from '@core/customers';
import { getMetaEffects } from '@core/prestige';
import {
  autoReorderStep,
  canOrderMatcha,
  consumeMatcha,
  dailyMatchaNeed,
  deliveryArrival,
  getExpressFee,
  getOrderCost,
  getPackageCost,
  gradeInUse,
  gramsInTransit,
  isGradeUnlocked,
  nextArrival,
  orderMatcha,
  receiveDeliveries,
  setAutoReorder,
  setServedGrade,
  stockDays,
  totalStock,
} from '@core/supply';
import { clockSpeed, minuteOfDay, minutesToNextHour } from '@core/time';
import { BALANCE } from '@data/balance';
import { LOCATIONS } from '@data/locations';
import { DELIVERY, MATCHA_GRADES, MATCHA_PACKAGES, MAX_GRADE, getGradeDef } from '@data/matcha';
import { getMetaUpgradeDef } from '@data/prestige';
import { PRODUCT_LINES, type StationDef } from '@data/stations';
import { OPENING_HOURS, TIME } from '@data/time';

const LOC = 'berlin';
const HOUR = 60;
/** Spieluhr-Minute `hour:00` am Spieltag `day`. */
const at = (day: number, hour: number): number => day * TIME.minutesPerDay + hour * HOUR;
/** Eine Stunde nach der Standard-Öffnung (geöffnet) bzw. nach Ladenschluss (geschlossen). */
const MORNING = OPENING_HOURS.default.open + 1;
const EVENING = OPENING_HOURS.default.close + 1;
const ALL_GRADES_LEVEL = Math.max(...MATCHA_GRADES.map((g) => g.unlockCafeLevel));
const BIG = MATCHA_PACKAGES.length - 1;
const MATCHA_BAR = PRODUCT_LINES.find((d) => d.matchaGrams > 0);
const NO_MATCHA_LINE = PRODUCT_LINES.find((d) => d.matchaGrams === 0);

const pkg = (i: number): { grams: number; discount: number } => {
  const p = MATCHA_PACKAGES[i];
  if (!p) throw new Error(`keine Packung ${String(i)}`);
  return p;
};
const line = (def: StationDef | undefined): StationDef => {
  if (!def) throw new Error('data/stations hat die erwartete Produktlinie nicht');
  return def;
};
/** Lager mit diesen Gramm je Sorte, der Rest leer. */
const stockOf = (grams: Partial<Record<number, number>>): number[] =>
  MATCHA_GRADES.map((g) => grams[g.grade] ?? 0);

/** Café zur Spieluhr-Zeit `clock` (Standard: Vormittag Tag 0), alle Sorten freigeschaltet, genug Geld. */
const make = (
  patch: Partial<LocationState> = {},
  supply: Partial<SupplyState> = {},
  clock = at(0, MORNING),
): GameState => {
  const s0 = createInitialState(0);
  const s: GameState = { ...s0, clock, hourMark: Math.floor(clock / HOUR) };
  const base = getLocation(s, LOC);
  return withLocation(s, LOC, {
    ...base,
    coins: D(1e6),
    level: ALL_GRADES_LEVEL,
    ...patch,
    supply: { ...base.supply, ...supply },
  });
};
const loc = (s: GameState): LocationState => getLocation(s, LOC);
const sup = (s: GameState): SupplyState => loc(s).supply;
const withSupply = (s: GameState, patch: Partial<SupplyState>): GameState =>
  withLocation(s, LOC, { ...loc(s), supply: { ...sup(s), ...patch } });
const firstOrder = (s: GameState): SupplyOrder => {
  const o = sup(s).orders[0];
  if (!o) throw new Error('keine Bestellung unterwegs');
  return o;
};

/** Café-Betrieb bis zur Spieluhr-Zeit `clock` (stundenweise, damit das Tempo je Abschnitt fest ist). */
const runUntil = (state: GameState, clock: number): GameState => {
  let s = state;
  for (let i = 0; s.clock < clock - 1e-9; i++) {
    if (i > 10_000) throw new Error('Spieluhr kommt nicht voran');
    const minutes = Math.min(minutesToNextHour(s.clock), clock - s.clock);
    s = advanceRealSeconds(s, minutes / clockSpeed(s));
  }
  return s;
};

describe('Matcha-Sorten (GAME_DESIGN § 8)', () => {
  it('der Lieferant liefert eine Sorte ab ihrem Café-Level', () => {
    const base = loc(make());
    for (const g of MATCHA_GRADES) {
      expect(isGradeUnlocked({ ...base, level: g.unlockCafeLevel }, g.grade)).toBe(true);
      expect(isGradeUnlocked({ ...base, level: g.unlockCafeLevel - 1 }, g.grade)).toBe(false);
    }
    expect(isGradeUnlocked(base, -1)).toBe(false);
    expect(isGradeUnlocked(base, MATCHA_GRADES.length)).toBe(false);
    const start = loc(createInitialState(0));
    expect(isGradeUnlocked(start, start.supply.grade)).toBe(true);
  });

  it('bessere Sorte: teurer im Einkauf, höherer Preis, mehr Nachfrage, zufriedenere Gäste', () => {
    for (let g = 1; g <= MAX_GRADE; g++) {
      const a = getGradeDef(g - 1);
      const b = getGradeDef(g);
      expect(b.pricePerKg).toBeGreaterThan(a.pricePerKg);
      expect(b.priceMult).toBeGreaterThan(a.priceMult);
      expect(b.demandMult).toBeGreaterThan(a.demandMult);
      expect(b.satisfaction).toBeGreaterThanOrEqual(a.satisfaction);
      expect(b.unlockCafeLevel).toBeGreaterThanOrEqual(a.unlockCafeLevel);
    }
    expect(() => getGradeDef(MATCHA_GRADES.length)).toThrow();
  });
});

describe('Bestellkosten', () => {
  it('Packung = Kilopreis × Menge × (1 − Mengenrabatt) × Preisniveau', () => {
    for (const place of LOCATIONS) {
      for (const g of MATCHA_GRADES) {
        MATCHA_PACKAGES.forEach((p, i) => {
          expect(getPackageCost(g.grade, i, place.id).toNumber()).toBeCloseTo(
            ((g.pricePerKg * place.scale * p.grams) / 1000) * (1 - p.discount),
            6,
          );
        });
      }
    }
    expect(getPackageCost(0, MATCHA_PACKAGES.length, LOC).toNumber()).toBe(0);
  });

  it('größere Packungen sind je Gramm günstiger', () => {
    const perGram = (i: number): number => getPackageCost(0, i, LOC).toNumber() / pkg(i).grams;
    for (let i = 1; i < MATCHA_PACKAGES.length; i++) {
      expect(pkg(i).grams).toBeGreaterThan(pkg(i - 1).grams);
      expect(perGram(i)).toBeLessThan(perGram(i - 1));
    }
  });

  it('Express: Aufpreis = Anteil vom Warenwert + fester Betrag × Preisniveau', () => {
    const s = make();
    for (const place of LOCATIONS) {
      const goods = getOrderCost(s, place.id, MAX_GRADE, 1, false);
      const fee = goods.toNumber() * DELIVERY.expressFeeShare + DELIVERY.expressFee * place.scale;
      expect(goods.toNumber()).toBeCloseTo(getPackageCost(MAX_GRADE, 1, place.id).toNumber(), 9);
      expect(getExpressFee(goods, place.id).toNumber()).toBeCloseTo(fee, 9);
      expect(getOrderCost(s, place.id, MAX_GRADE, 1, true).toNumber()).toBeCloseTo(
        goods.toNumber() + fee,
        9,
      );
    }
  });

  it('mehrere Packungen kosten das Vielfache; Zen-Rabatt senkt den Warenwert', () => {
    const s = make();
    const one = getOrderCost(s, LOC, MAX_GRADE, 0, false).toNumber();
    expect(getOrderCost(s, LOC, MAX_GRADE, 0, false, 3).toNumber()).toBeCloseTo(3 * one, 9);
    const zen: GameState = { ...s, meta: { ...s.meta, metaUpgrades: { discount: 3 } } };
    const discount = getMetaEffects(zen).discount;
    expect(discount).toBeCloseTo(3 * getMetaUpgradeDef('discount').perLevel, 12);
    expect(getOrderCost(zen, LOC, MAX_GRADE, 0, false).toNumber()).toBeCloseTo(
      one * (1 - discount),
      9,
    );
  });
});

describe('Bestellen und Liefern', () => {
  it('normale Lieferung: sofort bezahlt (Tagesbilanz „matcha“), kommt am nächsten Liefermorgen', () => {
    const s = make();
    const cost = getOrderCost(s, LOC, MAX_GRADE, 0, false);
    expect(canOrderMatcha(s, LOC, MAX_GRADE, 0, false)).toBe(true);
    const n = orderMatcha(s, LOC, MAX_GRADE, 0);
    expect(loc(n).coins.eq(loc(s).coins.sub(cost))).toBe(true);
    expect(loc(n).ledger.today.matcha.toNumber()).toBeCloseTo(cost.toNumber(), 9);
    expect(sup(n).orders).toEqual([
      {
        grade: MAX_GRADE,
        grams: pkg(0).grams,
        arriveAt: deliveryArrival(s.clock, false),
        express: false,
      },
    ]);
    expect(minuteOfDay(firstOrder(n).arriveAt)).toBe(DELIVERY.standardHour * HOUR);
    expect(sup(n).stock).toEqual(sup(s).stock);
    expect(sup(n).bestGrade).toBe(MAX_GRADE);
    expect(n.stats.matchaOrders).toBe(s.stats.matchaOrders + 1);
    // Die beste je bestellte Sorte bleibt, auch wenn danach schlechtere kommt.
    expect(sup(orderMatcha(n, LOC, 0, 0)).bestGrade).toBe(MAX_GRADE);
  });

  it(`Liefertermin: zur Lieferstunde, frühestens ${String(DELIVERY.minLeadHours)} h nach der Bestellung`, () => {
    const lead = DELIVERY.minLeadHours * HOUR;
    for (let clock = at(1, 0); clock < at(3, 0); clock += 17) {
      const a = deliveryArrival(clock, false);
      expect(minuteOfDay(a)).toBe(DELIVERY.standardHour * HOUR);
      expect(a - clock).toBeGreaterThanOrEqual(lead);
      expect(a - clock).toBeLessThan(lead + TIME.minutesPerDay);
      expect(deliveryArrival(clock, true)).toBe(clock + DELIVERY.expressHours * HOUR);
    }
    const morning = at(2, DELIVERY.standardHour);
    expect(deliveryArrival(morning - lead - 1, false)).toBe(morning);
    expect(deliveryArrival(morning - lead, false)).toBe(morning);
    expect(deliveryArrival(morning - lead + 1, false)).toBe(morning + TIME.minutesPerDay);
  });

  it(`Express: Aufpreis, kommt nach ${String(DELIVERY.expressHours)} Spielstunden`, () => {
    const s = make();
    const cost = getOrderCost(s, LOC, 0, 1, true);
    expect(cost.gt(getOrderCost(s, LOC, 0, 1, false))).toBe(true);
    const n = orderMatcha(s, LOC, 0, 1, true);
    expect(loc(n).coins.eq(loc(s).coins.sub(cost))).toBe(true);
    expect(loc(n).ledger.today.matcha.toNumber()).toBeCloseTo(cost.toNumber(), 9);
    expect(sup(n).orders).toEqual([
      {
        grade: 0,
        grams: pkg(1).grams,
        arriveAt: s.clock + DELIVERY.expressHours * HOUR,
        express: true,
      },
    ]);
  });

  it('nicht bestellbar: Sorte gesperrt, unbekannte Packung, zu teuer – nichts passiert', () => {
    const price = getOrderCost(make(), LOC, 0, 0, false);
    const poor = make({ coins: price.sub(0.01) });
    const exact = make({ coins: price });
    const cases: [GameState, number, number, boolean][] = [
      [make({ level: getGradeDef(MAX_GRADE).unlockCafeLevel - 1 }), MAX_GRADE, 0, false],
      [make(), -1, 0, false],
      [make(), MATCHA_GRADES.length, 0, false],
      [make(), 0, MATCHA_PACKAGES.length, false],
      [poor, 0, 0, false],
      [exact, 0, 0, true],
    ];
    for (const [s, grade, p, express] of cases) {
      expect(canOrderMatcha(s, LOC, grade, p, express)).toBe(false);
      expect(orderMatcha(s, LOC, grade, p, express)).toBe(s);
    }
    expect(canOrderMatcha(exact, LOC, 0, 0, false)).toBe(true);
    expect(loc(orderMatcha(exact, LOC, 0, 0)).coins.toNumber()).toBeCloseTo(0, 9);
  });

  it(`höchstens ${String(DELIVERY.maxOrders)} Bestellungen gleichzeitig unterwegs`, () => {
    let s = make();
    for (let i = 0; i < DELIVERY.maxOrders; i++) s = orderMatcha(s, LOC, 0, 0, i % 2 === 0);
    expect(sup(s).orders).toHaveLength(DELIVERY.maxOrders);
    expect(s.stats.matchaOrders).toBe(DELIVERY.maxOrders);
    for (const express of [false, true]) {
      expect(canOrderMatcha(s, LOC, 0, 0, express)).toBe(false);
      expect(orderMatcha(s, LOC, 0, 0, express)).toBe(s);
    }
  });

  it('Ankunft: Ware ins Lager, Kurier-Zähler; spätere Bestellungen bleiben unterwegs', () => {
    const orders: SupplyOrder[] = [
      { grade: 1, grams: 1000, arriveAt: 100, express: false },
      { grade: 2, grams: 250, arriveAt: 100, express: true },
      { grade: 1, grams: 5000, arriveAt: 300, express: false },
    ];
    const s: SupplyState = { ...createSupply(), stock: stockOf({ 0: 40 }), orders, bestGrade: 2 };
    expect(nextArrival(s)).toBe(100);
    expect(gramsInTransit(s)).toBe(6250);
    expect(gramsInTransit(s, 1)).toBe(6000);
    expect(gramsInTransit(s, 0)).toBe(0);
    expect(receiveDeliveries(s, 99)).toBe(s);

    const r = receiveDeliveries(s, 100);
    expect(r.stock).toEqual(stockOf({ 0: 40, 1: 1000, 2: 250 }));
    expect(r.delivered).toBe(s.delivered + 2);
    expect(r.orders).toEqual([orders[2]]);
    expect(r.bestGrade).toBe(s.bestGrade);
    expect(nextArrival(r)).toBe(300);

    const all = receiveDeliveries(r, 1e9);
    expect(all.stock).toEqual(stockOf({ 0: 40, 1: 6000, 2: 250 }));
    expect(all.delivered).toBe(s.delivered + 3);
    expect(all.orders).toEqual([]);
    expect(nextArrival(all)).toBe(Infinity);
    expect(s.stock).toEqual(stockOf({ 0: 40 }));
  });
});

describe('Lager und Ausschank', () => {
  const supply = (stock: number[], grade: number): SupplyState => ({
    ...createSupply(),
    stock,
    grade,
  });

  it('gewählte Sorte, solange vorrätig, sonst die beste vorrätige; −1 ohne Matcha', () => {
    expect(gradeInUse(supply(stockOf({ 0: 10, 3: 10 }), 0))).toBe(0);
    expect(gradeInUse(supply(stockOf({ 1: 10, 3: 10 }), 0))).toBe(3);
    expect(gradeInUse(supply(stockOf({ 1: 10, 3: 10 }), MAX_GRADE))).toBe(3);
    expect(gradeInUse(supply(stockOf({ 1: 10 }), 3))).toBe(1);
    expect(gradeInUse(supply(stockOf({}), 2))).toBe(-1);
  });

  it('Verbrauch zieht von der Sorte im Ausschank ab, nie unter null', () => {
    const base = supply(stockOf({ 0: 100, 2: 30 }), 2);
    const a = consumeMatcha(base, 12.5);
    expect(a.stock).toEqual(stockOf({ 0: 100, 2: 17.5 }));
    const b = consumeMatcha(a, 50);
    expect(b.stock).toEqual(stockOf({ 0: 100 }));
    expect(gradeInUse(b)).toBe(0);
    expect(b.grade).toBe(2);
    expect(consumeMatcha(b, 40).stock).toEqual(stockOf({ 0: 60 }));
    for (const grams of [0, -5, Number.NaN]) expect(consumeMatcha(b, grams)).toBe(b);
    const empty = supply(stockOf({}), 0);
    expect(consumeMatcha(empty, 5)).toBe(empty);
    // Rundungsreste vieler kleiner Abschnitte zählen als leer.
    expect(consumeMatcha(supply(stockOf({ 2: 1 }), 2), 1 - 1e-12).stock[2]).toBe(0);
    expect(base.stock).toEqual(stockOf({ 0: 100, 2: 30 }));
  });

  it('Gesamtvorrat zählt alle Sorten', () => {
    expect(totalStock(supply(stockOf({ 0: 100, 2: 30, [MAX_GRADE]: 5 }), 0))).toBe(135);
    expect(totalStock(supply(stockOf({}), 0))).toBe(0);
    expect(totalStock(createSupply())).toBe(DELIVERY.startStockGrams);
  });

  it('Sorte im Ausschank wählen: nur freigeschaltete; ist sie leer, nimmt die Bar die beste vorrätige', () => {
    const level = getGradeDef(2).unlockCafeLevel;
    const s = make({ level }, { stock: stockOf({ 0: 100 }), grade: 0 });
    const n = setServedGrade(s, LOC, 2);
    expect(sup(n).grade).toBe(2);
    expect(setServedGrade(n, LOC, 2)).toBe(n);
    for (const g of [-1, MATCHA_GRADES.length]) expect(setServedGrade(s, LOC, g)).toBe(s);
    for (const g of MATCHA_GRADES.filter((d) => d.unlockCafeLevel > level)) {
      expect(setServedGrade(s, LOC, g.grade)).toBe(s);
    }
    expect(computeLocationRates(n, LOC).grade).toBe(0);
    expect(
      computeLocationRates(withSupply(n, { stock: stockOf({ 0: 100, 2: 5 }) }), LOC).grade,
    ).toBe(2);
  });
});

describe('Tagesbedarf und automatische Nachbestellung', () => {
  it('Tagesbedarf = Verbrauch über die geöffneten Stunden, auch bei leerem Lager', () => {
    const s = make();
    const { open, close } = loc(s).hours;
    let sum = 0;
    for (let h = open; h < close; h++) {
      sum += computeLocationRates(s, LOC, { hour: h, influencerHype: false }).matchaGramsPerHour;
    }
    const need = dailyMatchaNeed(s, LOC);
    expect(need).toBeGreaterThan(0);
    expect(need).toBeCloseTo(sum, 9);
    const empty = withSupply(s, { stock: stockOf({}) });
    expect(dailyMatchaNeed(empty, LOC)).toBeCloseTo(need, 9);
    expect(stockDays(s, LOC)).toBeCloseTo(totalStock(sup(s)) / need, 9);
    expect(stockDays(empty, LOC)).toBe(0);

    const longer = make({
      hours: {
        open: Math.max(OPENING_HOURS.earliestOpen, open - 1),
        close: Math.min(OPENING_HOURS.latestClose, close + 1),
      },
    });
    expect(dailyMatchaNeed(longer, LOC)).toBeGreaterThan(need);

    const stations: Record<string, StationState> = {};
    for (const [id, st] of Object.entries(loc(s).stations)) stations[id] = { ...st, level: 0 };
    const noProducts = make({ stations });
    expect(dailyMatchaNeed(noProducts, LOC)).toBe(0);
    expect(stockDays(noProducts, LOC)).toBe(Infinity);
  });

  it('an/aus und Packungsgröße; unbekannte Packung behält die alte', () => {
    const s = make();
    const on = setAutoReorder(s, LOC, true, BIG);
    expect(sup(on)).toMatchObject({ autoReorder: true, autoPackage: BIG, reorderFailed: false });
    expect(setAutoReorder(on, LOC, true, BIG)).toBe(on);
    expect(setAutoReorder(on, LOC, true)).toBe(on);
    expect(setAutoReorder(on, LOC, true, MATCHA_PACKAGES.length)).toBe(on);
    const off = setAutoReorder(on, LOC, false);
    expect(sup(off)).toMatchObject({ autoReorder: false, autoPackage: BIG });
    const failed = make({}, { autoReorder: true, reorderFailed: true });
    expect(sup(setAutoReorder(failed, LOC, false)).reorderFailed).toBe(false);
  });

  it(`bestellt nach, wenn Vorrat + Unterwegs für weniger als ${String(DELIVERY.reorderDays)} Öffnungstage reicht`, () => {
    const s = make({}, { autoReorder: true, autoPackage: 0, grade: 0, stock: stockOf({}) });
    const need = dailyMatchaNeed(s, LOC) * DELIVERY.reorderDays;
    const count = Math.max(1, Math.ceil(need / pkg(0).grams));
    const cost = getOrderCost(s, LOC, 0, 0, false, count);
    const n = autoReorderStep(s, LOC);
    expect(sup(n).orders).toEqual([
      {
        grade: 0,
        grams: count * pkg(0).grams,
        arriveAt: deliveryArrival(s.clock, false),
        express: false,
      },
    ]);
    expect(loc(n).coins.eq(loc(s).coins.sub(cost))).toBe(true);
    expect(loc(n).ledger.today.matcha.toNumber()).toBeCloseTo(cost.toNumber(), 9);
    expect(n.stats.matchaOrders).toBe(s.stats.matchaOrders + 1);
    // Was unterwegs ist, zählt mit: keine zweite Bestellung.
    expect(autoReorderStep(n, LOC)).toBe(n);

    // Nur die gewählte Sorte zählt; genug davon im Lager → nichts.
    const otherGrade = withSupply(s, { stock: stockOf({ [MAX_GRADE]: 10 * need }) });
    expect(sup(autoReorderStep(otherGrade, LOC)).orders).toHaveLength(1);
    const full = withSupply(s, { stock: stockOf({ 0: need + 1 }) });
    expect(autoReorderStep(full, LOC)).toBe(full);
    const partly = withSupply(s, { stock: stockOf({ 0: need / 2 }) });
    const rest = Math.max(1, Math.ceil((need - need / 2) / pkg(0).grams));
    expect(firstOrder(autoReorderStep(partly, LOC)).grams).toBe(rest * pkg(0).grams);
    const off = withSupply(s, { autoReorder: false });
    expect(autoReorderStep(off, LOC)).toBe(off);
  });

  it('reicht das Geld nicht, merkt es sich das für den Hinweis und bestellt nichts', () => {
    const s = make({ coins: D(0) }, { autoReorder: true, stock: stockOf({}) });
    const n = autoReorderStep(s, LOC);
    expect(sup(n).orders).toEqual([]);
    expect(sup(n).reorderFailed).toBe(true);
    expect(loc(n).coins.toNumber()).toBe(0);
    expect(autoReorderStep(n, LOC)).toBe(n);
    const rich = withLocation(n, LOC, { ...loc(n), coins: D(1e6) });
    const ok = autoReorderStep(rich, LOC);
    expect(sup(ok).orders).toHaveLength(1);
    expect(sup(ok).reorderFailed).toBe(false);
  });

  it('nicht bei voller Bestell-Liste oder gesperrter Sorte', () => {
    const orders: SupplyOrder[] = Array.from({ length: DELIVERY.maxOrders }, () => ({
      grade: 1,
      grams: 1,
      arriveAt: at(9, 0),
      express: false,
    }));
    const busy = make({}, { autoReorder: true, stock: stockOf({}), orders });
    expect(autoReorderStep(busy, LOC)).toBe(busy);
    const locked = make(
      { level: getGradeDef(MAX_GRADE).unlockCafeLevel - 1 },
      { autoReorder: true, grade: MAX_GRADE, stock: stockOf({}) },
    );
    expect(autoReorderStep(locked, LOC)).toBe(locked);
  });
});

describe('Matcha im Café-Betrieb (Spieluhr)', () => {
  it('geöffnet sinkt der Vorrat mit dem Verbrauch, geschlossen nicht', () => {
    const s = make();
    const r = computeLocationRates(s, LOC);
    expect(r.open).toBe(true);
    expect(r.matchaGramsPerHour).toBeGreaterThan(0);
    const n = runUntil(s, s.clock + HOUR);
    expect(sup(n).stock[0]).toBeCloseTo((sup(s).stock[0] ?? 0) - r.matchaGramsPerHour, 6);

    const night = make({}, {}, at(0, EVENING));
    expect(computeLocationRates(night, LOC).open).toBe(false);
    expect(sup(runUntil(night, night.clock + 3 * HOUR)).stock).toEqual(sup(night).stock);
  });

  it('Lieferungen kommen an: normal am Liefermorgen, Express nach ein paar Stunden', () => {
    // Die Bar schenkt die Grundsorte aus (genug Vorrat), geliefert wird eine andere Sorte.
    const s = make({}, { stock: stockOf({ 0: 1e5 }), grade: 0 }, at(0, 12));
    const ordered = orderMatcha(orderMatcha(s, LOC, 1, 0), LOC, 2, 0, true);
    const [normal, express] = sup(ordered).orders;
    if (!normal || !express) throw new Error('Bestellungen fehlen');

    const beforeExpress = runUntil(ordered, express.arriveAt - 1);
    expect(sup(beforeExpress).stock[2]).toBe(0);
    const afterExpress = runUntil(beforeExpress, express.arriveAt);
    expect(sup(afterExpress).stock[2]).toBe(express.grams);
    expect(sup(afterExpress).delivered).toBe(1);
    expect(sup(afterExpress).orders).toEqual([normal]);

    const beforeMorning = runUntil(afterExpress, normal.arriveAt - 1);
    expect(sup(beforeMorning).stock[1]).toBe(0);
    const morning = runUntil(beforeMorning, normal.arriveAt);
    expect(sup(morning).stock[1]).toBe(normal.grams);
    expect(sup(morning).delivered).toBe(2);
    expect(sup(morning).orders).toEqual([]);
  });

  it('automatische Nachbestellung um Mitternacht, Lieferung am Morgen', () => {
    const base = make();
    const need = dailyMatchaNeed(base, LOC) * DELIVERY.reorderDays;
    const s = setAutoReorder(withSupply(base, { stock: stockOf({ 0: need }) }), LOC, true);
    const evening = runUntil(s, at(0, 23));
    expect(sup(evening).orders).toEqual([]);
    const midnight = runUntil(evening, at(1, 0));
    expect(sup(midnight).orders).toHaveLength(1);
    const order = firstOrder(midnight);
    expect(order.arriveAt).toBe(deliveryArrival(at(1, 0), false));
    expect(midnight.stats.matchaOrders).toBe(1);
    const delivered = runUntil(midnight, order.arriveAt);
    expect(sup(delivered).delivered).toBe(1);
    expect(sup(delivered).orders).toEqual([]);
    expect(totalStock(sup(delivered))).toBeGreaterThan(totalStock(sup(midnight)));
  });

  it('ist die gewählte Sorte leer, schenkt die Bar die nächstbeste vorrätige aus', () => {
    const s = make({}, { grade: 2, stock: stockOf({ 0: 300, 2: 1 }) });
    const n = runUntil(s, s.clock + HOUR);
    expect(sup(n).stock[2]).toBe(0);
    expect(sup(n).stock[0]).toBeLessThan(300);
    expect(sup(n).grade).toBe(2);
    expect(computeLocationRates(n, LOC).grade).toBe(0);
  });

  it('Matcha geht aus: Matcha-Produkte fliegen von der Karte, weniger Nachfrage, Zufriedenheit sinkt', () => {
    const coffee = line(NO_MATCHA_LINE);
    const base = make();
    const stations = { ...loc(base).stations, [coffee.id]: { level: 1, unlocked: true } };
    const s = make({ stations }, { grade: 0, stock: stockOf({ 0: 1 }) });
    const out = runUntil(s, s.clock + HOUR);
    expect(totalStock(sup(out))).toBe(0);
    expect(gradeInUse(sup(out))).toBe(-1);

    const refilled = withSupply(out, { stock: stockOf({ 0: 1e4 }) });
    const opts = { influencerHype: false };
    const rOut = computeLocationRates(out, LOC, opts);
    const rIn = computeLocationRates(refilled, LOC, opts);
    expect(rOut.grade).toBe(-1);
    expect(rOut.matchaGramsPerHour).toBe(0);
    for (const def of PRODUCT_LINES.filter((d) => d.matchaGrams > 0)) {
      expect(rOut.perStation[def.id]).toBeUndefined();
    }
    expect(rIn.perStation[line(MATCHA_BAR).id]).toBeGreaterThan(0);
    expect(rOut.perStation[coffee.id]).toBeGreaterThan(0);

    // Nachfrage: × noMatchaMult statt × demandMult der Sorte (und die Matcha-Karte zieht nicht mehr).
    const menuDemand = (r: LocationRates): number =>
      Object.keys(r.perStation).reduce((a, id) => {
        const def = PRODUCT_LINES.find((d) => d.id === id);
        const tier = def ? menuTier(def, loc(out).stations[id]?.level ?? 0) : null;
        return a + (tier?.demand ?? 0);
      }, 0);
    expect(rOut.demand / rIn.demand).toBeCloseTo(
      ((1 + menuDemand(rOut)) / (1 + menuDemand(rIn))) *
        (BALANCE.demand.noMatchaMult / getGradeDef(0).demandMult),
      9,
    );

    // Zufriedenheit: Abzug „Matcha ausverkauft“ statt Bonus der Sorte.
    expect(rOut.satisfaction.matcha).toBe(BALANCE.satisfaction.noMatcha);
    expect(rIn.satisfaction.matcha).toBe(0);
    expect(rOut.satisfaction.quality).toBe(0);
    expect(rIn.satisfaction.quality).toBe(getGradeDef(0).satisfaction);
    expect(rOut.satisfaction.waitPressure).toBeCloseTo(rIn.satisfaction.waitPressure, 9);
    expect(rOut.satisfaction.tableService).toBeCloseTo(rIn.satisfaction.tableService, 9);
    expect(rOut.satisfaction.target - rIn.satisfaction.target).toBeCloseTo(
      BALANCE.satisfaction.noMatcha - getGradeDef(0).satisfaction,
      9,
    );

    // Eine Stunde weiter: ohne Matcha weniger Gäste und sinkende Zufriedenheit.
    const dry = runUntil(out, out.clock + HOUR);
    const wet = runUntil(refilled, refilled.clock + HOUR);
    expect(loc(dry).satisfaction).toBeLessThan(loc(wet).satisfaction);
    expect(dry.stats.customersServed - out.stats.customersServed).toBeLessThan(
      wet.stats.customersServed - refilled.stats.customersServed,
    );
  });

  it('bessere Sorte: höherer Preis der Matcha-Produkte, mehr Nachfrage, mehr Umsatz', () => {
    const bar = line(MATCHA_BAR);
    const withGrade = (grade: number): GameState =>
      make({}, { grade, stock: stockOf({ [grade]: 1e4 }) });
    const opts = { influencerHype: false };
    const r0 = computeLocationRates(withGrade(0), LOC, opts);
    const g0 = getGradeDef(0);
    const lvl = loc(withGrade(0)).stations[bar.id]?.level ?? 0;
    for (const g of MATCHA_GRADES) {
      const s = withGrade(g.grade);
      const r = computeLocationRates(s, LOC, opts);
      expect(r.grade).toBe(g.grade);
      expect(r.effectiveGrade).toBe(g.grade);
      expect(getItemPrice(bar, lvl, LOC, g.grade).toNumber()).toBeCloseTo(
        getItemPrice(bar, lvl, LOC, 0).toNumber() * (g.priceMult / g0.priceMult),
        9,
      );
      const unit = (x: LocationRates): number =>
        (x.perStationIncome[bar.id]?.toNumber() ?? 0) / (x.perStation[bar.id] ?? 1);
      expect(unit(r) / unit(r0)).toBeCloseTo(g.priceMult / g0.priceMult, 9);
      expect(r.demand / r0.demand).toBeCloseTo(g.demandMult / g0.demandMult, 9);
      expect(r.satisfaction.quality).toBe(g.satisfaction);
    }
    const revenue = (grade: number): number => {
      const s = withGrade(grade);
      return loc(runUntil(s, s.clock + HOUR)).ledger.today.revenue.toNumber();
    };
    expect(revenue(MAX_GRADE)).toBeGreaterThan(revenue(0));
    const best = withGrade(MAX_GRADE);
    const used =
      (sup(best).stock[MAX_GRADE] ?? 0) -
      (sup(runUntil(best, best.clock + HOUR)).stock[MAX_GRADE] ?? 0);
    expect(used).toBeGreaterThan(0);
  });
});
