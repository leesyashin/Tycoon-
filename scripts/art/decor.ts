/**
 * Café-Deko nach Ambiente-Level `decor` (Vorgabe Vincent: „wenn man das Full Out Max hat, … richtig Deko,
 * Bilder an der Wand, wie ein richtig geiles Café“) und Terrassen-Tische mit Schirm. Selbst gezeichnet, CC0.
 * Wand-Deko nutzt dieselbe Leinwand wie eine Wandkachel (`-u` an der Rückwand entlang x, `-v` entlang y), damit
 * die Szene sie bündig auf die Wand legt. Platzierung und Level: `DECOR` in `src/data/layouts.ts`.
 * Bilder haben Rahmen mit Tiefe (Leisten als Quader, Bild zurückgesetzt) und einen Schlagschatten auf der Wand.
 */
import { DECOR_BIG } from '../../src/data/art';
import { STATION_CANVAS, TABLE_TIERS, drawTable } from './equipment';
import { IsoCanvas, SHADE, SHADOW, Z_PER_TILE, shade, tint, type Vec3 } from './iso';
import { C } from './palette';
import { crown, facetBall, facetLight, lit, polyline, strut } from './shapes';
import { WALL, type SpriteDef } from './sprites';

/** Zeichenfläche einer Wandkachel; `f` legt eine Fläche in Wandebene + `d` (Abstand zur Wand) an. */
interface Wall {
  c: IsoCanvas;
  /** Fläche an Position a (entlang der Wand), Höhe z, Breite w, Höhe h, Abstand d vor der Wand. */
  f: (a: number, z: number, w: number, h: number, color: string, d?: number) => void;
  /** Quader, der aus der Wand ragt (Rahmenleiste, Regalbrett, Leuchte). */
  box: (a: number, z: number, w: number, depth: number, h: number, color: string) => void;
  /** Polygon in Wandebene, Punkte als [a, z]. */
  poly: (pts: readonly [number, number][], color: string, d?: number, opacity?: number) => void;
  /** Linienzug in Wandebene (Neon, Kordel, Zeiger). */
  line: (
    pts: readonly [number, number][],
    color: string,
    width: number,
    d?: number,
    opacity?: number,
  ) => void;
  /** Helligkeit der Wandseite (u: 95 %, v: 80 %), für Flächen in Wandebene. */
  s: number;
  /** Punkt vor der Wand: a entlang der Wand, d Abstand von ihr → (u, v). */
  at: (a: number, d: number) => [number, number];
  P: (a: number, z: number, d: number) => Vec3;
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
    P,
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
    line: (pts, color, width, d = 0.02, opacity = 1) =>
      polyline(
        c,
        pts.map(([a, z]) => P(a, z, d)),
        color,
        width,
        opacity,
      ),
  };
}

/** Kreis in Wandebene (Uhr, Schallplatte), als Polygon. */
function circle(w: Wall, a: number, z: number, r: number, color: string, d = 0.012, n = 20) {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push([a + Math.cos(t) * r, z + Math.sin(t) * r * Z_PER_TILE]);
  }
  w.poly(pts, color, d);
}

/** Schlagschatten eines Wandobjekts nach rechts unten (zwei weiche Lagen statt Weichzeichner). */
function wallShadow(w: Wall, a: number, z: number, fw: number, fh: number) {
  for (const [g, op] of [
    [0.012, 0.1],
    [0, 0.12],
  ] as const)
    w.c.poly(
      [
        w.P(a + 0.025 - g, z - 2 - g * 30, 0.004),
        w.P(a + fw + 0.025 + g, z - 2 - g * 30, 0.004),
        w.P(a + fw + 0.025 + g, z + fh - 2 + g * 30, 0.004),
        w.P(a + 0.025 - g, z + fh - 2 + g * 30, 0.004),
      ],
      SHADOW.color,
      op,
    );
}

/**
 * Bilderrahmen mit Tiefe: vier Leisten als Quader (Kante oben hell), dahinter zurückgesetzt Passepartout und
 * Motiv; `inner` zeichnet in die Bildfläche (a0, z0, iw, ih).
 */
function frame(
  w: Wall,
  a: number,
  z: number,
  fw: number,
  fh: number,
  color: string,
  inner: (a0: number, z0: number, iw: number, ih: number) => void,
  o: { mat?: boolean; t?: number; depth?: number } = {},
) {
  const mat = o.mat ?? true;
  const tz = o.t ?? 1.5;
  const ta = tz / 30;
  const dep = o.depth ?? 0.035;
  wallShadow(w, a, z, fw, fh);
  w.f(a, z, fw, fh, shade(color, 0.6), 0.006);
  const m = mat ? 0.045 : 0;
  w.f(a + ta, z + tz, fw - 2 * ta, fh - 2 * tz, mat ? C.white : C.paper, 0.012);
  const pad = ta + m;
  const pz = tz + (mat ? 1.6 : 0);
  if (mat)
    w.f(
      a + pad - 0.008,
      z + pz - 0.4,
      fw - 2 * pad + 0.016,
      fh - 2 * pz + 0.8,
      shade(C.white, 0.86),
      0.013,
    );
  inner(a + pad, z + pz, fw - 2 * pad, fh - 2 * pz);
  w.box(a, z, ta, dep, fh, color);
  w.box(a + ta, z, fw - 2 * ta, dep, tz, color);
  w.box(a + ta, z + fh - tz, fw - 2 * ta, dep, tz, tint(color, 0.08));
  w.box(a + fw - ta, z, ta, dep, fh, color);
}

