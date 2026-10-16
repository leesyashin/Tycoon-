/**
 * Social-Media-Account statt Kampagnen (Vorgabe Vincent, 2026-10-16: „keine Kampagnen, sondern ein Social-Media-
 * Account, der wächst, weil man jeden Tag bis zu 3 Videos posten kann“). Jedes Café hat einen eigenen Account.
 * Ein Video erreicht Views (mehr Follower, schöneres Café, besserer Matcha → mehr Reichweite, manchmal geht eins
 * viral); ein Teil der Zuschauer folgt. Follower bringen dauerhaft Gäste, frische Videos kurz einen Schub (Buzz).
 * Wer einen Tag nichts postet, verliert ein paar Follower. Euro-Werte für Berlin, andere Standorte × Preisniveau.
 */
export interface VideoFormatDef {
  id: string;
  unlockCafeLevel: number;
  /** Kosten je Video (Requisiten, Werbebudget, Gage). */
  cost: number;
  /** Views eines Videos ohne Follower und Boni. */
  reach: number;
  /** Anteil der Zuschauer, die folgen. */
  conversion: number;
  /** Chance, dass das Video viral geht. */
  viralChance: number;
  /** Braucht diese Rolle im Team (das Barista-Tutorial einen Barista). */
  needs?: 'barista';
}

export const VIDEO_FORMATS: readonly VideoFormatDef[] = [
  { id: 'latteArt', unlockCafeLevel: 1, cost: 0, reach: 220, conversion: 0.035, viralChance: 0.03 },
  {
    id: 'tutorial',
    unlockCafeLevel: 1,
    cost: 8,
    reach: 420,
    conversion: 0.03,
    viralChance: 0.05,
    needs: 'barista',
  },
  { id: 'trend', unlockCafeLevel: 2, cost: 0, reach: 320, conversion: 0.025, viralChance: 0.1 },
  { id: 'ad', unlockCafeLevel: 3, cost: 60, reach: 2_400, conversion: 0.012, viralChance: 0 },
  {
    id: 'collab',
    unlockCafeLevel: 6,
    cost: 400,
    reach: 9_000,
    conversion: 0.02,
    viralChance: 0.12,
  },
];

export const SOCIAL = {
  /** Videos je Spieltag (zählt auch die Posts des Social-Media-Managers). */
  postsPerDay: 3,
  /** Bonus-Video über das Tageslimit gegen Goldene Blätter, höchstens so oft am Tag. */
  bonusVideoLeaves: 3,
  maxBonusPerDay: 2,
  startFollowers: 40,
  /** Reichweite wächst mit den Followern: × (1 + F / per)^exp. */
  followerReach: { per: 2_000, exp: 0.5 },
  perDecorReach: 0.01,
  perGradeReach: 0.05,
  perManagerReach: 0.15,
  /** Zufriedene Gäste kommentieren besser: × (base + Zufriedenheit × per). */
  satisfactionReach: { base: 0.6, per: 1 / 125 },
  /** Views schwanken um ±spread; virale Videos × min..max. */
  spread: 0.3,
  viral: { min: 4, max: 12 },
  /** Buzz je View (wirkt als Nachfrage-Schub), Halbwertszeit in Spielstunden. */
  buzzPerView: 1 / 40_000,
  buzzHalfLifeHours: 4,
  /** Ohne Post an einem Tag gehen so viele Follower verloren. */
  decayPerDayWithoutPost: 0.015,
  /** Der Social-Media-Manager postet zu diesen Stunden (Stufe n: die ersten n). */
  managerPostHours: [10, 14, 18] as readonly number[],
  /** So viele Videos zeigt der Account in der Liste. */
  recentMax: 6,
} as const;

export function getVideoFormat(id: string): VideoFormatDef | undefined {
  return VIDEO_FORMATS.find((f) => f.id === id);
}
