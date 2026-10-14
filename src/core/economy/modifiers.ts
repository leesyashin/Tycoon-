import { getLocation, type GameState } from '../GameState';
import { campaignSpawnMult } from '../marketing/effects';
import { staffSpeedMults } from '../staff/effects';
import { qualityPriceMult } from '../progression/quality';
import { getMetaEffects } from '../prestige/meta';
import { collectEventEffects } from '../events/effects';
import { BOOST_RULES } from '@data/leaves';

/** Alle Multiplikatoren an einer Stelle (GAME_DESIGN § 14), damit nichts verstreut multipliziert wird. */
export interface Modifiers {
  /** Events, Boosts und aktive Marketing-Kampagne des Standorts (je höchstens `BOOST_RULES.maxMult`). */
  spawnMult: number;
  incomeMult: number;
  /** Preis-Multiplikator der Matcha-Qualität (GAME_DESIGN § 8), abzüglich Lieferengpass. */
  priceMult: number;
  /** Tempo-Boosts auf Kasse und Stationen. */
  speedMult: number;
  /** Dauerhafter Einkommens-Multiplikator aller Standorte (Zen, `prestigeMult` GAME_DESIGN § 7.2). */
  prestigeMult: number;
  /** Kostenrabatt 0..1 (Zen). */
  discount: number;
  /** Zusätzliche Basis-Zufriedenheit (Zen). */
  satisfactionBonus: number;
  /** Tempo-Faktor aus Personal je Station (GAME_DESIGN § 6). */
  staffSpeedMult: Record<string, number>;
  /** Preis-Faktor je Station aus Events (Hitzewelle: Iced-Bar ×3). */
  stationPriceMult: Record<string, number>;
  /** Faktor auf die Trinkgeld-Quote (Regentag). */
  tipMult: number;
  /** Zusätzliche Ziel-Zufriedenheit aus Events (Hanami). */
  eventSatisfaction: number;
  /** Qualitätsstufen, die ein Lieferengpass gerade abzieht (Preis und Zufriedenheit). */
  qualityPenalty: number;
}

const cap = (v: number): number => Math.min(BOOST_RULES.maxMult, v);

export function collectModifiers(
  state: GameState,
  locationId: string = state.activeLocationId,
): Modifiers {
  const loc = getLocation(state, locationId);
  const events = collectEventEffects(state, locationId);
  let spawnMult = campaignSpawnMult(loc, state.playtimeSec) * events.spawnMult;
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
  const quality = Math.max(0, loc.quality - events.qualityPenalty);
  // Deckel je Typ (GAME_DESIGN § 12.3) über alle zeitlich begrenzten Quellen zusammen.
  return {
    spawnMult: cap(spawnMult),
    incomeMult: cap(incomeMult),
    priceMult: qualityPriceMult({ ...loc, quality }),
    speedMult: cap(speedMult),
    prestigeMult: meta.incomeMult,
    discount: meta.discount,
    satisfactionBonus: meta.satisfactionBonus,
    staffSpeedMult: staffSpeedMults(loc),
    stationPriceMult: events.stationPriceMult,
    tipMult: events.tipMult,
    eventSatisfaction: events.satisfactionBonus,
    qualityPenalty: events.qualityPenalty,
  };
}
