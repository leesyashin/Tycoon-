import { describe, expect, it } from 'vitest';
import { BALANCE } from '@data/balance';
import { getGradeDef } from '@data/matcha';
import { getMetaUpgradeDef } from '@data/prestige';
import { PRODUCT_LINES } from '@data/stations';
import { DEMAND_CURVE, OPENING_HOURS, TIME } from '@data/time';
import {
  createDayLedger,
  createInitialState,
  getLocation,
  withLocation,
  type GameState,
  type LocationState,
} from '@core/GameState';
import { D } from '@core/math';
import {
  computeLocationRates,
  rentPerDay,
  utilitiesPerOpenHour,
  wagesPerOpenHour,
} from '@core/customers';
import {
  addToLedger,
  advanceRealSeconds,
  applyOffline,
  buyStation,
  catchUpOffline,
  gameMinutesToRealSec,
  getOfflineCapMs,
  getOfflineEfficiency,
  ledgerCosts,
  ledgerIncome,
  ledgerProfit,
  menuTier,
  payCost,
  rolloverLedger,
  simulateAway,
  sumLedgers,
} from '@core/economy';
import { cleanlinessEquilibrium, hireStaff } from '@core/staff';
import { orderMatcha } from '@core/supply';
import { dayOf, isOpenAt, realSecondsPerDay } from '@core/time';

const LOC = 'berlin';
const HOURS = OPENING_HOURS.default;
const DAY_SEC = realSecondsPerDay(HOURS);
/** Stunde mit der höchsten Nachfrage in den Standard-Öffnungszeiten. */
const PEAK = Array.from({ length: HOURS.close - HOURS.open }, (_, i) => HOURS.open + i).reduce(
  (best, h) => ((DEMAND_CURVE[h] ?? 0) > (DEMAND_CURVE[best] ?? 0) ? h : best),
  HOURS.open,
);
/** Eine Stunde, zu der kein Café geöffnet haben kann. */
const NIGHT = OPENING_HOURS.earliestOpen - 1;
/** Echte Sekunden für `minutes` Spielminuten geöffnet bzw. geschlossen. */
const openSec = (minutes: number): number => minutes / TIME.openMinutesPerSec;
const closedSec = (minutes: number): number => minutes / TIME.closedMinutesPerSec;

const fresh = (): GameState => createInitialState(0);
/** Spieluhr auf Tag 0, volle Stunde `hour` stellen (ohne nachzubuchende Stunden). */
const at = (s: GameState, hour: number): GameState => ({ ...s, clock: hour * 60, hourMark: hour });
const loc = (s: GameState): LocationState => getLocation(s, LOC);
const patch = (s: GameState, p: Partial<LocationState>): GameState =>
  withLocation(s, LOC, { ...loc(s), ...p });
/** Lager mit `grams` der Sorte im Ausschank, alle anderen leer. */
const stock = (s: GameState, grams: number): LocationState['supply'] => {
  const sup = loc(s).supply;
  return { ...sup, stock: sup.stock.map((_, i) => (i === sup.grade ? grams : 0)) };
};
/** Geld inklusive der offenen Bons an der Kasse. */
const money = (s: GameState): number => loc(s).coins.add(loc(s).till.open).toNumber();
/** Kosten (ohne Einkäufe) einer Tagesbilanz, wie sie stündlich anfallen. */
const running = (l: LocationState): number =>
  [l.ledger.today, l.ledger.yesterday ?? createDayLedger()].reduce(
    (a, d) => a + d.wages.add(d.goods).add(d.rent).toNumber(),
    0,
  );

/**
 * Café, das immer voll ist: viel mehr Nachfrage als Plätze. Dann ändert der Influencer-Hype (nur im Tick, nicht
 * offline) nichts an den Gästen, und beide Rechenwege lassen sich vergleichen.
 */
const packed = (): GameState => {
  const s = fresh();
  const l = loc(s);
  return patch(s, {
    ambience: { ...l.ambience, decor: 30 },
    social: { ...l.social, followers: 1e6 },
    supply: stock(s, 1e9),
    staff: { ...l.staff, cleaner: 2 },
  });
};

