/**
 * Stadtviertel um das Café (Vorgabe Vincent, 2026-10-15: „Optik wie Hotel Empire Tycoon heißt nicht nur das Café
 * selbst, sondern auch Straßen und Gebäude drum herum“). Das Café ist ein Eckladen: Gehwege auf seinen beiden
 * Straßenseiten (vorn y ≥ 12, rechts x ≥ 12), dahinter Fahrbahnen mit Kreuzung, gegenüber ein Kiezpark und ein
 * Kanal; hinter und neben dem Café stehen Altbauten, deren Obergeschosse über die Café-Wände ragen.
 *
 * Alles rein kosmetisch (UI_STYLE § 4), keine Spielbalance. Koordinaten in Grid-Kacheln wie `layouts.ts`, Rechtecke
 * halb offen (`x0 ≤ x < x1`). Farben als Hex-Strings: Die Szene zeichnet Boden und Dächer als Flächen, die
 * Fassaden-Module rendert `pnpm art` (`scripts/art/city.ts`) in den Themen-Atlas.
 */

export interface GridRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type GroundKind =
  'courtyard' | 'sidewalk' | 'road' | 'grass' | 'path' | 'quay' | 'water' | 'bridge';

export interface GroundArea {
  kind: GroundKind;
  rect: GridRect;
}

export interface BuildingDef {
  rect: GridRect;
  /** Geschosse inklusive Erdgeschoss. */
  floors: number;
  /** Index in `CityPalette.facades`. */
  facade: number;
  /** Würfelt Balkone, Läden und erleuchtete Fenster (deterministisch). */
  seed: number;
}

export type PropKind =
  | 'linden'
  | 'lindenSmall'
  | 'lamp'
  | 'bench'
  | 'bikes'
  | 'litfass'
  | 'bin'
  | 'planter'
  | 'bollard'
  | 'cafeSign'
  | 'pedLight'
  | 'parked'
  | 'railing';

export interface PropDef {
  kind: PropKind;
  x: number;
  y: number;
  /** Variante (Auto-Farbe, Blickrichtung des Geländers …). */
  variant?: number;
  /** Achse, an der das Objekt ausgerichtet ist (Autos, Bänke, Geländer): `u` = entlang x. */
  axis?: 'u' | 'v';
}

/** Fahrstreifen: Autos fahren entlang `axis` auf der Linie `at`, Richtung `dir`. */
export interface LaneDef {
  axis: 'u' | 'v';
  at: number;
  dir: 1 | -1;
  /** Haltelinie vor dem Fußgängerüberweg (Koordinate entlang der Achse). */
  stopAt: number;
}

/** Weg eines Passanten als Polylinie; `cross` = vor diesem Punkt über die Fahrbahn dieser Achse (Ampel). */
export interface WalkPath {
  points: readonly { x: number; y: number; cross?: 'u' | 'v' }[];
}

/** Maße der Altbauten in Pixeln Höhe: Erdgeschoss so hoch wie die Café-Wand, darüber Wohngeschosse. */
export const CITY_STYLE = {
  groundFloorH: 64,
  floorH: 36,
  corniceH: 10,
  /** Höhe der Café-Box (Rückwand), verdeckt die Fassaden-Module dahinter. */
  cafeH: 64,
  /** Anteil erleuchteter Fenster nachts. */
  litShare: 0.4,
  /** Ab dieser Nacht-Stärke (0..1) gehen die Fenster an. */
  litFrom: 0.35,
} as const;

/** Bodenflächen in Zeichenreihenfolge (spätere liegen oben). */
const GROUND: GroundArea[] = [
  // Block-Innenhof als Grundton unter allen Häusern
  { kind: 'courtyard', rect: { x0: -16, y0: -16, x1: 15, y1: 15 } },
  // Gehwege am Café (Terrasse steht darauf) und gegenüber
  { kind: 'sidewalk', rect: { x0: -16, y0: 12, x1: 15, y1: 15 } },
  { kind: 'sidewalk', rect: { x0: 12, y0: -16, x1: 15, y1: 15 } },
  { kind: 'sidewalk', rect: { x0: -16, y0: 19, x1: 21, y1: 21 } },
  { kind: 'sidewalk', rect: { x0: 19, y0: -16, x1: 21, y1: 21 } },
  // Kiezpark gegenüber (vorn) mit Wegen
  { kind: 'grass', rect: { x0: -16, y0: 21, x1: 21, y1: 32 } },
  { kind: 'path', rect: { x0: 4.5, y0: 21, x1: 6.5, y1: 32 } },
  { kind: 'path', rect: { x0: -16, y0: 25, x1: 21, y1: 26.5 } },
  // Kanal rechts mit Ufermauern, dahinter Grün
  { kind: 'quay', rect: { x0: 21, y0: -16, x1: 22, y1: 32 } },
  { kind: 'water', rect: { x0: 22, y0: -16, x1: 26, y1: 32 } },
  { kind: 'quay', rect: { x0: 26, y0: -16, x1: 27, y1: 32 } },
  { kind: 'grass', rect: { x0: 27, y0: -16, x1: 32, y1: 32 } },
  // Fahrbahnen zuletzt (Brücke über den Kanal)
  { kind: 'road', rect: { x0: -16, y0: 15, x1: 32, y1: 19 } },
  { kind: 'road', rect: { x0: 15, y0: -16, x1: 19, y1: 32 } },
  { kind: 'bridge', rect: { x0: 21, y0: 14.6, x1: 27, y1: 19.4 } },
];

