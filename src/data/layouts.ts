/**
 * Café-Grundriss (Phase 2, PLAN S11): 12×12 Kacheln. Rückwand-Ausstattung (y = 0), Personal-Gang (y = 1),
 * durchgehende Theke (y = 2) mit Kasse links und Ausgabe rechts, Bestellschlange davor (y = 3), Gastraum
 * mit bis zu 12 Tischen, Mittelgang x = 6 zum Eingang (6, 11). Kunden-Wege sind feste Waypoints, kein A*.
 * Alle Standorte nutzen denselben Grundriss (eigene Böden/Wände kommen aus dem Themen-Atlas).
 */
import { BALANCE } from './balance';

export interface GridPos {
  x: number;
  y: number;
}

export interface StationPlacement {
  stationId: string;
  /** Kachel der Ausstattung (Rückwand-Gerät oder Thekenmodul). */
  tile: GridPos;
  /** Arbeitsplatz der Figur dahinter (Personal-Gang). */
  workSpot: GridPos;
  /** Front zeigt nach +x statt +y (Sprite-Variante „b“). */
  facesX: boolean;
}

export interface TablePlacement {
  tile: GridPos;
  /** Sitzplätze links/rechts vom Tisch (Agenten-Koordinaten = Kachelmitte ± Versatz). */
  seats: readonly [GridPos, GridPos];
  /** Kachel, von der aus bedient und geputzt wird. */
  side: GridPos;
  /** Sichtbar ab so vielen Tischen (`seats`-Stufe). */
  minLevel: number;
}

export interface OrderArea {
  /** Kachel, auf der bestellt wird (vor der Kasse). */
  access: GridPos;
  /** Richtung, in die sich die Schlange vom Zugang aus verlängert (Einheitsvektor). */
  queueDir: GridPos;
  /** Weg vom Eingang bis hinter das Schlangenende (ohne Eingang, ohne Schlangenplätze). */
  path: GridPos[];
  /** Plätze der Verkäufer hinter der Kasse (Reihenfolge = Sichtbarkeit). */
  cashierSpots: GridPos[];
}

export interface PickupArea {
  /** Warteplätze der Abholer vor der Ausgabe. */
  spots: GridPos[];
  /** Plätze der Bedienungen hinter der Ausgabe (Reihenfolge = Sichtbarkeit). */
  waiterHomes: GridPos[];
  /** Weg vom Personal-Gang in den Gastraum (Lücke am Thekenende). */
  exit: GridPos[];
}

export interface AmbiencePlacement {
  /** Schlüssel in `LocationState.ambience`. */
  id: string;
  tile: GridPos;
  /** Sichtbar ab diesem Ambiente-Level (0 = immer). */
  minLevel: number;
}

/** Terrassen-Fläche (GAME_DESIGN § 5.2): Kacheln außerhalb des Raums, sichtbar ab Terrassen-Level. */
export interface TerraceArea {
  minLevel: number;
  /** Rechteck inklusive beider Ecken. */
  from: GridPos;
  to: GridPos;
}

export interface CafeLayout {
  gridSize: number;
  terrace: TerraceArea[];
  entrance: GridPos;
  /** Knoten, an dem der Eingangsgang den Gastraum erreicht. */
  junction: GridPos;
  /** Zeilen, auf denen gelaufen wird (zwischen den Tischreihen). */
  walkRows: { top: number; bottom: number };
  /** Thekenmodule ohne Gerät (Kasse und Ausgabe stehen in `stations`). */
  counter: GridPos[];
  stations: StationPlacement[];
  order: OrderArea;
  pickup: PickupArea;
  tables: TablePlacement[];
  ambience: AmbiencePlacement[];
  /** Startplatz der Putzkräfte. */
  cleanerHome: GridPos;
}

