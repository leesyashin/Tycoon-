import { BALANCE } from '@data/balance';
import { STAFF_ROLES } from '@data/staff';
import { STATIONS } from '@data/stations';
import type { LocationState } from '../GameState';

export function getStaffLevel(loc: LocationState, id: string): number {
  return loc.staff[id] ?? 0;
}

/**
 * Tempo-Faktor aus Personal je Verkaufsstation (GAME_DESIGN § 6); Rollen multiplizieren sich.
 * Die Kasse ist nicht dabei: der Kassierer wirkt dort über `getCheckoutThroughput`.
 */
export function staffSpeedMults(loc: LocationState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of STATIONS) out[s.id] = 1;
  for (const role of STAFF_ROLES) {
    const lvl = getStaffLevel(loc, role.id);
    if (!role.speed || lvl <= 0) continue;
    for (const id of role.speed.stations)
      out[id] = (out[id] ?? 1) * (1 + lvl * role.speed.perLevel);
  }
  return out;
}

/** Netto-Änderung der Sauberkeit pro Minute: Verfall (gedämpft durch Reinigung) plus Aufwischen ab Stufe 3. */
export function cleanlinessRatePerMin(loc: LocationState): number {
  const c = BALANCE.cleanliness;
  const cleaner = getStaffLevel(loc, 'cleaner');
  const decay = c.decayPerMin * Math.max(0, 1 - cleaner * c.decayReductionPerCleaner);
  const regen = cleaner >= c.regenFromCleanerLevel ? c.regenPerMin : 0;
  return regen - decay;
}

/** Untergrenze, unter die der Verfall nicht führt (0 ohne Reinigungskraft). */
export function cleanlinessFloor(loc: LocationState): number {
  return getStaffLevel(loc, 'cleaner') >= 1 ? BALANCE.cleanliness.floorWithCleaner : 0;
}

/** Sauberkeit nach `dtSec` Sekunden. Liegt sie schon unter der Untergrenze, sinkt sie nur nicht weiter. */
export function advanceCleanliness(loc: LocationState, dtSec: number): number {
  const rate = cleanlinessRatePerMin(loc) / 60;
  const cur = loc.cleanliness;
  if (rate >= 0) return Math.min(BALANCE.cleanliness.max, cur + rate * dtSec);
  return Math.max(Math.min(cur, cleanlinessFloor(loc)), cur + rate * dtSec);
}

/** Wert, auf den sich die Sauberkeit langfristig einpendelt (für Panel-Erklärung und Balance-Sim). */
export function cleanlinessEquilibrium(loc: LocationState): number {
  const rate = cleanlinessRatePerMin(loc);
  if (rate > 0) return BALANCE.cleanliness.max;
  if (rate === 0) return loc.cleanliness;
  return Math.min(loc.cleanliness, cleanlinessFloor(loc));
}

export function canAutoBuy(loc: LocationState): boolean {
  return getStaffLevel(loc, 'manager') >= BALANCE.manager.autoBuyFromLevel;
}
