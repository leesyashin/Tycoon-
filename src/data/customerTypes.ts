/** Kundentypen nach GAME_DESIGN § 7.5. In S2 nur Aussehen und Anteile; Effekte kommen ins Rate-Modell (siehe STATUS „Offen“). */
export type CustomerTypeId = 'student' | 'tourist' | 'regular' | 'influencer' | 'critic';

export interface CustomerTypeDef {
  id: CustomerTypeId;
  /** Basis-Anteil 0..1, Summe = 1. */
  share: number;
  /** Platzhalter-Farben (Körper, Accessoire), bis S8 echte Sprites liefert. */
  body: number;
  accent: number;
  /** Form des Accessoires im Platzhalter-Sprite. */
  accessory: 'backpack' | 'hat' | 'cup' | 'phone' | 'notebook';
}

export const CUSTOMER_TYPES: readonly CustomerTypeDef[] = [
  { id: 'student', share: 0.4, body: 0x4f7cc9, accent: 0xe2b23a, accessory: 'backpack' },
  { id: 'tourist', share: 0.25, body: 0xe07b4f, accent: 0xf4e3b1, accessory: 'hat' },
  { id: 'regular', share: 0.2, body: 0x6b9a4c, accent: 0xd8f0c0, accessory: 'cup' },
  { id: 'influencer', share: 0.1, body: 0xd35fa0, accent: 0xffffff, accessory: 'phone' },
  { id: 'critic', share: 0.05, body: 0x4a4a58, accent: 0xc9c9d6, accessory: 'notebook' },
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
