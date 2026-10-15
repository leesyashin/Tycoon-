import { BALANCE } from '@data/balance';
import { STATIONS, CHECKOUT_ID } from '@data/stations';
import { Decimal, D, ZERO } from '../math/bignum';
import { getLocation, type GameState, type LocationState } from '../GameState';
import { collectModifiers } from '../economy/modifiers';
import { getCheckoutThroughput, getStationPrice, getStationThroughput } from '../economy/stations';
import { BOOST_RULES } from '@data/leaves';
import {
  customerTypeShares,
  influencerHypeMult,
  regularTipMult,
  stationDemandWeight,
  tipSatisfactionTerm,
} from './types';

export interface SatisfactionBreakdown {
  base: number;
  decor: number;
  quality: number;
  teaMaster: number;
  /** Meta-Upgrade „Basis-Zufriedenheit“ (Zen). */
  zen: number;
  /** Laufende Events (Hanami +10). */
  event: number;
  waitPressure: number;
  cleanliness: number;
  target: number;
}

export interface LocationRates {
  spawnRate: number;
  totalThroughput: number;
  served: number;
  incomePerSec: Decimal;
  waitPressure: number;
  satisfactionFactor: number;
  tipRate: number;
  /** Erwarteter Spawn-Faktor aus Influencer-Hype (GAME_DESIGN § 7.5), schon in `spawnRate` enthalten. */
  influencerHypeMult: number;
  satisfaction: SatisfactionBreakdown;
  /** Kunden/s pro Verkaufsstation. */
  perStation: Record<string, number>;
  /** Einnahmen/s pro Verkaufsstation (inkl. Trinkgeld und Boosts); Summe = `incomePerSec`. */
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
  const teaMaster = (loc.staff['teaMaster'] ?? 0) * s.perTeaMaster;
  const wait = -waitPressure * s.waitPressureWeight;
  const cleanliness = (loc.cleanliness - s.cleanlinessNeutral) * s.cleanlinessWeight;
  const target = clamp(
    s.base + decor + quality + teaMaster + zenBonus + eventBonus + wait + cleanliness,
    0,
    100,
  );
  return {
    base: s.base,
    decor,
    quality,
    teaMaster,
    zen: zenBonus,
    event: eventBonus,
    waitPressure: wait,
    cleanliness,
    target,
  };
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

  const perStationCap: Record<string, number> = {};
  let sumThroughput = 0;
  for (const def of STATIONS) {
    if (def.basePrice <= 0) continue;
    const lvl = loc.stations[def.id]?.level ?? 0;
    const staff = mods.staffSpeedMult[def.id] ?? 1;
    const th = getStationThroughput(def, lvl, staff, mods.speedMult);
    perStationCap[def.id] = th;
    sumThroughput += th;
  }
  const checkoutLevel = loc.stations[CHECKOUT_ID]?.level ?? 0;
  const checkout = getCheckoutThroughput(checkoutLevel, loc.staff['cashier'] ?? 0, mods.speedMult);
  const totalThroughput = Math.min(sumThroughput, checkout);

  const shares = customerTypeShares(locationId);
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

  const perStation: Record<string, number> = {};
  const perStationIncome: Record<string, Decimal> = {};
  let income = ZERO;
  const tips = tipRate(loc, locationId) * mods.tipMult;
  const priceMult = (1 + tips) * mods.incomeMult * mods.priceMult * mods.prestigeMult;
  // Verteilung nach Durchsatz, Merch-Station mit Touristen-Bonus gewichtet.
  const weight = (id: string): number =>
    (perStationCap[id] ?? 0) * stationDemandWeight(id, shares.tourist);
  let sumWeight = 0;
  for (const id of Object.keys(perStationCap)) sumWeight += weight(id);
  for (const def of STATIONS) {
    const cap = perStationCap[def.id];
    if (cap === undefined || sumWeight <= 0) continue;
    const customers = served * (weight(def.id) / sumWeight);
    perStation[def.id] = customers;
    const revenue = getStationPrice(def, loc.stations[def.id]?.level ?? 0, locationId).mul(
      customers * (mods.stationPriceMult[def.id] ?? 1),
    );
    perStationIncome[def.id] = revenue.mul(priceMult);
    if (customers > 0) income = income.add(revenue);
  }
  return {
    spawnRate,
    totalThroughput,
    served,
    incomePerSec: D(income).mul(priceMult),
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
    perStation,
    perStationIncome,
  };
}

export function getIncomePerSec(state: GameState, locationId: string): Decimal {
  return computeLocationRates(state, locationId).incomePerSec;
}
