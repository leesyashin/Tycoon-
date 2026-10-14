import { CAFE_LEVEL_REWARD, cafeLevelLeaves } from '@data/unlocks';
import { getLocation, grantLeaves, withLocation, type GameState } from '../GameState';
import { computeLocationRates } from '../customers/rates';
import { D, type Decimal } from '../math/bignum';

export interface CafeLevelReward {
  coins: Decimal;
  leaves: number;
}

/** Einmal-Belohnung für die Level `fromLevel+1 … toLevel` (GAME_DESIGN § 5.3); Münzen aus dem aktuellen Einkommen. */
export function getCafeLevelReward(
  state: GameState,
  locationId: string,
  fromLevel: number,
  toLevel: number,
): CafeLevelReward {
  const gained = Math.max(0, toLevel - fromLevel);
  if (gained === 0) return { coins: D(0), leaves: 0 };
  const income = computeLocationRates(state, locationId).incomePerSec;
  let leaves = 0;
  for (let l = fromLevel + 1; l <= toLevel; l++) leaves += cafeLevelLeaves(l);
  return { coins: income.mul(CAFE_LEVEL_REWARD.incomeSeconds * gained), leaves };
}

/** Schreibt die Belohnung gut, wenn das Café-Level seit `fromLevel` gestiegen ist. */
export function applyCafeLevelUp(
  state: GameState,
  locationId: string,
  fromLevel: number,
): GameState {
  const loc = getLocation(state, locationId);
  if (loc.level <= fromLevel) return state;
  const r = getCafeLevelReward(state, locationId, fromLevel, loc.level);
  const next = withLocation(state, locationId, {
    ...loc,
    coins: loc.coins.add(r.coins),
    earnedThisRun: loc.earnedThisRun.add(r.coins),
  });
  return grantLeaves(
    { ...next, meta: { ...next.meta, lifetimeEarned: next.meta.lifetimeEarned.add(r.coins) } },
    r.leaves,
  );
}