/** Darstellungs-Parameter der kosmetischen Figuren (nur Optik, keine Spielbalance). */
export const CROWD = {
  maxAgents: 40,
  /** Sichtbare Schlangenplätze; weitere Kunden warten als Grüppchen dahinter. */
  maxQueue: 3,
  /** Streuung (Kacheln) des Grüppchens hinter der Schlange. */
  crowdSpread: 0.9,
  walkTilesPerSec: 2.4,
  staffTilesPerSec: 3.2,
  /** Sichtbare Bestellzeit = 1 / Bestell-Kapazität, begrenzt auf diesen Bereich. */
  minServeSec: 0.4,
  maxServeSec: 3,
  /** Übergabe an der Ausgabe bzw. am Tisch. */
  handoverSec: 0.8,
  /** Wartet ein Gast länger auf eine Bedienung, bekommt er seine Bestellung „über die Theke“. */
  maxServiceWaitSec: 15,
  /** Verweildauer am Tisch (Sekunden, gleichverteilt). */
  dwellMinSec: 7,
  dwellMaxSec: 12,
  /** Anteil der Gäste, die sich setzen (wie im Rate-Modell), wenn ein Platz frei ist. */
  dineInShare: BALANCE.service.dineInShare,
  /** Höchstens so viele Figuren je Rolle, egal wie viele eingestellt sind. */
  maxCashiers: 3,
  maxWaiters: 3,
  maxCleaners: 2,
  wipeSec: 2.5,
  /** Schätzung für die Verweildauer, aus der „+N“ berechnet wird. */
  avgVisitSec: 14,
} as const;

/** Kamera-Grenzen. */
export const CAMERA = {
  minZoom: 0.35,
  maxZoom: 2.5,
  wheelStep: 0.0015,
  /** Ab dieser Zeigerbewegung (px) gilt ein Tap als Drag. */
  dragThresholdPx: 8,
} as const;

const AISLE_X = 6;
const ENTRANCE: GridPos = { x: AISLE_X, y: 11 };
const JUNCTION: GridPos = { x: AISLE_X, y: 4 };
const COUNTER_Y = 2;
const SEAT_OFFSET = 0.42;

function backWall(stationId: string, x: number): StationPlacement {
  return { stationId, tile: { x, y: 0 }, workSpot: { x, y: 1 }, facesX: false };
}

function onCounter(stationId: string, x: number): StationPlacement {
  return { stationId, tile: { x, y: COUNTER_Y }, workSpot: { x, y: 1 }, facesX: false };
}

const STATIONS: StationPlacement[] = [
  onCounter('register', 1),
  backWall('matchaStation', 3),
  backWall('coffeeMachine', 4),
  backWall('iceBox', 5),
  backWall('oven', 6),
  backWall('displayCase', 7),
  backWall('grinder', 8),
  backWall('ceremonySet', 9),
  onCounter('servingStation', 10),
];

const TABLE_COLUMNS = [1, 4, 7, 10];
const TABLE_ROWS = [5, 7, 9];
const TABLES: TablePlacement[] = TABLE_ROWS.flatMap((y, row) =>
  TABLE_COLUMNS.map((x, col) => ({
    tile: { x, y },
    seats: [
      { x: x - SEAT_OFFSET, y },
      { x: x + SEAT_OFFSET, y },
    ] as const,
    side: { x: x + 1, y },
    // Tische füllen sich reihenweise von hinten nach vorn, links nach rechts.
    minLevel: row * TABLE_COLUMNS.length + col + 1,
  })),
);

const DEFAULT_LAYOUT: CafeLayout = {
  gridSize: 12,
  // 12×12 → 12×14 → 14×14 (vorne links, vorne rechts, Ecke); der Raum bleibt, die Terrasse liegt davor.
  terrace: [
    { minLevel: 1, from: { x: 0, y: 12 }, to: { x: 11, y: 13 } },
    { minLevel: 2, from: { x: 12, y: 0 }, to: { x: 13, y: 11 } },
    { minLevel: 3, from: { x: 12, y: 12 }, to: { x: 13, y: 13 } },
  ],
  entrance: ENTRANCE,
  junction: JUNCTION,
  walkRows: { top: 4, bottom: 10 },
  counter: [0, 2, 3, 4, 5, 6, 7, 8, 9].map((x) => ({ x, y: COUNTER_Y })),
  stations: STATIONS,
  order: {
    access: { x: 1, y: 3 },
    queueDir: { x: 1, y: 0 },
    // Eingang → Gangknoten → Schlangenende (Zugang + 3 Plätze).
    path: [JUNCTION, { x: 1 + CROWD.maxQueue, y: 3 }],
    cashierSpots: [
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 2, y: 1 },
    ],
  },
  pickup: {
    spots: [
      { x: 10, y: 3 },
      { x: 9, y: 3 },
      { x: 9.5, y: 3.9 },
    ],
    waiterHomes: [
      { x: 10, y: 1 },
      { x: 11, y: 1 },
      { x: 11, y: 0 },
    ],
    exit: [
      { x: 11, y: 1 },
      { x: 11, y: COUNTER_Y },
      { x: 11, y: 4 },
    ],
  },
  tables: TABLES,
  ambience: [
    { id: 'decor', tile: { x: 0, y: 0 }, minLevel: 0 },
    { id: 'decor', tile: { x: 11, y: 10 }, minLevel: 1 },
    { id: 'music', tile: { x: 11, y: 6 }, minLevel: 1 },
    { id: 'wifi', tile: { x: 11, y: 8 }, minLevel: 1 },
    { id: 'terrace', tile: { x: 3, y: 12 }, minLevel: 1 },
    { id: 'terrace', tile: { x: 8, y: 13 }, minLevel: 1 },
    { id: 'terrace', tile: { x: 12, y: 4 }, minLevel: 2 },
    { id: 'terrace', tile: { x: 13, y: 9 }, minLevel: 2 },
    { id: 'terrace', tile: { x: 12, y: 12 }, minLevel: 3 },
  ],
  cleanerHome: { x: 0, y: 11 },
};

