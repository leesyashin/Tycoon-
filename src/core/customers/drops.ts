import { LEAF_DROPS } from '@data/leaves';
import { grantLeaves, type GameState } from '../GameState';
import { customerTypeShares } from './types';

/** Erwartete Blätter aus `served` bedienten Kunden am Standort (Influencer-Anteil × Chance). */
export function expectedLeafDrops(locationId: string, served: number): number {
  const share = customerTypeShares(locationId)[LEAF_DROPS.customerType];
  return served * share * LEAF_DROPS.chance;
}

/**
 * Drops als Erwartungswert (Einnahmen kommen nur aus dem Rate-Modell, die Figuren sind kosmetisch):
 * Bruchteile sammeln sich, jedes volle Blatt wird gutgeschrieben, bis der Tagesdeckel erreicht ist.
 */
export function accrueLeafDrops(state: GameState, expected: number): GameState {
  if (!(expected > 0)) return state;
  const d = state.leafDrops;
  if (d.count >= LEAF_DROPS.maxPerDay)
    return d.fraction === 0 ? state : { ...state, leafDrops: { ...d, fraction: 0 } };
  let fraction = d.fraction + expected;
  const whole = Math.min(Math.floor(fraction), LEAF_DROPS.maxPerDay - d.count);
  fraction -= whole;
  const count = d.count + whole;
  if (count >= LEAF_DROPS.maxPerDay) fraction = 0;
  const next = { ...state, leafDrops: { ...d, count, fraction } };
  return whole > 0 ? grantLeaves(next, whole) : next;
}

/** Neuer lokaler Tag → Zähler zurück (Aufruf aus `progressionStep`, der die Wanduhr kennt). */
export function refreshLeafDropDay(state: GameState, dateKey: string): GameState {
  // Nur vorwärts, sonst setzte Zurückstellen der Uhr den Tagesdeckel zurück.
  if (state.leafDrops.date >= dateKey) return state;
  return { ...state, leafDrops: { date: dateKey, count: 0, fraction: state.leafDrops.fraction } };
}
