import { describe, expect, it } from 'vitest';
import { createInitialState, getLocation, withLocation, type GameState } from '@core/GameState';
import { D } from '@core/math';
import { buyStation } from '@core/economy';
import { hireStaff } from '@core/staff';
import { progressionStep } from '@core/progression';
import {
  advanceTutorial,
  checkTutorial,
  currentTutorialStep,
  isTutorialStepComplete,
  skipTutorial,
} from '@core/tutorial';
import { TUTORIAL_STEPS } from '@data/tutorial';

const L = 'berlin';
const rich = (): GameState => {
  const s = createInitialState(0);
  return withLocation(s, L, { ...getLocation(s, L), coins: D(1e9) });
};
const at = (s: GameState, id: string): GameState => ({
  ...s,
  tutorial: { step: TUTORIAL_STEPS.findIndex((d) => d.id === id), done: false },
});

describe('Tutorial (PLAN S9)', () => {
  it('6–8 Schritte, IDs eindeutig, Start bei „welcome“', () => {
    expect(TUTORIAL_STEPS.length).toBeGreaterThanOrEqual(6);
    expect(TUTORIAL_STEPS.length).toBeLessThanOrEqual(8);
    expect(new Set(TUTORIAL_STEPS.map((d) => d.id)).size).toBe(TUTORIAL_STEPS.length);
    expect(currentTutorialStep(createInitialState(0))?.id).toBe('welcome');
  });
  it('manuelle Schritte gehen nur per advance weiter', () => {
    const s = createInitialState(0);
    expect(checkTutorial(s)).toBe(s);
    expect(currentTutorialStep(advanceTutorial(s))?.id).toBe(TUTORIAL_STEPS[1]?.id);
  });
  it('Aufgaben-Schritte erkennen Matcha-Bar-Upgrade, Kasse und Personal', () => {
    let s = at(rich(), 'upgrade');
    const def = currentTutorialStep(s);
    if (!def) throw new Error('kein Schritt');
    expect(isTutorialStepComplete(s, def)).toBe(false);
    s = checkTutorial(buyStation(s, L, 'matchaBar', 10));
    expect(currentTutorialStep(s)?.id).toBe('station');
    s = checkTutorial(buyStation(s, L, 'checkout', 1));
    expect(currentTutorialStep(s)?.id).toBe('staff');
    s = checkTutorial(hireStaff(s, L, 'barista'));
    expect(currentTutorialStep(s)?.id).toBe('satisfaction');
  });
  it('schon erledigte Aufgaben werden übersprungen, bis ein manueller Schritt kommt', () => {
    let s = rich();
    s = buyStation(s, L, 'matchaBar', 10);
    s = buyStation(s, L, 'checkout', 1);
    s = hireStaff(s, L, 'barista');
    s = checkTutorial(advanceTutorial(s));
    expect(currentTutorialStep(s)?.id).toBe('satisfaction');
  });
  it('nach dem letzten Schritt fertig; überspringen beendet sofort', () => {
    let s = createInitialState(0);
    for (let i = 0; i < TUTORIAL_STEPS.length; i++) s = advanceTutorial(s);
    expect(s.tutorial.done).toBe(true);
    expect(currentTutorialStep(s)).toBeNull();
    expect(advanceTutorial(s)).toBe(s);
    const skipped = skipTutorial(createInitialState(0));
    expect(skipped.tutorial.done).toBe(true);
    expect(skipTutorial(skipped)).toBe(skipped);
  });
  it('progressionStep prüft das Tutorial mit', () => {
    const s = buyStation(at(rich(), 'upgrade'), L, 'matchaBar', 10);
    expect(currentTutorialStep(progressionStep(s, 0, 0))?.id).toBe('station');
  });
});