describe('advanceRealSeconds: Grundlagen', () => {
  it('negative oder ungültige Zeit ändert nichts', () => {
    const s = fresh();
    expect(advanceRealSeconds(s, -5)).toBe(s);
    expect(advanceRealSeconds(s, 0)).toBe(s);
    expect(advanceRealSeconds(s, Number.NaN)).toBe(s);
    expect(advanceRealSeconds(s, Infinity)).toBe(s);
  });

  it('ist pur und deterministisch', () => {
    const s = fresh();
    const before = structuredClone(s);
    const a = advanceRealSeconds(s, DAY_SEC);
    const b = advanceRealSeconds(s, DAY_SEC);
    expect(a).toEqual(b);
    expect(s).toEqual(before);
    expect(a.clock).toBeCloseTo(s.clock + TIME.minutesPerDay, 6);
  });

  it('gameMinutesToRealSec rechnet mit dem Tempo der Uhr jetzt', () => {
    expect(gameMinutesToRealSec(at(fresh(), PEAK), 30)).toBeCloseTo(openSec(30), 12);
    expect(gameMinutesToRealSec(at(fresh(), NIGHT), 30)).toBeCloseTo(closedSec(30), 12);
  });
});

describe('Geschlossenes Café', () => {
  it('nachts keine Gäste und kein Umsatz, aber die Miete läuft', () => {
    const s = patch(at(fresh(), NIGHT), { satisfaction: 40, cleanliness: 60 });
    const rent = rentPerDay(loc(s), LOC) / 24;
    const n = advanceRealSeconds(s, closedSec(60));
    const l = loc(n);
    expect(n.clock).toBeCloseTo(s.clock + 60, 9);
    expect(l.coins.toNumber()).toBeCloseTo(BALANCE.startCoins - rent, 9);
    expect(l.bills.count).toBe(1);
    expect(l.bills.last.toNumber()).toBeCloseTo(rent, 9);
    expect(l.bills.pending.toNumber()).toBe(0);
    expect(l.ledger.today.rent.toNumber()).toBeCloseTo(rent, 9);
    expect(l.ledger.today.wages.toNumber()).toBe(0);
    expect(l.ledger.today.goods.toNumber()).toBe(0);
    expect(l.ledger.today.guests).toBe(0);
    expect(ledgerIncome(l.ledger.today).toNumber()).toBe(0);
    expect(n.meta.lifetimeEarned.toNumber()).toBe(0);
    expect(l.till).toEqual(loc(s).till);
    // Ohne Gäste ändern sich Zufriedenheit und Sauberkeit nicht.
    expect(l.satisfaction).toBe(40);
    expect(l.cleanliness).toBe(60);
  });

  it('Löhne und Strom nur in der Öffnungszeit, die Miete rund um die Uhr', () => {
    const s = fresh();
    const l = loc(s);
    const open = computeLocationRates(s, LOC, { hour: PEAK });
    const closed = computeLocationRates(s, LOC, { hour: NIGHT });
    expect(open.open).toBe(true);
    expect(closed.open).toBe(false);
    expect(open.wagesPerHour.toNumber()).toBeCloseTo(wagesPerOpenHour(l, LOC), 9);
    expect(closed.wagesPerHour.toNumber()).toBe(0);
    expect(open.rentPerHour.toNumber()).toBeCloseTo(
      rentPerDay(l, LOC) / 24 + utilitiesPerOpenHour(l, LOC),
      9,
    );
    expect(closed.rentPerHour.toNumber()).toBeCloseTo(rentPerDay(l, LOC) / 24, 9);
    expect(closed.served).toBe(0);
    expect(closed.goodsPerHour.toNumber()).toBe(0);
    // Wer will, kann die Stunde trotzdem planen.
    expect(computeLocationRates(s, LOC, { hour: NIGHT, forceOpen: true }).open).toBe(true);
  });

  it('eine ganze Nacht kostet nur Miete und spult bis zur Öffnung vor', () => {
    const s = at(fresh(), HOURS.close);
    const closedHours = 24 - (HOURS.close - HOURS.open);
    const n = advanceRealSeconds(s, closedSec(closedHours * 60));
    expect(isOpenAt(loc(n), n.clock)).toBe(true);
    expect(dayOf(n.clock)).toBe(1);
    expect(loc(n).coins.toNumber()).toBeCloseTo(
      BALANCE.startCoins - (rentPerDay(loc(s), LOC) / 24) * closedHours,
      9,
    );
    expect(loc(n).bills.count).toBe(closedHours);
    expect(n.stats.customersServed).toBe(0);
  });
});

