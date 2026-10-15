/**
 * Ausstattung im Hotel-Empire-Look (UI_STYLE § 4): Theke, Geräte der Barista-Theke, Kasse, Ausgabe, Tische.
 * Jedes Gerät hat fünf Ausbaustufen (`STATION_LOOK_LEVELS`, an den Meilensteinen Level 1/10/25/50/100). Von
 * Stufe zu Stufe wird es edler: mehr Teile, bessere Geräte und eine durchgehende Material-Leiter
 * Kobalt-Lack/Edelstahl → Edelstahl/Terrazzo → blaue Fliesen/Quarz → Nussbaum/Marmor/Messing → Nachtblau/Marmor/Gold. Selbst gezeichnet, CC0.
 *
 * Koordinaten („Theken-Koordinaten“): x quer, y Tiefe (0 = hinten/Wand bzw. Personalseite, 1 = Gastraum),
 * z Höhe in Pixeln. Variante „a“: Front zeigt nach +v, „b“: nach +u (gespiegelt).
 */
import { COUNTER_TOP_PX } from '@data/art';
import { LAYOUTS } from '@data/layouts';
import { IsoCanvas, SHADE, shade, tint, type Vec3 } from './iso';
import { C } from './palette';
import type { SpriteDef } from './sprites';

/** Kachel-Sprite 64×104, untere Spitze der Kachel = Unterkante (Ursprung 0.5 / 1). */
export const STATION_CANVAS = { w: 64, h: 104, ox: 32, oy: 72 } as const;

export type Facing = 'a' | 'b';
export type Tier = 1 | 2 | 3 | 4 | 5;
export const TIERS: readonly Tier[] = [1, 2, 3, 4, 5];

/** Oberkante der Gästetheke (Pixel, gemeinsam mit der Szene: `COUNTER_TOP_PX`). */
export const COUNTER_TOP = COUNTER_TOP_PX;
const BACK_TOP = 27;

type P2 = readonly [number, number];

/** Spiegelt Grid-Koordinaten, damit eine Zeichnung für beide Blickrichtungen taugt. */
export class FacingCanvas extends IsoCanvas {
  constructor(
    readonly facing: Facing,
    w: number = STATION_CANVAS.w,
    h: number = STATION_CANVAS.h,
    ox: number = STATION_CANVAS.ox,
    oy: number = STATION_CANVAS.oy,
  ) {
    super(w, h, ox, oy);
  }
  private uv(x: number, y: number): [number, number] {
    return this.facing === 'a' ? [x, y] : [y, x];
  }
  /** Farbe einer Fläche, die zum Gastraum zeigt (Front), bzw. zur Seite (+x). */
  frontShade(color: string): string {
    return shade(color, this.facing === 'a' ? SHADE.left : SHADE.right);
  }
  sideShade(color: string): string {
    return shade(color, this.facing === 'a' ? SHADE.right : SHADE.left);
  }
  fbox(
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    h: number,
    color: string,
    o: { top?: string } = {},
  ): this {
    return this.facing === 'a'
      ? this.box(x, y, z, w, d, h, color, o)
      : this.box(y, x, z, d, w, h, color, o);
  }
  /** Quader mit Fase; `front`/`side` schalten die Fase der Front- bzw. Seitenkante, `frontColor` färbt die Front. */
  fbevel(
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    h: number,
    color: string,
    o: {
      b?: number;
      top?: string;
      edge?: number;
      front?: boolean;
      side?: boolean;
      frontColor?: string;
    } = {},
  ): this {
    const front = o.front ?? true;
    const side = o.side ?? true;
    const fc = o.frontColor ? this.frontShade(o.frontColor) : undefined;
    return this.facing === 'a'
      ? this.bevel(x, y, z, w, d, h, color, {
          b: o.b,
          top: o.top,
          edge: o.edge,
          left: fc,
          chamferLeft: front,
          chamferRight: side,
        })
      : this.bevel(y, x, z, d, w, h, color, {
          b: o.b,
          top: o.top,
          edge: o.edge,
          right: fc,
          chamferLeft: side,
          chamferRight: front,
        });
  }
  fcyl(x: number, y: number, z: number, r: number, h: number, color: string, top?: string): this {
    const [u, v] = this.uv(x, y);
    return this.cylinder(u, v, z, r, h, color, top);
  }
  ffrustum(
    x: number,
    y: number,
    z: number,
    r0: number,
    r1: number,
    h: number,
    color: string,
    top?: string,
  ): this {
    const [u, v] = this.uv(x, y);
    return this.frustum(u, v, z, r0, r1, h, color, top);
  }
  fdome(x: number, y: number, z: number, r: number, hz: number, color: string): this {
    const [u, v] = this.uv(x, y);
    return this.dome(u, v, z, r, hz, color);
  }
  fshine(x: number, y: number, z: number, r: number, h: number, color: string, f = 0.5): this {
    const [u, v] = this.uv(x, y);
    return this.shine(u, v, z, r, h, color, f);
  }
  fdisc(x: number, y: number, z: number, r: number, color: string): this {
    const [u, v] = this.uv(x, y);
    return this.disc(u, v, z, r, color);
  }
  fflat(x: number, y: number, z: number, w: number, d: number, color: string, opacity = 1): this {
    return this.facing === 'a'
      ? this.flat(x, y, z, w, d, color, opacity)
      : this.flat(y, x, z, d, w, color, opacity);
  }
  fshadow(x: number, y: number, z: number, w: number, d: number, opacity?: number): this {
    return this.facing === 'a'
      ? this.shadow(x, y, z, w, d, opacity)
      : this.shadow(y, x, z, d, w, opacity);
  }
  fshadowDisc(x: number, y: number, z: number, r: number, opacity?: number): this {
    const [u, v] = this.uv(x, y);
    return this.shadowDisc(u, v, z, r, opacity);
  }
  fglow(
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    color: string,
    opacity?: number,
    blur?: number,
  ): this {
    return this.facing === 'a'
      ? this.glowFlat(x, y, z, w, d, color, opacity, blur)
      : this.glowFlat(y, x, z, d, w, color, opacity, blur);
  }
  fpoly(pts: readonly Vec3[], color: string, opacity = 1): this {
    return this.poly(
      pts.map(([x, y, z]) => (this.facing === 'a' ? [x, y, z] : [y, x, z]) as Vec3),
      color,
      opacity,
    );
  }
  /** Senkrechte Fläche zum Gastraum in der Tiefe y; Farbe als Material, schattiert wie eine Front. */
  front(x: number, y: number, z: number, w: number, h: number, color: string): this {
    return this.frontLit(x, y, z, w, h, this.frontShade(color));
  }
  /** Wie `front`, aber ohne Schattierung (Display, Glut, Licht). */
  frontLit(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    color: string,
    opacity = 1,
  ): this {
    return this.fpoly(
      [
        [x, y, z],
        [x + w, y, z],
        [x + w, y, z + h],
        [x, y, z + h],
      ],
      color,
      opacity,
    );
  }
  /** Polygon auf der Frontebene y, Punkte als [x, z]. */
  frontPoly(y: number, pts: readonly P2[], color: string, opacity = 1): this {
    return this.fpoly(
      pts.map(([x, z]) => [x, y, z] as Vec3),
      color,
      opacity,
    );
  }
  /** Senkrechte Fläche zur Seite (+x) in der Ebene x, von y bis y + d. */
  side(x: number, y: number, z: number, d: number, h: number, color: string): this {
    return this.fpoly(
      [
        [x, y, z],
        [x, y + d, z],
        [x, y + d, z + h],
        [x, y, z + h],
      ],
      this.sideShade(color),
    );
  }
  /** Glasscheibe an der Front: blau getönt, halbtransparent, zwei schräge Reflexe. */
  glass(x: number, y: number, z: number, w: number, h: number, opacity = 0.42): this {
    this.frontLit(x, y, z, w, h, C.glass, opacity);
    const s = (x0: number, sw: number) =>
      this.frontPoly(
        y,
        [
          [x + w * x0, z + h * 0.12],
          [x + w * (x0 + sw), z + h * 0.12],
          [x + w * (x0 + sw + 0.14), z + h * 0.88],
          [x + w * (x0 + 0.14), z + h * 0.88],
        ],
        C.white,
        0.5,
      );
    s(0.12, 0.1);
    s(0.3, 0.04);
    return this;
  }
}

// ---------------------------------------------------------------------------------------------
// Material-Leiter
// ---------------------------------------------------------------------------------------------
interface TierStyle {
  /** Korpus der Theke/Arbeitsplatte. */
  body: string;
  /** Füllung von Paneelen und Türen. */
  panel: string;
  /** Arbeitsplatte. */
  top: string;
  /** Vorderkante der Platte. */
  edge: string;
  /** Griffe, Fußleiste, Zierleisten. */
  trim: string;
  /** Sockel. */
  plinth: string;
}

const TIER_STYLE: Record<Tier, TierStyle> = {
  // Stufen 1–3 im Kiez-Look (knallblau, Edelstahl, Fliesen), 4–5 bleiben edel (Nussbaum/Marmor, Nachtblau/Gold).
  1: {
    body: C.cobalt,
    panel: C.cobaltLight,
    top: C.stainless,
    edge: C.stainlessDark,
    trim: C.stainless,
    plinth: C.cobaltDeep,
  },
  2: {
    body: C.stainless,
    panel: C.stainlessLight,
    // Terrazzo-Platte: hebt sich vom Edelstahl-Korpus ab, bleibt aber hell.
    top: C.terrazzo,
    edge: C.stainlessDark,
    trim: C.chrome,
    plinth: C.cobalt,
  },
  3: {
    body: C.cobaltTile,
    panel: C.cobaltLight,
    top: C.quartz,
    edge: C.quartz,
    trim: C.chrome,
    plinth: C.stainlessDark,
  },
  4: {
    body: C.walnut,
    panel: C.walnutLight,
    top: C.marble,
    edge: C.marble,
    trim: C.brass,
    plinth: C.brass,
  },
  5: {
    body: C.lacquerNavy,
    panel: C.lacquerNavyLight,
    top: C.marble,
    edge: C.gold,
    trim: C.gold,
    plinth: C.gold,
  },
};

/** Metall der Geräte je Stufe: Weißblech → Stahl → Chrom → Messing/Kupfer → Gold. */
const METAL: Record<Tier, string> = {
  1: C.steel,
  2: C.chrome,
  3: C.chrome,
  4: C.brass,
  5: C.gold,
};

/** Adern im Marmor (Stufe 4/5): dünne Linien auf einer waagrechten Fläche in Höhe z. */
function veins(c: FacingCanvas, z: number, lines: readonly (readonly P2[])[], width = 0.012) {
  for (const pts of lines) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (!a || !b) continue;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * width;
      const ny = (dx / len) * width;
      c.fpoly(
        [
          [a[0] - nx, a[1] - ny, z],
          [b[0] - nx, b[1] - ny, z],
          [b[0] + nx, b[1] + ny, z],
          [a[0] + nx, a[1] + ny, z],
        ],
        C.marbleVein,
      );
    }
  }
}

/**
 * Front eines Korpus (Theke zum Gast, Unterschrank zum Raum) zwischen x0 und x1 in der Ebene y: je Stufe
 * glattes Paneel, Rahmenfüllung, Nut und Feder, Lamellen oder Gold-Intarsie.
 */
function frontPanels(
  c: FacingCanvas,
  tier: Tier,
  y: number,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  doors = 1,
) {
  const s = TIER_STYLE[tier];
  const w = (x1 - x0) / doors;
  for (let i = 0; i < doors; i++) {
    const a = x0 + i * w;
    const pad = Math.min(0.05, w * 0.12);
    switch (tier) {
      case 1:
        // Lackfront mit Schattenfuge oben (Griffleiste)
        c.front(a + pad, y, z0 + 1.5, w - 2 * pad, z1 - z0 - 3, shade(s.body, 0.94));
        c.front(a + pad, y + 0.001, z1 - 3, w - 2 * pad, 0.8, s.panel);
        break;
      case 2: {
        // Gebürsteter Edelstahl: feine helle und dunkle Längsstriche
        c.front(a + pad * 0.5, y, z0 + 1, w - pad, z1 - z0 - 2, shade(s.body, 0.97));
        const n = Math.max(5, Math.round(w / 0.06));
        for (let k = 1; k < n; k++)
          c.front(
            a + (k * w) / n - 0.004,
            y + 0.001,
            z0 + 1.5,
            0.008,
            z1 - z0 - 3,
            k % 2 ? s.panel : shade(s.body, 0.9),
          );
        break;
      }
      case 3: {
        // Glasierte Fliesen mit hellen Fugen (Raster 4 px hoch, versetzt)
        const fuge = tint(s.body, 0.62);
        for (let z = z0 + 4; z < z1; z += 4) c.front(a, y + 0.001, z, w, 0.5, fuge);
        for (let row = 0, z = z0; z < z1; row++, z += 4)
          for (let x = a + (row % 2 ? 0.05 : 0.11); x < a + w; x += 0.12)
            c.front(x, y + 0.001, z, 0.01, Math.min(4, z1 - z), fuge);
        break;
      }
      case 4: {
        const n = Math.max(4, Math.round(w / 0.055));
        for (let k = 0; k < n; k++)
          if (k % 2 === 0) c.front(a + (k * w) / n + 0.004, y, z0, w / n - 0.008, z1 - z0, s.panel);
        break;
      }
      case 5:
        c.front(a + pad, y, z0 + 1.5, w - 2 * pad, z1 - z0 - 3, C.gold);
        c.front(a + pad + 0.018, y + 0.001, z0 + 2.3, w - 2 * pad - 0.036, z1 - z0 - 4.6, s.body);
        c.front(a + pad * 2.2, y + 0.002, z0 + 4, w - 4.4 * pad, z1 - z0 - 8, s.panel);
        break;
    }
  }
}

/** Waagrechte Stange (Fußleiste, Handtuchstange) entlang x in Tiefe y. */
function rail(c: FacingCanvas, x0: number, x1: number, y: number, z: number, color: string) {
  c.fbox(x0, y, z, x1 - x0, 0.03, 1.6, color, { top: tint(color, 0.35) });
}

// ---------------------------------------------------------------------------------------------
// Requisiten (bewusst groß: im Hochformat ist eine Kachel nur gut 30 px breit)
// ---------------------------------------------------------------------------------------------
function cup(
  c: FacingCanvas,
  x: number,
  y: number,
  z: number,
  color: string = C.cup,
  fill: string = C.matchaFoam,
  s = 1,
) {
  c.ffrustum(x, y, z, 0.032 * s, 0.042 * s, 5 * s, color, fill);
}

function bowl(
  c: FacingCanvas,
  x: number,
  y: number,
  z: number,
  r = 0.09,
  color: string = C.cup,
  rim?: string,
) {
  c.fshadowDisc(x, y, z, r, 0.2);
  c.ffrustum(x, y, z, r * 0.55, r, 5.5, color, rim ?? tint(color, 0.3));
  c.fdisc(x, y, z + 5.1, r * 0.8, C.matchaFoam);
  c.fdisc(x - 0.012, y - 0.012, z + 5.15, r * 0.32, tint(C.matchaFoam, 0.45));
}

/** Matcha-Besen (Chasen), Zinken nach unten auf dem Halter, Griff nach oben. */
function chasen(c: FacingCanvas, x: number, y: number, z: number, holder?: string) {
  if (holder) c.fcyl(x, y, z, 0.032, 3, holder, tint(holder, 0.3));
  const z0 = z + (holder ? 3 : 0);
  c.fdome(x, y, z0, 0.052, 7, C.oakLight);
  c.fcyl(x, y, z0 + 5, 0.022, 5, C.oak, C.oakLight);
}

function tin(
  c: FacingCanvas,
  x: number,
  y: number,
  z: number,
  color: string,
  lid: string = C.cream,
  h = 9,
) {
  c.fcyl(x, y, z, 0.048, h, color, lid);
  c.fcyl(x, y, z + h - 2, 0.049, 2, lid);
}

function jar(c: FacingCanvas, x: number, y: number, z: number, content: string, lid: string) {
  c.fcyl(x, y, z, 0.048, 7, content, tint(content, 0.2));
  c.group(0.45, () => c.fcyl(x, y, z, 0.052, 8, C.glass, tint(C.glass, 0.5)));
  c.fcyl(x, y, z + 8, 0.054, 2.5, lid, tint(lid, 0.2));
}