const WALL_ITEMS: Record<string, (w: Wall) => void> = {
  // Botanischer Druck: Teezweig mit fünf Blättern auf Büttenpapier, Eichenrahmen
  'wall-art-leaf': (w) =>
    frame(w, 0.18, 28, 0.64, 27, C.oak, (a, z, iw, ih) => {
      w.f(a, z, iw, ih, C.paper, 0.016);
      const stem: [number, number][] = [
        [a + iw * 0.5, z + ih * 0.06],
        [a + iw * 0.47, z + ih * 0.4],
        [a + iw * 0.53, z + ih * 0.7],
        [a + iw * 0.5, z + ih * 0.95],
      ];
      w.line(stem, shade(C.woodDark, 0.9), 0.5, 0.018);
      const leaf = (cx: number, cz: number, ang: number, len: number, col: string) => {
        const pts: [number, number][] = [];
        for (let k = 0; k <= 8; k++) {
          const t = k / 8;
          const wv = Math.sin(t * Math.PI) * 0.32;
          pts.push([t, wv]);
        }
        for (let k = 8; k >= 0; k--) {
          const t = k / 8;
          pts.push([t, -Math.sin(t * Math.PI) * 0.32]);
        }
        const xf = (s: number, q: number): [number, number] => [
          cx + (Math.cos(ang) * s - Math.sin(ang) * q) * len,
          cz + (Math.sin(ang) * s + Math.cos(ang) * q) * len * Z_PER_TILE,
        ];
        w.poly(
          pts.map(([s, q]) => xf(s, q)),
          col,
          0.019,
        );
        w.line([xf(0.05, 0), xf(0.9, 0)], tint(col, 0.35), 0.35, 0.02);
      };
      leaf(a + iw * 0.48, z + ih * 0.3, Math.PI * 0.85, iw * 0.42, C.leaf);
      leaf(a + iw * 0.5, z + ih * 0.42, Math.PI * 0.12, iw * 0.42, C.leafMid);
      leaf(a + iw * 0.5, z + ih * 0.6, Math.PI * 0.8, iw * 0.38, C.leafMid);
      leaf(a + iw * 0.52, z + ih * 0.72, Math.PI * 0.2, iw * 0.34, C.leaf);
      leaf(a + iw * 0.5, z + ih * 0.9, Math.PI * 0.5, iw * 0.25, C.leafLight);
    }),
  // Plakat Fernsehturm im Abendhimmel über der Stadt (ohne Schrift)
  'wall-art-tower': (w) =>
    frame(
      w,
      0.17,
      25,
      0.66,
      32,
      C.ink,
      (a, z, iw, ih) => {
        const band = (z0: number, h: number, col: string) =>
          w.f(a, z + ih * z0, iw, ih * h, col, 0.016);
        band(0, 1, C.cobaltDeep);
        band(0.25, 0.75, C.cobalt);
        band(0.55, 0.45, C.cobaltLight);
        band(0.8, 0.2, tint(C.cobaltLight, 0.35));
        circle(w, a + iw * 0.78, z + ih * 0.82, iw * 0.07, C.sakura, 0.017);
        // Silhouette der Stadt
        const roofs = [0.16, 0.24, 0.13, 0.3, 0.2, 0.17, 0.26, 0.12];
        roofs.forEach((h, k) =>
          w.f(
            a + (k * iw) / roofs.length,
            z,
            iw / roofs.length + 0.002,
            ih * h,
            shade(C.ink, 1.15),
            0.018,
          ),
        );
        // Turm: Schaft, Kugel mit Fensterband, Antenne
        const cx = a + iw * 0.47;
        w.poly(
          [
            [cx - iw * 0.045, z],
            [cx + iw * 0.045, z],
            [cx + iw * 0.022, z + ih * 0.6],
            [cx - iw * 0.022, z + ih * 0.6],
          ],
          C.white,
          0.019,
        );
        circle(w, cx, z + ih * 0.64, iw * 0.11, C.white, 0.02);
        w.f(cx - iw * 0.11, z + ih * 0.625, iw * 0.22, ih * 0.03, C.ink, 0.021);
        w.f(cx - iw * 0.008, z + ih * 0.72, iw * 0.016, ih * 0.22, C.white, 0.021);
        w.f(cx - iw * 0.012, z + ih * 0.86, iw * 0.024, ih * 0.04, C.red, 0.022);
      },
      { mat: false, t: 1.1 },
    ),
  // Drei Polaroids schief an Klebestreifen: Matcha-Becher, Sonne über dem Meer, Kirschblütenzweig
  'wall-art-photo': (w) => {
    const pics: [number, number, number][] = [
      [0.1, 36, 0.08],
      [0.4, 40, -0.06],
      [0.68, 33, 0.05],
    ];
    pics.forEach(([a, z, tilt], k) => {
      const W = 0.22;
      const H = 15;
      const sk = (pa: number, pz: number): [number, number] => [
        a + pa + (pz / H) * tilt * 0.2,
        z + pz - pa * tilt * 30,
      ];
      w.poly(
        [sk(0.02, -1.8), sk(W + 0.02, -1.8), sk(W + 0.02, H - 1.8), sk(0.02, H - 1.8)],
        SHADOW.color,
        0.008,
        0.16,
      );
      w.poly([sk(0, 0), sk(W, 0), sk(W, H), sk(0, H)], C.white, 0.012);
      const ia = 0.02;
      const iz = 3.6;
      const iw = W - 0.04;
      const ih = H - 5.4;
      const bg = [C.cream, C.cobaltLight, tint(C.sakura, 0.6)][k] ?? C.cream;
      w.poly([sk(ia, iz), sk(ia + iw, iz), sk(ia + iw, iz + ih), sk(ia, iz + ih)], bg, 0.014);
      if (k === 0) {
        w.poly(
          [sk(0.07, iz + 1), sk(0.15, iz + 1), sk(0.16, iz + 7), sk(0.06, iz + 7)],
          C.white,
          0.016,
        );
        w.poly(
          [sk(0.065, iz + 4.5), sk(0.155, iz + 4.5), sk(0.16, iz + 7), sk(0.06, iz + 7)],
          C.matchaFoam,
          0.017,
        );
        w.poly(
          [sk(0.1, iz + 7), sk(0.115, iz + 7), sk(0.12, iz + 9.4), sk(0.105, iz + 9.4)],
          C.cobalt,
          0.018,
        );
      } else if (k === 1) {
        w.poly(
          [sk(ia, iz), sk(ia + iw, iz), sk(ia + iw, iz + 3.6), sk(ia, iz + 3.6)],
          C.cobalt,
          0.016,
        );
        const [sa, sz] = sk(0.11, iz + 5.6);
        circle(w, sa, sz, 0.035, C.orange, 0.017, 12);
        w.poly(
          [sk(ia, iz + 3.4), sk(ia + iw, iz + 3.4), sk(ia + iw, iz + 4), sk(ia, iz + 4)],
          tint(C.orange, 0.4),
          0.018,
        );
      } else {
        w.line([sk(0.03, iz + 2), sk(0.1, iz + 5), sk(0.19, iz + 8)], C.woodDark, 0.5, 0.016);
        for (const [pa, pz] of [
          [0.06, 4.2],
          [0.11, 6.4],
          [0.16, 7.6],
          [0.13, 4.6],
        ] as const) {
          const [ca, cz] = sk(pa, iz + pz);
          circle(w, ca, cz, 0.018, C.sakura, 0.017, 8);
        }
      }
      // Klebestreifen oben
      w.poly(
        [sk(0.07, H - 1), sk(0.15, H - 0.6), sk(0.15, H + 1.4), sk(0.07, H + 1)],
        tint(C.paper, 0.4),
        0.02,
        0.85,
      );
    });
  },
  // Großes Bild mit Formen (Kreis, Halbkreis, Dreieck, Linien) im weißen Galerierahmen
  'wall-art-abstract': (w) =>
    frame(
      w,
      0.07,
      23,
      0.86,
      36,
      C.white,
      (a, z, iw, ih) => {
        w.f(a, z, iw, ih, C.linen, 0.016);
        w.f(a, z, iw * 0.42, ih, tint(C.sakura, 0.55), 0.017);
        circle(w, a + iw * 0.32, z + ih * 0.62, iw * 0.2, C.cobalt, 0.018, 24);
        const half: [number, number][] = [];
        for (let k = 0; k <= 12; k++) {
          const t = (k / 12) * Math.PI;
          half.push([
            a + iw * 0.72 + Math.cos(t) * iw * 0.16,
            z + ih * 0.2 + Math.sin(t) * iw * 0.16 * Z_PER_TILE,
          ]);
        }
        w.poly(half, C.matchaDeep, 0.019);
        w.poly(
          [
            [a + iw * 0.55, z + ih * 0.5],
            [a + iw * 0.92, z + ih * 0.5],
            [a + iw * 0.92, z + ih * 0.92],
          ],
          C.gold,
          0.018,
        );
        w.f(a + iw * 0.08, z + ih * 0.12, iw * 0.84, ih * 0.03, C.ink, 0.02);
        w.f(a + iw * 0.6, z + ih * 0.12, iw * 0.02, ih * 0.7, C.ink, 0.02);
        circle(w, a + iw * 0.8, z + ih * 0.36, iw * 0.04, C.red, 0.021, 12);
      },
      { mat: false, t: 1.6, depth: 0.045 },
    ),
  // Goldrahmen mit Stillleben: Matcha-Schale mit Besen auf Nachtblau
  'wall-art-gold': (w) =>
    frame(
      w,
      0.15,
      26,
      0.7,
      31,
      C.gold,
      (a, z, iw, ih) => {
        w.f(a, z, iw, ih, C.lacquerNavy, 0.016);
        w.f(a, z, iw, ih * 0.3, shade(C.lacquerNavy, 0.8), 0.017);
        const bowl: [number, number][] = [];
        for (let k = 0; k <= 12; k++) {
          const t = Math.PI + (k / 12) * Math.PI;
          bowl.push([
            a + iw * 0.42 + Math.cos(t) * iw * 0.24,
            z + ih * 0.5 + Math.sin(t) * ih * 0.24,
          ]);
        }
        w.poly(bowl, C.cream, 0.018);
        w.f(a + iw * 0.18, z + ih * 0.47, iw * 0.48, ih * 0.05, C.matcha, 0.019);
        w.f(a + iw * 0.3, z + ih * 0.24, iw * 0.24, ih * 0.03, C.goldDeep, 0.019);
        // Chasen (Besen) rechts daneben
        w.f(a + iw * 0.72, z + ih * 0.26, iw * 0.06, ih * 0.14, C.oakLight, 0.019);
        for (let k = 0; k < 5; k++)
          w.line(
            [
              [a + iw * (0.7 + k * 0.025), z + ih * 0.4],
              [a + iw * (0.69 + k * 0.03), z + ih * 0.55],
            ],
            C.paper,
            0.35,
            0.02,
          );
        w.f(a + iw * 0.06, z + ih * 0.84, iw * 0.2, ih * 0.04, C.gold, 0.019);
      },
      { mat: true, t: 2.4, depth: 0.05 },
    ),
  // Neon-Blatt mit Stiel auf Acrylplatte, Röhre mit Schein
  'wall-neon': (w) => {
    w.f(0.16, 28, 0.68, 32, C.white, 0.012);
    w.poly(
      [
        [0.16, 28],
        [0.84, 28],
        [0.84, 60],
        [0.16, 60],
      ],
      C.glass,
      0.013,
      0.18,
    );
    for (const [a, z] of [
      [0.2, 31],
      [0.8, 31],
      [0.2, 57],
      [0.8, 57],
    ] as const)
      circle(w, a, z, 0.012, C.stainless, 0.02, 8);
    const leaf: [number, number][] = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      leaf.push([0.5 + Math.sin(t * Math.PI) * 0.22, 33 + t * 22]);
    }
    for (let k = 9; k >= 1; k--) {
      const t = k / 10;
      leaf.push([0.5 - Math.sin(t * Math.PI) * 0.22, 33 + t * 22]);
    }
    leaf.push(leaf[0] ?? [0.5, 33]);
    const vein: [number, number][] = [
      [0.5, 31],
      [0.5, 52],
    ];
    const ribs: [number, number][][] = [
      [
        [0.5, 40],
        [0.36, 46],
      ],
      [
        [0.5, 40],
        [0.64, 46],
      ],
      [
        [0.5, 46],
        [0.4, 51],
      ],
      [
        [0.5, 46],
        [0.6, 51],
      ],
    ];
    const tube = (pts: readonly [number, number][], wd: number) => {
      w.line(pts, C.neon, wd * 4, 0.022, 0.18);
      w.line(pts, C.neon, wd * 2.2, 0.023, 0.35);
      w.line(pts, C.neon, wd, 0.024);
      w.line(pts, C.neonCore, wd * 0.4, 0.025);
    };
    tube(leaf, 1.1);
    tube(vein, 0.9);
    for (const r of ribs) tube(r, 0.7);
  },
  // Zwei schwebende Eichenbretter mit Messingwinkeln: Pflanze mit Ranken, Bücher, Matcha-Dosen, Becher, Glas
  'wall-shelf': (w) => {
    for (const z of [33, 47]) {
      for (const a of [0.14, 0.82]) {
        w.box(a, z - 3, 0.025, 0.1, 3, C.brass);
      }
      w.box(0.06, z, 0.88, 0.13, 1.8, C.oak);
      w.f(0.06, z - 0.2, 0.88, 0.2, shade(C.oak, 0.6), 0.131);
    }
    // unteres Brett: Dosen, Becherstapel, Glas mit Matcha
    const top1 = 34.8;
    for (const [a, col] of [
      [0.12, C.cobalt],
      [0.2, C.matcha],
      [0.28, C.sakura],
    ] as const) {
      const [u, v] = w.at(a, 0.06);
      w.c.cylinder(u, v, top1, 0.035, 6.5, col, tint(col, 0.2));
      w.c.cylinder(u, v, top1 + 6.5, 0.037, 1, C.stainless, C.stainlessLight);
    }
    for (let k = 0; k < 3; k++) {
      const [u, v] = w.at(0.62, 0.06);
      w.c.frustum(u, v, top1 + k * 1.6, 0.035, 0.045, 1.8, C.cup, C.cup);
    }
    {
      const [u, v] = w.at(0.78, 0.06);
      w.c.group(0.7, () => w.c.cylinder(u, v, top1, 0.045, 7, C.glass, tint(C.glass, 0.4)));
      w.c.cylinder(u, v, top1, 0.04, 4.5, C.matchaFoam, C.matcha);
      w.c.cylinder(u, v, top1 + 7, 0.047, 1.2, C.oak, C.oakLight);
    }
    // oberes Brett: Bücher, Pflanze mit Ranken
    const top2 = 48.8;
    const books: [number, number, string][] = [
      [0.1, 8, C.red],
      [0.15, 9.5, C.cream],
      [0.2, 7.5, C.cobalt],
      [0.25, 8.6, C.matchaDeep],
    ];
    for (const [a, h, col] of books) w.box(a, top2, 0.045, 0.09, h, col);
    w.box(0.3, top2, 0.12, 0.09, 1.6, C.gold);
    w.box(0.31, top2 + 1.6, 0.1, 0.09, 1.4, C.white);
    {
      const [u, v] = w.at(0.66, 0.065);
      w.c.frustum(u, v, top2, 0.05, 0.065, 6, C.terracotta, shade(C.terracotta, 0.7));
      for (let k = 0; k < 3; k++)
        w.line(
          [
            [0.6 + k * 0.05, top2 + 5],
            [0.58 + k * 0.06, top2 - 6 - k * 3],
          ],
          C.leaf,
          0.6,
          0.14,
        );
      for (let k = 0; k < 6; k++) {
        const [lu, lv] = w.at(0.58 + (k % 3) * 0.055, 0.14);
        w.c.dome(lu, lv, top2 - 2 - k * 1.6, 0.022, 1.6, k % 2 ? C.leafMid : C.leaf);
      }
      facetBall(w.c, u, v, top2 + 8.5, 0.07, C.leaf, {
        tones: [C.leafDeep, C.leaf, C.leafMid, C.leafLight],
        lumpy: 0.12,
        seed: 11,
      });
    }
  },
  // Messing-Wandleuchte: Rosette, Arm, Opalglas-Kugel, Lichthof auf der Wand
  'wall-sconce': (w) => {
    const glow = (r: number, op: number) => {
      const pts: [number, number][] = [];
      for (let i = 0; i < 20; i++) {
        const t = (i / 20) * Math.PI * 2;
        pts.push([0.5 + Math.cos(t) * r, 45 + Math.sin(t) * r * Z_PER_TILE * 0.9]);
      }
      w.poly(pts, C.glow, 0.008, op);
    };
    glow(0.3, 0.12);
    glow(0.2, 0.16);
    circle(w, 0.5, 40, 0.05, shade(C.brass, 0.8), 0.012, 14);
    circle(w, 0.5, 40, 0.035, C.brass, 0.016, 12);
    const [u0, v0] = w.at(0.5, 0.02);
    const [u1, v1] = w.at(0.5, 0.17);
    strut(w.c, [u0, v0, 40], [u1, v1, 41.5], C.brass, 1.3);
    strut(w.c, [u1, v1, 41.5], [u1, v1, 43.5], C.brass, 1.6);
    w.c.cylinder(u1, v1, 43, 0.035, 1.4, C.brass, tint(C.brass, 0.35));
    w.c.glowFlat(u1 - 0.18, v1 - 0.18, 45, 0.36, 0.36, C.glow, 0.45, 2.5);
    facetBall(w.c, u1, v1, 48.5, 0.075, C.white, { seg: 10, rings: 6, sun: C.led });
    w.c.disc(u1 - 0.02, v1 - 0.01, 50.5, 0.02, C.led);
  },
  // Makramee-Ampeln: geknotete Kordeln, Topf, Hängepflanzen mit Ranken
  'wall-plants': (w) => {
    for (const [a, z, col] of [
      [0.28, 34, C.white],
      [0.7, 40, C.terracotta],
    ] as const) {
      const [u, v] = w.at(a, 0.16);
      // Haken in der Wand, Kordeln zum Topf
      w.box(a - 0.01, z + 22, 0.02, 0.1, 0.8, C.brass);
      for (const da of [-0.05, 0, 0.05]) {
        const [pu, pv] = w.at(a + da, 0.16 + (da === 0 ? 0.05 : 0));
        strut(w.c, [u, v, z + 22], [pu, pv, z + 6.5], C.paper, 0.45);
      }
      for (const kz of [z + 12, z + 9]) w.c.disc(u, v, kz, 0.012, C.paper);
      w.c.frustum(u, v, z, 0.055, 0.075, 6.5, col, shade(col, 0.7));
      facetBall(w.c, u, v, z + 8, 0.085, C.leaf, {
        tones: [C.leafDeep, C.leaf, C.leafMid, C.leafLight],
        lumpy: 0.15,
        seed: Math.round(a * 100),
      });
      for (let k = 0; k < 4; k++) {
        const da = -0.07 + k * 0.045;
        const len = 9 - (k % 2) * 3;
        const [su, sv] = w.at(a + da, 0.2);
        strut(w.c, [su, sv, z + 3], [su, sv, z - len], C.leafDeep, 0.6);
        for (let m = 0; m < 3; m++)
          w.c.dome(su, sv, z + 1 - m * (len / 3), 0.02, 1.4, m % 2 ? C.leafMid : C.leaf);
      }
    }
  },
  // Bahnhofsuhr: dicker Rand mit Tiefe, Stundenstriche, Zeiger, roter Sekundenzeiger mit Kelle
  'wall-clock': (w) => {
    const zc = 46;
    for (const [d, col] of [
      [0.012, shade(C.ink, 0.7)],
      [0.03, C.ink],
    ] as const)
      circle(w, 0.5, zc, 0.21, col, d, 28);
    circle(w, 0.5 + 0.003, zc + 0.3, 0.205, tint(C.ink, 0.25), 0.031, 28);
    circle(w, 0.5, zc, 0.175, C.white, 0.033, 28);
    for (let k = 0; k < 12; k++) {
      const t = (k / 12) * Math.PI * 2;
      const r0 = k % 3 ? 0.15 : 0.135;
      w.line(
        [
          [0.5 + Math.cos(t) * r0, zc + Math.sin(t) * r0 * Z_PER_TILE],
          [0.5 + Math.cos(t) * 0.165, zc + Math.sin(t) * 0.165 * Z_PER_TILE],
        ],
        C.ink,
        k % 3 ? 0.5 : 0.9,
        0.034,
      );
    }
    const hand = (ang: number, len: number, wd: number, col: string) =>
      w.line(
        [
          [0.5 - Math.cos(ang) * 0.02, zc - Math.sin(ang) * 0.02 * Z_PER_TILE],
          [0.5 + Math.cos(ang) * len, zc + Math.sin(ang) * len * Z_PER_TILE],
        ],
        col,
        wd,
        0.036,
      );
    hand(Math.PI * 0.62, 0.1, 1.2, C.ink);
    hand(Math.PI * 0.08, 0.15, 0.9, C.ink);
    hand(Math.PI * 1.35, 0.13, 0.4, C.red);
    circle(
      w,
      0.5 + Math.cos(Math.PI * 1.35) * 0.11,
      zc + Math.sin(Math.PI * 1.35) * 0.11 * Z_PER_TILE,
      0.022,
      C.red,
      0.037,
      10,
    );
    circle(w, 0.5, zc, 0.012, C.ink, 0.038, 8);
  },
  // Gerahmte Schallplatten und ein Plattencover
  'wall-records': (w) => {
    const rec = (a: number, z: number, label: string) => {
      frame(
        w,
        a,
        z,
        0.36,
        14,
        C.ink,
        (ia, iz, iw, ih) => {
          w.f(ia, iz, iw, ih, shade(C.ink, 1.3), 0.016);
          const ca = ia + iw / 2;
          const cz = iz + ih / 2;
          circle(w, ca, cz, iw * 0.42, C.rubber, 0.018, 20);
          for (const k of [0.34, 0.27]) circle(w, ca, cz, iw * k, shade(C.rubber, 1.5), 0.019, 18);
          for (const k of [0.31, 0.24]) circle(w, ca, cz, iw * k, C.rubber, 0.0195, 18);
          circle(w, ca, cz, iw * 0.13, label, 0.02, 12);
          circle(w, ca, cz, iw * 0.02, C.white, 0.021, 6);
          w.poly(
            [
              [ca - iw * 0.3, cz + ih * 0.15],
              [ca - iw * 0.1, cz + ih * 0.3],
              [ca - iw * 0.08, cz + ih * 0.26],
              [ca - iw * 0.28, cz + ih * 0.11],
            ],
            C.white,
            0.021,
            0.3,
          );
        },
        { mat: false, t: 1, depth: 0.03 },
      );
    };
    rec(0.08, 30, C.sakura);
    rec(0.54, 36, C.cobalt);
    // Cover: Farbfeld mit Kreis und Streifen
    frame(
      w,
      0.3,
      47,
      0.34,
      13,
      C.ink,
      (ia, iz, iw, ih) => {
        w.f(ia, iz, iw, ih, C.gold, 0.016);
        circle(w, ia + iw * 0.4, iz + ih * 0.55, iw * 0.28, C.red, 0.017, 16);
        for (let k = 0; k < 3; k++)
          w.f(ia, iz + ih * (0.1 + k * 0.12), iw, ih * 0.05, C.ink, 0.018);
      },
      { mat: false, t: 1, depth: 0.03 },
    );
  },
};