describe('Laufende Kosten: Abbuchung zur vollen Stunde', () => {
  it('sammeln sich in bills.pending und werden zur vollen Stunde abgebucht', () => {
    const s = at(fresh(), PEAK);
    const r = computeLocationRates(s, LOC);
    const half = advanceRealSeconds(s, openSec(30));
    const h = loc(half);
    const hourly = r.goodsPerHour.add(r.wagesPerHour).add(r.rentPerHour).toNumber();
    expect(h.bills.pending.toNumber()).toBeCloseTo(hourly / 2, 9);
    expect(h.bills.count).toBe(0);
    expect(h.ledger.today.wages.toNumber()).toBeCloseTo(r.wagesPerHour.toNumber() / 2, 9);
    expect(h.ledger.today.goods.toNumber()).toBeCloseTo(r.goodsPerHour.toNumber() / 2, 9);
    expect(h.ledger.today.rent.toNumber()).toBeCloseTo(r.rentPerHour.toNumber() / 2, 9);
    // Bis zur vollen Stunde kommt nur Geld dazu (bezahlte Bons).
    expect(h.coins.toNumber()).toBeCloseTo(
      BALANCE.startCoins + half.meta.lifetimeEarned.toNumber(),
      9,
    );

    const full = advanceRealSeconds(half, openSec(30));
    const f = loc(full);
    expect(full.clock).toBeCloseTo((PEAK + 1) * 60, 9);
    expect(f.bills.count).toBe(1);
    expect(f.bills.pending.toNumber()).toBe(0);
    // Abgebucht wird genau, was seit der letzten vollen Stunde angefallen ist.
    expect(f.bills.last.toNumber()).toBeCloseTo(running(f), 9);
    expect(f.coins.toNumber()).toBeCloseTo(
      BALANCE.startCoins + full.meta.lifetimeEarned.toNumber() - f.bills.last.toNumber(),
      9,
    );
  });

  it('über einen ganzen Tag: Konto = Start + bezahlte Bons − abgebuchte Kosten', () => {
    // Ohne automatische Nachbestellung (die bezahlt direkt, nicht über die Abbuchung zur vollen Stunde).
    const s = patch(fresh(), { supply: { ...loc(fresh()).supply, autoReorder: false } });
    const n = advanceRealSeconds(s, DAY_SEC);
    const l = loc(n);
    // Alles, was angefallen ist, steht in der Tagesbilanz; offen ist nur der Rest seit der letzten vollen Stunde.
    const booked = running(l) - l.bills.pending.toNumber();
    expect(l.coins.toNumber()).toBeCloseTo(
      BALANCE.startCoins + n.meta.lifetimeEarned.toNumber() - booked,
      6,
    );
    // Umsatz in der Tagesbilanz = bezahlte Bons + noch offene Bons.
    const income = ledgerIncome(l.ledger.today).add(
      l.ledger.yesterday ? ledgerIncome(l.ledger.yesterday) : 0,
    );
    expect(income.toNumber()).toBeCloseTo(n.meta.lifetimeEarned.add(l.till.open).toNumber(), 6);
    expect(l.earnedThisRun.eq(n.meta.lifetimeEarned)).toBe(true);
    // Je volle Stunde eine Abbuchung.
    expect(l.bills.count).toBe(n.hourMark - s.hourMark);
  });
});

