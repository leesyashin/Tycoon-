import { BALANCE } from '@data/balance';
import type { LocationState } from '../GameState';

/** Köpfe (Service-Rollen) bzw. Stufe (Filialleiter, Social Media) einer Rolle. */
export function getStaffLevel(loc: LocationState, id: string): number {
  return loc.staff[id] ?? 0;
}

/** Verschmutzung pro Spielstunde: Grundwert plus Anteil je bedientem Gast (GAME_DESIGN § 7.3). */
export function dirtPerHour(servedPerHour: number): number {
  const c = BALANCE.cleanliness;
  return c.decayPerHour + Math.max(0, servedPerHour) * c.dirtPerCustomer;
}

/** Putzleistung pro Stunde bei leerem Café (Putzkräfte × Leistung × Dreck-Faktor); wirkt × (1 − Sauberkeit/100). */
function cleaningPower(loc: LocationState): number {
  const c = BALANCE.cleanliness;
  return getStaffLevel(loc, 'cleaner') * c.cleanPerCleanerPerHour * c.dirtFactor;
}

/** Putzleistung pro Stunde beim aktuellen Schmutz: je dreckiger, desto mehr lässt sich wegwischen. */
export function cleanPerHour(loc: LocationState, cleanliness: number = loc.cleanliness): number {
  return cleaningPower(loc) * (1 - cleanliness / BALANCE.cleanliness.max);
}

/** Netto-Änderung der Sauberkeit pro Spielstunde beim aktuellen Stand (geöffnet). */
export function cleanlinessRatePerHour(loc: LocationState, servedPerHour: number): number {
  return cleanPerHour(loc) - dirtPerHour(servedPerHour);
}

/** Wert, auf den sich die Sauberkeit einpendelt: 100 × (1 − Schmutz/Putzleistung), ohne Putzkraft 0. */
export function cleanlinessEquilibrium(loc: LocationState, servedPerHour: number): number {
  const power = cleaningPower(loc);
  if (power <= 0) return 0;
  const max = BALANCE.cleanliness.max;
  return Math.min(max, Math.max(0, max * (1 - dirtPerHour(servedPerHour) / power)));
}

/**
 * Sauberkeit nach `dtHours` Spielstunden geöffnet – exakte Lösung der linearen Gleichung
 * dc/dt = power × (1 − c/max) − dirt, damit lange Schritte dasselbe ergeben wie viele kurze.
 */
export function advanceCleanliness(
  loc: LocationState,
  dtHours: number,
  servedPerHour: number,
): number {
  const max = BALANCE.cleanliness.max;
  const hours = Math.max(0, dtHours);
  const power = cleaningPower(loc);
  const cur = Math.min(max, Math.max(0, loc.cleanliness));
  if (power <= 0) return Math.max(0, cur - dirtPerHour(servedPerHour) * hours);
  const target = cleanlinessEquilibrium(loc, servedPerHour);
  const next = target + (cur - target) * Math.exp(-(power / max) * hours);
  return Math.min(max, Math.max(0, next));
}

export function canAutoBuy(loc: LocationState): boolean {
  return getStaffLevel(loc, 'manager') >= BALANCE.manager.autoBuyFromLevel;
}
