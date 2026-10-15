/**
 * Stadtviertel um das Café (Vorgabe Vincent, 2026-10-15): „Optik wie Hotel Empire Tycoon heißt nicht nur das Café
 * selbst, sondern auch Straßen und Gebäude drum herum“ – und (zweite Runde) „die Häuser sind einfach aneinander, als
 * ob da nicht eine Straße wäre … es soll mehr drum herum, kleine Läden, Geschäfte … die Map soll nicht so
 * abgeschnitten sein an den Rändern“.
 *
 * Darum ein **Straßenraster**: Fahrbahnen alle 29 Kacheln in beiden Richtungen, dazwischen Berliner Blöcke mit
 * Eckhäusern, Häuserzeilen und Innenhof. Das Café ist der Eckladen seines Blocks; vor ihm liegen Kiezpark,
 * Wochenmarkt am Kanal, Sportplatz und am Ende die Spree. Hohe Häuser stehen nur hinter bzw. neben dem Café
 * (die Kamera blickt von +x/+y, Häuser davor würden Straße und Café verdecken). Weit hinten werden die Häuser
 * einfacher und dunstig (LOD), die Kamera bleibt innerhalb von `CITY.view`, sodass man nie einen Rand sieht.
 *
 * Alles rein kosmetisch (UI_STYLE § 4), keine Spielbalance. Koordinaten in Grid-Punkten (Kachel x reicht von x bis
 * x + 1), Rechtecke halb offen. Farben als Hex-Strings: Boden, Dächer und ferne Häuser zeichnet die Szene als
 * Flächen, die Fassaden-Module rendert `pnpm art` (`scripts/art/city.ts`) in den Themen-Atlas.
 */
import { getLayout } from './layouts';

export interface GridRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type GroundKind =
  | 'courtyard'
  | 'yard'
  | 'sidewalk'
  | 'road'
  | 'grass'
  | 'path'
  | 'plaza'
  | 'pitch'
  | 'sand'
  | 'quay'
  | 'water'
  | 'bridge';

export interface GroundArea {
  kind: GroundKind;
  rect: GridRect;
}

export type RoofKind = 'gable-u' | 'gable-v' | 'hip';