describe('Tagesbilanz', () => {
  it('um Mitternacht wird heute zu gestern, und der neue Tag beginnt leer', () => {
    const s0 = at(fresh(), 23);
    const l0 = loc(s0);
    const s = patch(s0, {
      // Café 8–18 Uhr: um Mitternacht geschlossen.
      hours: { open: 8, close: 18 },
      ledger: addToLedger(l0.ledger, { guests: 5, revenue: D(10), tips: D(1) }),
      social: { ...l0.social, postsToday: 2 },
    });
    const rent = rentPerDay(loc(s), LOC) / 24;
    const n = advanceRealSeconds(s, closedSec(120));
    const l = loc(n);
    expect(dayOf(n.clock)).toBe(1);
    expect(l.ledger.day).toBe(1);
    expect(l.ledger.yesterday?.guests).toBe(5);
    expect(l.ledger.yesterday?.revenue.toNumber()).toBe(10);
    expect(l.ledger.yesterday?.tips.toNumber()).toBe(1);
    expect(l.ledger.yesterday?.rent.toNumber()).toBeCloseTo(rent, 9);
    expect(l.ledger.today.guests).toBe(0);
    expect(ledgerIncome(l.ledger.today).toNumber()).toBe(0);
    expect(l.ledger.today.rent.toNumber()).toBeCloseTo(rent, 9);
    // Auch die Tageszähler fürs Posten beginnen neu.
    expect(l.social.day).toBe(1);
    expect(l.social.postsToday).toBe(0);
  });

  it('rollt nur vorwärts', () => {
    const ledger = loc(fresh()).ledger;
    expect(rolloverLedger(ledger, ledger.day)).toBe(ledger);
    expect(rolloverLedger(ledger, ledger.day - 1)).toBe(ledger);
    const next = rolloverLedger(addToLedger(ledger, { guests: 3 }), ledger.day + 1);
    expect(next.day).toBe(ledger.day + 1);
    expect(next.yesterday?.guests).toBe(3);
    expect(next.today).toEqual(createDayLedger());
  });

  it('Einnahmen, Kosten und Gewinn eines Tages', () => {
    const d = {
      ...createDayLedger(),
      guests: 12,
      revenue: D(100),
      tips: D(8),
      wages: D(30),
      goods: D(11),
      matcha: D(10),
      rent: D(5),
      marketing: D(4),
      hiring: D(60),
    };
    expect(ledgerIncome(d).toNumber()).toBe(108);
    expect(ledgerCosts(d).toNumber()).toBe(120);
    expect(ledgerProfit(d).toNumber()).toBe(-12);
    const sum = sumLedgers(d, d);
    expect(sum.guests).toBe(24);
    expect(ledgerProfit(sum).toNumber()).toBe(-24);
    expect(sumLedgers(d, createDayLedger())).toEqual(d);
  });

  it('payCost: vom Konto abbuchen und in der Tagesbilanz vermerken', () => {
    const l = loc(fresh());
    const paid = payCost(l, 'hiring', D(40));
    expect(paid.coins.toNumber()).toBe(BALANCE.startCoins - 40);
    expect(paid.ledger.today.hiring.toNumber()).toBe(40);
    expect(payCost(l, 'matcha', D(0))).toBe(l);
    expect(payCost(l, 'matcha', D(-5))).toBe(l);
  });
});

