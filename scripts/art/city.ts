/**
 * Stadtviertel als Code (selbst gezeichnet, CC0, docs/ASSETS.md): Fassaden-Module der Altbauten je Standort-Palette
 * (Themen-Atlas) und Straßen-Objekte für alle Standorte (Atlas `city`: Linden, Laternen, Litfaßsäule, Fahrräder,
 * Bänke, Ampeln, Autos, Ausflugsdampfer). Stil wie UI_STYLE § 4: Flat-Shaded-Iso, Lokalfarben, Kontaktschatten.
 * Grundriss und Farben: `src/data/city.ts`.
 */
import {
  CITY_SPRITE,
  CITY_STYLE,
  PARKED_CAR_PAINTS,
  GROUND_CELLS,
  UPPER_CELLS,
  getCityPalette,
  type CityPalette,
  type FacadeFace,
} from '../../src/data/city';
import { FacingCanvas } from './equipment';
import { IsoCanvas, SHADE, Z_PER_TILE, shade, tint, type Vec3 } from './iso';
import { C } from './palette';
import {
  cone,
  crown,
  extrudeU,
  facetLight,
  lit,
  ngon,
  polyline,
  prism,
  ringPts,
  strut,
} from './shapes';
import type { SpriteDef } from './sprites';

const FACES: readonly FacadeFace[] = ['a', 'b'];
/** Altbaufenster: dunkles, leicht blaues Glas (Innenräume), nachts warm. */
const PANE = '#6f8db0';
const PANE_LIT = '#ffd98a';
const IRON = '#3b3f4f';
const DOOR = '#6b4a33';

function cellCanvas(face: FacadeFace, hc: number): FacingCanvas {
  const s = CITY_SPRITE.cell(hc);
  return new FacingCanvas(face, s.w, s.h, s.ox, s.oy);
}

/** Helle Spiegelung als schräger Streifen auf einer Scheibe. */
function reflex(c: FacingCanvas, x: number, y: number, z: number, w: number, h: number) {
  c.frontPoly(
    y,
    [
      [x + w * 0.15, z + h * 0.2],
      [x + w * 0.32, z + h * 0.2],
      [x + w * 0.5, z + h * 0.85],
      [x + w * 0.33, z + h * 0.85],
    ],
    C.white,
    0.28,
  );
}

/** Fensterflügel mit Kreuzsprosse; `lit` zeichnet nur die warmen Scheiben (Nacht-Overlay). */
function sash(c: FacingCanvas, x: number, z: number, w: number, h: number, lit: boolean) {
  if (lit) {
    c.frontLit(x, 0.008, z, w, h, PANE_LIT);
    c.frontLit(x + w / 2 - 0.006, 0.009, z, 0.012, h, tint(PANE_LIT, 0.6));
    c.frontLit(x, 0.009, z + h * 0.68, w, 0.8, tint(PANE_LIT, 0.6));
    return;
  }
  c.front(x - 0.03, 0.004, z - 1.5, w + 0.06, h + 3, C.white);
  c.frontLit(x, 0.006, z, w, h, c.frontShade(PANE));
  reflex(c, x, 0.007, z, w, h);
  c.front(x + w / 2 - 0.006, 0.007, z, 0.012, h, C.white);
  c.front(x, 0.007, z + h * 0.68, w, 0.8, C.white);
}

/**
 * Wandfläche eines Obergeschoss-Moduls; etwas breiter als die Achse, damit zwischen Nachbarmodulen keine helle
 * Fuge blitzt. Klinker bekommt feine Lagerfugen.
 */
function wallPlane(c: FacingCanvas, f: string, h: number, brick: boolean) {
  c.front(-0.02, 0, 0, 1.04, h, f);
  if (brick) for (let z = 3; z < h; z += 3) c.front(-0.02, 0.0005, z, 1.04, 0.5, shade(f, 0.88));
  c.front(-0.02, 0.001, 0, 1.04, 1.4, shade(f, 0.9));
}

/** Obergeschoss-Fenster mit Faschen, Sohlbank und Verdachung. */
function windowCell(c: FacingCanvas, p: CityPalette, f: string, lit: boolean, brick = false) {
  const h = CITY_STYLE.floorH;
  if (!lit) {
    wallPlane(c, f, h, brick);
    c.front(0.24, 0.002, 6, 0.52, 25, p.stucco);
  }
  sash(c, 0.3, 9, 0.4, 19, lit);
  if (lit) return;
  c.fbox(0.22, 0, 5, 0.56, 0.07, 1.6, p.stucco);
  c.fbox(0.21, 0, 30.5, 0.58, 0.06, 1.8, p.stucco);
  c.frontPoly(
    0.061,
    [
      [0.26, 32.3],
      [0.5, 35.2],
      [0.74, 32.3],
    ],
    tint(p.stucco, 0.2),
  );
}

/** Fenstertür mit Balkon: Platte aus Stuck, schmiedeeisernes Geländer, ab und zu eine Pflanze. */
function balconyCell(c: FacingCanvas, p: CityPalette, f: string, lit: boolean, brick = false) {
  const h = CITY_STYLE.floorH;
  if (!lit) {
    wallPlane(c, f, h, brick);
    c.front(0.26, 0.002, 2, 0.48, 30, p.stucco);
  }
  sash(c, 0.31, 4, 0.38, 24, lit);
  if (lit) return;
  c.fbox(0.24, 0, 30.5, 0.52, 0.06, 1.8, p.stucco);
  c.fshadow(0.14, 0, 1, 0.72, 0.32, 0.2);
  c.fbevel(0.14, 0, 1, 0.72, 0.32, 2.4, p.stucco, { b: 0.8, side: true });
  c.fcyl(0.24, 0.12, 3.4, 0.05, 4, C.terracotta);
  c.fdome(0.24, 0.12, 7.4, 0.06, 5, C.matcha);
  for (let k = 0; k <= 8; k++) c.fbox(0.15 + k * 0.087, 0.3, 3.4, 0.01, 0.012, 9, IRON);
  for (let k = 1; k <= 3; k++) {
    c.fbox(0.15, 0.03 + k * 0.07, 3.4, 0.012, 0.01, 9, IRON);
    c.fbox(0.845, 0.03 + k * 0.07, 3.4, 0.012, 0.01, 9, IRON);
  }
  c.fbox(0.14, 0.02, 12.4, 0.022, 0.3, 1.1, IRON);
  c.fbox(0.84, 0.02, 12.4, 0.022, 0.3, 1.1, IRON);
  c.fbox(0.14, 0.295, 12.4, 0.72, 0.025, 1.1, IRON);
}

/** Gesims über dem obersten Geschoss: Fries, Zahnschnitt, auskragende Platte. */
function corniceCell(c: FacingCanvas, p: CityPalette, f: string) {
  c.front(-0.02, 0, 0, 1.04, CITY_STYLE.corniceH, f);
  c.fbox(0, 0, 0.5, 1, 0.05, 1.6, p.stucco);
  for (let k = 0; k < 6; k++) c.fbox(0.04 + k * 0.165, 0, 3, 0.08, 0.08, 2.2, p.stucco);
  c.fbox(0, 0, 5.4, 1, 0.13, 2.4, p.stucco);
  c.fbox(0, 0, 7.8, 1, 0.17, 2.2, tint(p.stucco, 0.3));
}

/** Gequaderter Sockel der Ladenzone (Fugen alle 8 px). */
function plinth(c: FacingCanvas, p: CityPalette) {
  const h = CITY_STYLE.groundFloorH;
  c.front(-0.02, 0, 0, 1.04, h, p.plinth);
  for (let z = 8; z < h; z += 8) c.front(-0.02, 0.001, z, 1.04, 0.8, shade(p.plinth, 0.86));
  c.front(-0.02, 0.001, h - 2, 1.04, 2, p.stucco);
}

/** Markise mit Streifen in zwei Farben, schräg aus der Fassade. */
function awning(c: FacingCanvas, a: string, b: string) {
  const n = 6;
  for (let k = 0; k < n; k++) {
    const x0 = 0.07 + (k * 0.86) / n;
    const x1 = x0 + 0.86 / n;
    const col = k % 2 ? b : a;
    c.fpoly(
      [
        [x0, 0.01, 50],
        [x1, 0.01, 50],
        [x1, 0.52, 41],
        [x0, 0.52, 41],
      ],
      col,
    );
    c.front(x0, 0.52, 38, x1 - x0, 3, col);
  }
}

type Goods =
  | 'shelves'
  | 'flowers'
  | 'bottles'
  | 'bread'
  | 'grill'
  | 'books'
  | 'wheels'
  | 'pharmacy'
  | 'icecream'
  | 'records';
type Outside = 'flowers' | 'crates' | 'chairs' | 'books' | 'bike' | 'cone' | null;
interface ShopStyle {
  frame: string;
  sign: string;
  awning: [string, string] | null;
  goods: Goods;
  outside: Outside;
  /** Emblem auf dem Schild (keine Schrift). */
  emblem: 'bar' | 'cross' | 'circle' | 'leaf';
}

/** Zehn Ladentypen der Kiezstraßen (Index = `shop<n>`). */
const SHOPS: readonly ShopStyle[] = [
  {
    frame: C.ink,
    sign: C.red,
    awning: [C.red, C.white],
    goods: 'shelves',
    outside: null,
    emblem: 'bar',
  },
  {
    frame: '#2f5f45',
    sign: C.matchaDeep,
    awning: [C.matchaDeep, C.white],
    goods: 'flowers',
    outside: 'flowers',
    emblem: 'leaf',
  },
  {
    frame: '#3a3550',
    sign: C.gold,
    awning: null,
    goods: 'bottles',
    outside: 'crates',
    emblem: 'bar',
  },
  {
    frame: '#6b4a33',
    sign: C.cream,
    awning: [C.coffee, C.cream],
    goods: 'bread',
    outside: null,
    emblem: 'circle',
  },
  {
    frame: '#8a2b22',
    sign: C.orange,
    awning: [C.red, C.gold],
    goods: 'grill',
    outside: 'chairs',
    emblem: 'bar',
  },
  {
    frame: '#24413a',
    sign: C.paper,
    awning: null,
    goods: 'books',
    outside: 'books',
    emblem: 'bar',
  },
  {
    frame: C.ink,
    sign: C.teal,
    awning: [C.teal, C.white],
    goods: 'wheels',
    outside: 'bike',
    emblem: 'circle',
  },
  {
    frame: C.white,
    sign: '#3c9a5a',
    awning: null,
    goods: 'pharmacy',
    outside: null,
    emblem: 'cross',
  },
  {
    frame: '#c95a8c',
    sign: C.sakura,
    awning: [C.sakura, C.white],
    goods: 'icecream',
    outside: 'cone',
    emblem: 'circle',
  },
  { frame: C.plum, sign: C.ink, awning: null, goods: 'records', outside: null, emblem: 'circle' },
];