/** Wasserkocher: Sockel, Körper mit Glanz, Tülle, Griff. */
function kettle(c: FacingCanvas, x: number, y: number, z: number, color: string) {
  c.fshadowDisc(x, y, z, 0.09, 0.22);
  c.fcyl(x, y, z, 0.09, 2, shade(color, 0.55));
  c.fcyl(x, y, z + 2, 0.08, 11, color, tint(color, 0.2));
  c.fshine(x, y, z + 2, 0.08, 11, color, 0.45);
  c.fbox(x + 0.06, y - 0.012, z + 9, 0.06, 0.024, 2.5, color);
  c.fbox(x - 0.11, y - 0.014, z + 5, 0.03, 0.028, 9, shade(color, 0.7));
  c.fcyl(x, y, z + 13, 0.025, 2, shade(color, 0.6));
}

/** Gusseisen-Kessel (Tetsubin) mit Bügel. */
function tetsubin(
  c: FacingCanvas,
  x: number,
  y: number,
  z: number,
  body: string = C.iron,
  handle: string = C.iron,
) {
  c.fshadowDisc(x, y, z, 0.09, 0.22);
  c.fcyl(x, y, z, 0.085, 4, body);
  c.fdome(x, y, z + 4, 0.09, 8, body);
  c.fcyl(x, y, z + 10.5, 0.026, 2, shade(body, 1.3));
  c.fbox(x + 0.07, y - 0.01, z + 6, 0.06, 0.02, 2.5, body);
  c.fbox(x - 0.085, y - 0.008, z + 10, 0.016, 0.016, 8, handle);
  c.fbox(x + 0.07, y - 0.008, z + 10, 0.016, 0.016, 8, handle);
  c.fbox(x - 0.085, y - 0.008, z + 18, 0.171, 0.016, 1.8, handle);
}

/** Schwanenhals-Kessel. */
function gooseneck(c: FacingCanvas, x: number, y: number, z: number, color: string) {
  c.fshadowDisc(x, y, z, 0.08, 0.22);
  c.ffrustum(x, y, z, 0.08, 0.055, 11, color, tint(color, 0.2));
  c.fshine(x, y, z, 0.065, 11, color, 0.5);
  c.fcyl(x, y, z + 11, 0.018, 2.5, C.ink);
  c.fpoly(
    [
      [x + 0.05, y, z + 2],
      [x + 0.15, y, z + 11],
      [x + 0.19, y, z + 12.5],
      [x + 0.18, y, z + 14],
      [x + 0.13, y, z + 11],
      [x + 0.05, y, z + 5],
    ],
    shade(color, 0.85),
  );
  c.fbox(x - 0.105, y - 0.012, z + 3, 0.025, 0.024, 8, C.ink);
}

/** Tischklingel (Ausgabe, Kasse). */
function bell(c: FacingCanvas, x: number, y: number, z: number, metal: string, base: string) {
  c.fshadowDisc(x, y, z, 0.075, 0.2);
  c.fcyl(x, y, z, 0.075, 1.6, base, tint(base, 0.2));
  c.fdome(x, y, z + 1.6, 0.064, 6.5, metal);
  c.fcyl(x, y, z + 7.6, 0.012, 1.6, metal);
  c.fdome(x, y, z + 9.2, 0.02, 2, metal);
}

/** Torte: Boden, Creme-Rand, Beere. */
function cake(
  c: FacingCanvas,
  x: number,
  y: number,
  z: number,
  r: number,
  sponge: string,
  cream: string,
  berry: string = C.red,
) {
  c.fshadowDisc(x, y, z, r, 0.16);
  c.fcyl(x, y, z, r, 5, sponge, cream);
  c.fcyl(x, y, z + 4, r * 1.005, 1.2, cream, cream);
  c.fdome(x, y, z + 5.2, Math.min(0.02, r * 0.3), 2.4, berry);
}

/** Glasglocke (Cloche) oder Silberhaube mit Knauf. */
function cloche(
  c: FacingCanvas,
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  knob: string,
  silver = false,
) {
  if (silver) c.fdome(x, y, z, r, h, C.chrome);
  else c.group(0.5, () => c.fdome(x, y, z, r, h, C.glass));
  c.fdome(x, y, z + h - 0.4, 0.022, 2.4, knob);
}

/** Zimmerpflanze im Topf: Blätter als kleine Kuppeln, oben heller. */
function plantPot(
  c: FacingCanvas,
  x: number,
  y: number,
  z: number,
  pot: string,
  leaf: string = C.matcha,
  s = 1,
) {
  c.fshadowDisc(x, y, z, 0.055 * s, 0.22);
  c.ffrustum(x, y, z, 0.042 * s, 0.055 * s, 6 * s, pot, shade(pot, 0.8));
  c.fdisc(x, y, z + 6 * s, 0.046 * s, C.woodDeep);
  const leafAt = (dx: number, dz: number, r: number, col: string) =>
    c.fdome(x + dx * s, y, z + 6 * s + dz * s, r * s, 4 * s, col);
  leafAt(-0.035, 0.5, 0.04, shade(leaf, 0.88));
  leafAt(0.035, 1.2, 0.04, leaf);
  leafAt(0, 3.6, 0.045, tint(leaf, 0.12));
}

/** Orchidee im Topf. */
function orchid(c: FacingCanvas, x: number, y: number, z: number, pot: string) {
  c.fshadowDisc(x, y, z, 0.055, 0.22);
  c.ffrustum(x, y, z, 0.044, 0.055, 7, pot, shade(pot, 0.85));
  c.fshine(x, y, z, 0.05, 7, pot, 0.5);
  c.fdome(x - 0.03, y, z + 7, 0.034, 3, C.matchaDeep);
  c.fdome(x + 0.03, y, z + 7, 0.034, 3, C.matcha);
  c.fbox(x - 0.004, y - 0.004, z + 7, 0.008, 0.008, 14, C.matchaDeep);
  for (const [dx, dz] of [
    [-0.035, 16],
    [0.02, 20],
    [0.06, 15.5],
  ] as const) {
    c.fdome(x + dx, y, z + dz, 0.026, 3.4, C.white);
    c.fdisc(x + dx, y, z + dz + 1.2, 0.008, C.pink);
  }
}

/** Vase mit Kirschblütenzweig. */
function sakuraVase(c: FacingCanvas, x: number, y: number, z: number, vase: string) {
  c.fshadowDisc(x, y, z, 0.045, 0.22);
  c.fcyl(x, y, z, 0.034, 10, vase, tint(vase, 0.2));
  c.fshine(x, y, z, 0.034, 10, vase, 0.4);
  const branch = (dx: number, dz: number) =>
    c.fpoly(
      [
        [x, y, z + 10],
        [x + 0.008, y, z + 10],
        [x + dx + 0.008, y, z + dz],
        [x + dx, y, z + dz],
      ],
      C.woodDeep,
    );
  branch(0.07, 25);
  branch(-0.06, 21);
  for (const [dx, dz] of [
    [0.07, 25],
    [0.05, 21],
    [0.025, 16],
    [-0.06, 21],
    [-0.035, 16.5],
  ] as const)
    c.fdome(x + dx, y, z + dz, 0.022, 2.8, C.sakura);
}

/** Wandregal: Brett (optional mit Konsolen) an der Rückwand; `items` zeichnet je Platz etwas darauf. */
function shelf(
  c: FacingCanvas,
  z: number,
  board: string,
  xs: readonly number[],
  items: (x: number, i: number) => void,
  bracket?: string,
) {
  if (bracket) {
    c.fbox(0.14, 0.02, z - 5, 0.025, 0.13, 5, bracket);
    c.fbox(0.84, 0.02, z - 5, 0.025, 0.13, 5, bracket);
  }
  c.fbevel(0.06, 0.02, z, 0.88, 0.17, 2.5, board, { b: 0.8 });
  xs.forEach((x, i) => items(x, i));
}

/** Tafel/Schild an der Rückwand: Rahmen + Fläche. */
function wallBoard(
  c: FacingCanvas,
  x: number,
  z: number,
  w: number,
  h: number,
  frame: string,
  face: string,
) {
  c.fbox(x, 0.01, z, w, 0.03, h, frame);
  c.frontLit(x + 0.02, 0.041, z + 1.5, w - 0.04, h - 3, face);
}

/** Goldene Plakette mit Blatt-Emblem (Stufe 5). */
function crest(c: FacingCanvas, x: number, z: number, w = 0.26, h = 11) {
  wallBoard(c, x, z, w, h, C.gold, C.lacquerNavy);
  const cx = x + w / 2;
  const cz = z + h / 2;
  c.frontPoly(
    0.042,
    [
      [cx, cz + 3.6],
      [cx + 0.045, cz],
      [cx, cz - 3.6],
      [cx - 0.045, cz],
    ],
    C.gold,
  );
  c.frontPoly(
    0.043,
    [
      [cx, cz + 3.6],
      [cx + 0.01, cz],
      [cx, cz - 3.6],
    ],
    C.goldDeep,
  );
}

/** Wandfliesen (Spiegel) hinter der Arbeitsplatte: helle Fugen als Raster. */
function tiles(c: FacingCanvas, z0: number, z1: number, color: string) {
  c.front(0, 0.02, z0, 1, z1 - z0, color);
  for (let z = z0 + 4; z < z1; z += 4) c.frontLit(0, 0.021, z, 1, 0.6, tint(color, 0.55));
  for (let row = 0, z = z0; z < z1; row++, z += 4)
    for (let x = row % 2 ? 0.06 : 0.18; x < 1; x += 0.24)
      c.frontLit(x, 0.021, z, 0.012, 4, tint(color, 0.55));
}

/** Warmes LED-Licht unter einem Regal oder einer Platte (Stufe 5). */
function ledUnder(c: FacingCanvas, x: number, y: number, z: number, w: number, d: number) {
  c.fglow(x, y, z, w, d, C.led, 0.6, 1.6);
}

// ---------------------------------------------------------------------------------------------
// Theke (Gastseite) und Arbeitsplatte (Rückwand)
// ---------------------------------------------------------------------------------------------

/** Thekenmodul über die volle Kachelbreite; Nachbarmodule schließen nahtlos an (keine Seitenfase). */
function counterBase(c: FacingCanvas, tier: Tier) {
  const s = TIER_STYLE[tier];
  c.fshadow(-0.02, 0.18, 0, 1.04, 0.72, 0.24);
  c.fbox(0, 0.26, 0, 1, 0.5, 2.5, s.plinth);
  c.fbox(0, 0.22, 2.5, 1, 0.56, 17.5, s.body);
  frontPanels(c, tier, 0.781, 0, 1, 3.5, 19, tier === 2 || tier === 5 ? 2 : 1);
  if (tier >= 3) {
    // Fußstange zum Gast
    const color = METAL[tier];
    c.fbox(0.2, 0.78, 4.5, 0.025, 0.07, 1.2, color);
    c.fbox(0.78, 0.78, 4.5, 0.025, 0.07, 1.2, color);
    rail(c, 0, 1, 0.85, 4.6, color);
  }
  if (tier === 5) ledUnder(c, 0, 0.8, 19.2, 1, 0.08);
  c.fbevel(0, 0.19, 20, 1, 0.64, 3, s.top, {
    b: 1.2,
    side: false,
    frontColor: s.edge,
    edge: tier >= 4 ? 0.3 : 0.18,
  });
  if (tier >= 4)
    veins(c, COUNTER_TOP, [
      [
        [0, 0.3],
        [0.3, 0.42],
        [0.52, 0.7],
        [0.6, 0.8],
      ],
      [
        [0.62, 0.2],
        [0.78, 0.4],
        [1, 0.48],
      ],
    ]);
}

/** Deko auf der Theke: 0 = leer, 1 = Becher/Glocke, 2 = Karte/Spender, 3 = Pflanze. */
export const COUNTER_VARIANTS = [0, 1, 2, 3] as const;

function counterProps(c: FacingCanvas, tier: Tier, variant: number) {
  const z = COUNTER_TOP;
  const m = METAL[tier];
  switch (variant) {
    case 1:
      if (tier === 1) {
        // Gestapelte blaue To-go-Becher, das Erkennungszeichen des Kiez-Cafés
        c.fshadowDisc(0.32, 0.45, z, 0.05, 0.18);
        for (let i = 0; i < 3; i++)
          c.ffrustum(0.32, 0.45, z + i * 3.4, 0.034, 0.044, 3.6, C.cobalt, C.white);
        cup(c, 0.46, 0.56, z, C.cobalt, C.matchaFoam);
      } else if (tier === 2) {
        c.fshadowDisc(0.34, 0.46, z, 0.08, 0.16);
        for (let i = 0; i < 3; i++) {
          c.fcyl(0.34, 0.46, z + i * 3.6, 0.07, 0.9, C.cup);
          cup(c, 0.34, 0.46, z + 0.9 + i * 3.6, C.cup, C.cup, 0.85);
        }
      } else if (tier === 3) {
        // Keksglas mit Chromdeckel
        c.fshadowDisc(0.34, 0.46, z, 0.07, 0.18);
        c.fcyl(0.34, 0.46, z, 0.06, 9, C.oakLight, tint(C.oakLight, 0.3));
        c.group(0.5, () => c.fcyl(0.34, 0.46, z, 0.064, 10, C.glass, tint(C.glass, 0.5)));
        c.fcyl(0.34, 0.46, z + 10, 0.066, 1.6, C.chrome);
        c.fdome(0.34, 0.46, z + 11.6, 0.02, 2, C.chrome);
      } else {
        // Tortenständer mit Glasglocke
        c.fshadowDisc(0.36, 0.46, z, 0.09, 0.18);
        c.fcyl(0.36, 0.46, z, 0.032, 3, m);
        c.fcyl(0.36, 0.46, z + 3, 0.095, 1.2, m, tint(m, 0.3));
        cake(c, 0.36, 0.46, z + 4.2, 0.065, tier === 4 ? C.sakura : C.matchaFoam, C.cream);
        cloche(c, 0.36, 0.46, z + 4.2, 0.09, 12, m);
      }
      break;
    case 2:
      if (tier <= 2) {
        // Serviettenspender und Zuckerstreuer
        c.fshadow(0.24, 0.36, z, 0.16, 0.14, 0.2);
        c.fbevel(0.24, 0.36, z, 0.16, 0.14, 7, tier === 1 ? C.steel : C.chrome, { b: 0.8 });
        c.fflat(0.26, 0.38, z + 7.02, 0.12, 0.1, C.white);
        c.fcyl(0.52, 0.5, z, 0.03, 6, C.glass, C.chrome);
        c.fcyl(0.52, 0.5, z, 0.026, 3, C.white);
      } else {
        // Menükarte im Ständer, Zuckerdose
        c.fshadow(0.24, 0.42, z, 0.26, 0.1, 0.2);
        c.fbevel(0.26, 0.44, z, 0.2, 0.06, 1.8, tier === 3 ? C.quartz : C.walnut, { b: 0.5 });
        c.fbox(0.28, 0.46, z + 1.8, 0.16, 0.014, 14, m);
        c.frontLit(0.29, 0.475, z + 3, 0.14, 11.5, C.paper);
        c.frontLit(0.32, 0.476, z + 11, 0.08, 1.4, tier === 5 ? C.gold : C.matchaDeep);
        for (let i = 0; i < 3; i++) c.frontLit(0.315, 0.476, z + 5 + i * 1.9, 0.09, 0.7, C.ink);
        c.fshadowDisc(0.6, 0.54, z, 0.04, 0.18);
        c.fcyl(0.6, 0.54, z, 0.036, 5, tier === 5 ? C.glass : C.cup, C.white);
        c.fdome(0.6, 0.54, z + 5, 0.036, 2.5, m);
      }
      break;
    case 3:
      if (tier === 1) plantPot(c, 0.38, 0.5, z, C.white, C.matcha, 1.1);
      else if (tier === 2) plantPot(c, 0.38, 0.5, z, C.cream, C.matchaDeep, 1.2);
      else if (tier === 3) plantPot(c, 0.38, 0.5, z, C.quartz, C.lacquerGreenLight, 1.25);
      else if (tier === 4) sakuraVase(c, 0.38, 0.5, z, C.brass);
      else orchid(c, 0.38, 0.5, z, C.gold);
      break;
  }
}