describe('Kasse oder direkt: auf Dauer dieselben Summen', () => {
  it('Voraussetzung: im vollen Café ändert der Influencer-Hype nichts an den Gästen', () => {
    const s = packed();
    for (let h = HOURS.open; h < HOURS.close; h++) {
      const r = computeLocationRates(s, LOC, { hour: h });
      expect(r.spawnRate).toBeCloseTo(r.capacity, 9);
      expect(computeLocationRates(s, LOC, { hour: h, influencerHype: false }).served).toBe(
        r.served,
      );
    }
  });

  it('über mehrere Tage gleich viel Geld; über die Kasse fehlen nur die offenen Bons', () => {
    const s = packed();
    const direct = advanceRealSeconds(s, 3 * DAY_SEC, { direct: true });
    const till = advanceRealSeconds(s, 3 * DAY_SEC);
    expect(loc(direct).till).toEqual(loc(s).till);
    expect(loc(direct).coins.toNumber()).toBeCloseTo(money(till), 6);
    expect(direct.meta.lifetimeEarned.toNumber()).toBeCloseTo(
      till.meta.lifetimeEarned.add(loc(till).till.open).toNumber(),
      6,
    );
    expect(loc(till).till.paid).toBeGreaterThan(0);
    expect(loc(direct).ledger).toEqual(loc(till).ledger);
    expect(loc(direct).satisfaction).toBeCloseTo(loc(till).satisfaction, 9);
    expect(loc(direct).cleanliness).toBeCloseTo(loc(till).cleanliness, 9);
    expect(direct.stats.customersServed).toBeCloseTo(till.stats.customersServed, 6);
  });

  it('direkt: Umsatz sofort aufs Konto, ohne Influencer-Hype (Offline, Zeitsprung)', () => {
    const s = at(fresh(), PEAK);
    const r = computeLocationRates(s, LOC, { influencerHype: false });
    const n = advanceRealSeconds(s, openSec(60), { direct: true });
    const costs = r.goodsPerHour.add(r.wagesPerHour).add(r.rentPerHour).toNumber();
    expect(n.meta.lifetimeEarned.toNumber()).toBeCloseTo(r.incomePerHour.toNumber(), 9);
    expect(loc(n).coins.toNumber()).toBeCloseTo(
      BALANCE.startCoins + r.incomePerHour.toNumber() - costs,
      9,
    );
    expect(loc(n).till).toEqual(loc(s).till);
  });

  it('über die Kasse: ins Geld kommen nur ganze Gäste, der Rest wartet auf den nächsten', () => {
    const s = at(fresh(), PEAK);
    const r = computeLocationRates(s, LOC);
    const n = advanceRealSeconds(s, openSec(60));
    const paid = Math.floor(r.served);
    expect(loc(n).till.paid).toBe(paid);
    expect(loc(n).till.progress).toBeCloseTo(r.served - paid, 9);
    expect(n.meta.lifetimeEarned.toNumber()).toBeCloseTo(
      (r.incomePerHour.toNumber() * paid) / r.served,
      9,
    );
    expect(money(n) + loc(n).bills.last.toNumber()).toBeCloseTo(
      BALANCE.startCoins + r.incomePerHour.toNumber(),
      9,
    );
  });
});

describe('Ein langer Schritt ≈ viele kurze', () => {
  it('eingeschwungen (Sauberkeit und Zufriedenheit am Ziel): exakt dasselbe', () => {
    let s = packed();
    const served = computeLocationRates(at(s, PEAK), LOC).served;
    s = patch(s, { cleanliness: cleanlinessEquilibrium(loc(s), served) });
    s = patch(s, { satisfaction: computeLocationRates(at(s, PEAK), LOC).satisfaction.target });
    const long = advanceRealSeconds(s, DAY_SEC);
    let short = s;
    for (let i = 0; i < DAY_SEC; i++) short = advanceRealSeconds(short, 1);
    expect(short.clock).toBeCloseTo(long.clock, 6);
    expect(money(short)).toBeCloseTo(money(long), 6);
    expect(loc(short).satisfaction).toBeCloseTo(loc(long).satisfaction, 9);
    expect(loc(short).cleanliness).toBeCloseTo(loc(long).cleanliness, 9);
    expect(short.stats.customersServed).toBeCloseTo(long.stats.customersServed, 6);
    expect(loc(short).bills.count).toBe(loc(long).bills.count);
  });

  it('vom Start weg: ein Tag am Stück ≈ ein Tag in 1-s-Schritten', () => {
    const s = fresh();
    const long = advanceRealSeconds(s, DAY_SEC);
    let short = s;
    for (let i = 0; i < DAY_SEC; i++) short = advanceRealSeconds(short, 1);
    expect(short.clock).toBeCloseTo(long.clock, 6);
    expect(Math.abs(money(short) / money(long) - 1)).toBeLessThan(0.005);
    expect(Math.abs(short.stats.customersServed / long.stats.customersServed - 1)).toBeLessThan(
      0.01,
    );
    expect(Math.abs(loc(short).satisfaction - loc(long).satisfaction)).toBeLessThan(1);
    expect(loc(short).bills.count).toBe(loc(long).bills.count);
  });
});

