import { CHAR_SPRITE, stationLookTier, tableLookTier, type LookTier } from '@data/art';

/**
 * Atlas-Schlüssel und Frame-Namen der Szene (S8, Phase 2). Die Bilder erzeugt `pnpm art` aus
 * `scripts/art/equipment.ts`, `scripts/art/sprites.ts` und `scripts/art/figures.ts` (PNG 2×, Lizenz:
 * docs/ASSETS.md); Phaser zeigt sie mit `ART_SCALE`.
 */
export const ATLAS = {
  /** Figuren, Smileys, Münzen, Partikel. */
  common: 'common',
  /** Ausstattung in fünf Stufen, Thekenmodule, Tische, Ambiente (eigene Palette, eigene Textur). */
  furniture: 'furniture',
  theme: (locationId: string) => `theme-${locationId}`,
  /** Straßen-Objekte und Fahrzeuge des Stadtviertels (alle Standorte). */
  city: 'city',
} as const;

/** Sprites liegen in doppelter Auflösung vor. */
export const ART_SCALE = 0.5;

/** Figuren: Füße liegen `CHAR_SPRITE.footY` px unter der Oberkante des Sprites (darunter der Bodenschatten). */
export const CHAR_FOOT_ORIGIN_Y = CHAR_SPRITE.footY / CHAR_SPRITE.h;

/** Abstand Fußpunkt → Platz über dem Kopf (logische Pixel) für Smiley, Fortschrittsring und Emote. */
export const CHAR_OVERLAY_Y = CHAR_SPRITE.headTop + 2;

export const FRAME = {
  // Atlas `furniture`
  ghost: 'station-ghost',
  dirt: 'fx-dirt',
  /** Front zeigt nach +y (Facing „a“) oder nach ±x („b“); Stufe aus dem Level (`STATION_LOOK_LEVELS`). */
  station: (id: string, level: number, facesX: boolean) =>
    `station-${id}-${String(stationLookTier(level))}-${facesX ? 'b' : 'a'}`,
  /** Thekenmodul in der Stufe des Cafés mit Deko-Variante (`COUNTER_PROPS`). */
  counter: (tier: LookTier, variant: number, facesX: boolean) =>
    `counter-${String(tier)}-${String(variant)}-${facesX ? 'b' : 'a'}`,
  ambience: (id: string) => `ambience-${id}`,
  /** Tisch mit zwei Stühlen in der Stufe nach Anzahl der Tische (`TABLE_LOOK_LEVELS`). */
  table: (seatsLevel: number) => `table-${String(tableLookTier(seatsLevel))}`,
  /** Terrassen-Tisch mit Schirm in derselben Stufe. */
  tableOut: (seatsLevel: number) => `table-out-${String(tableLookTier(seatsLevel))}`,
  // Atlas `common`
  coin: 'coin',
  leaf: 'leaf',
  rain: 'fx-rain',
  petal: 'fx-petal',
  sparkle: 'fx-sparkle',
  steam: 'fx-steam',
  shine: 'fx-shine',
  glow: 'glow',
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
  // Themen-Atlas: Fassaden-Module der Altbauten (`scripts/art/city.ts`)
  facadeGround: (cell: string, face: 'a' | 'b') => `fac-${cell}-${face}`,
  facadeUpper: (cell: string, color: number, face: 'a' | 'b') =>
    `fac-${cell}-${String(color)}-${face}`,
  cornice: (color: number, face: 'a' | 'b') => `fac-cornice-${String(color)}-${face}`,
  /** Warme Scheiben eines erleuchteten Fensters (nachts über dem Modul). */
  facadeLit: (cell: string, face: 'a' | 'b') => `fac-lit-${cell}-${face}`,
  // Atlas `city`
  car: (type: number, front: boolean) => `car-${String(type)}-${front ? 'f' : 'b'}`,
  boat: (front: boolean) => `boat-${front ? 'f' : 'b'}`,
  pedLight: (go: boolean) => `pedLight-${go ? 'go' : 'stop'}`,
  emote: (id: 'heart' | 'note' | 'star') => `emote-${id}`,
} as const;

/** URLs relativ zu `BASE_URL`. */
export function atlasUrls(key: string): { png: string; json: string } {
  const base = `${import.meta.env.BASE_URL}assets/sprites/${key}`;
  return { png: `${base}.png`, json: `${base}.json` };
}
