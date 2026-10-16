/** Achievements nach GAME_DESIGN § 13.1. Belohnung in Goldenen Blättern (2–25). */
export type AchievementKind =
  | 'lifetimeEarned'
  | 'customersServed'
  | 'stationLevel'
  | 'cafeLevel'
  | 'allStations'
  | 'quality'
  | 'highSatisfaction'
  | 'staffMaxed'
  | 'resets'
  | 'locations'
  | 'taps'
  | 'hypeFills'
  | 'events'
  | 'playtime'
  | 'videos'
  | 'quests'
  | 'followers'
  | 'nightShift'
  | 'spotless';

export interface AchievementDef {
  id: string;
  kind: AchievementKind;
  /** Zielwert in der Einheit der Art (Euro, Gäste, Sekunden …). */
  target: number;
  reward: number;
  /** Geheime Achievements zeigen Name und Bedingung erst nach dem Freischalten. */
  secret?: boolean;
}

/** Zufriedenheit, die „Zufriedenheit 90+ für 10 min“ halten muss. */
export const HIGH_SATISFACTION = { threshold: 90 } as const;
/** „Nachtschicht“: lokale Stunde in [from, to). */
export const NIGHT_SHIFT_HOURS = { from: 2, to: 4 } as const;
/** „Blitzblank“: Sauberkeit mindestens so hoch (100 ist im Putz-Modell nie erreichbar), nach `minPlaytimeSec` Spielzeit. */
export const SPOTLESS = { cleanliness: 95, minPlaytimeSec: 3600 } as const;

const tiers = (
  kind: AchievementKind,
  prefix: string,
  steps: readonly (readonly [target: number, reward: number])[],
): AchievementDef[] =>
  steps.map(([target, reward], i) => ({ id: `${prefix}${String(i + 1)}`, kind, target, reward }));

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  ...tiers('lifetimeEarned', 'earned', [
    [1_000, 2],
    [25_000, 5],
    [250_000, 10],
    [2_500_000, 15],
    [25_000_000, 25],
  ]),
  ...tiers('customersServed', 'served', [
    [100, 2],
    [1_000, 4],
    [10_000, 8],
    [100_000, 12],
    [1_000_000, 20],
  ]),
  ...tiers('stationLevel', 'stationLevel', [
    [5, 3],
    [10, 6],
    [15, 12],
    [20, 20],
  ]),
  ...tiers('cafeLevel', 'cafeLevel', [
    [3, 2],
    [5, 4],
    [10, 8],
    [15, 12],
    [20, 20],
  ]),
  { id: 'allStations', kind: 'allStations', target: 1, reward: 10 },
  ...tiers('quality', 'quality', [
    [1, 3],
    [3, 10],
    [6, 25],
  ]),
  { id: 'highSatisfaction', kind: 'highSatisfaction', target: 600, reward: 8 },
  { id: 'staffMaxed', kind: 'staffMaxed', target: 1, reward: 10 },
  ...tiers('resets', 'resets', [
    [1, 10],
    [5, 25],
  ]),
  ...tiers('locations', 'locations', [
    [2, 10],
    [6, 25],
  ]),
  ...tiers('taps', 'taps', [
    [100, 2],
    [1_000, 5],
    [10_000, 10],
  ]),
  { id: 'hype1', kind: 'hypeFills', target: 10, reward: 5 },
  ...tiers('events', 'events', [
    [1, 5],
    [10, 15],
  ]),
  ...tiers('playtime', 'playtime', [
    [3_600, 3],
    [36_000, 10],
    [360_000, 25],
  ]),
  ...tiers('videos', 'videos', [
    [1, 2],
    [25, 6],
    [200, 12],
  ]),
  { id: 'quests1', kind: 'quests', target: 10, reward: 8 },
  { id: 'nightShift', kind: 'nightShift', target: 1, reward: 5, secret: true },
  { id: 'spotless', kind: 'spotless', target: 1, reward: 5, secret: true },
  ...tiers('followers', 'followers', [
    [10_000, 8],
    [100_000, 20],
  ]),
];

export function getAchievementDef(id: string): AchievementDef {
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) throw new Error(`Unknown achievement: ${id}`);
  return def;
}