/** Altbauten; Reihenfolge = Zeichenreihenfolge (hinten zuerst). */
const BUILDINGS: BuildingDef[] = [
  { rect: { x0: -16, y0: -16, x1: -5, y1: 4 }, floors: 5, facade: 3, seed: 11 },
  { rect: { x0: -5, y0: -16, x1: 4, y1: -5 }, floors: 4, facade: 1, seed: 12 },
  { rect: { x0: 4, y0: -16, x1: 12, y1: -10 }, floors: 5, facade: 0, seed: 13 },
  { rect: { x0: 4, y0: -10, x1: 12, y1: -5 }, floors: 4, facade: 2, seed: 14 },
  { rect: { x0: -5, y0: -5, x1: 0, y1: 0 }, floors: 5, facade: 3, seed: 15 },
  { rect: { x0: 0, y0: -5, x1: 6, y1: 0 }, floors: 5, facade: 1, seed: 16 },
  { rect: { x0: 6, y0: -5, x1: 12, y1: 0 }, floors: 5, facade: 4, seed: 17 },
  { rect: { x0: -16, y0: 4, x1: -10, y1: 12 }, floors: 5, facade: 2, seed: 18 },
  { rect: { x0: -10, y0: 4, x1: -5, y1: 12 }, floors: 4, facade: 4, seed: 19 },
  { rect: { x0: -5, y0: 0, x1: 0, y1: 12 }, floors: 5, facade: 0, seed: 20 },
];

/** Linden am Bordstein (nicht direkt vor dem Café, damit der Blick frei bleibt). */
const TREES: PropDef[] = [
  ...[-14, -10, -6].map((x) => ({ kind: 'linden' as const, x, y: 14.45 })),
  ...[-14, -10, -6].map((y) => ({ kind: 'linden' as const, x: 14.45, y })),
  ...[-12, -6, 0, 6].map((x) => ({ kind: 'linden' as const, x, y: 19.55 })),
  ...[-12, -6, 0, 6].map((y) => ({ kind: 'linden' as const, x: 19.55, y })),
  // Park
  { kind: 'linden', x: -12, y: 23 },
  { kind: 'lindenSmall', x: -8, y: 28.5 },
  { kind: 'linden', x: 0, y: 23.2 },
  { kind: 'lindenSmall', x: 2, y: 29 },
  { kind: 'linden', x: 9.5, y: 23 },
  { kind: 'lindenSmall', x: 13, y: 28.5 },
  { kind: 'linden', x: 17, y: 23.5 },
  { kind: 'linden', x: -4, y: 29.5 },
  // Am anderen Kanalufer
  ...[-12, -6, 0, 6, 12, 24].map((y) => ({ kind: 'linden' as const, x: 28.5, y })),
];

