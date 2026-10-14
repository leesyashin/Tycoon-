import { AMBIENCE } from './ambience';
import { BALANCE } from './balance';
import { QUALITY_TIERS } from './quality';
import { STAFF_ROLES } from './staff';
import { STATIONS } from './stations';

/**
 * Freischalt-Tabelle und Café-Level-Belohnungen (GAME_DESIGN § 5.3). Die Freischalt-Level stehen an den
 * Definitionen selbst (Station, Ambiente, Personal, Qualität, Marketing); hier werden sie je Café-Level
 * gesammelt, damit UI und Tests eine einzige Übersicht haben.
 */
export const CAFE_LEVEL_REWARD = {
  /** Einmal-Belohnung: so viele Sekunden des aktuellen Einkommens. */
  incomeSeconds: 30,
  /** Ab diesem Café-Level gibt es zusätzlich Goldene Blätter … */
  leavesFromLevel: 5,
  /** … 1 Blatt, +1 alle `leavesStep` Level, höchstens `leavesMax`. */
  leavesStep: 5,
  leavesMax: 3,
} as const;

/** Grid-Erweiterung (GAME_DESIGN § 5.2): Stationen ab diesem Café-Level brauchen Terrasse ≥ 1 (Platz). */
export const TERRACE_REQUIREMENT = {
  fromCafeLevel: 9,
  ambienceId: 'terrace',
  minLevel: 1,
} as const;

export type UnlockKind = 'station' | 'ambience' | 'staff' | 'quality' | 'marketing';

export interface Unlock {
  kind: UnlockKind;
  /** Stations-/Ambiente-/Personal-ID, Qualitätsstufe als String, `campaign` für Marketing. */
  id: string;
}

function collect(): Map<number, Unlock[]> {
  const table = new Map<number, Unlock[]>();
  const add = (level: number, u: Unlock): void => {
    table.set(level, [...(table.get(level) ?? []), u]);
  };
  for (const s of STATIONS) add(s.unlockCafeLevel, { kind: 'station', id: s.id });
  for (const a of AMBIENCE) add(a.unlockCafeLevel, { kind: 'ambience', id: a.id });
  for (const r of STAFF_ROLES) add(r.unlockCafeLevel, { kind: 'staff', id: r.id });
  for (const q of QUALITY_TIERS) add(q.unlockCafeLevel, { kind: 'quality', id: String(q.tier) });
  add(BALANCE.marketing.unlockCafeLevel, { kind: 'marketing', id: 'campaign' });
  return table;
}

const TABLE = collect();

/** Was mit genau diesem Café-Level neu verfügbar wird. */
export function getUnlocksAt(level: number): readonly Unlock[] {
  return TABLE.get(level) ?? [];
}

/** Nächstes Café-Level über `level`, das etwas freischaltet (oder `null`). */
export function getNextUnlockLevel(level: number): number | null {
  const next = [...TABLE.keys()].filter((l) => l > level).sort((a, b) => a - b)[0];
  return next ?? null;
}

/** Goldene Blätter für das Erreichen von Café-Level `level`. */
export function cafeLevelLeaves(level: number): number {
  const r = CAFE_LEVEL_REWARD;
  if (level < r.leavesFromLevel) return 0;
  return Math.min(r.leavesMax, 1 + Math.floor((level - r.leavesFromLevel) / r.leavesStep));
}
