/**
 * Café-Grundriss (Phase 2, PLAN S11; kompakter seit `art/cafe-grundriss`): Raum 11×10 Kacheln (x 1–11, y 2–11),
 * die Ecke an der Kreuzung (Fassaden bei x = 12 und y = 12) liegt an derselben Weltposition wie vorher.
 * Hinten an der Rückwand (y = 2) die Geräte, links hinten das Lager, davor der Personal-Gang (y = 3) und eine
 * Reihe für Kasse, Bedienungen und Lagerware (y = 4). Die Gästetheke ist ein L: langer Schenkel quer davor
 * (y = 5) mit Ausgabe und Durchgang für die Bedienungen, Eckmodul bei (9, 5), kurzer Schenkel mit der Kasse
 * quer zur Tür (x = 9). Die Tür liegt in der rechten Fassade (11, 6): Gäste stehen nach zwei, drei Kacheln in der
 * Schlange entlang des kurzen Schenkels, bestellen an der Ecke, holen um die Ecke an der Ausgabe ab und gehen
 * hinter der Schlange vorbei wieder hinaus. Gastraum vorn mit acht Tischen, Wintergarten vorn links.
 * Kunden-Wege sind feste Waypoints, kein A*. Alle Standorte nutzen denselben Grundriss (eigene Böden/Wände kommen
 * aus dem Themen-Atlas).
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

/** Modul der Gästetheke ohne Gerät (Kasse und Ausgabe stehen in `stations` auf eigenen Modulen). */
export interface CounterPlacement extends GridPos {
  /** Front zeigt nach +x (quer gestellt, Sprite-Variante „b“). */
  facesX?: boolean;
  /** Eckmodul: Fronten nach +x und +y, verbindet den Schenkel entlang x mit dem entlang y. */
  corner?: boolean;
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
   * Draußen auf der Terrasse (Gehweg): sichtbar ab dieser Terrassen-Stufe; Wege führen durch die Tür und über die
   * Laufspur vor der Fassade (`outside`) – vorn (`front`) um die Ecke herum, rechts (`right`) direkt.
   * Drinnen (auch im Wintergarten): nicht gesetzt.
   */
  outside?: { minTerrace: number; side: 'front' | 'right' };
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
  /** Sichtbare Schlangenplätze, `queue[0]` = `access`; dahinter wartet ein Grüppchen um `crowd`. */
  queue: GridPos[];
  crowd: GridPos;
  /**
   * Gäste laufen neben der Schlange heran: Zielpunkt = Platz + `lane` (Versatz), erst dann auf den Platz. So
   * läuft niemand durch Wartende.
   */
  lane: GridPos;
  /** Weg von der Tür bis vor die Schlange (ohne Tür, ohne Schlangenplätze). */
  path: GridPos[];
  /** Weg nach dem Bestellen um die Ecke (vor Abholung bzw. Tischweg). */
  exit: GridPos[];
  /** Plätze der Verkäufer hinter der Kasse (Reihenfolge = Sichtbarkeit). */
  cashierSpots: GridPos[];
}

export interface PickupArea {
  /** Warteplätze der Abholer vor der Ausgabe. */
  spots: GridPos[];
  /** Plätze der Bedienungen hinter der Ausgabe (Reihenfolge = Sichtbarkeit). */
  waiterHomes: GridPos[];
  /** Weg vom Personal-Bereich in den Gastraum (Durchgang in der Theke). */
  exit: GridPos[];
  /** Hier stellen Baristas das Fertige auf die Ausgabe (Personal-Bereich, neben den Bedienungen). */
  baristaDrop: GridPos;
  /** Zeile des Personal-Gangs: wer nicht an ihm arbeitet (Gerät an der Seitenwand), geht erst auf den Gang. */
  aisleY: number;
}

/** Teil des Lagers: Eckregal, Wandregal oder Ware auf der Palette. */
export interface StoragePlacement {
  piece: 'corner' | 'rack' | 'stock';
  tile: GridPos;
  /** Front zeigt nach +x (Regal an der linken Rückwand). */
  facesX: boolean;
  /** Sichtbar ab dieser Lager-Stufe (`storageLookTier`). */
  minTier: number;
}