// ---------------------------------------------------------------------------------------------
// Boden-Deko (Leinwand wie Ausstattung/Ambiente)
// ---------------------------------------------------------------------------------------------
function canvas(): IsoCanvas {
  return new IsoCanvas(STATION_CANVAS.w, STATION_CANVAS.h, STATION_CANVAS.ox, STATION_CANVAS.oy);
}

/**
 * Flaches Blatt in einer geneigten Ebene: Basis b, Richtung `ang` (Bogenmaß in u/v), Länge `len` (Kacheln),
 * Neigung `tilt` (Pixel Höhenänderung zur Spitze, negativ = hängt), Breite relativ zur Länge. Zwei Hälften mit
 * leicht verschiedener Helligkeit (Mittelrippe als Falz); `slits` schneidet Schlitze (Monstera).
 */
function flatLeaf(
  c: IsoCanvas,
  b: Vec3,
  ang: number,
  len: number,
  tilt: number,
  width: number,
  color: string,
  slits = 0,
) {
  const du = Math.cos(ang) * len;
  const dv = Math.sin(ang) * len;
  const pu = -Math.sin(ang) * len * width;
  const pv = Math.cos(ang) * len * width;
  const P = (s: number, q: number): Vec3 => [
    b[0] + du * s + pu * q,
    b[1] + dv * s + pv * q,
    b[2] + tilt * s,
  ];
  const nz = len * len * width;
  const n: Vec3 = [
    (-tilt / Z_PER_TILE) * Math.cos(ang) * len * width,
    (-tilt / Z_PER_TILE) * Math.sin(ang) * len * width,
    nz,
  ];
  const nl = Math.hypot(n[0], n[1], n[2]) || 1;
  const L = facetLight([n[0] / nl, n[1] / nl, n[2] / nl]);
  const half = (q: number, s: number) =>
    Math.sin(Math.min(1, s * 1.04) * Math.PI) * 0.5 * q * (s < 0.15 ? 0.55 + s * 3 : 1);
  for (const side of [1, -1]) {
    const col = lit(color, L + (side > 0 ? 0.07 : -0.07));
    const pts: Vec3[] = [P(0, 0)];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      pts.push(P(t, side * half(1, t)));
    }
    c.poly(pts, col);
    // Schlitze vom Rand zur Mittelrippe (dunkle Keile)
    for (let g = 1; g <= slits; g++) {
      const t = g / (slits + 1);
      c.poly(
        [
          P(t - 0.025, side * half(1, t - 0.025)),
          P(t + 0.03, side * half(1, t + 0.03)),
          P(t + 0.01, side * 0.12),
        ],
        lit(color, L - 0.28),
      );
    }
  }
  strut(c, P(0, 0), P(0.92, 0), lit(color, L + 0.18), 0.35);
}

