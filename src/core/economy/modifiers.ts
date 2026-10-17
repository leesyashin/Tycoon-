import { getLocation, type GameState } from '../GameState';
import { getMetaEffects } from '../prestige/meta';
import { collectEventEffects } from '../events/effects';
import { BOOST_RULES } from '@data/leaves';

/** Alle Multiplikatoren an einer Stelle (GAME_DESIGN § 14), damit nichts verstreut multipliziert wird. */
export interface Modifiers {
  /** Events und Boosts des Standorts (je höchstens `BOOST_RULES.maxMult`). */
  spawnMult: number;
  incomeMult: number;
  /** Tempo-Boosts auf alle drei Theken. */
  speedMult: number;
  /** Dauerhafter Einkommens-Multiplikator aller Standorte (Zen, `prestigeMult` GAME_DESIGN § 7.2). */
  prestigeMult: number;
  /** Kostenrabatt 0..1 (Zen) auf Ausbau und Einkauf. */
  discount: number;
  /** Zusätzliche Basis-Zufriedenheit (Zen). */
  satisfactionBonus: number;
  /** So viel öfter wird eine Produktlinie bestellt (Events: Hitzewelle → Iced Matcha). */
  stationAttachMult: Record<string, number>;
  /** Faktor auf die Trinkgeld-Quote (Regentag). */
  tipMult: number;
  /** Zusätzliche Ziel-Zufriedenheit aus Events (Hanami). */
  eventSatisfaction: number;
  /** Stufen, um die ein Lieferengpass die Matcha-Sorte gerade schlechter macht. */
  qualityPenalty: number;
}

const cap = (v: number): number => Math.min(BOOST_RULES.maxMult, v);

export function collectModifiers(
  state: GameState,
  locationId: string = state.activeLocationId,
): Modifiers {
  getLocation(state, locationId);
  const events = collectEventEffects(state, locationId);
  let spawnMult = events.spawnMult;
  let incomeMult = events.incomeMult;
  let speedMult = 1;
  for (const b of state.boosts) {
    if (b.until > state.playtimeSec) {
      spawnMult *= b.spawnMult;
      incomeMult *= b.incomeMult;
      speedMult *= b.speedMult;
    }
  }
  const meta = getMetaEffects(state);
  // Deckel je Typ (GAME_DESIGN § 12.3) über alle zeitlich begrenzten Quellen zusammen.
  return {
    spawnMult: cap(spawnMult),
    incomeMult: cap(incomeMult),
    speedMult: cap(speedMult),
    prestigeMult: meta.incomeMult,
    discount: meta.discount,
    satisfactionBonus: meta.satisfactionBonus,
    stationAttachMult: events.stationAttachMult,
    tipMult: events.tipMult,
    eventSatisfaction: events.satisfactionBonus,
    qualityPenalty: events.qualityPenalty,
  };
}
