import { ACHIEVEMENTS, NIGHT_SHIFT_HOURS, SPOTLESS, type AchievementDef } from '@data/achievements';
import { MAX_GRADE } from '@data/matcha';
import { STAFF_ROLES } from '@data/staff';
import { STATIONS } from '@data/stations';
import { grantLeaves, type GameState, type LocationState } from '../GameState';

/** Wanduhr-Kontext; `core` liest die Uhr nie selbst. */
export interface ClockContext {
  now: number;
  /** Lokale Stunde 0..23 (siehe `localHour`). */
  localHour: number;
}

const locs = (s: GameState): LocationState[] => Object.values(s.locations);
const maxOf = (s: GameState, f: (l: LocationState) => number): number =>
  locs(s).reduce((m, l) => Math.max(m, f(l)), 0);

/** Aktueller Wert in der Einheit der Achievement-Art (für Fortschrittsbalken und Prüfung). */
export function achievementValue(
  state: GameState,
  def: AchievementDef,
  ctx?: ClockContext,
): number {
  const st = state.stats;
  switch (def.kind) {
    case 'lifetimeEarned':
      return state.meta.lifetimeEarned.toNumber();
    case 'customersServed':
      return st.customersServed;
    case 'stationLevel':
      return maxOf(state, (l) => Math.max(0, ...Object.values(l.stations).map((x) => x.level)));
    case 'cafeLevel':
      return maxOf(state, (l) => l.level);
    case 'allStations':
      return locs(state).some((l) => STATIONS.every((d) => (l.stations[d.id]?.level ?? 0) > 0))
        ? 1
        : 0;
    case 'quality':
      return Math.min(
        MAX_GRADE,
        maxOf(state, (l) => l.supply.bestGrade),
      );
    case 'highSatisfaction':
      return st.highSatisfactionBestSec;
    case 'staffMaxed':
      return maxOf(
        state,
        (l) => STAFF_ROLES.filter((r) => (l.staff[r.id] ?? 0) >= r.maxLevel).length,
      );
    case 'resets':
      return st.resets;
    case 'locations':
      return state.meta.unlockedLocations.length;
    case 'taps':
      return st.taps;
    case 'hypeFills':
      return st.hypeFills;
    case 'events':
      return st.events;
    case 'playtime':
      return state.playtimeSec;
    case 'videos':
      return st.videos;
    case 'quests':
      return st.questsCompleted;
    case 'followers':
      return maxOf(state, (l) => l.social.followers);
    case 'nightShift': {
      if (!ctx) return 0;
      const h = ctx.localHour;
      return h >= NIGHT_SHIFT_HOURS.from && h < NIGHT_SHIFT_HOURS.to ? 1 : 0;
    }
    case 'spotless':
      return state.playtimeSec >= SPOTLESS.minPlaytimeSec &&
        locs(state).some((l) => l.cleanliness >= SPOTLESS.cleanliness)
        ? 1
        : 0;
  }
}

export function isAchievementUnlocked(state: GameState, id: string): boolean {
  return state.meta.achievements[id] !== undefined;
}

/** Fortschritt 0..1 (für die Anzeige; erledigte = 1). */
export function achievementProgress(state: GameState, def: AchievementDef): number {
  if (isAchievementUnlocked(state, def.id)) return 1;
  return Math.min(1, Math.max(0, achievementValue(state, def) / def.target));
}

export interface AchievementCheck {
  state: GameState;
  /** In diesem Aufruf neu freigeschaltete IDs (je ID genau einmal im Spielverlauf). */
  unlocked: string[];
}

/** Schaltet alle erfüllten Achievements frei und schreibt die Blätter einmalig gut. */
export function checkAchievements(state: GameState, ctx: ClockContext): AchievementCheck {
  const unlocked: string[] = [];
  let s = state;
  for (const def of ACHIEVEMENTS) {
    if (isAchievementUnlocked(s, def.id)) continue;
    if (achievementValue(s, def, ctx) < def.target) continue;
    unlocked.push(def.id);
    s = grantLeaves(
      {
        ...s,
        meta: {
          ...s.meta,
          achievements: { ...s.meta.achievements, [def.id]: { unlockedAt: ctx.now } },
        },
      },
      def.reward,
    );
  }
  return { state: s, unlocked };
}

export function countUnlockedAchievements(state: GameState): number {
  return ACHIEVEMENTS.filter((a) => isAchievementUnlocked(state, a.id)).length;
}
