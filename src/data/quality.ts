/** Matcha-Qualitätsstufen nach GAME_DESIGN § 8 (Kosten für Berlin, ×1). Stufe 0 ist der Start. */
export interface QualityTierDef {
  /** Stufe 1..n; Index in `QUALITY_TIERS` + 1. */
  tier: number;
  unlockCafeLevel: number;
  cost: number;
}

/** Jede Stufe multipliziert den Preis aller Stationen (die Zufriedenheit steht in `BALANCE.satisfaction`). */
export const QUALITY_PRICE_MULT_PER_TIER = 1.5;

export const QUALITY_TIERS: readonly QualityTierDef[] = [
  { tier: 1, unlockCafeLevel: 3, cost: 5_000 },
  { tier: 2, unlockCafeLevel: 6, cost: 150_000 },
  { tier: 3, unlockCafeLevel: 10, cost: 8_000_000 },
  { tier: 4, unlockCafeLevel: 14, cost: 500_000_000 },
  { tier: 5, unlockCafeLevel: 18, cost: 4e10 },
  { tier: 6, unlockCafeLevel: 24, cost: 5e12 },
];

export const MAX_QUALITY = QUALITY_TIERS.length;

/** Definition der nächsten Stufe nach `current`, `null` wenn ausgebaut. */
export function getNextQualityTier(current: number): QualityTierDef | null {
  return QUALITY_TIERS[current] ?? null;
}
