import { getLocation, type GameState } from '../GameState';
import { campaignSpawnMult } from '../marketing/effects';
import { staffSpeedMults } from '../staff/effects';
import { qualityPriceMult } from '../progression/quality';

/** Alle Multiplikatoren an einer Stelle (GAME_DESIGN § 14), damit nichts verstreut multipliziert wird. */
export interface Modifiers {
  /** Events, Boosts und aktive Marketing-Kampagne des Standorts. */
  spawnMult: number;
  incomeMult: number;
  /** Dauerhafter Preis-Multiplikator (Matcha-Qualität, GAME_DESIGN § 8). */
  priceMult: number;
  /** Tempo-Boosts auf Kasse und Stationen. */
  speedMult: number;
  /** Kostenrabatt 0..1. */
  discount: number;
  /** Tempo-Faktor aus Personal je Station (GAME_DESIGN § 6). */
  staffSpeedMult: Record<string, number>;
}

export function collectModifiers(
  state: GameState,
  locationId: string = state.activeLocationId,
): Modifiers {
  const loc = getLocation(state, locationId);
  let spawnMult = campaignSpawnMult(loc, state.playtimeSec);
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
  return {
    spawnMult,
    incomeMult,
    priceMult: qualityPriceMult(loc),
    speedMult,
    discount: 0,
    staffSpeedMult: staffSpeedMults(loc),
  };
}
