/** Standorte nach GAME_DESIGN § 3. Die Stations-Mechanik ist überall gleich, nur die Skalierung unterscheidet sich. */
export interface LocationDef {
  id: string;
  /** Preis-Multiplikator für Kosten und Verkaufspreise aller Stationen. */
  scale: number;
  unlock: { prevLocationId: string; cafeLevel: number; zen: number } | null;
}

export const LOCATIONS: readonly LocationDef[] = [
  { id: 'berlin', scale: 1, unlock: null },
  { id: 'kyoto', scale: 25, unlock: { prevLocationId: 'berlin', cafeLevel: 15, zen: 10 } },
  { id: 'tokyo', scale: 600, unlock: { prevLocationId: 'kyoto', cafeLevel: 15, zen: 50 } },
  { id: 'seoul', scale: 15_000, unlock: { prevLocationId: 'tokyo', cafeLevel: 15, zen: 250 } },
  { id: 'newyork', scale: 400_000, unlock: { prevLocationId: 'seoul', cafeLevel: 15, zen: 1_200 } },
  { id: 'bali', scale: 1e7, unlock: { prevLocationId: 'newyork', cafeLevel: 15, zen: 6_000 } },
];

export const START_LOCATION_ID = 'berlin';

export function getLocationDef(id: string): LocationDef {
  const def = LOCATIONS.find((l) => l.id === id);
  if (!def) throw new Error(`Unknown location: ${id}`);
  return def;
}