const FLOOR_ITEMS: Record<string, (c: IsoCanvas) => void> = {
  // Berber-Teppich unter den Wintergarten-Tischen: Fransen, Bordüren, Rautenband
  'deco-rug': (c) => {
    // Passt ganz in die Kachel-Leinwand (vorher ragten die Ecken über den Rand)
    const [u0, u1, v0, v1] = [-0.06, 1.06, 0.1, 0.9];
    for (let k = 0; k <= 10; k++) {
      const v = v0 + 0.04 + k * ((v1 - v0 - 0.08) / 10);
      strut(c, [u0, v, 0.02], [u0 - 0.035, v, 0.02], C.linen, 0.5);
      strut(c, [u1, v, 0.02], [u1 + 0.035, v, 0.02], C.linen, 0.5);
    }
    const inset = (k: number, col: string, z: number) =>
      c.flat(u0 + k, v0 + k, z, u1 - u0 - 2 * k, v1 - v0 - 2 * k, col);
    inset(0, C.linen, 0);
    inset(0.04, tint(C.terracotta, 0.4), 0.01);
    inset(0.075, C.linen, 0.02);
    inset(0.105, tint(C.terracotta, 0.75), 0.025);
    for (let k = 0; k < 5; k++) {
      const u = u0 + 0.16 + k * 0.17;
      const col = k % 2 ? C.cobalt : C.terracotta;
      const vm = (v0 + v1) / 2;
      c.poly(
        [
          [u, vm, 0.03],
          [u + 0.075, vm - 0.14, 0.03],
          [u + 0.15, vm, 0.03],
          [u + 0.075, vm + 0.14, 0.03],
        ],
        col,
      );
      c.poly(
        [
          [u + 0.05, vm, 0.035],
          [u + 0.075, vm - 0.05, 0.035],
          [u + 0.1, vm, 0.035],
          [u + 0.075, vm + 0.05, 0.035],
        ],
        C.linen,
      );
    }
    for (const v of [v0 + 0.15, v1 - 0.15])
      c.flat(u0 + 0.12, v - 0.01, 0.03, u1 - u0 - 0.24, 0.02, C.ink);
  },
  // Monstera im Keramiktopf: geschlitzte Blätter an Stielen, Licht oben links
  'deco-monstera': (c) => {
    c.shadowDisc(0.5, 0.5, 0, 0.26, 0.24, 2);
    c.frustum(0.5, 0.5, 0, 0.12, 0.16, 13, C.white, shade(C.white, 0.85));
    c.shine(0.5, 0.5, 1, 0.15, 11, C.white, 0.5);
    c.cylinder(0.5, 0.5, 12, 0.165, 1.4, tint(C.stone, 0.5), shade(C.white, 0.85));
    c.disc(0.5, 0.5, 13.4, 0.14, C.soil);
    const leaves: [number, number, number, number, string][] = [
      [Math.PI * 1.25, 0.34, 28, 4, C.leaf],
      [Math.PI * 1.7, 0.34, 33, 3, C.leafMid],
      [Math.PI * 0.85, 0.32, 24, -2, C.leaf],
      [Math.PI * 1.0, 0.3, 38, 5, C.leafMid],
      [Math.PI * 0.2, 0.3, 26, -5, C.leafMid],
      [Math.PI * 1.45, 0.3, 42, 4, C.leafLight],
      [Math.PI * 0.5, 0.3, 30, -4, C.leaf],
    ];
    for (const [ang, len, z, tilt, col] of leaves) {
      const bu = 0.5 + Math.cos(ang) * 0.03;
      const bv = 0.5 + Math.sin(ang) * 0.03;
      strut(
        c,
        [0.5, 0.5, 13.5],
        [bu + Math.cos(ang) * 0.02, bv + Math.sin(ang) * 0.02, z],
        C.leafDeep,
        0.9,
      );
      flatLeaf(c, [bu, bv, z], ang, len, tilt, 0.75, col, 2);
    }
  },
  // Bogenleuchte: Marmorfuß, Messingbogen, Stoffschirm mit warmem Licht, Lichtkegel auf dem Boden
  'deco-floorlamp': (c) => {
    c.shadowDisc(0.36, 0.5, 0, 0.15, 0.26);
    c.glowFlat(0.5, 0.32, 0.5, 0.48, 0.48, C.glow, 0.3, 3);
    c.cylinder(0.36, 0.5, 0, 0.12, 2.6, C.marble, C.marble);
    c.cylinder(0.36, 0.5, 2.6, 0.04, 1.2, C.brass, tint(C.brass, 0.35));
    const arc: Vec3[] = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      arc.push([0.36 + t * 0.38, 0.5, 3.8 + Math.sin(t * Math.PI * 0.62) * 46]);
    }
    polyline(c, arc, shade(C.brass, 0.85), 1.6);
    polyline(
      c,
      arc.map(([u, v, z]) => [u - 0.006, v, z + 0.5] as Vec3),
      tint(C.brass, 0.4),
      0.6,
    );
    const top = arc[arc.length - 1] ?? [0.74, 0.5, 40];
    c.glowFlat(0.58, 0.34, top[2] - 9, 0.32, 0.32, C.glow, 0.5, 2.5);
    c.frustum(0.74, 0.5, top[2] - 9, 0.12, 0.065, 8.5, C.linen, shade(C.linen, 0.8));
    c.disc(0.74, 0.5, top[2] - 9.2, 0.1, C.led);
    c.cylinder(0.74, 0.5, top[2] - 0.6, 0.02, 1.2, C.brass, tint(C.brass, 0.3));
  },
  // Pflanzengruppe: Bogenhanf im Kobalttopf, Farn im Terrakottatopf, Olivenbäumchen im weißen Topf
  'deco-plants': (c) => {
    c.shadow(0.12, 0.22, 0, 0.76, 0.6, 0.24);
    // Bogenhanf
    c.frustum(0.3, 0.38, 0, 0.09, 0.11, 10, C.cobalt, shade(C.cobalt, 0.7));
    c.cylinder(0.3, 0.38, 9.4, 0.115, 1.2, tint(C.cobalt, 0.15), C.soil);
    const swords: [number, number, number][] = [
      [-0.04, 0.0, 22],
      [0.03, -0.02, 27],
      [0.0, 0.04, 19],
      [0.05, 0.03, 24],
      [-0.05, -0.04, 25],
    ];
    for (const [du, dv, h] of swords) {
      const u = 0.3 + du;
      const v = 0.38 + dv;
      c.poly(
        [
          [u - 0.025, v, 10.6],
          [u + 0.025, v, 10.6],
          [u + 0.008 + du * 0.3, v, 10.6 + h],
        ],
        h > 23 ? C.leafDeep : C.leaf,
      );
      c.poly(
        [
          [u - 0.025, v, 10.6],
          [u - 0.018, v, 10.6],
          [u + 0.004 + du * 0.3, v, 10.6 + h * 0.96],
        ],
        C.snakeEdge,
      );
    }
    // Farn
    c.frustum(0.66, 0.42, 0, 0.09, 0.115, 8, C.terracotta, shade(C.terracotta, 0.7));
    c.cylinder(0.66, 0.42, 8, 0.12, 1.4, tint(C.terracotta, 0.12), C.soil);
    for (let k = 0; k < 9; k++) {
      const ang = (k / 9) * Math.PI * 2 + 0.2;
      flatLeaf(c, [0.66, 0.42, 10.5], ang, 0.2, -5 + (k % 3), 0.28, k % 2 ? C.fern : C.fernLight);
    }
    facetBall(c, 0.66, 0.42, 12.5, 0.07, C.fern, {
      tones: [shade(C.fern, 0.75), C.fern, C.fernLight],
      lumpy: 0.15,
    });
    // Olivenbäumchen
    c.frustum(0.48, 0.66, 0, 0.1, 0.12, 12, C.white, shade(C.white, 0.82));
    c.disc(0.48, 0.66, 12, 0.105, C.soil);
    strut(c, [0.48, 0.66, 12], [0.47, 0.65, 24], C.driftwood, 1.6);
    crown(
      c,
      [
        [0.45, 0.64, 27, 0.11],
        [0.53, 0.68, 26, 0.1],
        [0.48, 0.65, 33, 0.1],
      ],
      C.olive,
      { tones: [shade(C.olive, 0.8), C.olive, C.oliveLight, tint(C.oliveLight, 0.3)], seed: 21 },
    );
  },
  // Olivenbaum im Messingkübel mit Nachtblau-Band (Endausbau): knorriger Stamm, silbrige Krone
  'deco-olive': (c) => {
    c.shadowDisc(0.5, 0.5, 0, 0.3, 0.24, 2.4);
    c.frustum(0.5, 0.5, 0, 0.15, 0.18, 15, C.brass, shade(C.brass, 0.7));
    c.shine(0.5, 0.5, 0, 0.17, 15, C.brass, 0.45);
    c.cylinder(0.5, 0.5, 5, 0.172, 3, C.lacquerNavy, shade(C.brass, 0.7));
    c.cylinder(0.5, 0.5, 14.4, 0.185, 1.2, tint(C.brass, 0.25), shade(C.brass, 0.6));
    c.disc(0.5, 0.5, 15.6, 0.15, C.soil);
    strut(c, [0.5, 0.5, 15.5], [0.47, 0.49, 24], C.driftwood, 2.6);
    strut(c, [0.47, 0.49, 24], [0.52, 0.51, 30], C.driftwood, 2.2);
    strut(c, [0.47, 0.49, 24], [0.4, 0.47, 31], tint(C.driftwood, 0.15), 1.6);
    strut(c, [0.52, 0.51, 30], [0.58, 0.55, 34], tint(C.driftwood, 0.15), 1.3);
    crown(
      c,
      [
        [0.32, 0.44, 35, 0.13, -1],
        [0.62, 0.42, 36, 0.13, -1],
        [0.5, 0.64, 33, 0.13, -1],
        [0.66, 0.6, 34, 0.11, -1],
        [0.42, 0.5, 42, 0.15, 0],
        [0.58, 0.54, 43, 0.14, 0],
        [0.5, 0.44, 48, 0.12, 0],
      ],
      C.olive,
      {
        tones: [shade(C.olive, 0.75), C.olive, C.oliveLight, tint(C.oliveLight, 0.35)],
        seed: 17,
      },
    );
  },
  // Marmorsockel mit Profilen und Adern, darauf goldene Matcha-Schale mit Besen auf Lackständer
  'deco-sculpture': (c) => {
    c.shadow(0.27, 0.27, 0, 0.46, 0.46, 0.26);
    c.bevel(0.28, 0.28, 0, 0.44, 0.44, 2.4, C.marble, { b: 0.8, edge: 0.3 });
    c.bevel(0.32, 0.32, 2.4, 0.36, 0.36, 21, C.marble, { b: 0.8 });
    for (const [z0, z1, du] of [
      [4, 18, 0.1],
      [8, 21, 0.24],
    ] as const)
      strut(c, [0.32 + du, 0.68, z0], [0.32 + du + 0.06, 0.68, z1], C.marbleVein, 0.5);
    strut(c, [0.68, 0.4, 6], [0.68, 0.5, 19], C.marbleVein, 0.5);
    c.box(0.31, 0.31, 22.6, 0.38, 0.38, 0.8, C.gold);
    c.bevel(0.29, 0.29, 23.4, 0.42, 0.42, 2.2, C.marble, { b: 0.8, edge: 0.35 });
    c.bevel(0.42, 0.42, 25.6, 0.16, 0.16, 1.4, C.lacquerNavy, { b: 0.4 });
    c.glowFlat(0.36, 0.36, 27, 0.28, 0.28, C.glow, 0.35, 2);
    c.frustum(0.5, 0.5, 27, 0.06, 0.13, 7, C.gold, C.matchaFoam);
    c.shine(0.5, 0.5, 27, 0.11, 7, C.gold, 0.55);
    c.disc(0.5, 0.5, 34, 0.1, C.matcha);
    c.disc(0.47, 0.48, 34.05, 0.04, C.matchaFoam);
    c.frustum(0.64, 0.42, 27, 0.028, 0.034, 3, C.oakLight, C.oakLight);
    c.frustum(0.64, 0.42, 30, 0.034, 0.05, 4, C.paper, tint(C.paper, 0.4));
  },
};

