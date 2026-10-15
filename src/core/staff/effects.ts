import { BALANCE } from '@data/balance';
import type { LocationState } from '../GameState';

/** Köpfe (Service-Rollen) bzw. Stufe (Filialleiter, Social Media) einer Rolle. */
export function getStaffLevel(loc: LocationState, id: string): number {
  return loc.staff[id] ?? 0;
}

/** Verschmutzung pro Minute: Grundwert plus Anteil je bedientem Gast (GAME_DESIGN § 7.3). */
export function dirtPerMin(servedPerSec: number): number {
  const c = BALANCE.cleanliness;
  return c.decayPerMin + Math.max(0, servedPerSec) * 60 * c.dirtPerCustomer;
}

/** Putzleistung pro Minute bei leerem Café (Putzkräfte × Leistung × Dreck-Faktor); wirkt × (1 − Sauberkeit/100). */
function cleaningPower(loc: LocationState): number {
  const c = BALANCE.cleanliness;
  return getStaffLevel(loc, 'cleaner') * c.cleanPerCleanerPerMin * c.dirtFactor;
}

/** Putzleistung pro Minute beim aktuellen Schmutz: je dreckiger, desto mehr lässt sich wegwischen. */
export function cleanPerMin(loc: LocationState, cleanliness: number = loc.cleanliness): number {
  return cleaningPower(loc) * (1 - cleanliness / BALANCE.cleanliness.max);
}

/** Netto-Änderung der Sauberkeit pro Minute beim aktuellen Stand. */
export function cleanlinessRatePerMin(loc: LocationState, servedPerSec: number): number {
  return cleanPerMin(loc) - dirtPerMin(servedPerSec);
}

/** Wert, auf den sich die Sauberkeit einpendelt: 100 × (1 − Schmutz/Putzleistung), ohne Putzkraft 0. */
export function cleanlinessEquilibrium(loc: LocationState, servedPerSec: number): number {
  const power = cleaningPower(loc);
  if (power <= 0) return 0;
  const max = BALANCE.cleanliness.max;
  return Math.min(max, Math.max(0, max * (1 - dirtPerMin(servedPerSec) / power)));
}

/**
 * Sauberkeit nach `dtSec` Sekunden – exakte Lösung der linearen Gleichung
 * dc/dt = power × (1 − c/max) − dirt, damit lange Ticks dasselbe ergeben wie viele kurze.
 */
export function advanceCleanliness(
  loc: LocationState,
  dtSec: number,
  servedPerSec: number,
): number {
  const max = BALANCE.cleanliness.max;
  const minutes = Math.max(0, dtSec) / 60;
  const power = cleaningPower(loc);
  const cur = Math.min(max, Math.max(0, loc.cleanliness));
  if (power <= 0) return Math.max(0, cur - dirtPerMin(servedPerSec) * minutes);
  const target = cleanlinessEquilibrium(loc, servedPerSec);
  const next = target + (cur - target) * Math.exp(-(power / max) * minutes);
  return Math.min(max, Math.max(0, next));
}

export function canAutoBuy(loc: LocationState): boolean {
  return getStaffLevel(loc, 'manager') >= BALANCE.manager.autoBuyFromLevel;
}
