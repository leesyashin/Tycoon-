/** Personal-Rollen nach GAME_DESIGN § 6 (Kosten für Berlin, ×1; Kosten-Wachstum 1.5 je Stufe). */
export type StaffRoleId =
  'barista' | 'cashier' | 'cleaner' | 'manager' | 'baker' | 'socialMedia' | 'teaMaster';

export interface StaffRoleDef {
  id: StaffRoleId;
  unlockCafeLevel: number;
  baseCost: number;
  growth: number;
  maxLevel: number;
  /** +x Service-Tempo je Stufe an den genannten Stationen (multiplikativ über Rollen). */
  speed?: { perLevel: number; stations: readonly string[] };
}

export const STAFF_ROLES: readonly StaffRoleDef[] = [
  {
    id: 'barista',
    unlockCafeLevel: 1,
    baseCost: 100,
    growth: 1.5,
    maxLevel: 20,
    speed: { perLevel: 0.15, stations: ['matchaBar', 'togoWindow', 'icedBar'] },
  },
  {
    id: 'cashier',
    unlockCafeLevel: 2,
    baseCost: 300,
    growth: 1.5,
    maxLevel: 20,
    speed: { perLevel: 0.1, stations: ['merchShelf'] },
  },
  { id: 'cleaner', unlockCafeLevel: 3, baseCost: 500, growth: 1.5, maxLevel: 10 },
  { id: 'manager', unlockCafeLevel: 4, baseCost: 10_000, growth: 1.5, maxLevel: 5 },
  {
    id: 'baker',
    unlockCafeLevel: 5,
    baseCost: 5_000,
    growth: 1.5,
    maxLevel: 20,
    speed: { perLevel: 0.15, stations: ['bakery'] },
  },
  { id: 'socialMedia', unlockCafeLevel: 6, baseCost: 20_000, growth: 1.5, maxLevel: 15 },
  {
    id: 'teaMaster',
    unlockCafeLevel: 9,
    baseCost: 200_000,
    growth: 1.5,
    maxLevel: 20,
    speed: { perLevel: 0.15, stations: ['ceremonyCorner', 'workshopRoom'] },
  },
];

export function getStaffDef(id: string): StaffRoleDef {
  const def = STAFF_ROLES.find((r) => r.id === id);
  if (!def) throw new Error(`Unknown staff role: ${id}`);
  return def;
}
