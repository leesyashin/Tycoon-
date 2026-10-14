import type { GameState } from '../GameState';
import { checkAchievements } from './achievements';
import { localDateKey, localHour, refreshQuests, updateQuestProgress } from './quests';
import { refreshCalendarEvents } from '../events/calendar';
import { refreshLeafDropDay } from '../customers/drops';
import { checkTutorial } from '../tutorial';

/**
 * Wanduhr-abhängiger Fortschritt (Quest-Tageswechsel, Kalender-Events, Blätter-Tagesdeckel, Achievements, Tutorial-Aufgaben), getrennt vom Tick: der Tick bleibt
 * zeitzonenfrei und deterministisch, die App ruft das hier etwa einmal pro Sekunde auf.
 */
export function progressionStep(state: GameState, now: number, tzOffsetMin: number): GameState {
  let s = refreshQuests(state, now, tzOffsetMin);
  s = refreshCalendarEvents(s, now, tzOffsetMin);
  s = refreshLeafDropDay(s, localDateKey(now, tzOffsetMin));
  s = updateQuestProgress(s);
  s = checkTutorial(s);
  return checkAchievements(s, { now, localHour: localHour(now, tzOffsetMin) }).state;
}