/** Arbeitsplatte mit Unterschrank an der Rückwand (Barista-Theke). */
function backCounter(c: FacingCanvas, tier: Tier) {
  const s = TIER_STYLE[tier];
  c.fshadow(0, 0.1, 0, 1, 0.86, 0.26);
  c.fbox(0.04, 0.14, 0, 0.92, 0.7, 2.5, s.plinth);
  c.fbox(0.02, 0.12, 2.5, 0.96, 0.76, 21.5, s.body);
  frontPanels(c, tier, 0.881, 0.04, 0.96, 3.5, 23, 2);
  // Griffe
  const h = s.trim;
  if (tier === 1) {
    c.frontLit(0.44, 0.882, 17, 0.03, 1.8, c.frontShade(h));
    c.frontLit(0.53, 0.882, 17, 0.03, 1.8, c.frontShade(h));
  } else {
    c.frontLit(0.4, 0.883, 14, 0.07, 1.5, tint(h, 0.15));
    c.frontLit(0.53, 0.883, 14, 0.07, 1.5, tint(h, 0.15));
  }
  if (tier === 5) ledUnder(c, 0.02, 0.86, 23.4, 0.96, 0.06);
  c.fbevel(0, 0.1, 24, 1, 0.8, 3, s.top, { b: 1.2, frontColor: s.edge, edge: 0.22 });
  if (tier >= 4)
    veins(c, BACK_TOP, [
      [
        [0.05, 0.3],
        [0.35, 0.45],
        [0.5, 0.75],
        [0.62, 0.88],
      ],
      [
        [0.7, 0.12],
        [0.82, 0.38],
        [0.98, 0.45],
      ],
    ]);
}

// ---------------------------------------------------------------------------------------------
// Geräte der Barista-Theke (Rückwand)
// ---------------------------------------------------------------------------------------------
type Draw = (c: FacingCanvas, tier: Tier) => void;

const matchaStation: Draw = (c, tier) => {
  const z = BACK_TOP;
  // Rückwand
  if (tier === 3) tiles(c, z, 52, C.matchaTile);
  if (tier === 4) wallBoard(c, 0.06, 33, 0.36, 22, C.walnut, C.lacquerGreen);
  if (tier === 4)
    for (let i = 0; i < 4; i++)
      c.frontLit(0.11, 0.042, 47 - i * 3.6, 0.2 - (i % 2) * 0.06, 1, C.cream);
  if (tier === 5) crest(c, 0.37, 51);
  const board = [C.pine, C.oak, C.quartz, C.walnut, C.glass][tier - 1] ?? C.pine;
  const xs =
    tier === 1
      ? [0.3, 0.44]
      : tier === 2
        ? [0.22, 0.36, 0.5, 0.64]
        : tier === 4
          ? [0.56, 0.7, 0.84]
          : [0.2, 0.34, 0.66, 0.8];
  if (tier === 5) ledUnder(c, 0.06, 0.04, 42, 0.88, 0.14);
  shelf(
    c,
    44,
    board,
    xs,
    (x, i) => {
      const zz = 46.5;
      if (tier === 1) tin(c, x, 0.1, zz, i ? C.cream : C.matcha);
      else if (tier === 2)
        tin(c, x, 0.1, zz, [C.matcha, C.cream, C.sakura, C.matchaDeep][i] ?? C.matcha);
      else if (tier === 3) tin(c, x, 0.1, zz, i % 2 ? C.matcha : C.white, C.chrome);
      else if (tier === 4)
        jar(c, x, 0.1, zz, [C.matchaFoam, C.sakura, C.matcha][i] ?? C.matcha, C.walnut);
      else {
        c.fcyl(x, 0.1, zz, 0.046, 6, C.ink, C.ink);
        c.fcyl(x, 0.1, zz + 5, 0.047, 1.2, C.gold);
        c.fdome(x, 0.1, zz + 6.2, 0.046, 2.4, C.ink);
      }
    },
    tier >= 4 ? METAL[tier] : undefined,
  );
  if (tier === 2) plantPot(c, 0.8, 0.1, 46.5, C.cream, C.matchaDeep, 0.9);
  backCounter(c, tier);
  // Arbeitsplatte
  if (tier === 1) {
    kettle(c, 0.2, 0.42, z, C.white);
    bowl(c, 0.52, 0.62, z);
    chasen(c, 0.76, 0.42, z);
    tin(c, 0.84, 0.72, z, C.matcha);
  } else if (tier === 2) {
    kettle(c, 0.18, 0.4, z, C.chrome);
    c.fshadow(0.34, 0.48, z, 0.44, 0.3, 0.16);
    c.fbevel(0.34, 0.48, z, 0.44, 0.3, 1.5, C.oakLight, { b: 0.6 });
    bowl(c, 0.46, 0.62, z + 1.5, 0.08);
    bowl(c, 0.66, 0.64, z + 1.5, 0.075, C.sakura);
    chasen(c, 0.82, 0.36, z, C.white);
  } else if (tier === 3) {
    c.fshadowDisc(0.2, 0.4, z, 0.1, 0.22);
    c.fcyl(0.2, 0.4, z, 0.095, 3.5, C.ink, C.steel);
    tetsubin(c, 0.2, 0.4, z + 3.5);
    c.fshadow(0.36, 0.5, z, 0.48, 0.3, 0.16);
    c.fbevel(0.36, 0.5, z, 0.48, 0.3, 1.2, C.oakLight, { b: 0.5 });
    for (let k = 0; k < 7; k++) c.fflat(0.38 + k * 0.064, 0.5, z + 1.21, 0.01, 0.3, C.oak);
    bowl(c, 0.48, 0.64, z + 1.2, 0.08);
    bowl(c, 0.68, 0.66, z + 1.2, 0.075, C.matchaDeep, C.cream);
    chasen(c, 0.6, 0.32, z, C.white);
    c.fshadow(0.78, 0.24, z, 0.16, 0.16, 0.18);
    c.fbevel(0.78, 0.24, z, 0.16, 0.16, 3, C.white, { b: 0.6 });
    c.frontLit(0.8, 0.401, z + 0.6, 0.1, 1.8, C.ink);
  } else if (tier === 4) {
    gooseneck(c, 0.2, 0.42, z, C.copper);
    c.fshadow(0.34, 0.5, z, 0.36, 0.32, 0.12);
    c.fflat(0.34, 0.5, z + 0.05, 0.36, 0.32, C.oakLight);
    for (let k = 1; k < 6; k++) c.fflat(0.34 + k * 0.06, 0.5, z + 0.06, 0.008, 0.32, C.oak);
    bowl(c, 0.45, 0.65, z, 0.08, C.cream, C.sakura);
    bowl(c, 0.62, 0.67, z, 0.075, C.sakura);
    chasen(c, 0.56, 0.32, z, C.cream);
    sakuraVase(c, 0.85, 0.52, z, C.cream);
  } else {
    // Lacktablett mit Goldrand, schwarze Schalen mit Goldrand, Kessel auf Goldfuß, Orchidee
    c.fshadowDisc(0.2, 0.4, z, 0.1, 0.22);
    c.fcyl(0.2, 0.4, z, 0.095, 3.5, C.gold, tint(C.gold, 0.3));
    c.fshine(0.2, 0.4, z, 0.095, 3.5, C.gold, 0.6);
    tetsubin(c, 0.2, 0.4, z + 3.5, C.iron, C.gold);
    c.fshadow(0.35, 0.48, z, 0.4, 0.34, 0.2);
    c.fbevel(0.35, 0.48, z, 0.4, 0.34, 1.8, C.gold, { b: 0.6 });
    c.fflat(0.37, 0.5, z + 1.81, 0.36, 0.3, C.ink);
    bowl(c, 0.46, 0.64, z + 1.8, 0.08, C.ink, C.gold);
    bowl(c, 0.64, 0.66, z + 1.8, 0.075, C.ink, C.gold);
    chasen(c, 0.58, 0.3, z, C.gold);
    orchid(c, 0.86, 0.54, z, C.gold);
  }
};

/** Siebträgermaschine als Kasten mit Brühgruppen, Tropfschale und Tassen darunter. */
function espresso(
  c: FacingCanvas,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
  body: string,
  metal: string,
  groups: number,
  face?: string,
) {
  c.fshadow(x - 0.02, y - 0.02, z, w + 0.04, d + 0.06, 0.26);
  c.fbevel(x, y, z, w, d, h, body, { b: 1.4 });
  if (face) c.front(x + 0.03, y + d + 0.001, z + 3, w - 0.06, h - 6, face);
  c.fbox(x + 0.03, y + d, z, w - 0.06, 0.09, 2, metal);
  for (let g = 0; g < groups; g++) {
    const gx = x + ((g + 0.5) * w) / groups;
    c.fbox(gx - 0.035, y + d, z + h * 0.5, 0.07, 0.04, 3, metal);
    c.fbox(gx - 0.01, y + d + 0.04, z + h * 0.5 - 1, 0.07, 0.022, 1.4, C.ink);
    cup(c, gx, y + d + 0.05, z + 2, C.cup, C.coffee, 0.9);
  }
  c.frontLit(x + 0.04, y + d + 0.002, z + h - 4.5, w - 0.08, 1.6, c.frontShade(metal));
}

/** Kaffeemühle mit Bohnenbehälter. */
function grinderBox(
  c: FacingCanvas,
  x: number,
  y: number,
  z: number,
  body: string,
  ring: string,
  s = 1,
) {
  c.fshadowDisc(x, y, z, 0.07 * s, 0.22);
  c.fbevel(x - 0.06 * s, y - 0.06 * s, z, 0.12 * s, 0.12 * s, 11 * s, body, { b: 0.8 });
  c.fcyl(x, y, z + 11 * s, 0.035 * s, 2, ring);
  c.ffrustum(x, y, z + 11 * s + 2, 0.035 * s, 0.07 * s, 8 * s, C.glass, C.coffee);
}

const coffeeMachine: Draw = (c, tier) => {
  const z = BACK_TOP;
  const m = METAL[tier];
  if (tier === 3) tiles(c, z, 52, C.white);
  if (tier === 5) {
    crest(c, 0.06, 52, 0.24, 10);
    ledUnder(c, 0.06, 0.04, 43, 0.88, 0.14);
  }
  if (tier >= 2) {
    const board = [C.pine, C.oak, C.quartz, C.walnut, C.glass][tier - 1] ?? C.oak;
    shelf(
      c,
      45,
      board,
      tier >= 4 ? [0.24, 0.5, 0.76] : tier === 3 ? [0.22, 0.42, 0.62] : [0.3, 0.5],
      (x) => {
        if (tier >= 4) {
          const rim = tier === 5 ? C.gold : C.cup;
          cup(c, x - 0.04, 0.1, 47.5, tier === 5 ? C.white : C.cream, rim);
          cup(c, x + 0.05, 0.1, 47.5, tier === 5 ? C.white : C.cream, rim);
        } else {
          c.fbevel(x - 0.05, 0.05, 47.5, 0.1, 0.08, 10, C.coffee, { b: 0.8 });
          c.frontLit(x - 0.035, 0.131, 50.5, 0.07, 3.5, tier === 3 ? C.white : C.cream);
        }
      },
      tier >= 4 ? m : undefined,
    );
  }
  backCounter(c, tier);
  if (tier === 1) {
    espresso(c, 0.16, 0.34, z, 0.34, 0.3, 15, C.white, C.steel, 1);
    grinderBox(c, 0.68, 0.46, z, C.ink, C.steel, 0.9);
    cup(c, 0.86, 0.68, z, C.cup, C.cup);
  } else if (tier === 2) {
    espresso(c, 0.08, 0.28, z, 0.5, 0.34, 17, C.chrome, C.chrome, 2);
    for (let i = 0; i < 3; i++) cup(c, 0.2 + i * 0.13, 0.42, z + 17, C.cup, C.cup);
    grinderBox(c, 0.76, 0.44, z, C.ink, C.chrome);
  } else if (tier === 3) {
    espresso(c, 0.06, 0.26, z, 0.54, 0.36, 18, C.iron, C.chrome, 2, C.chrome);
    c.fbox(0.08, 0.28, z + 18, 0.5, 0.32, 1, C.chrome, { top: tint(C.chrome, 0.3) });
    for (let i = 0; i < 4; i++) cup(c, 0.15 + i * 0.11, 0.42, z + 19, C.white, C.white);
    grinderBox(c, 0.72, 0.36, z, C.iron, C.chrome, 0.9);
    grinderBox(c, 0.88, 0.5, z, C.chrome, C.iron, 0.9);
    c.fshadowDisc(0.78, 0.74, z, 0.04, 0.2);
    c.fcyl(0.78, 0.74, z, 0.036, 6, C.chrome, C.white);
    c.fshine(0.78, 0.74, z, 0.036, 6, C.chrome);
  } else if (tier === 4) {
    // Dreigruppige Maschine in Creme-Emaille mit Messing-Galerie, Kupferkanne
    espresso(c, 0.05, 0.26, z, 0.6, 0.36, 18, C.enamelCream, C.brass, 3, C.brass);
    for (const [gx, gy] of [
      [0.07, 0.28],
      [0.61, 0.28],
      [0.07, 0.58],
      [0.61, 0.58],
    ] as const)
      c.fbox(gx, gy, z + 18, 0.02, 0.02, 4, C.brass);
    rail(c, 0.07, 0.63, 0.58, z + 21.5, C.brass);
    for (let i = 0; i < 4; i++) cup(c, 0.14 + i * 0.12, 0.42, z + 18, C.cream, C.cream);
    c.fshadowDisc(0.82, 0.42, z, 0.08, 0.22);
    c.fcyl(0.82, 0.42, z, 0.07, 11, C.walnut, C.walnut);
    c.fcyl(0.82, 0.42, z + 11, 0.035, 3, C.brass);
    c.ffrustum(0.82, 0.42, z + 14, 0.04, 0.075, 8, C.glass, C.coffee);
    c.fshadowDisc(0.82, 0.74, z, 0.04, 0.2);
    c.fcyl(0.82, 0.74, z, 0.037, 6, C.copper, C.white);
    c.fshine(0.82, 0.74, z, 0.037, 6, C.copper);
  } else {
    // Hebel-Espressomaschine mit Goldkuppel und Zierknauf
    const gx = 0.38;
    const gy = 0.48;
    c.fshadowDisc(gx, gy, z, 0.26, 0.28);
    c.fcyl(gx, gy, z, 0.24, 3, C.lacquerNavy, C.gold);
    c.fcyl(gx, gy, z + 3, 0.18, 19, C.gold, C.gold);
    c.fshine(gx, gy, z + 3, 0.18, 19, C.gold, 0.55);
    c.frontLit(gx - 0.07, gy + 0.181, z + 9, 0.14, 7, C.lacquerNavy);
    c.frontPoly(
      gy + 0.182,
      [
        [gx, z + 14.5],
        [gx + 0.03, z + 12.5],
        [gx, z + 10.5],
        [gx - 0.03, z + 12.5],
      ],
      C.gold,
    );
    c.fcyl(gx, gy, z + 22, 0.19, 2, C.goldDeep, C.gold);
    c.fdome(gx, gy, z + 24, 0.18, 13, C.gold);
    c.fcyl(gx, gy, z + 35, 0.022, 3, C.goldDeep);
    c.fdome(gx, gy, z + 38, 0.04, 4.5, C.gold);
    for (const dx of [-0.11, 0.11]) {
      c.fbox(gx + dx - 0.012, gy + 0.17, z + 8, 0.024, 0.07, 3, C.goldDeep);
      c.fbox(gx + dx - 0.007, gy + 0.22, z + 11, 0.014, 0.014, 13, C.gold);
      c.fcyl(gx + dx, gy + 0.227, z + 23, 0.02, 3.5, C.ink);
      cup(c, gx + dx, gy + 0.24, z, C.white, C.coffee);
    }
    c.fshadowDisc(0.84, 0.4, z, 0.08, 0.22);
    c.fcyl(0.84, 0.4, z, 0.07, 11, C.lacquerNavy, C.gold);
    c.fcyl(0.84, 0.4, z + 11, 0.035, 3, C.gold);
    c.ffrustum(0.84, 0.4, z + 14, 0.04, 0.075, 8, C.glass, C.coffee);
    plantPot(c, 0.84, 0.74, z, C.gold, C.matcha, 0.9);
  }
};

/** Glastür mit beleuchtetem Innenraum und drei Reihen Flaschen (Kühlschrank). */
function fridgeDoor(
  c: FacingCanvas,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  inside: string,
  bottles: readonly string[],
  shelfColor: string,
) {
  c.frontLit(x, y, z, w, h, inside);
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    const zr = z + 2 + (r * (h - 4)) / rows;
    c.frontLit(x, y + 0.001, zr - 0.8, w, 0.8, shelfColor);
    const n = 4;
    for (let k = 0; k < n; k++) {
      const col = bottles[(r + k) % bottles.length] ?? C.matcha;
      const bx = x + 0.03 + (k * (w - 0.06)) / n;
      const bw = (w - 0.06) / n - 0.03;
      c.frontLit(bx, y + 0.002, zr, bw, 7, col);
      c.frontLit(bx + bw * 0.3, y + 0.002, zr + 7, bw * 0.4, 2.5, col);
      c.frontLit(bx + bw * 0.15, y + 0.003, zr + 2, bw * 0.7, 2.5, C.white);
    }
  }
  c.glass(x, y + 0.004, z, w, h, 0.32);
}

