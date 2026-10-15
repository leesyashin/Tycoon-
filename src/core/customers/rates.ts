import { BALANCE } from '@data/balance';
import { PRODUCT_LINES, REGISTER_ID, SERVING_STATION_ID, getStationDef } from '@data/stations';
import { Decimal, D, ZERO } from '../math/bignum';
import { getLocation, type GameState, type LocationState } from '../GameState';
import { collectModifiers } from '../economy/modifiers';
import { getStationPrice, getStationSpeed } from '../economy/stations';
import { getStaffLevel } from '../staff/effects';
import { BOOST_RULES } from '@data/leaves';
import {
  attachRate,
  customerTypeShares,
  influencerHypeMult,
  regularTipMult,
  tipSatisfactionTerm,
} from './types';

export interface SatisfactionBreakdown {
  base: number;
  decor: number;
  quality: number;
  /** Meta-Upgrade „Basis-Zufriedenheit“ (Zen). */
  zen: number;
  /** Laufende Events (Hanami +10). */
  event: number;
  waitPressure: number;
  cleanliness: number;
  target: number;
}

/** Stufen der Service-Pipeline (GAME_DESIGN § 7.2); `demand` ist die Nachfrage selbst. */
export type StageId = 'demand' | 'order' | 'production' | 'service';
export const STAGES: readonly StageId[] = ['demand', 'order', 'production', 'service'];

