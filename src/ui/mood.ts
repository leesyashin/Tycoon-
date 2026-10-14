import { mood, type Mood } from '@core/customers';

const MOOD_ICONS: Record<Mood, string> = { happy: '😊', neutral: '😐', sad: '😟' };

/** Stimmung als Symbol; dieselben Schwellen nutzt die Szene für die Smileys über den Kunden. */
export function moodIcon(satisfaction: number): string {
  return MOOD_ICONS[mood(satisfaction)];
}