/** Eistruhe/Gelato-Theke: Wanne mit bunten Eisbehältern unter Glas. */
function gelato(
  c: FacingCanvas,
  x: number,
  y: number,
  w: number,
  d: number,
  h: number,
  body: string,
  frame: string,
  slanted: boolean,
) {
  c.fshadow(x - 0.02, y - 0.02, 0, w + 0.04, d + 0.04, 0.24);
  c.fbevel(x, y, 0, w, d, h, body, { b: 1.4 });
  c.fflat(x + 0.03, y + 0.04, h + 0.01, w - 0.06, d - 0.08, shade(C.ink, 1.2));
  const flavors = [C.sakura, C.matchaFoam, C.cream, C.coffee, C.orange, C.matcha];
  const cols = 2;
  const rows = 3;
  for (let i = 0; i < cols * rows; i++) {
    const cx = x + 0.03 + ((i % cols) + 0.5) * ((w - 0.06) / cols);
    const cy = y + 0.04 + (Math.floor(i / cols) + 0.5) * ((d - 0.08) / rows);
    c.fdome(
      cx,
      cy,
      h + 0.02,
      Math.min((w - 0.06) / cols, (d - 0.08) / rows) * 0.42,
      2.6,
      flavors[i] ?? C.cream,
    );
  }
  if (slanted) {
    const top = h + 9;
    c.fbox(x, y, h, w, 0.06, 9, frame);
    c.group(0.45, () =>
      c.fpoly(
        [
          [x, y + d, h],
          [x + w, y + d, h],
          [x + w, y + 0.06, top],
          [x, y + 0.06, top],
        ],
        C.glass,
      ),
    );
    c.fpoly(
      [
        [x, y + d, h],
        [x + w, y + d, h],
        [x + w, y + d - 0.03, h + 1],
        [x, y + d - 0.03, h + 1],
      ],
      frame,
    );
    c.fbox(x, y + 0.06, top - 1, w, 0.04, 1, frame);
  } else {
    c.fflat(x + 0.03, y + 0.04, h + 2.8, w - 0.06, d - 0.08, C.glass, 0.4);
  }
}

const iceBox: Draw = (c, tier) => {
  c.fshadow(0.04, 0.12, 0, 0.62, 0.78, 0.28);
  const fx = 0.06;
  const fy = 0.14;
  const fw = 0.56;
  const fd = 0.7;
  const front = fy + fd + 0.001;
  if (tier === 1) {
    c.fbevel(fx, fy, 0, fw, fd, 46, C.white, { b: 2.5 });
    c.front(fx + 0.02, front, 31, fw - 0.04, 0.8, shade(C.white, 0.8));
    c.frontLit(fx + fw - 0.09, front + 0.001, 34, 0.03, 8, c.frontShade(C.steel));
    c.frontLit(fx + fw - 0.09, front + 0.001, 15, 0.03, 12, c.frontShade(C.steel));
    for (const [mx, mz, col] of [
      [0.14, 24, C.red],
      [0.26, 20, C.matcha],
      [0.2, 13, C.gold],
    ] as const)
      c.frontLit(mx, front + 0.001, mz, 0.04, 2.5, col);
    c.frontLit(0.3, front + 0.001, 12, 0.08, 6, C.paper);
    gelato(c, 0.66, 0.32, 0.3, 0.52, 20, C.white, C.white, false);
    c.fbevel(0.66, 0.32, 20, 0.3, 0.52, 2, C.white, { b: 0.8 });
    c.frontLit(0.72, 0.842, 16, 0.16, 1.4, c.frontShade(C.steel));
  } else if (tier === 2) {
    c.fbevel(fx, fy, 0, fw, fd, 50, C.chrome, { b: 2 });
    fridgeDoor(
      c,
      fx + 0.04,
      front,
      5,
      fw - 0.08,
      38,
      shade(C.ink, 1.25),
      [C.matcha, C.sakura, C.cream, C.orange],
      C.chrome,
    );
    c.frontLit(fx + 0.04, front, 45, fw - 0.08, 3, C.ink);
    c.frontLit(fx + 0.2, front + 0.001, 45.7, 0.16, 1.6, C.matchaFoam);
    c.fbox(fx + fw - 0.05, front + 0.005, 12, 0.02, 0.025, 26, C.chrome);
    gelato(c, 0.66, 0.32, 0.3, 0.52, 20, C.chrome, C.chrome, false);
  } else if (tier === 3) {
    c.fbevel(fx, fy, 0, fw, fd, 52, C.chrome, { b: 2 });
    fridgeDoor(
      c,
      fx + 0.04,
      front,
      5,
      fw - 0.08,
      38,
      tint(C.glass, 0.55),
      [C.matcha, C.matchaFoam, C.white, C.sakura],
      C.white,
    );
    c.frontLit(fx + 0.02, front, 45, fw - 0.04, 5.5, c.frontShade(C.lacquerGreen));
    c.frontPoly(
      front + 0.001,
      [
        [0.34, 50],
        [0.37, 47.7],
        [0.34, 45.4],
        [0.31, 47.7],
      ],
      C.white,
    );
    c.fbox(fx + fw - 0.05, front + 0.005, 8, 0.02, 0.025, 32, C.chrome);
    gelato(c, 0.66, 0.3, 0.3, 0.56, 18, C.chrome, C.chrome, true);
  } else if (tier === 4) {
    // Retro-Kühlschrank in Mint mit runder Oberkante, Chromgriff, Messing-Emblem
    for (const [lx, ly] of [
      [fx + 0.04, fy + 0.04],
      [fx + fw - 0.08, fy + 0.04],
      [fx + 0.04, fy + fd - 0.08],
      [fx + fw - 0.08, fy + fd - 0.08],
    ] as const)
      c.fcyl(lx + 0.02, ly + 0.02, 0, 0.02, 3, C.brass);
    c.fbevel(fx, fy, 3, fw, fd, 50, C.enamelMint, { b: 8, edge: 0.12 });
    c.front(fx + 0.025, front, 8, fw - 0.05, 36, tint(C.enamelMint, 0.12));
    c.fbox(fx + fw - 0.12, front + 0.004, 28, 0.08, 0.05, 3, C.chrome, {
      top: tint(C.chrome, 0.4),
    });
    c.fbox(fx + fw - 0.06, front + 0.004, 22, 0.02, 0.05, 9, C.chrome);
    c.frontLit(fx + 0.12, front + 0.001, 38, 0.18, 3.5, c.frontShade(C.brass));
    c.frontLit(fx + 0.14, front + 0.002, 39, 0.14, 1.4, C.cream);
    gelato(c, 0.66, 0.3, 0.3, 0.56, 18, C.walnut, C.brass, true);
    // Waffeln im Halter
    c.fcyl(0.81, 0.36, 27, 0.05, 3, C.brass);
    for (const dx of [-0.025, 0.025])
      c.ffrustum(0.81 + dx, 0.36, 26, 0.008, 0.026, 7, C.oakLight, C.oakLight);
    c.fdome(0.785, 0.36, 33, 0.026, 3, C.sakura);
    c.fdome(0.835, 0.36, 33, 0.026, 3, C.matchaFoam);
  } else {
    // Einbau-Kühlschrank in Nachtblau mit Goldrahmen, warm beleuchtet; Gelato-Vitrine in Gold
    c.fbevel(fx, fy, 0, fw, fd, 54, C.lacquerNavy, { b: 2.5 });
    c.frontLit(fx + 0.025, front, 3, fw - 0.05, 44, c.frontShade(C.gold));
    fridgeDoor(
      c,
      fx + 0.045,
      front + 0.001,
      5,
      fw - 0.09,
      40,
      tint(C.lamp, 0.25),
      [C.matchaDeep, C.gold, C.sakura, C.matcha],
      C.gold,
    );
    c.fbox(fx + fw - 0.06, front + 0.006, 12, 0.022, 0.03, 28, C.gold);
    c.frontLit(fx + 0.1, front, 48.5, fw - 0.2, 3.5, c.frontShade(C.gold));
    c.frontPoly(
      front + 0.001,
      [
        [0.34, 54],
        [0.37, 50.3],
        [0.34, 47.6],
        [0.31, 50.3],
      ],
      C.gold,
    );
    gelato(c, 0.66, 0.3, 0.3, 0.56, 18, C.lacquerNavy, C.gold, true);
    c.fcyl(0.81, 0.36, 27, 0.05, 3, C.gold);
    c.fshine(0.81, 0.36, 27, 0.05, 3, C.gold);
    for (const dx of [-0.025, 0.025])
      c.ffrustum(0.81 + dx, 0.36, 26, 0.008, 0.026, 7, C.oakLight, C.oakLight);
    c.fdome(0.785, 0.36, 33, 0.026, 3, C.sakura);
    c.fdome(0.835, 0.36, 33, 0.026, 3, C.matchaFoam);
  }
};

/** Backofen-Fenster: Rahmen, Glut, Gebäck dahinter. */
function ovenWindow(
  c: FacingCanvas,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  frame: string,
) {
  c.frontLit(x, y, z, w, h, c.frontShade(frame));
  c.frontLit(x + 0.025, y + 0.001, z + 1.5, w - 0.05, h - 3, shade(C.ink, 1.1));
  c.frontLit(x + 0.035, y + 0.002, z + 2, w - 0.07, h - 4, C.orange, 0.85);
  const n = Math.max(2, Math.round(w / 0.16));
  for (let i = 0; i < n; i++)
    c.frontPoly(
      y + 0.003,
      [
        [x + 0.06 + (i * (w - 0.12)) / n, z + 2.6],
        [x + 0.06 + ((i + 0.85) * (w - 0.12)) / n, z + 2.6],
        [x + 0.06 + ((i + 0.65) * (w - 0.12)) / n, z + 5.2],
        [x + 0.06 + ((i + 0.2) * (w - 0.12)) / n, z + 5.2],
      ],
      C.woodDark,
    );
  c.frontLit(x + 0.04, y + 0.004, z + h - 3.5, w * 0.35, 1, C.white, 0.5);
}

/** Blech mit Gebäck (Croissants, Kekse) oben auf einem Gerät. */
function bakingTray(
  c: FacingCanvas,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  metal: string,
  n = 3,
) {
  c.fbevel(x, y, z, w, d, 1.4, metal, { b: 0.5 });
  for (let i = 0; i < n; i++) {
    const px = x + ((i + 0.5) * w) / n;
    c.fdome(px, y + d / 2, z + 1.4, Math.min(0.055, w / n / 2.4), 3.2, i % 2 ? C.oakLight : C.wood);
  }
}

const oven: Draw = (c, tier) => {
  if (tier === 1) {
    c.fshadow(0.1, 0.18, 0, 0.82, 0.7, 0.24);
    for (const [lx, ly] of [
      [0.12, 0.22],
      [0.84, 0.22],
      [0.12, 0.8],
      [0.84, 0.8],
    ] as const)
      c.fbox(lx, ly, 0, 0.04, 0.04, 17, shade(C.pine, 0.85));
    c.fbevel(0.08, 0.18, 17, 0.84, 0.7, 3, C.pine, { b: 1 });
    c.fshadow(0.16, 0.3, 20, 0.66, 0.46, 0.2);
    c.fbevel(0.18, 0.3, 20, 0.62, 0.44, 15, C.white, { b: 1.5 });
    ovenWindow(c, 0.22, 0.741, 22.5, 0.38, 10, C.ink);
    for (const kz of [25, 30]) c.frontLit(0.66, 0.742, kz, 0.06, 2.4, C.ink);
    bakingTray(c, 0.26, 0.36, 35, 0.44, 0.3, C.steel, 3);
  } else if (tier === 2) {
    c.fshadow(0.06, 0.14, 0, 0.88, 0.76, 0.26);
    for (const [lx, ly] of [
      [0.1, 0.18],
      [0.86, 0.18],
      [0.1, 0.8],
      [0.86, 0.8],
    ] as const)
      c.fbox(lx, ly, 0, 0.04, 0.04, 5, C.ink);
    c.fbevel(0.08, 0.16, 5, 0.84, 0.68, 32, C.chrome, { b: 2 });
    ovenWindow(c, 0.12, 0.841, 11, 0.54, 18, C.ink);
    c.frontLit(0.14, 0.842, 31, 0.5, 1.6, c.frontShade(C.steel));
    for (const kz of [14, 21, 28]) c.frontLit(0.74, 0.842, kz, 0.08, 3, C.ink);
    bakingTray(c, 0.16, 0.26, 37, 0.66, 0.42, C.steel, 4);
  } else if (tier === 3) {
    c.fshadow(0.04, 0.12, 0, 0.92, 0.8, 0.28);
    c.fbevel(0.06, 0.14, 0, 0.88, 0.72, 48, C.chrome, { b: 2 });
    c.front(0.06, 0.861, 0, 0.88, 3, C.iron);
    for (const wz of [6, 26]) {
      ovenWindow(c, 0.1, 0.861, wz, 0.6, 15, C.iron);
      c.fbox(0.14, 0.865, wz + 16, 0.5, 0.025, 1.4, C.chrome);
    }
    c.frontLit(0.76, 0.862, 40, 0.14, 5, C.iron);
    c.frontLit(0.775, 0.863, 41.2, 0.11, 2.6, '#7fd6ff');
    for (const kz of [12, 19, 26, 33]) c.frontLit(0.79, 0.862, kz, 0.08, 3, C.iron);
    bakingTray(c, 0.14, 0.24, 48, 0.68, 0.46, C.chrome, 4);
  } else if (tier === 4) {
    // Kuppelofen: Sockel aus Naturstein, Ziegelkuppel mit Bogenöffnung und Glut, Rauchrohr, Brote
    c.fshadow(0.04, 0.12, 0, 0.92, 0.8, 0.28);
    c.fcyl(0.5, 0.3, 30, 0.055, 32, C.iron, shade(C.iron, 1.25));
    c.fcyl(0.5, 0.3, 54, 0.062, 1.6, C.copper);
    c.fbevel(0.06, 0.14, 0, 0.88, 0.72, 14, C.stone, { b: 1.5 });
    for (const sx of [0.22, 0.5, 0.78]) c.front(sx, 0.861, 2, 0.008, 10, shade(C.stone, 0.85));
    c.fdome(0.5, 0.5, 14, 0.39, 27, C.brick);
    const arch = (inset: number, zTop: number): P2[] => {
      const pts: P2[] = [
        [0.33 + inset, 14.2],
        [0.67 - inset, 14.2],
      ];
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * Math.PI;
        pts.push([0.5 + Math.cos(a) * (0.17 - inset), zTop - 7 + Math.sin(a) * 7]);
      }
      return pts;
    };
    c.frontPoly(0.87, arch(0, 31), C.stone);
    c.frontPoly(0.871, arch(0.03, 29), shade(C.ink, 1.1));
    c.frontPoly(
      0.872,
      [
        [0.38, 14.5],
        [0.62, 14.5],
        [0.59, 18],
        [0.55, 22.5],
        [0.52, 19.5],
        [0.48, 24.5],
        [0.45, 19.5],
        [0.41, 21],
      ],
      C.orange,
    );
    c.frontPoly(
      0.873,
      [
        [0.43, 14.5],
        [0.57, 14.5],
        [0.54, 18],
        [0.5, 20.5],
        [0.46, 18],
      ],
      C.glow,
    );
    // Brote auf dem Sockelrand, Brotschieber an der Seite
    c.fdome(0.17, 0.8, 14, 0.06, 4.5, C.oakLight);
    c.fdome(0.83, 0.8, 14, 0.06, 4.5, C.wood);
    c.fpoly(
      [
        [0.95, 0.5, 2],
        [0.97, 0.5, 2],
        [0.97, 0.46, 36],
        [0.95, 0.46, 36],
      ],
      C.oakLight,
    );
    c.fpoly(
      [
        [0.93, 0.42, 1],
        [0.99, 0.42, 1],
        [0.99, 0.56, 11],
        [0.93, 0.56, 11],
      ],
      C.oakLight,
    );
  } else {
    // Herd in Nachtblau-Emaille mit Goldleisten, zwei Backröhren, Goldknöpfe, Haube an der Wand
    // Haube an der Wand: Kamin, schräge Haube, Goldkante
    c.fbox(0.32, 0.02, 54, 0.36, 0.14, 10, C.enamelNavy);
    c.front(0.32, 0.161, 57, 0.36, 1.4, C.gold);
    c.fbox(0.08, 0.02, 44.5, 0.84, 0.48, 3, C.gold, { top: tint(C.gold, 0.3) });
    c.fpoly(
      [
        [0.08, 0.5, 47.5],
        [0.92, 0.5, 47.5],
        [0.7, 0.16, 55],
        [0.3, 0.16, 55],
      ],
      tint(c.frontShade(C.enamelNavy), 0.12),
    );
    c.fpoly(
      [
        [0.92, 0.02, 47.5],
        [0.92, 0.5, 47.5],
        [0.7, 0.16, 55],
        [0.7, 0.02, 55],
      ],
      tint(c.sideShade(C.enamelNavy), 0.08),
    );
    c.fglow(0.14, 0.28, 31, 0.72, 0.5, C.lamp, 0.3, 2.5);
    c.fshadow(0.02, 0.18, 0, 0.96, 0.72, 0.28);
    c.fbox(0.04, 0.2, 0, 0.92, 0.66, 2.5, C.gold);
    c.fbevel(0.04, 0.2, 2.5, 0.92, 0.66, 28, C.enamelNavy, { b: 1.5, frontColor: C.enamelNavy });
    for (const ox of [0.08, 0.52]) {
      c.front(ox, 0.861, 5, 0.4, 16, C.gold);
      c.front(ox + 0.02, 0.862, 6, 0.36, 14, C.enamelNavy);
      ovenWindow(c, ox + 0.06, 0.863, 8, 0.28, 9, C.gold);
    }
    rail(c, 0.06, 0.94, 0.89, 22.5, C.gold);
    for (let k = 0; k < 6; k++)
      c.frontLit(0.12 + k * 0.14, 0.862, 25.5, 0.05, 2.4, c.frontShade(C.gold));
    c.fflat(0.07, 0.24, 30.6, 0.86, 0.58, C.iron);
    for (const [hx, hy] of [
      [0.28, 0.4],
      [0.72, 0.4],
      [0.28, 0.66],
      [0.72, 0.66],
    ] as const) {
      c.fdisc(hx, hy, 30.7, 0.09, C.gold);
      c.fdisc(hx, hy, 30.8, 0.065, C.iron);
    }
    c.fcyl(0.5, 0.54, 30.6, 0.09, 1.5, C.gold, tint(C.gold, 0.3));
    for (const [mx, my, col] of [
      [0.46, 0.5, C.sakura],
      [0.54, 0.52, C.matchaFoam],
      [0.5, 0.58, C.cream],
    ] as const)
      c.fdome(mx, my, 32.1, 0.024, 2.4, col);
  }
};

