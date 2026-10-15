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
  /**
   * Draußen auf der Terrasse (Gehweg): sichtbar ab dieser Terrassen-Stufe, Wege führen durch die Tür und über
   * die Laufzeile `outRow` vor der Fassade. Drinnen (auch im Wintergarten): nicht gesetzt.
   */
  outside?: { minTerrace: number; outRow: number };
}

/** Wintergarten (verglaster Anbau vorn links): gehört zum Raum, macht den Grundriss zum L. */
export interface AnnexArea {
  from: GridPos;
  to: GridPos;
}

/**
 * Deko, die mit dem Ambiente-Level `decor` dazukommt (Bilder, Neon, Pflanzen, Teppich …). `wall` = an der
 * Rückwand entlang x (`u`) bzw. y (`v`) auf Kachel `at`; sonst steht das Stück auf der Kachel `tile`.
 */
export interface DecorItem {
  frame: string;
  minLevel: number;
  tile: GridPos;
  wall?: 'u' | 'v';
  /** Liegt flach auf dem Boden (Teppich): unter allen Möbeln. */
  floor?: boolean;
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
  /** Hier stellen Baristas das Fertige auf die Ausgabe (Personal-Gang, neben den Bedienungen). */
  baristaDrop: GridPos;
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
  /** Wintergarten vor der Fassade (Kachel-Rechteck inkl. beider Ecken). */
  annex: AnnexArea;
  entrance: GridPos;
  /**
   * Gehweg vor dem Eingang (Stadtviertel, `data/city.ts`): Gäste kommen den Gehweg entlang, biegen hier zur Tür
   * ab und gehen nachher zur Seite weg. `spread` = wie weit links/rechts sie auftauchen (Kacheln).
   */
  street: { curb: GridPos; spreadMin: number; spreadMax: number };
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
  decor: DecorItem[];
  /** Startplatz der Putzkräfte. */
  cleanerHome: GridPos;
  /** Hier wischen Putzkräfte den Boden, solange kein Tisch dreckig ist (abseits von Tischen und Deko). */
  mopSpots: GridPos[];
}