export interface LocationRates {
  spawnRate: number;
  /** Kleinste Kapazität der drei Personal-Stufen (Bestellung, Zubereitung, Ausgabe). */
  totalThroughput: number;
  served: number;
  incomePerSec: Decimal;
  waitPressure: number;
  satisfactionFactor: number;
  tipRate: number;
  /** Erwarteter Spawn-Faktor aus Influencer-Hype (GAME_DESIGN § 7.5), schon in `spawnRate` enthalten. */
  influencerHypeMult: number;
  satisfaction: SatisfactionBreakdown;
  /** Kapazität je Stufe in Gästen/s (`demand` = Nachfrage). */
  stages: Record<StageId, number>;
  /** Stufe mit der kleinsten Kapazität – das, was gerade bremst. */
  bottleneck: StageId;
  /** Barista-Sekunden je Gast (Warenkorb, § 4). */
  loadPerCustomer: number;
  /** Durchschnittliche Servicezeit je Gast (Übergabe/Tischservice gemischt). */
  avgServeTime: number;
  /** Durchschnittlicher Bon je Gast (ohne Trinkgeld und Boosts, mit Event-Preisen). */
  avgTicket: Decimal;
  /** Bestellungen/s je Produktlinie. */
  perStation: Record<string, number>;
  /** Einnahmen/s je Produktlinie (inkl. Trinkgeld und Boosts); Summe = `incomePerSec`. */
  perStationIncome: Record<string, Decimal>;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function satisfactionFactor(satisfaction: number): number {
  return BALANCE.satisfaction.factorBase + satisfaction / 100;
}

/** Trinkgeld-Quote inkl. Kundentypen (Stammgast +10 %, Kritiker zählt Zufriedenheit doppelt). */
export function tipRate(loc: LocationState, locationId = 'berlin'): number {
  const t = BALANCE.tips;
  const shares = customerTypeShares(locationId);
  const base =
    tipSatisfactionTerm(loc.satisfaction, shares.critic) * t.satisfactionFactor +
    (loc.ambience['music'] ?? 0) * t.perMusicLevel;
  return base * regularTipMult(shares.regular);
}

/**
 * @param extraSpawnMult Events, Boosts, Kampagne: mehr Nachfrage und mehr Durchlauf (Kapazität mit).
 * @param demandMult nur Nachfrage (Influencer-Hype): volle Sitzplätze bleiben voll.
 */
export function computeSpawnRate(loc: LocationState, extraSpawnMult = 1, demandMult = 1): number {
  const sp = BALANCE.spawn;
  const a = loc.ambience;
  const capacityCap =
    sp.capacityFactor *
    (sp.capacityBase + (a['seats'] ?? 0) * sp.perSeat + (a['terrace'] ?? 0) * sp.perTerraceLevel);
  const mult =
    (1 + (a['wifi'] ?? 0) * sp.perWifi) *
    (1 + loc.marketing.level * sp.perMarketing) *
    (1 + (loc.staff['socialMedia'] ?? 0) * sp.perSocialMedia) *
    satisfactionFactor(loc.satisfaction) *
    extraSpawnMult;
  const demand = sp.base * loc.level ** sp.cafeLevelExponent * mult * demandMult;
  return Math.min(demand, capacityCap * mult);
}

export function computeSatisfactionTarget(
  loc: LocationState,
  waitPressure: number,
  zenBonus = 0,
  eventBonus = 0,
  qualityPenalty = 0,
): SatisfactionBreakdown {
  const s = BALANCE.satisfaction;
  const decor = (loc.ambience['decor'] ?? 0) * s.perDecor;
  const quality = Math.max(0, loc.quality - qualityPenalty) * s.perQuality;
  const wait = -waitPressure * s.waitPressureWeight;
  const cleanliness = (loc.cleanliness - s.cleanlinessNeutral) * s.cleanlinessWeight;
  const target = clamp(
    s.base + decor + quality + zenBonus + eventBonus + wait + cleanliness,
    0,
    100,
  );
  return {
    base: s.base,
    decor,
    quality,
    zen: zenBonus,
    event: eventBonus,
    waitPressure: wait,
    cleanliness,
    target,
  };
}

/** Durchschnittliche Servicezeit je Gast: Übergabe an der Ausgabe oder Tischservice (§ 7.2). */
export function averageServeTime(): number {
  const s = BALANCE.service;
  return (1 - s.dineInShare) * s.handoverTime + s.dineInShare * s.tableServiceTime;
}

/** Kapazität der Bestelltheke in Gästen/s: Verkäufer × Kassen-Tempo / Bestellzeit. */
export function orderCapacity(loc: LocationState, speedBoost = 1): number {
  const register = getStationDef(REGISTER_ID);
  const speed = getStationSpeed(register, loc.stations[REGISTER_ID]?.level ?? 0);
  return (getStaffLevel(loc, 'cashier') * speed * speedBoost) / BALANCE.order.orderTime;
}

/** Kapazität der Ausgabe in Gästen/s: Bedienungen × Tempo der Ausgabe-Station / Ø Servicezeit. */
export function serviceCapacity(loc: LocationState, speedBoost = 1): number {
  const serving = getStationDef(SERVING_STATION_ID);
  const speed = getStationSpeed(serving, loc.stations[SERVING_STATION_ID]?.level ?? 0);
  return (getStaffLevel(loc, 'waiter') * speed * speedBoost) / averageServeTime();
}

export interface ProductionLoad {
  /** Barista-Sekunden je Gast über alle Linien auf der Karte. */
  loadPerCustomer: number;
  /** Anteil der Gäste je Linie (mit Touristen-Bonus). */
  attach: Record<string, number>;
}

/** Warenkorb-Modell (§ 4): jede Linie mit Level ≥ 1 ist auf der Karte und kostet Barista-Zeit. */
export function productionLoad(loc: LocationState, locationId: string): ProductionLoad {
  const shares = customerTypeShares(locationId);
  const attach: Record<string, number> = {};
  let load = 0;
  for (const def of PRODUCT_LINES) {
    const lvl = loc.stations[def.id]?.level ?? 0;
    if (lvl <= 0) continue;
    const a = attachRate(def, shares.tourist);
    attach[def.id] = a;
    load += (a * def.workTime) / getStationSpeed(def, lvl);
  }
  return { loadPerCustomer: load, attach };
}

/** Kapazität der Barista-Theke in Gästen/s: Baristas / Barista-Sekunden je Gast. */
export function productionCapacity(loc: LocationState, locationId: string, speedBoost = 1): number {
  const { loadPerCustomer } = productionLoad(loc, locationId);
  if (loadPerCustomer <= 0) return 0;
  return (getStaffLevel(loc, 'barista') * speedBoost) / loadPerCustomer;
}

export interface RateOptions {
  /**
   * Influencer-Hype mitrechnen. Er ist ein 5-s-Boost aus aktiver Spielzeit; Offline-Einnahmen und Zeitsprung
   * rechnen wie bei Boosts, Events und Kampagne ohne ihn.
   */
  influencerHype?: boolean;
}

export function computeLocationRates(
  state: GameState,
  locationId: string,
  opts: RateOptions = {},
): LocationRates {
  const loc = getLocation(state, locationId);
  const mods = collectModifiers(state, locationId);
  const shares = customerTypeShares(locationId);

  const { loadPerCustomer, attach } = productionLoad(loc, locationId);
  const order = orderCapacity(loc, mods.speedMult);
  const production =
    loadPerCustomer > 0 ? (getStaffLevel(loc, 'barista') * mods.speedMult) / loadPerCustomer : 0;
  const service = serviceCapacity(loc, mods.speedMult);
  const totalThroughput = Math.min(order, production, service);

  // Influencer-Hype aus dem Spawn ohne Hype (sonst Rückkopplung). Er hebt nur die Nachfrage, nicht die
  // Sitzplätze, und zählt wie ein Boost zum Deckel ×12.
  const hype =
    opts.influencerHype === false
      ? 1
      : Math.min(
          influencerHypeMult(computeSpawnRate(loc, mods.spawnMult) * shares.influencer),
          BOOST_RULES.maxMult / mods.spawnMult,
        );
  const spawnRate = computeSpawnRate(loc, mods.spawnMult, hype);
  const served = Math.min(spawnRate, totalThroughput);
  const waitPressure = clamp(
    spawnRate / Math.max(totalThroughput, 1e-9) - 1,
    0,
    BALANCE.satisfaction.waitPressureMax,
  );
  const stages: Record<StageId, number> = { demand: spawnRate, order, production, service };
  let bottleneck: StageId = 'demand';
  if (spawnRate > totalThroughput) {
    bottleneck = 'order';
    for (const id of ['production', 'service'] as const) {
      if (stages[id] < stages[bottleneck]) bottleneck = id;
    }
  }

  const tips = tipRate(loc, locationId) * mods.tipMult;
  const priceMult = (1 + tips) * mods.incomeMult * mods.priceMult * mods.prestigeMult;
  const perStation: Record<string, number> = {};
  const perStationIncome: Record<string, Decimal> = {};
  let ticket = ZERO;
  for (const def of PRODUCT_LINES) {
    const a = attach[def.id];
    if (a === undefined) continue;
    const price = getStationPrice(def, loc.stations[def.id]?.level ?? 0, locationId).mul(
      mods.stationPriceMult[def.id] ?? 1,
    );
    ticket = ticket.add(price.mul(a));
    perStation[def.id] = served * a;
    perStationIncome[def.id] = price.mul(served * a).mul(priceMult);
  }
  return {
    spawnRate,
    totalThroughput,
    served,
    incomePerSec: D(ticket).mul(served).mul(priceMult),
    waitPressure,
    satisfactionFactor: satisfactionFactor(loc.satisfaction),
    tipRate: tips,
    influencerHypeMult: hype,
    satisfaction: computeSatisfactionTarget(
      loc,
      waitPressure,
      mods.satisfactionBonus,
      mods.eventSatisfaction,
      mods.qualityPenalty,
    ),
    stages,
    bottleneck,
    loadPerCustomer,
    avgServeTime: averageServeTime(),
    avgTicket: D(ticket),
    perStation,
    perStationIncome,
  };
}

export function getIncomePerSec(state: GameState, locationId: string): Decimal {
  return computeLocationRates(state, locationId).incomePerSec;
}
