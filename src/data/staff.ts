/**
 * Personal (GAME_DESIGN § 6; Phase 3): Jede Kraft kostet einen **Stundenlohn**, bezahlt nur, solange das Café
 * geöffnet ist (Vorgabe Vincent: „Personal wieder feuern können und sehen, wie viel sie kosten“). Einstellen kostet
 * einmalig eine kleine Gebühr (Anzeige, Einarbeitung), Entlassen ist jederzeit möglich. Die vier Service-Rollen
 * zählen als Köpfe, Filialleitung und Social-Media-Management als Stufen (jede Stufe eine erfahrenere Kraft mit
 * mehr Lohn). Euro-Werte für Berlin, andere Standorte × Preisniveau.
 */
export type StaffRoleId = 'cashier' | 'barista' | 'waiter' | 'cleaner' | 'manager' | 'socialMedia';

/** Stufe der Service-Pipeline, an der eine Rolle arbeitet (§ 7.2). */
export type StaffStage = 'order' | 'production' | 'service' | 'cleaning';

export interface StaffRoleDef {
  id: StaffRoleId;
  unlockCafeLevel: number;
  /** Höchste Anzahl (Köpfe) bzw. Stufe. */
  maxLevel: number;
  /** `true`: `loc.staff[id]` sind Köpfe, jeder arbeitet parallel; `false`: Stufe mit Bonus. */
  headcount: boolean;
  stage?: StaffStage;
  /** Gründungsteam: so viele gibt es beim Start eines Standorts und nach jedem Reset. */
  founding: number;
  /** Davon ohne Lohn und nicht kündbar: du selbst als Inhaber/in an der Kasse. */
  owner: number;
  /** So viele bleiben mindestens (ohne Barista bereitet niemand etwas zu); kündbar ist nur, was darüber liegt. */
  minimum: number;
  /** Stundenlohn je Kraft bzw. für Stufe 1. */
  wage: number;
  /** Stufen-Rollen: Lohn-Zuschlag je weitere Stufe. */
  wagePerLevel: number;
  /** Einmalig je Einstellung (bzw. je Stufe). */
  hireFee: number;
}

export const STAFF_ROLES: readonly StaffRoleDef[] = [
  {
    id: 'cashier',
    unlockCafeLevel: 1,
    maxLevel: 4,
    headcount: true,
    stage: 'order',
    founding: 1,
    owner: 1,
    minimum: 1,
    wage: 13.9,
    wagePerLevel: 0,
    hireFee: 40,
  },
  {
    id: 'barista',
    unlockCafeLevel: 1,
    maxLevel: 7,
    headcount: true,
    stage: 'production',
    founding: 1,
    owner: 0,
    minimum: 1,
    wage: 14.8,
    wagePerLevel: 0,
    hireFee: 60,
  },
  {
    id: 'waiter',
    unlockCafeLevel: 1,
    maxLevel: 4,
    headcount: true,
    stage: 'service',
    founding: 0,
    owner: 0,
    minimum: 0,
    wage: 13.9,
    wagePerLevel: 0,
    hireFee: 40,
  },
  {
    id: 'cleaner',
    unlockCafeLevel: 2,
    maxLevel: 3,
    headcount: true,
    stage: 'cleaning',
    founding: 0,
    owner: 0,
    minimum: 0,
    wage: 14.2,
    wagePerLevel: 0,
    hireFee: 40,
  },
  {
    id: 'socialMedia',
    unlockCafeLevel: 3,
    maxLevel: 3,
    headcount: false,
    founding: 0,
    owner: 0,
    minimum: 0,
    wage: 17,
    wagePerLevel: 4,
    hireFee: 120,
  },
  {
    id: 'manager',
    unlockCafeLevel: 5,
    maxLevel: 3,
    headcount: false,
    founding: 0,
    owner: 0,
    minimum: 0,
    wage: 24,
    wagePerLevel: 5,
    hireFee: 250,
  },
];

export function getStaffDef(id: string): StaffRoleDef {
  const def = STAFF_ROLES.find((r) => r.id === id);
  if (!def) throw new Error(`Unknown staff role: ${id}`);
  return def;
}

/** Köpfe des Gründungsteams je Rolle (nur Rollen mit `founding > 0`). */
export function foundingStaff(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of STAFF_ROLES) if (r.founding > 0) out[r.id] = r.founding;
  return out;
}