/** Große Leinwand für Teppiche und Hocker über mehrere Kacheln (`DECOR_BIG`). */
const BIG = DECOR_BIG;

const BIG_ITEMS: Record<string, (c: IsoCanvas) => void> = {
  // Kronleuchter über dem Mittelgang (Endausbau): Messing, zwei Kerzenkränze, Kristallbehang
  'deco-chandelier': (c) => {
    const u = 0.5;
    const v = 0.5;
    strut(c, [u, v, 120], [u, v, 91], C.ink, 0.6, 0.6);
    c.cylinder(u, v, 88, 0.06, 4, C.brass, tint(C.brass, 0.3));
    c.cylinder(u, v, 62, 0.022, 26, C.brass);
    c.shine(u, v, 62, 0.022, 26, C.brass, 0.5);
    for (const z of [70, 80]) facetBall(c, u, v, z, 0.04, C.brass, { seg: 8, rings: 4 });
    c.dome(u, v, 58, 0.07, 6, C.brass);
    const ring = (z: number, r: number, n: number, arm: number) => {
      c.disc(u, v, z, r, shade(C.brass, 0.75));
      c.disc(u, v, z + 0.5, r * 0.84, tint(C.brass, 0.15));
      c.disc(u, v, z + 0.6, r * 0.7, shade(C.brass, 0.85));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + 0.3;
        const x = u + Math.cos(a) * r;
        const y = v + Math.sin(a) * r;
        const front = Math.cos(a) + Math.sin(a) > -0.3;
        // Kristalltropfen an Kettchen
        strut(c, [x, y, z], [x, y, z - 2.4], C.crystal, 0.4, 0.8);
        c.poly(
          [
            [x, y, z - 2.2],
            [x + 0.014, y, z - 4],
            [x, y, z - 6.6],
            [x - 0.014, y, z - 4],
          ],
          front ? C.crystal : shade(C.crystal, 0.85),
        );
        c.poly(
          [
            [x, y, z - 2.2],
            [x + 0.014, y, z - 4],
            [x, y, z - 4.4],
          ],
          C.white,
        );
        c.cylinder(x, y, z, 0.03, 1.4, C.brass, tint(C.brass, 0.3));
        c.cylinder(x, y, z + 1.4, 0.014, arm, C.cream, C.white);
        c.glowFlat(x - 0.06, y - 0.06, z + arm + 2.6, 0.12, 0.12, C.glow, 0.7, 1.4);
        c.dome(x, y, z + arm + 1.4, 0.016, 2.8, C.led);
      }
    };
    ring(64, 0.46, 12, 4.4);
    ring(75, 0.28, 8, 3.6);
    c.cylinder(u, v, 64, 0.06, 2.2, C.brass, tint(C.brass, 0.35));
    facetBall(c, u, v, 81, 0.045, C.gold, { seg: 8, rings: 4 });
  },
  // Läufer unter einer Tischgruppe (zwei Tische entlang x): Kobalt, heller Rand, Rautenband, Fransen
  'deco-rug-blue': (c) => {
    for (let k = 0; k < 10; k++) {
      const v = 0.0 + k * 0.11;
      strut(c, [-1.45, v, 0.02], [-1.52, v, 0.02], C.white, 0.6);
      strut(c, [2.45, v, 0.02], [2.52, v, 0.02], C.white, 0.6);
    }
    c.flat(-1.45, -0.05, 0, 3.9, 1.1, C.white);
    c.flat(-1.39, 0.01, 0.01, 3.78, 0.98, C.cobalt);
    c.flat(-1.31, 0.09, 0.02, 3.62, 0.82, C.cobaltDeep);
    c.flat(-1.27, 0.13, 0.025, 3.54, 0.74, C.cobalt);
    for (let k = 0; k < 14; k++) {
      const u0 = -1.18 + k * 0.25;
      for (const v of [0.18, 0.82])
        c.poly(
          [
            [u0, v, 0.03],
            [u0 + 0.06, v - 0.035, 0.03],
            [u0 + 0.12, v, 0.03],
            [u0 + 0.06, v + 0.035, 0.03],
          ],
          C.white,
        );
    }
    for (const u of [-1.2, 2.1]) c.flat(u, 0.25, 0.03, 0.08, 0.5, tint(C.cobaltLight, 0.4));
  },
};