/** Glasvitrine als halbtransparenter Kasten mit Rahmenkanten. */
function glassCase(
  c: FacingCanvas,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
  frame: string,
) {
  c.group(0.38, () => c.fbox(x, y, z, w, d, h, C.glass, { top: tint(C.glass, 0.5) }));
  const post = 0.02;
  for (const [px, py] of [
    [x, y + d - post],
    [x + w - post, y + d - post],
    [x + w - post, y],
  ] as const)
    c.fbox(px, py, z, post, post, h, frame);
  c.fbox(x, y, z + h - 1, w, d, 1, frame, { top: tint(frame, 0.25) });
  c.fflat(x + 0.03, y + 0.03, z + h + 0.01, w - 0.06, d - 0.06, C.glass, 0.5);
}

const displayCase: Draw = (c, tier) => {
  const z = BACK_TOP;
  if (tier === 3) tiles(c, z, 52, C.white);
  if (tier === 5) crest(c, 0.37, 52, 0.26, 10);
  backCounter(c, tier);
  if (tier === 1) {
    for (const [i, col] of [C.sakura, C.cream, C.matchaFoam].entries())
      cake(c, 0.24 + i * 0.26, 0.5, z, 0.08, C.wood, col);
    glassCase(c, 0.08, 0.26, z, 0.84, 0.5, 15, C.white);
    for (let i = 0; i < 3; i++) c.frontLit(0.18 + i * 0.26, 0.77, z + 1, 0.1, 2.5, C.paper);
  } else if (tier === 2) {
    for (const [i, col] of [C.sakura, C.cream, C.matchaFoam].entries())
      cake(c, 0.22 + i * 0.28, 0.56, z, 0.075, C.wood, col);
    c.fbox(0.1, 0.28, z + 11, 0.8, 0.5, 0.8, C.glass);
    for (let i = 0; i < 4; i++)
      c.fdome(0.2 + i * 0.2, 0.5, z + 11.8, 0.035, 3, i % 2 ? C.sakura : C.oakLight);
    glassCase(c, 0.08, 0.26, z, 0.84, 0.54, 22, C.oak);
    for (let i = 0; i < 3; i++) c.frontLit(0.16 + i * 0.28, 0.81, z + 1, 0.1, 2.5, C.paper);
  } else if (tier === 3) {
    c.fbox(0.06, 0.22, z, 0.88, 0.12, 20, C.white);
    c.fglow(0.1, 0.36, z + 19.4, 0.8, 0.06, C.led, 0.45, 1);
    for (const [i, col] of [C.matchaFoam, C.sakura, C.cream].entries()) {
      c.fcyl(0.24 + i * 0.26, 0.6, z, 0.09, 0.8, C.white);
      cake(c, 0.24 + i * 0.26, 0.6, z + 0.8, 0.07, C.oakLight, col);
    }
    c.fbox(0.08, 0.34, z + 10, 0.84, 0.24, 0.8, C.glass);
    for (let i = 0; i < 4; i++)
      c.fdome(
        0.18 + i * 0.21,
        0.45,
        z + 10.8,
        0.035,
        3,
        [C.matcha, C.sakura, C.oakLight, C.cream][i] ?? C.cream,
      );
    c.group(0.42, () =>
      c.fpoly(
        [
          [0.06, 0.84, z],
          [0.94, 0.84, z],
          [0.94, 0.34, z + 20],
          [0.06, 0.34, z + 20],
        ],
        C.glass,
      ),
    );
    c.fpoly(
      [
        [0.06, 0.84, z],
        [0.94, 0.84, z],
        [0.94, 0.82, z + 1.4],
        [0.06, 0.82, z + 1.4],
      ],
      C.chrome,
    );
    c.fbox(0.06, 0.22, z + 20, 0.88, 0.16, 1.5, C.chrome, { top: tint(C.chrome, 0.3) });
    c.fshadowDisc(0.3, 0.3, z + 21.5, 0.07, 0.18);
    c.fcyl(0.3, 0.3, z + 21.5, 0.06, 8, C.oakLight);
    c.group(0.5, () => c.fcyl(0.3, 0.3, z + 21.5, 0.064, 9, C.glass, tint(C.glass, 0.5)));
    c.fdome(0.3, 0.3, z + 30.5, 0.066, 2.5, C.chrome);
  } else if (tier === 4) {
    c.fbevel(0.06, 0.22, z, 0.88, 0.62, 2, C.marble, { b: 0.6 });
    for (const [i, col] of [C.sakura, C.matchaFoam, C.cream].entries()) {
      const px = 0.22 + i * 0.28;
      c.fcyl(px, 0.5, z + 2, 0.025, 4, C.brass);
      c.fcyl(px, 0.5, z + 6, 0.085, 1, C.brass, tint(C.brass, 0.3));
      cake(c, px, 0.5, z + 7, 0.07, C.oakLight, col);
    }
    for (let i = 0; i < 6; i++)
      c.fdome(
        0.14 + i * 0.145,
        0.76,
        z + 2,
        0.026,
        2.6,
        [C.sakura, C.matchaFoam, C.gold][i % 3] ?? C.cream,
      );
    glassCase(c, 0.06, 0.22, z, 0.88, 0.62, 21, C.brass);
    c.fshadowDisc(0.5, 0.5, z + 21, 0.1, 0.18);
    c.fcyl(0.5, 0.5, z + 21, 0.1, 1.2, C.brass, tint(C.brass, 0.3));
    cake(c, 0.5, 0.5, z + 22.2, 0.075, C.sakura, C.cream);
    cloche(c, 0.5, 0.5, z + 22.2, 0.1, 13, C.brass);
  } else {
    // Vitrine mit Goldrahmen und warmem Licht, darauf eine dreistöckige Etagere
    c.fbevel(0.06, 0.22, z, 0.88, 0.62, 2, C.marble, { b: 0.6 });
    ledUnder(c, 0.08, 0.24, z + 2.2, 0.84, 0.58);
    for (const [i, col] of [C.matchaFoam, C.sakura, C.cream].entries()) {
      const px = 0.22 + i * 0.28;
      c.fcyl(px, 0.5, z + 2, 0.025, 4, C.gold);
      c.fcyl(px, 0.5, z + 6, 0.085, 1, C.gold, tint(C.gold, 0.3));
      cake(c, px, 0.5, z + 7, 0.07, C.lacquerNavyLight, col, C.gold);
    }
    for (let i = 0; i < 6; i++)
      c.fdome(
        0.14 + i * 0.145,
        0.76,
        z + 2,
        0.026,
        2.6,
        [C.sakura, C.matchaFoam, C.gold][i % 3] ?? C.cream,
      );
    glassCase(c, 0.06, 0.22, z, 0.88, 0.62, 21, C.gold);
    const ex = 0.5;
    const ey = 0.5;
    c.fshadowDisc(ex, ey, z + 21, 0.12, 0.2);
    c.fbox(ex - 0.008, ey - 0.008, z + 21, 0.016, 0.016, 20, C.gold);
    for (const [lz, r] of [
      [z + 21.5, 0.13],
      [z + 29, 0.1],
      [z + 36, 0.07],
    ] as const) {
      c.fcyl(ex, ey, lz, r, 1, C.gold, tint(C.gold, 0.35));
      const n = r > 0.1 ? 4 : r > 0.08 ? 3 : 2;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + 0.6;
        c.fdome(
          ex + Math.cos(a) * r * 0.6,
          ey + Math.sin(a) * r * 0.6,
          lz + 1,
          0.026,
          2.8,
          [C.sakura, C.matchaFoam, C.cream, C.gold][k] ?? C.cream,
        );
      }
    }
    c.fdome(ex, ey, z + 41, 0.022, 3, C.gold);
  }
};

/** Steinmühle (Ishiusu): Auffangteller mit Matcha, zwei Mahlsteine, Kurbel. */
function mill(
  c: FacingCanvas,
  x: number,
  y: number,
  z: number,
  stone: string,
  handle: string,
  s = 1,
  band?: string,
) {
  const r = 0.17 * s;
  c.fshadowDisc(x, y, z, r * 1.3, 0.24);
  c.fcyl(x, y, z, r * 1.3, 2.2, shade(stone, 0.92), tint(stone, 0.1));
  c.fdisc(x, y, z + 2.2, r * 1.15, C.matcha);
  c.fdisc(x, y, z + 2.25, r * 1.02, C.matchaFoam);
  c.fcyl(x, y, z + 2.2, r, 6.5 * s, stone, tint(stone, 0.15));
  if (band) c.fcyl(x, y, z + 2.2 + 6.5 * s - 0.6, r * 1.01, 1.2, band, tint(band, 0.3));
  c.fcyl(x, y, z + 2.2 + 6.5 * s + 0.5, r * 0.96, 7 * s, shade(stone, 0.96), tint(stone, 0.22));
  const top = z + 2.2 + 13.5 * s + 0.5;
  c.fdisc(x - r * 0.15, y - r * 0.15, top, r * 0.28, shade(stone, 0.7));
  c.fdisc(x - r * 0.15, y - r * 0.15, top + 0.05, r * 0.2, C.matchaDeep);
  // Kurbel: Zapfen außen am oberen Stein, senkrechter Griff
  c.fbox(x + r * 0.9, y - 0.012, top - 4, 0.1 * s, 0.024, 2, handle);
  c.fcyl(x + r * 0.9 + 0.09 * s, y, top - 4, 0.018, 9 * s, handle, tint(handle, 0.3));
}

const grinder: Draw = (c, tier) => {
  if (tier === 1) {
    // Holzkiste mit Latten
    c.fshadow(0.14, 0.14, 0, 0.74, 0.74, 0.26);
    c.fbevel(0.16, 0.16, 0, 0.68, 0.68, 16, C.pine, { b: 1 });
    for (let k = 1; k < 4; k++) {
      c.front(0.16, 0.841, k * 4, 0.68, 0.6, shade(C.pine, 0.75));
      c.side(0.841, 0.16, k * 4, 0.68, 0.6, shade(C.pine, 0.75));
    }
    mill(c, 0.5, 0.5, 16, C.stone, C.woodDark, 0.95);
    bowl(c, 0.78, 0.8, 16, 0.07);
  } else if (tier === 2) {
    // Eichentisch mit Schublade
    c.fshadow(0.1, 0.12, 0, 0.82, 0.8, 0.24);
    for (const [lx, ly] of [
      [0.12, 0.16],
      [0.84, 0.16],
      [0.12, 0.84],
      [0.84, 0.84],
    ] as const)
      c.fbox(lx, ly, 0, 0.04, 0.04, 14, C.oak);
    c.fbox(0.12, 0.16, 10, 0.76, 0.72, 5, C.oak);
    c.front(0.36, 0.881, 11, 0.28, 3, C.oakLight);
    c.frontLit(0.47, 0.882, 12, 0.06, 1, C.chrome);
    c.fbevel(0.1, 0.14, 15, 0.8, 0.76, 2.5, C.oakLight, { b: 0.8 });
    mill(c, 0.44, 0.48, 17.5, C.stone, C.woodDark);
    tin(c, 0.8, 0.3, 17.5, C.matcha);
    c.fshadowDisc(0.78, 0.76, 17.5, 0.08, 0.2);
    c.ffrustum(0.78, 0.76, 17.5, 0.06, 0.085, 3, C.chrome, C.matchaFoam);
  } else if (tier === 3) {
    // Werkbank in Matcha-Lack, zwei Mühlen, Siebschale, Teesack
    c.fshadow(0.04, 0.12, 0, 0.92, 0.8, 0.26);
    c.fbox(0.06, 0.14, 0, 0.88, 0.72, 2.5, TIER_STYLE[3].plinth);
    c.fbox(0.06, 0.14, 2.5, 0.88, 0.72, 13.5, C.lacquerGreen);
    frontPanels(c, 3, 0.861, 0.08, 0.92, 3, 15, 2);
    c.fbevel(0.04, 0.12, 16, 0.92, 0.76, 2.5, C.quartz, { b: 0.8 });
    mill(c, 0.3, 0.38, 18.5, C.stone, C.woodDark, 0.8);
    mill(c, 0.7, 0.36, 18.5, C.stone, C.woodDark, 0.8);
    c.fshadow(0.4, 0.66, 18.5, 0.3, 0.18, 0.18);
    c.fbevel(0.4, 0.66, 18.5, 0.3, 0.18, 1.6, C.oakLight, { b: 0.5 });
    c.fdome(0.55, 0.75, 20.1, 0.08, 2.2, C.matcha);
    tin(c, 0.84, 0.76, 18.5, C.white, C.chrome);
  } else if (tier === 4) {
    // Nussbaum-Podest mit Messing, Granitmühle mit Messingkurbel, Teeblätter im Glas, Bonsai
    c.fshadow(0.06, 0.1, 0, 0.88, 0.84, 0.26);
    c.fbox(0.1, 0.14, 0, 0.8, 0.76, 2.5, C.brass);
    c.fbox(0.1, 0.14, 2.5, 0.8, 0.76, 13.5, C.walnut);
    frontPanels(c, 4, 0.901, 0.1, 0.9, 2.5, 16, 1);
    c.fbevel(0.08, 0.12, 16, 0.84, 0.8, 2.5, C.marble, { b: 0.8, edge: 0.3 });
    veins(c, 18.5, [
      [
        [0.1, 0.3],
        [0.4, 0.5],
        [0.6, 0.86],
      ],
    ]);
    mill(c, 0.42, 0.46, 18.5, C.granite, C.brass);
    jar(c, 0.8, 0.3, 18.5, C.matchaDeep, C.brass);
    c.fshadowDisc(0.78, 0.76, 18.5, 0.08, 0.2);
    c.fcyl(0.78, 0.76, 18.5, 0.075, 2.5, C.ink, C.woodDeep);
    c.fbox(0.775, 0.755, 21, 0.01, 0.01, 6, C.woodDeep);
    c.fdome(0.76, 0.76, 26, 0.06, 4, C.matchaDeep);
    c.fdome(0.8, 0.74, 28.5, 0.045, 3.5, C.matcha);
  } else {
    // Nachtblaues Podest mit Goldkante und Licht, dunkle Granitmühle mit Goldkurbel, Glasglocke über Matcha
    c.fshadow(0.04, 0.08, 0, 0.92, 0.88, 0.28);
    c.fbox(0.08, 0.12, 0, 0.84, 0.8, 2.5, C.gold);
    c.fbox(0.08, 0.12, 2.5, 0.84, 0.8, 14.5, C.lacquerNavy);
    frontPanels(c, 5, 0.921, 0.1, 0.9, 3, 16.5, 1);
    ledUnder(c, 0.08, 0.88, 16.6, 0.84, 0.05);
    c.fbevel(0.06, 0.1, 17, 0.88, 0.84, 2.5, C.marble, { b: 0.8, frontColor: C.gold, edge: 0.3 });
    mill(c, 0.4, 0.44, 19.5, C.granite, C.gold, 1, C.gold);
    c.fshadowDisc(0.8, 0.3, 19.5, 0.08, 0.2);
    c.fcyl(0.8, 0.3, 19.5, 0.08, 1.2, C.gold, tint(C.gold, 0.3));
    c.fdome(0.8, 0.3, 20.7, 0.05, 4, C.matcha);
    cloche(c, 0.8, 0.3, 20.7, 0.075, 11, C.gold);
    c.fshadow(0.66, 0.66, 19.5, 0.22, 0.2, 0.2);
    c.fbevel(0.66, 0.66, 19.5, 0.22, 0.2, 3, C.gold, { b: 0.8 });
    c.frontLit(0.7, 0.861, 20.3, 0.14, 1.6, C.lacquerNavy);
    c.fcyl(0.77, 0.76, 22.5, 0.06, 0.8, C.gold, tint(C.gold, 0.4));
  }
};

