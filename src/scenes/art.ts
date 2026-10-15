import { CHAR_SPRITE, stationLookTier } from '@data/art';

/**
 * Atlas-Schlüssel und Frame-Namen der Szene (S8, Phase 2). Die Bilder erzeugt `pnpm art` aus
 * `scripts/art/sprites.ts` und `scripts/art/figures.ts` (PNG 2×, Lizenz: docs/ASSETS.md); Phaser zeigt sie
 * mit `ART_SCALE`.
 */
export const ATLAS = {
  common: 'common',
  theme: (locationId: string) => `theme-${locationId}`,
} as const;

/** Sprites liegen in doppelter Auflösung vor. */
export const ART_SCALE = 0.5;

/** Figuren: Füße liegen `CHAR_SPRITE.footY` px unter der Oberkante des Sprites (darunter der Bodenschatten). */
export const CHAR_FOOT_ORIGIN_Y = CHAR_SPRITE.footY / CHAR_SPRITE.h;

/** Abstand Fußpunkt → Platz über dem Kopf (logische Pixel) für Smiley, Fortschrittsring und Emote. */
export const CHAR_OVERLAY_Y = CHAR_SPRITE.headTop + 2;

/** Ab so vielen Tischen zeigt die Szene die Tischdecken-Variante. */
export const TABLE_TIER2_FROM = 13;

export const FRAME = {
  ghost: 'station-ghost',
  coin: 'coin',
  leaf: 'leaf',
  rain: 'fx-rain',
  petal: 'fx-petal',
  sparkle: 'fx-sparkle',
  steam: 'fx-steam',
  shine: 'fx-shine',
  glow: 'glow',
  dirt: 'fx-dirt',
  /** Front zeigt nach +y (Facing „a“) oder nach ±x („b“). */
  station: (id: string, level: number, facesX: boolean) =>
    `station-${id}-${String(stationLookTier(level))}-${facesX ? 'b' : 'a'}`,
  /** Thekenmodul ohne Gerät. */
  counter: (facesX: boolean) => `counter-${facesX ? 'b' : 'a'}`,
  ambience: (id: string) => `ambience-${id}`,
  /** Tisch mit zwei Stühlen; ab `TABLE_TIER2_FROM` Tischen mit Tischdecke. */
  table: (seatsLevel: number) =>
    seatsLevel >= TABLE_TIER2_FROM ? 'ambience-seats-2' : 'ambience-seats',
  /**
   * `look`: Variante aus `CUSTOMER_LOOKS`/`STAFF_LOOKS`; `front`: Blick nach +x/+y (zur Kamera), `back`: weg
   * von der Kamera; Frame 0 = Stehen, 1/2 = Laufen.
   */
  customer: (type: string, look: string, dir: 'front' | 'back', frame: number) =>
    `customer-${type}-${look}-${dir}-${String(frame)}`,
  /** Sitzend am Tisch, Beine nach vorn (Blickrichtung wie bei `customer`). */
  customerSit: (type: string, look: string, dir: 'front' | 'back') =>
    `customer-${type}-${look}-sit-${dir}`,
  staff: (role: string, look: string, dir: 'front' | 'back' = 'front', frame = 0) =>
    `staff-${role}-${look}-${dir}-${String(frame)}`,
  mood: (id: string) => `mood-${id}`,
  emote: (id: 'heart' | 'note' | 'star') => `emote-${id}`,
} as const;

/** URLs relativ zu `BASE_URL`. */
export function atlasUrls(key: string): { png: string; json: string } {
  const base = `${import.meta.env.BASE_URL}assets/sprites/${key}`;
  return { png: `${base}.png`, json: `${base}.json` };
}
