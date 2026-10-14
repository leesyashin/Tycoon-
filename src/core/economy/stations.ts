import { BALANCE } from '@data/balance';
import { getLocationDef } from '@data/locations';
import type { StationDef } from '@data/stations';
import { Decimal, D } from '../math/bignum';

/** Tempo-Meilensteine sind bis Index 3 immer Tempo, danach wechseln sich Preis (gerade) und Tempo (ungerade) ab. */
export function milestoneLevels(upTo: number): number[] {
  const { levels, stepAfter } = BALANCE.milestones;
  const out: number[] = [];
  for (const l of levels) if (l <= upTo) out.push(l);
  const last = levels[levels.length - 1] ?? 0;
  for (let l = last + stepAfter; l <= upTo; l += stepAfter) out.push(l);
  return out;
}

export function milestoneCounts(level: number): { speed: number; price: number } {
  let speed = 0;
  let price = 0;
  milestoneLevels(level).forEach((_, i) => {
    const index = i + 1;
    const isPrice = index >= BALANCE.milestones.firstAlternatingIndex && index % 2 === 0;
    if (isPrice) price++;
    else speed++;
  });
  return { speed, price };
}

export function milestoneSpeedMult(level: number): number {
  return 2 ** milestoneCounts(level).speed;
}

export function milestonePriceMult(level: number): number {
  return 2 ** milestoneCounts(level).price;
}

export function nextMilestone(level: number): number {
  const { levels, stepAfter } = BALANCE.milestones;
  for (const l of levels) if (l > level) return l;
  const last = levels[levels.length - 1] ?? 0;
  return last + (Math.floor((level - last) / stepAfter) + 1) * stepAfter;
}

/** cost(level→level+n) = base × g^level × (g^n − 1) / (g − 1) × (1 − discount) × locationScale */
export function getStationCost(
  def: StationDef,
  level: number,
  amount: number,
  locationId: string,
  discount = 0,
): Decimal {
  if (amount <= 0) return D(0);
  const g = def.growth;
  const scale = getLocationDef(locationId).scale;
  return D(g)
    .pow(level)
    .mul(D(g).pow(amount).sub(1))
    .div(g - 1)
    .mul(def.baseCost * scale * (1 - discount));
}

/** Größtes n mit cost(level→level+n) ≤ coins. */
export function getMaxAffordable(
  def: StationDef,
  level: number,
  coins: Decimal,
  locationId: string,
  discount = 0,
): number {
  const one = getStationCost(def, level, 1, locationId, discount);
  if (coins.lt(one)) return 0;
  const g = def.growth;
  const scale = getLocationDef(locationId).scale;
  // Umgestellt: g^n = coins × (g−1) / (base × g^level × scale × (1−d)) + 1
  const first = D(g)
    .pow(level)
    .mul(def.baseCost * scale * (1 - discount));
  const ratio = coins
    .mul(g - 1)
    .div(first)
    .add(1);
  let n = Math.floor(ratio.log10() / Math.log10(g));
  // Gleitkomma-Korrektur an den Rändern.
  while (n > 0 && getStationCost(def, level, n, locationId, discount).gt(coins)) n--;
  while (getStationCost(def, level, n + 1, locationId, discount).lte(coins)) n++;
  return n;
}

export function getStationPrice(def: StationDef, level: number, locationId: string): Decimal {
  if (level <= 0) return D(0);
  return D(def.basePrice * level * getLocationDef(locationId).scale).mul(milestonePriceMult(level));
}

/** Kunden/s einer Station. */
export function getStationThroughput(
  def: StationDef,
  level: number,
  staffSpeedMult = 1,
  speedBoost = 1,
): number {
  if (level <= 0) return 0;
  return (def.parallel * milestoneSpeedMult(level) * staffSpeedMult * speedBoost) / def.serviceTime;
}

export function getStationRevenuePerSec(
  def: StationDef,
  level: number,
  locationId: string,
  servedShare: number,
): Decimal {
  return getStationPrice(def, level, locationId).mul(servedShare);
}

export function getCheckoutThroughput(level: number, cashierLevel = 0, speedBoost = 1): number {
  const c = BALANCE.checkout;
  if (level <= 0) return c.baselineThroughput * speedBoost;
  return c.base * level ** c.levelExponent * (1 + cashierLevel * c.perCashier) * speedBoost;
}
