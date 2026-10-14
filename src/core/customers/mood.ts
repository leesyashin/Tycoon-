import { UI_CONFIG } from '@data/ui';

export type Mood = 'happy' | 'neutral' | 'sad';

/** Stimmung aus der Zufriedenheit (0–100); nur für die Anzeige (HUD-Symbol, Smileys in der Szene). */
export function mood(satisfaction: number): Mood {
  const m = UI_CONFIG.mood;
  if (satisfaction >= m.happyFrom) return 'happy';
  if (satisfaction >= m.neutralFrom) return 'neutral';
  return 'sad';
}