const PROPS: PropDef[] = [
  ...TREES,
  // Laternen
  ...[-12, -3, 3.5, 10].map((x) => ({ kind: 'lamp' as const, x, y: 14.75 })),
  ...[-12, -3, 3.5, 10].map((y) => ({ kind: 'lamp' as const, x: 14.75, y })),
  ...[-9, 3, 15].map((x) => ({ kind: 'lamp' as const, x, y: 19.25 })),
  ...[-9, 3].map((y) => ({ kind: 'lamp' as const, x: 19.25, y })),
  // Fahrräder, Litfaßsäule, Mülleimer, Poller
  { kind: 'bikes', x: -8.2, y: 14.4, axis: 'u' },
  { kind: 'bikes', x: 14.4, y: -8.2, axis: 'v' },
  { kind: 'bikes', x: 14.4, y: 1.2, axis: 'v' },
  { kind: 'litfass', x: -1.6, y: 14.2 },
  { kind: 'bin', x: -4.6, y: 14.6 },
  { kind: 'bin', x: 14.6, y: -4.6 },
  { kind: 'bin', x: 7.2, y: 19.6 },
  ...[13.6, 14.3].map((x) => ({ kind: 'bollard' as const, x, y: 14.8 })),
  // Café: Nasenschild am Eingang, blaue Pflanzkübel an der Fassade
  { kind: 'cafeSign', x: 7.15, y: 12.15 },
  { kind: 'planter', x: 5.2, y: 12.2 },
  { kind: 'planter', x: 12.2, y: 5.2 },
  // Fußgängerampeln an der Ecke
  { kind: 'pedLight', x: 12.4, y: 14.8, axis: 'u' },
  { kind: 'pedLight', x: 14.8, y: 12.4, axis: 'v' },
  // Parkende Autos am Bordstein
  { kind: 'parked', x: -13, y: 15.5, axis: 'u', variant: 1 },
  { kind: 'parked', x: -9.5, y: 15.5, axis: 'u', variant: 3 },
  { kind: 'parked', x: -2.5, y: 15.5, axis: 'u', variant: 0 },
  { kind: 'parked', x: 15.5, y: -12, axis: 'v', variant: 2 },
  { kind: 'parked', x: 15.5, y: -5.5, axis: 'v', variant: 1 },
  { kind: 'parked', x: 18.5, y: 4, axis: 'v', variant: 0 },
  { kind: 'parked', x: 6, y: 18.5, axis: 'u', variant: 2 },
  // Park
  { kind: 'bench', x: -10, y: 24.4, axis: 'u' },
  { kind: 'bench', x: 1.5, y: 24.4, axis: 'u' },
  { kind: 'bench', x: 12, y: 24.4, axis: 'u' },
  { kind: 'bench', x: 3.8, y: 29, axis: 'v' },
  { kind: 'bin', x: 7, y: 24.5 },
  // Brückengeländer
  ...[21.5, 23, 24.5, 26].map((x) => ({
    kind: 'railing' as const,
    x,
    y: 14.8,
    axis: 'u' as const,
  })),
  ...[21.5, 23, 24.5, 26].map((x) => ({
    kind: 'railing' as const,
    x,
    y: 19.2,
    axis: 'u' as const,
  })),
];

const LANES: LaneDef[] = [
  // Fahrbahn vorn (entlang x): Haltelinien vor den Überwegen an der Kreuzung
  { axis: 'u', at: 16.5, dir: -1, stopAt: 19.4 },
  { axis: 'u', at: 17.5, dir: 1, stopAt: 12.3 },
  // Fahrbahn rechts (entlang y)
  { axis: 'v', at: 16.5, dir: 1, stopAt: 12.3 },
  { axis: 'v', at: 17.5, dir: -1, stopAt: 19.4 },
];

const SIDE_NEAR = 14.05;
const SIDE_FAR = 20;
const WALKS: WalkPath[] = [
  // Ums Café herum (vorn → Ecke → rechts) und zurück
  {
    points: [
      { x: -17, y: SIDE_NEAR },
      { x: SIDE_NEAR, y: SIDE_NEAR },
      { x: SIDE_NEAR, y: -17 },
    ],
  },
  {
    points: [
      { x: SIDE_NEAR, y: -17 },
      { x: SIDE_NEAR, y: SIDE_NEAR },
      { x: -17, y: SIDE_NEAR },
    ],
  },
  // Gegenüber am Park entlang
  {
    points: [
      { x: -17, y: SIDE_FAR },
      { x: SIDE_FAR, y: SIDE_FAR },
      { x: SIDE_FAR, y: -17 },
    ],
  },
  {
    points: [
      { x: SIDE_FAR, y: -17 },
      { x: SIDE_FAR, y: SIDE_FAR },
      { x: -17, y: SIDE_FAR },
    ],
  },
  // Über die Überwege (Ampel)
  {
    points: [
      { x: -17, y: SIDE_NEAR },
      { x: 13.6, y: SIDE_NEAR },
      { x: 13.6, y: SIDE_FAR, cross: 'u' },
      { x: -17, y: SIDE_FAR },
    ],
  },
  {
    points: [
      { x: SIDE_FAR, y: -17 },
      { x: SIDE_FAR, y: 13.6 },
      { x: SIDE_NEAR, y: 13.6, cross: 'v' },
      { x: SIDE_NEAR, y: -17 },
    ],
  },
];

