import {
  CUSTOMER_EFFECTS,
  CUSTOMER_SHARE_SHIFT,
  CUSTOMER_TYPES,
  type CustomerTypeId,
} from '@data/customerTypes';
import { BALANCE } from '@data/balance';
import type { StationDef } from '@data/stations';

/** Normierte Anteile der Kundentypen für einen Standort (GAME_DESIGN § 7.5). */
export function customerTypeShares(locationId: string): Record<CustomerTypeId, number> {
  const shift = CUSTOMER_SHARE_SHIFT[locationId] ?? {};
  const raw = CUSTOMER_TYPES.map((t) => [t.id, t.share * (shift[t.id] ?? 1)] as const);
  const sum = raw.reduce((a, [, v]) => a + v, 0);
  return Object.fromEntries(raw.map(([id, v]) => [id, v / sum])) as Record<CustomerTypeId, number>;
}

/** Zieht einen Typ mit `roll` ∈ [0, 1). */
export function pickCustomerType(
  shares: Record<CustomerTypeId, number>,
  roll: number,
): CustomerTypeId {
  let acc = 0;
  let last: CustomerTypeId = 'student';
  for (const t of CUSTOMER_TYPES) {
    acc += shares[t.id];
    last = t.id;
    if (roll < acc) return t.id;
  }
  return last;
}

/**
 * Zufriedenheits-Anteil am Trinkgeld (0..1+): Kritiker zählen die Abweichung vom neutralen Wert doppelt,
 * positiv wie negativ (GAME_DESIGN § 7.5); negatives Trinkgeld gibt es nicht.
 */
export function tipSatisfactionTerm(satisfaction: number, criticShare: number): number {
  const s = satisfaction / 100;
  const neutral = BALANCE.satisfaction.base / 100;
  const critic = Math.max(0, neutral + (s - neutral) * CUSTOMER_EFFECTS.criticSatisfactionWeight);
  return (1 - criticShare) * s + criticShare * critic;
}

/** Faktor auf das gesamte Trinkgeld durch Stammgäste. */
export function regularTipMult(regularShare: number): number {
  return 1 + CUSTOMER_EFFECTS.regularTipBonus * regularShare;
}

/**
 * Erwarteter Spawn-Faktor durch Influencer-Hype: Influencer kommen als Poisson-Strom mit `rate`/s, jeder
 * hält 5 s Hype. Anteil der Zeit mit Hype = 1 − e^(−rate·5 s); überlappende Hypes stapeln nicht.
 */
export function influencerHypeMult(influencerRate: number): number {
  const h = CUSTOMER_EFFECTS.influencerHype;
  if (!(influencerRate > 0)) return 1;
  return 1 + (h.spawnMult - 1) * (1 - Math.exp(-influencerRate * h.durationSec));
}

/** Anteil der Gäste, die das Produkt der Linie bestellen; Touristen greifen eher zur Kuchenvitrine. */
export function attachRate(def: StationDef, touristShare: number): number {
  const bonus =
    def.id === CUSTOMER_EFFECTS.touristStationId
      ? 1 + CUSTOMER_EFFECTS.touristAttachBonus * touristShare
      : 1;
  return def.attachRate * bonus;
}
