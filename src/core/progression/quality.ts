import { getLocationDef } from '@data/locations';
import { QUALITY_PRICE_MULT_PER_TIER, getNextQualityTier } from '@data/quality';
import { getLocation, withLocation, type GameState, type LocationState } from '../GameState';
import { Decimal, D } from '../math/bignum';

/** Preis-Multiplikator der Matcha-Qualität: `1.5^Stufe` (GAME_DESIGN § 8). */
export function qualityPriceMult(loc: LocationState): number {
  return QUALITY_PRICE_MULT_PER_TIER ** loc.quality;
}

/** Kosten der nächsten Stufe (× Standort-Skalierung); `null`, wenn alle Stufen gekauft sind. */
export function getNextQualityCost(
  state: GameState,
  locationId: string,
  discount = 0,
): Decimal | null {
  const next = getNextQualityTier(getLocation(state, locationId).quality);
  if (!next) return null;
  return D(next.cost).mul(getLocationDef(locationId).scale * (1 - discount));
}

export function isQualityMaxed(state: GameState, locationId: string): boolean {
  return getNextQualityTier(getLocation(state, locationId).quality) === null;
}

/** Nächste Stufe existiert und das Café-Level reicht. */
export function isNextQualityUnlocked(state: GameState, locationId: string): boolean {
  const loc = getLocation(state, locationId);
  const next = getNextQualityTier(loc.quality);
  return next !== null && loc.level >= next.unlockCafeLevel;
}

/** Kauft die nächste Qualitätsstufe; gibt den alten State zurück, wenn gesperrt, ausgebaut oder zu teuer. */
export function buyQuality(state: GameState, locationId: string, discount = 0): GameState {
  if (!isNextQualityUnlocked(state, locationId)) return state;
  const loc = getLocation(state, locationId);
  const cost = getNextQualityCost(state, locationId, discount);
  if (!cost || loc.coins.lt(cost)) return state;
  return withLocation(state, locationId, {
    ...loc,
    coins: loc.coins.sub(cost),
    quality: loc.quality + 1,
  });
}
