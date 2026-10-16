/**
 * Ambiente-Elemente nach GAME_DESIGN § 5.1 (Euro-Kosten für Berlin, × Preisniveau; Effekte stehen in `BALANCE`).
 * `seats` sind die Tische (je Stufe ein Tisch mit zwei Plätzen), `parking` der Parkplatz neben dem Café
 * (Fahrradständer → Roller-Plätze → Auto-Stellplätze, Vorgabe Vincent 2026-10-16).
 */
export interface AmbienceDef {
  id: string;
  baseCost: number;
  growth: number;
  maxLevel: number;
  /** Café-Level, ab dem das Element kaufbar ist (Übersicht in `data/unlocks.ts`). */
  unlockCafeLevel: number;
  /** Stufe beim Start eines Cafés. */
  startLevel: number;
}

export const AMBIENCE: readonly AmbienceDef[] = [
  { id: 'seats', baseCost: 60, growth: 1.32, maxLevel: 10, unlockCafeLevel: 1, startLevel: 1 },
  { id: 'decor', baseCost: 30, growth: 1.22, maxLevel: 30, unlockCafeLevel: 1, startLevel: 0 },
  { id: 'music', baseCost: 120, growth: 1.35, maxLevel: 10, unlockCafeLevel: 2, startLevel: 0 },
  { id: 'parking', baseCost: 220, growth: 2.25, maxLevel: 5, unlockCafeLevel: 2, startLevel: 0 },
  { id: 'wifi', baseCost: 90, growth: 1.4, maxLevel: 8, unlockCafeLevel: 3, startLevel: 0 },
  { id: 'terrace', baseCost: 1_800, growth: 2.4, maxLevel: 3, unlockCafeLevel: 6, startLevel: 0 },
];

export function getAmbienceDef(id: string): AmbienceDef {
  const def = AMBIENCE.find((a) => a.id === id);
  if (!def) throw new Error(`Unknown ambience: ${id}`);
  return def;
}

/** Ambiente-Stufen eines neuen Cafés (nur Elemente mit Startstufe > 0). */
export function startAmbience(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of AMBIENCE) if (a.startLevel > 0) out[a.id] = a.startLevel;
  return out;
}