describe('Matcha geht aus', () => {
  /** Nachfrage-Anteil der Karte (Produktlinien mit Level ≥ 1; ohne Matcha nur die ohne Matcha). */
  const menuDemand = (l: LocationState, withMatcha: boolean): number =>
    PRODUCT_LINES.reduce((a, def) => {
      const lvl = l.stations[def.id]?.level ?? 0;
      const tier = lvl > 0 ? menuTier(def, lvl) : null;
      return tier && (withMatcha || def.matchaGrams === 0) ? a + tier.demand : a;
    }, 0);

  it('ohne Vorrat: keine Matcha-Produkte, weniger Nachfrage, unzufriedene Gäste', () => {
    const s = at(fresh(), PEAK);
    const empty = patch(s, { supply: stock(s, 0) });
    const withM = computeLocationRates(s, LOC, { influencerHype: false });
    const without = computeLocationRates(empty, LOC, { influencerHype: false });
    expect(without.grade).toBe(-1);
    expect(without.effectiveGrade).toBe(-1);
    for (const def of PRODUCT_LINES.filter((d) => d.matchaGrams > 0)) {
      expect(without.perStation[def.id]).toBeUndefined();
    }
    expect(without.matchaGramsPerHour).toBe(0);
    // Am Start gibt es nur Matcha: ohne ihn wird niemand bedient.
    expect(without.served).toBe(0);
    expect(without.incomePerHour.toNumber()).toBe(0);
    expect(without.bottleneck).toBe('demand');
    expect(without.waitPressure).toBe(0);
    // Nachfrage × noMatchaMult statt × Nachfrage-Faktor der Sorte.
    const l = loc(s);
    const grade = getGradeDef(withM.grade);
    expect(without.demand / withM.demand).toBeCloseTo(
      (BALANCE.demand.noMatchaMult * (1 + menuDemand(l, false))) /
        (grade.demandMult * (1 + menuDemand(l, true))),
      9,
    );
    // Zufriedenheit: „Matcha ausverkauft“ statt Punkte der Sorte.
    expect(withM.satisfaction.matcha).toBe(0);
    expect(without.satisfaction.matcha).toBe(BALANCE.satisfaction.noMatcha);
    expect(without.satisfaction.quality).toBe(0);
    expect(without.satisfaction.target - withM.satisfaction.target).toBeCloseTo(
      BALANCE.satisfaction.noMatcha - grade.satisfaction,
      9,
    );
  });

  it('andere Produkte gibt es weiter', () => {
    const s = at(fresh(), PEAK);
    const l = loc(s);
    const coffee = patch(s, {
      supply: stock(s, 0),
      stations: { ...l.stations, coffeeMachine: { level: 1, unlocked: true } },
    });
    const r = computeLocationRates(coffee, LOC);
    expect(Object.keys(r.perStation)).toEqual(['coffeeMachine']);
    expect(r.served).toBeGreaterThan(0);
    expect(r.incomePerHour.gt(0)).toBe(true);
    expect(r.matchaGramsPerHour).toBe(0);
    expect(r.satisfaction.matcha).toBe(BALANCE.satisfaction.noMatcha);
  });

  it('im Betrieb wird der Vorrat genau aufgebraucht, danach kommt niemand mehr dran', () => {
    const grams = 30;
    const s = patch(at(fresh(), PEAK), { supply: stock(fresh(), grams) });
    const r = computeLocationRates(s, LOC);
    const perGuest = r.matchaGramsPerHour / r.served;
    // Bis Ladenschluss geöffnet: der kleine Vorrat ist längst weg.
    const untilClose = openSec((HOURS.close - PEAK) * 60);
    const n = advanceRealSeconds(s, untilClose);
    const l = loc(n);
    expect(l.supply.stock.every((g) => g === 0)).toBe(true);
    expect(l.ledger.today.guests).toBeCloseTo(grams / perGuest, 6);
    expect(n.stats.customersServed).toBeCloseTo(grams / perGuest, 6);
    // Ohne Matcha sinkt die Zufriedenheit unter die eines Cafés mit Vorrat.
    const stocked = advanceRealSeconds(patch(s, { supply: stock(s, 1e9) }), untilClose);
    expect(l.satisfaction).toBeLessThan(loc(stocked).satisfaction);
    expect(loc(stocked).ledger.today.guests).toBeGreaterThan(l.ledger.today.guests);
    expect(computeLocationRates(n, LOC, { hour: PEAK }).satisfaction.matcha).toBe(
      BALANCE.satisfaction.noMatcha,
    );
  });

  it('eine Lieferung kommt pünktlich an, danach wird wieder Matcha verkauft', () => {
    const s0 = at(fresh(), HOURS.open);
    const arriveAt = HOURS.open * 60 + 30;
    const s = patch(s0, {
      supply: { ...stock(s0, 0), orders: [{ grade: 0, grams: 250, arriveAt, express: false }] },
    });
    const half = advanceRealSeconds(s, openSec(30));
    expect(half.clock).toBeCloseTo(arriveAt, 9);
    expect(loc(half).supply.orders).toHaveLength(0);
    expect(loc(half).supply.delivered).toBe(loc(s).supply.delivered + 1);
    expect(loc(half).supply.stock[0]).toBe(250);
    expect(loc(half).ledger.today.guests).toBe(0);
    const r = computeLocationRates(half, LOC);
    const n = advanceRealSeconds(half, openSec(30));
    const guests = loc(n).ledger.today.guests;
    expect(guests).toBeCloseTo(r.served / 2, 9);
    expect(loc(n).supply.stock[0]).toBeCloseTo(250 - (r.matchaGramsPerHour / r.served) * guests, 9);
  });
});

