/**
 * Café-Layouts (Grid-Koordinaten, 12×12). Kunden-Wege sind feste Waypoints, kein A*.
 * Alle Standorte nutzen vorerst denselben Grundriss; eigene Layouts kommen mit den Standorten (S6).
 */
export interface GridPos {
  x: number;
  y: number;
}

export interface StationPlacement {
  stationId: string;
  /** Kachel der Station. */
  tile: GridPos;
  /** Kachel, auf der der Kunde bedient wird. */
  access: GridPos;
  /** Richtung, in die sich die Schlange vom Zugang aus verlängert (Einheitsvektor). */
  queueDir: GridPos;
  /** Weg vom Eingang bis hinter das Schlangenende (ohne Eingang, ohne Schlangenplätze). */
  path: GridPos[];
}

export interface AmbiencePlacement {
  /** Schlüssel in `LocationState.ambience`. */
  id: string;
  tile: GridPos;
  /** Sichtbar ab diesem Ambiente-Level (0 = immer). */
  minLevel: number;
}

export interface CafeLayout {
  gridSize: number;
  entrance: GridPos;
  stations: StationPlacement[];
  ambience: AmbiencePlacement[];
}

/** Darstellungs-Parameter der kosmetischen Kunden. */
export const CROWD = {
  maxAgents: 40,
  /** Sichtbare Schlangenplätze; weitere Kunden warten als Grüppchen dahinter. */
  maxQueue: 3,
  /** Streuung (Kacheln) des Grüppchens hinter der Schlange. */
  crowdSpread: 0.9,
  walkTilesPerSec: 2.4,
  /** Sichtbare Bedienzeit = 1 / Kunden/s der Station, begrenzt auf diesen Bereich. */
  minServeSec: 0.4,
  maxServeSec: 4,
  /** Schätzung für die Verweildauer, aus der „+N“ berechnet wird. */
  avgVisitSec: 9,
} as const;

/** Kamera-Grenzen. */
export const CAMERA = {
  minZoom: 0.6,
  maxZoom: 2.5,
  wheelStep: 0.0015,
  /** Ab dieser Zeigerbewegung (px) gilt ein Tap als Drag. */
  dragThresholdPx: 8,
} as const;

const AISLE_X = 6;
const ENTRANCE: GridPos = { x: 6, y: 11 };

/** Schlangenende + 1 Kachel, von dort wird in die Schlange gelaufen. */
function approach(access: GridPos, dir: GridPos, maxQueue: number): GridPos {
  return { x: access.x + dir.x * maxQueue, y: access.y + dir.y * maxQueue };
}

function place(stationId: string, tile: GridPos, access: GridPos, queueDir: GridPos) {
  const a = approach(access, queueDir, CROWD.maxQueue);
  return {
    stationId,
    tile,
    access,
    queueDir,
    path: [{ x: AISLE_X, y: a.y }, a],
  } satisfies StationPlacement;
}

const DEFAULT_LAYOUT: CafeLayout = {
  gridSize: 12,
  entrance: ENTRANCE,
  stations: [
    place('matchaBar', { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }),
    place('checkout', { x: 5, y: 0 }, { x: 5, y: 1 }, { x: 0, y: 1 }),
    place('togoWindow', { x: 9, y: 0 }, { x: 9, y: 1 }, { x: 0, y: 1 }),
    place('icedBar', { x: 0, y: 4 }, { x: 1, y: 4 }, { x: 1, y: 0 }),
    place('bakery', { x: 0, y: 7 }, { x: 1, y: 7 }, { x: 1, y: 0 }),
    place('workshopRoom', { x: 0, y: 10 }, { x: 1, y: 10 }, { x: 1, y: 0 }),
    place('merchShelf', { x: 11, y: 4 }, { x: 10, y: 4 }, { x: -1, y: 0 }),
    place('ceremonyCorner', { x: 11, y: 8 }, { x: 10, y: 8 }, { x: -1, y: 0 }),
  ],
  ambience: [
    { id: 'seats', tile: { x: 4, y: 6 }, minLevel: 0 },
    { id: 'seats', tile: { x: 8, y: 6 }, minLevel: 0 },
    { id: 'seats', tile: { x: 4, y: 9 }, minLevel: 1 },
    { id: 'seats', tile: { x: 8, y: 10 }, minLevel: 2 },
    { id: 'decor', tile: { x: 11, y: 0 }, minLevel: 0 },
    { id: 'decor', tile: { x: 0, y: 1 }, minLevel: 1 },
    { id: 'music', tile: { x: 7, y: 0 }, minLevel: 1 },
    { id: 'wifi', tile: { x: 0, y: 2 }, minLevel: 1 },
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

export function getLayout(locationId: string): CafeLayout {
  const l = LAYOUTS[locationId];
  if (!l) throw new Error(`No layout for location: ${locationId}`);
  return l;
}