export interface CityDef {
  /** Gezeichnete Fläche; die Kamera darf bis `pan` schwenken. */
  extent: GridRect;
  pan: GridRect;
  ground: GroundArea[];
  buildings: BuildingDef[];
  props: PropDef[];
  lanes: LaneDef[];
  walks: WalkPath[];
  /** Zebrastreifen: Rechteck und Achse der Fahrbahn, die er quert. */
  crossings: { rect: GridRect; axis: 'u' | 'v' }[];
}

export const CITY: CityDef = {
  extent: { x0: -16, y0: -16, x1: 32, y1: 32 },
  pan: { x0: -10, y0: -10, x1: 24, y1: 24 },
  ground: GROUND,
  buildings: BUILDINGS,
  props: PROPS,
  lanes: LANES,
  walks: WALKS,
  crossings: [
    { rect: { x0: 12.6, y0: 15, x1: 14.6, y1: 19 }, axis: 'u' },
    { rect: { x0: 15, y0: 12.6, x1: 19, y1: 14.6 }, axis: 'v' },
  ],
};

/** Verkehr und Passanten (kosmetisch). */
export const STREET_LIFE = {
  carTilesPerSec: 2.6,
  /** Halbe Wagenlänge: so weit vor der Haltelinie steht die Wagenmitte. */
  carHalfLength: 0.65,
  /** Mindestabstand zum Vordermann (Kacheln, Mitte zu Mitte). */
  carGap: 1.7,
  /** Neues Auto je Fahrstreifen im Mittel alle … Sekunden. */
  carEverySec: 4.5,
  maxCarsPerLane: 4,
  /** Autos starten/enden außerhalb des Bildes. */
  laneFrom: -18,
  laneTo: 34,
  /** Ampel: Grünphase je Achse, danach alles Rot, damit die Kreuzung frei wird. */
  greenSec: 9,
  allRedSec: 2.5,
  walkers: 9,
  walkerTilesPerSec: 1.15,
  /** Pause, bevor ein Passant am Ende seines Wegs neu startet (Sekunden, gleichverteilt). */
  walkerRestMin: 1,
  walkerRestMax: 6,
  /** Ausflugsdampfer auf dem Kanal. */
  boatTilesPerSec: 0.55,
  boatAt: 24,
  /** Wendepause am Ende des Kanals. */
  boatRestSec: 8,
  carTypes: 4,
} as const;

export interface CityPalette {
  /** Fassadenfarben der Altbauten (Index = `BuildingDef.facade`). */
  facades: readonly string[];
  /** Stuck: Fensterfaschen, Gesimse, Balkonplatten. */
  stucco: string;
  /** Erdgeschoss-Sockel (Ladenzone, gequadert). */
  plinth: string;
  roof: string;
  roofRim: string;
  courtyard: string;
  sidewalk: string;
  sidewalkJoint: string;
  curb: string;
  road: string;
  roadMark: string;
  grass: string;
  grassDark: string;
  path: string;
  quay: string;
  water: string;
  waterLight: string;
  /** Hintergrund der Kamera außerhalb der Stadt. */
  outside: string;
}

const BERLIN: CityPalette = {
  facades: ['#e8c993', '#e6a993', '#b9cfc0', '#b9c5d9', '#efe3c8'],
  stucco: '#f7f1e6',
  plinth: '#a59b8f',
  roof: '#7c7f92',
  roofRim: '#9b9eb0',
  courtyard: '#b9b1a4',
  sidewalk: '#cdc8bf',
  sidewalkJoint: '#b6b0a6',
  curb: '#e2ded7',
  road: '#5d6274',
  roadMark: '#f3f1ea',
  grass: '#9ccb7f',
  grassDark: '#86b56b',
  path: '#e5d6b4',
  quay: '#bdb6aa',
  water: '#5fa8d8',
  waterLight: '#8cc6ea',
  outside: '#8f9a86',
};

