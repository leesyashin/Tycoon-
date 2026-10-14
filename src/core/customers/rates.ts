import { BALANCE } from '@data/balance';
import { STATIONS, CHECKOUT_ID } from '@data/stations';
import { Decimal, D, ZERO } from '../math/bignum';
import { getLocation, type GameState, type LocationState } from '../GameState';
import { collectModifiers } from '../economy/modifiers';
import { getCheckoutThroughput, getStationPrice, getStationThroughput } from '../economy/stations';

export interface SatisfactionBreakdown {
  base: number;
  decor: number;
  quality: number;
  teaMaster: number;
  /** Meta-Upgrade „Basis-Zufriedenheit“ (Zen). */
  zen: number;
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

export function tipRate(loc: LocationState): number {
  const t = BALANCE.tips;
  return (
    (loc.satisfaction / 100) * t.satisfactionFactor + (loc.ambience['music'] ?? 0) * t.perMusicLevel
  );
}

export function computeSpawnRate(loc: LocationState, extraSpawnMult = 1): number {
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
  const demand = sp.base * loc.level ** sp.cafeLevelExponent * mult;
  return Math.min(demand, capacityCap * mult);
}

export function computeSatisfactionTarget(
  loc: LocationState,
  waitPressure: number,
  zenBonus = 0,
): SatisfactionBreakdown {
  const s = BALANCE.satisfaction;
  const decor = (loc.ambience['decor'] ?? 0) * s.perDecor;
  const quality = loc.quality * s.perQuality;
  const teaMaster = (loc.staff['teaMaster'] ?? 0) * s.perTeaMaster;
  const wait = -waitPressure * s.waitPressureWeight;
  const cleanliness = (loc.cleanliness - s.cleanlinessNeutral) * s.cleanlinessWeight;
  const target = clamp(
    s.base + decor + quality + teaMaster + zenBonus + wait + cleanliness,
    0,
    100,
  );
  return {
    base: s.base,
    decor,
    quality,
    teaMaster,
    zen: zenBonus,
    waitPressure: wait,
    cleanliness,
    target,
  };
}

export function computeLocationRates(state: GameState, locationId: string): LocationRates {
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

  const spawnRate = computeSpawnRate(loc, mods.spawnMult);
  const served = Math.min(spawnRate, totalThroughput);
  const waitPressure = clamp(
    spawnRate / Math.max(totalThroughput, 1e-9) - 1,
    0,
    BALANCE.satisfaction.waitPressureMax,
  );

  const perStation: Record<string, number> = {};
  const perStationIncome: Record<string, Decimal> = {};
  let income = ZERO;
  const tips = tipRate(loc);
  const priceMult = (1 + tips) * mods.incomeMult * mods.priceMult * mods.prestigeMult;
  for (const def of STATIONS) {
    const cap = perStationCap[def.id];
    if (cap === undefined || sumThroughput <= 0) continue;
    const customers = served * (cap / sumThroughput);
    perStation[def.id] = customers;
    const revenue = getStationPrice(def, loc.stations[def.id]?.level ?? 0, locationId).mul(
      customers,
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
    satisfaction: computeSatisfactionTarget(loc, waitPressure, mods.satisfactionBonus),
    perStation,
    perStationIncome,
  };
}

export function getIncomePerSec(state: GameState, locationId: string): Decimal {
  return computeLocationRates(state, locationId).incomePerSec;
}
