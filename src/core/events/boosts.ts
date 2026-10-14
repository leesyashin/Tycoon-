import type { BoostDef } from '@data/leaves';
import { BOOSTS } from '@data/leaves';
import { FREE_BOOST } from '@data/monetization';
import type { ActiveBoost, GameState } from '../GameState';

/**
 * Boost hinzufügen (GAME_DESIGN § 12.3): gleiche Quelle verlängert um die volle Dauer statt zu stapeln,
 * verschiedene Quellen laufen nebeneinander und multiplizieren sich in `collectModifiers`.
 */
export function addBoost(state: GameState, def: BoostDef): GameState {
  const existing = state.boosts.find((b) => b.id === def.id && b.until > state.playtimeSec);
  const from = existing ? existing.until : state.playtimeSec;
  const boost: ActiveBoost = {
    id: def.id,
    until: from + def.durationSec,
    spawnMult: def.spawnMult,
    incomeMult: def.incomeMult,
    speedMult: def.speedMult,
  };
  return { ...state, boosts: [...state.boosts.filter((b) => b.id !== def.id), boost] };
}

export function getBoostRemaining(state: GameState, id: string): number {
  const b = state.boosts.find((x) => x.id === id);
  return b ? Math.max(0, b.until - state.playtimeSec) : 0;
}

export function isFreeBoostReady(state: GameState): boolean {
  return state.playtimeSec >= state.freeBoostAt;
}

/** Sekunden aktiver Spielzeit bis zum nächsten Gratis-Boost (0 = bereit). */
export function getFreeBoostWait(state: GameState): number {
  return Math.max(0, state.freeBoostAt - state.playtimeSec);
}

/** Gratis-Boost einlösen (nach `MonetizationProvider.showRewarded`); der Timer startet neu. */
export function claimFreeBoost(state: GameState): GameState {
  if (!isFreeBoostReady(state)) return state;
  const next = addBoost(state, BOOSTS.free);
  return { ...next, freeBoostAt: state.playtimeSec + FREE_BOOST.intervalSec };
}