/** Tatami-Matte mit Stoffkanten. */
function tatami(c: FacingCanvas, color: string, border: string) {
  c.fshadow(0.02, 0.02, 0, 0.96, 0.96, 0.18);
  c.fbox(0.04, 0.04, 0, 0.92, 0.92, 1.6, color, { top: color });
  for (let k = 1; k < 8; k++)
    c.fflat(0.04, 0.04 + k * 0.115, 1.61, 0.92, 0.012, shade(color, 0.93));
  c.fflat(0.04, 0.04, 1.62, 0.92, 0.05, border);
  c.fflat(0.04, 0.91, 1.62, 0.92, 0.05, border);
}

/** Niedriger Tisch für die Zeremonie. */
function lowTable(
  c: FacingCanvas,
  x: number,
  y: number,
  w: number,
  d: number,
  wood: string,
  edge?: string,
) {
  c.fshadow(x, y, 1.6, w, d, 0.22);
  for (const [lx, ly] of [
    [x + 0.02, y + 0.02],
    [x + w - 0.05, y + 0.02],
    [x + 0.02, y + d - 0.05],
    [x + w - 0.05, y + d - 0.05],
  ] as const)
    c.fbox(lx, ly, 1.6, 0.03, 0.03, 5, shade(wood, 0.8));
  c.fbevel(x, y, 6.6, w, d, 2, wood, { b: 0.6, frontColor: edge ?? wood });
}

/** Sitzkissen (Zabuton). */
function zabuton(c: FacingCanvas, x: number, y: number, color: string) {
  c.fshadow(x, y, 1.6, 0.26, 0.22, 0.2);
  c.fbevel(x, y, 1.6, 0.26, 0.22, 2.4, color, { b: 1.2, edge: 0.18 });
}

/** Rollbild an der Wand: Stäbe, Papier, Tusche-Berg mit roter Sonne. */
function scroll(c: FacingCanvas, x: number, z: number, w = 0.22, h = 30) {
  c.frontLit(x, 0.03, z, w, h, c.frontShade(C.lacquerGreen));
  c.frontLit(x + 0.025, 0.031, z + 2, w - 0.05, h - 4, C.paper);
  c.fbox(x - 0.02, 0.025, z + h - 1.5, w + 0.04, 0.03, 1.5, C.woodDeep);
  c.fbox(x - 0.01, 0.025, z, w + 0.02, 0.03, 1.5, C.woodDeep);
  c.frontPoly(
    0.032,
    [
      [x + 0.04, z + 8],
      [x + w * 0.42, z + 17],
      [x + w * 0.6, z + 12],
      [x + w * 0.75, z + 15],
      [x + w - 0.04, z + 8],
    ],
    C.ink,
    0.75,
  );
  c.frontLit(x + w * 0.62, 0.033, z + 20, 0.03, 2.6, C.red);
}

/** Shoji-Schiebewand an der Rückwand: Holzrahmen mit Papierfeldern. */
function shoji(c: FacingCanvas, x: number, w: number, z0: number, h: number, wood: string) {
  c.fbox(x, 0.01, z0, w, 0.03, h, wood);
  const cols = 3;
  const rows = 4;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++)
      c.frontLit(
        x + 0.02 + (i * (w - 0.04)) / cols + 0.008,
        0.041,
        z0 + 2 + (j * (h - 4)) / rows + 0.6,
        (w - 0.04) / cols - 0.016,
        (h - 4) / rows - 1.2,
        C.paper,
      );
}

/** Kyusu: kleine Teekanne mit Seitengriff (Zeremonie Stufe 1–2). */
function kyusu(c: FacingCanvas, x: number, y: number, z: number, color: string) {
  c.fshadowDisc(x, y, z, 0.08, 0.2);
  c.fcyl(x, y, z, 0.075, 3.6, color, tint(color, 0.15));
  c.fdome(x, y, z + 3.6, 0.075, 2.6, color);
  c.fdome(x, y, z + 6, 0.018, 1.4, shade(color, 0.75));
  // Tülle nach vorn rechts, Seitengriff nach hinten links
  c.fbox(x + 0.055, y + 0.03, z + 1.6, 0.07, 0.02, 1.8, color);
  c.fbox(x - 0.03, y - 0.17, z + 1.8, 0.024, 0.11, 2, shade(color, 0.85));
}

/** Furo (Kohlebecken) mit Kessel. */
function furo(c: FacingCanvas, x: number, y: number, z: number, body: string, ring: string) {
  c.fshadowDisc(x, y, z, 0.11, 0.22);
  c.ffrustum(x, y, z, 0.1, 0.09, 4, body, shade(body, 0.7));
  c.fcyl(x, y, z + 4, 0.092, 1, ring);
  c.fcyl(x, y, z + 5, 0.07, 3, C.iron);
  c.fdome(x, y, z + 8, 0.075, 5, C.iron);
  c.fcyl(x, y, z + 12.2, 0.02, 1.4, ring);
}

const ceremonySet: Draw = (c, tier) => {
  // Rückwand
  if (tier === 2) scroll(c, 0.38, 26);
  if (tier >= 3 && tier <= 4) {
    shoji(c, 0.04, 0.3, 4, 40, tier === 4 ? C.walnut : C.oak);
    shoji(c, 0.66, 0.3, 4, 40, tier === 4 ? C.walnut : C.oak);
    scroll(c, 0.39, 24, 0.22, 26);
  }
  if (tier === 5) {
    // Goldener Faltschirm (Byobu): vier Felder im Zickzack mit grünen Hügeln
    for (let i = 0; i < 4; i++) {
      const x0 = 0.06 + i * 0.22;
      const back = i % 2 === 0;
      const y0 = back ? 0.03 : 0.09;
      const y1 = back ? 0.09 : 0.03;
      c.fpoly(
        [
          [x0, y0, 2],
          [x0 + 0.22, y1, 2],
          [x0 + 0.22, y1, 44],
          [x0, y0, 44],
        ],
        back ? C.gold : shade(C.gold, 0.86),
      );
      c.fpoly(
        [
          [x0, y0, 2],
          [x0 + 0.22, y1, 2],
          [x0 + 0.22, y1, 4],
          [x0, y0, 4],
        ],
        C.ink,
      );
      c.fpoly(
        [
          [x0, y0, 42.5],
          [x0 + 0.22, y1, 42.5],
          [x0 + 0.22, y1, 44],
          [x0, y0, 44],
        ],
        C.ink,
      );
      c.fpoly(
        [
          [x0, y0 + (y1 - y0) * 0, 8],
          [x0 + 0.22, y1, 8],
          [x0 + 0.22, y1, 14 + (i % 2) * 6],
          [x0 + 0.11, y0 + (y1 - y0) * 0.5, 20 - (i % 2) * 4],
          [x0, y0, 12 + (i % 2) * 4],
        ],
        i % 2 ? C.matchaDeep : C.matcha,
      );
    }
    c.fdome(0.62, 0.06, 32, 0.04, 4, C.white);
  }
  tatami(c, C.tatami, tier >= 4 ? C.ink : tier === 3 ? C.lacquerGreen : C.matchaDeep);
  if (tier === 5) c.fbevel(0.12, 0.22, 1.6, 0.76, 0.66, 0.6, C.red, { b: 0.3 });
  const tableWood = [C.pine, C.oak, C.oak, C.ink, C.ink][tier - 1] ?? C.pine;
  lowTable(
    c,
    0.26,
    0.3,
    0.48,
    0.34,
    tableWood,
    tier === 5 ? C.gold : tier === 4 ? C.red : undefined,
  );
  const tz = 8.6;
  if (tier <= 2) {
    kyusu(c, 0.38, 0.44, tz, tier === 1 ? C.cream : C.iron);
    bowl(c, 0.6, 0.52, tz, 0.075);
  } else {
    bowl(c, 0.44, 0.48, tz, 0.075, tier === 5 ? C.ink : C.cream, tier === 5 ? C.gold : undefined);
    chasen(c, 0.62, 0.42, tz, tier === 5 ? C.gold : C.white);
  }
  if (tier >= 2)
    zabuton(c, 0.37, 0.7, [C.plum, C.plum, C.plum, C.lacquerNavyLight, C.red][tier - 1] ?? C.plum);
  if (tier === 1) zabuton(c, 0.37, 0.7, C.lacquerNavyLight);
  if (tier >= 3)
    furo(c, 0.16, 0.74, 1.6, tier >= 4 ? C.ink : C.iron, tier === 5 ? C.gold : C.copper);
  if (tier === 3) {
    c.fshadowDisc(0.84, 0.3, 1.6, 0.05, 0.2);
    c.fcyl(0.84, 0.3, 1.6, 0.04, 12, C.matchaFoam, C.matcha);
    c.fdome(0.84, 0.3, 13.6, 0.05, 6, C.matcha);
    c.fdome(0.87, 0.3, 16, 0.025, 3, C.sakura);
  }
  if (tier === 4) {
    // Andon-Laterne (leuchtend) und Bonsai
    c.fshadow(0.76, 0.2, 1.6, 0.16, 0.16, 0.22);
    c.fbox(0.76, 0.2, 1.6, 0.16, 0.16, 22, C.paper);
    c.fglow(0.7, 0.14, 2, 0.28, 0.28, C.glow, 0.35, 3);
    for (const zz of [1.6, 22.6]) c.fbox(0.75, 0.19, zz, 0.18, 0.18, 1.4, C.ink);
    for (const [px, py] of [
      [0.75, 0.35],
      [0.91, 0.35],
      [0.91, 0.19],
    ] as const)
      c.fbox(px, py, 1.6, 0.02, 0.02, 22, C.ink);
    c.fshadowDisc(0.84, 0.8, 1.6, 0.08, 0.2);
    c.fcyl(0.84, 0.8, 1.6, 0.07, 3, C.terracotta, C.woodDeep);
    c.fbox(0.835, 0.795, 4.6, 0.01, 0.01, 6, C.woodDeep);
    c.fdome(0.82, 0.8, 9.6, 0.06, 4, C.matchaDeep);
    c.fdome(0.87, 0.78, 12, 0.045, 3.5, C.matcha);
  }
  if (tier === 5) {
    c.fshadow(0.76, 0.24, 1.6, 0.16, 0.16, 0.22);
    c.fbox(0.76, 0.24, 1.6, 0.16, 0.16, 22, C.paper);
    c.fglow(0.7, 0.18, 2, 0.28, 0.28, C.glow, 0.4, 3);
    for (const zz of [1.6, 22.6]) c.fbox(0.75, 0.23, zz, 0.18, 0.18, 1.4, C.gold);
    for (const [px, py] of [
      [0.75, 0.39],
      [0.91, 0.39],
      [0.91, 0.23],
    ] as const)
      c.fbox(px, py, 1.6, 0.02, 0.02, 22, C.gold);
    orchid(c, 0.84, 0.8, 2.2, C.gold);
  }
};

// ---------------------------------------------------------------------------------------------
// Kasse und Ausgabe (stehen auf der Gästetheke, z ab COUNTER_TOP)
// ---------------------------------------------------------------------------------------------

/** Bildschirm mit einfacher Kassen-Oberfläche (Kopfzeile, Kacheln). */
function posScreen(
  c: FacingCanvas,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  bg: string,
  tile: string,
  head: string,
) {
  c.frontLit(x, y, z, w, h, bg);
  c.frontLit(x, y + 0.001, z + h - 2, w, 2, head);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 2; j++)
      c.frontLit(
        x + 0.02 + (i * (w - 0.04)) / 3,
        y + 0.001,
        z + 1 + j * ((h - 3) / 2),
        (w - 0.04) / 3 - 0.015,
        (h - 3) / 2 - 1,
        tile,
      );
}

/** Trinkgeldglas mit Münzen. */
function tipJar(c: FacingCanvas, x: number, y: number, z: number, lid?: string) {
  c.fshadowDisc(x, y, z, 0.055, 0.2);
  c.fcyl(x, y, z, 0.045, 2.5, C.gold, tint(C.gold, 0.3));
  c.group(0.5, () => c.fcyl(x, y, z, 0.052, 8, C.glass, tint(C.glass, 0.5)));
  if (lid) c.fcyl(x, y, z + 8, 0.054, 1.5, lid);
}

/** Kartenterminal. */
function cardTerminal(c: FacingCanvas, x: number, y: number, z: number, body: string) {
  c.fshadow(x, y, z, 0.12, 0.16, 0.2);
  c.fbevel(x, y, z, 0.12, 0.16, 3, body, { b: 0.8 });
  c.fflat(x + 0.02, y + 0.02, z + 3.01, 0.08, 0.06, '#7fd6ff');
}