/** Auslage im Schaufenster (x 0,09 … 0,69, z 5 … 42). */
function goods(c: FacingCanvas, g: Goods) {
  const L = (x: number, z: number, w: number, h: number, col: string) =>
    c.frontLit(x, 0.005, z, w, h, c.frontShade(col));
  const shelves = (cols: readonly string[]) => {
    for (const z of [16, 27]) L(0.1, z, 0.58, 1.2, C.woodDark);
    for (let k = 0; k < 6; k++) {
      L(0.12 + k * 0.09, 17.2, 0.05, 5 + (k % 3), cols[k % cols.length] ?? C.cream);
      L(0.13 + k * 0.09, 28.2, 0.04, 4 + ((k + 1) % 3), cols[(k + 2) % cols.length] ?? C.cream);
    }
  };
  switch (g) {
    case 'shelves':
      shelves([C.sakura, C.matcha, C.cream, C.orange, C.blue, C.gold]);
      break;
    case 'bottles':
      shelves([C.matchaDeep, C.gold, C.red, C.orange, C.teal, C.cream]);
      for (let k = 0; k < 8; k++) L(0.11 + k * 0.07, 6, 0.03, 8, k % 2 ? C.matchaDeep : C.coffee);
      break;
    case 'flowers':
      for (let k = 0; k < 5; k++) {
        L(0.12 + k * 0.11, 6, 0.06, 8, C.stainlessDark);
        L(0.1 + k * 0.11, 14, 0.1, 7, [C.sakura, C.gold, C.red, C.white, C.plum][k] ?? C.sakura);
        L(0.11 + k * 0.11, 20, 0.07, 4, C.matcha);
      }
      break;
    case 'bread':
      L(0.1, 16, 0.58, 1.2, C.woodDark);
      for (let k = 0; k < 5; k++) {
        L(0.12 + k * 0.11, 17.2, 0.09, 4, C.woodDark);
        L(0.13 + k * 0.11, 21, 0.07, 1.6, C.oakLight);
      }
      for (let k = 0; k < 3; k++) L(0.16 + k * 0.17, 6, 0.12, 6, k === 1 ? C.sakura : C.cream);
      break;
    case 'grill':
      L(0.14, 8, 0.12, 26, C.coffee);
      L(0.15, 10, 0.1, 22, C.woodDark);
      L(0.19, 6, 0.02, 30, C.stainless);
      L(0.34, 6, 0.32, 10, C.stainless);
      for (let k = 0; k < 4; k++)
        L(0.36 + k * 0.075, 16, 0.05, 3, [C.matcha, C.red, C.cream, C.orange][k] ?? C.red);
      break;
    case 'books':
      for (const z of [8, 19, 30]) {
        L(0.1, z - 1.2, 0.58, 1.2, C.woodDark);
        for (let k = 0; k < 14; k++)
          L(
            0.11 + k * 0.04,
            z,
            0.03,
            6 + (k % 3),
            [C.red, C.cobalt, C.gold, C.matchaDeep, C.cream, C.plum][k % 6] ?? C.red,
          );
      }
      break;
    case 'wheels':
      for (const [x, z] of [
        [0.22, 22],
        [0.48, 26],
        [0.34, 12],
      ] as const) {
        L(x - 0.08, z - 1, 0.16, 2, C.ink);
        L(x - 0.01, z - 7, 0.02, 14, C.ink);
      }
      break;
    case 'pharmacy':
      shelves([C.white, '#3c9a5a', C.white, C.sakura, C.white, C.cobaltLight]);
      L(0.3, 6, 0.18, 6, '#3c9a5a');
      break;
    case 'icecream':
      L(0.1, 8, 0.58, 10, C.stainless);
      for (let k = 0; k < 6; k++)
        L(
          0.12 + k * 0.09,
          14,
          0.07,
          3.4,
          [C.sakura, C.cream, C.matchaFoam, C.coffee, C.gold, C.red][k] ?? C.cream,
        );
      L(0.1, 18, 0.58, 1, C.glass);
      break;
    case 'records':
      for (let k = 0; k < 4; k++) {
        L(0.12 + k * 0.14, 24, 0.12, 12, [C.sakura, C.cobalt, C.gold, C.teal][k] ?? C.gold);
        L(0.16 + k * 0.14, 28, 0.04, 4, C.ink);
      }
      L(0.1, 8, 0.58, 10, C.woodDark);
      break;
  }
}

/** Auslage vor dem Laden (auf dem Gehweg, y 0,2 … 0,55). */
function outside(c: FacingCanvas, o: Outside) {
  switch (o) {
    case 'flowers':
      for (let k = 0; k < 3; k++) {
        const x = 0.18 + k * 0.17;
        c.fshadowDisc(x, 0.35, 0, 0.07, 0.2);
        c.fcyl(x, 0.35, 0, 0.055, 6, C.stainlessDark);
        c.fdome(x, 0.35, 6, 0.07, 6, [C.sakura, C.gold, C.red][k] ?? C.sakura);
        c.fdome(x + 0.03, 0.33, 7, 0.04, 4, C.matcha);
      }
      break;
    case 'crates':
      for (let k = 0; k < 2; k++) {
        c.fshadow(0.14, 0.24, 0, 0.18, 0.18, 0.2);
        c.fbevel(0.14, 0.24, k * 5, 0.18, 0.18, 5, k ? C.orange : C.matchaDeep, { b: 0.6 });
      }
      c.fbox(0.5, 0.3, 0, 0.16, 0.04, 14, C.ink);
      c.frontLit(0.52, 0.341, 3, 0.12, 9, c.frontShade(C.white));
      break;
    case 'chairs':
      for (const x of [0.2, 0.5]) {
        c.fshadowDisc(x + 0.06, 0.38, 0, 0.1, 0.2);
        c.fcyl(x + 0.06, 0.38, 0, 0.012, 10, C.stainless);
        c.fcyl(x + 0.06, 0.38, 10, 0.09, 1.2, C.white);
      }
      c.fbevel(0.12, 0.25, 6, 0.08, 0.08, 1.2, C.red, { b: 0.4 });
      c.fbevel(0.66, 0.25, 6, 0.08, 0.08, 1.2, C.red, { b: 0.4 });
      break;
    case 'books':
      c.fshadow(0.14, 0.22, 0, 0.5, 0.2, 0.2);
      c.fbox(0.14, 0.22, 0, 0.5, 0.2, 8, C.woodDark);
      for (let k = 0; k < 8; k++)
        c.fbox(
          0.15 + k * 0.06,
          0.24,
          8,
          0.05,
          0.14,
          2,
          [C.red, C.cobalt, C.gold, C.cream][k % 4] ?? C.red,
        );
      break;
    case 'bike':
      c.fshadow(0.1, 0.3, 0, 0.6, 0.08, 0.2);
      c.fbox(0.12, 0.33, 0, 0.012, 0.012, 6, C.ink);
      c.fbox(0.56, 0.33, 0, 0.012, 0.012, 6, C.ink);
      c.fbox(0.12, 0.33, 6, 0.46, 0.012, 1.2, C.teal);
      c.fbox(0.2, 0.33, 9, 0.1, 0.03, 1, C.ink);
      break;
    case 'cone':
      c.fshadowDisc(0.5, 0.35, 0, 0.08, 0.2);
      c.fbox(0.49, 0.34, 0, 0.02, 0.02, 12, C.white);
      c.ffrustum(0.5, 0.35, 12, 0.02, 0.07, 9, C.oakLight, C.sakura);
      c.fdome(0.5, 0.35, 21, 0.07, 6, C.sakura);
      break;
    default:
      break;
  }
}

/** Laden: Schaufenster mit Auslage, Ladenschild ohne Schrift, je Typ eigene Markise und Auslage vorm Laden. */
function shopCell(c: FacingCanvas, p: CityPalette, variant: number) {
  const s = SHOPS[variant % SHOPS.length] ?? SHOPS[0];
  if (!s) return;
  plinth(c, p);
  c.front(0.05, 0.002, 2, 0.9, 44, s.frame);
  // Schaufenster: warm beleuchtetes Innere mit Auslage
  c.frontLit(0.09, 0.004, 5, 0.6, 37, c.frontShade('#eadfc8'));
  goods(c, s.goods);
  c.frontLit(0.09, 0.006, 5, 0.6, 37, C.glass, 0.25);
  reflex(c, 0.09, 0.007, 5, 0.6, 37);
  // Ladentür rechts
  c.front(0.72, 0.004, 3, 0.19, 39, shade(s.frame, s.frame === C.white ? 0.85 : 1.2));
  c.frontLit(0.74, 0.006, 5, 0.15, 33, c.frontShade(PANE));
  c.front(0.75, 0.007, 19, 0.04, 1.2, C.stainless);
  c.fbox(0.05, 0, 0, 0.9, 0.08, 2, shade(s.frame, 0.9));
  // Schild: Fläche mit Emblem und Zierlinie (keine Schrift)
  c.front(0.04, 0.003, 48, 0.92, 9, s.sign);
  const em = s.sign === C.paper || s.sign === C.cream ? C.ink : C.white;
  if (s.emblem === 'cross') {
    c.frontLit(0.13, 0.005, 49.6, 0.04, 5.8, c.frontShade(C.white));
    c.frontLit(0.1, 0.005, 51.6, 0.1, 1.8, c.frontShade(C.white));
  } else if (s.emblem === 'circle') {
    const pts: [number, number][] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      pts.push([0.15 + Math.cos(a) * 0.05, 52.5 + Math.sin(a) * 2.2]);
    }
    c.frontPoly(0.005, pts, c.frontShade(em));
  } else if (s.emblem === 'leaf') {
    c.frontPoly(
      0.005,
      [
        [0.1, 50],
        [0.16, 54.5],
        [0.22, 50],
        [0.16, 49.2],
      ],
      c.frontShade(em),
    );
  } else {
    c.frontLit(0.1, 0.005, 50.5, 0.12, 4, c.frontShade(em));
  }
  c.frontLit(
    0.28,
    0.005,
    52,
    0.5,
    1.2,
    c.frontShade(em === C.ink ? shade(s.sign, 0.6) : tint(s.sign, 0.55)),
  );
  c.frontLit(
    0.28,
    0.005,
    49.6,
    0.34,
    1,
    c.frontShade(em === C.ink ? shade(s.sign, 0.7) : tint(s.sign, 0.4)),
  );
  if (s.awning) awning(c, s.awning[0], s.awning[1]);
  outside(c, s.outside);
}

function doorCell(c: FacingCanvas, p: CityPalette) {
  plinth(c, p);
  c.front(0.24, 0.002, 0, 0.52, 50, p.stucco);
  c.front(0.29, 0.004, 2, 0.42, 36, DOOR);
  for (const x of [0.32, 0.51])
    for (const z of [6, 22]) c.front(x, 0.006, z, 0.17, 12, tint(DOOR, 0.15));
  c.front(0.495, 0.006, 2, 0.01, 36, shade(DOOR, 0.8));
  // Oberlicht als Bogen
  const pts: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI - (i / 10) * Math.PI;
    pts.push([0.5 + Math.cos(a) * 0.21, 39 + Math.sin(a) * 8]);
  }
  c.frontPoly(0.004, pts, c.frontShade(PANE));
  c.front(0.29, 0.005, 38, 0.42, 1.4, DOOR);
  c.fbox(0.2, 0, 0, 0.6, 0.2, 2.2, shade(p.plinth, 1.15));
}

function baseCell(c: FacingCanvas, p: CityPalette) {
  plinth(c, p);
  c.front(0.3, 0.003, 30, 0.4, 22, p.stucco);
  sash(c, 0.34, 33, 0.32, 16, false);
  c.front(0.36, 0.003, 4, 0.28, 6, shade(p.plinth, 0.6));
}

/**
 * Fassaden-Module eines Standorts (Themen-Atlas): `fac-<g>-<face>` (Erdgeschoss, farbunabhängig),
 * `fac-<win|balc|cornice>-<farbe>-<face>`, warme Scheiben `fac-lit-<win|balc>-<face>` für die Nacht.
 */
