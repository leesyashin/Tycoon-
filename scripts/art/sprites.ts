/**
 * Alle Szene-Sprites als Code (selbst gezeichnet, CC0, siehe docs/ASSETS.md). `pnpm art` rendert sie
 * als PNG 2× in Texture-Atlanten. Stilregeln: UI_STYLE § 4 (Flat-Shaded-Iso, Dollhouse, Blockfiguren).
 */
import { IsoCanvas, shade, tint } from './iso';

/** Welt-Palette (UI_STYLE § 4) plus Lokalfarben der Objekte. Keine reinen Grautöne. */
const C = {
  wood: '#e8c48a',
  woodDark: '#b98a52',
  woodDeep: '#8a5f36',
  tileBlue: '#c8d8e8',
  wallMatcha: '#b8d9a8',
  cream: '#f4ead8',
  matcha: '#6ea84f',
  matchaDeep: '#4c7f36',
  matchaFoam: '#a9d27f',
  sakura: '#f5b8c8',
  terracotta: '#c86434',
  ink: '#2c3350',
  steel: '#9aa6bd',
  glass: '#bfe3f2',
  ice: '#e3f4fb',
  gold: '#ffb929',
  white: '#fbf8f2',
  skin: '#f1c9a5',
  skinDark: '#b98560',
  hairBrown: '#5b3a24',
  hairBlack: '#2b2633',
  hairBlond: '#e8c66a',
  apron: '#51c267',
  cup: '#f7f1e6',
  red: '#e05a4f',
  blue: '#4f7cc9',
  pink: '#e86aa6',
  teal: '#3fb5a8',
  orange: '#f08a3a',
  lamp: '#ffe2a0',
} as const;

export interface SpriteDef {
  name: string;
  svg: string;
}

// ---------------------------------------------------------------------------------------------
// Stationen: Kachel-Sprite 64×104, untere Spitze der Kachel = Unterkante (Ursprung 0.5 / 1).
// Variante „a“: Theke zeigt nach +v (links unten), „b“: nach +u (rechts unten).
// ---------------------------------------------------------------------------------------------
export const STATION_CANVAS = { w: 64, h: 104, ox: 32, oy: 72 } as const;

type Facing = 'a' | 'b';

/** Spiegelt Grid-Koordinaten, damit eine Zeichnung für beide Blickrichtungen taugt. */
class FacingCanvas extends IsoCanvas {
  constructor(
    readonly facing: Facing,
    w: number = STATION_CANVAS.w,
    h: number = STATION_CANVAS.h,
    ox: number = STATION_CANVAS.ox,
    oy: number = STATION_CANVAS.oy,
  ) {
    super(w, h, ox, oy);
  }
  /** Box in „Theken-Koordinaten“: x quer zur Theke, y = Tiefe (0 hinten, 1 Kundenseite). */
  fbox(x: number, y: number, z: number, w: number, d: number, h: number, color: string): this {
    return this.facing === 'a'
      ? this.box(x, y, z, w, d, h, color)
      : this.box(y, x, z, d, w, h, color);
  }
  fcyl(x: number, y: number, z: number, r: number, h: number, color: string, top?: string): this {
    return this.facing === 'a'
      ? this.cylinder(x, y, z, r, h, color, top)
      : this.cylinder(y, x, z, r, h, color, top);
  }
  fdisc(x: number, y: number, z: number, r: number, color: string): this {
    return this.facing === 'a' ? this.disc(x, y, z, r, color) : this.disc(y, x, z, r, color);
  }
  /** Senkrechte Front-Fläche an der Kundenseite (Schild, Glas, Paneel). */
  front(x: number, y: number, z: number, w: number, h: number, color: string): this {
    return this.facing === 'a'
      ? this.wallV(x, y, z, w, h, color)
      : this.wallU(y, x, z, w, h, color);
  }
}

/** Theke: Korpus + Platte + Front-Paneel. */
function counter(c: FacingCanvas, body: string, topColor: string, h = 22, y0 = 0.2, d = 0.72) {
  c.fbox(0.06, y0, 0, 0.88, d, h - 3, body);
  c.fbox(0.03, y0 - 0.03, h - 3, 0.94, d + 0.06, 3, topColor);
  // Abgesetztes Paneel vorn (eine Lokalfarbe, eine Stufe dunkler)
  c.front(0.16, y0 + d + 0.001, 4, 0.68, h - 10, shade(body, 0.78));
}

function matchaBowl(c: FacingCanvas, x: number, y: number, z: number, r = 0.08) {
  c.fcyl(x, y, z, r, 4, C.cup);
  c.fdisc(x, y, z + 4, r * 0.75, C.matchaFoam);
}

function chasen(c: FacingCanvas, x: number, y: number, z: number) {
  c.fcyl(x, y, z, 0.035, 7, C.wood);
  c.fcyl(x, y, z + 7, 0.02, 5, C.woodDark);
}