export const CITY_PALETTES: Readonly<Record<string, CityPalette>> = {
  berlin: BERLIN,
  kyoto: {
    ...BERLIN,
    facades: ['#e9dcc0', '#d9c4a0', '#c8b894', '#efe6d2', '#bba582'],
    plinth: '#6e5340',
    roof: '#4e5568',
    roofRim: '#687087',
    grass: '#a6c98a',
    grassDark: '#8fb573',
    water: '#6db0c8',
  },
  tokyo: {
    ...BERLIN,
    facades: ['#c9ccd8', '#a9afc3', '#d9d3e6', '#9097b2', '#e8e4ef'],
    plinth: '#3f4362',
    roof: '#666b84',
    roofRim: '#80869f',
    courtyard: '#9da0b0',
    sidewalk: '#c2c4cf',
    sidewalkJoint: '#aeb1bd',
    road: '#4a4f66',
  },
  seoul: {
    ...BERLIN,
    facades: ['#e7e3db', '#cfd9e3', '#f0dac9', '#c9d7c5', '#dacce1'],
    plinth: '#8d8f9c',
  },
  newyork: {
    ...BERLIN,
    facades: ['#a6563f', '#934c3a', '#b96d50', '#c89c7c', '#80584a'],
    stucco: '#ece5da',
    plinth: '#3d3d48',
    roof: '#5d5d69',
    roofRim: '#777784',
    sidewalk: '#c4c0ba',
    road: '#53576a',
  },
  bali: {
    ...BERLIN,
    facades: ['#efe0bd', '#e3cfa2', '#f2e8d2', '#d9c290', '#e9d9b9'],
    plinth: '#8a6a3c',
    roof: '#a3664a',
    roofRim: '#bd8062',
    grass: '#8fcf7a',
    grassDark: '#76bb62',
    water: '#4fc1c9',
    waterLight: '#86dbe0',
    outside: '#86b66f',
  },
};

export function getCityPalette(locationId: string): CityPalette {
  return CITY_PALETTES[locationId] ?? BERLIN;
}

// ---------------------------------------------------------------------------------------------
// Fassaden-Raster (geteilt von `scripts/art/city.ts` und der Szene)
// ---------------------------------------------------------------------------------------------

export type FacadeFace = 'a' | 'b';
/** Module des Erdgeschosses (Ladenzone, farbunabhängig) und der Obergeschosse (je Fassadenfarbe). */
export const GROUND_CELLS = ['shop0', 'shop1', 'shop2', 'shop3', 'door', 'base'] as const;
export const UPPER_CELLS = ['win', 'balc'] as const;
export type GroundCell = (typeof GROUND_CELLS)[number];
export type UpperCell = (typeof UPPER_CELLS)[number];

/** Pseudozufall 0..1 aus ganzen Zahlen (stabil zwischen Läufen und Geräten). */
export function hash01(...n: number[]): number {
  let h = 2166136261;
  for (const v of n) {
    h ^= Math.trunc(v * 7919) & 0xffff;
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Gesamthöhe eines Hauses in Pixeln (Erdgeschoss, Obergeschosse, Gesims). */
export function buildingHeight(b: BuildingDef): number {
  return CITY_STYLE.groundFloorH + (b.floors - 1) * CITY_STYLE.floorH + CITY_STYLE.corniceH;
}

/** Erdgeschoss-Modul einer Fassadenachse zur Straße: meist Läden, dazwischen Haustüren. */
export function groundCellFor(b: BuildingDef, index: number, street: boolean): GroundCell {
  if (!street) return 'base';
  const r = hash01(b.seed, index, 3);
  if (index % 4 === 2 || r < 0.12) return 'door';
  return (['shop0', 'shop1', 'shop2', 'shop3'] as const)[Math.floor(r * 4) % 4] ?? 'shop0';
}

/** Obergeschoss-Modul: Balkone in ganzen Achsen (alle Geschosse außer dem obersten). */
export function upperCellFor(b: BuildingDef, index: number, floor: number): UpperCell {
  const axis = hash01(b.seed, index, 7) < 0.3;
  return axis && floor < b.floors - 1 ? 'balc' : 'win';
}

export function isLitWindow(
  b: BuildingDef,
  face: FacadeFace,
  index: number,
  floor: number,
): boolean {
  return hash01(b.seed, face === 'a' ? 1 : 2, index, floor) < CITY_STYLE.litShare;
}

/**
 * Leinwände der Stadt-Sprites in logischen Pixeln (PNG 2×); `ox`/`oy` = Bodenpunkt (u = v = z = 0), daraus
 * setzt die Szene den Ursprung. Fassaden-Module: Bodenpunkt = Anfang der Achse auf der Hauskante.
 */
export const CITY_SPRITE = {
  tree: { w: 96, h: 168, ox: 48, oy: 148 },
  prop: { w: 64, h: 112, ox: 32, oy: 96 },
  car: { w: 96, h: 64, ox: 48, oy: 40 },
  railing: { w: 96, h: 48, ox: 48, oy: 30 },
  boat: { w: 176, h: 88, ox: 88, oy: 58 },
  /** Fassaden-Modul der Höhe `hc`: Leinwand 64 × (hc + 38), Bodenpunkt (32, hc + 8). */
  cell: (hc: number) => ({ w: 64, h: hc + 38, ox: 32, oy: hc + 8 }),
} as const;