/** Kasse wie früher mit Bildschirm/Tasten zum Gast: nur noch für das DOM-Icon (erkennbarer als die Rückseite). */
const registerFront: Draw = (c, tier) => {
  const z = COUNTER_TOP;
  if (tier === 1) {
    // Registrierkasse aus Kunststoff: Schublade, schräges Tastenfeld, Anzeige, Bonrolle
    c.fshadow(0.22, 0.3, z, 0.56, 0.44, 0.24);
    c.fbevel(0.24, 0.32, z, 0.5, 0.38, 6, C.enamelCream, { b: 1 });
    c.front(0.28, 0.701, z + 1, 0.42, 3, shade(C.enamelCream, 0.88));
    c.frontLit(0.45, 0.702, z + 2, 0.08, 0.9, C.steel);
    c.fpoly(
      [
        [0.28, 0.66, z + 6],
        [0.7, 0.66, z + 6],
        [0.7, 0.48, z + 9.5],
        [0.28, 0.48, z + 9.5],
      ],
      tint(C.steel, 0.25),
    );
    for (let r = 0; r < 3; r++)
      for (let k = 0; k < 4; k++) {
        const t0 = 0.15 + r * 0.28;
        const x0 = 0.31 + k * 0.095;
        c.fpoly(
          [
            [x0, 0.66 - 0.18 * t0, z + 6 + 3.5 * t0],
            [x0 + 0.06, 0.66 - 0.18 * t0, z + 6 + 3.5 * t0],
            [x0 + 0.06, 0.66 - 0.18 * (t0 + 0.18), z + 6 + 3.5 * (t0 + 0.18)],
            [x0, 0.66 - 0.18 * (t0 + 0.18), z + 6 + 3.5 * (t0 + 0.18)],
          ],
          k === 3 ? C.red : C.white,
        );
      }
    c.fbevel(0.36, 0.34, z + 6, 0.26, 0.12, 9, C.enamelCream, { b: 0.8 });
    c.frontLit(0.39, 0.461, z + 10, 0.2, 3.5, C.ink);
    c.frontLit(0.41, 0.462, z + 10.8, 0.16, 2, '#9fd88a');
    c.fcyl(0.82, 0.5, z, 0.045, 4, C.white, C.paper);
  } else if (tier === 2) {
    // Kassensystem: Schublade, Bildschirm zum Gast, Kartenleser, Trinkgeldglas
    c.fshadow(0.18, 0.28, z, 0.6, 0.46, 0.24);
    c.fbevel(0.2, 0.3, z, 0.52, 0.4, 5, C.ink, { b: 0.8 });
    c.front(0.24, 0.701, z + 1, 0.44, 2.8, tint(C.ink, 0.15));
    c.fbox(0.42, 0.42, z + 5, 0.08, 0.08, 4, C.ink);
    c.fbevel(0.24, 0.44, z + 8, 0.42, 0.07, 15, C.ink, { b: 0.8 });
    posScreen(c, 0.26, 0.511, z + 9.5, 0.38, 12, '#dbeaf7', '#9cc3e6', C.matcha);
    cardTerminal(c, 0.76, 0.52, z, C.ink);
    tipJar(c, 0.12, 0.6, z);
  } else if (tier === 3) {
    // Tablet-Kasse auf Schwenkfuß, Bondrucker, Terminal, Trinkgeldglas
    c.fshadow(0.62, 0.3, z, 0.22, 0.24, 0.2);
    c.fbevel(0.62, 0.3, z, 0.2, 0.22, 6, C.white, { b: 1 });
    c.fflat(0.65, 0.36, z + 6.02, 0.14, 0.04, C.ink);
    c.fpoly(
      [
        [0.66, 0.38, z + 6.1],
        [0.78, 0.38, z + 6.1],
        [0.78, 0.44, z + 10],
        [0.66, 0.44, z + 10],
      ],
      C.paper,
    );
    c.fshadowDisc(0.38, 0.52, z, 0.09, 0.22);
    c.fcyl(0.38, 0.52, z, 0.08, 1.2, C.chrome, tint(C.chrome, 0.3));
    c.fcyl(0.38, 0.52, z + 1.2, 0.018, 8, C.chrome);
    c.fbevel(0.18, 0.5, z + 8, 0.4, 0.04, 14, C.white, { b: 0.6 });
    posScreen(c, 0.2, 0.541, z + 9.2, 0.36, 11.6, C.lacquerGreen, C.matchaFoam, C.white);
    cardTerminal(c, 0.74, 0.6, z, C.white);
    tipJar(c, 0.1, 0.62, z, C.chrome);
  } else if (tier === 4) {
    // Nussbaum-Kassenlade, Tablet im Messingrahmen, Messingglocke, Blume
    c.fshadow(0.16, 0.3, z, 0.56, 0.42, 0.24);
    c.fbevel(0.18, 0.32, z, 0.5, 0.36, 4.5, C.walnut, { b: 1, edge: 0.18 });
    c.front(0.22, 0.681, z + 1, 0.42, 2.4, C.walnutLight);
    c.frontLit(0.4, 0.682, z + 1.8, 0.06, 0.9, c.frontShade(C.brass));
    c.fcyl(0.43, 0.5, z + 4.5, 0.06, 1.2, C.brass, tint(C.brass, 0.3));
    c.fcyl(0.43, 0.5, z + 5.7, 0.016, 5, C.brass);
    c.fbevel(0.23, 0.48, z + 10, 0.4, 0.04, 14, C.brass, { b: 0.6 });
    posScreen(c, 0.25, 0.521, z + 11.2, 0.36, 11.6, C.paper, C.matchaFoam, C.walnut);
    bell(c, 0.82, 0.6, z, C.brass, C.walnut);
    c.fshadowDisc(0.84, 0.32, z, 0.04, 0.2);
    c.fcyl(0.84, 0.32, z, 0.03, 7, C.cream, tint(C.cream, 0.3));
    c.fdome(0.84, 0.32, z + 9, 0.03, 3.5, C.sakura);
    c.fbox(0.838, 0.318, z + 7, 0.006, 0.006, 3, C.matchaDeep);
  } else {
    // Nostalgische Registrierkasse in Gold: Zierkorpus, Tastenreihen, Bekrönung mit Anzeige, Kurbel
    c.fshadow(0.14, 0.26, z, 0.66, 0.5, 0.28);
    c.fbevel(0.16, 0.28, z, 0.6, 0.44, 3, C.lacquerNavy, { b: 0.8, frontColor: C.gold });
    c.fbevel(0.2, 0.3, z + 3, 0.52, 0.38, 9, C.gold, { b: 1, edge: 0.3 });
    c.front(0.24, 0.681, z + 4.5, 0.44, 6, C.goldDeep);
    c.front(0.27, 0.682, z + 5.5, 0.38, 4, C.gold);
    c.frontPoly(
      0.683,
      [
        [0.46, z + 9],
        [0.49, z + 7.5],
        [0.46, z + 6],
        [0.43, z + 7.5],
      ],
      C.lacquerNavy,
    );
    c.fpoly(
      [
        [0.22, 0.68, z + 12],
        [0.7, 0.68, z + 12],
        [0.7, 0.5, z + 15.5],
        [0.22, 0.5, z + 15.5],
      ],
      C.goldDeep,
    );
    for (let r = 0; r < 3; r++)
      for (let k = 0; k < 6; k++) {
        const t = 0.2 + r * 0.3;
        c.fdisc(
          0.26 + k * 0.075,
          0.68 - 0.18 * t,
          z + 12 + 3.5 * t + 0.4,
          0.022,
          k % 2 ? C.cream : C.white,
        );
      }
    c.fbevel(0.3, 0.32, z + 12, 0.32, 0.16, 10, C.gold, { b: 1 });
    const arch: P2[] = [
      [0.3, z + 22],
      [0.62, z + 22],
    ];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI;
      arch.push([0.46 + Math.cos(a) * 0.16, z + 22 + Math.sin(a) * 6]);
    }
    c.frontPoly(0.481, arch, c.frontShade(C.gold));
    c.frontLit(0.36, 0.482, z + 15, 0.2, 5, C.cream);
    for (let k = 0; k < 3; k++) c.frontLit(0.38 + k * 0.06, 0.483, z + 16, 0.04, 3, C.ink);
    c.frontPoly(
      0.483,
      [
        [0.46, z + 27],
        [0.49, z + 24.5],
        [0.46, z + 22.5],
        [0.43, z + 24.5],
      ],
      C.lacquerNavy,
    );
    c.fbox(0.72, 0.42, z + 7, 0.08, 0.02, 1.6, C.gold);
    c.fcyl(0.8, 0.43, z + 7, 0.016, 5, C.goldDeep, C.gold);
    cardTerminal(c, 0.82, 0.62, z, C.lacquerNavy);
  }
};

/**
 * Offene Kassenlade zum Verkäufer hin (−y): Einsatz mit Münzfächern und Scheinen. Liegt hinter dem Korpus, darum
 * vor ihm zeichnen.
 */
function cashDrawer(c: FacingCanvas, x: number, w: number, y1: number, z: number, body: string) {
  const y0 = y1 - 0.22;
  c.fbevel(x, y0, z, w, 0.24, 2.6, body, { b: 0.5 });
  const top = z + 2.62;
  const cell = (w - 0.06) / 4;
  for (let k = 0; k < 4; k++) {
    const cx = x + 0.03 + k * cell;
    c.fflat(cx, y0 + 0.03, top, cell - 0.015, 0.08, shade(body, 0.7));
    const coin = k % 2 ? C.chrome : C.gold;
    for (let j = 0; j < 2; j++)
      c.fdisc(cx + cell * 0.5, y0 + 0.055 + j * 0.02, top + 0.4, 0.022, coin);
  }
  for (let k = 0; k < 3; k++)
    c.fflat(
      x + 0.04 + k * ((w - 0.08) / 3),
      y0 + 0.13,
      top + 0.2,
      (w - 0.08) / 3 - 0.02,
      0.07,
      k === 1 ? '#8fc7a2' : '#a6d7b4',
    );
}

/** Kleines Kundendisplay (zeigt zum Gast, +y): dunkle Fläche mit grünen Ziffern-Balken. */
function customerDisplay(c: FacingCanvas, x: number, y: number, z: number, w: number, h: number) {
  c.frontLit(x, y, z, w, h, '#1d2a3a');
  for (let k = 0; k < 4; k++)
    c.frontLit(
      x + 0.02 + k * ((w - 0.04) / 4),
      y + 0.001,
      z + h * 0.3,
      (w - 0.04) / 4 - 0.012,
      h * 0.42,
      '#7ff0a0',
    );
}

/** Rückseite eines Bildschirms/Tablets (zeigt zum Gast): Gehäuse mit Blatt-Emblem. */
function screenBack(
  c: FacingCanvas,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  color: string,
  emblem: string,
) {
  c.fbevel(x, y, z, w, 0.05, h, color, { b: 0.6 });
  const cx = x + w / 2;
  c.frontPoly(
    y + 0.051,
    [
      [cx - 0.03, z + h * 0.42],
      [cx - 0.005, z + h * 0.66],
      [cx + 0.035, z + h * 0.6],
      [cx + 0.01, z + h * 0.36],
    ],
    emblem,
  );
}

/**
 * Kasse mit Bildschirm bzw. Tasten zum Verkäufer (−y) – der steht dahinter und tippt; zum Gast zeigen Rückseite,
 * Kundendisplay, Kartenterminal und Trinkgeldglas. `open`: Kassenlade ist ausgefahren (nach dem Kassieren).
 */
function drawRegister(c: FacingCanvas, tier: Tier, open: boolean) {
  const z = COUNTER_TOP;
  if (tier === 1) {
    // Registrierkasse aus Kunststoff: Tastenfeld steigt zum Gast hin an, Anzeigeturm hinten, Bonrolle seitlich
    c.fshadow(0.22, 0.28, z, 0.56, 0.44, 0.24);
    if (open) cashDrawer(c, 0.28, 0.42, 0.32, z, shade(C.enamelCream, 0.9));
    c.fbevel(0.24, 0.3, z, 0.5, 0.38, 6, C.enamelCream, { b: 1 });
    c.front(0.28, 0.681, z + 1, 0.42, 3, shade(C.enamelCream, 0.88));
    c.fpoly(
      [
        [0.28, 0.33, z + 6],
        [0.7, 0.33, z + 6],
        [0.7, 0.54, z + 9.5],
        [0.28, 0.54, z + 9.5],
      ],
      tint(C.steel, 0.25),
    );
    for (let r = 0; r < 3; r++)
      for (let k = 0; k < 4; k++) {
        const t0 = 0.12 + r * 0.29;
        const x0 = 0.31 + k * 0.095;
        const y = (t: number) => 0.33 + 0.21 * t;
        const zz = (t: number) => z + 6 + 3.5 * t;
        c.fpoly(
          [
            [x0, y(t0), zz(t0)],
            [x0 + 0.06, y(t0), zz(t0)],
            [x0 + 0.06, y(t0 + 0.18), zz(t0 + 0.18)],
            [x0, y(t0 + 0.18), zz(t0 + 0.18)],
          ],
          k === 3 ? C.red : C.white,
        );
      }
    c.fbevel(0.36, 0.55, z + 6, 0.26, 0.12, 9, C.enamelCream, { b: 0.8 });
    customerDisplay(c, 0.39, 0.671, z + 10, 0.2, 3.5);
    c.fcyl(0.82, 0.5, z, 0.045, 4, C.white, C.paper);
  } else if (tier === 2) {
    // Kassensystem: Monitor zum Verkäufer (Rückseite mit Kundendisplay zum Gast), Lade, Kartenleser, Trinkgeld
    c.fshadow(0.18, 0.28, z, 0.6, 0.46, 0.24);
    if (open) cashDrawer(c, 0.24, 0.44, 0.32, z, tint(C.ink, 0.12));
    c.fbevel(0.2, 0.3, z, 0.52, 0.4, 5, C.ink, { b: 0.8 });
    c.front(0.24, 0.701, z + 1, 0.44, 2.8, tint(C.ink, 0.15));
    c.fbox(0.42, 0.42, z + 5, 0.08, 0.08, 4, C.ink);
    screenBack(c, 0.24, 0.44, z + 8, 0.42, 15, C.ink, tint(C.ink, 0.25));
    customerDisplay(c, 0.33, 0.492, z + 9.5, 0.24, 4);
    cardTerminal(c, 0.76, 0.52, z, C.ink);
    tipJar(c, 0.12, 0.6, z);
  } else if (tier === 3) {
    // Tablet-Kasse auf Schwenkfuß (Rückseite weiß mit Blatt), Bondrucker, Terminal, Trinkgeldglas
    c.fshadow(0.62, 0.3, z, 0.22, 0.24, 0.2);
    c.fbevel(0.62, 0.3, z, 0.2, 0.22, 6, C.white, { b: 1 });
    c.fflat(0.65, 0.36, z + 6.02, 0.14, 0.04, C.ink);
    c.fpoly(
      [
        [0.66, 0.38, z + 6.1],
        [0.78, 0.38, z + 6.1],
        [0.78, 0.44, z + 10],
        [0.66, 0.44, z + 10],
      ],
      C.paper,
    );
    c.fshadow(0.14, 0.26, z, 0.46, 0.4, 0.22);
    if (open) cashDrawer(c, 0.16, 0.42, 0.3, z, C.white);
    c.fbevel(0.16, 0.3, z, 0.42, 0.34, 3.4, C.white, { b: 0.8 });
    c.front(0.2, 0.641, z + 0.8, 0.34, 1.8, shade(C.white, 0.9));
    c.fcyl(0.38, 0.5, z + 3.4, 0.07, 1, C.chrome, tint(C.chrome, 0.3));
    c.fcyl(0.38, 0.5, z + 4.4, 0.018, 7, C.chrome);
    screenBack(c, 0.18, 0.48, z + 9.2, 0.4, 12.5, C.white, C.matcha);
    c.fdisc(0.38, 0.5, z + 21, 0.008, C.ink);
    cardTerminal(c, 0.74, 0.6, z, C.white);
    tipJar(c, 0.1, 0.72, z, C.chrome);
  } else if (tier === 4) {
    // Nussbaum-Kassenlade, Tablet im Messingrahmen (Rückseite), Messingglocke, Blume
    c.fshadow(0.16, 0.3, z, 0.56, 0.42, 0.24);
    if (open) cashDrawer(c, 0.22, 0.42, 0.34, z, C.walnutLight);
    c.fbevel(0.18, 0.32, z, 0.5, 0.36, 4.5, C.walnut, { b: 1, edge: 0.18 });
    c.front(0.22, 0.681, z + 1, 0.42, 2.4, C.walnutLight);
    c.fcyl(0.43, 0.5, z + 4.5, 0.06, 1.2, C.brass, tint(C.brass, 0.3));
    c.fcyl(0.43, 0.5, z + 5.7, 0.016, 5, C.brass);
    screenBack(c, 0.23, 0.48, z + 10, 0.4, 14, C.brass, C.walnut);
    c.front(0.26, 0.531, z + 11.5, 0.34, 11, C.walnutLight);
    c.frontPoly(
      0.532,
      [
        [0.4, z + 15.5],
        [0.425, z + 19],
        [0.46, z + 18.2],
        [0.435, z + 15],
      ],
      C.brass,
    );
    bell(c, 0.82, 0.6, z, C.brass, C.walnut);
    c.fshadowDisc(0.84, 0.32, z, 0.04, 0.2);
    c.fcyl(0.84, 0.32, z, 0.03, 7, C.cream, tint(C.cream, 0.3));
    c.fdome(0.84, 0.32, z + 9, 0.03, 3.5, C.sakura);
    c.fbox(0.838, 0.318, z + 7, 0.006, 0.006, 3, C.matchaDeep);
  } else {
    // Nostalgische Goldkasse: Tasten zum Verkäufer, Zierfront und Anzeige-Bekrönung zum Gast, Kurbel
    c.fshadow(0.14, 0.26, z, 0.66, 0.5, 0.28);
    if (open) cashDrawer(c, 0.22, 0.48, 0.3, z, C.goldDeep);
    c.fbevel(0.16, 0.28, z, 0.6, 0.44, 3, C.lacquerNavy, { b: 0.8, frontColor: C.gold });
    c.fbevel(0.2, 0.3, z + 3, 0.52, 0.38, 9, C.gold, { b: 1, edge: 0.3 });
    c.front(0.24, 0.681, z + 4.5, 0.44, 6, C.goldDeep);
    c.front(0.27, 0.682, z + 5.5, 0.38, 4, C.gold);
    c.frontPoly(
      0.683,
      [
        [0.46, z + 9],
        [0.49, z + 7.5],
        [0.46, z + 6],
        [0.43, z + 7.5],
      ],
      C.lacquerNavy,
    );
    c.fpoly(
      [
        [0.22, 0.32, z + 12],
        [0.7, 0.32, z + 12],
        [0.7, 0.5, z + 15.5],
        [0.22, 0.5, z + 15.5],
      ],
      C.goldDeep,
    );
    for (let r = 0; r < 3; r++)
      for (let k = 0; k < 6; k++) {
        const t = 0.2 + r * 0.3;
        c.fdisc(
          0.26 + k * 0.075,
          0.32 + 0.18 * t,
          z + 12 + 3.5 * t + 0.4,
          0.022,
          k % 2 ? C.cream : C.white,
        );
      }
    c.fbevel(0.3, 0.5, z + 12, 0.32, 0.16, 10, C.gold, { b: 1 });
    const arch: P2[] = [
      [0.3, z + 22],
      [0.62, z + 22],
    ];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI;
      arch.push([0.46 + Math.cos(a) * 0.16, z + 22 + Math.sin(a) * 6]);
    }
    c.frontPoly(0.661, arch, c.frontShade(C.gold));
    c.frontLit(0.36, 0.662, z + 15, 0.2, 5, C.cream);
    for (let k = 0; k < 3; k++) c.frontLit(0.38 + k * 0.06, 0.663, z + 16, 0.04, 3, C.ink);
    c.frontPoly(
      0.663,
      [
        [0.46, z + 27],
        [0.49, z + 24.5],
        [0.46, z + 22.5],
        [0.43, z + 24.5],
      ],
      C.lacquerNavy,
    );
    c.fbox(0.72, 0.42, z + 7, 0.08, 0.02, 1.6, C.gold);
    c.fcyl(0.8, 0.43, z + 7, 0.016, 5, C.goldDeep, C.gold);
    cardTerminal(c, 0.82, 0.62, z, C.lacquerNavy);
  }
}

