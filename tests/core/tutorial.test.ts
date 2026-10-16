import { describe, expect, it } from 'vitest';
import { createInitialState, getLocation, withLocation, type GameState } from '@core/GameState';
import { D } from '@core/math';
import { buyAmbience, buyStation } from '@core/economy';
import { hireStaff } from '@core/staff';
import { orderMatcha } from '@core/supply';
import { postVideo } from '@core/social';
import { progressionStep } from '@core/progression';
import {
  advanceTutorial,
  checkTutorial,
  currentTutorialStep,
  isTutorialStepComplete,
  restartTutorial,
  skipTutorial,
} from '@core/tutorial';
import { TUTORIAL_STEPS, type TutorialStepDef } from '@data/tutorial';
import { getAmbienceDef } from '@data/ambience';
import { getStationDef } from '@data/stations';

const L = 'berlin';
const rich = (): GameState => {
  const s = createInitialState(0);
  return withLocation(s, L, { ...getLocation(s, L), coins: D(1e9) });
};
const at = (s: GameState, id: string): GameState => ({
  ...s,
  tutorial: { step: TUTORIAL_STEPS.findIndex((d) => d.id === id), done: false },
});
const stepId = (s: GameState): string | undefined => currentTutorialStep(s)?.id;
const current = (s: GameState): TutorialStepDef => {
  const def = currentTutorialStep(s);
  if (!def) throw new Error('kein Schritt');
  return def;
};

// Die Aufgaben des Tutorials, wie ein Spieler sie erledigt: Matcha bestellen, Matcha-Station verbessern, einen
// Tisch kaufen, eine Bedienung einstellen, ein Video posten.
const order = (s: GameState): GameState => orderMatcha(s, L, 0, 0);
const upgrade = (s: GameState): GameState => buyStation(s, L, 'matchaStation', 1);
const table = (s: GameState): GameState => buyAmbience(s, L, 'seats');
const hire = (s: GameState): GameState => hireStaff(s, L, 'waiter');
const video = (s: GameState): GameState => postVideo(s, L, 'latteArt');

describe('Tutorial (PLAN S9, Phase 3)', () => {
  it('zehn Schritte mit eindeutigen IDs: Einkauf, Ausbau, Tische, Öffnungszeiten, Personal, Social Media', () => {
    expect(TUTORIAL_STEPS.map((d) => d.id)).toEqual([
      'welcome',
      'order',
      'upgrade',
      'table',
      'hours',
      'staff',
      'social',
      'satisfaction',
      'offline',
      'locations',
    ]);
    expect(new Set(TUTORIAL_STEPS.map((d) => d.id)).size).toBe(TUTORIAL_STEPS.length);
    expect(currentTutorialStep(createInitialState(0))?.id).toBe('welcome');
  });
  it('Aufgaben zeigen auf vorhandene Geräte und Ambiente und sind beim Spielstart noch offen', () => {
    const s = createInitialState(0);
    for (const def of TUTORIAL_STEPS) {
      const c = def.check;
      if (c.kind === 'stationLevel')
        expect(c.level).toBeGreaterThan(getStationDef(c.stationId).startLevel);
      if (c.kind === 'ambience') expect(c.level).toBeGreaterThan(getAmbienceDef(c.id).startLevel);
      // Sonst würde der Schritt sofort übersprungen und der Spieler sähe ihn nie.
      expect(isTutorialStepComplete(s, def), def.id).toBe(false);
    }
  });
  it('manuelle Schritte gehen nur per advance weiter', () => {
    const s = createInitialState(0);
    expect(checkTutorial(s)).toBe(s);
    expect(currentTutorialStep(advanceTutorial(s))?.id).toBe(TUTORIAL_STEPS[1]?.id);
    const hours = at(rich(), 'hours');
    expect(checkTutorial(hours)).toBe(hours);
  });
  it('Aufgaben-Schritte erkennen Bestellung, Upgrade, Tisch, eine weitere Kraft und ein Video', () => {
    let s = at(rich(), 'order');
    expect(isTutorialStepComplete(s, current(s))).toBe(false);
    s = checkTutorial(order(s));
    expect(stepId(s)).toBe('upgrade');
    s = checkTutorial(upgrade(s));
    expect(stepId(s)).toBe('table');
    s = checkTutorial(table(s));
    // Öffnungszeiten erklärt die Blase; weiter geht es per „Weiter“.
    expect(stepId(s)).toBe('hours');
    s = checkTutorial(advanceTutorial(s));
    expect(stepId(s)).toBe('staff');
    // Du an der Kasse und der Barista reichen nicht – eine weitere Kraft muss eingestellt werden.
    expect(isTutorialStepComplete(s, current(s))).toBe(false);
    s = checkTutorial(hire(s));
    expect(stepId(s)).toBe('social');
    s = checkTutorial(video(s));
    expect(stepId(s)).toBe('satisfaction');
  });
  it('schon erledigte Aufgaben werden übersprungen, bis ein manueller Schritt kommt', () => {
    let s = video(hire(table(upgrade(order(rich())))));
    s = checkTutorial(advanceTutorial(s));
    expect(stepId(s)).toBe('hours');
    s = checkTutorial(advanceTutorial(s));
    expect(stepId(s)).toBe('satisfaction');
  });
  it('nach dem letzten Schritt fertig; überspringen beendet sofort; wiederholen beginnt vorn', () => {
    let s = createInitialState(0);
    for (let i = 0; i < TUTORIAL_STEPS.length; i++) s = advanceTutorial(s);
    expect(s.tutorial.done).toBe(true);
    expect(currentTutorialStep(s)).toBeNull();
    expect(advanceTutorial(s)).toBe(s);
    expect(checkTutorial(s)).toBe(s);
    const skipped = skipTutorial(createInitialState(0));
    expect(skipped.tutorial.done).toBe(true);
    expect(skipTutorial(skipped)).toBe(skipped);
    expect(restartTutorial(skipped).tutorial).toEqual({ step: 0, done: false });
    expect(stepId(restartTutorial(s))).toBe('welcome');
  });
  it('progressionStep prüft das Tutorial mit', () => {
    const s = upgrade(at(rich(), 'upgrade'));
    expect(stepId(s)).toBe('upgrade');
    expect(stepId(progressionStep(s, 0, 0))).toBe('table');
  });
});