function cupStack(
  c: FacingCanvas,
  x: number,
  y: number,
  z: number,
  n: number,
  color: string = C.cup,
) {
  for (let i = 0; i < n; i++) c.fcyl(x, y, z + i * 4, 0.06, 4, i % 2 ? shade(color, 0.95) : color);
}

function plant(c: IsoCanvas, u: number, v: number, z: number, s = 1) {
  c.box(u - 0.07 * s, v - 0.07 * s, z, 0.14 * s, 0.14 * s, 8 * s, C.terracotta);
  c.box(u - 0.1 * s, v - 0.1 * s, z + 8 * s, 0.2 * s, 0.2 * s, 9 * s, C.matcha);
  c.box(u - 0.06 * s, v - 0.06 * s, z + 17 * s, 0.12 * s, 0.12 * s, 7 * s, tint(C.matcha, 0.15));
}

function lampShade(c: FacingCanvas, x: number, y: number, z: number) {
  c.fbox(x - 0.01, y - 0.01, z + 10, 0.02, 0.02, 30, C.ink);
  c.fcyl(x, y, z, 0.1, 10, C.gold, tint(C.gold, 0.4));
}

function backShelf(c: FacingCanvas, color: string, items: string[]) {
  c.fbox(0.06, 0.02, 0, 0.88, 0.16, 50, color);
  items.forEach((col, i) => {
    const x = 0.14 + i * (0.72 / Math.max(1, items.length - 1));
    c.fbox(x - 0.04, 0.04, 34, 0.08, 0.1, 9, col);
    c.fbox(x - 0.035, 0.04, 22, 0.07, 0.1, 8, shade(col, 0.9));
  });
}

type StationDraw = (c: FacingCanvas, tier: number) => void;

