/**
 * Ausstattung der drei Theken (GAME_DESIGN § 4, Phase 2 „bedientes Café“). Werte für Berlin (×1); andere
 * Standorte skalieren Kosten und Preise mit `data/locations`. Technisch heißen sie weiter „Stationen“
 * (`LocationState.stations`, Café-Level = Summe der Level), gespielt werden sie als Geräte an der Theke.
 */
export type StationArea = 'order' | 'bar' | 'service';
export type StaffRole = 'cashier' | 'barista' | 'waiter';

export interface StationDef {
  id: string;
  /** Bestelltheke, Barista-Theke (Produktlinie) oder Ausgabe. */
  area: StationArea;
  /** Café-Level, ab dem die Ausstattung kaufbar ist. */
  unlockCafeLevel: number;
  baseCost: number;
  /** Kosten-Wachstum `g` pro Level. */
  growth: number;
  /** Preis je Stück; 0 = kein Produkt (Kasse, Ausgabe-Station). */
  basePrice: number;
  /** Sekunden je Vorgang bei Tempo 1 (Produktlinien: ein Stück zubereiten). */
  workTime: number;
  /** Anteil der Gäste, die das Produkt bestellen (Warenkorb-Modell, § 4); 0 ohne Produkt. */
  attachRate: number;
  /** Rolle, die an dieser Ausstattung arbeitet. */
  staffRole: StaffRole;
  /** Level beim Spielstart (Matcha-Station ist gratis auf Level 1). */
  startLevel: number;
}

export const REGISTER_ID = 'register';
export const SERVING_STATION_ID = 'servingStation';

export const STATIONS: readonly StationDef[] = [
  {
    id: 'register',
    area: 'order',
    unlockCafeLevel: 1,
    baseCost: 60,
    growth: 1.15,
    basePrice: 0,
    workTime: 0,
    attachRate: 0,
    staffRole: 'cashier',
    startLevel: 0,
  },
  {
    id: 'matchaStation',
    area: 'bar',
    unlockCafeLevel: 1,
    baseCost: 10,
    growth: 1.14,
    basePrice: 3,
    workTime: 4,
    attachRate: 1,
    staffRole: 'barista',
    startLevel: 1,
  },
  {
    id: 'coffeeMachine',
    area: 'bar',
    unlockCafeLevel: 2,
    baseCost: 400,
    growth: 1.16,
    basePrice: 3,
    workTime: 3,
    attachRate: 0.25,
    staffRole: 'barista',
    startLevel: 0,
  },
  {
    id: 'iceBox',
    area: 'bar',
    unlockCafeLevel: 3,
    baseCost: 2_500,
    growth: 1.17,
    basePrice: 6,
    workTime: 5,
    attachRate: 0.2,
    staffRole: 'barista',
    startLevel: 0,
  },
  {
    id: 'oven',
    area: 'bar',
    unlockCafeLevel: 5,
    baseCost: 15_000,
    growth: 1.18,
    basePrice: 15,
    workTime: 6,
    attachRate: 0.25,
    staffRole: 'barista',
    startLevel: 0,
  },
  {
    id: 'displayCase',
    area: 'bar',
    unlockCafeLevel: 7,
    baseCost: 120_000,
    growth: 1.19,
    basePrice: 55,
    workTime: 4,
    attachRate: 0.18,
    staffRole: 'barista',
    startLevel: 0,
  },
  {
    id: 'grinder',
    area: 'bar',
    unlockCafeLevel: 9,
    baseCost: 1_000_000,
    growth: 1.2,
    basePrice: 280,
    workTime: 20,
    attachRate: 0.12,
    staffRole: 'barista',
    startLevel: 0,
  },
  {
    id: 'ceremonySet',
    area: 'bar',
    unlockCafeLevel: 12,
    baseCost: 12_000_000,
    growth: 1.21,
    basePrice: 2_100,
    workTime: 60,
    attachRate: 0.06,
    staffRole: 'barista',
    startLevel: 0,
  },
  {
    id: 'servingStation',
    area: 'service',
    unlockCafeLevel: 4,
    baseCost: 3_000,
    growth: 1.17,
    basePrice: 0,
    workTime: 0,
    attachRate: 0,
    staffRole: 'waiter',
    startLevel: 0,
  },
];

/** Produktlinien der Barista-Theke (alles, was einen Preis hat). */
export const PRODUCT_LINES: readonly StationDef[] = STATIONS.filter((s) => s.area === 'bar');

export function getStationDef(id: string): StationDef {
  const def = STATIONS.find((s) => s.id === id);
  if (!def) throw new Error(`Unknown station: ${id}`);
  return def;
}

export function isProductLine(def: StationDef): boolean {
  return def.area === 'bar';
}

/** Reihenfolge der Bereiche in Listen (Shop, Icon-Grid). */
export const STATION_AREAS: readonly StationArea[] = ['order', 'bar', 'service'];
