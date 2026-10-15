import { TUTORIAL_STEPS, type TutorialStepDef } from '@data/tutorial';
import { getLocation, type GameState } from '../GameState';

/** Aktueller Schritt oder `null`, wenn das Tutorial fertig/übersprungen ist. */
export function currentTutorialStep(state: GameState): TutorialStepDef | null {
  if (state.tutorial.done) return null;
  return TUTORIAL_STEPS[state.tutorial.step] ?? null;
}

/** Hat der Spieler die Aufgabe des Schritts erledigt? Manuelle Schritte nie von selbst. */
export function isTutorialStepComplete(state: GameState, def: TutorialStepDef): boolean {
  const loc = getLocation(state, state.activeLocationId);
  switch (def.check.kind) {
    case 'manual':
      return false;
    case 'stationLevel':
      return (loc.stations[def.check.stationId]?.level ?? 0) >= def.check.level;
    case 'staffTotal':
      return Object.values(loc.staff).reduce((a, b) => a + b, 0) >= def.check.count;
  }
}

/** Nächster Schritt; nach dem letzten ist das Tutorial fertig. */
export function advanceTutorial(state: GameState): GameState {
  if (state.tutorial.done) return state;
  const step = state.tutorial.step + 1;
  return { ...state, tutorial: { step, done: step >= TUTORIAL_STEPS.length } };
}

/** „Tutorial wiederholen“ aus den Einstellungen. */
export function restartTutorial(state: GameState): GameState {
  return { ...state, tutorial: { step: 0, done: false } };
}

export function skipTutorial(state: GameState): GameState {
  if (state.tutorial.done) return state;
  return { ...state, tutorial: { ...state.tutorial, done: true } };
}

/**
 * Überspringt alle Aufgaben-Schritte, die schon erledigt sind (auch mehrere hintereinander, z. B. wenn
 * der Spieler schneller war als das Tutorial). Manuelle Schritte warten auf „Weiter“.
 */
export function checkTutorial(state: GameState): GameState {
  let s = state;
  for (let def = currentTutorialStep(s); def && isTutorialStepComplete(s, def);) {
    s = advanceTutorial(s);
    def = currentTutorialStep(s);
  }
  return s;
}
