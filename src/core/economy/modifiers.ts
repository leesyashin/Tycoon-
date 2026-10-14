import type { GameState } from '../GameState';

/** Alle Multiplikatoren an einer Stelle (GAME_DESIGN § 14), damit nichts verstreut multipliziert wird. */
export interface Modifiers {
  spawnMult: number;
  incomeMult: number;
  /** Tempo-Boosts auf Kasse und Stationen. */
  speedMult: number;
  /** Kostenrabatt 0..1. */
  discount: number;
  /** Zusätzlicher Faktor aus Personal je Station; Personal folgt in S4. */
  staffSpeedMult: number;
}

export function collectModifiers(state: GameState): Modifiers {
  let spawnMult = 1;
  let incomeMult = 1;
  let speedMult = 1;
  for (const e of state.activeEvents) {
    if (e.until > state.playtimeSec) {
      spawnMult *= e.spawnMult;
      incomeMult *= e.incomeMult;
    }
  }
  for (const b of state.boosts) {
    if (b.until > state.playtimeSec) {
      spawnMult *= b.spawnMult;
      incomeMult *= b.incomeMult;
      speedMult *= b.speedMult;
    }
  }
  return { spawnMult, incomeMult, speedMult, discount: 0, staffSpeedMult: 1 };
}
