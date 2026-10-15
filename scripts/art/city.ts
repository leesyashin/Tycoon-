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

/** Obergeschoss-Fenster mit Faschen, Sohlbank und Verdachung. */
function windowCell(c: FacingCanvas, p: CityPalette, f: string, lit: boolean) {
  const h = CITY_STYLE.floorH;
  if (!lit) {
    c.front(0, 0, 0, 1, h, f);
    c.front(0, 0.001, 0, 1, 1.4, shade(f, 0.9));
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
function balconyCell(c: FacingCanvas, p: CityPalette, f: string, lit: boolean) {
  const h = CITY_STYLE.floorH;
  if (!lit) {
    c.front(0, 0, 0, 1, h, f);
    c.front(0, 0.001, 0, 1, 1.4, shade(f, 0.9));
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
  c.front(0, 0, 0, 1, CITY_STYLE.corniceH, f);
  c.fbox(0, 0, 0.5, 1, 0.05, 1.6, p.stucco);
  for (let k = 0; k < 6; k++) c.fbox(0.04 + k * 0.165, 0, 3, 0.08, 0.08, 2.2, p.stucco);
  c.fbox(0, 0, 5.4, 1, 0.13, 2.4, p.stucco);
  c.fbox(0, 0, 7.8, 1, 0.17, 2.2, tint(p.stucco, 0.3));
}

/** Gequaderter Sockel der Ladenzone (Fugen alle 8 px). */
function plinth(c: FacingCanvas, p: CityPalette) {
  const h = CITY_STYLE.groundFloorH;
  c.front(0, 0, 0, 1, h, p.plinth);
  for (let z = 8; z < h; z += 8) c.front(0, 0.001, z, 1, 0.8, shade(p.plinth, 0.86));
  c.front(0, 0.001, h - 2, 1, 2, p.stucco);
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

/** Laden: Schaufenster mit Auslage, Ladenschild ohne Schrift, je Variante eigene Markise oder Auslage vorm Laden. */
function shopCell(c: FacingCanvas, p: CityPalette, variant: number) {
  plinth(c, p);
  const frame = [C.ink, '#2f5f45', '#3a3550', C.cobaltDeep][variant] ?? C.ink;
  const sign = [C.red, C.matchaDeep, C.gold, C.cobalt][variant] ?? C.red;
  c.front(0.05, 0.002, 2, 0.9, 44, frame);
  // Schaufenster: warm beleuchtetes Innere mit Regalen und Auslage
  c.frontLit(0.09, 0.004, 5, 0.6, 37, c.frontShade('#eadfc8'));
  for (const z of [16, 27]) c.frontLit(0.1, 0.005, z, 0.58, 1.2, c.frontShade(C.woodDark));
  for (let k = 0; k < 6; k++) {
    const col =
      [C.sakura, C.matcha, C.cream, C.orange, C.blue, C.gold][(k + variant) % 6] ?? C.cream;
    c.frontLit(0.12 + k * 0.09, 0.005, 17.2, 0.05, 5 + (k % 3), c.frontShade(col));
    c.frontLit(0.13 + k * 0.09, 0.005, 28.2, 0.04, 4 + ((k + 1) % 3), c.frontShade(col));
  }
  c.frontLit(0.09, 0.006, 5, 0.6, 37, C.glass, 0.25);
  reflex(c, 0.09, 0.007, 5, 0.6, 37);
  // Ladentür rechts
  c.front(0.72, 0.004, 3, 0.19, 39, shade(frame, 1.2));
  c.frontLit(0.74, 0.006, 5, 0.15, 33, c.frontShade(PANE));
  c.front(0.75, 0.007, 19, 0.04, 1.2, C.stainless);
  c.fbox(0.05, 0, 0, 0.9, 0.08, 2, shade(frame, 0.9));
  // Schild: Fläche mit Emblem und Zierlinie (keine Schrift)
  c.front(0.04, 0.003, 48, 0.92, 9, sign);
  c.frontLit(0.1, 0.005, 50.5, 0.12, 4, c.frontShade(C.white));
  c.frontLit(0.28, 0.005, 52, 0.5, 1.2, c.frontShade(tint(sign, 0.55)));
  if (variant === 0) awning(c, C.red, C.white);
  if (variant === 3) awning(c, C.cobalt, C.white);
  if (variant === 1) {
    // Blumenladen: Eimer mit Sträußen vor dem Fenster
    for (let k = 0; k < 3; k++) {
      const x = 0.18 + k * 0.17;
      c.fshadowDisc(x, 0.35, 0, 0.07, 0.2);
      c.fcyl(x, 0.35, 0, 0.055, 6, C.stainlessDark);
      c.fdome(x, 0.35, 6, 0.07, 6, [C.sakura, C.gold, C.red][k] ?? C.sakura);
      c.fdome(x + 0.03, 0.33, 7, 0.04, 4, C.matcha);
    }
  }
  if (variant === 2) {
    // Späti: Getränkekisten und Kundenstopper
    for (let k = 0; k < 2; k++) {
      c.fshadow(0.14, 0.24, 0, 0.18, 0.18, 0.2);
      c.fbevel(0.14, 0.24, k * 5, 0.18, 0.18, 5, k ? C.orange : C.matchaDeep, { b: 0.6 });
    }
    c.fbox(0.5, 0.3, 0, 0.16, 0.04, 14, C.ink);
    c.frontLit(0.52, 0.341, 3, 0.12, 9, c.frontShade(C.white));
  }
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
      for (const u of UPPER_CELLS) {
        const c = cellCanvas(face, CITY_STYLE.floorH);
        if (u === 'win') windowCell(c, p, f, false);
        else balconyCell(c, p, f, false);
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
    { name: 'railing', svg: railing() },
    { name: 'boat-f', svg: boat('f') },
    { name: 'boat-b', svg: boat('b') },
  ];
  CARS.forEach((s, i) => {
    out.push({ name: `car-${String(i)}-f`, svg: car(s, 'f') });
    out.push({ name: `car-${String(i)}-b`, svg: car(s, 'b') });
  });
  return out;
}
