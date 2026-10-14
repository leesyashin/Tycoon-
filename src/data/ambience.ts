/** Ambiente-Elemente nach GAME_DESIGN § 5.1 (Kosten für Berlin, ×1; Effekte stehen in `BALANCE`). */
export interface AmbienceDef {
  id: string;
  baseCost: number;
  growth: number;
  maxLevel: number;
  /** Café-Level, ab dem das Element kaufbar ist (Übersicht in `data/unlocks.ts`). */
  unlockCafeLevel: number;
}

export const AMBIENCE: readonly AmbienceDef[] = [
  { id: 'seats', baseCost: 50, growth: 1.15, maxLevel: 50, unlockCafeLevel: 1 },
  { id: 'decor', baseCost: 200, growth: 1.2, maxLevel: 30, unlockCafeLevel: 1 },
  { id: 'music', baseCost: 800, growth: 1.25, maxLevel: 20, unlockCafeLevel: 2 },
  { id: 'wifi', baseCost: 1_500, growth: 1.25, maxLevel: 20, unlockCafeLevel: 4 },
  { id: 'terrace', baseCost: 25_000, growth: 2, maxLevel: 3, unlockCafeLevel: 8 },
];

export function getAmbienceDef(id: string): AmbienceDef {
  const def = AMBIENCE.find((a) => a.id === id);
  if (!def) throw new Error(`Unknown ambience: ${id}`);
  return def;
}