/** Darstellungs-Parameter der kosmetischen Figuren (nur Optik, keine Spielbalance). */
export const CROWD = {
  maxAgents: 40,
  /** Sichtbare Schlangenplätze; weitere Kunden warten als Grüppchen dahinter. */
  maxQueue: 3,
  /** Streuung (Kacheln) des Grüppchens hinter der Schlange. */
  crowdSpread: 0.9,
  /**
   * Höchstens so viele Figuren warten an der Kasse (Schlange + Grüppchen); wer darüber hinaus käme, zählt nur auf
   * der Warteschlangen-Tafel (bis `maxQueueOverflow`) und kommt nach, sobald Platz ist. Hält die Theke aufgeräumt,
   * wenn die Nachfrage die sichtbare Bestellzeit übersteigt.
   */
  maxQueueFigures: 6,
  maxQueueOverflow: 14,
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
  /** Je gekauftem Rückwand-Gerät höchstens ein Barista (sieben Geräte). */
  maxBaristas: 7,
  wipeSec: 2.5,
  /** Boden wischen, wenn kein Tisch dreckig ist: so lange je Stelle, dazwischen Pause am Startplatz. */
  mopMinSec: 3,
  mopMaxSec: 6,
  restMinSec: 2,
  restMaxSec: 6,
  /**
   * Baristas: sichtbare Zubereitungszeit je Becher (aus der Zubereitungs-Kapazität, begrenzt), danach bringen sie
   * ihn zur Ausgabe und stellen ihn ab.
   */
  minPrepSec: 3.5,
  maxPrepSec: 7,
  dropSec: 0.45,
  /** Höchstens so viele Teller/Becher stehen auf der Ausgabe; Bedienungen nehmen je Auftrag einen mit. */
  passItemsMax: 4,
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
const INSIDE_TABLES: TablePlacement[] = TABLE_ROWS.flatMap((y, row) =>
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

function table(x: number, y: number, side: GridPos, minLevel: number): TablePlacement {
  return {
    tile: { x, y },
    seats: [
      { x: x - SEAT_OFFSET, y },
      { x: x + SEAT_OFFSET, y },
    ] as const,
    side,
    minLevel,
  };
}

/** Wintergarten: zwei Tische ab dem 13. und 14. Tisch, bedient von der Gasse x = 2,2 zwischen den Tischreihen. */
const WG_Y = 12.55;
const WG_SIDE: GridPos = { x: 2.2, y: WG_Y };
const ANNEX_TABLES: TablePlacement[] = [table(1, WG_Y, WG_SIDE, 13), table(3.4, WG_Y, WG_SIDE, 14)];

/**
 * Terrassen-Tische mit Schirm: vorn (Stufe 1), rechts am Gehweg (Stufe 2), Ecke (Stufe 3). Bedient wird von
 * der Laufzeile direkt vor der Fassade.
 */
const OUT_ROW_FRONT = 12.45;
const OUT_COL_RIGHT = 12.45;
function outdoor(x: number, y: number, minTerrace: number, front: boolean): TablePlacement {
  return {
    ...table(x, y, front ? { x, y: OUT_ROW_FRONT } : { x: OUT_COL_RIGHT, y }, 1),
    outside: { minTerrace, outRow: OUT_ROW_FRONT },
  };
}
const TERRACE_TABLES: TablePlacement[] = [
  outdoor(8.2, 13.15, 1, true),
  outdoor(10.6, 13.15, 1, true),
  outdoor(13.15, 3, 2, false),
  outdoor(13.15, 6, 2, false),
  outdoor(13.15, 9, 2, false),
  outdoor(13.15, 13.15, 3, true),
];

const TABLES: TablePlacement[] = [...INSIDE_TABLES, ...ANNEX_TABLES, ...TERRACE_TABLES];

/** Deko nach Ambiente-Level `decor` (Bilder an der Wand, Neon, Pflanzen, Teppich, Leuchten …). */
const DECOR: DecorItem[] = [
  // Barhocker vor der Theke zwischen Schlange und Abholplätzen (dort läuft niemand)
  { frame: 'deco-stools', minLevel: 0, tile: { x: 7, y: 2.85 } },
  { frame: 'deco-plants', minLevel: 1, tile: { x: 5, y: 11 } },
  { frame: 'deco-rug', minLevel: 2, tile: { x: 2.2, y: 12.6 }, floor: true },
  { frame: 'deco-rug-blue', minLevel: 6, tile: { x: 2.5, y: 7 }, floor: true },
  { frame: 'deco-monstera', minLevel: 9, tile: { x: 7, y: 11 } },
  ...[1, 4, 7, 10].map((x) => ({ frame: 'deco-pendant', minLevel: 11, tile: { x, y: 5 } })),
  { frame: 'deco-rug-blue', minLevel: 13, tile: { x: 8.5, y: 7 }, floor: true },
  ...[1, 4, 7, 10].map((x) => ({ frame: 'deco-pendant', minLevel: 15, tile: { x, y: 7 } })),
  { frame: 'deco-rug-blue', minLevel: 17, tile: { x: 2.5, y: 9 }, floor: true },
  ...[1, 4, 7, 10].map((x) => ({ frame: 'deco-pendant', minLevel: 19, tile: { x, y: 9 } })),
  { frame: 'deco-rug-blue', minLevel: 21, tile: { x: 8.5, y: 5 }, floor: true },
  ...[1, 3.4].map((x) => ({ frame: 'deco-pendant', minLevel: 23, tile: { x, y: 12.55 } })),
  { frame: 'wall-art-leaf', minLevel: 3, tile: { x: 0, y: 5 }, wall: 'v' },
  { frame: 'deco-monstera', minLevel: 4, tile: { x: 0, y: 4 } },
  { frame: 'wall-neon', minLevel: 5, tile: { x: 10, y: 0 }, wall: 'u' },
  { frame: 'wall-art-tower', minLevel: 6, tile: { x: 0, y: 7 }, wall: 'v' },
  { frame: 'deco-floorlamp', minLevel: 7, tile: { x: 0, y: 6 } },
  { frame: 'wall-shelf', minLevel: 8, tile: { x: 0, y: 2 }, wall: 'v' },
  { frame: 'deco-plants', minLevel: 10, tile: { x: 4.4, y: 13.4 } },
  { frame: 'wall-art-photo', minLevel: 12, tile: { x: 0, y: 9 }, wall: 'v' },
  { frame: 'wall-sconce', minLevel: 14, tile: { x: 0, y: 6 }, wall: 'v' },
  { frame: 'wall-plants', minLevel: 16, tile: { x: 0, y: 10 }, wall: 'v' },
  { frame: 'wall-clock', minLevel: 18, tile: { x: 11, y: 0 }, wall: 'u' },
  { frame: 'wall-records', minLevel: 20, tile: { x: 1, y: 0 }, wall: 'u' },
  { frame: 'wall-art-abstract', minLevel: 22, tile: { x: 0, y: 4 }, wall: 'v' },
  { frame: 'wall-sconce', minLevel: 24, tile: { x: 0, y: 8 }, wall: 'v' },
  { frame: 'deco-plants', minLevel: 26, tile: { x: 9, y: 11 } },
  // Endausbau: Olivenbäume in Messingkübeln, Kronleuchter über dem Mittelgang
  { frame: 'deco-olive', minLevel: 27, tile: { x: 11, y: 11 } },
  { frame: 'deco-olive', minLevel: 27, tile: { x: 0, y: 8 } },
  { frame: 'wall-art-gold', minLevel: 28, tile: { x: 0, y: 11 }, wall: 'v' },
  { frame: 'deco-chandelier', minLevel: 29, tile: { x: 6, y: 7 } },
  { frame: 'deco-sculpture', minLevel: 30, tile: { x: 4.4, y: 12.3 } },
];

const DEFAULT_LAYOUT: CafeLayout = {
  gridSize: 12,
  // 12×12 → 12×14 → 14×14 (vorne links, vorne rechts, Ecke); der Raum bleibt, die Terrasse liegt davor.
  terrace: [
    { minLevel: 1, from: { x: 5, y: 12 }, to: { x: 11, y: 13 } },
    { minLevel: 2, from: { x: 12, y: 0 }, to: { x: 13, y: 11 } },
    { minLevel: 3, from: { x: 12, y: 12 }, to: { x: 13, y: 13 } },
  ],
  annex: { from: { x: 0, y: 12 }, to: { x: 4, y: 13 } },
  entrance: ENTRANCE,
  street: { curb: { x: AISLE_X, y: 13.6 }, spreadMin: 2, spreadMax: 6 },
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
    baristaDrop: { x: 9.35, y: 1.1 },
  },
  tables: TABLES,
  ambience: [
    { id: 'decor', tile: { x: 0, y: 0 }, minLevel: 0 },
    { id: 'decor', tile: { x: 11, y: 10 }, minLevel: 1 },
    { id: 'music', tile: { x: 11, y: 6 }, minLevel: 1 },
    { id: 'wifi', tile: { x: 11, y: 8 }, minLevel: 1 },
  ],
  decor: DECOR,
  cleanerHome: { x: 0, y: 11 },
  // Untere Laufzeile und vorderste Reihe (nicht vor Eingang, Pflanzen, Musik/WLAN)
  mopSpots: [
    { x: 1.6, y: 11 },
    { x: 3.2, y: 11 },
    { x: 2.6, y: 10 },
    { x: 4.6, y: 10.2 },
    { x: 8.3, y: 10.3 },
    { x: 10.2, y: 11 },
    { x: 9.6, y: 10 },
  ],
};

export const LAYOUTS: Readonly<Record<string, CafeLayout>> = {
  berlin: DEFAULT_LAYOUT,
  kyoto: DEFAULT_LAYOUT,
  tokyo: DEFAULT_LAYOUT,
  seoul: DEFAULT_LAYOUT,
  newyork: DEFAULT_LAYOUT,
  bali: DEFAULT_LAYOUT,
};

/** Belegte Fläche (Raum, Wintergarten + sichtbare Terrasse) als Kachel-Ausdehnung in x und y. */
export function layoutExtent(layout: CafeLayout, terraceLevel: number): { w: number; h: number } {
  let w = Math.max(layout.gridSize, layout.annex.to.x + 1);
  let h = Math.max(layout.gridSize, layout.annex.to.y + 1);
  for (const a of layout.terrace) {
    if (terraceLevel < a.minLevel) continue;
    w = Math.max(w, a.to.x + 1);
    h = Math.max(h, a.to.y + 1);
  }
  return { w, h };
}

/** Gehört die Kachel zum Gastraum (Raster oder Wintergarten)? */
export function inRoom(layout: CafeLayout, x: number, y: number): boolean {
  const n = layout.gridSize;
  if (x >= 0 && y >= 0 && x < n && y < n) return true;
  const a = layout.annex;
  return x >= a.from.x && x <= a.to.x && y >= a.from.y && y <= a.to.y;
}

export function getLayout(locationId: string): CafeLayout {
  const l = LAYOUTS[locationId];
  if (!l) throw new Error(`No layout for location: ${locationId}`);
  return l;
}

/** Sichtbare Tische bei dieser `seats`-Stufe und Terrassen-Stufe (Terrassen-Tische hängen nur an der Terrasse). */
export function visibleTables(
  layout: CafeLayout,
  seatsLevel: number,
  terraceLevel = 0,
): TablePlacement[] {
  return layout.tables.filter((t) =>
    t.outside ? terraceLevel >= t.outside.minTerrace : seatsLevel >= t.minLevel,
  );
}

/** Weg vor die Tür bis auf die Laufzeile vor der Fassade (für Terrassen-Tische). */
function outPath(layout: CafeLayout, table: TablePlacement): GridPos[] {
  const out = table.outside;
  if (!out) return [];
  const e = layout.entrance;
  return [{ ...e }, { x: e.x, y: out.outRow }, { x: table.side.x, y: out.outRow }];
}

/** Weg vom Zugang der Bestelltheke zu einem Tisch: über die obere Laufzeile und die Seitenkachel. */
export function pathToTable(layout: CafeLayout, from: GridPos, table: TablePlacement): GridPos[] {
  const row = layout.walkRows.top;
  if (table.outside)
    return [
      { x: from.x, y: row },
      { x: layout.junction.x, y: row },
      ...outPath(layout, table),
      { ...table.side },
    ];
  return [{ x: from.x, y: row }, { x: table.side.x, y: row }, { ...table.side }];
}

/**
 * Weg vom Tisch zum Eingang: hintere Reihen über die untere, vordere über die obere Laufzeile. Terrassen-Gäste
 * gehen nur bis zur Laufzeile vor der Fassade (den Rest über den Gehweg ergänzt die Figuren-Simulation).
 */
export function pathFromTable(layout: CafeLayout, table: TablePlacement): GridPos[] {
  if (table.outside) {
    const row = table.outside.outRow;
    return [{ ...table.side }, { x: table.side.x, y: row }, { x: layout.street.curb.x, y: row }];
  }
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

/** Weg einer Bedienung von ihrem Platz hinter der Ausgabe zur Seitenkachel eines Tischs (auch nach draußen). */
export function waiterPathToTable(layout: CafeLayout, table: TablePlacement): GridPos[] {
  const row = layout.walkRows.top;
  if (table.outside)
    return [
      ...layout.pickup.exit,
      { x: layout.junction.x, y: row },
      ...outPath(layout, table),
      { ...table.side },
    ];
  return [...layout.pickup.exit, { x: table.side.x, y: row }, { ...table.side }];
}

/** Weg einer Putzkraft von `from` zur Seitenkachel eines Tischs: über die untere Laufzeile, raus durch die Tür. */
export function cleanerPathToTable(
  layout: CafeLayout,
  from: GridPos,
  table: TablePlacement,
): GridPos[] {
  const row = layout.walkRows.bottom;
  if (table.outside)
    return [
      { x: from.x, y: row },
      { x: layout.entrance.x, y: row },
      ...outPath(layout, table),
      { ...table.side },
    ];
  return [{ x: from.x, y: row }, { x: table.side.x, y: row }, { ...table.side }];
}
