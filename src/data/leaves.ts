/** Goldene Blätter: Ausgaben (GAME_DESIGN § 10), Boost-Regeln (§ 12.3) und Kunden-Drops (§ 7.5). */

/** Zeitsprung: Gewinn so vieler echter Stunden Café-Betrieb (alle Standorte) sofort, ohne dass die Zeit vergeht. */
export const TIME_SKIPS = [
  { id: 'skip1h', hours: 1, cost: 5 },
  { id: 'skip4h', hours: 4, cost: 15 },
  { id: 'skip8h', hours: 8, cost: 25 },
] as const;

export type TimeSkipId = (typeof TIME_SKIPS)[number]['id'];

/** Zeitlich begrenzte Boosts. Gleiche `id` verlängert, verschiedene multiplizieren sich. */
export interface BoostDef {
  id: string;
  durationSec: number;
  incomeMult: number;
  spawnMult: number;
  speedMult: number;
}

export const BOOSTS = {
  /** Gekaufter Boost ×2 Einkommen 30 min (8 🍃). */
  leaf: { id: 'leaf', durationSec: 30 * 60, incomeMult: 2, spawnMult: 1, speedMult: 1 },
  /** „Gratis-Boost“ der No-op-Monetarisierung (ersetzt die Rewarded Ad). */
  free: { id: 'free', durationSec: 10 * 60, incomeMult: 2, spawnMult: 1, speedMult: 1 },
} as const satisfies Record<string, BoostDef>;

export const LEAF_PRICES = {
  boost: 8,
  questComplete: 4,
} as const;

export const BOOST_RULES = {
  /** Höchster Gesamt-Multiplikator je Typ (income, spawn, speed) aus Events und Boosts – Exploit-Schutz. */
  maxMult: 12,
} as const;

/** Influencer-Kunden lassen mit 1 % Chance ein Blatt fallen, höchstens 10 am lokalen Tag. */
export const LEAF_DROPS = {
  customerType: 'influencer',
  chance: 0.01,
  maxPerDay: 10,
} as const;

/** Kosmetische Skins (v1: 2 Beispiele); Tönung des Stations-Platzhalters in der Szene. */
export interface SkinDef {
  id: string;
  stationId: string;
  tint: number;
  cost: number;
}

export const SKINS: readonly SkinDef[] = [
  { id: 'sakuraBar', stationId: 'matchaStation', tint: 0xffa8cc, cost: 30 },
  { id: 'neonCheckout', stationId: 'register', tint: 0x6ff3ff, cost: 30 },
];

export function getSkinDef(id: string): SkinDef | undefined {
  return SKINS.find((s) => s.id === id);
}
