/**
 * Stadtviertel als Code (selbst gezeichnet, CC0, docs/ASSETS.md): Fassaden-Module der Altbauten je Standort-Palette
 * (Themen-Atlas) und Straßen-Objekte für alle Standorte (Atlas `city`: Linden, Laternen, Litfaßsäule, Fahrräder,
 * Bänke, Ampeln, Autos, Ausflugsdampfer). Stil wie UI_STYLE § 4: Flat-Shaded-Iso, Lokalfarben, Kontaktschatten.
 * Grundriss und Farben: `src/data/city.ts`.
 */
import {
  CITY_SPRITE,
  CITY_STYLE,
  GROUND_CELLS,
  UPPER_CELLS,
  getCityPalette,
  type CityPalette,
  type FacadeFace,
} from '../../src/data/city';
import { FacingCanvas } from './equipment';
import { IsoCanvas, SHADE, Z_PER_TILE, shade, tint, type Vec3 } from './iso';
import { C } from './palette';
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

/** Linde: Stamm, Baumscheibe, Krone aus gestaffelten Kuppeln in drei Grüntönen. */
function linden(small: boolean): string {
  const c = canvasOf(CITY_SPRITE.tree);
  const s = small ? 0.72 : 1;
  c.flat(-0.22, -0.22, 0, 0.44, 0.44, shade(C.woodDeep, 0.8));
  c.shadowDisc(0, 0, 0, 0.55 * s, 0.22, 2.5);
  const leaves = ['#4f8f45', '#5fa451', '#76b863', '#93cc78'];
  // Breite, runde Krone: große flache Kuppeln außen, kleinere oben
  const blobs: [number, number, number, number, number][] = [
    [-0.22, 0.1, 40, 0.34, 0],
    [0.24, 0.06, 42, 0.32, 0],
    [0.02, -0.2, 44, 0.34, 0],
    [0.04, 0.22, 44, 0.3, 1],
    [-0.16, -0.06, 54, 0.32, 1],
    [0.18, -0.08, 56, 0.3, 1],
    [0.02, 0.08, 60, 0.32, 2],
    [-0.06, -0.04, 70, 0.24, 2],
    [0.08, 0.02, 76, 0.16, 3],
  ];
  c.cylinder(0, 0, 0, 0.06 * s, 46 * s, C.woodDeep, shade(C.woodDeep, 0.9));
  for (const [u, v, z, r, k] of blobs)
    c.dome(u * s, v * s, z * s, r * s, r * 64 * s, leaves[k] ?? C.matcha);
  return c.svg();
}