export function facadeSprites(locationId: string): SpriteDef[] {
  const p = getCityPalette(locationId);
  const out: SpriteDef[] = [];
  for (const face of FACES) {
    for (const g of GROUND_CELLS) {
      const c = cellCanvas(face, CITY_STYLE.groundFloorH);
      if (g === 'door') doorCell(c, p);
      else if (g === 'base') baseCell(c, p);
      else shopCell(c, p, Number(g.slice(4)));
      out.push({ name: `fac-${g}-${face}`, svg: c.svg() });
    }
    p.facades.forEach((f, i) => {
      const brick = p.bricks.includes(i);
      for (const u of UPPER_CELLS) {
        const c = cellCanvas(face, CITY_STYLE.floorH);
        if (u === 'win') windowCell(c, p, f, false, brick);
        else balconyCell(c, p, f, false, brick);
        out.push({ name: `fac-${u}-${String(i)}-${face}`, svg: c.svg() });
      }
      const c = cellCanvas(face, CITY_STYLE.corniceH);
      corniceCell(c, p, f);
      out.push({ name: `fac-cornice-${String(i)}-${face}`, svg: c.svg() });
    });
    for (const u of UPPER_CELLS) {
      const c = cellCanvas(face, CITY_STYLE.floorH);
      if (u === 'win') windowCell(c, p, '#000000', true);
      else balconyCell(c, p, '#000000', true);
      out.push({ name: `fac-lit-${u}-${face}`, svg: c.svg() });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Straßen-Objekte (Atlas `city`, für alle Standorte gleich)
// ---------------------------------------------------------------------------------------------
type Box = { w: number; h: number; ox: number; oy: number };
const canvasOf = (s: Box) => new IsoCanvas(s.w, s.h, s.ox, s.oy);

/** Laub in fünf Stufen (Schatten → Sonne) für facettierte Kronen. */
const LEAVES = [C.leafDeep, C.leaf, C.leafMid, C.leafLight, C.leafSun] as const;

/** Baumscheibe: Granit-Einfassung, gusseiserner Rost mit Schlitzen, Erde um den Stamm. */
function treePit(c: IsoCanvas, r: number) {
  c.bevel(-r - 0.04, -r - 0.04, 0, 2 * r + 0.08, 2 * r + 0.08, 1.4, C.stone, { b: 0.6 });
  c.flat(-r, -r, 1.41, 2 * r, 2 * r, C.castIron);
  // Schlitze im Rost als hellere Rahmen-Ringe
  for (const k of [0.78, 0.52])
    c.flat(-r * k, -r * k, 1.42, 2 * r * k, 2 * r * k, tint(C.castIron, 0.18));
  for (const k of [0.7, 0.44]) c.flat(-r * k, -r * k, 1.43, 2 * r * k, 2 * r * k, C.castIron);
  c.disc(0, 0, 1.44, r * 0.34, C.soil);
}

/** Stamm als Kegelstumpf mit Wurzelanlauf, Lichtkante links und zwei Ästen in die Krone. */
function trunk(c: IsoCanvas, s: number, h: number, branches: readonly Vec3[]) {
  c.frustum(0, 0, 1.4, 0.085 * s, 0.06 * s, 4 * s, C.bark, C.bark);
  c.frustum(0, 0, 5, 0.06 * s, 0.045 * s, h - 5, C.bark, C.barkLight);
  c.shine(0, 0, 5, 0.05 * s, h - 8, C.bark, 0.22);
  for (const b of branches) {
    strut(c, [0, 0, h * 0.72], b, shade(C.bark, 0.92), 2.6 * s);
    strut(c, [0, 0, h * 0.72], b, C.barkLight, 1 * s, 0.6);
  }
}

/**
 * Linde: Baumscheibe, Stamm mit Ästen, breite Krone aus facettierten Laubballen (Sonne oben links, Schatten
 * rechts unten), weicher Schatten der Krone auf dem Gehweg.
 */
function linden(small: boolean): string {
  const c = canvasOf(CITY_SPRITE.tree);
  const s = small ? 0.74 : 1;
  c.shadowDisc(0.04, 0.04, 0, 0.62 * s, 0.2, 3.2);
  c.shadowDisc(0, 0, 0, 0.16 * s, 0.28, 1.2);
  treePit(c, 0.24 * s);
  const H = 44 * s;
  trunk(c, s, H, [
    [-0.18 * s, 0.06 * s, H + 6 * s],
    [0.16 * s, -0.08 * s, H + 9 * s],
  ]);
  // Untere Ballen eine Stufe dunkler (verschattet von der Krone darüber), oben Sonne.
  const balls: [number, number, number, number, number][] = small
    ? [
        [-0.2, 0.1, 44, 0.25, -1],
        [0.2, -0.04, 46, 0.25, -1],
        [0.02, 0.22, 42, 0.23, -1],
        [0.0, -0.2, 49, 0.23, -1],
        [-0.07, -0.02, 57, 0.28, 0],
        [0.1, 0.08, 56, 0.25, 0],
        [0.02, -0.02, 69, 0.2, 0],
      ]
    : [
        [-0.3, 0.12, 55, 0.33, -1],
        [0.3, -0.06, 57, 0.33, -1],
        [0.04, 0.32, 52, 0.3, -1],
        [0.0, -0.32, 61, 0.3, -1],
        [-0.13, -0.1, 72, 0.37, 0],
        [0.17, 0.14, 70, 0.34, 0],
        [0.02, 0.0, 87, 0.28, 0],
      ];
  crown(c, balls, C.leaf, { tones: LEAVES, seed: small ? 3 : 1 });
  return c.svg();
}

/** Senkrechte Streben auf einem Kegelstumpf (Sprossen einer Laterne, Stäbe), nur die vordere Hälfte. */
function mullions(
  c: IsoCanvas,
  z0: number,
  z1: number,
  r0: number,
  r1: number,
  color: string,
  angles: readonly number[] = [-0.25, 0.25, 0.75],
  w = 0.9,
) {
  for (const t of angles) {
    const a = t * Math.PI;
    strut(
      c,
      [Math.cos(a) * r0, Math.sin(a) * r0, z0],
      [Math.cos(a) * r1, Math.sin(a) * r1, z1],
      color,
      w,
    );
  }
}

/**
 * Berliner Gaslaterne (Aufsatzleuchte): achteckiger Gusssockel, Schaft mit Ringen und Leiterstange, Laterne
 * mit Sprossen und warmem Glas, Dach mit Krempe und Knauf. Laternenmitte bei z ≈ 66 (Nacht-Schein der Szene).
 */
function lamp(): string {
  const c = canvasOf(CITY_SPRITE.prop);
  const g = C.lampGreen;
  c.shadowDisc(0, 0, 0, 0.13, 0.26);
  prism(c, ngon(0, 0, 0.1, 8, Math.PI / 8), 0, 3, g, tint(g, 0.12));
  prism(c, ngon(0, 0, 0.075, 8, Math.PI / 8), 3, 9, g, tint(g, 0.12));
  c.frustum(0, 0, 9, 0.06, 0.04, 4, g, tint(g, 0.15));
  c.cylinder(0, 0, 13, 0.03, 42, g);
  c.shine(0, 0, 13, 0.03, 42, g, 0.28);
  for (const z of [20, 46]) c.cylinder(0, 0, z, 0.042, 1.8, tint(g, 0.08), tint(g, 0.25));
  // Leiterstange quer zur Straße, mit Kugelenden
  c.box(-0.13, -0.01, 49, 0.26, 0.02, 1.4, C.castIron);
  for (const u of [-0.13, 0.13]) c.dome(u, 0, 49.5, 0.018, 2.2, C.castIron);
  c.frustum(0, 0, 55, 0.035, 0.085, 3, g, tint(g, 0.2));
  // Laterne: warmes Glas, Sprossen, Lichtkern
  c.group(0.9, () => c.frustum(0, 0, 58, 0.08, 0.115, 12, C.lamp, tint(C.lamp, 0.5)));
  c.frustum(0, 0, 60, 0.03, 0.03, 6, tint(C.lamp, 0.6), C.led);
  mullions(c, 58, 70, 0.08, 0.115, g);
  c.cylinder(0, 0, 69.5, 0.125, 1.6, g, tint(g, 0.2));
  cone(c, 0, 0, 71, 0.14, 7, g);
  c.cylinder(0, 0, 77, 0.018, 1.6, g);
  c.dome(0, 0, 78.4, 0.03, 3.2, C.brass);
  return c.svg();
}

function bench(face: 'a' | 'b'): string {
  const s = CITY_SPRITE.prop;
  const c = new FacingCanvas(face, s.w, s.h, s.ox, s.oy);
  c.fshadow(-0.45, -0.12, 0, 0.9, 0.3, 0.22);
  for (const x of [-0.4, 0.34]) {
    c.fbox(x, -0.1, 0, 0.05, 0.24, 7, IRON);
    c.fbox(x, -0.12, 7, 0.05, 0.04, 12, IRON);
  }
  for (let k = 0; k < 3; k++)
    c.fbevel(-0.45, -0.1 + k * 0.075, 7, 0.9, 0.06, 1.6, C.oakLight, { b: 0.5 });
  for (let k = 0; k < 2; k++)
    c.fbox(-0.45, -0.13, 11 + k * 4, 0.9, 0.025, 2.4, shade(C.oakLight, 0.95));
  return c.svg();
}

/** Projiziert einen Kreis in der senkrechten Ebene v = const (Rad, Lenker). */
function ringPath(c: IsoCanvas, u: number, v: number, z: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const [x, y] = c.p([u + Math.cos(a) * r, v, z + Math.sin(a) * r * Z_PER_TILE]);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join(' ');
}

/** Fahrradbügel mit drei Rädern (Hollandrad, Rennrad, Lastenrad-Kiste), quer zum Bordstein. */
function bikes(): string {
  const s = CITY_SPRITE.prop;
  const c = new IsoCanvas(s.w, s.h, s.ox, s.oy);
  const colors = [C.teal, C.red, C.cream];
  // Räder stehen in Ebenen v = const nebeneinander (Fahrtrichtung u); quer gestellt spiegelt die Szene.
  for (let k = 0; k < 3; k++) {
    const v = -0.28 + k * 0.28;
    c.shadow(-0.32, v - 0.03, 0, 0.64, 0.08, 0.2);
    const col = colors[k] ?? C.teal;
    const w = 0.15;
    for (const u of [-0.2, 0.2])
      c.raw(
        `<polyline points="${ringPath(c, u, v, w * Z_PER_TILE, w)}" fill="none" stroke="${C.ink}" stroke-width="1.3"/>`,
      );
    const P = (u: number, z: number) =>
      c
        .p([u, v, z])
        .map((n) => n.toFixed(2))
        .join(',');
    const hub = w * Z_PER_TILE;
    c.raw(
      `<polyline points="${P(-0.2, hub)} ${P(-0.02, hub)} ${P(-0.06, 12)} ${P(-0.2, hub)}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round"/>`,
    );
    c.raw(
      `<polyline points="${P(-0.02, hub)} ${P(0.14, 13)} ${P(-0.06, 12)}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round"/>`,
    );
    c.raw(
      `<polyline points="${P(0.2, hub)} ${P(0.14, 13)} ${P(0.12, 16)}" fill="none" stroke="${shade(col, 0.8)}" stroke-width="1.4"/>`,
    );
    c.box(-0.1, v - 0.02, 12.5, 0.08, 0.04, 1.2, C.ink);
    c.box(0.1, v - 0.05, 16, 0.03, 0.1, 1, C.ink);
    if (k === 2) c.box(0.12, v - 0.06, 7, 0.14, 0.12, 6, C.woodDark);
  }
  // Bügel
  c.box(-0.02, -0.36, 0, 0.03, 0.03, 10, C.stainless);
  c.box(-0.02, 0.33, 0, 0.03, 0.03, 10, C.stainless);
  c.box(-0.02, -0.36, 10, 0.03, 0.72, 1.4, C.stainless);
  return c.svg();
}

/** Litfaßsäule: dunkelgrüner Sockel, Plakate als Farbbänder, Gesims und Kuppel. */
function litfass(): string {
  const c = canvasOf(CITY_SPRITE.prop);
  const g = '#2f5a4a';
  c.shadowDisc(0, 0, 0, 0.3, 0.24);
  c.cylinder(0, 0, 0, 0.25, 5, g, tint(g, 0.2));
  const bands = [C.sakura, C.gold, C.cobalt, C.white, C.red];
  bands.forEach((b, i) => c.cylinder(0, 0, 5 + i * 8, 0.22, 8, b, b));
  for (let k = 0; k < 3; k++)
    c.cylinder(0, 0, 9 + k * 13, 0.221, 1.2, shade(C.paper, 0.9), shade(C.paper, 0.9));
  c.cylinder(0, 0, 45, 0.26, 3, g, tint(g, 0.25));
  c.dome(0, 0, 48, 0.24, 12, g);
  c.cylinder(0, 0, 58, 0.03, 4, C.brass);
  return c.svg();
}

function bin(): string {
  const c = canvasOf(CITY_SPRITE.prop);
  c.shadowDisc(0, 0, 0, 0.12, 0.22);
  c.cylinder(0, 0, 0, 0.025, 10, C.ink);
  c.cylinder(0, 0, 9, 0.11, 13, C.orange, shade(C.orange, 0.6));
  c.shine(0, 0, 9, 0.11, 13, C.orange, 0.25);
  c.cylinder(0, 0, 22, 0.115, 1.6, shade(C.orange, 0.85), shade(C.ink, 1.3));
  return c.svg();
}

function bollard(): string {
  const c = canvasOf(CITY_SPRITE.prop);
  c.shadowDisc(0, 0, 0, 0.08, 0.22);
  c.cylinder(0, 0, 0, 0.05, 15, IRON);
  c.cylinder(0, 0, 10, 0.051, 2, C.white, C.white);
  c.dome(0, 0, 15, 0.05, 3, IRON);
  return c.svg();
}

/** Blauer Pflanzkübel des Cafés mit Buchskugeln. */
function planter(): string {
  const c = canvasOf(CITY_SPRITE.prop);
  c.shadow(-0.25, -0.18, 0, 0.5, 0.36, 0.24);
  c.bevel(-0.24, -0.16, 0, 0.48, 0.32, 12, C.cobalt, { b: 1 });
  c.flat(-0.21, -0.13, 12.01, 0.42, 0.26, C.woodDeep);
  c.dome(-0.1, 0, 12, 0.13, 11, C.matchaDeep);
  c.dome(0.1, 0.01, 12, 0.13, 13, C.matcha);
  return c.svg();
}

/** Nasenschild des Cafés: Edelstahl-Mast, blaue Tafel mit weißem Blatt (keine Schrift). */
function cafeSign(): string {
  const c = canvasOf(CITY_SPRITE.prop);
  c.shadowDisc(0, 0, 0, 0.1, 0.24);
  c.cylinder(0, 0, 0, 0.07, 2, C.stainlessDark);
  c.cylinder(0, 0, 2, 0.025, 52, C.stainless);
  c.shine(0, 0, 2, 0.025, 52, C.stainless, 0.4);
  // Tafel in der Ebene u = const (zeigt nach +u), ragt in +v vom Mast weg
  c.box(-0.02, 0.0, 34, 0.04, 0.46, 24, C.cobalt, { right: shade(C.cobalt, SHADE.right + 0.1) });
  c.box(-0.022, 0.0, 34, 0.044, 0.46, 1.6, C.stainless);
  c.box(-0.022, 0.0, 56.4, 0.044, 0.46, 1.6, C.stainless);
  const L = (v: number, z: number): Vec3 => [0.0201, v, z];
  c.poly([L(0.12, 39), L(0.15, 51), L(0.34, 53), L(0.31, 41)], C.white);
  c.poly([L(0.14, 40), L(0.3, 52), L(0.31, 51), L(0.15, 39.5)], C.cobalt);
  return c.svg();
}

/**
 * Zeichenhilfe für Signalgeber, die zu einer Achse zeigen: a = entlang der Lichtfläche, n = Abstand nach vorn
 * (zur Kamera, +u bei Achse u, +v bei Achse v), z = Höhe.
 */
function facing(c: IsoCanvas, axis: 'u' | 'v') {
  const P = (a: number, n: number, z: number): Vec3 => (axis === 'u' ? [n, a, z] : [a, n, z]);
  return {
    P,
    box: (a: number, n: number, z: number, da: number, dn: number, h: number, color: string) =>
      axis === 'u' ? c.box(n, a, z, dn, da, h, color) : c.box(a, n, z, da, dn, h, color),
    /** Fläche in der Ebene n (zeigt nach vorn); Farbe ohne Schattierung. */
    face: (a: number, n: number, z: number, da: number, h: number, color: string, opacity = 1) =>
      c.poly([P(a, n, z), P(a + da, n, z), P(a + da, n, z + h), P(a, n, z + h)], color, opacity),
    disc: (a: number, n: number, z: number, r: number, color: string, opacity = 1) =>
      c.poly(axis === 'u' ? ringPts('u', n, a, z, r) : ringPts('v', a, n, z, r), color, opacity),
    poly: (n: number, pts: readonly (readonly [number, number])[], color: string, opacity = 1) =>
      c.poly(
        pts.map(([a, z]) => P(a, n, z)),
        color,
        opacity,
      ),
    /** Helligkeit der Vorderseite (Achse u zeigt nach rechts: 70 %, Achse v nach links: 85 %). */
    s: axis === 'u' ? SHADE.right : SHADE.left,
  };
}

/** Mast aus verzinktem Stahl mit Fuß, Glanzkante und Kappe. */
function signalMast(c: IsoCanvas, h: number) {
  c.shadowDisc(0, 0, 0, 0.1, 0.26);
  c.cylinder(0, 0, 0, 0.055, 2.5, C.castIron, tint(C.castIron, 0.2));
  c.cylinder(0, 0, 2.5, 0.028, h - 2.5, C.galvanized);
  c.shine(0, 0, 2.5, 0.028, h - 2.5, C.galvanized, 0.45);
  c.cylinder(0, 0, 9, 0.031, 3, C.castIron, tint(C.castIron, 0.2));
  c.dome(0, 0, h, 0.03, 2.4, C.galvanized);
}

type LensState = { on: boolean; color: string };

/**
 * Signalgeber: Kontrastblende mit weißem Rand, Gehäuse mit Fase, Linsen mit Schute; leuchtende Linse mit Hof,
 * heißem Kern und Glanzpunkt, dunkle Linse mit Reflex.
 */
function signalHead(
  f: ReturnType<typeof facing>,
  z0: number,
  w: number,
  lenses: readonly LensState[],
  pitch: number,
  r: number,
  plate: boolean,
) {
  const h = pitch * lenses.length + 2;
  const n0 = 0.034;
  const dn = 0.06;
  if (plate) {
    f.box(-w / 2 - 0.045, n0 - 0.008, z0 - 3.5, w + 0.09, 0.008, h + 7, C.white);
    f.face(-w / 2 - 0.035, n0, z0 - 2.4, w + 0.07, h + 4.8, shade(C.ink, f.s));
  }
  f.box(-w / 2, n0, z0, w, dn, h, C.ink);
  f.box(-w / 2, n0, z0 + h, w, dn, 0.8, tint(C.ink, 0.15));
  const n1 = n0 + dn + 0.001;
  lenses.forEach((l, i) => {
    const z = z0 + h - 1 - pitch * (i + 0.5);
    if (l.on) {
      f.disc(0, n1 + 0.004, z, r * 1.9, l.color, 0.16);
      f.disc(0, n1 + 0.004, z, r * 1.4, l.color, 0.3);
    }
    f.disc(0, n1, z, r * 1.12, shade(C.ink, 0.6));
    f.disc(0, n1 + 0.001, z, r, l.on ? l.color : shade(l.color, 0.3));
    if (l.on) f.disc(-r * 0.15, n1 + 0.002, z + 0.3, r * 0.55, tint(l.color, 0.55));
    f.disc(-r * 0.4, n1 + 0.003, z + r * Z_PER_TILE * 0.45, r * 0.25, C.white, l.on ? 0.8 : 0.3);
    // Schute: Dach und Wangen ragen über die Linse nach vorn
    f.box(-r * 1.25, n1, z + r * Z_PER_TILE * 1.05, r * 2.5, 0.035, 0.9, shade(C.ink, 1.25));
    for (const a of [-r * 1.25, r * 1.17])
      f.box(
        a,
        n1,
        z - r * Z_PER_TILE * 0.2,
        r * 0.08,
        0.035,
        r * Z_PER_TILE * 1.25,
        shade(C.ink, 1.1),
      );
  });
}

/** Fußgängerampel mit Ampelmännchen (rot steht, grün geht, beide mit Hut) und gelbem Anforderungstaster. */
function pedLight(go: boolean): string {
  const c = canvasOf(CITY_SPRITE.prop);
  signalMast(c, 50);
  const f = facing(c, 'v');
  // Taster am Mast (zur Seite +u), gelb mit Tastenfeld
  const t = facing(c, 'u');
  t.box(-0.045, 0.026, 15, 0.09, 0.05, 9, C.postYellow);
  t.face(-0.025, 0.077, 19, 0.05, 3, shade(C.ink, t.s));
  t.disc(0, 0.078, 17, 0.015, C.white);
  const w = 0.17;
  const z0 = 31;
  f.box(-w / 2, 0.034, z0, w, 0.06, 23, C.ink);
  f.box(-w / 2, 0.034, z0 + 23, w, 0.06, 0.8, tint(C.ink, 0.15));
  const n = 0.095;
  const man = (zc: number, walking: boolean, col: string) => {
    const S = (pts: readonly (readonly [number, number])[]) =>
      f.poly(
        n + 0.002,
        pts.map(([a, z]) => [a * 0.06, zc + z * 0.85] as const),
        col,
      );
    // Hut (Krempe und Kopf), Kopf, Rumpf
    S([
      [-0.55, 4.6],
      [0.55, 4.6],
      [0.55, 5.2],
      [-0.55, 5.2],
    ]);
    S([
      [-0.3, 5.2],
      [0.3, 5.2],
      [0.25, 6.4],
      [-0.25, 6.4],
    ]);
    S([
      [-0.28, 3],
      [0.28, 3],
      [0.28, 4.6],
      [-0.28, 4.6],
    ]);
    S([
      [-0.4, -0.6],
      [0.4, -0.6],
      [0.35, 3],
      [-0.35, 3],
    ]);
    if (walking) {
      S([
        [-0.3, -0.4],
        [0.05, -0.4],
        [-0.55, -4.6],
        [-0.95, -4.6],
      ]);
      S([
        [-0.05, -0.4],
        [0.3, -0.4],
        [0.95, -4.6],
        [0.55, -4.6],
      ]);
      S([
        [0.3, 2.6],
        [0.4, 2],
        [1.1, 0.4],
        [0.9, 0.1],
      ]);
    } else {
      S([
        [-0.35, -0.6],
        [0.35, -0.6],
        [0.3, -4.6],
        [-0.3, -4.6],
      ]);
      S([
        [-0.38, 2.8],
        [-0.38, 2],
        [-1.15, 0.6],
        [-1.15, 1.4],
      ]);
      S([
        [0.38, 2.8],
        [0.38, 2],
        [1.15, 0.6],
        [1.15, 1.4],
      ]);
    }
  };
  for (const [zc, on, col, walking] of [
    [z0 + 17, !go, C.signalRed, false],
    [z0 + 6, go, C.signalGreen, true],
  ] as const) {
    f.face(-w / 2 + 0.015, n + 0.001, zc - 5.2, w - 0.03, 10.4, shade(C.ink, 0.55));
    if (on) f.face(-w / 2 + 0.02, n + 0.0015, zc - 4.8, w - 0.04, 9.6, col, 0.22);
    man(zc, walking, on ? col : shade(col, 0.32));
    f.box(-w / 2, n, zc + 5.4, w, 0.03, 0.8, shade(C.ink, 1.25));
  }
  return c.svg();
}

/**
 * Autoampel am Mast: Hauptsignal mit weiß umrandeter Kontrastblende und Schuten, darunter ein kleiner Wiederholer
 * in Augenhöhe. Die Lichter zeigen zur Kamera: Achse `u` nach +x (Fahrbahn entlang x), `v` nach +y.
 * `state` = was leuchtet.
 */
function trafficLight(axis: 'u' | 'v', state: 'red' | 'redYellow' | 'green' | 'yellow'): string {
  const c = canvasOf(CITY_SPRITE.prop);
  signalMast(c, 68);
  const f = facing(c, axis);
  const lenses: LensState[] = [
    { on: state === 'red' || state === 'redYellow', color: C.signalRed },
    { on: state === 'yellow' || state === 'redYellow', color: C.signalYellow },
    { on: state === 'green', color: C.signalGreen },
  ];
  // Halterungen (kurze Ausleger) zwischen Mast und Gehäusen
  for (const z of [42, 62, 18, 28]) f.box(-0.012, 0.01, z, 0.024, 0.03, 1.6, C.galvanized);
  signalHead(f, 38, 0.2, lenses, 9, 0.072, true);
  signalHead(f, 14, 0.13, lenses, 5.4, 0.042, false);
  return c.svg();
}

/** Brückengeländer: Sandstein-Pfosten mit Eisenstäben, 1,5 Kacheln entlang u. */
function railing(): string {
  const c = canvasOf(CITY_SPRITE.railing);
  c.shadow(-0.75, -0.04, 0, 1.5, 0.1, 0.2);
  for (let k = 0; k < 14; k++) c.box(-0.7 + k * 0.1, -0.01, 0, 0.012, 0.012, 9, IRON);
  c.box(-0.75, -0.03, 9, 1.5, 0.06, 1.6, IRON);
  for (const u of [-0.75, 0.66]) c.bevel(u, -0.05, 0, 0.09, 0.1, 13, C.stone, { b: 0.8 });
  return c.svg();
}

// Autos: entlang u, Mittelpunkt bei (0, 0). „f“ = fährt nach +u (Front sichtbar), „b“ = nach −u (Heck sichtbar).
type CarKind = 'sedan' | 'wagon' | 'van' | 'compact';
interface CarStyle {
  kind: CarKind;
  paint: string;
  /** Taxischild auf dem Dach (Berliner Taxi: Elfenbein, gelbes Schild). */
  sign?: boolean;
  /** Zierstreifen an der Flanke (Lieferwagen). */
  stripe?: string;
  /** Dach in Kontrastfarbe (Kleinwagen). */
  roof?: string;
  /** Dachreling (Kombi ohne Taxischild). */
  rails?: boolean;
}

/** Vier Grundtypen für den Verkehr (`car-<typ>-f|b`, `STREET_LIFE.carTypes`). */
const CARS: CarStyle[] = [
  { kind: 'sedan', paint: C.carRed },
  { kind: 'wagon', paint: C.carTaxi, sign: true },
  { kind: 'van', paint: C.white, stripe: C.cobalt },
  { kind: 'compact', paint: C.carMint, roof: C.white },
];

/** Weitere Lacke je Typ für parkende Autos (`car-<typ>-p<k>-f`, `parkedCarFrame` in `data/city.ts`). */
const CAR_PAINTS: readonly (readonly CarStyle[])[] = [
  [
    { kind: 'sedan', paint: C.carNavy },
    { kind: 'sedan', paint: C.carSilver },
  ],
  [
    { kind: 'wagon', paint: C.carGreen, rails: true },
    { kind: 'wagon', paint: C.carBlack, rails: true },
  ],
  [
    { kind: 'van', paint: C.carYellow, stripe: C.ink },
    { kind: 'van', paint: C.carSilver },
  ],
  [
    { kind: 'compact', paint: C.carYellow, roof: C.white },
    { kind: 'compact', paint: C.carOrange, roof: C.carSilver },
  ],
];

type P2u = readonly [number, number];
interface CarShape {
  /** Unterbau (Seitenprofil u/z, Front bei +u, gegen den Uhrzeigersinn ab hinten unten). */
  body: readonly P2u[];
  /** Kabine (Glashaus), etwas schmaler; leer = Kasten ohne eigene Kabine. */
  cabin: readonly P2u[];
  /** Seitenscheiben auf der Kabinen- bzw. Kastenseite und Säulen dazwischen (u). */
  windows: readonly P2u[];
  pillars: readonly number[];
  /** Index der Frontscheibe und Heckscheibe im Kabinen- bzw. Kastenprofil. */
  screen: number;
  rear: number;
  W: number;
  wheels: readonly number[];
  r: number;
  /** Oberkante der senkrechten Front bzw. des Hecks. */
  noseZ: number;
  tailZ: number;
  /** Türfugen (u) und Gürtellinie. */
  doors: readonly number[];
  belt: number;
}

const SHAPES: Record<CarKind, CarShape> = {
  sedan: {
    body: [
      [-0.55, 2.4],
      [0.55, 2.4],
      [0.56, 6.2],
      [0.52, 8],
      [0.3, 8.8],
      [-0.34, 8.8],
      [-0.5, 8.4],
      [-0.56, 6.8],
    ],
    cabin: [
      [-0.34, 8.8],
      [0.3, 8.8],
      [0.1, 14.6],
      [-0.2, 14.6],
    ],
    windows: [
      [-0.3, 9.4],
      [0.26, 9.4],
      [0.09, 14],
      [-0.18, 14],
    ],
    pillars: [-0.04],
    screen: 1,
    rear: 3,
    W: 0.27,
    wheels: [-0.34, 0.33],
    r: 0.085,
    noseZ: 6.2,
    tailZ: 6.8,
    doors: [-0.05, 0.25],
    belt: 8.8,
  },
  wagon: {
    body: [
      [-0.58, 2.4],
      [0.58, 2.4],
      [0.59, 6.2],
      [0.55, 8],
      [0.32, 8.8],
      [-0.56, 8.8],
      [-0.59, 7],
    ],
    cabin: [
      [-0.56, 8.8],
      [0.32, 8.8],
      [0.12, 14.8],
      [-0.5, 14.8],
    ],
    windows: [
      [-0.51, 9.4],
      [0.28, 9.4],
      [0.11, 14.2],
      [-0.47, 14.2],
    ],
    pillars: [-0.08, -0.32],
    screen: 1,
    rear: 3,
    W: 0.27,
    wheels: [-0.37, 0.35],
    r: 0.085,
    noseZ: 6.2,
    tailZ: 7,
    doors: [-0.09, 0.26],
    belt: 8.8,
  },
  van: {
    body: [
      [-0.64, 2.6],
      [0.64, 2.6],
      [0.65, 7],
      [0.61, 9.6],
      [0.47, 10.6],
      [0.35, 19],
      [0.29, 20],
      [-0.62, 20],
      [-0.65, 19],
    ],
    cabin: [],
    windows: [
      [0.06, 11.2],
      [0.43, 11.2],
      [0.33, 18.2],
      [0.06, 18.2],
    ],
    pillars: [],
    screen: 4,
    rear: 8,
    W: 0.29,
    wheels: [-0.4, 0.42],
    r: 0.095,
    noseZ: 7,
    tailZ: 19,
    doors: [0.02, -0.28],
    belt: 10.6,
  },
  compact: {
    body: [
      [-0.45, 2.2],
      [0.45, 2.2],
      [0.46, 6],
      [0.4, 8.2],
      [0.24, 9],
      [-0.31, 9],
      [-0.44, 8],
      [-0.46, 6],
    ],
    cabin: [
      [-0.31, 9],
      [0.24, 9],
      [0.1, 15.4],
      [-0.22, 15.4],
    ],
    windows: [
      [-0.27, 9.6],
      [0.2, 9.6],
      [0.09, 14.8],
      [-0.19, 14.8],
    ],
    pillars: [-0.02],
    screen: 1,
    rear: 3,
    W: 0.25,
    wheels: [-0.28, 0.28],
    r: 0.08,
    noseZ: 6,
    tailZ: 6,
    doors: [0.0],
    belt: 9,
  },
};

/** Rad in der Ebene v: Reifen mit Flanke, Felge mit Glanz, Nabe. */
function wheel(c: IsoCanvas, u: number, v: number, r = 0.1) {
  const z = r * Z_PER_TILE;
  c.poly(ringPts('v', u - 0.012, v - 0.02, z, r, 16), shade(C.rubber, 0.8));
  c.poly(ringPts('v', u, v, z, r, 16), C.rubber);
  c.poly(ringPts('v', u, v + 0.001, z, r * 0.62, 12), C.galvanized);
  c.poly(ringPts('v', u + r * 0.12, v + 0.002, z - r * 4, r * 0.4, 10), shade(C.galvanized, 0.82));
  c.poly(ringPts('v', u, v + 0.003, z, r * 0.2, 8), shade(C.galvanized, 0.6));
}

/** Zwei schräge Lichtreflexe auf einer Scheibe in der Ebene v (Punkte der Scheibe als u/z-Viereck). */
function carGlint(c: IsoCanvas, v: number, q: readonly P2u[], opacity = 0.35) {
  const [a, b, d, e] = q;
  if (!a || !b || !d || !e) return;
  const lerp = (p: P2u, r: P2u, t: number): P2u => [
    p[0] + (r[0] - p[0]) * t,
    p[1] + (r[1] - p[1]) * t,
  ];
  for (const [t0, t1] of [
    [0.18, 0.3],
    [0.38, 0.44],
  ] as const) {
    const lo0 = lerp(a, b, t0);
    const lo1 = lerp(a, b, t1);
    const hi0 = lerp(e, d, t0 + 0.12);
    const hi1 = lerp(e, d, t1 + 0.12);
    c.poly(
      [lo0, lo1, hi1, hi0].map(([u, z]) => [u, v, z] as Vec3),
      C.white,
      opacity,
    );
  }
}

function car(style: CarStyle, heading: 'f' | 'b'): string {
  const c = canvasOf(CITY_SPRITE.car);
  const sh = SHAPES[style.kind];
  const s = heading === 'f' ? 1 : -1;
  // Gespiegelt (Heck vorn) kehrt sich der Umlaufsinn um.
  const mir = (p: readonly P2u[]): P2u[] => {
    const m = p.map(([u, z]) => [u * s, z] as P2u);
    return s > 0 ? m : m.reverse();
  };
  const idx = (i: number, n: number) => (s > 0 ? i : n - 2 - i < 0 ? n - 1 : n - 2 - i);
  const W = sh.W;
  const L = Math.max(...sh.body.map(([u]) => Math.abs(u)));
  const paint = style.paint;
  const glassSide = shade(C.pane, 0.78);
  const glassFront = tint(C.pane, 0.18);
  c.shadow(-L - 0.04, -W - 0.03, 0, 2 * L + 0.08, 2 * W + 0.07, 0.32, 1.6);
  for (const u of sh.wheels) c.shadowDisc(u * s, W - 0.02, 0, 0.08, 0.3, 0.8);
  // Räder der fernen Seite schauen unter dem Wagen hervor
  for (const u of sh.wheels) wheel(c, u * s, -W + 0.02, sh.r);
  const body = mir(sh.body);
  const boxOnly = sh.cabin.length === 0;
  const nb = body.length;
  extrudeU(c, body, -W, W, paint, {
    seg: boxOnly ? (i) => (i === idx(sh.screen, nb) ? glassFront : undefined) : undefined,
  });
  // Radläufe (dunkel, nur über der Unterkante) und Seitenschweller
  const bottom = sh.body[0]?.[1] ?? 2.4;
  for (const u of sh.wheels)
    c.poly(
      ringPts('v', u * s, W + 0.001, sh.r * Z_PER_TILE, sh.r * 1.28, 16).map(
        ([pu, pv, pz]) => [pu, pv, Math.max(bottom, pz)] as Vec3,
      ),
      shade(paint, 0.32),
    );
  c.poly(
    [
      [-L + 0.05, W + 0.0015, bottom],
      [L - 0.05, W + 0.0015, bottom],
      [L - 0.05, W + 0.0015, bottom + 0.9],
      [-L + 0.05, W + 0.0015, bottom + 0.9],
    ],
    shade(paint, 0.55),
  );
  // Kantenlicht unter der Gürtellinie, Zierstreifen, Türfugen und Griffe
  const beltZ = boxOnly ? sh.belt - 0.6 : sh.belt - 0.5;
  c.poly(
    [
      [-L + 0.06, W + 0.0015, beltZ - 0.5],
      [L - 0.08, W + 0.0015, beltZ - 0.5],
      [L - 0.08, W + 0.0015, beltZ],
      [-L + 0.06, W + 0.0015, beltZ],
    ],
    tint(paint, 0.3),
    0.7,
  );
  if (style.stripe)
    c.poly(
      [
        [-L + 0.02, W + 0.002, 6.2],
        [L - 0.02, W + 0.002, 6.2],
        [L - 0.02, W + 0.002, 7.6],
        [-L + 0.02, W + 0.002, 7.6],
      ],
      style.stripe,
    );
  for (const d of sh.doors) {
    strut(
      c,
      [d * s, W + 0.002, bottom + 1],
      [d * s, W + 0.002, boxOnly ? 18.6 : sh.belt - 0.2],
      shade(paint, 0.62),
      0.45,
    );
    const hu = (d - (boxOnly ? -0.1 : 0.12) * s * s) * s;
    c.poly(
      [
        [hu - 0.035, W + 0.0025, sh.belt - 2],
        [hu + 0.035, W + 0.0025, sh.belt - 2],
        [hu + 0.035, W + 0.0025, sh.belt - 1.3],
        [hu - 0.035, W + 0.0025, sh.belt - 1.3],
      ],
      tint(paint, 0.45),
    );
  }
  // Kabine mit Front-/Heckscheibe, Seitenscheiben mit Säulen und Reflexen
  const cw = W - 0.035;
  if (!boxOnly) {
    const cab = mir(sh.cabin);
    const nc = cab.length;
    extrudeU(c, cab, -cw, cw, style.roof ?? paint, {
      seg: (i) =>
        i === idx(sh.screen, nc) ? glassFront : i === idx(sh.rear, nc) ? glassSide : undefined,
      side: lit(paint, facetLight([0, 1, 0])),
    });
  }
  // Reflexe auf der sichtbaren Frontscheibe
  {
    const prof = boxOnly ? sh.body : sh.cabin;
    const a = heading === 'f' ? prof[sh.screen] : undefined;
    const b = prof[sh.screen + 1];
    const half = boxOnly ? W : cw;
    if (a && b)
      for (const [t0, t1] of [
        [0.16, 0.3],
        [0.4, 0.47],
      ] as const) {
        const P = (tv: number, ts: number): Vec3 => [
          (a[0] + (b[0] - a[0]) * ts) * s,
          -half + 2 * half * tv,
          a[1] + (b[1] - a[1]) * ts,
        ];
        c.poly([P(t0, 0.1), P(t1, 0.1), P(t1 - 0.1, 0.9), P(t0 - 0.1, 0.9)], C.white, 0.3);
      }
  }
  const winV = (boxOnly ? W : cw) + 0.0015;
  const win = sh.windows.map(([u, z]) => [u * s, z] as P2u);
  c.poly(
    win.map(([u, z]) => [u, winV, z] as Vec3),
    glassSide,
  );
  carGlint(
    c,
    winV + 0.0005,
    s > 0 ? win : [win[1], win[0], win[3], win[2]].filter((x): x is P2u => !!x),
  );
  for (const pu of sh.pillars)
    c.poly(
      [
        [pu * s - 0.022, winV + 0.001, (win[0]?.[1] ?? 9) - 0.2],
        [pu * s + 0.022, winV + 0.001, (win[0]?.[1] ?? 9) - 0.2],
        [pu * s + 0.022, winV + 0.001, (win[2]?.[1] ?? 14) + 0.2],
        [pu * s - 0.022, winV + 0.001, (win[2]?.[1] ?? 14) + 0.2],
      ],
      lit(style.roof && !boxOnly ? paint : paint, facetLight([0, 1, 0])),
    );
  // Außenspiegel an der A-Säule
  const mu = (boxOnly ? 0.44 : (sh.cabin[1]?.[0] ?? 0.3) - 0.03) * s;
  c.box(mu - 0.03, W, sh.belt + 0.6, 0.06, 0.06, 1.8, paint);
  // Front bzw. Heck auf der sichtbaren +u-Seite
  const eU = L + 0.002;
  const endZ = heading === 'f' ? sh.noseZ : sh.tailZ;
  const F = (v0: number, v1: number, z0: number, z1: number, col: string, op = 1) =>
    c.poly(
      [
        [eU, v0, z0],
        [eU, v1, z0],
        [eU, v1, z1],
        [eU, v0, z1],
      ],
      col,
      op,
    );
  F(-W + 0.01, W - 0.01, bottom, bottom + 1.3, shade(C.rubber, 1.6));
  F(-0.07, 0.07, bottom + 0.25, bottom + 1.15, C.white);
  const lz = Math.min(endZ - 1.6, heading === 'f' ? 5 : 5.4);
  if (heading === 'f') {
    F(-0.13, 0.13, bottom + 1.6, lz + 0.4, shade(C.ink, 1.3));
    for (const v of [-W + 0.03, W - 0.11]) {
      F(v - 0.005, v + 0.085, lz - 0.3, lz + 1.5, C.galvanized);
      F(v, v + 0.08, lz, lz + 1.2, C.led);
    }
  } else {
    for (const v of [-W + 0.03, W - 0.12]) {
      F(v, v + 0.09, lz, lz + 1.4, C.signalRed);
      F(v + 0.01, v + 0.04, lz + 0.2, lz + 0.8, tint(C.signalRed, 0.5));
    }
    if (style.kind === 'van') {
      F(-0.004, 0.004, bottom + 1.4, endZ - 0.6, shade(paint, 0.6));
      for (const [v0, v1] of [
        [-W + 0.04, -0.02],
        [0.02, W - 0.04],
      ] as const) {
        F(v0, v1, 12.4, 17.6, glassSide);
        F(v0 + 0.03, v0 + 0.07, 12.8, 17.2, C.white, 0.25);
      }
    }
  }
  if (style.sign) {
    const top = Math.max(...sh.cabin.map(([, z]) => z));
    c.bevel(-0.07, -0.08, top, 0.14, 0.16, 3, C.postYellow, { b: 0.8, edge: 0.3 });
    c.poly(
      [
        [-0.07, 0.081, top + 1],
        [0.07, 0.081, top + 1],
        [0.07, 0.081, top + 1.9],
        [-0.07, 0.081, top + 1.9],
      ],
      C.ink,
    );
  }
  if (style.rails) {
    const top = Math.max(...sh.cabin.map(([, z]) => z));
    for (const v of [-cw + 0.03, cw - 0.03])
      strut(c, [-0.42 * s, v, top + 0.8], [0.06 * s, v, top + 0.8], C.castIron, 0.8);
  }
  // Räder der nahen Seite
  for (const u of sh.wheels) wheel(c, u * s, W + 0.012, sh.r);
  return c.svg();
}

/** Fahrrad in der Ebene v, Front nach +u·s: Räder mit Felge und Speichen, Rahmen, Schutzbleche, Sattel, Lenker. */
interface BicycleLook {
  frame: string;
  /** Tiefer Einstieg (Hollandrad) statt Diamantrahmen. */
  low?: boolean;
  /** Korb vorn (Weidenfarbe) bzw. Kiste auf dem Gepäckträger. */
  basket?: boolean;
  crate?: string;
  /** Lastenrad: Kiste zwischen Lenker und Vorderrad. */
  cargo?: string;
}

function bicycle(c: IsoCanvas, cu: number, v: number, s: number, b: BicycleLook) {
  const r = 0.12;
  const wz = r * Z_PER_TILE;
  const U = (u: number) => cu + u * s;
  const P = (u: number, z: number, dv = 0): Vec3 => [U(u), v + dv, z];
  const front = b.cargo ? 0.34 : 0.22;
  const wheelAt = (u: number) => {
    const ring = ringPts('v', U(u), v, wz, r, 20);
    polyline(c, [...ring, ring[0] ?? ring[1] ?? [0, 0, 0]], C.rubber, 1.3);
    const rim = ringPts('v', U(u), v + 0.001, wz, r * 0.82, 16);
    polyline(c, [...rim, rim[0] ?? [0, 0, 0]], C.galvanized, 0.45);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI + 0.3;
      strut(
        c,
        P(u + Math.cos(a) * r * 0.8, wz + Math.sin(a) * wz * 0.8, 0.002),
        P(u - Math.cos(a) * r * 0.8, wz - Math.sin(a) * wz * 0.8, 0.002),
        C.galvanized,
        0.3,
        0.8,
      );
    }
    c.disc(U(u), v + 0.003, wz, 0.012, C.galvanized);
  };
  wheelAt(-0.22);
  wheelAt(front);
  const bb = P(0, wz - 0.3);
  const seat = P(-0.07, 10);
  const head0 = P(0.16, 8.2);
  const head1 = P(0.15, 10.4);
  const fr = b.frame;
  // Schutzbleche als Bögen über den Rädern
  for (const u of [-0.22, front]) {
    const arc: Vec3[] = [];
    for (let k = 0; k <= 6; k++) {
      const a = Math.PI * (0.15 + (k / 6) * 0.7);
      arc.push(
        P(u + Math.cos(a) * r * 1.1 * (u > 0 ? -1 : 1), wz + Math.sin(a) * wz * 1.1, -0.003),
      );
    }
    polyline(c, arc, shade(fr, 0.85), 0.8);
  }
  strut(c, P(-0.22, wz), bb, fr, 1.2);
  strut(c, P(-0.22, wz), seat, fr, 1);
  strut(c, bb, seat, fr, 1.3);
  if (b.low) strut(c, P(0.03, wz + 0.4), head0, fr, 1.4);
  else strut(c, seat, head1, fr, 1.2);
  strut(c, bb, head0, fr, 1.4);
  strut(c, head0, head1, shade(fr, 0.8), 1.5);
  strut(c, head0, P(front, wz), shade(fr, 0.9), 1.1);
  // Kettenschutz, Sattel, Lenker
  c.poly(
    [P(-0.2, wz + 0.4, 0.004), bb, P(0.03, wz + 1.4, 0.004), P(-0.18, wz + 1.6, 0.004)],
    shade(C.ink, 1.2),
  );
  c.poly(
    [P(-0.12, 10.2, -0.02), P(-0.02, 10.6, -0.02), P(-0.02, 11.4, 0.02), P(-0.12, 11, 0.02)],
    C.ink,
  );
  strut(c, head1, P(0.13, 12), C.castIron, 1.1);
  strut(c, P(0.12, 12, -0.08), P(0.12, 12, 0.08), C.rubber, 1.2);
  if (b.basket) {
    c.box(U(front > 0.3 ? 0.2 : 0.18) - 0.06, v - 0.06, 9.6, 0.12, 0.12, 3.6, C.oakLight);
    c.flat(U(0.18) - 0.05, v - 0.05, 13.21, 0.1, 0.1, shade(C.oakLight, 0.7));
  }
  if (b.crate) {
    strut(c, seat, P(-0.24, 9.6), C.castIron, 0.8);
    c.bevel(U(-0.24) - 0.07, v - 0.07, 9.6, 0.14, 0.14, 4, b.crate, { b: 0.6 });
  }
  if (b.cargo) c.bevel(U(0.2) - 0.08, v - 0.1, 5, 0.16, 0.2, 6, b.cargo, { b: 0.8 });
  c.raw(
    (() => {
      const [x, y] = c.p(P(0.17, 9.6, 0.01));
      const [x2, y2] = c.p(P(-0.27, 8.6, 0.01));
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="0.8" fill="${C.led}"/><circle cx="${x2.toFixed(2)}" cy="${y2.toFixed(2)}" r="0.7" fill="${C.signalRed}"/>`;
    })(),
  );
}

/** Radfahrer entlang u (Blockfigur wie die Passanten): Fahrrad, Beine an den Pedalen, Helm; „f“ = nach +u. */
interface BikeStyle {
  frame: string;
  jacket: string;
  helmet: string;
  pants: string;
  bag?: string;
  low?: boolean;
  basket?: boolean;
}
const BIKES: BikeStyle[] = [
  { frame: C.cobalt, jacket: C.carYellow, helmet: C.white, pants: C.ink, basket: true, low: true },
  { frame: C.carRed, jacket: C.carMint, helmet: C.ink, pants: C.carNavy, bag: C.orange },
];

function bike(style: BikeStyle, heading: 'f' | 'b'): string {
  const c = canvasOf(CITY_SPRITE.car);
  const s = heading === 'f' ? 1 : -1;
  const P = (u: number, z: number, dv = 0): Vec3 => [u * s, dv, z];
  c.shadow(-0.36, -0.07, 0, 0.72, 0.14, 0.28, 1.2);
  // fernes Bein und Arm zuerst
  strut(c, P(-0.06, 10.6, -0.04), P(-0.02, 6.4, -0.04), shade(style.pants, 0.8), 2.2);
  strut(c, P(-0.02, 6.4, -0.04), P(0.02, 2.6, -0.04), shade(style.pants, 0.8), 2);
  bicycle(c, 0, 0, s, { frame: style.frame, low: style.low, basket: style.basket });
  // Rumpf nach vorn geneigt, Tasche, Kopf mit Helm
  const torso: P2u[] = [
    [-0.13, 10],
    [-0.01, 10],
    [0.05, 17.6],
    [-0.06, 17.6],
  ];
  const t = torso.map(([u, z]) => [u * s, z] as P2u);
  if (style.bag && s > 0) c.bevel(-0.17, -0.065, 11.5, 0.08, 0.13, 5, style.bag, { b: 0.6 });
  extrudeU(c, s > 0 ? t : t.reverse(), -0.065, 0.065, style.jacket);
  if (style.bag && s < 0) c.bevel(0.09, -0.065, 11.5, 0.08, 0.13, 5, style.bag, { b: 0.6 });
  strut(c, P(-0.06, 10.6, 0.04), P(0.05, 8.6, 0.04), style.pants, 2.4);
  strut(c, P(0.05, 8.6, 0.04), P(0.03, 4.4, 0.04), style.pants, 2.1);
  c.box(0.03 * s - 0.03, 0.025, 3.6, 0.06, 0.04, 1.2, C.ink);
  strut(c, P(0.03, 16.6, 0.05), P(0.12, 12.2, 0.07), style.jacket, 1.6);
  c.bevel(-0.065, -0.065, 17.6, 0.13, 0.13, 5.4, C.skin, { b: 0.6 });
  c.dome(-0.01 * s, 0, 22.4, 0.092, 4, style.helmet);
  return c.svg();
}

/** Taube: grau mit grün schimmerndem Hals; stehend, pickend, fliegend (Flügel oben/unten). */
function pigeon(pose: 'stand' | 'peck' | 'fly0' | 'fly1'): string {
  const c = new IsoCanvas(20, 18, 10, 13);
  const grey = '#8d93a6';
  if (pose === 'stand' || pose === 'peck') c.shadowDisc(0, 0, 0, 0.06, 0.2, 0.8);
  const z = pose === 'fly0' || pose === 'fly1' ? 3 : 0;
  c.box(-0.06, -0.025, z + 1.2, 0.12, 0.05, 2.6, grey);
  c.box(-0.11, -0.015, z + 2, 0.05, 0.03, 1, shade(grey, 0.75));
  const head: Vec3 = pose === 'peck' ? [0.08, 0, z + 1.4] : [0.065, 0, z + 4.2];
  c.box(head[0] - 0.025, -0.02, head[2], 0.045, 0.04, 2, '#5f7a7a');
  c.box(head[0] + 0.02, -0.006, head[2] + 0.6, 0.02, 0.012, 0.6, '#d9b38c');
  if (pose === 'stand' || pose === 'peck') {
    c.box(-0.01, -0.012, 0, 0.012, 0.012, 1.2, '#d97a6a');
    c.box(0.02, -0.012, 0, 0.012, 0.012, 1.2, '#d97a6a');
    return c.svg();
  }
  const [wx, wy] = c.p([0, 0, z + 3.6]);
  const up = pose === 'fly0';
  const n = (v: number) => v.toFixed(2);
  c.raw(
    `<path d="M${n(wx - 1)},${n(wy)} Q${n(wx - 4)},${n(wy + (up ? -5 : 3))} ${n(wx - 8)},${n(wy + (up ? -6 : 4))} L${n(wx)},${n(wy + 1)} Z" fill="${shade(grey, 0.9)}"/>` +
      `<path d="M${n(wx + 1)},${n(wy)} Q${n(wx + 4)},${n(wy + (up ? -5 : 3))} ${n(wx + 8)},${n(wy + (up ? -6 : 4))} L${n(wx)},${n(wy + 1)} Z" fill="${tint(grey, 0.15)}"/>`,
  );
  return c.svg();
}

/**
 * Ausflugsdampfer entlang u: weißer Rumpf mit Sprung zum Bug, roter Wasserpass, blaues Band mit Bullaugen,
 * Salon mit Fensterband, offenes Sonnendeck mit Reling und Bänken, Steuerhaus, Mast mit Wimpel, Rettungsringe;
 * Bugwelle und Kielwasser.
 */
function boat(heading: 'f' | 'b'): string {
  const c = canvasOf(CITY_SPRITE.boat);
  const s = heading === 'f' ? 1 : -1;
  const U = (u: number) => u * s;
  c.glowFlat(-1.35, -0.52, 0, 2.7, 1.04, C.white, 0.28, 2.5);
  // Bugwelle und Kielwasser als helle Keile
  const wake = (pts: readonly (readonly [number, number])[], op: number) =>
    c.poly(
      pts.map(([u, v]) => [U(u), v, 0.2] as Vec3),
      C.white,
      op,
    );
  wake(
    [
      [1.22, 0],
      [1.0, 0.5],
      [0.85, 0.44],
    ],
    0.55,
  );
  wake(
    [
      [-1.15, 0.3],
      [-1.5, 0.52],
      [-1.52, 0.4],
      [-1.15, 0.12],
    ],
    0.4,
  );
  const hull: [number, number][] = [
    [-1.15, -0.4],
    [0.9, -0.4],
    [1.25, 0],
    [0.9, 0.4],
    [-1.15, 0.4],
    [-1.22, 0.2],
    [-1.22, -0.2],
  ].map(([u, v]) => [U(u ?? 0), v ?? 0] as [number, number]);
  const ordered = s > 0 ? hull : hull.slice().reverse();
  prism(c, ordered, 0, 2.2, C.carRed);
  prism(c, ordered, 2.2, 9, C.white);
  // blaues Band mit Bullaugen, Scheuerleiste
  c.poly(
    [
      [U(-1.15), 0.401, 3.6],
      [U(0.9), 0.401, 3.6],
      [U(0.9), 0.401, 5.6],
      [U(-1.15), 0.401, 5.6],
    ],
    C.cobalt,
  );
  for (let k = 0; k < 9; k++)
    c.poly(ringPts('v', U(-0.95 + k * 0.2), 0.402, 4.6, 0.028, 8), C.paneDark);
  c.poly(
    [
      [U(-1.15), 0.402, 8.4],
      [U(0.9), 0.402, 8.4],
      [U(0.9), 0.402, 9],
      [U(-1.15), 0.402, 9],
    ],
    tint(C.white, 0.5),
  );
  // Deck (Planken) und Salon mit Fensterband
  c.poly(
    ordered.map(([u, v]) => [u * 0.94, v * 0.9, 9.02] as Vec3),
    C.oakLight,
  );
  const a0 = s > 0 ? -0.95 : -0.55;
  const a1 = s > 0 ? 0.55 : 0.95;
  c.bevel(a0, -0.3, 9, a1 - a0, 0.6, 9.5, C.white, { b: 0.8 });
  c.poly(
    [
      [a0 + 0.06, 0.301, 11.2],
      [a1 - 0.06, 0.301, 11.2],
      [a1 - 0.06, 0.301, 16.4],
      [a0 + 0.06, 0.301, 16.4],
    ],
    C.paneDark,
  );
  for (let k = 1; k < 7; k++) {
    const u = a0 + 0.06 + ((a1 - a0 - 0.12) * k) / 7;
    c.poly(
      [
        [u - 0.012, 0.302, 11.2],
        [u + 0.012, 0.302, 11.2],
        [u + 0.012, 0.302, 16.4],
        [u - 0.012, 0.302, 16.4],
      ],
      C.white,
    );
  }
  for (const t of [0.15, 0.55])
    c.poly(
      [
        [a0 + (a1 - a0) * t, 0.3025, 11.6],
        [a0 + (a1 - a0) * (t + 0.08), 0.3025, 11.6],
        [a0 + (a1 - a0) * (t + 0.11), 0.3025, 16],
        [a0 + (a1 - a0) * (t + 0.03), 0.3025, 16],
      ],
      C.white,
      0.22,
    );
  const ue = a1 + 0.001;
  c.poly(
    [
      [ue, -0.24, 11.2],
      [ue, 0.24, 11.2],
      [ue, 0.24, 16.4],
      [ue, -0.24, 16.4],
    ],
    shade(C.paneDark, 0.9),
  );
  // Sonnendeck: Planken, blaue Bänke, Reling
  c.flat(a0, -0.3, 18.51, a1 - a0, 0.6, C.oakLight);
  for (let k = 0; k < 4; k++) {
    const u = a0 + 0.18 + k * ((a1 - a0 - 0.36) / 3);
    c.bevel(u - 0.06, -0.18, 18.5, 0.12, 0.36, 1.6, C.cobalt, { b: 0.5 });
  }
  // Steuerhaus am Bug, Mast mit Wimpel und Positionslicht
  const wh = s > 0 ? a1 - 0.34 : a0 + 0.04;
  c.bevel(wh, -0.2, 18.5, 0.3, 0.4, 7, C.white, { b: 0.8 });
  c.poly(
    [
      [wh + 0.3 + 0.001, -0.16, 21],
      [wh + 0.3 + 0.001, 0.16, 21],
      [wh + 0.3 + 0.001, 0.16, 24.4],
      [wh + 0.3 + 0.001, -0.16, 24.4],
    ],
    C.paneDark,
  );
  c.bevel(wh - 0.03, -0.23, 25.5, 0.36, 0.46, 1.2, C.cobalt, { b: 0.4 });
  const mu = U(-0.6);
  c.cylinder(mu, 0, 18.5, 0.014, 14, C.white);
  c.poly(
    [
      [mu, 0, 32],
      [mu - 0.22 * s, 0, 30.6],
      [mu, 0, 29.2],
    ],
    C.cobalt,
  );
  c.disc(mu, 0, 32.6, 0.02, C.signalYellow);
  const rail = (pts: Vec3[]) => polyline(c, pts, C.white, 0.7);
  rail([
    [a0, 0.3, 21.6],
    [a1, 0.3, 21.6],
    [a1, -0.3, 21.6],
  ]);
  for (let k = 0; k <= 10; k++)
    strut(
      c,
      [a0 + ((a1 - a0) * k) / 10, 0.3, 18.5],
      [a0 + ((a1 - a0) * k) / 10, 0.3, 21.6],
      C.white,
      0.5,
    );
  for (let k = 0; k <= 4; k++)
    strut(c, [a1, -0.3 + k * 0.15, 18.5], [a1, -0.3 + k * 0.15, 21.6], C.white, 0.5);
  // Rettungsringe an der Bordwand des Salons
  for (const u of [a0 + 0.02, a1 - 0.12])
    if (u > a0) {
      c.poly(ringPts('v', u + 0.05, 0.303, 10.6 + 3, 0.045, 10), C.orange);
      c.poly(ringPts('v', u + 0.05, 0.304, 10.6 + 3, 0.022, 8), C.paneDark);
    }
  return c.svg();
}

// ---------------------------------------------------------------------------------------------
// Läden und Leben im Freien: Kiosk, Marktstände, Imbisswagen, Spielplatz, Brunnen, Haltestelle …
// ---------------------------------------------------------------------------------------------
const wide = () => canvasOf(CITY_SPRITE.wide);
const small = () => canvasOf(CITY_SPRITE.prop);

/** Gestreiftes Schrägdach (Marktstand, Kiosk): Streifen entlang u, Neigung nach +v. */
function stripedRoof(
  c: IsoCanvas,
  u0: number,
  v0: number,
  w: number,
  d: number,
  zBack: number,
  zFront: number,
  a: string,
  b: string,
  n = 6,
) {
  for (let k = 0; k < n; k++) {
    const x0 = u0 + (k * w) / n;
    const x1 = x0 + w / n;
    c.poly(
      [
        [x0, v0, zBack],
        [x1, v0, zBack],
        [x1, v0 + d, zFront],
        [x0, v0 + d, zFront],
      ],
      k % 2 ? b : a,
    );
    c.wallV(x0, v0 + d, zFront - 3, x1 - x0, 3, shade(k % 2 ? b : a, SHADE.left));
  }
}

/** Zeitungs- und Getränkekiosk im Park: grüner Pavillon mit Fensterklappe und Markise. */
function kiosk(): string {
  const c = wide();
  const g = '#2f5a4a';
  c.shadow(-0.6, -0.5, 0, 1.2, 1.1, 0.26, 1.6);
  c.bevel(-0.55, -0.45, 0, 1.1, 0.9, 30, g, { b: 1.2 });
  c.wallV(-0.45, 0.451, 12, 0.9, 12, '#eadfc8');
  for (let k = 0; k < 5; k++)
    c.wallV(
      -0.42 + k * 0.17,
      0.452,
      14,
      0.12,
      8,
      [C.red, C.gold, C.cobalt, C.sakura, C.white][k] ?? C.red,
    );
  c.box(-0.5, 0.42, 10, 1, 0.12, 2, C.oakLight);
  c.wallU(0.551, -0.35, 4, 0.5, 20, shade(C.cream, SHADE.right));
  stripedRoof(c, -0.62, -0.5, 1.24, 1.15, 34, 29, C.matchaDeep, C.white, 7);
  c.dome(0, 0, 34, 0.2, 8, g);
  c.cylinder(0, 0, 41, 0.02, 6, C.gold);
  return c.svg();
}

/** Marktstand: Tisch mit Ware, Stangen und gestreiftes Dach (vier Farben/Waren). */
function stall(variant: number): string {
  const c = wide();
  const [a, b] = (
    [
      [C.red, C.white],
      [C.cobalt, C.white],
      [C.matchaDeep, C.cream],
      [C.orange, C.cream],
    ] as const
  )[variant] ?? [C.red, C.white];
  const wares = [
    [C.red, C.orange, C.matcha, C.gold],
    [C.sakura, C.white, C.cobaltLight, C.cream],
    [C.matcha, C.matchaDeep, C.sage, C.gold],
    [C.coffee, C.oakLight, C.cream, C.sakura],
  ][variant] ?? [C.red];
  c.shadow(-0.65, -0.35, 0, 1.3, 0.75, 0.24);
  for (const [u, v] of [
    [-0.6, -0.3],
    [0.58, -0.3],
    [-0.6, 0.36],
    [0.58, 0.36],
  ] as const)
    c.box(u, v, 0, 0.03, 0.03, 30, C.stainlessDark);
  c.box(-0.55, -0.2, 0, 1.1, 0.5, 12, C.oak);
  c.wallV(-0.55, 0.301, 2, 1.1, 8, shade(a, 0.95));
  for (let k = 0; k < 6; k++) {
    const col = wares[k % wares.length] ?? C.red;
    c.box(-0.5 + k * 0.17, -0.15, 12, 0.14, 0.4, 2.5, shade(C.woodDark, 1.1));
    for (let m = 0; m < 3; m++) c.dome(-0.43 + k * 0.17, -0.08 + m * 0.13, 14.5, 0.045, 2.6, col);
  }
  stripedRoof(c, -0.66, -0.36, 1.32, 0.82, 32, 27, a, b, 6);
  return c.svg();
}

/** Imbisswagen: Kastenwagen mit Verkaufsklappe, Markise und Theke (zwei Lackfarben). */
function foodtruck(variant: number): string {
  const c = wide();
  const body = variant ? C.cobalt : C.gold;
  c.shadow(-0.95, -0.38, 0, 1.9, 0.76, 0.3, 1.6);
  for (const u of [-0.55, 0.55]) wheel(c, u, 0.34);
  c.bevel(-0.95, -0.34, 3, 1.9, 0.68, 24, body, { b: 2, edge: 0.3 });
  c.bevel(0.55, -0.3, 27, 0.4, 0.6, 3, shade(body, 0.9), { b: 1 });
  c.wallV(-0.6, 0.341, 10, 1, 11, '#2b2f3f');
  c.wallV(-0.55, 0.342, 12, 0.9, 7, '#eadfc8');
  for (let k = 0; k < 4; k++)
    c.wallV(-0.5 + k * 0.22, 0.343, 13, 0.12, 4, [C.red, C.matcha, C.white, C.orange][k] ?? C.red);
  c.box(-0.62, 0.34, 10, 1.04, 0.12, 1.4, C.stainless);
  c.poly(
    [
      [-0.65, 0.34, 22],
      [0.45, 0.34, 22],
      [0.45, 0.62, 18],
      [-0.65, 0.62, 18],
    ],
    variant ? C.white : C.red,
  );
  c.wallU(0.951, -0.25, 12, 0.5, 9, shade(C.glass, 0.85));
  return c.svg();
}

/** Spielplatz: Schaukel und Rutsche auf Sand. */
function playground(): string {
  const c = wide();
  c.shadow(-0.9, -0.5, 0, 1.8, 1, 0.18, 2);
  // Schaukel: Gestell entlang u, zwei Sitze
  for (const u of [-0.85, -0.05]) {
    c.box(u, -0.25, 0, 0.04, 0.04, 30, C.red);
    c.box(u, 0.25, 0, 0.04, 0.04, 30, C.red);
  }
  c.box(-0.85, -0.25, 30, 0.84, 0.04, 2, C.red);
  for (const u of [-0.65, -0.3]) {
    c.box(u, -0.24, 10, 0.006, 0.006, 20, C.ink);
    c.box(u + 0.1, -0.24, 10, 0.006, 0.006, 20, C.ink);
    c.box(u - 0.01, -0.27, 9, 0.13, 0.08, 1.5, C.gold);
  }
  // Rutsche: Turm mit Dach, Rutschbahn nach +v
  c.box(0.3, -0.3, 0, 0.4, 0.4, 18, C.oak);
  c.box(0.28, -0.32, 18, 0.44, 0.44, 2, C.oakLight);
  c.poly(
    [
      [0.32, -0.32, 34],
      [0.72, -0.32, 34],
      [0.72, 0.12, 26],
      [0.32, 0.12, 26],
    ],
    C.cobalt,
  );
  c.poly(
    [
      [0.4, 0.1, 18],
      [0.62, 0.1, 18],
      [0.62, 0.6, 2],
      [0.4, 0.6, 2],
    ],
    C.gold,
  );
  c.box(0.4, 0.1, 18, 0.02, 0.5, 2, shade(C.gold, 0.8));
  return c.svg();
}

/** Brunnen: runde Steinschale mit Wasser und Fontäne. */
function fountain(): string {
  const c = wide();
  c.shadowDisc(0, 0, 0, 0.75, 0.2, 2);
  c.cylinder(0, 0, 0, 0.7, 5, C.stone, tint(C.stone, 0.3));
  c.disc(0, 0, 5, 0.62, '#5fa8d8');
  c.disc(-0.15, -0.1, 5.1, 0.3, '#8cc6ea');
  c.cylinder(0, 0, 5, 0.12, 10, C.stone, tint(C.stone, 0.3));
  c.disc(0, 0, 15, 0.1, '#8cc6ea');
  c.group(0.7, () => c.frustum(0, 0, 15, 0.04, 0.16, 14, C.ice, C.white));
  return c.svg();
}

/** Eiswagen mit Schirm. */
function icecart(): string {
  const c = small();
  c.shadow(-0.3, -0.18, 0, 0.6, 0.36, 0.24);
  wheel(c, -0.2, 0.16);
  c.bevel(-0.3, -0.16, 3, 0.6, 0.32, 13, C.white, { b: 1.4 });
  c.wallV(-0.28, 0.161, 6, 0.56, 4, C.sakura);
  for (let k = 0; k < 3; k++)
    c.disc(-0.15 + k * 0.15, 0, 16.2, 0.05, [C.sakura, C.matchaFoam, C.cream][k] ?? C.cream);
  c.cylinder(0.22, 0, 16, 0.012, 22, C.white);
  const [cx, cy] = c.p([0.22, 0, 38]);
  c.raw(
    `<path d="M${(cx - 20).toFixed(1)},${(cy + 3).toFixed(1)} Q${cx.toFixed(1)},${(cy - 12).toFixed(1)} ${(cx + 20).toFixed(1)},${(cy + 3).toFixed(1)} Z" fill="${C.sakura}"/><path d="M${(cx - 20).toFixed(1)},${(cy + 3).toFixed(1)} Q${cx.toFixed(1)},${(cy - 4).toFixed(1)} ${(cx + 20).toFixed(1)},${(cy + 3).toFixed(1)} Z" fill="${shade(C.sakura, 0.85)}"/>`,
  );
  return c.svg();
}

/** Fußballtor (Rahmen und Netz), entlang u. */
function goal(): string {
  const c = wide();
  c.shadow(-0.8, -0.1, 0, 1.6, 0.4, 0.15);
  for (const u of [-0.8, 0.77]) c.box(u, 0, 0, 0.03, 0.03, 24, C.white);
  c.box(-0.8, 0, 24, 1.6, 0.03, 2, C.white);
  c.group(0.35, () => {
    c.poly(
      [
        [-0.78, 0.02, 24],
        [0.78, 0.02, 24],
        [0.78, -0.35, 0],
        [-0.78, -0.35, 0],
      ],
      C.white,
    );
  });
  return c.svg();
}

/** Bushaltestelle: Glasdach, Rückwand mit Werbung, Bank und Haltestellenschild (gelbes H-Feld ohne Schrift). */
function busstop(): string {
  const c = wide();
  c.shadow(-0.75, -0.2, 0, 1.5, 0.5, 0.22);
  c.box(-0.72, -0.15, 0, 0.03, 0.03, 32, C.stainlessDark);
  c.box(0.69, -0.15, 0, 0.03, 0.03, 32, C.stainlessDark);
  c.group(0.45, () => c.wallV(-0.7, -0.13, 2, 1.4, 28, C.glass));
  c.wallV(0.1, -0.12, 6, 0.5, 22, C.cobalt);
  c.wallV(0.14, -0.119, 10, 0.42, 14, C.sakura);
  c.box(-0.6, -0.1, 8, 0.6, 0.18, 1.6, C.oakLight);
  c.box(-0.75, -0.2, 32, 1.5, 0.5, 1.6, C.stainless, { top: tint(C.glass, 0.4) });
  c.cylinder(-0.95, 0.15, 0, 0.02, 38, C.stainlessDark);
  c.cylinder(-0.95, 0.15, 36, 0.09, 6, C.gold, C.gold);
  c.disc(-0.95, 0.15, 42, 0.06, C.matchaDeep);
  return c.svg();
}

/** Gelber Briefkasten am Pfosten. */
function mailbox(): string {
  const c = small();
  c.shadowDisc(0, 0, 0, 0.1, 0.22);
  c.cylinder(0, 0, 0, 0.025, 12, C.ink);
  c.bevel(-0.1, -0.08, 12, 0.2, 0.16, 16, C.gold, { b: 1.6 });
  c.wallV(-0.06, 0.081, 22, 0.12, 1.2, C.ink);
  c.wallV(-0.05, 0.081, 15, 0.1, 3, shade(C.gold, 0.8));
  return c.svg();
}

/** Zwei E-Roller am Ständer. */
function scooters(): string {
  const c = small();
  for (const [v, col] of [
    [-0.12, C.matcha],
    [0.12, C.ink],
  ] as const) {
    c.shadow(-0.25, v - 0.03, 0, 0.5, 0.06, 0.2);
    c.box(-0.22, v - 0.02, 1, 0.42, 0.05, 1.6, col);
    c.box(0.18, v - 0.01, 2.6, 0.02, 0.02, 20, C.stainless);
    c.box(0.18, v - 0.08, 22, 0.02, 0.16, 1, C.ink);
    for (const u of [-0.2, 0.18]) c.cylinder(u, v, 0, 0.04, 1, C.ink);
  }
  return c.svg();
}

/** Imbiss-Tisch mit zwei Stühlen vor dem Laden (zwei Farben). */
function bistro(variant: number): string {
  const c = small();
  const chair = variant ? C.red : C.matchaDeep;
  c.shadowDisc(0, 0, 0, 0.32, 0.18);
  for (const u of [-0.26, 0.2]) {
    c.box(u, -0.06, 0, 0.12, 0.12, 6, C.stainless);
    c.bevel(u - 0.01, -0.07, 6, 0.14, 0.14, 1.6, chair, { b: 0.5 });
    c.box(u + (u < 0 ? -0.01 : 0.11), -0.07, 7.6, 0.03, 0.14, 7, chair);
  }
  c.cylinder(0, 0, 0, 0.012, 11, C.stainless);
  c.cylinder(0, 0, 11, 0.13, 1, C.white, C.white);
  c.cylinder(-0.03, 0.02, 12, 0.025, 3, C.cup, C.matchaFoam);
  return c.svg();
}

/** Straßen-Objekte und Fahrzeuge (`city`-Atlas). */
export function citySprites(): SpriteDef[] {
  const out: SpriteDef[] = [
    { name: 'linden', svg: linden(false) },
    { name: 'lindenSmall', svg: linden(true) },
    { name: 'lamp', svg: lamp() },
    { name: 'bench-u', svg: bench('a') },
    { name: 'bench-v', svg: bench('b') },
    { name: 'bikes', svg: bikes() },
    { name: 'litfass', svg: litfass() },
    { name: 'bin', svg: bin() },
    { name: 'bollard', svg: bollard() },
    { name: 'planter', svg: planter() },
    { name: 'cafeSign', svg: cafeSign() },
    { name: 'pedLight-stop', svg: pedLight(false) },
    { name: 'pedLight-go', svg: pedLight(true) },
    ...(['u', 'v'] as const).flatMap((axis) =>
      (['red', 'redYellow', 'green', 'yellow'] as const).map((st) => ({
        name: `tlight-${axis}-${st}`,
        svg: trafficLight(axis, st),
      })),
    ),
    { name: 'railing', svg: railing() },
    { name: 'boat-f', svg: boat('f') },
    { name: 'boat-b', svg: boat('b') },
    { name: 'kiosk', svg: kiosk() },
    ...[0, 1, 2, 3].map((v) => ({ name: `stall-${String(v)}`, svg: stall(v) })),
    { name: 'foodtruck-0', svg: foodtruck(0) },
    { name: 'foodtruck-1', svg: foodtruck(1) },
    { name: 'playground', svg: playground() },
    { name: 'fountain', svg: fountain() },
    { name: 'icecart', svg: icecart() },
    { name: 'goal', svg: goal() },
    { name: 'busstop', svg: busstop() },
    { name: 'mailbox', svg: mailbox() },
    { name: 'scooters', svg: scooters() },
    { name: 'bistro-0', svg: bistro(0) },
    { name: 'bistro-1', svg: bistro(1) },
  ];
  CARS.forEach((s, i) => {
    out.push({ name: `car-${String(i)}-f`, svg: car(s, 'f') });
    out.push({ name: `car-${String(i)}-b`, svg: car(s, 'b') });
  });
  // Weitere Lacke nur für parkende Autos (stehen immer mit der Front nach +u, quer gespiegelt)
  CAR_PAINTS.forEach((list, t) =>
    list
      .slice(0, PARKED_CAR_PAINTS)
      .forEach((s, k) =>
        out.push({ name: `car-${String(t)}-p${String(k + 1)}-f`, svg: car(s, 'f') }),
      ),
  );
  // Radfahrer: Typen nach den Autos (`STREET_LIFE.bikeTypes`)
  BIKES.forEach((s, i) => {
    const t = CARS.length + i;
    out.push({ name: `car-${String(t)}-f`, svg: bike(s, 'f') });
    out.push({ name: `car-${String(t)}-b`, svg: bike(s, 'b') });
  });
  for (const pose of ['stand', 'peck', 'fly0', 'fly1'] as const)
    out.push({ name: `pigeon-${pose}`, svg: pigeon(pose) });
  return out;
}
