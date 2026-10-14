import type { GameState } from '../GameState';
import { checkAchievements } from './achievements';
import { localHour, refreshQuests, updateQuestProgress } from './quests';

/**
 * Wanduhr-abhängiger Fortschritt (Quest-Tageswechsel, Achievements), getrennt vom Tick: der Tick bleibt
 * zeitzonenfrei und deterministisch, die App ruft das hier etwa einmal pro Sekunde auf.
 */
export function progressionStep(state: GameState, now: number, tzOffsetMin: number): GameState {
  let s = refreshQuests(state, now, tzOffsetMin);
  s = updateQuestProgress(s);
  return checkAchievements(s, { now, localHour: localHour(now, tzOffsetMin) }).state;
}