export const LAYOUTS: Readonly<Record<string, CafeLayout>> = {
  berlin: DEFAULT_LAYOUT,
  kyoto: DEFAULT_LAYOUT,
  tokyo: DEFAULT_LAYOUT,
  seoul: DEFAULT_LAYOUT,
  newyork: DEFAULT_LAYOUT,
  bali: DEFAULT_LAYOUT,
};

/** Belegte Fläche (Raum + sichtbare Terrasse) als Kachel-Ausdehnung in x und y. */
export function layoutExtent(layout: CafeLayout, terraceLevel: number): { w: number; h: number } {
  let w = layout.gridSize;
  let h = layout.gridSize;
  for (const a of layout.terrace) {
    if (terraceLevel < a.minLevel) continue;
    w = Math.max(w, a.to.x + 1);
    h = Math.max(h, a.to.y + 1);
  }
  return { w, h };
}

export function getLayout(locationId: string): CafeLayout {
  const l = LAYOUTS[locationId];
  if (!l) throw new Error(`No layout for location: ${locationId}`);
  return l;
}

/** Sichtbare Tische bei dieser `seats`-Stufe (höchstens so viele, wie der Grundriss Plätze hat). */
export function visibleTables(layout: CafeLayout, seatsLevel: number): TablePlacement[] {
  return layout.tables.filter((t) => seatsLevel >= t.minLevel);
}

/** Weg vom Zugang der Bestelltheke zu einem Tisch: über die obere Laufzeile und die Seitenkachel. */
export function pathToTable(layout: CafeLayout, from: GridPos, table: TablePlacement): GridPos[] {
  const row = layout.walkRows.top;
  return [{ x: from.x, y: row }, { x: table.side.x, y: row }, { ...table.side }];
}

/** Weg vom Tisch zum Eingang: hintere Reihen über die untere, vordere über die obere Laufzeile. */
export function pathFromTable(layout: CafeLayout, table: TablePlacement): GridPos[] {
  const row =
    table.tile.y >= layout.walkRows.bottom - 3 ? layout.walkRows.bottom : layout.walkRows.top;
  return [
    { ...table.side },
    { x: table.side.x, y: row },
    { x: layout.entrance.x, y: row },
    { ...layout.entrance },
  ];
}

/** Weg vom Zugang der Bestelltheke zu einem Warteplatz der Ausgabe. */
export function pathToPickup(layout: CafeLayout, from: GridPos, spot: GridPos): GridPos[] {
  const row = layout.walkRows.top;
  return [{ x: from.x, y: row }, { x: spot.x, y: row }, { ...spot }];
}

/** Weg von der Ausgabe zum Eingang. */
export function pathFromPickup(layout: CafeLayout, spot: GridPos): GridPos[] {
  const row = layout.walkRows.top;
  return [{ x: spot.x, y: row }, { ...layout.junction }, { ...layout.entrance }];
}

/** Weg einer Bedienung von ihrem Platz hinter der Ausgabe zur Seitenkachel eines Tischs. */
export function waiterPathToTable(layout: CafeLayout, table: TablePlacement): GridPos[] {
  const row = layout.walkRows.top;
  return [...layout.pickup.exit, { x: table.side.x, y: row }, { ...table.side }];
}
