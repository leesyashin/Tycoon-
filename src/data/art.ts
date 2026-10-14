/**
 * Darstellungs-Konstanten der Szene (S8, UI_STYLE § 4). Rein kosmetisch, keine Spielbalance.
 */

/** Ab diesen Stations-Leveln wechselt die Optik (PLAN S8: Level 1/25/100). */
export const STATION_LOOK_LEVELS = [1, 25, 100] as const;

/** Optik-Stufe 1..3 einer Station; Level 0 zeigt Stufe 1 (als Umriss/Ghost in der Szene). */
export function stationLookTier(level: number): 1 | 2 | 3 {
  if (level >= STATION_LOOK_LEVELS[2]) return 3;
  if (level >= STATION_LOOK_LEVELS[1]) return 2;
  return 1;
}

/** Szene-Effekte (Millisekunden, Pixel in Weltkoordinaten). */
export const SCENE_FX = {
  /** Kauf-Plopp: Scale 0 → 1.1 → 1 (§ 4 „Feedback“). */
  plopMs: 250,
  plopOvershoot: 1.1,
  /** Weißer Shine-Sweep beim Level-up. */
  shineMs: 450,
  /** Münz-Flug ins HUD. */
  coinFlyMs: 650,
  /** Höchstens so viele fliegende Münzen gleichzeitig. */
  coinFlyMax: 6,
  /** Dampf über der Matcha-Bar: Partikel je Sekunde. */
  steamPerSec: 3,
  /** Wahrscheinlichkeit eines Emotes (Herz/Note) nach dem Bedienen. */
  emoteChance: 0.25,
  emoteMs: 900,
  /** Fortschrittsring über bedienten Kunden. */
  ringRadius: 7,
  ringWidth: 3,
} as const;
