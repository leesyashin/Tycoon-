import { stationLookTier } from '@data/art';

/**
 * Atlas-Schlüssel und Frame-Namen der Szene (S8). Die Bilder erzeugt `pnpm art` aus
 * `scripts/art/sprites.ts` (PNG 2×, Lizenz: docs/ASSETS.md); Phaser zeigt sie mit `ART_SCALE`.
 */
export const ATLAS = {
  common: 'common',
  theme: (locationId: string) => `theme-${locationId}`,
} as const;

/** Sprites liegen in doppelter Auflösung vor. */
export const ART_SCALE = 0.5;

/** Figuren: Füße liegen 4 px (logisch) über der Unterkante des 24×44-Sprites. */
export const CHAR_FOOT_ORIGIN_Y = 40 / 44;

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
  /** Theke zeigt nach +y (Facing „a“) oder nach ±x („b“). */
  station: (id: string, level: number, facesX: boolean) =>
    `station-${id}-${String(stationLookTier(level))}-${facesX ? 'b' : 'a'}`,
  ambience: (id: string) => `ambience-${id}`,
  /** `front`: Blick nach +x/+y (zur Kamera), `back`: weg von der Kamera. */
  customer: (type: string, dir: 'front' | 'back', frame: number) =>
    `customer-${type}-${dir}-${String(frame)}`,
  staff: (role: string, dir: 'front' | 'back' = 'front', frame = 0) =>
    `staff-${role}-${dir}-${String(frame)}`,
  mood: (id: string) => `mood-${id}`,
  emote: (id: 'heart' | 'note' | 'star') => `emote-${id}`,
} as const;

/** URLs relativ zu `BASE_URL`. */
export function atlasUrls(key: string): { png: string; json: string } {
  const base = `${import.meta.env.BASE_URL}assets/sprites/${key}`;
  return { png: `${base}.png`, json: `${base}.json` };
}