/** Pendelleuchte über einem Tisch: dünnes Kabel nach oben, Emailschirm mit Messingkappe, Birne, Lichtkegel. */
function pendant(c: IsoCanvas) {
  c.glowFlat(0.24, 0.24, 15.6, 0.52, 0.52, C.glow, 0.34, 2.6);
  strut(c, [0.5, 0.5, 72], [0.5, 0.5, 58], C.ink, 0.45, 0.35);
  strut(c, [0.5, 0.5, 58], [0.5, 0.5, 46.5], C.ink, 0.5);
  c.cylinder(0.5, 0.5, 45, 0.028, 1.6, C.brass, tint(C.brass, 0.35));
  c.glowFlat(0.4, 0.4, 37, 0.2, 0.2, C.glow, 0.5, 1.5);
  c.frustum(0.5, 0.5, 39, 0.125, 0.04, 6.4, C.cobalt, C.cobaltDeep);
  c.shine(0.5, 0.5, 39, 0.1, 6, C.cobalt, 0.35);
  c.cylinder(0.5, 0.5, 38.6, 0.126, 0.6, C.white, C.white);
  c.dome(0.5, 0.5, 37.4, 0.05, 2.2, C.led);
}

/** Pendelleuchte im Endausbau: Messingstange, Opalglas-Kugel mit Messingkappe, warmer Schein. */
function pendantLux(c: IsoCanvas) {
  c.glowFlat(0.2, 0.2, 15.6, 0.6, 0.6, C.glow, 0.42, 3);
  strut(c, [0.5, 0.5, 72], [0.5, 0.5, 60], C.brass, 0.7, 0.4);
  strut(c, [0.5, 0.5, 60], [0.5, 0.5, 47], C.brass, 0.8);
  c.cylinder(0.5, 0.5, 46, 0.035, 2, C.brass, tint(C.brass, 0.35));
  c.glowFlat(0.36, 0.36, 37, 0.28, 0.28, C.glow, 0.5, 2);
  facetBall(c, 0.5, 0.5, 40.5, 0.11, C.white, { seg: 11, rings: 6, sun: C.led });
  c.cylinder(0.5, 0.5, 44.6, 0.05, 1.6, C.brass, tint(C.brass, 0.35));
}

