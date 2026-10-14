/** Stationsdefinitionen nach GAME_DESIGN § 4 (Werte für Berlin, ×1). */
export type StaffRole = 'barista' | 'cashier' | 'baker' | 'teaMaster';

export interface StationDef {
  id: string;
  /** Café-Level, ab dem die Station kaufbar ist. */
  unlockCafeLevel: number;
  baseCost: number;
  /** Kosten-Wachstum `g` pro Level. */
  growth: number;
  /** 0 = Station verkauft nichts selbst (Kasse). */
  basePrice: number;
  serviceTime: number;
  parallel: number;
  staffRole: StaffRole;
  /** Level beim Spielstart (Matcha-Bar ist gratis auf Level 1). */
  startLevel: number;
}

export const CHECKOUT_ID = 'checkout';

export const STATIONS: readonly StationDef[] = [
  {
    id: 'matchaBar',
    unlockCafeLevel: 1,
    baseCost: 10,
    growth: 1.07,
    basePrice: 3,
    serviceTime: 4,
    parallel: 1,
    staffRole: 'barista',
    startLevel: 1,
  },
  {
    id: 'checkout',
    unlockCafeLevel: 1,
    baseCost: 60,
    growth: 1.08,
    basePrice: 0,
    serviceTime: 2,
    parallel: 1,
    staffRole: 'cashier',
    startLevel: 0,
  },
  {
    id: 'togoWindow',
    unlockCafeLevel: 2,
    baseCost: 400,
    growth: 1.09,
    basePrice: 4,
    serviceTime: 3,
    parallel: 1,
    staffRole: 'barista',
    startLevel: 0,
  },
  {
    id: 'icedBar',
    unlockCafeLevel: 3,
    baseCost: 2_500,
    growth: 1.1,
    basePrice: 9,
    serviceTime: 5,
    parallel: 1,
    staffRole: 'barista',
    startLevel: 0,
  },
  {
    id: 'bakery',
    unlockCafeLevel: 5,
    baseCost: 15_000,
    growth: 1.11,
    basePrice: 22,
    serviceTime: 6,
    parallel: 1,
    staffRole: 'baker',
    startLevel: 0,
  },
  {
    id: 'merchShelf',
    unlockCafeLevel: 7,
    baseCost: 120_000,
    growth: 1.12,
    basePrice: 80,
    serviceTime: 8,
    parallel: 1,
    staffRole: 'cashier',
    startLevel: 0,
  },
  {
    id: 'ceremonyCorner',
    unlockCafeLevel: 9,
    baseCost: 1_000_000,
    growth: 1.13,
    basePrice: 400,
    serviceTime: 20,
    parallel: 1,
    staffRole: 'teaMaster',
    startLevel: 0,
  },
  {
    id: 'workshopRoom',
    unlockCafeLevel: 12,
    baseCost: 12_000_000,
    growth: 1.14,
    basePrice: 3_000,
    serviceTime: 60,
    parallel: 1,
    staffRole: 'teaMaster',
    startLevel: 0,
  },
];

export function getStationDef(id: string): StationDef {
  const def = STATIONS.find((s) => s.id === id);
  if (!def) throw new Error(`Unknown station: ${id}`);
  return def;
}