export interface BuildingDef {
  rect: GridRect;
  /** Geschosse inklusive Erdgeschoss. */
  floors: number;
  /** Index in `CityPalette.facades`. */
  facade: number;
  /** Index in `CityPalette.roofs`. */
  roof: number;
  roofKind: RoofKind;
  /** Würfelt Balkone, Läden und erleuchtete Fenster (deterministisch). */
  seed: number;
  /** Fern: nur Flächen (Wand, Fensterbänder, Dach) im Dunst, keine Fassaden-Module. */
  lod: boolean;
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
  | 'trafficLight'
  | 'parked'
  | 'railing'
  | 'kiosk'
  | 'stall'
  | 'foodtruck'
  | 'playground'
  | 'fountain'
  | 'icecart'
  | 'goal'
  | 'busstop'
  | 'mailbox'
  | 'scooters'
  | 'bistro';

export interface PropDef {
  kind: PropKind;
  x: number;
  y: number;
  /** Variante (Auto-Farbe, Markisenfarbe …). */
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
  /** Dachhöhe (Satteldach/Walmdach) je Kachel Haustiefe, höchstens `roofMax`. */
  roofPerTile: 6.5,
  roofMax: 40,
  /** Anteil, mit dem ferne Häuser in den Dunst gemischt werden. */
  hazeMix: 0.38,
} as const;

/** Straßenraster: Fahrbahn k liegt bei [origin + k·pitch, … + road), Gehwege links und rechts davon. */
export const CITY_GRID = {
  origin: 15,
  pitch: 29,
  road: 4,
  sidewalk: 3,
  /** Blöcke i, j in diesem Bereich (Block −1/−1 ist der Café-Block). */
  blocks: { from: -4, to: 1 },
  /** Gezeichnete Fläche (Grid). */
  extent: { x0: -120, y0: -120, x1: 90, y1: 90 },
} as const;

const { origin: O, pitch: PITCH, road: ROAD, sidewalk: SIDE } = CITY_GRID;
/** Fahrbahn k: [roadAt(k), roadAt(k) + ROAD). */
export const roadAt = (k: number): number => O + k * PITCH;
/** Bebaubare Fläche des Blocks i (in x) bzw. j (in y): zwischen Fahrbahn i und i + 1, ohne Gehwege. */
export const zoneOf = (i: number): [number, number] => [
  roadAt(i) + ROAD + SIDE,
  roadAt(i + 1) - SIDE,
];

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

export type BlockKind = 'cafe' | 'altbau' | 'canal' | 'park' | 'market' | 'sports' | 'river';

/** Was in Block (i, j) steht: hinten Altbau, vorn Park/Markt/Sport, ganz vorn die Spree, rechts der Kanal. */
export function blockKind(i: number, j: number): BlockKind {
  if (i === -1 && j === -1) return 'cafe';
  if (i >= 1 || j >= 1) return 'river';
  if (i === 0 && j === 0) return 'market';
  if (i === 0) return 'canal';
  if (j === 0) return i === -2 ? 'sports' : 'park';
  return 'altbau';
}

/** Fassaden-Module nur für die Blöcke nah am Café; dahinter Flächen-LOD im Dunst. */
function detailed(i: number, j: number): boolean {
  return Math.abs(i + 1) + Math.abs(j + 1) <= 1 || (i === -2 && j === -2);
}

/** Hintere Raumecke des Cafés und seine Tür (alle Standorte nutzen denselben Grundriss). */
const CAFE_ORIGIN = getLayout('berlin').origin;
const CAFE_DOOR = getLayout('berlin').entrance;

/** Die Spree: alles jenseits der vorderen Uferstraßen. */
const RIVER_FROM = roadAt(1) + ROAD + SIDE;
/** Kanal rechts neben dem Café-Block (zwischen Fahrbahn 0 und dem Kanalblock), mit Ufermauern. */
const CANAL = { quay0: 21, x0: 22, x1: 26, quay1: 27 } as const;

let seedCounter = 100;

function building(rect: GridRect, roofKind: RoofKind, lod: boolean, floors?: number): BuildingDef {
  const seed = seedCounter++;
  return {
    rect,
    floors: floors ?? (hash01(seed, 1) < 0.55 ? 5 : 4),
    facade: Math.floor(hash01(seed, 2) * 7) % 7,
    roof: Math.floor(hash01(seed, 3) * 4) % 4,
    roofKind,
    seed,
    lod,
  };
}

/** Teilt eine Strecke [a, b) in Häuser von 3–4 Kacheln Breite (deterministisch). */
function splitRow(a: number, b: number, seed: number): [number, number][] {
  const out: [number, number][] = [];
  let x = a;
  let k = 0;
  while (b - x > 0) {
    const left = b - x;
    const w = left <= 5 ? left : hash01(seed, k++) < 0.5 ? 3 : 4;
    out.push([x, x + w]);
    x += w;
  }
  return out;
}

/** Berliner Block: vier Eckhäuser, Häuserzeilen dazwischen, Innenhof mit Bäumen. */
function altbauBlock(
  zone: GridRect,
  lod: boolean,
  seed: number,
): { buildings: BuildingDef[]; yard: GridRect } {
  const D = 6;
  const { x0, y0, x1, y1 } = zone;
  const out: BuildingDef[] = [];
  // Reihenfolge = Zeichenreihenfolge (hinten zuerst): hintere Zeile, linke/rechte Spalte, vordere Zeile.
  out.push(building({ x0, y0, x1: x0 + D, y1: y0 + D }, 'hip', lod, 5));
  for (const [a, b] of splitRow(x0 + D, x1 - D, seed))
    out.push(building({ x0: a, y0, x1: b, y1: y0 + D }, 'gable-u', lod));
  out.push(building({ x0: x1 - D, y0, x1, y1: y0 + D }, 'hip', lod, 5));
  for (const [a, b] of splitRow(y0 + D, y1 - D, seed + 1)) {
    out.push(building({ x0, y0: a, x1: x0 + D, y1: b }, 'gable-v', lod));
    out.push(building({ x0: x1 - D, y0: a, x1, y1: b }, 'gable-v', lod));
  }
  out.push(building({ x0, y0: y1 - D, x1: x0 + D, y1 }, 'hip', lod, 5));
  for (const [a, b] of splitRow(x0 + D, x1 - D, seed + 2))
    out.push(building({ x0: a, y0: y1 - D, x1: b, y1 }, 'gable-u', lod));
  out.push(building({ x0: x1 - D, y0: y1 - D, x1, y1 }, 'hip', lod, 5));
  return { buildings: out, yard: { x0: x0 + D, y0: y0 + D, x1: x1 - D, y1: y1 - D } };
}

export interface CityDef {
  /** Gezeichnete Fläche (Grid). */
  extent: GridRect;
  /** Die Kamera bleibt mit ihrem ganzen Ausschnitt in diesem Rechteck (Welt-Pixel). */
  view: { left: number; top: number; right: number; bottom: number };
  ground: GroundArea[];
  buildings: BuildingDef[];
  /** Objekte vorn an den Hauptstraßen, im Park, auf dem Markt (vor allen Häusern, mit den Figuren sortiert). */
  props: PropDef[];
  /** Objekte zwischen den Häusern (Innenhöfe): mit den Fassaden sortiert, unter den Dächern. */
  backProps: PropDef[];
  lanes: LaneDef[];
  walks: WalkPath[];
  /** Zebrastreifen: Rechteck und Achse der Fahrbahn, die er quert. */
  crossings: { rect: GridRect; axis: 'u' | 'v' }[];
  /** Fahrbahnen (Anfang `at`, Breite `CITY_GRID.road`), für Mittellinien und Bordsteine. */
  roads: { axis: 'u' | 'v'; at: number }[];
  /** Ausflugsdampfer: Kanal (entlang v) und Spree (entlang u). */
  boats: { axis: 'u' | 'v'; at: number; from: number; to: number }[];
  /** Hier picken Tauben (Gehweg am Café, gegenüber, am Brunnen); sie fliegen auf, wenn jemand vorbeikommt. */
  pigeons: { x: number; y: number }[];
}

/**
 * Ausschnitt, in dem die Kamera bleiben darf (Welt-Pixel, siehe `toScreen`): Er ist so gewählt, dass überall
 * Häuser, Park oder Wasser zu sehen sind; herauszoomen geht nur so weit, wie der Ausschnitt hineinpasst.
 */
const CITY_VIEW = { left: -1150, top: -1150, right: 1150, bottom: 1500 } as const;

/** Liegt v auf einer Kreuzung (mit Rand) oder über dem Kanal? Dort keine Bäume und keine Parker. */
function blockedAt(v: number, margin: number): boolean {
  return (
    [-2, -1, 0, 1].some((k) => v > roadAt(k) - margin && v < roadAt(k) + ROAD + margin) ||
    (v > CANAL.quay0 - 1 && v < CANAL.quay1 + 1)
  );
}

/** Straßenmöbel an den beiden Hauptstraßen vor dem Café (beide Gehwegseiten) und den Uferstraßen. */
function streetProps(): PropDef[] {
  const out: PropDef[] = [];
  const near = O - 0.55;
  const far = O + ROAD + 0.55;
  const outer = roadAt(1);
  for (let s = -60; s <= 44; s += 1) {
    if (blockedAt(s, 1.5)) continue;
    const frontOfCafe = s > -1 && s < 15;
    // Linden auf beiden Seiten, nicht direkt vor dem Café (Blick frei)
    if (s % 5 === 0 && !frontOfCafe) {
      out.push({ kind: 'linden', x: s, y: near + 0.1 });
      out.push({ kind: 'linden', x: near + 0.1, y: s });
    }
    if ((s + 60) % 5 === 2) {
      out.push({ kind: 'linden', x: s, y: far - 0.1 });
      out.push({ kind: 'linden', x: far - 0.1, y: s });
      if (s < outer - 2) {
        out.push({ kind: 'linden', x: s, y: outer - 0.45 });
        out.push({ kind: 'linden', x: outer - 0.45, y: s });
      }
    }
    if ((s + 60) % 7 === 3) {
      out.push({ kind: 'lamp', x: s, y: near + 0.3 });
      out.push({ kind: 'lamp', x: near + 0.3, y: s });
      out.push({ kind: 'lamp', x: s + 2, y: far - 0.3 });
      out.push({ kind: 'lamp', x: far - 0.3, y: s + 2 });
    }
    // Leben vor den Läden: Fahrräder, Roller, Briefkasten, Imbiss-Tische, Litfaßsäulen
    if ((s + 60) % 11 === 5 && !frontOfCafe) {
      out.push({ kind: 'bikes', x: s, y: near, axis: 'u' });
      out.push({ kind: 'bikes', x: near, y: s, axis: 'v' });
    }
    if ((s + 60) % 13 === 7 && !frontOfCafe) {
      out.push({ kind: 'bistro', x: s + 0.5, y: O - 2.2, variant: (s + 60) % 2 });
      out.push({ kind: 'bistro', x: O - 2.2, y: s + 0.5, variant: (s + 61) % 2 });
    }
    if ((s + 60) % 17 === 9) {
      out.push({ kind: 'scooters', x: s, y: far - 0.4, axis: 'u' });
      out.push({ kind: 'mailbox', x: far - 0.4, y: s - 1.5 });
    }
    if ((s + 60) % 23 === 11) {
      out.push({ kind: 'litfass', x: s, y: far - 0.9 });
      out.push({ kind: 'litfass', x: near - 0.4, y: s });
    }
  }
  out.push(
    // Ecke am Café
    { kind: 'litfass', x: -1.6, y: 14.2 },
    { kind: 'bin', x: -4.6, y: 14.6 },
    { kind: 'bin', x: 14.6, y: -4.6 },
    ...[13.6, 14.3].map((x) => ({ kind: 'bollard' as const, x, y: 14.8 })),
    { kind: 'cafeSign', x: 7.15, y: 12.15 },
    { kind: 'planter', x: 5.4, y: 12.25 },
    // Pflanzkübel links und rechts der Tür in der rechten Fassade
    { kind: 'planter', x: 12.25, y: CAFE_DOOR.y - 0.8 },
    { kind: 'planter', x: 12.25, y: CAFE_DOOR.y + 1.8 },
    { kind: 'pedLight', x: 12.4, y: 14.8, axis: 'u' },
    { kind: 'pedLight', x: 14.8, y: 12.4, axis: 'v' },
    // Autoampeln an allen vier Ecken der Kreuzung (Lichter zeigen zur Kamera: entlang x nach +x, entlang y nach +y)
    { kind: 'trafficLight', x: O + ROAD + 0.6, y: O - 0.6, axis: 'u' },
    { kind: 'trafficLight', x: O + ROAD + 0.6, y: O + ROAD + 0.6, axis: 'v' },
    { kind: 'trafficLight', x: O - 0.6, y: O + ROAD + 0.6, axis: 'u' },
    { kind: 'trafficLight', x: O - 0.6, y: O - 0.6, axis: 'v' },
    { kind: 'busstop', x: 4, y: far + 0.7, axis: 'u' },
    { kind: 'busstop', x: far + 0.7, y: -3, axis: 'v' },
    { kind: 'mailbox', x: 11, y: far - 0.4 },
  );
  // Parkende Autos am Bordstein (nicht vor dem Café, nicht auf Kreuzungen)
  for (let s = -58; s < 44; s += 3.4) {
    const v = Math.floor(hash01(s * 10, 3) * 4);
    if (blockedAt(s, 2.5)) continue;
    const notCafe = s < -2 || s > 15;
    if (hash01(s, 1) < 0.55 && notCafe)
      out.push({ kind: 'parked', x: s, y: O + 0.5, axis: 'u', variant: v });
    if (hash01(s, 2) < 0.5)
      out.push({ kind: 'parked', x: s + 1.2, y: O + ROAD - 0.5, axis: 'u', variant: (v + 1) % 4 });
    if (hash01(s, 5) < 0.5 && notCafe)
      out.push({ kind: 'parked', x: O + 0.5, y: s, axis: 'v', variant: (v + 2) % 4 });
    if (hash01(s, 6) < 0.5)
      out.push({ kind: 'parked', x: O + ROAD - 0.5, y: s + 1.2, axis: 'v', variant: (v + 3) % 4 });
  }
  return out;
}

const LANES: LaneDef[] = [
  // Fahrbahn vorn (entlang x): Haltelinien vor den Überwegen an der Kreuzung beim Café
  { axis: 'u', at: O + 1.5, dir: -1, stopAt: O + ROAD + 0.4 },
  { axis: 'u', at: O + 2.5, dir: 1, stopAt: 12.3 },
  // Fahrbahn rechts (entlang y)
  { axis: 'v', at: O + 1.5, dir: 1, stopAt: 12.3 },
  { axis: 'v', at: O + 2.5, dir: -1, stopAt: O + ROAD + 0.4 },
];

const SIDE_NEAR = 14.3;
const SIDE_FAR = 20.3;
const FAR_END = -62;
const WALKS: WalkPath[] = [
  // Ums Café herum (vorn → Ecke → rechts) und zurück
  {
    points: [
      { x: FAR_END, y: SIDE_NEAR },
      { x: SIDE_NEAR, y: SIDE_NEAR },
      { x: SIDE_NEAR, y: FAR_END },
    ],
  },
  {
    points: [
      { x: SIDE_NEAR, y: FAR_END },
      { x: SIDE_NEAR, y: SIDE_NEAR },
      { x: FAR_END, y: SIDE_NEAR },
    ],
  },
  // Gegenüber am Park bzw. am Kanal entlang
  {
    points: [
      { x: FAR_END, y: SIDE_FAR },
      { x: SIDE_FAR, y: SIDE_FAR },
      { x: SIDE_FAR, y: FAR_END },
    ],
  },
  {
    points: [
      { x: SIDE_FAR, y: FAR_END },
      { x: SIDE_FAR, y: SIDE_FAR },
      { x: FAR_END, y: SIDE_FAR },
    ],
  },
  // Über die Überwege (Ampel), dann in den Park
  {
    points: [
      { x: FAR_END, y: SIDE_NEAR },
      { x: 13.6, y: SIDE_NEAR },
      { x: 13.6, y: SIDE_FAR, cross: 'u' },
      { x: 5.5, y: SIDE_FAR },
      { x: 5.5, y: 28.75 },
      { x: -10, y: 28.75 },
    ],
  },
  {
    points: [
      { x: SIDE_FAR, y: FAR_END },
      { x: SIDE_FAR, y: 13.6 },
      { x: SIDE_NEAR, y: 13.6, cross: 'v' },
      { x: SIDE_NEAR, y: FAR_END },
    ],
  },
  // Durch den Park
  {
    points: [
      { x: 5.5, y: 42 },
      { x: 5.5, y: 28.75 },
      { x: 5.5, y: SIDE_FAR },
      { x: -40, y: SIDE_FAR },
    ],
  },
];

/** Baut das Viertel deterministisch aus dem Raster (einmal beim Laden). */
function buildCity(): CityDef {
  seedCounter = 100;
  const { blocks, extent } = CITY_GRID;
  const ground: GroundArea[] = [];
  const buildings: BuildingDef[] = [];
  const props: PropDef[] = [];
  const backProps: PropDef[] = [];
  const roads: { axis: 'u' | 'v'; at: number }[] = [];

  // Grundton: Gehwegpflaster überall (zwischen den Blöcken), darauf Blöcke, Fahrbahnen, Wasser.
  ground.push({ kind: 'sidewalk', rect: { ...extent } });

  for (let i: number = blocks.from; i <= blocks.to; i++) {
    for (let j: number = blocks.from; j <= blocks.to; j++) {
      const [x0, x1] = zoneOf(i);
      const [y0, y1] = zoneOf(j);
      const zone = { x0, y0, x1, y1 };
      const kind = blockKind(i, j);
      const lod = !detailed(i, j);
      const seed = (i + 10) * 31 + (j + 10) * 7;
      if (kind === 'altbau') {
        const b = altbauBlock(zone, lod, seed);
        ground.push({ kind: 'courtyard', rect: zone });
        ground.push({ kind: 'yard', rect: b.yard });
        buildings.push(...b.buildings);
        if (!lod) {
          // Hofbäume (über die Dächer der Vorderhäuser zu sehen), Fahrräder und Tonnen
          backProps.push({ kind: 'linden', x: b.yard.x0 + 2, y: b.yard.y0 + 2.5 });
          backProps.push({ kind: 'lindenSmall', x: b.yard.x1 - 2, y: b.yard.y0 + 2 });
          backProps.push({ kind: 'bikes', x: b.yard.x0 + 1, y: b.yard.y1 - 1, axis: 'u' });
          backProps.push({ kind: 'bin', x: b.yard.x1 - 1, y: b.yard.y1 - 1 });
        }
      } else if (kind === 'cafe') {
        ground.push({ kind: 'courtyard', rect: zone });
        // Café im vorderen rechten Eck (Raum ab `CAFE_ORIGIN` bis zu den Fassaden bei 12); Altbauten dahinter und
        // daneben reichen bis an seine Rückwände (Obergeschosse über dem Café).
        const { x: cx, y: cy } = CAFE_ORIGIN;
        buildings.push(building({ x0, y0, x1: cx, y1: cy }, 'hip', false, 5));
        buildings.push(building({ x0: cx, y0, x1: 6, y1: cy }, 'gable-u', false, 5));
        buildings.push(building({ x0: 6, y0, x1: 12, y1: cy }, 'hip', false, 5));
        buildings.push(building({ x0, y0: cy, x1: cx, y1: 7 }, 'gable-v', false, 5));
        buildings.push(building({ x0, y0: 7, x1: cx, y1: 12 }, 'hip', false, 5));
      } else if (kind === 'canal') {
        ground.push({ kind: 'grass', rect: { x0: CANAL.quay1, y0, x1: 31, y1 } });
        ground.push({ kind: 'courtyard', rect: { x0: 31, y0, x1, y1 } });
        const D = 6;
        buildings.push(building({ x0: 31, y0, x1: x1 - D, y1: y0 + D }, 'gable-u', lod));
        buildings.push(building({ x0: x1 - D, y0, x1, y1: y0 + D }, 'hip', lod, 5));
        buildings.push(building({ x0: x1 - D, y0: y0 + D, x1, y1: y1 - D }, 'gable-v', lod));
        buildings.push(building({ x0: 31, y0: y1 - D, x1: x1 - D, y1 }, 'gable-u', lod));
        buildings.push(building({ x0: x1 - D, y0: y1 - D, x1, y1 }, 'hip', lod, 5));
        ground.push({ kind: 'yard', rect: { x0: 31, y0: y0 + D, x1: x1 - D, y1: y1 - D } });
        if (!lod)
          for (let y = y0 + 2; y < y1; y += 5) {
            props.push({ kind: 'linden', x: 29, y });
            props.push({ kind: 'bench', x: 28, y: y + 2.5, axis: 'v' });
          }
      } else if (kind === 'park') {
        ground.push({ kind: 'grass', rect: zone });
        if (i === -1) {
          ground.push({ kind: 'path', rect: { x0: 4.5, y0, x1: 6.5, y1 } });
          ground.push({ kind: 'path', rect: { x0, y0: 28, x1, y1: 29.5 } });
          ground.push({ kind: 'sand', rect: { x0: -5, y0: 31, x1: 1, y1: 37 } });
          props.push({ kind: 'playground', x: -2, y: 34 });
          props.push({ kind: 'fountain', x: 5.5, y: 28.75 });
          props.push({ kind: 'kiosk', x: 9.5, y: 24.5 });
          props.push({ kind: 'icecart', x: 3, y: 26.6 });
          for (const [x, y] of [
            [-4, 24],
            [0, 25],
            [9, 32],
            [-5, 39],
            [2, 39.5],
            [10, 38],
            [-2, 30.5],
          ] as const)
            props.push({ kind: hash01(x, y) < 0.5 ? 'linden' : 'lindenSmall', x, y });
          for (const x of [-4, 1.5, 8.5]) props.push({ kind: 'bench', x, y: 27.6, axis: 'u' });
          props.push({ kind: 'bench', x: 3.6, y: 34, axis: 'v' });
          props.push({ kind: 'bin', x: 7, y: 27.6 });
        } else {
          for (let x = x0 + 2; x < x1; x += 5)
            for (let y = y0 + 2; y < y1; y += 5)
              if (hash01(x, y, 4) < 0.7) props.push({ kind: 'linden', x, y });
        }
      } else if (kind === 'sports') {
        ground.push({ kind: 'grass', rect: zone });
        ground.push({ kind: 'pitch', rect: { x0: x0 + 2, y0: y0 + 3, x1: x1 - 2, y1: y1 - 3 } });
        props.push({ kind: 'goal', x: (x0 + x1) / 2, y: y0 + 3.4, axis: 'u' });
        props.push({ kind: 'goal', x: (x0 + x1) / 2, y: y1 - 3.4, axis: 'u' });
        for (let x = x0 + 1; x < x1; x += 4) props.push({ kind: 'linden', x, y: y0 + 1 });
        props.push({ kind: 'bench', x: x1 - 1, y: (y0 + y1) / 2, axis: 'v' });
      } else if (kind === 'market') {
        ground.push({ kind: 'plaza', rect: { x0: CANAL.quay1, y0, x1, y1 } });
        // Wochenmarkt: Stände in zwei Reihen, Imbisswagen, Bäume am Rand
        for (let k = 0; k < 4; k++) {
          props.push({ kind: 'stall', x: 30 + k * 2.6, y: y0 + 5, variant: k % 4 });
          props.push({ kind: 'stall', x: 30 + k * 2.6, y: y0 + 9, variant: (k + 2) % 4 });
        }
        props.push({ kind: 'foodtruck', x: 31, y: y0 + 14, axis: 'u', variant: 0 });
        props.push({ kind: 'foodtruck', x: 36, y: y0 + 14.5, axis: 'u', variant: 1 });
        for (let y = y0 + 1; y < y1; y += 4) props.push({ kind: 'linden', x: x1 - 1, y });
        for (const x of [29, 33, 37]) props.push({ kind: 'bench', x, y: y1 - 2, axis: 'u' });
      } else {
        ground.push({ kind: 'water', rect: zone });
      }
    }
  }

  // Fahrbahnen über die ganze Fläche (bis zur Spree)
  for (let k: number = blocks.from; k <= blocks.to; k++) {
    const a = roadAt(k);
    roads.push({ axis: 'u', at: a }, { axis: 'v', at: a });
    ground.push({ kind: 'road', rect: { x0: extent.x0, y0: a, x1: RIVER_FROM, y1: a + ROAD } });
    ground.push({ kind: 'road', rect: { x0: a, y0: extent.y0, x1: a + ROAD, y1: RIVER_FROM } });
  }
  // Spree (vorn und rechts) mit Ufermauer, Kanal mit Ufermauern und Brücken
  const q = 0.6;
  ground.push({
    kind: 'quay',
    rect: { x0: extent.x0, y0: RIVER_FROM - q, x1: RIVER_FROM, y1: RIVER_FROM },
  });
  ground.push({
    kind: 'quay',
    rect: { x0: RIVER_FROM - q, y0: extent.y0, x1: RIVER_FROM, y1: RIVER_FROM },
  });
  ground.push({
    kind: 'water',
    rect: { x0: extent.x0, y0: RIVER_FROM, x1: extent.x1, y1: extent.y1 },
  });
  ground.push({
    kind: 'water',
    rect: { x0: RIVER_FROM, y0: extent.y0, x1: extent.x1, y1: extent.y1 },
  });
  ground.push({
    kind: 'quay',
    rect: { x0: CANAL.quay0, y0: extent.y0, x1: CANAL.x0, y1: RIVER_FROM },
  });
  ground.push({
    kind: 'water',
    rect: { x0: CANAL.x0, y0: extent.y0, x1: CANAL.x1, y1: RIVER_FROM },
  });
  ground.push({
    kind: 'quay',
    rect: { x0: CANAL.x1, y0: extent.y0, x1: CANAL.quay1, y1: RIVER_FROM },
  });
  for (let k: number = blocks.from; k <= blocks.to; k++) {
    const a = roadAt(k);
    ground.push({
      kind: 'bridge',
      rect: { x0: CANAL.quay0, y0: a - 0.4, x1: CANAL.quay1, y1: a + ROAD + 0.4 },
    });
    if (k >= -1)
      for (const x of [21.5, 23, 24.5, 26])
        for (const y of [a - 0.2, a + ROAD + 0.2]) props.push({ kind: 'railing', x, y, axis: 'u' });
  }
  // Ufergeländer an der Spree
  for (let x = -40; x < RIVER_FROM; x += 1.5)
    if (!(x > CANAL.quay0 - 1 && x < CANAL.quay1))
      props.push({ kind: 'railing', x, y: RIVER_FROM - 0.3, axis: 'u' });

  props.push(...streetProps());
  return {
    extent: { ...extent },
    view: CITY_VIEW,
    ground,
    buildings,
    props,
    backProps,
    lanes: LANES,
    walks: WALKS,
    crossings: [
      { rect: { x0: 12.6, y0: O, x1: 14.6, y1: O + ROAD }, axis: 'u' },
      { rect: { x0: O, y0: 12.6, x1: O + ROAD, y1: 14.6 }, axis: 'v' },
    ],
    roads,
    boats: [
      { axis: 'v', at: (CANAL.x0 + CANAL.x1) / 2, from: -60, to: RIVER_FROM + 4 },
      { axis: 'u', at: RIVER_FROM + 5, from: -70, to: 80 },
    ],
    pigeons: [
      { x: 1.2, y: 14.75 },
      { x: 1.8, y: 14.6 },
      { x: -3.2, y: 14.7 },
      { x: 14.7, y: 4.4 },
      { x: 14.55, y: 5.1 },
      { x: 8.5, y: 20.9 },
      { x: 9.1, y: 21.1 },
      { x: 3.6, y: 28.1 },
      { x: 4.0, y: 29.4 },
      { x: 7.3, y: 28.2 },
      { x: 7.0, y: 29.5 },
    ],
  };
}

export const CITY: CityDef = buildCity();

/** Verkehr und Passanten (kosmetisch). */
export const STREET_LIFE = {
  carTilesPerSec: 2.6,
  /** Halbe Wagenlänge: so weit vor der Haltelinie steht die Wagenmitte. */
  carHalfLength: 0.65,
  /** Mindestabstand zum Vordermann (Kacheln, Mitte zu Mitte). */
  carGap: 1.7,
  /** Neues Auto je Fahrstreifen im Mittel alle … Sekunden. */
  carEverySec: 2.6,
  maxCarsPerLane: 12,
  /** Autos starten/enden außerhalb des Bildes. */
  laneFrom: -70,
  laneTo: 60,
  /** Ampel: Grünphase je Achse, danach alles Rot, damit die Kreuzung frei wird. */
  greenSec: 9,
  allRedSec: 2.5,
  /** Die letzten Sekunden der Grünphase zeigt die Ampel Gelb, die letzte Sekunde vor Grün Rot-Gelb (Deutschland). */
  yellowSec: 2,
  redYellowSec: 1,
  /** Bei Gelb fährt nur noch, wer schon so nah (Kacheln) an der Haltelinie ist. */
  yellowCommit: 1.2,
  walkers: 16,
  walkerTilesPerSec: 1.15,
  /** Pause, bevor ein Passant am Ende seines Wegs neu startet (Sekunden, gleichverteilt). */
  walkerRestMin: 0.5,
  walkerRestMax: 4,
  /** Ausflugsdampfer auf Kanal und Spree. */
  boatTilesPerSec: 0.55,
  /** Wendepause am Ende. */
  boatRestSec: 8,
  carTypes: 4,
  /** Radfahrer im Verkehr: Anteil, Varianten (Frames `car-<carTypes + k>-f|b`), Tempo relativ zu Autos. */
  bikeShare: 0.28,
  bikeTypes: 2,
  bikeSpeed: 0.62,
  /** Tauben: fliegen auf, wenn ein Passant näher kommt (Kacheln), bleiben eine Weile weg (Sekunden). */
  pigeonScare: 1.3,
  pigeonFlySec: 2.2,
  pigeonAwayMin: 5,
  pigeonAwayMax: 12,
  pigeonLandSec: 1.4,
} as const;

export interface CityPalette {
  /** Fassadenfarben der Altbauten (Index = `BuildingDef.facade`). */
  facades: readonly string[];
  /** Diese Fassaden sind Klinker (feine Fugen statt Putz). */
  bricks: readonly number[];
  /** Stuck: Fensterfaschen, Gesimse, Balkonplatten. */
  stucco: string;
  /** Erdgeschoss-Sockel (Ladenzone, gequadert). */
  plinth: string;
  /** Dachfarben (Schiefer, Ziegel, dunkle Ziegel, Zink). */
  roofs: readonly string[];
  courtyard: string;
  yard: string;
  sidewalk: string;
  sidewalkJoint: string;
  curb: string;
  road: string;
  roadMark: string;
  grass: string;
  grassDark: string;
  path: string;
  plaza: string;
  pitch: string;
  sand: string;
  quay: string;
  water: string;
  waterLight: string;
  /** Dunst über fernen Häusern und Hintergrund der Kamera. */
  haze: string;
}

const BERLIN: CityPalette = {
  facades: ['#e8c993', '#e6a993', '#b9cfc0', '#b9c5d9', '#efe3c8', '#b65d43', '#d8b672'],
  bricks: [5, 6],
  stucco: '#f7f1e6',
  plinth: '#a59b8f',
  roofs: ['#77798c', '#b06a4f', '#8f5a49', '#6d7386'],
  courtyard: '#b9b1a4',
  yard: '#a9b597',
  sidewalk: '#cdc8bf',
  sidewalkJoint: '#b6b0a6',
  curb: '#e2ded7',
  road: '#5d6274',
  roadMark: '#f3f1ea',
  grass: '#9ccb7f',
  grassDark: '#86b56b',
  path: '#e5d6b4',
  plaza: '#d9cdb8',
  pitch: '#7fbf63',
  sand: '#ecd9a6',
  quay: '#bdb6aa',
  water: '#5fa8d8',
  waterLight: '#8cc6ea',
  haze: '#c7d1e2',
};

export const CITY_PALETTES: Readonly<Record<string, CityPalette>> = {
  berlin: BERLIN,
  kyoto: {
    ...BERLIN,
    facades: ['#e9dcc0', '#d9c4a0', '#c8b894', '#efe6d2', '#bba582', '#8a6247', '#cdb48c'],
    plinth: '#6e5340',
    roofs: ['#4e5568', '#5d6377', '#46495a', '#6a6f80'],
    grass: '#a6c98a',
    grassDark: '#8fb573',
    water: '#6db0c8',
  },
  tokyo: {
    ...BERLIN,
    facades: ['#c9ccd8', '#a9afc3', '#d9d3e6', '#9097b2', '#e8e4ef', '#8b6f78', '#b7a8c4'],
    plinth: '#3f4362',
    roofs: ['#666b84', '#565b74', '#7c819a', '#4d5168'],
    courtyard: '#9da0b0',
    sidewalk: '#c2c4cf',
    sidewalkJoint: '#aeb1bd',
    road: '#4a4f66',
    haze: '#bcc2dc',
  },
  seoul: {
    ...BERLIN,
    facades: ['#e7e3db', '#cfd9e3', '#f0dac9', '#c9d7c5', '#dacce1', '#b8705a', '#d4b98e'],
    plinth: '#8d8f9c',
  },
  newyork: {
    ...BERLIN,
    facades: ['#a6563f', '#934c3a', '#b96d50', '#c89c7c', '#80584a', '#a4483a', '#c08a5c'],
    bricks: [0, 1, 2, 5, 6],
    stucco: '#ece5da',
    plinth: '#3d3d48',
    roofs: ['#5d5d69', '#4f4f5c', '#6c6c78', '#585866'],
    sidewalk: '#c4c0ba',
    road: '#53576a',
  },
  bali: {
    ...BERLIN,
    facades: ['#efe0bd', '#e3cfa2', '#f2e8d2', '#d9c290', '#e9d9b9', '#c98a5e', '#dcc7a0'],
    bricks: [],
    plinth: '#8a6a3c',
    roofs: ['#a3664a', '#8f5a42', '#b87458', '#7d4f3c'],
    grass: '#8fcf7a',
    grassDark: '#76bb62',
    water: '#4fc1c9',
    waterLight: '#86dbe0',
    haze: '#cfe0d8',
  },
};

export function getCityPalette(locationId: string): CityPalette {
  return CITY_PALETTES[locationId] ?? BERLIN;
}

// ---------------------------------------------------------------------------------------------
// Fassaden-Raster (geteilt von `scripts/art/city.ts` und der Szene)
// ---------------------------------------------------------------------------------------------

export type FacadeFace = 'a' | 'b';
/**
 * Läden des Erdgeschosses (farbunabhängig): Gemischtwaren, Blumen, Späti, Bäckerei, Imbiss, Buchladen,
 * Fahrradladen, Apotheke, Eisdiele, Plattenladen; dazu Haustür und Hochparterre ohne Laden.
 */
export const SHOP_TYPES = 10;
export const GROUND_CELLS: readonly string[] = [
  ...Array.from({ length: SHOP_TYPES }, (_, i) => `shop${String(i)}`),
  'door',
  'base',
];
export const UPPER_CELLS = ['win', 'balc'] as const;
export type UpperCell = (typeof UPPER_CELLS)[number];

/** Gesamthöhe eines Hauses in Pixeln (Erdgeschoss, Obergeschosse, Gesims). */
export function buildingHeight(b: Pick<BuildingDef, 'floors'>): number {
  return CITY_STYLE.groundFloorH + (b.floors - 1) * CITY_STYLE.floorH + CITY_STYLE.corniceH;
}

/** Dachhöhe über dem Gesims (Sattel-/Walmdach) aus der kürzeren Hausseite. */
export function roofHeight(b: BuildingDef): number {
  const short = Math.min(b.rect.x1 - b.rect.x0, b.rect.y1 - b.rect.y0);
  return Math.min(CITY_STYLE.roofMax, short * CITY_STYLE.roofPerTile);
}

/** Erdgeschoss-Modul einer Fassadenachse zur Straße: meist Läden, dazwischen Haustüren. */
export function groundCellFor(b: BuildingDef, index: number, street: boolean): string {
  if (!street) return 'base';
  const r = hash01(b.seed, index, 3);
  if (index % 4 === 2 || r < 0.1) return 'door';
  // Ein Laden reicht über zwei Achsen (gleiche Würfelzahl je Paar), dann der nächste.
  const shop = Math.floor(hash01(b.seed, Math.floor(index / 2), 11) * SHOP_TYPES) % SHOP_TYPES;
  return `shop${String(shop)}`;
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
  wide: { w: 160, h: 128, ox: 80, oy: 96 },
  car: { w: 96, h: 64, ox: 48, oy: 40 },
  railing: { w: 96, h: 48, ox: 48, oy: 30 },
  boat: { w: 176, h: 88, ox: 88, oy: 58 },
  /** Fassaden-Modul der Höhe `hc`: Leinwand 64 × (hc + 38), Bodenpunkt (32, hc + 8). */
  cell: (hc: number) => ({ w: 64, h: hc + 38, ox: 32, oy: hc + 8 }),
} as const;

const WIDE_PROPS: readonly PropKind[] = [
  'kiosk',
  'stall',
  'foodtruck',
  'playground',
  'fountain',
  'busstop',
  'goal',
];

/** Leinwand je Objekt-Art. */
export function propCanvas(kind: PropKind): { w: number; h: number; ox: number; oy: number } {
  if (kind === 'linden' || kind === 'lindenSmall') return CITY_SPRITE.tree;
  if (kind === 'parked') return CITY_SPRITE.car;
  if (kind === 'railing') return CITY_SPRITE.railing;
  if (WIDE_PROPS.includes(kind)) return CITY_SPRITE.wide;
  return CITY_SPRITE.prop;
}

/** Frame-Name eines Objekts im `city`-Atlas (Varianten und Ausrichtung im Namen). */
export function propFrame(p: PropDef): string {
  switch (p.kind) {
    case 'parked':
      return `car-${String(p.variant ?? 0)}-f`;
    case 'bench':
      return `bench-${p.axis ?? 'u'}`;
    case 'pedLight':
      return 'pedLight-stop';
    case 'trafficLight':
      return `tlight-${p.axis ?? 'u'}-red`;
    case 'stall':
      return `stall-${String((p.variant ?? 0) % 4)}`;
    case 'foodtruck':
      return `foodtruck-${String((p.variant ?? 0) % 2)}`;
    case 'bistro':
      return `bistro-${String((p.variant ?? 0) % 2)}`;
    default:
      return p.kind;
  }
}

/** Objekte, die quer gestellt (entlang v) gespiegelt gezeichnet werden. */
export const FLIP_ON_V: readonly PropKind[] = [
  'parked',
  'bikes',
  'scooters',
  'goal',
  'busstop',
  'foodtruck',
];
