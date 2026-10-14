/**
 * Platzhalter-Skins je Standort (GAME_DESIGN § 3 „Thema / Optik“): Boden-Tönung und Wandfarben.
 * Rein kosmetisch; echte Tilesets kommen in S8.
 */
export interface LocationTheme {
  /** Multiplikative Tönung der Bodenkacheln (0xffffff = unverändert). */
  floorTint: number;
  wallLeft: number;
  wallRight: number;
}

export const THEMES: Readonly<Record<string, LocationTheme>> = {
  // Altbau, Backstein
  berlin: { floorTint: 0xffffff, wallLeft: 0xe8dcc0, wallRight: 0xd4c6a6 },
  // Holz, Tatami
  kyoto: { floorTint: 0xe6f0c8, wallLeft: 0xf2e6cf, wallRight: 0xc9a77c },
  // Neon, Nacht
  tokyo: { floorTint: 0x9aa0c8, wallLeft: 0x3a3f6b, wallRight: 0x2b2f52 },
  // Dachterrasse, Lichterketten
  seoul: { floorTint: 0xd8d8e8, wallLeft: 0xf0d9b5, wallRight: 0xd9b98c },
  // Industrial
  newyork: { floorTint: 0xb8b0a8, wallLeft: 0xa0523d, wallRight: 0x7d4030 },
  // Bambus, Strand
  bali: { floorTint: 0xfff0c0, wallLeft: 0xd9c38c, wallRight: 0xb89c5e },
};

export function getTheme(locationId: string): LocationTheme {
  const theme = THEMES[locationId];
  if (!theme) throw new Error(`No theme for location: ${locationId}`);
  return theme;
}