export interface StorageArea {
  pieces: StoragePlacement[];
  /** Hier holt ein Barista Nachschub (vor den Regalen, am Ende des Personal-Gangs). */
  fetchSpot: GridPos;
}

/**
 * Barhocker vor dem linken Thekenstück: Abholer setzen sich mit ihrem Getränk dorthin und trinken mit Blick zur
 * Theke. `row` = Laufzeile davor (Hin- und Rückweg, eine halbe Kachel vor den Abholplätzen).
 */
export interface BarArea {
  stools: GridPos[];
  row: number;
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
  /** Vordere Fassaden bei x = gridSize und y = gridSize (die Ecke an der Kreuzung); Raum = [origin, gridSize)². */
  gridSize: number;
  /** Hintere Ecke des Raums (Rückwände bei x = origin.x und y = origin.y). */
  origin: GridPos;
  terrace: TerraceArea[];
  /** Wintergarten vor der Fassade (Kachel-Rechteck inkl. beider Ecken). */
  annex: AnnexArea;
  entrance: GridPos;
  /** Fassade der Tür: `u` = vorn (y = gridSize), `v` = rechts (x = gridSize). */
  entranceSide: 'u' | 'v';
  /**
   * Gehweg vor der Tür (Stadtviertel, `data/city.ts`): Gäste kommen den Gehweg entlang (`axis` = Richtung des
   * Gehwegs), biegen bei `curb` zur Tür ab und gehen nachher zur Seite weg. `spread` = wie weit sie seitlich
   * auftauchen (Kacheln).
   */
  street: { curb: GridPos; axis: 'u' | 'v'; spreadMin: number; spreadMax: number };
  /**
   * Laufspuren draußen: Spalte `col` vor der rechten Fassade, Zeile `row` vor der vorderen; Terrassen-Gäste vorn
   * gehen auf `frontWalk` (Gehweg vorn) weg.
   */
  outside: { col: number; row: number; frontWalk: number };
  /** Laufzeilen im Gastraum: `top` vor der Theke (Bestellen → Tisch, Bedienungen), `bottom` vorn am Fenster. */
  walkRows: { top: number; bottom: number };
  /** Thekenmodule ohne Gerät, entlang der Theke (Reihenfolge = `COUNTER_PROPS`). */
  counter: CounterPlacement[];
  stations: StationPlacement[];
  order: OrderArea;
  pickup: PickupArea;
  storage: StorageArea;
  bar: BarArea;
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
  /** Anteil der Abholer, die sich mit ihrem Getränk auf einen freien Barhocker setzen (nur Optik). */
  barShare: 0.7,
  /**
   * Kasse (GAME_DESIGN § 7.2): Neue Gäste kommen so früh, dass sie diese Sekunden vor ihrer Zahlung an der Kasse
   * stehen; wer länger als `maxPayWaitSec` auf seine Zahlung wartet (Raten eingebrochen), geht ohne weiter.
   */
  payLeadSec: 1.2,
  maxPayWaitSec: 25,
  /**
   * So viele Zahlungen je Sekunde zeigen Figuren an der Kasse; darüber zahlen Gäste ohne Figur (Tafel, „+N“). Mehr
   * hält der Figuren-Pool (`maxAgents`) mit Sitzgästen und Wegen nicht durch.
   */
  maxVisiblePayPerSec: 1.2,
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
  /**
   * Nach dem Abstellen holt ein Barista mit dieser Wahrscheinlichkeit Nachschub aus dem Lager (immer nur einer
   * zugleich), greift so lange ins Regal und trägt die Ware zurück ans Gerät. Nur Optik.
   */
  fetchChance: 0.22,
  fetchSec: 1.1,
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

/** Vordere Fassaden (Ecke an der Kreuzung, wie im 12×12-Grundriss) und hintere Raumecke. */
const FRONT = 12;
const ORIGIN: GridPos = { x: 1, y: 2 };
/** Tür in der rechten Fassade, gleich neben dem Kassen-Schenkel. */
const ENTRANCE: GridPos = { x: 11, y: 6 };
/** Reihen des Personal-Bereichs: Geräte, Gang, Kasse/Bedienungen/Lager; davor der lange Thekenschenkel. */
const DEVICE_Y = 2;
const AISLE_Y = 3;
const STAFF_Y = 4;
const COUNTER_Y = 5;
/** Kurzer Thekenschenkel (quer, Front nach +x) mit der Kasse vorn an der Ecke. */
const LEG_X = 9;
const SEAT_OFFSET = 0.42;
/** Barhocker vor dem langen Thekenschenkel links vom Durchgang (dort läuft niemand). */
const BAR_STOOLS: GridPos[] = [1.05, 2, 2.95].map((x) => ({ x, y: COUNTER_Y + 0.85 }));
/** Laufzeile vor der Theke bzw. vorn am Fenster. */
const TOP_ROW = 7;
const BOTTOM_ROW = 11;

function backWall(stationId: string, x: number): StationPlacement {
  return {
    stationId,
    tile: { x, y: DEVICE_Y },
    workSpot: { x, y: AISLE_Y },
    facesX: false,
  };
}

const STATIONS: StationPlacement[] = [
  { stationId: 'register', tile: { x: LEG_X, y: STAFF_Y }, workSpot: { x: 8, y: 4 }, facesX: true },
  backWall('matchaStation', 2),
  backWall('coffeeMachine', 3),
  // Kühlschrank an der linken Rückwand, quer gestellt (Front nach +x), neben dem Lager.
  { stationId: 'iceBox', tile: { x: 1, y: STAFF_Y }, workSpot: { x: 2, y: 4 }, facesX: true },
  backWall('oven', 4),
  backWall('displayCase', 5),
  backWall('grinder', 6),
  backWall('ceremonySet', 7),
  {
    stationId: 'servingStation',
    tile: { x: 7, y: COUNTER_Y },
    workSpot: { x: 7, y: STAFF_Y },
    facesX: false,
  },
];

/**
 * Theke als L, in Reihenfolge entlang der Theke (Deko-Folge `COUNTER_PROPS`): langer Schenkel von links (vor dem
 * Lager) bis zur Ecke, Durchgang für die Bedienungen bei x = 4, Ausgabe bei x = 7 (in `STATIONS`), dann der kurze
 * Schenkel nach hinten, die Kasse vorn an der Ecke (in `STATIONS`).
 */
const COUNTER: CounterPlacement[] = [
  ...[1, 2, 3, 5, 6, 8].map((x) => ({ x, y: COUNTER_Y })),
  { x: LEG_X, y: COUNTER_Y, corner: true },
  { x: LEG_X, y: 3, facesX: true },
  { x: LEG_X, y: 2, facesX: true },
];

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

/**
 * Gastraum: zwei Reihen à vier Tische (y = 8, 10), bedient von der Seitenkachel rechts daneben (Spalten 2, 5, 8,
 * 11 sind Gänge). Sie füllen sich vom Tresen aus: zuerst die Mitte der vorderen Reihe an der Ausgabe.
 */
const TABLE_ROWS = [8, 10];
const TABLE_COLUMNS = [1, 4, 7, 10];
const FILL_ORDER = [7, 4, 10, 1];
const INSIDE_TABLES: TablePlacement[] = TABLE_ROWS.flatMap((y, row) =>
  TABLE_COLUMNS.map((x) =>
    table(x, y, { x: x + 1, y }, row * FILL_ORDER.length + FILL_ORDER.indexOf(x) + 1),
  ),
);

/** Wintergarten: zwei Tische ab dem 9. und 10. Tisch, bedient von der Gasse x = 2,3 zwischen ihnen. */
const WG_Y = 12.55;
const WG_SIDE: GridPos = { x: 2.3, y: WG_Y };
const ANNEX_TABLES: TablePlacement[] = [
  table(1.3, WG_Y, WG_SIDE, 9),
  table(3.3, WG_Y, WG_SIDE, 10),
];

/**
 * Terrassen-Tische mit Schirm: vorn (Stufe 1), rechts am Gehweg (Stufe 2, nicht vor der Tür), Ecke (Stufe 3).
 * Bedient wird von der Laufspur direkt vor der Fassade.
 */
const OUT_ROW = 12.45;
const OUT_COL = 12.45;
function outdoor(
  x: number,
  y: number,
  minTerrace: number,
  side: 'front' | 'right',
): TablePlacement {
  return {
    ...table(x, y, side === 'front' ? { x, y: OUT_ROW } : { x: OUT_COL, y }, 1),
    outside: { minTerrace, side },
  };
}
const TERRACE_TABLES: TablePlacement[] = [
  outdoor(8.2, 13.15, 1, 'front'),
  outdoor(10.6, 13.15, 1, 'front'),
  outdoor(13.15, 3.4, 2, 'right'),
  outdoor(13.15, 8.7, 2, 'right'),
  outdoor(13.15, 10.8, 2, 'right'),
  outdoor(13.15, 13.15, 3, 'front'),
];

const TABLES: TablePlacement[] = [...INSIDE_TABLES, ...ANNEX_TABLES, ...TERRACE_TABLES];

/**
 * Deko nach Ambiente-Level `decor` (Bilder an der Wand, Neon, Pflanzen, Teppich, Leuchten …). Boden-Deko steht
 * nur auf freien Plätzen (Wandseite, Lücken zwischen den Tischen, vorn am Fenster), nie auf Gängen.
 */
const DECOR: DecorItem[] = [
  // Barhocker vor dem linken Thekenstück: je Hocker ein Sprite, damit Sitzende richtig davor sortiert werden
  ...BAR_STOOLS.map((tile) => ({ frame: 'deco-stool', minLevel: 0, tile })),
  { frame: 'deco-plants', minLevel: 1, tile: { x: 9, y: 9 } },
  { frame: 'deco-rug', minLevel: 2, tile: { x: 2.3, y: 12.6 }, floor: true },
  { frame: 'deco-rug-blue', minLevel: 6, tile: { x: 2.5, y: 8 }, floor: true },
  { frame: 'deco-monstera', minLevel: 9, tile: { x: 9.6, y: 11 } },
  ...TABLE_COLUMNS.map((x) => ({ frame: 'deco-pendant', minLevel: 11, tile: { x, y: 8 } })),
  { frame: 'deco-rug-blue', minLevel: 13, tile: { x: 8.5, y: 8 }, floor: true },
  ...TABLE_COLUMNS.map((x) => ({ frame: 'deco-pendant', minLevel: 15, tile: { x, y: 10 } })),
  { frame: 'deco-rug-blue', minLevel: 17, tile: { x: 2.5, y: 10 }, floor: true },
  ...[1.3, 3.3].map((x) => ({ frame: 'deco-pendant', minLevel: 19, tile: { x, y: WG_Y } })),
  { frame: 'deco-rug-blue', minLevel: 21, tile: { x: 8.5, y: 10 }, floor: true },
  // Über der Theke vor den Barhockern (nicht über den Hockern: dort sitzen Gäste)
  ...[1, 3].map((x) => ({
    frame: 'deco-pendant-bar',
    minLevel: 23,
    tile: { x, y: COUNTER_Y + 0.15 },
  })),
  { frame: 'wall-art-leaf', minLevel: 3, tile: { x: 1, y: 6 }, wall: 'v' },
  { frame: 'deco-monstera', minLevel: 4, tile: { x: 1, y: 11 } },
  { frame: 'wall-neon', minLevel: 5, tile: { x: 11, y: 2 }, wall: 'u' },
  { frame: 'wall-art-tower', minLevel: 6, tile: { x: 1, y: 8 }, wall: 'v' },
  { frame: 'deco-floorlamp', minLevel: 7, tile: { x: 3, y: 9 } },
  { frame: 'wall-shelf', minLevel: 8, tile: { x: 1, y: 5 }, wall: 'v' },
  { frame: 'deco-plants', minLevel: 10, tile: { x: 4.3, y: 13.45 } },
  { frame: 'wall-art-photo', minLevel: 12, tile: { x: 1, y: 9 }, wall: 'v' },
  { frame: 'wall-sconce', minLevel: 14, tile: { x: 1, y: 11 }, wall: 'v' },
  // Hängepflanzen an der Glaswand des Wintergartens
  { frame: 'wall-plants', minLevel: 16, tile: { x: 1, y: 12 }, wall: 'v' },
  { frame: 'wall-clock', minLevel: 18, tile: { x: 10, y: 2 }, wall: 'u' },
  { frame: 'wall-records', minLevel: 20, tile: { x: 9, y: 2 }, wall: 'u' },
  { frame: 'wall-art-abstract', minLevel: 22, tile: { x: 1, y: 7 }, wall: 'v' },
  { frame: 'wall-sconce', minLevel: 24, tile: { x: 1, y: 10 }, wall: 'v' },
  { frame: 'deco-plants', minLevel: 26, tile: { x: 6.3, y: 11 } },
  // Endausbau: Olivenbäume in Messingkübeln, Goldrahmen hinter der Kasse, Kronleuchter über der Mitte
  { frame: 'deco-olive', minLevel: 27, tile: { x: 3, y: 11 } },
  { frame: 'deco-olive', minLevel: 27, tile: { x: 7.4, y: 11 } },
  { frame: 'wall-art-gold', minLevel: 28, tile: { x: 8, y: 2 }, wall: 'u' },
  { frame: 'deco-chandelier', minLevel: 29, tile: { x: 6, y: 9 } },
  { frame: 'deco-sculpture', minLevel: 30, tile: { x: 4.3, y: 12.3 } },
];

const DEFAULT_LAYOUT: CafeLayout = {
  gridSize: FRONT,
  origin: ORIGIN,
  // Raum (+ Wintergarten) 12×14 → 12×14 → 14×14 (vorne, rechts, Ecke); der Raum bleibt, die Terrasse liegt davor.
  terrace: [
    { minLevel: 1, from: { x: 5, y: 12 }, to: { x: 11, y: 13 } },
    { minLevel: 2, from: { x: 12, y: ORIGIN.y }, to: { x: 13, y: 11 } },
    { minLevel: 3, from: { x: 12, y: 12 }, to: { x: 13, y: 13 } },
  ],
  annex: { from: { x: ORIGIN.x, y: 12 }, to: { x: 4, y: 13 } },
  entrance: ENTRANCE,
  entranceSide: 'v',
  // Gehweg rechts (Laufspur der Passanten), Gäste tauchen oberhalb und unterhalb der Tür auf.
  street: { curb: { x: 13.8, y: ENTRANCE.y }, axis: 'v', spreadMin: 2, spreadMax: 5 },
  outside: { col: OUT_COL, row: OUT_ROW, frontWalk: 13.6 },
  walkRows: { top: TOP_ROW, bottom: BOTTOM_ROW },
  counter: COUNTER,
  stations: STATIONS,
  order: {
    access: { x: 10, y: STAFF_Y },
    // Schlange entlang des kurzen Schenkels nach hinten, das Grüppchen in der Ecke dahinter.
    queue: [
      { x: 10, y: 4 },
      { x: 10, y: 3 },
      { x: 10, y: 2 },
    ],
    crowd: { x: 11, y: 2.55 },
    lane: { x: 1, y: 0 },
    path: [{ x: 11, y: 5 }],
    // Um die Ecke: erst vor die Ecke, dann auf die Zeile vor der Ausgabe.
    exit: [
      { x: 10, y: 5 },
      { x: 9.5, y: 6 },
    ],
    cashierSpots: [
      { x: 8, y: 4 },
      { x: 8, y: 3 },
      { x: 8, y: 2 },
    ],
  },
  pickup: {
    spots: [
      { x: 7, y: 6 },
      { x: 8, y: 6 },
      { x: 6.1, y: 6 },
    ],
    waiterHomes: [
      { x: 7, y: 4 },
      { x: 6, y: 4 },
      { x: 5, y: 4 },
    ],
    // Durchgang in der Theke links von der Ausgabe
    exit: [
      { x: 4, y: 4 },
      { x: 4, y: 5 },
      { x: 4, y: 6 },
    ],
    baristaDrop: { x: 7.45, y: 3.62 },
    aisleY: AISLE_Y,
  },
  storage: {
    pieces: [
      { piece: 'corner', tile: { x: ORIGIN.x, y: DEVICE_Y }, facesX: false, minTier: 1 },
      { piece: 'rack', tile: { x: ORIGIN.x, y: AISLE_Y }, facesX: true, minTier: 2 },
      { piece: 'stock', tile: { x: 3, y: STAFF_Y }, facesX: false, minTier: 3 },
    ],
    fetchSpot: { x: 1.95, y: 3.45 },
  },
  bar: { stools: BAR_STOOLS, row: 6.5 },
  tables: TABLES,
  ambience: [
    { id: 'decor', tile: { x: 6, y: 9 }, minLevel: 0 },
    { id: 'decor', tile: { x: 4, y: 11 }, minLevel: 1 },
    { id: 'music', tile: { x: 11, y: 11 }, minLevel: 1 },
    { id: 'wifi', tile: { x: 1, y: 9 }, minLevel: 1 },
  ],
  decor: DECOR,
  cleanerHome: { x: 1, y: TOP_ROW },
  // Auf den Gängen zwischen den Tischen und vorn am Fenster (nicht vor Tür, Deko, Musik/WLAN)
  mopSpots: [
    { x: 2, y: 9 },
    { x: 5, y: 9 },
    { x: 8, y: 9 },
    { x: 11, y: 9 },
    { x: 5, y: 11 },
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

/** Belegte Fläche (Raum, Wintergarten + sichtbare Terrasse) als Kachel-Ausdehnung in x und y (ab 0 gezählt). */
export function layoutExtent(layout: CafeLayout, terraceLevel: number): { w: number; h: number } {
  const b = layoutBounds(layout, terraceLevel);
  return { w: b.x1, h: b.y1 };
}

/** Belegte Fläche als Kachel-Rechteck [x0, x1) × [y0, y1): Raum, Wintergarten und sichtbare Terrasse. */
export function layoutBounds(
  layout: CafeLayout,
  terraceLevel: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const { origin, annex, gridSize: n } = layout;
  const b = {
    x0: Math.min(origin.x, annex.from.x),
    y0: Math.min(origin.y, annex.from.y),
    x1: Math.max(n, annex.to.x + 1),
    y1: Math.max(n, annex.to.y + 1),
  };
  for (const a of layout.terrace) {
    if (terraceLevel < a.minLevel) continue;
    b.x0 = Math.min(b.x0, a.from.x);
    b.y0 = Math.min(b.y0, a.from.y);
    b.x1 = Math.max(b.x1, a.to.x + 1);
    b.y1 = Math.max(b.y1, a.to.y + 1);
  }
  return b;
}

/** Gehört die Kachel zum Gastraum (Raum oder Wintergarten)? */
export function inRoom(layout: CafeLayout, x: number, y: number): boolean {
  const { origin: o, gridSize: n, annex: a } = layout;
  if (x >= o.x && y >= o.y && x < n && y < n) return true;
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

/** Weg zur Tür über die obere Laufzeile (von dort aus geht es hinaus bzw. auf die Terrasse). */
function toDoor(layout: CafeLayout, x: number): GridPos[] {
  const e = layout.entrance;
  const row = layout.walkRows.top;
  return [{ x, y: row }, { x: e.x, y: row }, { ...e }];
}

/** Von der Tür auf die Laufspur vor der Fassade bis vor einen Terrassen-Tisch (vorn um die Ecke herum). */
function outPath(layout: CafeLayout, table: TablePlacement): GridPos[] {
  const out = table.outside;
  if (!out) return [];
  const e = layout.entrance;
  const { col, row } = layout.outside;
  const start = layout.entranceSide === 'v' ? { x: col, y: e.y } : { x: e.x, y: row };
  if (out.side === 'right') return [start, { x: col, y: table.side.y }];
  return layout.entranceSide === 'v'
    ? [start, { x: col, y: row }, { x: table.side.x, y: row }]
    : [start, { x: table.side.x, y: row }];
}

/** Weg vom Ende des Bestellwegs zu einem Tisch: über die obere Laufzeile und die Seitenkachel (draußen: durch die Tür). */
export function pathToTable(layout: CafeLayout, from: GridPos, table: TablePlacement): GridPos[] {
  const row = layout.walkRows.top;
  if (table.outside)
    return [...toDoor(layout, from.x), ...outPath(layout, table), { ...table.side }];
  return [{ x: from.x, y: row }, { x: table.side.x, y: row }, { ...table.side }];
}

/**
 * Weg vom Tisch zur Tür: Seitenkachel hoch auf die obere Laufzeile, dann zur Tür. Terrassen-Gäste gehen nur bis an
 * den Gehweg (den Rest ergänzt die Figuren-Simulation).
 */
export function pathFromTable(layout: CafeLayout, table: TablePlacement): GridPos[] {
  if (table.outside) {
    const s = table.side;
    return table.outside.side === 'right'
      ? [{ ...s }, { x: layout.street.curb.x, y: s.y }]
      : [{ ...s }, { x: s.x, y: layout.outside.frontWalk }];
  }
  return [{ ...table.side }, ...toDoor(layout, table.side.x)];
}

/** Weg vom Ende des Bestellwegs zu einem Warteplatz der Ausgabe (auf der Zeile vor der Theke). */
export function pathToPickup(_layout: CafeLayout, from: GridPos, spot: GridPos): GridPos[] {
  if (Math.abs(from.y - spot.y) < 1e-6) return [{ ...spot }];
  return [{ x: from.x, y: spot.y }, { ...spot }];
}

/** Weg von der Ausgabe zur Tür: eine halbe Kachel vor den Abholplätzen entlang, an Ankommenden vorbei. */
export function pathFromPickup(layout: CafeLayout, spot: GridPos): GridPos[] {
  const e = layout.entrance;
  const y = spot.y + 0.5;
  return [{ x: spot.x, y }, { x: e.x - 0.6, y }, { ...e }];
}

/** Weg von einem Abholplatz zum Barhocker: eine halbe Kachel vor der Ausgabe entlang, dann auf den Hocker. */
export function pathToStool(layout: CafeLayout, from: GridPos, stool: GridPos): GridPos[] {
  const y = layout.bar.row;
  return [{ x: from.x, y }, { x: stool.x, y }, { ...stool }];
}

/** Weg vom Barhocker zur Tür: zurück auf die Zeile davor, an den Abholplätzen vorbei hinaus. */
export function pathFromStool(layout: CafeLayout, stool: GridPos): GridPos[] {
  const e = layout.entrance;
  const y = layout.bar.row;
  return [{ x: stool.x, y }, { x: e.x - 0.6, y }, { ...e }];
}

/** Weg einer Bedienung von ihrem Platz hinter der Ausgabe zur Seitenkachel eines Tischs (auch nach draußen). */
export function waiterPathToTable(layout: CafeLayout, table: TablePlacement): GridPos[] {
  const row = layout.walkRows.top;
  const exit = layout.pickup.exit;
  const last = exit[exit.length - 1] ?? layout.entrance;
  if (table.outside)
    return [
      ...exit.map((p) => ({ ...p })),
      ...toDoor(layout, last.x),
      ...outPath(layout, table),
      { ...table.side },
    ];
  return [
    ...exit.map((p) => ({ ...p })),
    { x: last.x, y: row },
    { x: table.side.x, y: row },
    { ...table.side },
  ];
}

/** Weg einer Putzkraft von `from` zur Seitenkachel eines Tischs: über die obere Laufzeile, raus durch die Tür. */
export function cleanerPathToTable(
  layout: CafeLayout,
  from: GridPos,
  table: TablePlacement,
): GridPos[] {
  const row = layout.walkRows.top;
  if (table.outside)
    return [...toDoor(layout, from.x), ...outPath(layout, table), { ...table.side }];
  return [{ x: from.x, y: row }, { x: table.side.x, y: row }, { ...table.side }];
}

/** Weg einer Putzkraft zu einer Wischstelle: über die obere Laufzeile und den nächsten Gang zwischen den Tischen. */
export function cleanerPathToSpot(layout: CafeLayout, from: GridPos, spot: GridPos): GridPos[] {
  const row = layout.walkRows.top;
  const aisle = nearestAisle(layout, spot.x);
  return [{ x: from.x, y: row }, { x: aisle, y: row }, { x: aisle, y: spot.y }, { ...spot }];
}

/** Gang (Spalte der Seitenkacheln) mit dem geringsten Abstand zu `x`. */
function nearestAisle(layout: CafeLayout, x: number): number {
  let best = x;
  let dist = Infinity;
  for (const t of layout.tables) {
    if (t.outside) continue;
    const d = Math.abs(t.side.x - x);
    if (d < dist) {
      dist = d;
      best = t.side.x;
    }
  }
  return best;
}