/** Drei Barhocker vor der Theke: Edelstahl mit Fußring, gepolsterter blauer Sitz mit Keder, Bodenplatte. */
function stools(c: IsoCanvas) {
  for (const u of [-0.45, 0.5, 1.45]) {
    c.shadowDisc(u, 0.5, 0, 0.15, 0.26);
    c.cylinder(u, 0.5, 0, 0.12, 1.2, C.stainlessDark, C.stainless);
    c.cylinder(u, 0.5, 1.2, 0.022, 15, C.stainless);
    c.shine(u, 0.5, 1.2, 0.022, 15, C.stainless, 0.5);
    c.cylinder(u, 0.5, 7, 0.09, 0.7, C.stainlessDark, C.stainless);
    c.cylinder(u, 0.5, 15.6, 0.06, 0.8, C.stainlessDark);
    c.cylinder(u, 0.5, 16.4, 0.125, 2.6, C.cobalt, C.cobaltLight);
    c.cylinder(u, 0.5, 18.4, 0.127, 0.5, C.cobaltDeep, C.cobaltLight);
    c.disc(u - 0.02, 0.49, 19.01, 0.06, tint(C.cobaltLight, 0.25));
  }
}

/**
 * Sonnenschirm über einem Terrassen-Tisch: acht Bahnen mit Rippen, Volant mit Bögen, Mast mit Kurbel und Spitze.
 */
