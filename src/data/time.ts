/**
 * Spieluhr und Öffnungszeiten (Vorgabe Vincent, 2026-10-16: „Es muss Tag und Nacht geben und Öffnungszeiten“;
 * entschieden: 1 Spielstunde = 1 Minute, die Nacht spult vor). Die Uhr zählt Spielminuten (`GameState.clock`).
 * Solange das aktive Café geöffnet ist, vergeht eine Spielminute je echter Sekunde; geschlossen läuft sie
 * schneller, damit niemand auf den Morgen warten muss. Alle Raten der Wirtschaft sind pro Spielstunde.
 */
export const TIME = {
  minutesPerDay: 1440,
  /** Spielminuten je echter Sekunde, solange das aktive Café geöffnet ist (1 Spielstunde = 1 Minute). */
  openMinutesPerSec: 1,
  /** … solange es geschlossen ist: die Nacht spult vor. */
  closedMinutesPerSec: 6,
  /** Ein neues Spiel beginnt kurz vor der ersten Öffnung. */
  startMinute: 7 * 60 + 40,
} as const;

/** Öffnungszeiten je Café (volle Stunden; `close` 24 = Mitternacht). */
export const OPENING_HOURS = {
  default: { open: 8, close: 18 },
  earliestOpen: 5,
  latestOpen: 12,
  earliestClose: 13,
  latestClose: 24,
  /** So lange muss das Café mindestens geöffnet sein. */
  minHours: 6,
} as const;

/**
 * Nachfrage je Tagesstunde 0..23 (1 = Hauptzeit): Frühstück, Mittag, Kuchen am Nachmittag, abends ruhiger.
 * Wer lange öffnet, bekommt die späten Gäste – aber auch die Löhne für die ruhigen Stunden.
 */
export const DEMAND_CURVE: readonly number[] = [
  0.02, 0.01, 0.01, 0.01, 0.02, 0.12, 0.38, 0.75, 0.95, 1, 0.8, 0.85, 1.1, 1.05, 0.9, 1, 0.95, 0.8,
  0.6, 0.45, 0.32, 0.2, 0.1, 0.05,
];
