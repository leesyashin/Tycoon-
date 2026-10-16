/**
 * Onboarding (PLAN S9, Phase 3): 10 Schritte mit Highlight. `target` ist die `data-testid` des hervorgehobenen
 * Elements (`null` = ohne Highlight, Blase mittig). Schritte mit `manual` gehen per „Weiter“ weiter, die anderen
 * von selbst, sobald der Spieler die Aufgabe erledigt hat.
 */
export type TutorialCheck =
  | { kind: 'manual' }
  | { kind: 'stationLevel'; stationId: string; level: number }
  | { kind: 'ambience'; id: string; level: number }
  /** Mindestens so viele Köpfe/Stufen insgesamt (du an der Kasse und der Barista zählen mit). */
  | { kind: 'staffTotal'; count: number }
  /** So viele Matcha-Bestellungen insgesamt. */
  | { kind: 'matchaOrders'; count: number }
  /** So viele Videos insgesamt. */
  | { kind: 'videos'; count: number };

export interface TutorialStepDef {
  id: string;
  target: string | null;
  check: TutorialCheck;
}

export const TUTORIAL_STEPS: readonly TutorialStepDef[] = [
  { id: 'welcome', target: 'hud-coins', check: { kind: 'manual' } },
  { id: 'order', target: 'nav-supply', check: { kind: 'matchaOrders', count: 1 } },
  {
    id: 'upgrade',
    target: 'nav-shop',
    check: { kind: 'stationLevel', stationId: 'matchaStation', level: 2 },
  },
  { id: 'table', target: 'nav-build', check: { kind: 'ambience', id: 'seats', level: 2 } },
  { id: 'hours', target: 'hud-clock', check: { kind: 'manual' } },
  // Start: du an der Kasse und ein Barista; die Aufgabe ist eine weitere Kraft (z. B. eine Bedienung).
  { id: 'staff', target: 'nav-staff', check: { kind: 'staffTotal', count: 3 } },
  { id: 'social', target: 'nav-social', check: { kind: 'videos', count: 1 } },
  { id: 'satisfaction', target: 'hud-satisfaction', check: { kind: 'manual' } },
  { id: 'offline', target: null, check: { kind: 'manual' } },
  { id: 'locations', target: 'nav-locations', check: { kind: 'manual' } },
];
