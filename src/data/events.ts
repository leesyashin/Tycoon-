/**
 * Events nach GAME_DESIGN § 12. Dauer und Abstand in aktiver Spielzeit (`playtimeSec`, echte Sekunden), Kalender in
 * lokaler Systemzeit. Phase 3: Events ändern, was bestellt wird (mehr Iced Matcha in der Hitzewelle), nicht die Preise.
 */

/** Wirkung eines Events, solange es läuft. Fehlende Felder = neutral. */
export interface EventEffect {
  spawnMult?: number;
  /** Auf alle Einnahmen. */
  incomeMult?: number;
  /** So viel öfter wird das Produkt einer Linie bestellt. */
  stationAttachMult?: Readonly<Record<string, number>>;
  /** Multiplikator auf die Trinkgeld-Quote. */
  tipMult?: number;
  /** Zusätzliche Ziel-Zufriedenheit (Punkte). */
  satisfactionBonus?: number;
  /** Die Matcha-Sorte wirkt so viele Stufen niedriger (schlechtere Charge vom Lieferanten). */
  qualityPenalty?: number;
}

/** Farbfilter für die Szene (GAME_DESIGN „Szene-Overlay“); Partikel optional. */
export interface EventOverlay {
  color: number;
  alpha: number;
  particles?: 'rain' | 'petals' | 'sparkle';
}

export interface RandomEventDef {
  id: string;
  icon: string;
  weight: number;
  effect: EventEffect;
  /** `spawnMult` wirkt nur in den ersten N Sekunden (Influencer-Ansturm). */
  rushSec?: number;
  /** Feste Dauer statt Zufallsdauer. */
  durationSec?: number;
  /** Zufriedenheit am Standort beim Ende (Ansturm-Nachwirkung). */
  endSatisfaction?: number;
  /** Goldene Blätter beim Abschluss. */
  reward: number;
  /** Neue Follower beim Start (der Account des Cafés wird erwähnt). */
  followers?: number;
  /** Lieferengpass: Belohnung nur, wenn gegen Geld behoben (Kosten = so viele Spielstunden Umsatz zur Hauptzeit). */
  resolve?: { incomeHours: number };
  overlay: EventOverlay;
}

export const EVENT_CONFIG = {
  /** Abstand zwischen zwei Zufalls-Events (Start zu Start), aktive Spielzeit. */
  intervalMinSec: 20 * 60,
  intervalMaxSec: 45 * 60,
  durationMinSec: 3 * 60,
  durationMaxSec: 10 * 60,
  /** Beheben (Lieferengpass) kostet mindestens diesen Anteil des Startkapitals des Standorts. */
  resolveMinStartShare: 0.2,
} as const;

export const RANDOM_EVENTS: readonly RandomEventDef[] = [
  {
    id: 'heatwave',
    icon: '☀️',
    weight: 1,
    effect: { stationAttachMult: { iceBox: 2.2 }, spawnMult: 1.15 },
    reward: 5,
    overlay: { color: 0xffa040, alpha: 0.12, particles: 'sparkle' },
  },
  {
    id: 'influencerVisit',
    icon: '🤳',
    weight: 1,
    effect: { spawnMult: 2.5 },
    rushSec: 120,
    durationSec: 120,
    endSatisfaction: -10,
    reward: 8,
    followers: 400,
    overlay: { color: 0xff70c0, alpha: 0.1, particles: 'sparkle' },
  },
  {
    id: 'supplyShortage',
    icon: '📦',
    weight: 1,
    effect: { qualityPenalty: 1 },
    reward: 5,
    resolve: { incomeHours: 3 },
    overlay: { color: 0x808080, alpha: 0.15 },
  },
  {
    id: 'foodBlogger',
    icon: '📸',
    weight: 1,
    effect: { stationAttachMult: { oven: 2, displayCase: 1.5 }, spawnMult: 1.1 },
    reward: 5,
    followers: 200,
    overlay: { color: 0xffe0a0, alpha: 0.1, particles: 'sparkle' },
  },
  {
    id: 'rainyDay',
    icon: '🌧️',
    weight: 1,
    effect: { spawnMult: 0.7, tipMult: 2 },
    reward: 3,
    overlay: { color: 0x4060a0, alpha: 0.18, particles: 'rain' },
  },
];

/** Kalender-Event: aktiv vom Start- bis einschließlich Endtag (Monat 1–12). Ende < Start = über den Jahreswechsel. */
export interface CalendarEventDef {
  id: string;
  icon: string;
  from: { month: number; day: number };
  to: { month: number; day: number };
  effect: EventEffect;
  overlay: EventOverlay;
}

export const CALENDAR_EVENTS: readonly CalendarEventDef[] = [
  {
    id: 'hanami',
    icon: '🌸',
    from: { month: 3, day: 20 },
    to: { month: 4, day: 10 },
    effect: { satisfactionBonus: 10, stationAttachMult: { ceremonySet: 2 } },
    overlay: { color: 0xffc0e0, alpha: 0.08, particles: 'petals' },
  },
  {
    id: 'summerIced',
    icon: '🧊',
    from: { month: 7, day: 1 },
    to: { month: 8, day: 31 },
    effect: { stationAttachMult: { iceBox: 1.5 } },
    overlay: { color: 0x80e0ff, alpha: 0.06 },
  },
  {
    id: 'newYear',
    icon: '🎆',
    from: { month: 12, day: 31 },
    to: { month: 1, day: 2 },
    effect: { spawnMult: 1.4, tipMult: 1.5 },
    overlay: { color: 0x302060, alpha: 0.12, particles: 'sparkle' },
  },
];

export function getRandomEventDef(id: string): RandomEventDef | undefined {
  return RANDOM_EVENTS.find((e) => e.id === id);
}

export function getCalendarEventDef(id: string): CalendarEventDef | undefined {
  return CALENDAR_EVENTS.find((e) => e.id === id);
}