const STATIONS: Record<string, StationDraw> = {
  matchaBar(c, tier) {
    if (tier >= 2) backShelf(c, C.woodDark, [C.matcha, C.cream, C.matchaDeep, C.cream]);
    counter(c, tier >= 3 ? C.matchaDeep : C.matcha, C.wood);
    matchaBowl(c, 0.3, 0.5, 22);
    chasen(c, 0.52, 0.45, 22);
    c.fcyl(0.74, 0.48, 22, 0.07, 9, C.matchaDeep, C.matcha);
    if (tier >= 2) matchaBowl(c, 0.62, 0.75, 22, 0.06);
    if (tier >= 3) {
      lampShade(c, 0.3, 0.45, 50);
      plant(c, 0.86, 0.85, 22, 0.6);
      c.front(0.16, 0.921, 16, 0.68, 2, C.gold);
    }
  },
  checkout(c, tier) {
    counter(c, tier >= 3 ? C.ink : C.terracotta, C.wood);
    // Kasse mit schrägem Display
    c.fbox(0.28, 0.35, 22, 0.32, 0.3, 8, C.ink);
    c.fbox(0.32, 0.38, 30, 0.24, 0.06, 9, C.steel);
    c.front(0.34, 0.441, 32, 0.2, 6, C.glass);
    if (tier >= 2) {
      c.fcyl(0.76, 0.6, 22, 0.06, 8, C.glass, C.ice);
      c.fdisc(0.76, 0.6, 26, 0.035, C.gold);
    }
    if (tier >= 3) {
      c.fbox(0.08, 0.06, 30, 0.84, 0.04, 14, C.ink);
      c.front(0.14, 0.101, 33, 0.72, 8, C.gold);
    }
  },
  togoWindow(c, tier) {
    // Kiosk: Wand mit Durchreiche, Markise
    c.fbox(0.06, 0.08, 0, 0.88, 0.2, 46, C.cream);
    c.fbox(0.06, 0.28, 0, 0.88, 0.5, 18, C.teal);
    c.fbox(0.04, 0.26, 18, 0.92, 0.56, 3, C.wood);
    c.front(0.16, 0.781, 4, 0.68, 9, shade(C.teal, 0.78));
    c.fbox(0.04, 0.28, 46, 0.92, 0.5, 4, tier >= 3 ? C.sakura : C.red);
    cupStack(c, 0.25, 0.5, 21, 3);
    cupStack(c, 0.4, 0.55, 21, 2, C.matchaFoam);
    if (tier >= 2) {
      c.fcyl(0.72, 0.5, 21, 0.07, 8, C.cup, C.matchaFoam);
      c.front(0.3, 0.281, 30, 0.4, 10, C.ink);
    }
    if (tier >= 3) c.front(0.34, 0.282, 33, 0.32, 4, C.gold);
  },
  icedBar(c, tier) {
    counter(c, C.blue, C.ice);
    // Glasvitrine mit Eis
    c.fbox(0.12, 0.3, 22, 0.42, 0.36, 12, C.glass);
    c.fbox(0.16, 0.34, 34, 0.34, 0.28, 2, C.ice);
    c.fcyl(0.72, 0.5, 22, 0.07, 11, C.glass, C.matchaFoam);
    if (tier >= 2) c.fcyl(0.84, 0.72, 22, 0.05, 9, C.glass, C.sakura);
    if (tier >= 3) {
      c.fbox(0.1, 0.06, 0, 0.3, 0.18, 44, C.white);
      c.front(0.13, 0.241, 30, 0.24, 8, C.glass);
    }
  },
  bakery(c, tier) {
    counter(c, C.woodDark, C.cream);
    // Vitrine mit Gebäck
    c.fbox(0.1, 0.3, 22, 0.8, 0.4, 10, C.glass);
    const pastry = [C.terracotta, C.wood, C.sakura, C.matcha];
    for (let i = 0; i < (tier >= 2 ? 4 : 3); i++) {
      c.fcyl(0.22 + i * 0.18, 0.5, 32, 0.05, 3, pastry[i] ?? C.wood);
    }
    if (tier >= 2) {
      // Ofen hinten
      c.fbox(0.56, 0.02, 0, 0.38, 0.2, 40, C.steel);
      c.front(0.62, 0.221, 14, 0.26, 14, C.ink);
    }
    if (tier >= 3) c.fbox(0.08, 0.04, 0, 0.4, 0.16, 34, C.wood);
  },
  merchShelf(c, tier) {
    c.fbox(0.08, 0.3, 0, 0.84, 0.44, 52, C.wood);
    const goods = [C.matcha, C.sakura, C.cream, C.matchaDeep, C.terracotta, C.teal];
    for (let row = 0; row < 3; row++) {
      c.front(0.12, 0.741, 8 + row * 15, 0.76, 2, C.woodDark);
      const count = tier >= 2 ? 4 : 3;
      for (let i = 0; i < count; i++) {
        const col = goods[(i + row * 2) % goods.length] ?? C.matcha;
        c.front(0.14 + i * (0.68 / count), 0.742, 10 + row * 15, 0.12, 10, col);
      }
    }
    if (tier >= 3) {
      c.fbox(0.06, 0.28, 52, 0.88, 0.48, 3, C.gold);
      plant(c, 0.5, 0.5, 55, 0.6);
    }
  },
  ceremonyCorner(c, tier) {
    // Tatami-Podest, niedriger Tisch, Kessel
    c.fbox(0.04, 0.04, 0, 0.92, 0.92, 5, C.matchaFoam);
    c.fbox(0.3, 0.3, 5, 0.4, 0.4, 8, C.woodDark);
    c.fcyl(0.42, 0.45, 13, 0.08, 7, C.ink, C.steel);
    matchaBowl(c as FacingCanvas, 0.6, 0.58, 13, 0.06);
    if (tier >= 2) {
      // Faltschirm hinten
      for (let i = 0; i < 3; i++)
        c.fbox(0.12 + i * 0.26, 0.06, 5, 0.25, 0.04, 34, i % 2 ? C.cream : C.white);
    }
    if (tier >= 3) {
      // Bonsai + Laterne
      plant(c, 0.86, 0.2, 5, 0.7);
      c.fcyl(0.14, 0.82, 5, 0.06, 12, C.lamp, C.white);
    }
  },
  workshopRoom(c, tier) {
    // Langer Tisch mit Schalen
    c.fbox(0.08, 0.25, 14, 0.84, 0.55, 4, C.wood);
    c.fbox(0.12, 0.3, 0, 0.06, 0.06, 14, C.woodDark);
    c.fbox(0.82, 0.3, 0, 0.06, 0.06, 14, C.woodDark);
    c.fbox(0.12, 0.7, 0, 0.06, 0.06, 14, C.woodDark);
    c.fbox(0.82, 0.7, 0, 0.06, 0.06, 14, C.woodDark);
    for (let i = 0; i < 3; i++) matchaBowl(c, 0.25 + i * 0.25, 0.52, 18, 0.06);
    if (tier >= 2) {
      // Tafel hinten
      c.fbox(0.14, 0.04, 0, 0.72, 0.05, 46, C.woodDark);
      c.front(0.18, 0.091, 18, 0.64, 24, C.matchaDeep);
    }
    if (tier >= 3) {
      chasen(c, 0.5, 0.7, 18);
      c.front(0.22, 0.092, 34, 0.3, 2, C.white);
    }
  },
};

