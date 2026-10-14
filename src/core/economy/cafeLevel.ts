import { BALANCE } from '@data/balance';
import type { LocationState } from '../GameState';

/** Summe der Stations-Level, die Café-Level `level` braucht (Level 1 = 0). */
export function cafeLevelThreshold(level: number): number {
  const { steps, stepAfter } = BALANCE.cafeLevel;
  let sum = 0;
  for (let l = 1; l < level; l++) sum += steps[l - 1] ?? stepAfter;
  return sum;
}

export function stationLevelSum(loc: LocationState): number {
  let sum = 0;
  for (const s of Object.values(loc.stations)) sum += s.level;
  return sum;
}

/** Café-Level aus der Summe aller Stations-Level (GAME_DESIGN § 5.3, Stufen in `BALANCE.cafeLevel`). */
export function computeCafeLevel(loc: LocationState): number {
  const sum = stationLevelSum(loc);
  let level = 1;
  while (level < BALANCE.cafeLevel.max && sum >= cafeLevelThreshold(level + 1)) level++;
  return level;
}

/** Fortschritt zum nächsten Café-Level: `done` von `need` Stations-Leveln (am Maximum done = need). */
export function cafeLevelProgress(loc: LocationState): { done: number; need: number } {
  const sum = stationLevelSum(loc);
  const level = computeCafeLevel(loc);
  const from = cafeLevelThreshold(level);
  const need = cafeLevelThreshold(level + 1) - from;
  if (level >= BALANCE.cafeLevel.max) return { done: need, need };
  return { done: sum - from, need };
}