describe('Startzustand: ein ganzer Tag lohnt sich', () => {
  it('der erste Tag bringt Gewinn (Umsatz + Trinkgeld > Kosten)', () => {
    const n = advanceRealSeconds(fresh(), DAY_SEC);
    const day0 = loc(n).ledger.yesterday;
    expect(day0).not.toBeNull();
    if (!day0) return;
    expect(day0.guests).toBeGreaterThan(0);
    expect(ledgerIncome(day0).gt(ledgerCosts(day0))).toBe(true);
    expect(ledgerProfit(day0).gt(0)).toBe(true);
    expect(loc(n).coins.toNumber()).toBeGreaterThan(BALANCE.startCoins);
  });

  it('auch ein voller 24-h-Tag mit ganzer Tagesmiete trägt sich', () => {
    const s = fresh();
    let profit = 0;
    for (let h = 0; h < 24; h++) {
      const r = computeLocationRates(s, LOC, { hour: h, influencerHype: false });
      profit += r.incomePerHour
        .sub(r.goodsPerHour)
        .sub(r.wagesPerHour)
        .sub(r.rentPerHour)
        .toNumber();
    }
    expect(profit).toBeGreaterThan(0);
  });
});

describe('Geld im Minus', () => {
  it('Kosten werden auch ohne Geld abgebucht; Käufe sind dann gesperrt', () => {
    const s = patch(at(fresh(), NIGHT), { coins: D(0) });
    const n = advanceRealSeconds(s, closedSec(60));
    expect(loc(n).coins.toNumber()).toBeCloseTo(-rentPerDay(loc(s), LOC) / 24, 9);
    expect(loc(n).coins.lt(0)).toBe(true);
    expect(buyStation(n, LOC, 'matchaStation', 1)).toBe(n);
    expect(hireStaff(n, LOC, 'barista')).toBe(n);
    expect(orderMatcha(n, LOC, 0, 0)).toBe(n);
    // Das Café läuft trotzdem weiter.
    const later = advanceRealSeconds(n, closedSec(60));
    expect(loc(later).coins.lt(loc(n).coins)).toBe(true);
  });
});

