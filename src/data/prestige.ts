/** Franchise-Reset, Zen und Meta-Upgrades (GAME_DESIGN § 11). */
export const PRESTIGE = {
  /** Reset ist ab diesem Café-Level des Standorts möglich (§ 11.1). */
  resetMinCafeLevel: 10,
  /**
   * zenGain = floor(factor × sqrt(earnedThisRun / (divisor × locationScale)) × (1 + prestigeCount × perPrestige)).
   * Phase 3 (Euro): Ein erster Lauf mit rund 1 Mio. € Umsatz bringt gut 20 Zen.
   */
  zen: { factor: 1.8, divisor: 6_000, perPrestige: 0.1 },
} as const;

export type MetaUpgradeId =
  | 'globalIncome'
  | 'startCapital'
  | 'offlineEfficiency'
  | 'discount'
  | 'tapPower'
  | 'fastStart'
  | 'satisfactionBase';

export interface MetaUpgradeDef {
  id: MetaUpgradeId;
  /** Zen-Kosten der ersten Stufe; Stufe n kostet `cost × growth^n`. */
  cost: number;
  growth: number;
  maxLevel: number;
  /** Effekt pro Stufe (Bedeutung je Upgrade, siehe Kommentar). */
  perLevel: number;
}

export const META_UPGRADES: readonly MetaUpgradeDef[] = [
  /** +10 % Einkommen an allen Standorten. */
  { id: 'globalIncome', cost: 5, growth: 1.5, maxLevel: 50, perLevel: 0.1 },
  /** Startkapital nach Reset = so viele Spielstunden Umsatz des Vor-Runs (zur Hauptzeit) × Stufe. */
  { id: 'startCapital', cost: 10, growth: 2, maxLevel: 5, perLevel: 8 },
  /** +5 % Offline-Effizienz (Basis und Deckel in `BALANCE.offline`). */
  { id: 'offlineEfficiency', cost: 8, growth: 1.4, maxLevel: 10, perLevel: 0.05 },
  /** −2 % auf alle Ausbau-Kosten. */
  { id: 'discount', cost: 12, growth: 1.6, maxLevel: 15, perLevel: 0.02 },
  /** Tap-Wert +50 %. */
  { id: 'tapPower', cost: 6, growth: 1.5, maxLevel: 10, perLevel: 0.5 },
  /** Die ersten N Geräte starten nach Reset auf diesem Level. */
  { id: 'fastStart', cost: 25, growth: 2.5, maxLevel: 4, perLevel: 5 },
  /** +2 Basis-Zufriedenheit. */
  { id: 'satisfactionBase', cost: 10, growth: 1.5, maxLevel: 10, perLevel: 2 },
];

export function getMetaUpgradeDef(id: string): MetaUpgradeDef {
  const def = META_UPGRADES.find((m) => m.id === id);
  if (!def) throw new Error(`Unknown meta upgrade: ${id}`);
  return def;
}
