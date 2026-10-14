/**
 * Monetarisierung ist vorbereitet, aber aus. Solange das Flag `false` ist, nutzt das Spiel nur den
 * `NoopProvider`: kein SDK, kein Netzwerk-Call. Siehe STATUS.md „Monetarisierung“.
 */
export const MONETIZATION_ENABLED = false;

export const FREE_BOOST = {
  /** Alle so viele Sekunden aktiver Spielzeit gibt es einen Gratis-Boost (GAME_DESIGN § 10). */
  intervalSec: 20 * 60,
} as const;