export function stationSprites(): SpriteDef[] {
  const out: SpriteDef[] = [];
  for (const [id, draw] of Object.entries(STATIONS)) {
    for (const tier of [1, 2, 3]) {
      for (const facing of ['a', 'b'] as const) {
        const c = new FacingCanvas(facing);
        draw(c, tier);
        out.push({ name: `station-${id}-${String(tier)}-${facing}`, svg: c.svg() });
      }
    }
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

// ---------------------------------------------------------------------------------------------
// Ambiente: ebenfalls Kachel-Sprites 64×104.
// ---------------------------------------------------------------------------------------------
function chair(c: IsoCanvas, u: number, v: number, color: string) {
  c.box(u, v, 8, 0.16, 0.16, 2, color);
  c.box(u, v, 0, 0.03, 0.03, 8, shade(color, 0.8));
  c.box(u + 0.13, v + 0.13, 0, 0.03, 0.03, 8, shade(color, 0.8));
  c.box(u, v, 10, 0.03, 0.16, 10, color);
}

const AMBIENCE: Record<string, (c: IsoCanvas) => void> = {
  seats(c) {
    chair(c, 0.12, 0.38, C.terracotta);
    chair(c, 0.38, 0.12, C.terracotta);
    c.cylinder(0.5, 0.5, 0, 0.04, 13, C.ink);
    c.cylinder(0.5, 0.5, 13, 0.2, 2, C.wood, tint(C.wood, 0.2));
    c.cylinder(0.46, 0.5, 15, 0.04, 4, C.cup, C.matchaFoam);
    chair(c, 0.72, 0.5, C.terracotta);
  },
  decor(c) {
    plant(c, 0.5, 0.5, 0, 1.6);
  },
  music(c) {
    c.box(0.3, 0.3, 0, 0.4, 0.4, 14, C.woodDark);
    c.cylinder(0.5, 0.5, 14, 0.15, 2, C.ink, shade(C.ink, 1.3));
    c.disc(0.5, 0.5, 16.2, 0.05, C.sakura);
    c.box(0.2, 0.62, 0, 0.18, 0.12, 24, C.ink);
    c.wallV(0.23, 0.741, 6, 0.12, 12, shade(C.ink, 1.4));
  },
  wifi(c) {
    c.box(0.36, 0.4, 0, 0.28, 0.2, 5, C.white);
    c.box(0.4, 0.44, 5, 0.03, 0.03, 12, C.ink);
    c.box(0.56, 0.44, 5, 0.03, 0.03, 12, C.ink);
    c.wallV(0.4, 0.601, 1.5, 0.06, 2, C.apron);
  },
  terrace(c) {
    c.cylinder(0.5, 0.5, 0, 0.03, 34, C.white);
    c.cylinder(0.5, 0.5, 11, 0.2, 2, C.white, tint(C.wood, 0.4));
    chair(c, 0.15, 0.45, C.teal);
    chair(c, 0.6, 0.15, C.teal);
    // Sonnenschirm (Achteck, zwei Farbflächen statt Streifen-Textur)
    const [cx, cy] = c.p([0.5, 0.5, 34]);
    const r = 26;
    const pts = (a0: number, a1: number) =>
      [`${cx.toFixed(1)},${(cy - 6).toFixed(1)}`]
        .concat(
          [a0, a1].map(
            (a) =>
              `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r * 0.5).toFixed(1)}`,
          ),
        )
        .join(' ');
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2;
      const a1 = ((i + 1) / 8) * Math.PI * 2;
      const lit = Math.sin((a0 + a1) / 2) > 0;
      const col = i % 2 ? C.white : C.terracotta;
      c.raw(`<polygon points="${pts(a0, a1)}" fill="${lit ? col : shade(col, 0.85)}"/>`);
    }
  },
};

export function ambienceSprites(): SpriteDef[] {
  return Object.entries(AMBIENCE).map(([id, draw]) => {
    const c = new IsoCanvas(
      STATION_CANVAS.w,
      STATION_CANVAS.h,
      STATION_CANVAS.ox,
      STATION_CANVAS.oy,
    );
    draw(c);
    return { name: `ambience-${id}`, svg: c.svg() };
  });
}

// ---------------------------------------------------------------------------------------------
// Figuren: Blockfiguren 24×44, Füße mittig 4 px über der Unterkante. 2 Richtungen × 2 Frames,
// die anderen beiden Richtungen entstehen durch Spiegeln (flipX) in der Szene.
// ---------------------------------------------------------------------------------------------
export const CHAR_CANVAS = { w: 24, h: 44, ox: 12, oy: 34, footY: 40 } as const;

export interface Look {
  body: string;
  legs: string;
  hair: string;
  /** Schürze (Personal). */
  apron?: string;
  hat?: string;
  accessory?: 'backpack' | 'camera' | 'cup' | 'phone' | 'notebook' | 'mop' | 'tie';
  accent?: string;
}

/**
 * Blickrichtung „front“: Gesicht zur linken Bildseite (+v). „back“: Rücken zur Kamera (−v).
 * Frame 0/1 verschiebt die Beine gegeneinander (Laufen).
 */
function figure(look: Look, dir: 'front' | 'back', frame: 0 | 1): string {
  const c = new IsoCanvas(CHAR_CANVAS.w, CHAR_CANVAS.h, CHAR_CANVAS.ox, CHAR_CANVAS.oy);
  const s = 0.25; // Figur-Grundfläche in Kacheln
  const step = frame === 0 ? 2 : -2;
  const u0 = 0.06;
  const v0 = 0.06;
  // Beine (versetzt beim Gehen)
  c.box(u0 + 0.02, v0 + 0.03, Math.max(0, step), 0.08, 0.08, 10 - Math.max(0, step), look.legs);
  c.box(u0 + 0.12, v0 + 0.03, Math.max(0, -step), 0.08, 0.08, 10 - Math.max(0, -step), look.legs);
  if (look.accessory === 'backpack' && dir === 'front')
    c.box(u0 - 0.02, v0 - 0.05, 12, 0.22, 0.06, 11, look.accent ?? C.gold);
  // Rumpf
  c.box(u0, v0, 10, s - 0.04, s - 0.1, 13, look.body);
  if (look.apron && dir === 'front')
    c.wallV(u0 + 0.03, v0 + s - 0.099, 10.5, s - 0.1, 10, look.apron);
  if (look.accessory === 'tie' && dir === 'front')
    c.wallV(u0 + 0.09, v0 + s - 0.098, 14, 0.03, 8, look.accent ?? C.red);
  // Arme
  c.box(u0 - 0.04, v0 + 0.03, 12, 0.04, 0.08, 10, shade(look.body, 0.92));
  c.box(u0 + s - 0.04, v0 + 0.03, 12, 0.04, 0.08, 10, shade(look.body, 0.92));
  // Kopf
  c.box(u0 + 0.02, v0 - 0.01, 23, 0.17, 0.17, 10, C.skin);
  // Haare: oben, bei Rückansicht auch der Hinterkopf
  if (dir === 'front') {
    c.box(u0 + 0.01, v0 - 0.02, 31, 0.19, 0.12, 3, look.hair);
    c.box(u0 + 0.01, v0 - 0.02, 26, 0.04, 0.12, 5, look.hair);
  } else {
    c.box(u0 + 0.01, v0 - 0.02, 24, 0.19, 0.2, 10, look.hair);
  }
  if (look.hat) c.box(u0, v0 - 0.03, 33, 0.21, 0.21, 3, look.hat);
  if (look.accessory === 'backpack' && dir === 'back')
    c.box(u0 + 0.01, v0 + s - 0.1, 12, 0.19, 0.06, 11, look.accent ?? C.gold);
  if (dir === 'front') {
    switch (look.accessory) {
      case 'phone':
        c.box(u0 + s - 0.02, v0 + 0.08, 20, 0.03, 0.07, 6, look.accent ?? C.ink);
        break;
      case 'cup':
        c.cylinder(u0 + s - 0.01, v0 + 0.12, 13, 0.035, 5, C.cup, C.matchaFoam);
        break;
      case 'notebook':
        c.box(u0 - 0.07, v0 + 0.08, 14, 0.04, 0.1, 7, look.accent ?? C.white);
        break;
      case 'camera':
        c.box(u0 + 0.06, v0 + s - 0.08, 16, 0.08, 0.04, 5, C.ink);
        break;
      case 'mop':
        c.box(u0 + s + 0.02, v0 + 0.1, 0, 0.02, 0.02, 30, C.woodDark);
        c.box(u0 + s - 0.02, v0 + 0.06, 0, 0.1, 0.1, 3, C.tileBlue);
        break;
    }
  }
  return c.svg();
}

/** Kundentypen (GAME_DESIGN § 7.5, UI_STYLE § 4): Typ über Farbe erkennbar. */
const CUSTOMERS: Record<string, Look> = {
  student: {
    body: '#8b93a6',
    legs: '#3d4a6b',
    hair: C.hairBrown,
    accessory: 'backpack',
    accent: C.gold,
  },
  tourist: {
    body: C.orange,
    legs: '#e8d6a6',
    hair: C.hairBlond,
    hat: '#f4e3b1',
    accessory: 'camera',
  },
  regular: { body: '#d9c4a0', legs: '#6b5a48', hair: C.hairBlack, accessory: 'cup' },
  influencer: {
    body: C.pink,
    legs: '#3a3150',
    hair: '#f5d4e2',
    accessory: 'phone',
    accent: C.white,
  },
  critic: {
    body: '#4a4a62',
    legs: '#2f2f42',
    hair: '#d7d0c4',
    accessory: 'notebook',
    accent: C.white,
  },
};

/** Personal in Schürze (`--c-success`), Rolle über Mütze/Accessoire. */
const STAFF: Record<string, Look> = {
  barista: { body: C.white, legs: C.ink, hair: C.hairBrown, apron: C.apron, hat: C.matchaDeep },
  cashier: { body: C.white, legs: C.ink, hair: C.hairBlack, apron: C.apron, hat: C.gold },
  cleaner: { body: '#9cc3e6', legs: C.ink, hair: C.hairBlond, apron: C.apron, accessory: 'mop' },
  manager: {
    body: C.ink,
    legs: C.ink,
    hair: C.hairBrown,
    apron: undefined,
    accessory: 'tie',
    accent: C.apron,
  },
  baker: { body: C.white, legs: C.ink, hair: C.hairBrown, apron: C.apron, hat: C.white },
  socialMedia: {
    body: C.sakura,
    legs: C.ink,
    hair: C.hairBlack,
    apron: C.apron,
    accessory: 'phone',
    accent: C.ink,
  },
  teaMaster: { body: C.matchaDeep, legs: C.ink, hair: '#c9c2b8', apron: C.apron, hat: C.ink },
};

export function characterSprites(): SpriteDef[] {
  const out: SpriteDef[] = [];
  const add = (prefix: string, looks: Record<string, Look>) => {
    for (const [id, look] of Object.entries(looks)) {
      for (const dir of ['front', 'back'] as const) {
        for (const frame of [0, 1] as const) {
          out.push({
            name: `${prefix}-${id}-${dir}-${String(frame)}`,
            svg: figure(look, dir, frame),
          });
        }
      }
    }
  };
  add('customer', CUSTOMERS);
  add('staff', STAFF);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Kleinteile: Smileys, Münze, Blatt, Partikel, Emotes, Licht.
// ---------------------------------------------------------------------------------------------
function flat(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(w * 2)}" height="${String(h * 2)}" viewBox="0 0 ${String(w)} ${String(h)}">${body}</svg>`;
}

export function fxSprites(): SpriteDef[] {
  const mood = (face: string, color: string, mouth: string) =>
    flat(
      14,
      14,
      `<circle cx="7" cy="7" r="6.5" fill="${color}"/><circle cx="7" cy="7" r="6.5" fill="none" stroke="${C.white}" stroke-width="1"/><rect x="4" y="4.5" width="1.6" height="2.2" rx="0.8" fill="${C.ink}"/><rect x="8.4" y="4.5" width="1.6" height="2.2" rx="0.8" fill="${C.ink}"/>${mouth}<title>${face}</title>`,
    );
  return [
    {
      name: 'mood-happy',
      svg: mood(
        'happy',
        '#7dd35a',
        `<path d="M4 8.5 Q7 11.5 10 8.5" fill="none" stroke="${C.ink}" stroke-width="1.4" stroke-linecap="round"/>`,
      ),
    },
    {
      name: 'mood-neutral',
      svg: mood(
        'neutral',
        C.gold,
        `<rect x="4.3" y="8.8" width="5.4" height="1.4" rx="0.7" fill="${C.ink}"/>`,
      ),
    },
    {
      name: 'mood-sad',
      svg: mood(
        'sad',
        '#f07a6a',
        `<path d="M4 10.5 Q7 7.8 10 10.5" fill="none" stroke="${C.ink}" stroke-width="1.4" stroke-linecap="round"/>`,
      ),
    },
    {
      // Matcha-Münze: grün mit hellem Blatt-Glyph
      name: 'coin',
      svg: flat(
        12,
        12,
        `<circle cx="6" cy="6" r="5.6" fill="#3fb950"/><circle cx="6" cy="6" r="4.2" fill="#56cf66"/><path d="M6 2.8 C8.6 4.2 8.6 7.6 6 9.2 C3.4 7.6 3.4 4.2 6 2.8 Z" fill="${C.white}"/>`,
      ),
    },
    {
      name: 'leaf',
      svg: flat(
        10,
        8,
        `<path d="M1 7 C1 2 5 0 9 1 C9 5 6 8 1 7 Z" fill="${C.gold}"/><path d="M1.5 6.5 L7 2.5" stroke="${tint(C.gold, 0.5)}" stroke-width="0.8"/>`,
      ),
    },
    {
      name: 'fx-rain',
      svg: flat(2, 10, `<rect width="2" height="10" rx="1" fill="#bcd8ff" fill-opacity="0.85"/>`),
    },
    {
      name: 'fx-petal',
      svg: flat(6, 4, `<ellipse cx="3" cy="2" rx="3" ry="1.8" fill="${C.sakura}"/>`),
    },
    {
      name: 'fx-sparkle',
      svg: flat(
        6,
        6,
        `<path d="M3 0 L3.8 2.2 L6 3 L3.8 3.8 L3 6 L2.2 3.8 L0 3 L2.2 2.2 Z" fill="${C.white}"/>`,
      ),
    },
    {
      name: 'fx-steam',
      svg: flat(8, 8, `<circle cx="4" cy="4" r="3.6" fill="${C.white}" fill-opacity="0.8"/>`),
    },
    {
      name: 'fx-shine',
      svg: flat(
        10,
        40,
        `<polygon points="4,0 10,0 6,40 0,40" fill="${C.white}" fill-opacity="0.85"/>`,
      ),
    },
    {
      name: 'emote-heart',
      svg: flat(
        14,
        14,
        `<rect x="0.5" y="0.5" width="13" height="11" rx="5" fill="${C.white}"/><polygon points="5,11 7,14 9,11" fill="${C.white}"/><path d="M7 9.4 C3.5 7 3.6 3.6 5.4 3.4 C6.3 3.3 6.8 3.9 7 4.4 C7.2 3.9 7.7 3.3 8.6 3.4 C10.4 3.6 10.5 7 7 9.4 Z" fill="#e8507a"/>`,
      ),
    },
    {
      name: 'emote-note',
      svg: flat(
        14,
        14,
        `<rect x="0.5" y="0.5" width="13" height="11" rx="5" fill="${C.white}"/><polygon points="5,11 7,14 9,11" fill="${C.white}"/><path d="M6 3 L10 2.2 L10 7.6 A1.4 1.2 0 1 1 9 6.5 L9 3.7 L7 4.1 L7 8.4 A1.4 1.2 0 1 1 6 7.3 Z" fill="${C.matchaDeep}"/>`,
      ),
    },
    {
      name: 'emote-star',
      svg: flat(
        14,
        14,
        `<rect x="0.5" y="0.5" width="13" height="11" rx="5" fill="${C.white}"/><polygon points="5,11 7,14 9,11" fill="${C.white}"/><path d="M7 2.2 L8.2 4.8 L11 5.1 L8.9 7 L9.5 9.7 L7 8.3 L4.5 9.7 L5.1 7 L3 5.1 L5.8 4.8 Z" fill="${C.gold}"/>`,
      ),
    },
    {
      // Warmes Licht für Fenster/Lampen nachts (additiv geblendet)
      name: 'glow',
      svg: flat(
        48,
        48,
        `<defs><radialGradient id="g"><stop offset="0" stop-color="${C.lamp}" stop-opacity="0.9"/><stop offset="1" stop-color="${C.lamp}" stop-opacity="0"/></radialGradient></defs><circle cx="24" cy="24" r="24" fill="url(#g)"/>`,
      ),
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Standort-Themen (GAME_DESIGN § 3): Boden, Wände (Dollhouse: hinten hoch, vorn 25 %), Eingang, Terrasse.
// Eigener Atlas je Standort (Lazy-Loading).
// ---------------------------------------------------------------------------------------------
export interface ThemeArt {
  floorA: string;
  floorB: string;
  wall: string;
  wallTrim: string;
  window: string;
  frame: string;
  terrace: string;
  accent: string;
}

export const THEME_ART: Record<string, ThemeArt> = {
  berlin: {
    floorA: C.wood,
    floorB: shade(C.wood, 0.93),
    wall: C.cream,
    wallTrim: C.terracotta,
    window: C.glass,
    frame: C.white,
    terrace: C.woodDark,
    accent: C.matcha,
  },
  kyoto: {
    floorA: '#d9d39a',
    floorB: '#cfc78a',
    wall: '#f2e6cf',
    wallTrim: C.woodDark,
    window: '#f6efe0',
    frame: C.woodDeep,
    terrace: C.woodDeep,
    accent: C.sakura,
  },
  tokyo: {
    floorA: '#4a4f78',
    floorB: '#424770',
    wall: '#3a3f6b',
    wallTrim: C.pink,
    window: '#7fd6ff',
    frame: '#2b2f52',
    terrace: '#5a5f88',
    accent: C.pink,
  },
  seoul: {
    floorA: C.tileBlue,
    floorB: shade(C.tileBlue, 0.94),
    wall: C.wallMatcha,
    wallTrim: C.white,
    window: C.glass,
    frame: C.white,
    terrace: '#c9a77c',
    accent: C.gold,
  },
  newyork: {
    floorA: '#b9aea2',
    floorB: '#ada194',
    wall: '#a0523d',
    wallTrim: '#5c3a30',
    window: '#cfe3ea',
    frame: '#2f2f3a',
    terrace: '#8d8478',
    accent: C.gold,
  },
  bali: {
    floorA: '#efdcae',
    floorB: '#e6d09c',
    wall: '#d9c38c',
    wallTrim: '#8a6a3c',
    window: '#d7f0e8',
    frame: '#8a6a3c',
    terrace: '#c9a26a',
    accent: C.teal,
  },
};

/** Wandhöhe hinten (Dollhouse) und vorn (25 %). */
export const WALL = { back: 64, front: 16 } as const;

function tile(color: string, edge: string): string {
  const c = new IsoCanvas(64, 32, 32, 0);
  c.flat(0, 0, 0, 1, 1, color);
  // Feine Fuge als zweite Fläche (kein Outline): schmaler Streifen an zwei Kanten
  c.flat(0, 0.96, 0, 1, 0.04, edge);
  c.flat(0.96, 0, 0, 0.04, 1, edge);
  return c.svg();
}

/** Wandsegment entlang u (eine Kachel), Fläche zeigt nach +v. `window` setzt ein Fenster. */
function wallSegU(t: ThemeArt, h: number, withWindow: boolean): string {
  const c = new IsoCanvas(32, 16 + h + 4, 0, h + 4);
  c.wallV(0, 0, 0, 1, h, shade(t.wall, 0.95));
  c.wallV(0, 0.001, 0, 1, 6, t.wallTrim);
  c.wallV(0, 0.001, h - 3, 1, 3, tint(t.wall, 0.3));
  if (withWindow) {
    c.wallV(0.18, 0.002, 18, 0.64, 34, t.frame);
    c.wallV(0.24, 0.003, 21, 0.52, 28, t.window);
    c.wallV(0.24, 0.004, 33, 0.52, 3, t.frame);
  }
  return c.svg();
}

/** Wandsegment entlang v, Fläche zeigt nach +u. */
function wallSegV(t: ThemeArt, h: number, withWindow: boolean): string {
  const c = new IsoCanvas(32, 16 + h + 4, 32, h + 4);
  c.wallU(0, 0, 0, 1, h, shade(t.wall, 0.8));
  c.wallU(0.001, 0, 0, 1, 6, shade(t.wallTrim, 0.85));
  c.wallU(0.001, 0, h - 3, 1, 3, tint(t.wall, 0.2));
  if (withWindow) {
    c.wallU(0.002, 0.18, 18, 0.64, 34, shade(t.frame, 0.85));
    c.wallU(0.003, 0.24, 21, 0.52, 28, shade(t.window, 0.9));
    c.wallU(0.004, 0.24, 33, 0.52, 3, shade(t.frame, 0.85));
  }
  return c.svg();
}

/** Niedrige Vorderwand (25 %) als Quader, damit sie Tiefe hat. */
function frontWall(t: ThemeArt, alongU: boolean): string {
  const c = new IsoCanvas(64, 32 + WALL.front + 2, 32, WALL.front + 2);
  if (alongU) c.box(0, 0.88, 0, 1, 0.12, WALL.front, t.wall, { top: tint(t.wall, 0.3) });
  else c.box(0.88, 0, 0, 0.12, 1, WALL.front, t.wall, { top: tint(t.wall, 0.3) });
  return c.svg();
}

export function themeSprites(locationId: string): SpriteDef[] {
  const t = THEME_ART[locationId];
  if (!t) throw new Error(`No theme art: ${locationId}`);
  const entrance = new IsoCanvas(64, 32, 32, 0);
  entrance.flat(0, 0, 0, 1, 1, t.floorA);
  entrance.flat(0.15, 0.15, 0, 0.7, 0.7, t.accent);
  const deck = new IsoCanvas(64, 32, 32, 0);
  deck.flat(0, 0, 0, 1, 1, t.terrace);
  for (let i = 1; i < 4; i++) deck.flat(0, i * 0.25 - 0.02, 0, 1, 0.04, shade(t.terrace, 0.85));
  return [
    { name: 'floor-a', svg: tile(t.floorA, shade(t.floorA, 0.9)) },
    { name: 'floor-b', svg: tile(t.floorB, shade(t.floorB, 0.9)) },
    { name: 'entrance', svg: entrance.svg() },
    { name: 'terrace', svg: deck.svg() },
    { name: 'wall-u', svg: wallSegU(t, WALL.back, false) },
    { name: 'wall-u-window', svg: wallSegU(t, WALL.back, true) },
    { name: 'wall-v', svg: wallSegV(t, WALL.back, false) },
    { name: 'wall-v-window', svg: wallSegV(t, WALL.back, true) },
    { name: 'front-u', svg: frontWall(t, true) },
    { name: 'front-v', svg: frontWall(t, false) },
  ];
}

/** App-Icon (PWA): Matcha-Schale auf Grün, quadratisch. */
export function appIcon(): string {
  const c = new IsoCanvas(96, 96, 48, 46, 64);
  c.raw(`<rect width="96" height="96" rx="20" fill="#1d457b"/>`);
  c.cylinder(0.5, 0.5, 0, 0.3, 18, C.cup, C.cup);
  c.disc(0.5, 0.5, 18, 0.24, C.matchaFoam);
  c.disc(0.47, 0.47, 18, 0.1, tint(C.matchaFoam, 0.4));
  return c.svg();
}