const register: Draw = (c, tier) => drawRegister(c, tier, false);

/** Tablett mit Getränken (und optional einem Kuchenstück). */
function tray(
  c: FacingCanvas,
  x: number,
  y: number,
  z: number,
  color: string,
  drinks: readonly string[],
  cakeColor?: string,
) {
  c.fshadow(x, y, z, 0.32, 0.22, 0.18);
  c.fbevel(x, y, z, 0.32, 0.22, 1.2, color, { b: 0.5 });
  drinks.forEach((d, i) => cup(c, x + 0.08 + i * 0.12, y + 0.11, z + 1.2, C.cup, d));
  if (cakeColor) {
    c.fcyl(x + 0.25, y + 0.11, z + 1.2, 0.05, 0.6, C.white);
    c.fbox(x + 0.22, y + 0.08, z + 1.8, 0.07, 0.05, 3, C.wood, { top: cakeColor });
  }
}

/** Durchreiche: zwei Stützen, Bord darüber, Wärmelampen darunter. */
function passShelf(
  c: FacingCanvas,
  z: number,
  post: string,
  board: string,
  lamp: string,
  lamps: readonly number[],
  hanging: boolean,
) {
  for (const px of [0.06, 0.92]) c.fbox(px, 0.22, z, 0.025, 0.025, 20, post);
  c.fbevel(0.03, 0.14, z + 20, 0.94, 0.2, 2, board, { b: 0.6 });
  for (const lx of lamps) {
    c.fglow(lx - 0.12, 0.3, z + 0.1, 0.24, 0.3, C.glow, 0.4, 2.2);
    if (hanging) {
      c.fbox(lx - 0.004, 0.24, z + 14, 0.008, 0.008, 6, C.ink);
      c.ffrustum(lx, 0.24, z + 8, 0.07, 0.03, 6, lamp, shade(lamp, 0.8));
      c.fdisc(lx, 0.24, z + 8.2, 0.05, C.lamp);
    } else {
      c.fbox(lx - 0.1, 0.16, z + 17, 0.2, 0.14, 3, lamp);
      c.fflat(lx - 0.08, 0.18, z + 16.98, 0.16, 0.1, C.lamp);
    }
  }
}

const servingStation: Draw = (c, tier) => {
  const z = COUNTER_TOP;
  if (tier === 1) {
    tray(c, 0.16, 0.38, z, C.teal, [C.matchaFoam, C.coffee]);
    bell(c, 0.78, 0.6, z, C.steel, C.ink);
  } else if (tier === 2) {
    tray(c, 0.08, 0.3, z, C.steel, [C.matchaFoam, C.matchaFoam]);
    tray(c, 0.46, 0.34, z, C.steel, [C.coffee], C.sakura);
    bell(c, 0.86, 0.68, z, C.chrome, C.ink);
    c.fshadow(0.12, 0.62, z, 0.14, 0.12, 0.18);
    c.fbevel(0.12, 0.62, z, 0.14, 0.12, 6, C.chrome, { b: 0.8 });
    c.fflat(0.14, 0.64, z + 6.02, 0.1, 0.08, C.white);
  } else if (tier === 3) {
    passShelf(c, z, C.chrome, C.chrome, C.chrome, [0.3, 0.7], false);
    for (let k = 0; k < 3; k++) {
      c.fbox(0.2 + k * 0.22, 0.34, z + 18.5, 0.1, 0.008, 3, C.paper);
      c.frontLit(0.22 + k * 0.22, 0.349, z + 19.5, 0.06, 0.5, C.ink);
    }
    tray(c, 0.08, 0.36, z, C.iron, [C.matchaFoam, C.matchaFoam], C.matchaFoam);
    tray(c, 0.5, 0.4, z, C.iron, [C.coffee, C.sakura]);
    bell(c, 0.86, 0.72, z, C.chrome, C.iron);
  } else if (tier === 4) {
    passShelf(c, z, C.brass, C.walnut, C.brass, [0.3, 0.7], true);
    tray(c, 0.08, 0.36, z, C.walnut, [C.matchaFoam, C.sakura], C.sakura);
    tray(c, 0.5, 0.4, z, C.walnut, [C.coffee, C.matchaFoam]);
    bell(c, 0.88, 0.74, z, C.brass, C.walnut);
    sakuraVase(c, 0.88, 0.3, z + 22, C.cream);
  } else {
    // Goldene Durchreiche, Silberhauben auf Goldtabletts, Goldglocke
    passShelf(c, z, C.gold, C.gold, C.gold, [0.3, 0.7], true);
    for (const [tx, ty] of [
      [0.1, 0.36],
      [0.52, 0.4],
    ] as const) {
      c.fshadowDisc(tx + 0.16, ty + 0.11, z, 0.17, 0.2);
      c.fcyl(tx + 0.16, ty + 0.11, z, 0.16, 1.2, C.gold, tint(C.gold, 0.3));
      c.fshine(tx + 0.16, ty + 0.11, z, 0.16, 1.2, C.gold);
      cloche(c, tx + 0.16, ty + 0.11, z + 1.2, 0.12, 9, C.gold, true);
    }
    bell(c, 0.88, 0.76, z, C.gold, C.lacquerNavy);
    orchid(c, 0.86, 0.26, z + 22, C.gold);
  }
};

// ---------------------------------------------------------------------------------------------
// Tische (Ambiente `seats`): vier Stufen, Sitzplätze bei u = 0.5 ± 0.42 bleiben gleich
// ---------------------------------------------------------------------------------------------
type ChairStyle = 'steel' | 'cushion' | 'bentwood' | 'armchair';

function chair(c: IsoCanvas, u: number, v: number, back: 'left' | 'right', style: ChairStyle) {
  const frame =
    style === 'steel'
      ? C.stainlessDark
      : style === 'cushion'
        ? C.oak
        : style === 'bentwood'
          ? C.coffee
          : C.brass;
  const seat =
    style === 'steel'
      ? C.cobalt
      : style === 'cushion'
        ? C.sage
        : style === 'bentwood'
          ? C.wood
          : C.velvet;
  c.shadow(u - 0.02, v - 0.02, 0, 0.22, 0.22, 0.2);
  const legs = style === 'armchair' ? 5 : 8;
  for (const [lx, ly] of [
    [u, v],
    [u + 0.15, v],
    [u, v + 0.15],
    [u + 0.15, v + 0.15],
  ] as const)
    c.box(lx, ly, 0, 0.03, 0.03, legs, shade(frame, 0.85));
  if (style === 'armchair') {
    c.bevel(u - 0.02, v - 0.02, 5, 0.22, 0.22, 5, C.velvet, { b: 2, edge: 0.15 });
    const bx = back === 'left' ? u - 0.02 : u + 0.14;
    c.bevel(bx, v - 0.02, 10, 0.06, 0.22, 10, C.velvet, { b: 2.5, edge: 0.15 });
    c.bevel(u - 0.02, v - 0.02, 10, 0.22, 0.05, 4, shade(C.velvet, 0.95), { b: 1.5, edge: 0.12 });
    c.bevel(u - 0.02, v + 0.15, 10, 0.22, 0.05, 4, shade(C.velvet, 0.95), { b: 1.5, edge: 0.12 });
    return;
  }
  c.bevel(u, v, 8, 0.18, 0.18, style === 'cushion' ? 3 : 2.2, seat, {
    b: style === 'cushion' ? 1.2 : 0.6,
  });
  const bx = back === 'left' ? u : u + 0.15;
  if (style === 'bentwood') {
    // Bugholzstuhl: dunkler Rahmen, Sitz aus Geflecht, runde Lehne mit innerem Bogen
    c.flat(u + 0.03, v + 0.03, 10.21, 0.12, 0.12, tint(seat, 0.3));
    c.box(bx, v + 0.01, 10.2, 0.03, 0.03, 9, frame);
    c.box(bx, v + 0.14, 10.2, 0.03, 0.03, 9, frame);
    c.bevel(bx, v - 0.01, 17.5, 0.03, 0.2, 4, frame, { b: 1.8 });
    c.bevel(bx, v + 0.055, 12.5, 0.03, 0.07, 3.5, frame, { b: 1.4 });
  } else {
    c.box(bx, v, 10.2, 0.03, 0.18, 10, frame);
    if (style === 'cushion')
      c.bevel(back === 'left' ? bx + 0.03 : bx - 0.025, v + 0.02, 11, 0.025, 0.14, 8, seat, {
        b: 0.8,
      });
  }
}

/** Runder Tisch auf Säulenfuß mit zwei Stühlen (links/rechts) je Stufe. */
export function drawTable(c: IsoCanvas, tier: 1 | 2 | 3 | 4) {
  const style: ChairStyle =
    (['steel', 'cushion', 'bentwood', 'armchair'] as const)[tier - 1] ?? 'steel';
  chair(c, 0.02, 0.42, 'left', style);
  // Stufe 1: Bistrotisch aus Edelstahl mit blauen Hockern (Kiez-Look), danach edler.
  const base = tier === 4 ? C.brass : tier === 1 ? C.stainlessDark : C.ink;
  c.shadowDisc(0.5, 0.5, 0, 0.18, 0.24);
  c.cylinder(0.5, 0.5, 0, 0.15, 1.5, base, tint(base, 0.2));
  c.cylinder(0.5, 0.5, 1.5, 0.045, 11.5, base);
  if (tier === 4) c.shine(0.5, 0.5, 1.5, 0.045, 11.5, base);
  const top = tier === 1 ? C.stainless : tier === 2 ? C.cream : C.marble;
  // Stufe 4: Marmorplatte mit Messingkante
  c.cylinder(0.5, 0.5, 13, 0.28, 2.5, tier === 4 ? C.brass : top, top);
  if (tier >= 3) {
    // Marmorader als schmaler Streifen
    c.poly(
      [
        [0.36, 0.42, 15.52],
        [0.4, 0.4, 15.52],
        [0.62, 0.62, 15.52],
        [0.58, 0.64, 15.52],
      ],
      C.marbleVein,
    );
  }
  if (tier === 2) c.disc(0.5, 0.5, 15.6, 0.18, C.matchaFoam);
  c.cylinder(0.44, 0.54, 15.5, 0.045, 5, tier === 1 ? C.cobalt : C.cup, C.matchaFoam);
  if (tier === 2) {
    c.cylinder(0.6, 0.42, 15.5, 0.025, 6, C.glass, C.glass);
    c.dome(0.6, 0.42, 21.5, 0.03, 3, C.sakura);
  }
  if (tier === 3) {
    c.cylinder(0.6, 0.42, 15.5, 0.03, 4, C.glass, C.glass);
    c.glowFlat(0.55, 0.37, 19.5, 0.1, 0.1, C.glow, 0.7, 1.2);
    c.dome(0.6, 0.42, 19.5, 0.012, 2.2, C.glow);
  }
  if (tier === 4) {
    c.cylinder(0.6, 0.42, 15.5, 0.02, 8, C.brass);
    c.frustum(0.6, 0.42, 23.5, 0.07, 0.035, 5, C.cream, C.cream);
    c.glowFlat(0.5, 0.32, 15.6, 0.2, 0.2, C.glow, 0.5, 2);
  }
  chair(c, 0.82, 0.42, 'right', style);
}

export const TABLE_TIERS = [1, 2, 3, 4] as const;

// ---------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------
const DEVICES: Readonly<Record<string, Draw>> = {
  register,
  matchaStation,
  coffeeMachine,
  iceBox,
  oven,
  displayCase,
  grinder,
  ceremonySet,
  servingStation,
};

/** Geräte, die auf der Gästetheke stehen: ihr Sprite zeigt nur das Gerät, die Theke liegt darunter. */
export const ON_COUNTER: readonly string[] = ['register', 'servingStation'];

function canvas(facing: Facing): FacingCanvas {
  return new FacingCanvas(facing);
}

/** Blickrichtungen je Gerät: „b“ nur, wenn ein Grundriss das Gerät quer stellt (spart Atlas-Fläche). */
export function stationFacings(id: string): readonly Facing[] {
  const across = Object.values(LAYOUTS).some((l) =>
    l.stations.some((p) => p.stationId === id && p.facesX),
  );
  return across ? ['a', 'b'] : ['a'];
}

/** Einzelbild für das DOM: Geräte auf der Theke mit ihrem Thekenmodul, sonst wie in der Szene. */
export function stationIconSvg(id: string, tier: Tier): string {
  const draw = id === 'register' ? registerFront : DEVICES[id];
  if (!draw) throw new Error(`No equipment art: ${id}`);
  const c = canvas('a');
  if (ON_COUNTER.includes(id)) counterBase(c, tier);
  draw(c, tier);
  return c.svg();
}

/** Alle Geräte mit Zeichnung (IDs wie in `data/stations.ts`). */
export const EQUIPMENT_IDS: readonly string[] = Object.keys(DEVICES);

/**
 * Ausstattung: `station-<id>-<stufe>-<a|b>` (fünf Stufen), Thekenmodule `counter-<stufe>-<deko>-<a|b>`,
 * Bauplatz `station-ghost`. `facings` liefert je Gerät die gebrauchten Blickrichtungen (aus den Grundrissen).
 */
export function stationSprites(
  facings: (id: string) => readonly Facing[] = stationFacings,
): SpriteDef[] {
  const out: SpriteDef[] = [];
  for (const [id, draw] of Object.entries(DEVICES)) {
    for (const tier of TIERS) {
      for (const facing of facings(id)) {
        const c = canvas(facing);
        draw(c, tier);
        out.push({ name: `station-${id}-${String(tier)}-${facing}`, svg: c.svg() });
      }
    }
  }
  // Kasse mit ausgefahrener Lade (kurz nach jedem Kassieren)
  for (const tier of TIERS)
    for (const facing of facings('register')) {
      const c = canvas(facing);
      drawRegister(c, tier, true);
      out.push({ name: `station-register-${String(tier)}-${facing}-open`, svg: c.svg() });
    }
  const counterFacings = new Set(ON_COUNTER.flatMap((id) => facings(id)));
  counterFacings.add('a');
  for (const tier of TIERS)
    for (const variant of COUNTER_VARIANTS)
      for (const facing of counterFacings) {
        const c = canvas(facing);
        counterBase(c, tier);
        counterProps(c, tier, variant);
        out.push({ name: `counter-${String(tier)}-${String(variant)}-${facing}`, svg: c.svg() });
      }
  // Leerer Bauplatz: gestrichelter Rahmen auf dem Boden (UI-Markierung, kein Objekt).
  const g = new IsoCanvas(STATION_CANVAS.w, STATION_CANVAS.h, STATION_CANVAS.ox, STATION_CANVAS.oy);
  g.flat(0.08, 0.08, 0, 0.84, 0.84, C.white, 0.25);
  const pts = [
    g.p([0.08, 0.08, 0]),
    g.p([0.92, 0.08, 0]),
    g.p([0.92, 0.92, 0]),
    g.p([0.08, 0.92, 0]),
  ]
    .map((q) => q.join(','))
    .join(' ');
  g.raw(
    `<polygon points="${pts}" fill="none" stroke="${C.white}" stroke-width="1.6" stroke-dasharray="4 3" stroke-opacity="0.9"/>`,
  );
  out.push({ name: 'station-ghost', svg: g.svg() });
  return out;
}

/** Tische `table-<stufe>` (Ambiente `seats`). */
export function tableSprites(): SpriteDef[] {
  return TABLE_TIERS.map((tier) => {
    const c = new IsoCanvas(
      STATION_CANVAS.w,
      STATION_CANVAS.h,
      STATION_CANVAS.ox,
      STATION_CANVAS.oy,
    );
    drawTable(c, tier);
    return { name: `table-${String(tier)}`, svg: c.svg() };
  });
}