/** Berliner Gaslaterne (Aufsatzleuchte): dunkelgrüner Mast, Laterne mit Glas und Haube. */
function lamp(): string {
  const c = canvasOf(CITY_SPRITE.prop);
  const g = '#35524a';
  c.shadowDisc(0, 0, 0, 0.12, 0.24);
  c.cylinder(0, 0, 0, 0.07, 6, g, tint(g, 0.2));
  c.cylinder(0, 0, 6, 0.03, 52, g);
  c.shine(0, 0, 6, 0.03, 52, g, 0.3);
  c.frustum(0, 0, 58, 0.05, 0.1, 3, g);
  c.group(0.85, () => c.frustum(0, 0, 61, 0.1, 0.14, 9, C.lamp, tint(C.lamp, 0.4)));
  c.frustum(0, 0, 70, 0.16, 0.05, 4, g);
  c.dome(0, 0, 74, 0.05, 4, g);
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

/** Fußgängerampel mit Ampelmännchen (rot steht, grün geht). */
function pedLight(go: boolean): string {
  const c = canvasOf(CITY_SPRITE.prop);
  c.shadowDisc(0, 0, 0, 0.08, 0.22);
  c.cylinder(0, 0, 0, 0.03, 44, IRON);
  c.box(-0.08, -0.06, 36, 0.12, 0.12, 22, C.ink);
  const face = (z: number, on: boolean, col: string) => {
    c.wallV(-0.07, 0.061, z, 0.1, 9, on ? col : shade(col, 0.35));
    if (!on) return;
    // Männchen als kleine Silhouette
    const m = shade(col, 0.55);
    c.wallV(-0.03, 0.062, z + 6, 0.025, 2, m);
    c.wallV(-0.035, 0.062, z + 2.5, 0.035, 3.5, m);
    c.wallV(go ? -0.05 : -0.03, 0.062, z + 0.5, 0.02, 2.2, m);
    c.wallV(go ? -0.01 : -0.01, 0.062, z + 0.5, 0.02, 2.2, m);
  };
  face(47, !go, C.red);
  face(37.5, go, '#5ee07a');
  if (!go) c.glowFlat(-0.12, 0.06, 50, 0.2, 0.06, C.red, 0.35, 2);
  else c.glowFlat(-0.12, 0.06, 41, 0.2, 0.06, '#5ee07a', 0.35, 2);
  return c.svg();
}

/**
 * Autoampel am Mast: schwarzes Gehäuse mit weiß umrandeter Kontrastblende, drei Lichter mit Schute. Die Lichter
 * zeigen zur Kamera: Achse `u` nach +x (Fahrbahn entlang x), `v` nach +y. `state` = was leuchtet.
 */
function trafficLight(axis: 'u' | 'v', state: 'red' | 'redYellow' | 'green' | 'yellow'): string {
  const c = canvasOf(CITY_SPRITE.prop);
  const head = C.ink;
  c.shadowDisc(0, 0, 0, 0.09, 0.22);
  c.cylinder(0, 0, 0, 0.05, 3, IRON, tint(IRON, 0.2));
  c.cylinder(0, 0, 3, 0.026, 60, IRON, tint(IRON, 0.2));
  c.shine(0, 0, 3, 0.026, 60, IRON, 0.25);
  const z0 = 34;
  const h = 26;
  // Lichtebene: Fläche u = face (Achse u) bzw. v = face (Achse v); a = Lage entlang der Fläche.
  const face = 0.075;
  const disc = (a: number, z: number, r: number, color: string, opacity = 1) => {
    const pts: Vec3[] = [];
    for (let i = 0; i < 18; i++) {
      const t = (i / 18) * Math.PI * 2;
      const da = Math.cos(t) * r;
      const dz = Math.sin(t) * r * Z_PER_TILE;
      pts.push(axis === 'u' ? [face + 0.002, a + da, z + dz] : [a + da, face + 0.002, z + dz]);
    }
    c.poly(pts, color, opacity);
  };
  const plate = (a0: number, w: number, zz: number, hh: number, color: string, off: number) =>
    axis === 'u'
      ? c.wallU(face - off, a0, zz, w, hh, shade(color, 0.7))
      : c.wallV(a0, face - off, zz, w, hh, shade(color, 0.85));
  // Kontrastblende (weißer Rand, schwarz), dahinter das Gehäuse
  plate(-0.1, 0.2, z0 - 3, h + 6, C.white, 0.03);
  plate(-0.09, 0.18, z0 - 2, h + 4, head, 0.029);
  if (axis === 'u') c.box(-0.02, -0.06, z0, 0.095, 0.12, h, head);
  else c.box(-0.06, -0.02, z0, 0.12, 0.095, h, head);
  const lamps: { z: number; on: boolean; color: string }[] = [
    { z: z0 + h - 5, on: state === 'red' || state === 'redYellow', color: '#ff4b3e' },
    { z: z0 + h / 2, on: state === 'yellow' || state === 'redYellow', color: '#ffc42e' },
    { z: z0 + 5, on: state === 'green', color: '#3ee07a' },
  ];
  for (const l of lamps) {
    if (l.on) disc(0, l.z, 0.075, l.color, 0.3);
    disc(0, l.z, 0.048, l.on ? l.color : shade(l.color, 0.32));
    if (l.on) disc(-0.012, l.z + 1.2, 0.016, tint(l.color, 0.7));
    // Schute über dem Licht
    if (axis === 'u') c.box(face, -0.05, l.z + 3.2, 0.03, 0.1, 1, shade(head, 1.2));
    else c.box(-0.05, face, l.z + 3.2, 0.1, 0.03, 1, shade(head, 1.2));
  }
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
interface CarStyle {
  body: string;
  roof?: string;
  /** Kabine: Anfang/Ende entlang u (Front bei +u). */
  cabin: [number, number];
  len: number;
  high: number;
  sign?: boolean;
  stripe?: string;
}

const CARS: CarStyle[] = [
  { body: C.red, cabin: [-0.42, 0.12], len: 1.05, high: 9 },
  { body: '#f2e3b3', cabin: [-0.34, 0.2], len: 1.2, high: 8.5, sign: true },
  { body: C.white, cabin: [-0.58, 0.38], len: 1.3, high: 13, stripe: C.cobalt },
  { body: '#77c4b1', cabin: [-0.4, 0.14], len: 1.05, high: 9 },
];

function wheel(c: IsoCanvas, u: number, v: number) {
  const r = 0.1;
  const pts: Vec3[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    pts.push([u + Math.cos(a) * r, v, r * Z_PER_TILE + Math.sin(a) * r * Z_PER_TILE]);
  }
  c.poly(pts, C.ink);
  const hub: Vec3[] = pts.map(([x, y, z]) => [
    u + (x - u) * 0.45,
    y + 0.001,
    3.9 + (z - 3.9) * 0.45,
  ]);
  c.poly(hub, C.stainlessDark);
}

function car(style: CarStyle, heading: 'f' | 'b'): string {
  const c = canvasOf(CITY_SPRITE.car);
  const L = style.len / 2;
  const W = 0.28;
  const s = heading === 'f' ? 1 : -1;
  const [c0, c1] = style.cabin.map((x) => x * s).sort((a, b) => a - b) as [number, number];
  c.shadow(-L - 0.04, -W - 0.02, 0, 2 * L + 0.08, 2 * W + 0.06, 0.3, 1.6);
  wheel(c, -L * 0.62, W + 0.001);
  wheel(c, L * 0.62, W + 0.001);
  c.bevel(-L, -W, 2.5, 2 * L, 2 * W, style.high - 2.5, style.body, { b: 1.6, edge: 0.3 });
  if (style.stripe) c.wallV(-L, W + 0.002, 5, 2 * L, 2, style.stripe);
  // Kabine mit Scheiben
  const top = style.high + 7.5;
  c.bevel(c0, -W + 0.04, style.high, c1 - c0, 2 * W - 0.08, 7.5, style.roof ?? style.body, {
    b: 1.4,
    edge: 0.35,
  });
  c.wallV(c0 + 0.05, W - 0.039, style.high + 1.2, c1 - c0 - 0.1, 5, C.glass);
  c.wallV((c0 + c1) / 2 - 0.01, W - 0.038, style.high + 1.2, 0.02, 5, style.body);
  c.wallU(c1 + 0.001, -W + 0.08, style.high + 1.2, 2 * W - 0.16, 5, shade(C.glass, 0.85));
  // Front (Scheinwerfer) bzw. Heck (Rücklichter) auf der sichtbaren +u-Seite
  const light = heading === 'f' ? C.led : C.red;
  c.wallU(L + 0.002, -W + 0.04, 6, 0.1, 2.2, light);
  c.wallU(L + 0.002, W - 0.14, 6, 0.1, 2.2, light);
  c.wallU(L + 0.002, -0.08, 3.4, 0.16, 1.4, shade(C.ink, 1.4));
  if (style.sign) {
    c.box(-0.06, -0.06, top, 0.12, 0.12, 3, C.gold);
    c.flat(-0.06, -0.06, top + 3, 0.12, 0.12, tint(C.gold, 0.4));
  }
  return c.svg();
}

/** Radfahrer entlang u: Fahrrad mit dünnen Rädern, Figur mit Helm; „f“ = fährt nach +u. */
interface BikeStyle {
  frame: string;
  jacket: string;
  helmet: string;
  pants: string;
  bag?: string;
}
const BIKES: BikeStyle[] = [
  { frame: C.cobalt, jacket: '#f2c14e', helmet: C.white, pants: C.ink },
  { frame: C.red, jacket: '#77c4b1', helmet: C.ink, pants: '#5a6b8c', bag: C.orange },
];

function bike(style: BikeStyle, heading: 'f' | 'b'): string {
  const c = canvasOf(CITY_SPRITE.car);
  const s = heading === 'f' ? 1 : -1;
  const r = 0.12;
  const wz = r * Z_PER_TILE;
  c.shadow(-0.34, -0.06, 0, 0.68, 0.12, 0.26, 1.2);
  const ring = (u: number) => {
    const pts: Vec3[] = [];
    const inner: Vec3[] = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      pts.push([u + Math.cos(a) * r, 0, wz + Math.sin(a) * wz]);
      inner.push([u + Math.cos(a) * r * 0.78, 0.001, wz + Math.sin(a) * wz * 0.78]);
    }
    c.poly(pts, C.ink);
    c.poly(inner, '#b9c1cf', 0.55);
    c.disc(u, 0.002, wz, 0.012, C.stainlessDark);
  };
  const back = -0.22 * s;
  const front = 0.22 * s;
  ring(back);
  ring(front);
  // Rahmen als dünne Streben (Bildschirmlinien)
  const line = (a: Vec3, b: Vec3, color: string, w = 1.1) => {
    const [x0, y0] = c.p(a);
    const [x1, y1] = c.p(b);
    c.raw(
      `<line x1="${x0.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${x1.toFixed(2)}" y2="${y1.toFixed(2)}" stroke="${color}" stroke-width="${String(w)}" stroke-linecap="round"/>`,
    );
  };
  const seat: Vec3 = [-0.06 * s, 0, 9.5];
  const bar: Vec3 = [0.16 * s, 0, 11];
  const crank: Vec3 = [0, 0, wz];
  line([back, 0, wz], crank, style.frame);
  line([back, 0, wz], seat, style.frame);
  line(crank, seat, style.frame);
  line(crank, [0.14 * s, 0, 9.4], style.frame);
  line([0.14 * s, 0, 9.4], seat, style.frame);
  line([front, 0, wz], bar, style.frame);
  line(bar, [0.13 * s, 0, 11.6], C.ink, 1.4);
  // Fahrer: Bein, Rumpf, Arm, Kopf mit Helm
  line(seat, [0.04 * s, 0.02, wz + 1.2], style.pants, 2.2);
  c.box(-0.11 * s - 0.05, -0.05, 9.5, 0.1, 0.1, 9, style.jacket);
  if (style.bag) c.box(-0.11 * s - 0.09, -0.06, 11, 0.06, 0.12, 6, style.bag);
  line([-0.06 * s, 0.04, 17], [0.13 * s, 0.04, 11.6], style.jacket, 1.8);
  c.box(-0.07 * s - 0.045, -0.045, 18.5, 0.09, 0.09, 6, C.skin);
  c.dome(-0.07 * s, 0, 23.6, 0.065, 3.2, style.helmet);
  // Licht vorn bzw. Rücklicht
  const [lx, ly] = c.p([(heading === 'f' ? 0.17 : 0.27) * s, 0.01, 10.4]);
  c.raw(
    `<circle cx="${lx.toFixed(2)}" cy="${ly.toFixed(2)}" r="0.9" fill="${heading === 'f' ? C.led : C.red}"/>`,
  );
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
 * Senkrechtes Prisma über einem konvexen Grundriss (Normale (dv, −du) jeder Kante zeigt nach außen): zeichnet nur die zur
 * Kamera zeigenden Seiten (Normale mit +u/+v-Anteil), links 85 %, rechts 70 %, Deckel 100 %.
 */
function prism(
  c: IsoCanvas,
  pts: readonly [number, number][],
  z0: number,
  z1: number,
  color: string,
) {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (!a || !b) continue;
    const nx = b[1] - a[1];
    const ny = -(b[0] - a[0]);
    if (nx + ny <= 0) continue;
    const f = ny >= nx ? SHADE.left : SHADE.right;
    c.poly(
      [
        [a[0], a[1], z0],
        [b[0], b[1], z0],
        [b[0], b[1], z1],
        [a[0], a[1], z1],
      ],
      shade(color, f),
    );
  }
  c.poly(
    pts.map(([u, v]) => [u, v, z1] as Vec3),
    color,
  );
}

/** Ausflugsdampfer: weißer Rumpf mit blauem Band, verglastes Oberdeck, entlang u. */
function boat(heading: 'f' | 'b'): string {
  const c = canvasOf(CITY_SPRITE.boat);
  const s = heading === 'f' ? 1 : -1;
  c.glowFlat(-1.35, -0.5, 0, 2.7, 1, C.white, 0.3, 2.5);
  const hull: [number, number][] = [
    [-1.15, -0.4],
    [0.95, -0.4],
    [1.25, 0],
    [0.95, 0.4],
    [-1.15, 0.4],
  ].map(([u, v]) => [(u ?? 0) * s, v ?? 0] as [number, number]);
  // Gespiegelt ändert sich der Umlaufsinn; prism erwartet die Reihenfolge mit Normale (dv, −du) nach außen.
  const ordered = s > 0 ? hull : hull.slice().reverse();
  prism(c, ordered, 0, 8, C.white);
  c.wallV(-1.15, 0.401, 2.5, 2.1, 2, C.cobalt);
  c.flat(-0.8, -0.3, 8.01, 1.5, 0.6, C.oakLight);
  c.box(-0.7, -0.28, 8, 1.2, 0.56, 9, C.white);
  c.wallV(-0.65, 0.281, 10, 1.1, 5, C.glass);
  c.wallU(0.501, -0.24, 10, 0.48, 5, shade(C.glass, 0.85));
  c.box(-0.75, -0.32, 17, 1.3, 0.64, 1.4, C.cobalt);
  c.cylinder(-0.25 * s, 0, 18.4, 0.05, 6, C.cobalt);
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
