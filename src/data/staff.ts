/** Personal-Rollen nach GAME_DESIGN § 6. Kosten und Effekte folgen mit dem Personal-System in S4. */
export interface StaffRoleDef {
  id: string;
  unlockCafeLevel: number;
}

export const STAFF_ROLES: readonly StaffRoleDef[] = [
  { id: 'barista', unlockCafeLevel: 1 },
  { id: 'cashier', unlockCafeLevel: 2 },
  { id: 'cleaner', unlockCafeLevel: 3 },
  { id: 'manager', unlockCafeLevel: 4 },
  { id: 'baker', unlockCafeLevel: 5 },
  { id: 'socialMedia', unlockCafeLevel: 6 },
  { id: 'teaMaster', unlockCafeLevel: 9 },
];
