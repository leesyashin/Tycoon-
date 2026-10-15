/**
 * Café-Deko nach Ambiente-Level `decor` (Vorgabe Vincent: „wenn man das Full Out Max hat, … richtig Deko,
 * Bilder an der Wand, wie ein richtig geiles Café“) und Terrassen-Tische mit Schirm. Selbst gezeichnet, CC0.
 * Wand-Deko nutzt dieselbe Leinwand wie eine Wandkachel (`-u` an der Rückwand entlang x, `-v` entlang y), damit
 * die Szene sie bündig auf die Wand legt. Platzierung und Level: `DECOR` in `src/data/layouts.ts`.
 */
import { DECOR_BIG } from '../../src/data/art';
import { STATION_CANVAS, TABLE_TIERS, drawTable } from './equipment';
import { IsoCanvas, SHADE, Z_PER_TILE, shade, tint, type Vec3 } from './iso';
import { C } from './palette';
import { WALL, type SpriteDef } from './sprites';

/** Zeichenfläche einer Wandkachel; `f` legt eine Fläche in Wandebene + `d` (Abstand zur Wand) an. */
interface Wall {
  c: IsoCanvas;
  /** Fläche an Position a (entlang der Wand), Höhe z, Breite w, Höhe h, Abstand d vor der Wand. */
  f: (a: number, z: number, w: number, h: number, color: string, d?: number) => void;
  /** Quader, der aus der Wand ragt (Regalbrett, Leuchte). */
  box: (a: number, z: number, w: number, depth: number, h: number, color: string) => void;
  /** Polygon in Wandebene, Punkte als [a, z]. */
  poly: (pts: readonly [number, number][], color: string, d?: number, opacity?: number) => void;
  /** Helligkeit der Wandseite (u: 95 %, v: 80 %), für Flächen in Wandebene. */
  s: number;
  /** Punkt vor der Wand: a entlang der Wand, d Abstand von ihr → (u, v). */
  at: (a: number, d: number) => [number, number];
}

function wall(side: 'u' | 'v'): Wall {
  const h = WALL.back;
  const c =
    side === 'u'
      ? new IsoCanvas(32, 16 + h + 4, 0, h + 4)
      : new IsoCanvas(32, 16 + h + 4, 32, h + 4);
  const sh = side === 'u' ? 0.95 : 0.8;
  const P = (a: number, z: number, d: number): Vec3 => (side === 'u' ? [a, d, z] : [d, a, z]);
  return {
    c,
    s: sh,
    at: (a, d) => (side === 'u' ? [a, d] : [d, a]),
    f: (a, z, w, hh, color, d = 0.01) =>
      c.poly([P(a, z, d), P(a + w, z, d), P(a + w, z + hh, d), P(a, z + hh, d)], shade(color, sh)),
    box: (a, z, w, depth, hh, color) =>
      side === 'u' ? c.box(a, 0, z, w, depth, hh, color) : c.box(0, a, z, depth, w, hh, color),
    poly: (pts, color, d = 0.012, opacity = 1) =>
      c.poly(
        pts.map(([a, z]) => P(a, z, d)),
        shade(color, sh),
        opacity,
      ),
  };
}

/** Kreis in Wandebene (Uhr, Schallplatte, Globus), als Polygon. */
function circle(w: Wall, a: number, z: number, r: number, color: string, d = 0.012) {
  const pts: [number, number][] = [];
  for (let i = 0; i < 20; i++) {
    const t = (i / 20) * Math.PI * 2;
    pts.push([a + Math.cos(t) * r, z + Math.sin(t) * r * Z_PER_TILE]);
  }
  w.poly(pts, color, d);
}

