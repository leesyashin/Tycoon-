/**
 * Personal-Rollen nach GAME_DESIGN § 6 (Phase 2): die vier Service-Rollen zählen als Köpfe, die parallel
 * arbeiten; Filialleiter und Social-Media-Manager bleiben Stufen. Kosten für Berlin (×1), Wachstum 1.7 je Kopf (Stufen-Rollen 1.5).
 */
export type StaffRoleId = 'cashier' | 'barista' | 'waiter' | 'cleaner' | 'manager' | 'socialMedia';

/** Stufe der Service-Pipeline, an der eine Rolle arbeitet (§ 7.2). */
export type StaffStage = 'order' | 'production' | 'service' | 'cleaning';

export interface StaffRoleDef {
  id: StaffRoleId;
  unlockCafeLevel: number;
  baseCost: number;
  growth: number;
  /** Höchste Anzahl (Köpfe) bzw. Stufe. */
  maxLevel: number;
  /** `true`: `loc.staff[id]` sind Köpfe, jeder arbeitet parallel; `false`: Stufe mit Bonus. */
  headcount: boolean;
  stage?: StaffStage;
  /** Gründungsteam: so viele gibt es gratis beim Start eines Standorts und nach jedem Reset. */
  founding: number;
}

export const STAFF_ROLES: readonly StaffRoleDef[] = [
  {
    id: 'cashier',
    unlockCafeLevel: 1,
    baseCost: 100,
    growth: 1.7,
    maxLevel: 20,
    headcount: true,
    stage: 'order',
    founding: 1,
  },
  {
    id: 'barista',
    unlockCafeLevel: 1,
    baseCost: 100,
    growth: 1.7,
    maxLevel: 20,
    headcount: true,
    stage: 'production',
    founding: 1,
  },
  {
    id: 'waiter',
    unlockCafeLevel: 1,
    baseCost: 150,
    growth: 1.7,
    maxLevel: 20,
    headcount: true,
    stage: 'service',
    founding: 1,
  },
  {
    id: 'cleaner',
    unlockCafeLevel: 2,
    baseCost: 3_500,
    growth: 1.7,
    maxLevel: 20,
    headcount: true,
    stage: 'cleaning',
    founding: 0,
  },
  {
    id: 'manager',
    unlockCafeLevel: 4,
    baseCost: 10_000,
    growth: 1.5,
    maxLevel: 5,
    headcount: false,
    founding: 0,
  },
  {
    id: 'socialMedia',
    unlockCafeLevel: 6,
    baseCost: 20_000,
    growth: 1.5,
    maxLevel: 15,
    headcount: false,
    founding: 0,
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