function umbrella(c: IsoCanvas, a: string, b: string, z: number, r = 25) {
  c.cylinder(0.5, 0.5, 15.5, 0.018, z - 15.5, C.white);
  c.shine(0.5, 0.5, 15.5, 0.018, z - 15.5, C.white, 0.4);
  c.cylinder(0.5, 0.5, 30, 0.03, 2, C.stainlessDark);
  const [cx, cy] = c.p([0.5, 0.5, z]);
  const f = (n: number) => n.toFixed(1);
  const rim = (t: number): [number, number] => [cx + Math.cos(t) * r, cy + Math.sin(t) * r * 0.5];
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2;
    const a1 = ((i + 1) / 8) * Math.PI * 2;
    const litSide = Math.sin((a0 + a1) / 2) > 0;
    const col = i % 2 ? b : a;
    const [x0, y0] = rim(a0);
    const [x1, y1] = rim(a1);
    c.raw(
      `<polygon points="${f(cx)},${f(cy - 6.5)} ${f(x0)},${f(y0)} ${f(x1)},${f(y1)}" fill="${litSide ? col : shade(col, SHADE.left)}"/>`,
    );
    if (litSide) {
      // Volant: Bogenkante unter dem Saum
      const pts: string[] = [];
      for (let k = 0; k <= 5; k++) {
        const t = a0 + ((a1 - a0) * k) / 5;
        const [x, y] = rim(t);
        pts.push(`${f(x)},${f(y + 2.4 + Math.sin((k / 5) * Math.PI) * 1.3)}`);
      }
      c.raw(
        `<polygon points="${f(x0)},${f(y0)} ${f(x1)},${f(y1)} ${pts.reverse().join(' ')}" fill="${shade(col, 0.78)}"/>`,
      );
    }
  }
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2;
    if (Math.sin(t) < -0.2) continue;
    const [x, y] = rim(t);
    c.raw(
      `<line x1="${f(cx)}" y1="${f(cy - 6.5)}" x2="${f(x)}" y2="${f(y)}" stroke="${C.white}" stroke-width="0.35" stroke-opacity="0.55"/>`,
    );
  }
  c.raw(`<circle cx="${f(cx)}" cy="${f(cy - 7)}" r="1.4" fill="${shade(a, 0.8)}"/>`);
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
  const pl = canvas();
  pendantLux(pl);
  out.push({ name: 'deco-pendant-lux', svg: pl.svg() });
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
  'deco-pendant-lux',
  'deco-stools',
];