/** Bilderrahmen mit Passepartout; `inner` zeichnet das Motiv in die Bildfläche (a0, z0, w, h). */
function frame(
  w: Wall,
  a: number,
  z: number,
  fw: number,
  fh: number,
  color: string,
  inner: (a0: number, z0: number, iw: number, ih: number) => void,
  mat = true,
) {
  w.f(a - 0.01, z - 1.4, fw + 0.02, fh + 2.8, SHADOWISH, 0.008);
  w.f(a, z, fw, fh, color, 0.012);
  const m = mat ? 0.035 : 0.02;
  w.f(a + m, z + 1.6, fw - 2 * m, fh - 3.2, mat ? C.white : C.paper, 0.014);
  const pad = mat ? 0.06 : 0.03;
  inner(a + pad, z + (mat ? 3 : 2), fw - 2 * pad, fh - (mat ? 6 : 4));
}
const SHADOWISH = '#c9cbd6';

const WALL_ITEMS: Record<string, (w: Wall) => void> = {
  // Blatt-Druck im Eichenrahmen
  'wall-art-leaf': (w) =>
    frame(w, 0.2, 30, 0.6, 24, C.oak, (a, z, iw, ih) => {
      w.f(a, z, iw, ih, C.matchaTile, 0.016);
      w.poly(
        [
          [a + iw * 0.5, z + ih * 0.08],
          [a + iw * 0.85, z + ih * 0.55],
          [a + iw * 0.5, z + ih * 0.95],
          [a + iw * 0.15, z + ih * 0.55],
        ],
        C.matchaDeep,
        0.018,
      );
      w.f(a + iw * 0.49, z + ih * 0.12, iw * 0.02, ih * 0.8, C.matchaFoam, 0.02);
    }),
  // Plakat Fernsehturm vor blauem Himmel
  'wall-art-tower': (w) =>
    frame(
      w,
      0.18,
      26,
      0.64,
      30,
      C.ink,
      (a, z, iw, ih) => {
        w.f(a, z, iw, ih, C.cobalt, 0.016);
        w.f(a, z, iw, ih * 0.35, C.cobaltLight, 0.017);
        w.f(a + iw * 0.48, z, iw * 0.05, ih * 0.82, C.white, 0.019);
        circle(w, a + iw * 0.505, z + ih * 0.62, iw * 0.12, C.white, 0.02);
        w.f(a + iw * 0.5, z + ih * 0.82, iw * 0.012, ih * 0.16, C.red, 0.021);
        w.f(a, z, iw, ih * 0.08, C.matchaDeep, 0.022);
      },
      false,
    ),
  // Drei Polaroids, schief gehängt
  'wall-art-photo': (w) => {
    const pics: [number, number, string][] = [
      [0.12, 36, C.sakura],
      [0.42, 40, C.cobaltLight],
      [0.7, 33, C.gold],
    ];
    for (const [a, z, col] of pics) {
      w.f(a - 0.005, z - 1, 0.21, 15, SHADOWISH, 0.008);
      w.f(a, z, 0.2, 14, C.white, 0.012);
      w.f(a + 0.02, z + 3.6, 0.16, 9, col, 0.014);
      w.f(a + 0.03, z + 3.6, 0.07, 4, tint(col, 0.5), 0.016);
    }
  },
  // Großes Bild mit Farbflächen (Kreis, Bogen, Balken)
  'wall-art-abstract': (w) =>
    frame(
      w,
      0.08,
      24,
      0.84,
      34,
      C.white,
      (a, z, iw, ih) => {
        w.f(a, z, iw, ih, C.cream, 0.016);
        circle(w, a + iw * 0.33, z + ih * 0.6, iw * 0.2, C.cobalt, 0.018);
        w.f(a + iw * 0.55, z + ih * 0.12, iw * 0.3, ih * 0.5, C.sakura, 0.018);
        w.f(a + iw * 0.1, z + ih * 0.1, iw * 0.8, ih * 0.06, C.matchaDeep, 0.02);
        circle(w, a + iw * 0.72, z + ih * 0.78, iw * 0.07, C.gold, 0.021);
      },
      false,
    ),
  // Goldrahmen mit Matcha-Schale
  'wall-art-gold': (w) =>
    frame(w, 0.16, 27, 0.68, 30, C.gold, (a, z, iw, ih) => {
      w.f(a, z, iw, ih, C.lacquerNavy, 0.016);
      w.poly(
        [
          [a + iw * 0.15, z + ih * 0.5],
          [a + iw * 0.85, z + ih * 0.5],
          [a + iw * 0.7, z + ih * 0.18],
          [a + iw * 0.3, z + ih * 0.18],
        ],
        C.cream,
        0.018,
      );
      w.f(a + iw * 0.2, z + ih * 0.46, iw * 0.6, ih * 0.06, C.matcha, 0.019);
      w.f(a + iw * 0.47, z + ih * 0.56, iw * 0.06, ih * 0.3, C.goldDeep, 0.019);
    }),
  // Neon-Blatt mit Schein
  'wall-neon': (w) => {
    const leaf: [number, number][] = [
      [0.5, 56],
      [0.78, 46],
      [0.5, 32],
      [0.22, 46],
    ];
    w.poly(leaf, '#7dff9a', 0.012, 0.25);
    for (let i = 0; i < leaf.length; i++) {
      const p = leaf[i];
      const q = leaf[(i + 1) % leaf.length];
      if (!p || !q) continue;
      const dz = (q[1] - p[1]) / Z_PER_TILE;
      const da = q[0] - p[0];
      const len = Math.hypot(da, dz) || 1;
      const n: [number, number] = [(-dz / len) * 0.018, (da / len) * 0.018 * Z_PER_TILE];
      w.poly(
        [
          [p[0] - n[0], p[1] - n[1]],
          [q[0] - n[0], q[1] - n[1]],
          [q[0] + n[0], q[1] + n[1]],
          [p[0] + n[0], p[1] + n[1]],
        ],
        '#b8ffc6',
        0.014,
      );
    }
    w.f(0.495, 33, 0.01, 22, '#b8ffc6', 0.015);
  },
  // Zwei Eichenbretter mit Pflanzen, Büchern, Bechern
  'wall-shelf': (w) => {
    for (const z of [34, 48]) {
      w.box(0.06, z, 0.88, 0.12, 1.8, C.oak);
      const items: [number, number, number, string][] =
        z === 34
          ? [
              [0.1, 0.07, 7, C.cobalt],
              [0.18, 0.06, 8.5, C.sakura],
              [0.25, 0.06, 7.5, C.cream],
              [0.6, 0.1, 5, C.cobalt],
              [0.74, 0.1, 5, C.white],
            ]
          : [
              [0.12, 0.12, 5, C.white],
              [0.55, 0.06, 9, C.matchaDeep],
              [0.62, 0.06, 8, C.gold],
              [0.69, 0.06, 9.5, C.red],
            ];
      for (const [a, wd, h, col] of items) w.box(a, z + 1.8, wd, 0.08, h, col);
      if (z === 48) {
        w.box(0.3, z + 1.8, 0.1, 0.09, 5, C.terracotta);
        const [u, v] = w.at(0.35, 0.05);
        w.c.dome(u, v, z + 6.5, 0.08, 6, C.matcha);
      }
    }
  },
  // Messing-Wandleuchte mit Glaskugel und Schein
  'wall-sconce': (w) => {
    w.f(0.46, 38, 0.08, 6, C.brass, 0.012);
    w.box(0.48, 41, 0.04, 0.18, 1.2, C.brass);
    const [u, v] = w.at(0.5, 0.2);
    w.c.glowFlat(u - 0.2, v - 0.2, 44, 0.4, 0.4, C.glow, 0.5, 2.5);
    w.c.dome(u, v, 42, 0.07, 9, C.led);
  },
  // Makramee-Ampeln mit Hängepflanzen
  'wall-plants': (w) => {
    for (const [a, z] of [
      [0.3, 34],
      [0.7, 40],
    ] as const) {
      w.f(a - 0.002, z + 8, 0.004, 14, C.paper, 0.03);
      const [u, v] = w.at(a, 0.15);
      w.c.frustum(u, v, z, 0.06, 0.08, 6, C.white);
      w.c.dome(u, v, z + 6, 0.1, 6, C.matcha);
      for (let k = 0; k < 3; k++)
        w.f(a - 0.06 + k * 0.05, z - 8 + k * 2, 0.02, 10 - k * 2, C.matchaDeep, 0.2);
    }
  },
  // Bahnhofsuhr
  'wall-clock': (w) => {
    circle(w, 0.5, 46, 0.2, C.ink, 0.012);
    circle(w, 0.5, 46, 0.17, C.white, 0.014);
    w.f(0.495, 46, 0.01, 5.5, C.ink, 0.016);
    w.f(0.5, 45.6, 0.13, 0.9, C.ink, 0.016);
    circle(w, 0.5, 46, 0.02, C.red, 0.018);
  },
  // Gerahmte Schallplatten
  'wall-records': (w) => {
    for (const [a, z, col] of [
      [0.1, 30, C.sakura],
      [0.52, 36, C.cobalt],
      [0.3, 46, C.gold],
    ] as const) {
      w.f(a, z, 0.36, 13, C.ink, 0.012);
      circle(w, a + 0.18, z + 6.5, 0.14, shade(C.ink, 1.4), 0.014);
      circle(w, a + 0.18, z + 6.5, 0.05, col, 0.016);
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Boden-Deko (Leinwand wie Ausstattung/Ambiente)
// ---------------------------------------------------------------------------------------------
function canvas(): IsoCanvas {
  return new IsoCanvas(STATION_CANVAS.w, STATION_CANVAS.h, STATION_CANVAS.ox, STATION_CANVAS.oy);
}

const FLOOR_ITEMS: Record<string, (c: IsoCanvas) => void> = {
  // Berber-Teppich unter den Wintergarten-Tischen
  'deco-rug': (c) => {
    c.flat(-0.3, 0.05, 0, 1.6, 0.9, C.cream);
    c.flat(-0.24, 0.1, 0.01, 1.48, 0.8, tint(C.terracotta, 0.55));
    c.flat(-0.18, 0.15, 0.02, 1.36, 0.7, C.cream);
    for (let k = 0; k < 6; k++) {
      const u = -0.12 + k * 0.22;
      c.poly(
        [
          [u, 0.5, 0.03],
          [u + 0.08, 0.4, 0.03],
          [u + 0.16, 0.5, 0.03],
          [u + 0.08, 0.6, 0.03],
        ],
        k % 2 ? C.cobalt : C.terracotta,
      );
    }
  },
  // Monstera im weißen Topf
  'deco-monstera': (c) => {
    c.shadowDisc(0.5, 0.5, 0, 0.2, 0.24);
    c.frustum(0.5, 0.5, 0, 0.13, 0.16, 14, C.white);
    c.disc(0.5, 0.5, 14, 0.14, C.woodDeep);
    const leaves: [number, number, number, number][] = [
      [0.36, 0.5, 18, 0.16],
      [0.62, 0.46, 22, 0.17],
      [0.5, 0.36, 28, 0.16],
      [0.42, 0.6, 32, 0.14],
      [0.6, 0.58, 36, 0.13],
    ];
    for (const [u, v, z, r] of leaves) {
      c.box(0.5, 0.5, 14, 0.012, 0.012, z - 14, C.matchaDeep);
      c.dome(u, v, z, r, 7, C.matchaDeep);
      c.dome(u + 0.02, v - 0.02, z + 2, r * 0.7, 5, C.matcha);
    }
  },
  // Bogenleuchte aus Messing mit Stoffschirm
  'deco-floorlamp': (c) => {
    c.shadowDisc(0.4, 0.5, 0, 0.14, 0.24);
    c.cylinder(0.4, 0.5, 0, 0.11, 2.5, C.marble, C.marble);
    c.cylinder(0.4, 0.5, 2.5, 0.015, 40, C.brass);
    c.box(0.4, 0.49, 42, 0.32, 0.02, 1.2, C.brass);
    c.glowFlat(0.5, 0.3, 30, 0.45, 0.45, C.glow, 0.45, 3);
    c.frustum(0.72, 0.5, 34, 0.11, 0.06, 8, C.cream, C.cream);
  },
  // Pflanzengruppe: Bogenhanf, Farn, Olivenbäumchen
  'deco-plants': (c) => {
    c.shadow(0.15, 0.25, 0, 0.7, 0.55, 0.24);
    c.cylinder(0.3, 0.4, 0, 0.1, 10, C.cobalt);
    for (let k = 0; k < 5; k++)
      c.box(
        0.24 + k * 0.03,
        0.38,
        10,
        0.02,
        0.02,
        12 + (k % 3) * 4,
        k % 2 ? C.matcha : C.matchaDeep,
      );
    c.cylinder(0.65, 0.42, 0, 0.11, 8, C.terracotta);
    c.dome(0.65, 0.42, 8, 0.17, 9, C.sage);
    c.dome(0.62, 0.4, 11, 0.11, 7, C.matcha);
    c.cylinder(0.48, 0.66, 0, 0.12, 12, C.white);
    c.box(0.47, 0.65, 12, 0.02, 0.02, 14, C.woodDeep);
    c.dome(0.48, 0.66, 24, 0.17, 12, '#8aa86f');
    c.dome(0.44, 0.64, 29, 0.1, 8, '#a2bf86');
  },
  // Marmorsockel mit goldener Matcha-Schale und Besen
  'deco-sculpture': (c) => {
    c.shadow(0.3, 0.3, 0, 0.4, 0.4, 0.26);
    c.bevel(0.32, 0.32, 0, 0.36, 0.36, 26, C.marble, { b: 1.2 });
    c.box(0.32, 0.32, 24, 0.36, 0.36, 2, C.gold);
    c.frustum(0.5, 0.5, 26, 0.08, 0.14, 7, C.gold, C.matchaFoam);
    c.shine(0.5, 0.5, 26, 0.12, 7, C.gold, 0.5);
    c.frustum(0.62, 0.42, 26, 0.03, 0.035, 6, C.oakLight);
  },
};

/** Große Leinwand für Teppiche und Hocker über mehrere Kacheln (`DECOR_BIG`). */
const BIG = DECOR_BIG;

const BIG_ITEMS: Record<string, (c: IsoCanvas) => void> = {
  // Läufer unter einer Tischgruppe (zwei Tische entlang x): Kobalt mit hellem Rand und Rautenband
  'deco-rug-blue': (c) => {
    // Unter zwei Tischen (Mitten bei u = 0,5 ∓ 1,5): 4 Kacheln lang, über die Stühle hinaus
    c.flat(-1.45, -0.05, 0, 3.9, 1.1, C.white);
    c.flat(-1.37, 0.03, 0.01, 3.74, 0.94, C.cobalt);
    c.flat(-1.27, 0.13, 0.02, 3.54, 0.74, shade(C.cobalt, 0.92));
    for (const u of [-1.2, 2.1]) c.flat(u, 0.2, 0.03, 0.08, 0.6, C.white);
  },
};

/** Pendelleuchte über einem Tisch: Kabel nach oben (Decke ist im Dollhouse-Schnitt weg), Schirm, Lichtkegel. */
function pendant(c: IsoCanvas) {
  c.glowFlat(0.25, 0.25, 15.6, 0.5, 0.5, C.glow, 0.35, 2.5);
  c.box(0.495, 0.495, 46, 0.01, 0.01, 26, C.ink);
  c.frustum(0.5, 0.5, 39, 0.12, 0.045, 7, C.cobalt, C.cobaltDeep);
  c.shine(0.5, 0.5, 39, 0.09, 7, C.cobalt, 0.35);
  c.dome(0.5, 0.5, 37.6, 0.045, 2, C.led);
}

/** Drei Barhocker vor der Theke (Edelstahl, blaue Sitze), entlang x. */
function stools(c: IsoCanvas) {
  for (const u of [-0.45, 0.5, 1.45]) {
    c.shadowDisc(u, 0.5, 0, 0.14, 0.24);
    c.cylinder(u, 0.5, 0, 0.11, 1.2, C.stainlessDark);
    c.cylinder(u, 0.5, 1.2, 0.02, 15, C.stainless);
    c.cylinder(u, 0.5, 7, 0.08, 0.8, C.stainless);
    c.cylinder(u, 0.5, 16, 0.12, 3, C.cobalt, C.cobaltLight);
  }
}

/** Sonnenschirm über einem Terrassen-Tisch: Achteck in zwei Farben, Mast mit Spitze. */
function umbrella(c: IsoCanvas, a: string, b: string, z: number, r = 25) {
  c.cylinder(0.5, 0.5, 15.5, 0.018, z - 15.5, C.white);
  const [cx, cy] = c.p([0.5, 0.5, z]);
  const pts = (a0: number, a1: number) =>
    [`${cx.toFixed(1)},${(cy - 6).toFixed(1)}`]
      .concat(
        [a0, a1].map(
          (t) => `${(cx + Math.cos(t) * r).toFixed(1)},${(cy + Math.sin(t) * r * 0.5).toFixed(1)}`,
        ),
      )
      .join(' ');
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2;
    const a1 = ((i + 1) / 8) * Math.PI * 2;
    const lit = Math.sin((a0 + a1) / 2) > 0;
    const col = i % 2 ? b : a;
    c.raw(`<polygon points="${pts(a0, a1)}" fill="${lit ? col : shade(col, SHADE.left)}"/>`);
  }
  c.raw(
    `<circle cx="${cx.toFixed(1)}" cy="${(cy - 6.5).toFixed(1)}" r="1.4" fill="${shade(a, 0.8)}"/>`,
  );
}

const UMBRELLAS: Record<1 | 2 | 3 | 4, [string, string]> = {
  1: [C.cobalt, C.white],
  2: [C.cobalt, C.cobaltLight],
  3: [C.cream, C.white],
  4: [C.lacquerNavy, C.gold],
};

/** Terrassen-Tisch je Stufe (`table-out-<stufe>`): Tisch wie drinnen, darüber ein Schirm. */
export function tableOutSprites(): SpriteDef[] {
  return TABLE_TIERS.map((tier) => {
    const c = canvas();
    c.shadowDisc(0.5, 0.5, 0, 0.5, 0.14, 3);
    drawTable(c, tier);
    const [a, b] = UMBRELLAS[tier];
    umbrella(c, a, b, 50);
    return { name: `table-out-${String(tier)}`, svg: c.svg() };
  });
}

/** Wand-Deko (`<id>-u`, `<id>-v`) und Boden-Deko (`<id>`). */
export function decorSprites(): SpriteDef[] {
  const out: SpriteDef[] = [];
  for (const [id, draw] of Object.entries(WALL_ITEMS))
    for (const side of ['u', 'v'] as const) {
      const w = wall(side);
      draw(w);
      out.push({ name: `${id}-${side}`, svg: w.c.svg() });
    }
  for (const [id, draw] of Object.entries(FLOOR_ITEMS)) {
    const c = canvas();
    draw(c);
    out.push({ name: id, svg: c.svg() });
  }
  for (const [id, draw] of Object.entries(BIG_ITEMS)) {
    const c = new IsoCanvas(BIG.w, BIG.h, BIG.ox, BIG.oy);
    draw(c);
    out.push({ name: id, svg: c.svg() });
  }
  const p = canvas();
  pendant(p);
  out.push({ name: 'deco-pendant', svg: p.svg() });
  const st = new IsoCanvas(BIG.w, BIG.h, BIG.ox, BIG.oy);
  stools(st);
  out.push({ name: 'deco-stools', svg: st.svg() });
  return out;
}

/** Alle Wand-Deko-IDs (ohne Seiten-Suffix) und Boden-Deko-IDs, für Tests. */
export const DECOR_IDS: readonly string[] = [
  ...Object.keys(WALL_ITEMS),
  ...Object.keys(FLOOR_ITEMS),
  ...Object.keys(BIG_ITEMS),
  'deco-pendant',
  'deco-stools',
];
