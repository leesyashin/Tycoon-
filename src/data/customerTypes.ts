/** Kundentypen nach GAME_DESIGN § 7.5. Aussehen: Figuren aus `scripts/art/figures.ts` (Varianten in `data/art.ts`); Effekte als Erwartungswert im Rate-Modell. */
export type CustomerTypeId = 'student' | 'tourist' | 'regular' | 'influencer' | 'critic';

export interface CustomerTypeDef {
  id: CustomerTypeId;
  /** Basis-Anteil 0..1, Summe = 1. */
  share: number;
}

export const CUSTOMER_TYPES: readonly CustomerTypeDef[] = [
  { id: 'student', share: 0.4 },
  { id: 'tourist', share: 0.25 },
  { id: 'regular', share: 0.2 },
  { id: 'influencer', share: 0.1 },
  { id: 'critic', share: 0.05 },
];

/** Multiplikatoren je Standort auf den Basis-Anteil; danach wird normiert. */
export const CUSTOMER_SHARE_SHIFT: Readonly<
  Record<string, Partial<Record<CustomerTypeId, number>>>
> = {
  kyoto: { tourist: 1.6 },
  tokyo: { influencer: 2 },
  seoul: { influencer: 1.5, student: 1.2 },
  newyork: { critic: 1.6, tourist: 1.2 },
  bali: { tourist: 1.8 },
};

/**
 * Kleine Effekte der Kundentypen (GAME_DESIGN § 7.5). Das Rate-Modell rechnet sie als Erwartungswert über die
 * Anteile am Standort; die Figuren in der Szene bleiben kosmetisch.
 */
export const CUSTOMER_EFFECTS = {
  /** Touristen bestellen die Kuchenvitrine eher: Anteil der Gäste × (1 + Bonus × Touristen-Anteil). */
  touristStationId: 'displayCase',
  touristAttachBonus: 0.5,
  /** Stammgäste geben +10 % Trinkgeld. */
  regularTipBonus: 0.1,
  /** Kritiker: Abweichung der Zufriedenheit vom neutralen Wert zählt beim Trinkgeld doppelt. */
  criticSatisfactionWeight: 2,
  /** Influencer lösen je 5 s „Hype“ aus (Spawn ×1.5); überlappende Hypes verlängern nicht. */
  influencerHype: { spawnMult: 1.5, durationSec: 5 },
} as const;
