/**
 * Onboarding (PLAN S9, UI_STYLE § 3.5): 8 Schritte mit Highlight. `target` ist die `data-testid` des
 * hervorgehobenen Elements (`null` = ohne Highlight, Blase mittig). Schritte mit `manual` gehen per
 * „Weiter“ weiter, die anderen von selbst, sobald der Spieler die Aufgabe erledigt hat.
 */
export type TutorialCheck =
  | { kind: 'manual' }
  | { kind: 'stationLevel'; stationId: string; level: number }
  | { kind: 'anyStaff' };

export interface TutorialStepDef {
  id: string;
  target: string | null;
  check: TutorialCheck;
}

export const TUTORIAL_STEPS: readonly TutorialStepDef[] = [
  { id: 'welcome', target: 'hud-coins', check: { kind: 'manual' } },
  {
    id: 'upgrade',
    target: 'nav-shop',
    check: { kind: 'stationLevel', stationId: 'matchaBar', level: 3 },
  },
  {
    id: 'station',
    target: 'nav-shop',
    check: { kind: 'stationLevel', stationId: 'checkout', level: 1 },
  },
  { id: 'staff', target: 'nav-staff', check: { kind: 'anyStaff' } },
  { id: 'satisfaction', target: 'hud-satisfaction', check: { kind: 'manual' } },
  { id: 'bar', target: 'actionbar', check: { kind: 'manual' } },
  { id: 'offline', target: null, check: { kind: 'manual' } },
  { id: 'locations', target: 'nav-locations', check: { kind: 'manual' } },
];
