/**
 * Ausstattung der drei Theken (GAME_DESIGN § 4; Phase 3 „realistisches Café“). Euro-Werte für Berlin; andere
 * Standorte rechnen mit ihrem Preisniveau (`data/locations`). Technisch heißen sie weiter „Stationen“
 * (`LocationState.stations`, Café-Level = Summe der Level), gespielt werden sie als Geräte an der Theke.
 *
 * Jedes Level macht ein Gerät schneller; an den Optik-Stufen (`STATION_LOOK_LEVELS`) kommt neben dem edleren
 * Aussehen ein neues Produkt auf die Karte (`menu`): etwas höherer Preis, mehr Gäste bestellen es, und die
 * breitere Karte zieht mehr Gäste an. Ein Gast gibt so am Start rund 5 € aus, mit voller Karte und bester
 * Matcha-Sorte um 30 € (dazu Trinkgeld) – Vorgabe Vincent: „zwischen 5 und 50 €, nicht wie im Tycoon“.
 */
import { BALANCE } from './balance';

export type StationArea = 'order' | 'bar' | 'service';
export type StaffRole = 'cashier' | 'barista' | 'waiter';

/** Eine Stufe der Speisekarte einer Produktlinie. */
export interface MenuTier {
  /** Durchschnittspreis je Stück (Berlin), bei Matcha-Produkten für die Kochqualität. */
  price: number;
  /** Stück je Gast (Anteil der Gäste, die das Produkt bestellen; über 1 = manche nehmen zwei). */
  attach: number;
  /** So viel mehr Gäste kommen wegen dieses Angebots (Anteil der Grundnachfrage). */
  demand: number;
}

export interface StationDef {
  id: string;
  /** Bestelltheke, Barista-Theke (Produktlinie) oder Ausgabe. */
  area: StationArea;
  /** Café-Level, ab dem die Ausstattung kaufbar ist. */
  unlockCafeLevel: number;
  /** Kosten des ersten Levels (Kauf) in Euro; jedes weitere Level × `growth`. */
  baseCost: number;
  growth: number;
  maxLevel: number;
  /** Spielminuten je Vorgang bei Tempo 1 (Produktlinie: ein Stück; Kasse: eine Bestellung). */
  workMin: number;
  /** Speisekarte je Optik-Stufe 1..5; leer ohne Produkt (Kasse, Ausgabe-Station). */
  menu: readonly MenuTier[];
  /** Wareneinsatz je Stück ohne Matcha (Milch, Becher, Teig, Kuchen …). */
  goodsCost: number;
  /** Matcha je Stück in Gramm; > 0: Preis folgt der Sorte, ohne Vorrat ist das Produkt aus. */
  matchaGrams: number;
  /** Rolle, die an dieser Ausstattung arbeitet. */
  staffRole: StaffRole;
  /** Level beim Spielstart (Matcha-Station steht schon da). */
  startLevel: number;
}

/**
 * Ab diesen Leveln gilt die nächste Stufe der Speisekarte (und das nächste, edlere Aussehen des Geräts,
 * `STATION_LOOK_LEVELS` in `data/art.ts`).
 */
export const MENU_LEVELS = [1, 5, 10, 15, 20] as const;

/** Stufe 1..5 der Speisekarte (und der Optik) zu einem Level; unter Level 1 Stufe 1. */
export function menuTierIndex(level: number): number {
  let tier = 1;
  MENU_LEVELS.forEach((l, i) => {
    if (level >= l) tier = i + 1;
  });
  return tier;
}

export const REGISTER_ID = 'register';
export const SERVING_STATION_ID = 'servingStation';

const tiers = (...t: [price: number, attach: number, demand: number][]): MenuTier[] =>
  t.map(([price, attach, demand]) => ({ price, attach, demand }));

