import { BALANCE } from '@data/balance';
import type { LocationState } from '../GameState';

export function computeCafeLevel(loc: LocationState): number {
  let sum = 0;
  for (const s of Object.values(loc.stations)) sum += s.level;
  const { stationLevelsPerCafeLevel, max } = BALANCE.cafeLevel;
  return Math.min(max, Math.floor(sum / stationLevelsPerCafeLevel) + 1);
}