describe('Offline (Abwesenheit)', () => {
  const HOUR_MS = 3_600_000;

  it('Deckel in Spieltagen und Effizienz aus BALANCE; Meta-Upgrade bis zum Höchstwert', () => {
    const o = BALANCE.offline;
    const s = fresh();
    const active = s.locations[s.activeLocationId];
    if (!active) throw new Error('no active café');
    expect(getOfflineCapMs(s)).toBeCloseTo(
      o.baseCapDays * realSecondsPerDay(active.hours) * 1000,
      6,
    );
    expect(getOfflineEfficiency(s)).toBe(o.baseEfficiency);
    const up = (lvl: number): GameState => ({
      ...s,
      meta: { ...s.meta, metaUpgrades: { offlineEfficiency: lvl } },
    });
    const per = getMetaUpgradeDef('offlineEfficiency').perLevel;
    expect(getOfflineEfficiency(up(2))).toBeCloseTo(
      Math.min(o.maxEfficiency, o.baseEfficiency + 2 * per),
      12,
    );
    expect(getOfflineEfficiency(up(1000))).toBe(o.maxEfficiency);
  });

  it('bis zum Deckel, zum Anteil der Effizienz, läuft das Café weiter', () => {
    const s = fresh();
    const cap = getOfflineCapMs(s);
    const eff = getOfflineEfficiency(s);
    const r = applyOffline(s, cap + 6 * HOUR_MS);
    expect(r.elapsedMs).toBe(cap + 6 * HOUR_MS);
    expect(r.creditedMs).toBe(cap);
    expect(r.state).toEqual(simulateAway(s, (cap / 1000) * eff));
    expect(r.earned.toNumber()).toBeCloseTo(loc(r.state).coins.sub(loc(s).coins).toNumber(), 9);
    expect(r.revenue.eq(r.state.meta.lifetimeEarned.sub(s.meta.lifetimeEarned))).toBe(true);
    expect(r.guests).toBeCloseTo(r.state.stats.customersServed, 9);
    expect(r.days).toBe(dayOf(r.state.clock) - dayOf(s.clock));
    expect(r.state.clock).toBeGreaterThan(s.clock);
    // Unter dem Deckel zählt die ganze Abwesenheit (× Effizienz).
    const short = applyOffline(s, 60_000);
    expect(short.creditedMs).toBe(60_000);
    expect(short.state).toEqual(simulateAway(s, 60 * eff));
    expect(catchUpOffline({ ...s, lastSavedAt: 1000 }, 61_000).state).toEqual(
      applyOffline({ ...s, lastSavedAt: 1000 }, 60_000).state,
    );
  });

  it('rechnet direkt und ohne Boosts und Events; deren Timer stehen still', () => {
    const s = at(fresh(), PEAK);
    const boosted: GameState = {
      ...s,
      boosts: [{ id: 'b', until: 1e9, spawnMult: 3, incomeMult: 3, speedMult: 3 }],
      activeEvents: [{ id: 'heatwave', locationId: LOC, startedAt: 0, until: 1e9 }],
    };
    const away = simulateAway(boosted, 120);
    const plain = advanceRealSeconds({ ...s, boosts: [], activeEvents: [] }, 120, {
      direct: true,
    });
    expect(away.locations).toEqual(plain.locations);
    expect(away.meta).toEqual(plain.meta);
    expect(away.boosts).toBe(boosted.boosts);
    expect(away.activeEvents).toBe(boosted.activeEvents);
    expect(loc(away).till).toEqual(loc(s).till);
  });

  it('Events, die in der Abwesenheit enden, werden beim Laden abgeschlossen', () => {
    const s: GameState = {
      ...fresh(),
      activeEvents: [{ id: 'heatwave', locationId: LOC, startedAt: 0, until: 30 }],
    };
    const r = applyOffline(s, 60_000);
    expect(r.state.activeEvents).toHaveLength(0);
    expect(r.state.stats.events).toBe(s.stats.events + 1);
  });

  it('negative oder ungültige Zeitdeltas bringen nichts', () => {
    const s = fresh();
    const neg = applyOffline(s, -5000);
    expect(neg.state).toBe(s);
    expect(neg.earned.toNumber()).toBe(0);
    expect(neg.guests).toBe(0);
    expect(neg.days).toBe(0);
    expect(applyOffline(s, Number.NaN).creditedMs).toBe(0);
    expect(applyOffline(s, Number.NaN).state).toBe(s);
  });

  it('Abwesenheit kann Geld kosten: ohne Matcha laufen Löhne und Miete weiter', () => {
    const s = patch(at(fresh(), PEAK), { supply: stock(fresh(), 0) });
    const r = applyOffline(s, HOUR_MS);
    expect(r.guests).toBe(0);
    expect(r.revenue.eq(0)).toBe(true);
    expect(r.earned.lt(0)).toBe(true);
  });
});
