/**
 * Standorte nach GAME_DESIGN § 3 (Phase 3): jede Filiale ist ein eigenes Café mit realistischem Preisniveau
 * (`scale`: Verkaufspreise, Einkauf, Löhne, Miete, Ausbau – Berlin = 1) und eigener Gäste-Zahl (`demand`).
 * Eröffnet wird mit Café-Level des Vorgängers, Zen und einer Investition aus der Kasse des Vorgängers.
 */
export interface LocationDef {
  id: string;
  /** Preisniveau der Stadt für Preise und Kosten. */
  scale: number;
  /** Gäste-Potenzial der Stadt (Faktor auf die Nachfrage). */
  demand: number;
  unlock: { prevLocationId: string; cafeLevel: number; zen: number; cost: number } | null;
}

export const LOCATIONS: readonly LocationDef[] = [
  { id: 'berlin', scale: 1, demand: 1, unlock: null },
  {
    id: 'kyoto',
    scale: 1.1,
    demand: 1.25,
    unlock: { prevLocationId: 'berlin', cafeLevel: 12, zen: 10, cost: 30_000 },
  },
  {
    id: 'tokyo',
    scale: 1.3,
    demand: 1.6,
    unlock: { prevLocationId: 'kyoto', cafeLevel: 12, zen: 40, cost: 90_000 },
  },
  {
    id: 'seoul',
    scale: 1.15,
    demand: 1.45,
    unlock: { prevLocationId: 'tokyo', cafeLevel: 12, zen: 120, cost: 180_000 },
  },
  {
    id: 'newyork',
    scale: 1.6,
    demand: 1.9,
    unlock: { prevLocationId: 'seoul', cafeLevel: 12, zen: 300, cost: 350_000 },
  },
  {
    id: 'bali',
    scale: 0.85,
    demand: 1.4,
    unlock: { prevLocationId: 'newyork', cafeLevel: 12, zen: 700, cost: 600_000 },
  },
];

export const START_LOCATION_ID = 'berlin';

export function getLocationDef(id: string): LocationDef {
  const def = LOCATIONS.find((l) => l.id === id);
  if (!def) throw new Error(`Unknown location: ${id}`);
  return def;
}
