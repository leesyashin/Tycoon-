/** Kundentypen nach GAME_DESIGN § 7.5. Aussehen: Sprites aus `scripts/art/sprites.ts`; Effekte kommen ins Rate-Modell (siehe STATUS „Offen“). */
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