export const STATIONS: readonly StationDef[] = [
  {
    id: 'register',
    area: 'order',
    unlockCafeLevel: 1,
    baseCost: 90,
    growth: 1.27,
    maxLevel: 20,
    workMin: BALANCE.order.orderMin,
    menu: [],
    goodsCost: 0,
    matchaGrams: 0,
    staffRole: 'cashier',
    startLevel: 0,
  },
  {
    // Matcha Latte → Hafer/Kokos → Erdbeer-/Vanille-Matcha → Matcha-Tonic → Signature-Kreationen
    id: 'matchaStation',
    area: 'bar',
    unlockCafeLevel: 1,
    baseCost: 35,
    growth: 1.27,
    maxLevel: 20,
    workMin: 2,
    menu: tiers(
      [5.2, 1, 0],
      [5.5, 1.05, 0.04],
      [5.9, 1.1, 0.08],
      [6.4, 1.15, 0.12],
      [6.9, 1.2, 0.16],
    ),
    goodsCost: 0.55,
    matchaGrams: 3,
    staffRole: 'barista',
    startLevel: 1,
  },
  {
    // Espresso → Cappuccino → Flat White → Pour-over → Dirty Chai & Co.
    id: 'coffeeMachine',
    area: 'bar',
    unlockCafeLevel: 2,
    baseCost: 420,
    growth: 1.22,
    maxLevel: 20,
    workMin: 1.5,
    menu: tiers(
      [3.4, 0.2, 0.2],
      [3.7, 0.24, 0.24],
      [4, 0.28, 0.28],
      [4.4, 0.31, 0.31],
      [4.9, 0.34, 0.34],
    ),
    goodsCost: 0.7,
    matchaGrams: 0,
    staffRole: 'barista',
    startLevel: 0,
  },
  {
    // Iced Matcha Latte → Frappé → Matcha-Limonade → Matcha-Softeis → Affogato
    id: 'iceBox',
    area: 'bar',
    unlockCafeLevel: 3,
    baseCost: 900,
    growth: 1.21,
    maxLevel: 20,
    workMin: 1.6,
    menu: tiers(
      [5.6, 0.22, 0.1],
      [5.9, 0.26, 0.12],
      [6.2, 0.3, 0.14],
      [6.6, 0.33, 0.16],
      [7, 0.36, 0.18],
    ),
    goodsCost: 0.7,
    matchaGrams: 3,
    staffRole: 'barista',
    startLevel: 0,
  },
  {
    // Croissant → Matcha-Croissant → Bananenbrot → Zimtschnecke → Laugen-Croissant mit Matcha-Creme
    id: 'oven',
    area: 'bar',
    unlockCafeLevel: 5,
    baseCost: 1_600,
    growth: 1.2,
    maxLevel: 20,
    workMin: 1,
    menu: tiers(
      [3.2, 0.25, 0.1],
      [3.6, 0.3, 0.12],
      [4, 0.34, 0.14],
      [4.5, 0.38, 0.16],
      [5.2, 0.42, 0.18],
    ),
    goodsCost: 1,
    matchaGrams: 0,
    staffRole: 'barista',
    startLevel: 0,
  },
  {
    // Käsekuchen → Matcha-Cheesecake → Mochi → Matcha-Tiramisu → Torte des Tages
    id: 'displayCase',
    area: 'bar',
    unlockCafeLevel: 7,
    baseCost: 3_200,
    growth: 1.19,
    maxLevel: 20,
    workMin: 0.6,
    menu: tiers(
      [4.5, 0.2, 0.08],
      [4.9, 0.24, 0.1],
      [5.4, 0.28, 0.12],
      [5.9, 0.31, 0.14],
      [6.5, 0.34, 0.16],
    ),
    goodsCost: 1.4,
    matchaGrams: 0,
    staffRole: 'barista',
    startLevel: 0,
  },
  {
    // Usucha aus frisch gemahlenem Tencha, je Stufe edler serviert
    id: 'grinder',
    area: 'bar',
    unlockCafeLevel: 9,
    baseCost: 7_500,
    growth: 1.18,
    maxLevel: 20,
    workMin: 3,
    menu: tiers(
      [7.5, 0.08, 0.06],
      [8, 0.1, 0.07],
      [8.6, 0.12, 0.08],
      [9.2, 0.13, 0.09],
      [9.9, 0.14, 0.1],
    ),
    goodsCost: 0.2,
    matchaGrams: 2,
    staffRole: 'barista',
    startLevel: 0,
  },
  {
    // Teezeremonie für zwei mit Wagashi
    id: 'ceremonySet',
    area: 'bar',
    unlockCafeLevel: 12,
    baseCost: 6_500,
    growth: 1.17,
    maxLevel: 20,
    workMin: 10,
    menu: tiers(
      [24, 0.03, 0.05],
      [26, 0.035, 0.06],
      [28, 0.04, 0.07],
      [31, 0.045, 0.08],
      [34, 0.05, 0.09],
    ),
    goodsCost: 3,
    matchaGrams: 8,
    staffRole: 'barista',
    startLevel: 0,
  },
  {
    id: 'servingStation',
    area: 'service',
    unlockCafeLevel: 4,
    baseCost: 650,
    growth: 1.21,
    maxLevel: 20,
    workMin: 0,
    menu: [],
    goodsCost: 0,
    matchaGrams: 0,
    staffRole: 'waiter',
    startLevel: 0,
  },
];

/** Produktlinien der Barista-Theke (alles mit Speisekarte). */
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
