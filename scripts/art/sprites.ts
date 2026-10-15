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
// Ausstattung (Phase 2, GAME_DESIGN § 4): Kachel-Sprite 64×104, untere Spitze der Kachel = Unterkante
// (Ursprung 0.5 / 1). Variante „a“: Front zeigt nach +v (Kundenseite der Theke), „b“: nach +u.
// Geräte an der Rückwand (Barista-Theke) bringen ihre Arbeitsplatte mit; Kasse und Ausgabe-Station
// sitzen auf einem Thekenmodul und ersetzen es in der Thekenreihe.
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
  fcyl(x: number, y: number, z: number, r: number, h: number, color: string, top?: string): this {
    return this.facing === 'a'
      ? this.cylinder(x, y, z, r, h, color, top)
      : this.cylinder(y, x, z, r, h, color, top);
  }
  fdisc(x: number, y: number, z: number, r: number, color: string): this {
    return this.facing === 'a' ? this.disc(x, y, z, r, color) : this.disc(y, x, z, r, color);
  }
  fflat(x: number, y: number, z: number, w: number, d: number, color: string, opacity = 1): this {
    return this.facing === 'a'
      ? this.flat(x, y, z, w, d, color, opacity)
      : this.flat(y, x, z, d, w, color, opacity);
  }
  /** Senkrechte Fläche an der Kundenseite (Schild, Glas, Paneel) in der Tiefe y. */
  front(x: number, y: number, z: number, w: number, h: number, color: string): this {
    return this.facing === 'a'
      ? this.wallV(x, y, z, w, h, color)
      : this.wallU(y, x, z, w, h, color);
  }
}

/** Thekenmodul über die volle Kachelbreite, damit Nachbarmodule nahtlos anschließen. */
function counterModule(c: FacingCanvas, body: string = C.woodDark, top: string = C.cream) {
  c.fbox(0, 0.22, 0, 1, 0.56, 20, body);
  c.fbox(0, 0.2, 20, 1, 0.62, 3, top, { top: tint(top, 0.15) });
  // Abgesetztes Frontpaneel (eine Lokalfarbe, eine Stufe dunkler), Sockelleiste.
  c.front(0.08, 0.781, 4, 0.84, 12, shade(body, 0.78));
  c.front(0, 0.782, 0, 1, 3, shade(body, 0.6));
}

/** Arbeitsplatte mit Unterschrank an der Rückwand (Barista-Theke). */
function backCounter(c: FacingCanvas, body: string = C.woodDark, top: string = C.cream) {
  c.fbox(0.02, 0.12, 0, 0.96, 0.76, 24, body);
  c.fbox(0, 0.1, 24, 1, 0.8, 3, top, { top: tint(top, 0.15) });
  c.front(0.1, 0.881, 4, 0.8, 14, shade(body, 0.8));
}

/** Wandregal mit Dosen/Flaschen über der Arbeitsplatte. */
function wallShelf(c: FacingCanvas, z: number, items: string[], board: string = C.wood) {
  c.fbox(0.04, 0.02, z, 0.92, 0.18, 2.5, board);
  items.forEach((col, i) => {
    const x = 0.12 + i * (0.76 / Math.max(1, items.length - 1));
    c.fcyl(x, 0.1, z + 2.5, 0.045, 8, col, tint(col, 0.3));
  });
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

/** Goldene Zierleiste an der Front (Ausbaustufe 3). */
function goldTrim(c: FacingCanvas, y: number, z: number) {
  c.front(0.04, y, z, 0.92, 2, C.gold);
}

/** Kasse auf dem Thekenmodul: Korpus, schräges Display, ab Stufe 2 Kartenleser und Trinkgeldglas. */
function register(c: FacingCanvas, tier: number) {
  counterModule(c, tier >= 3 ? C.ink : C.woodDark, tier >= 3 ? C.white : C.cream);
  const body = tier >= 3 ? C.white : C.ink;
  c.fbox(0.3, 0.32, 23, 0.34, 0.28, 8, body);
  c.fbox(0.33, 0.34, 31, 0.28, 0.08, 9, tier >= 3 ? C.ink : C.steel);
  c.front(0.35, 0.421, 33, 0.24, 6, C.glass);
  c.fbox(0.36, 0.44, 31, 0.22, 0.14, 1.5, shade(body, 0.85));
  if (tier >= 2) {
    c.fbox(0.74, 0.36, 23, 0.12, 0.16, 5, C.ink);
    c.front(0.76, 0.521, 25, 0.08, 2, C.glass);
    c.fcyl(0.14, 0.5, 23, 0.06, 8, C.glass, C.ice);
    c.fdisc(0.14, 0.5, 27, 0.035, C.gold);
  }
  if (tier >= 3) {
    goldTrim(c, 0.783, 16);
    plant(c, 0.88, 0.7, 23, 0.55);
  }
}

/** Ausgabe-Station: Tabletts mit Bechern, Glocke, ab Stufe 2 Wärmelampe, ab Stufe 3 Durchreiche-Bord. */
function servingStation(c: FacingCanvas, tier: number) {
  counterModule(c, tier >= 3 ? C.ink : C.woodDark, tier >= 3 ? C.white : C.cream);
  const tray = (x: number, y: number) => {
    c.fbox(x, y, 23, 0.3, 0.2, 1.5, C.steel);
    c.fcyl(x + 0.08, y + 0.1, 24.5, 0.045, 5, C.cup, C.matchaFoam);
    c.fcyl(x + 0.22, y + 0.1, 24.5, 0.045, 5, C.cup, C.matchaFoam);
  };
  tray(0.12, 0.3);
  if (tier >= 2) tray(0.52, 0.3);
  c.fcyl(0.84, 0.6, 23, 0.045, 4, C.gold, tint(C.gold, 0.4));
  c.fdisc(0.84, 0.6, 27, 0.015, C.ink);
  if (tier >= 2) lampShade(c, 0.3, 0.6, 23);
  if (tier >= 3) {
    c.fbox(0.08, 0.14, 23, 0.04, 0.04, 20, C.ink);
    c.fbox(0.88, 0.14, 23, 0.04, 0.04, 20, C.ink);
    c.fbox(0.02, 0.1, 43, 0.96, 0.18, 2.5, C.wood);
    cupStack(c, 0.3, 0.19, 45.5, 2);
    goldTrim(c, 0.783, 16);
  }
}

type StationDraw = (c: FacingCanvas, tier: number) => void;

const STATIONS: Record<string, StationDraw> = {
  register,
  servingStation,
  matchaStation(c, tier) {
    wallShelf(
      c,
      44,
      tier >= 2
        ? [C.matcha, C.matchaDeep, C.cream, C.matcha, C.sakura]
        : [C.matcha, C.cream, C.matchaDeep],
    );
    backCounter(c, tier >= 3 ? C.matchaDeep : C.woodDark);
    // Kessel, Schale, Chasen und Sieb
    c.fcyl(0.22, 0.45, 27, 0.09, 11, C.ink, C.steel);
    c.fbox(0.3, 0.42, 34, 0.08, 0.03, 2, C.ink);
    matchaBowl(c, 0.55, 0.6, 27);
    chasen(c, 0.74, 0.42, 27);
    if (tier >= 2) {
      matchaBowl(c, 0.82, 0.68, 27, 0.06);
      c.fcyl(0.42, 0.72, 27, 0.05, 2, C.steel, C.cream);
    }
    if (tier >= 3) {
      lampShade(c, 0.12, 0.72, 27);
      goldTrim(c, 0.883, 18);
    }
  },
  coffeeMachine(c, tier) {
    wallShelf(
      c,
      46,
      tier >= 2 ? [C.woodDeep, C.cream, C.woodDeep, C.cream] : [C.woodDeep, C.cream],
    );
    backCounter(c, tier >= 3 ? C.ink : C.woodDark);
    const metal = tier >= 3 ? C.gold : C.steel;
    // Siebträgermaschine mit zwei Brühgruppen und Tassen obendrauf
    c.fbox(0.14, 0.24, 27, 0.5, 0.42, 16, metal);
    c.fbox(0.16, 0.26, 43, 0.46, 0.38, 3, C.ink);
    c.front(0.2, 0.661, 30, 0.1, 3, C.ink);
    c.front(0.46, 0.661, 30, 0.1, 3, C.ink);
    c.front(0.18, 0.662, 36, 0.42, 4, shade(metal, 0.7));
    cupStack(c, 0.26, 0.42, 46, 2);
    cupStack(c, 0.5, 0.42, 46, tier >= 2 ? 3 : 1);
    // Mühle mit Bohnenbehälter
    c.fcyl(0.82, 0.52, 27, 0.06, 13, C.ink, C.steel);
    c.fcyl(0.82, 0.52, 40, 0.055, 6, C.glass, tint(C.glass, 0.4));
    if (tier >= 2) c.fcyl(0.74, 0.76, 27, 0.045, 7, C.steel, C.white);
    if (tier >= 3) goldTrim(c, 0.883, 18);
  },
  iceBox(c, tier) {
    // Kühlschrank mit Glastür, daneben Eisfach mit Deckel
    const body = tier >= 3 ? C.ink : C.steel;
    c.fbox(0.08, 0.16, 0, 0.56, 0.7, 52, body);
    c.front(0.13, 0.861, 6, 0.46, 40, C.glass);
    for (let i = 0; i < 3; i++) c.front(0.14, 0.862, 12 + i * 12, 0.44, 1.5, C.white);
    c.front(0.2, 0.863, 16, 0.08, 4, C.matchaFoam);
    c.front(0.36, 0.863, 28, 0.08, 4, C.sakura);
    c.front(0.3, 0.863, 40, 0.1, 4, C.matcha);
    c.fbox(0.7, 0.3, 0, 0.26, 0.56, 24, C.ice);
    c.fbox(0.68, 0.28, 24, 0.3, 0.6, 3, C.white, { top: tint(C.white, 0.3) });
    c.front(0.72, 0.861, 10, 0.22, 6, C.glass);
    if (tier >= 2) {
      // Eiswaffeln auf dem Eisfach
      c.fcyl(0.77, 0.46, 27, 0.035, 6, C.wood, C.matchaFoam);
      c.fcyl(0.88, 0.5, 27, 0.035, 6, C.wood, C.sakura);
    }
    if (tier >= 3) {
      c.front(0.1, 0.864, 48, 0.52, 3, C.gold);
      c.fbox(0.06, 0.14, 52, 0.6, 0.74, 3, C.white);
    }
  },
  oven(c, tier) {
    const body = tier >= 3 ? C.terracotta : C.steel;
    c.fbox(0.08, 0.18, 0, 0.84, 0.66, 40, body);
    c.fbox(0.06, 0.16, 40, 0.88, 0.7, 3, tier >= 3 ? C.woodDeep : C.ink);
    // Ofenfenster mit warmem Innenlicht, Knöpfe
    c.front(0.18, 0.841, 12, 0.64, 18, C.ink);
    c.front(0.22, 0.842, 14, 0.56, 14, C.orange);
    c.front(0.26, 0.843, 16, 0.14, 4, C.wood);
    c.front(0.46, 0.843, 16, 0.14, 4, C.wood);
    c.front(0.2, 0.841, 33, 0.08, 3, C.cream);
    c.front(0.34, 0.841, 33, 0.08, 3, C.cream);
    c.front(0.48, 0.841, 33, 0.08, 3, C.cream);
    // Blech mit Croissants und Keksen
    c.fbox(0.14, 0.3, 43, 0.72, 0.4, 1.5, C.steel);
    const n = tier >= 2 ? 4 : 3;
    for (let i = 0; i < n; i++)
      c.fcyl(0.24 + i * (0.52 / (n - 1)), 0.5, 44.5, 0.05, 3, C.wood, tint(C.wood, 0.2));
    if (tier >= 2) c.fcyl(0.5, 0.36, 44.5, 0.04, 2, C.matcha, C.matchaFoam);
    if (tier >= 3) goldTrim(c, 0.844, 37);
  },
  displayCase(c, tier) {
    backCounter(c, tier >= 3 ? C.ink : C.woodDark, C.white);
    // Glasvitrine mit Rahmen; Torten und Kekse auf Etagen
    c.fbox(0.06, 0.2, 27, 0.88, 0.6, 22, C.glass);
    c.fbox(0.04, 0.18, 49, 0.92, 0.64, 2, tier >= 3 ? C.gold : C.white);
    const cakes = [C.sakura, C.cream, C.matcha, C.terracotta];
    cakes
      .slice(0, tier >= 2 ? 4 : 3)
      .forEach((col, i) => c.fcyl(0.2 + i * 0.2, 0.52, 28, 0.065, 5, col, tint(col, 0.3)));
    if (tier >= 2) {
      c.fflat(0.1, 0.24, 39, 0.8, 0.52, C.white);
      c.fcyl(0.3, 0.5, 39, 0.05, 3, C.matchaFoam, C.matcha);
      c.fcyl(0.62, 0.5, 39, 0.05, 3, C.cream, C.sakura);
    }
    if (tier >= 3) {
      lampShade(c, 0.5, 0.1, 51);
      goldTrim(c, 0.883, 18);
    }
  },
  grinder(c, tier) {
    // Steinmühle auf Holzpodest, Matcha-Schale darunter
    c.fbox(0.22, 0.22, 0, 0.56, 0.56, 18, C.woodDark);
    const stone = '#c2b8a3';
    c.fcyl(0.5, 0.5, 18, 0.2, 9, stone, tint(stone, 0.2));
    c.fcyl(0.5, 0.5, 27, 0.18, 6, shade(stone, 0.92), tint(stone, 0.3));
    c.fbox(0.49, 0.49, 33, 0.02, 0.02, 10, C.woodDeep);
    c.fbox(0.49, 0.5, 42, 0.02, 0.22, 2, C.woodDeep);
    c.fdisc(0.5, 0.5, 18.2, 0.24, C.matcha);
    c.fdisc(0.5, 0.5, 33.1, 0.07, C.matcha);
    if (tier >= 2) {
      c.fcyl(0.86, 0.3, 0, 0.07, 12, C.woodDark, C.matcha);
      matchaBowl(c, 0.14, 0.78, 0, 0.07);
    }
    if (tier >= 3) {
      c.fcyl(0.5, 0.5, 26.5, 0.205, 1.5, C.gold, C.gold);
      wallShelf(c, 40, [C.matcha, C.cream, C.matchaDeep]);
    }
  },
  ceremonySet(c, tier) {
    // Tatami-Nische: Matte, niedriger Tisch, Kessel, Schale, Rollbild an der Rückwand
    c.fflat(0.04, 0.04, 0, 0.92, 0.92, C.matchaFoam);
    c.fflat(0.04, 0.5, 0.1, 0.92, 0.02, shade(C.matchaFoam, 0.85));
    c.front(0.32, 0.031, 18, 0.36, 30, C.cream);
    c.front(0.36, 0.032, 24, 0.28, 16, tint(C.cream, 0.5));
    c.raw(
      `<circle cx="${String(c.p([0.5, 0.03, 32])[0])}" cy="${String(c.p([0.5, 0.03, 32])[1])}" r="3" fill="${C.red}"/>`,
    );
    c.fbox(0.28, 0.32, 0, 0.44, 0.4, 8, C.woodDark);
    c.fcyl(0.4, 0.46, 8, 0.08, 7, C.ink, C.steel);
    matchaBowl(c, 0.6, 0.56, 8, 0.06);
    chasen(c, 0.62, 0.4, 8);
    if (tier >= 2) {
      for (let i = 0; i < 2; i++)
        c.fbox(0.08 + i * 0.7, 0.08, 0, 0.14, 0.04, 30, i ? C.white : C.cream);
    }
    if (tier >= 3) {
      plant(c, 0.86, 0.84, 0, 0.7);
      c.fcyl(0.14, 0.84, 0, 0.06, 12, C.lamp, C.white);
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
  // Thekenmodul ohne Gerät (Thekenreihe zwischen Kasse und Ausgabe).
  for (const facing of ['a', 'b'] as const) {
    const c = new FacingCanvas(facing);
    counterModule(c);
    cupStack(c, 0.3, 0.4, 23, facing === 'a' ? 2 : 1);
    out.push({ name: `counter-${facing}`, svg: c.svg() });
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
// Ambiente: ebenfalls Kachel-Sprites 64×104. `seats` ist ein runder Tisch mit zwei Stühlen (Phase 2).
// ---------------------------------------------------------------------------------------------
function chair(c: IsoCanvas, u: number, v: number, color: string, back: 'left' | 'right') {
  c.box(u, v, 0, 0.03, 0.03, 8, shade(color, 0.8));
  c.box(u + 0.13, v + 0.13, 0, 0.03, 0.03, 8, shade(color, 0.8));
  c.box(u, v, 8, 0.16, 0.16, 2.5, color);
  if (back === 'left') c.box(u, v, 10.5, 0.03, 0.16, 10, color);
  else c.box(u + 0.13, v, 10.5, 0.03, 0.16, 10, color);
}

/** Runder Tisch mit Säulenfuß, zwei Stühle links und rechts (Sitzplätze bei u = 0.5 ± 0.5). */
function table(c: IsoCanvas, cloth = false) {
  chair(c, 0.02, 0.42, C.terracotta, 'left');
  c.cylinder(0.5, 0.5, 0, 0.05, 13, C.ink, C.ink);
  c.cylinder(0.5, 0.5, 2, 0.14, 1.5, C.ink);
  c.cylinder(
    0.5,
    0.5,
    13,
    0.27,
    2.5,
    cloth ? C.cream : C.wood,
    tint(cloth ? C.cream : C.wood, 0.2),
  );
  if (cloth) c.disc(0.5, 0.5, 15.6, 0.18, C.matchaFoam);
  c.cylinder(0.44, 0.52, 15.5, 0.04, 4, C.cup, C.matchaFoam);
  if (cloth) c.cylinder(0.58, 0.44, 15.5, 0.035, 3, C.sakura, C.cream);
  chair(c, 0.82, 0.42, C.terracotta, 'right');
}

const AMBIENCE: Record<string, (c: IsoCanvas) => void> = {
  seats(c) {
    table(c);
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
    chair(c, 0.15, 0.45, C.teal, 'left');
    chair(c, 0.6, 0.15, C.teal, 'right');
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
  const out = Object.entries(AMBIENCE).map(([id, draw]) => {
    const c = new IsoCanvas(
      STATION_CANVAS.w,
      STATION_CANVAS.h,
      STATION_CANVAS.ox,
      STATION_CANVAS.oy,
    );
    draw(c);
    return { name: `ambience-${id}`, svg: c.svg() };
  });
  // Tisch der Ausbaustufe 2 (Tischdecke, Gebäck) ab vielen Tischen.
  const c = new IsoCanvas(STATION_CANVAS.w, STATION_CANVAS.h, STATION_CANVAS.ox, STATION_CANVAS.oy);
  table(c, true);
  out.push({ name: 'ambience-seats-2', svg: c.svg() });
  // Schmutz-Marker für dreckige Tische (liegt auf der Tischplatte).
  const d = new IsoCanvas(STATION_CANVAS.w, STATION_CANVAS.h, STATION_CANVAS.ox, STATION_CANVAS.oy);
  d.disc(0.4, 0.56, 16, 0.05, shade(C.wood, 0.7));
  d.disc(0.62, 0.5, 16, 0.035, shade(C.wood, 0.7));
  d.disc(0.5, 0.4, 16, 0.025, C.matchaDeep);
  d.cylinder(0.56, 0.62, 16, 0.035, 2, C.cup, C.cup);
  d.disc(0.66, 0.64, 16, 0.045, C.matchaFoam);
  out.push({ name: 'fx-dirt', svg: d.svg() });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Figuren (Phase 2, UI_STYLE § 4): Blockfiguren 24×44 mit Schuhen, Händen, Haarkappe und Rollen-Outfit.
// Füße mittig 4 px über der Unterkante. 2 Richtungen × 2 Lauf-Frames, die anderen beiden Richtungen
// entstehen durch Spiegeln (flipX) in der Szene; Gäste zusätzlich in Sitzpose.
// ---------------------------------------------------------------------------------------------
export const CHAR_CANVAS = { w: 24, h: 44, ox: 12, oy: 34, footY: 40 } as const;

export interface Look {
  body: string;
  /** Oberer Rumpf (Jacke/Hemd), fehlt → wie `body`. */
  top?: string;
  legs: string;
  shoes?: string;
  hair: string;
  skin?: string;
  /** Schürze (Personal). */
  apron?: string;
  hat?: 'cap' | 'beanie' | 'sunhat' | 'visor';
  hatColor?: string;
  accessory?: 'backpack' | 'camera' | 'cup' | 'phone' | 'notebook' | 'mop' | 'tie' | 'bow' | 'tray';
  accent?: string;
  /** Handschuhe (Putzkraft). */
  gloves?: string;
}

type Pose = 'walk' | 'sit';

/**
 * Blickrichtung „front“: Gesicht zur linken Bildseite (+v). „back“: Rücken zur Kamera (−v).
 * Frame 0/1 verschiebt Beine und Arme gegeneinander (Laufen); Pose „sit“ streckt die Beine nach vorn.
 */
function figure(look: Look, dir: 'front' | 'back', frame: 0 | 1, pose: Pose = 'walk'): string {
  const c = new IsoCanvas(CHAR_CANVAS.w, CHAR_CANVAS.h, CHAR_CANVAS.ox, CHAR_CANVAS.oy);
  const skin = look.skin ?? C.skin;
  const shoes = look.shoes ?? C.hairBlack;
  const top = look.top ?? look.body;
  const u0 = 0.05;
  const v0 = 0.05;
  const w = 0.22; // Rumpfbreite (quer, u)
  const d = 0.14; // Rumpftiefe (v)
  const sit = pose === 'sit';
  const step = sit ? 0 : frame === 0 ? 2 : -2;
  const base = sit ? -4 : 0; // Sitzend rutscht der Rumpf nach unten (Stuhlhöhe ≈ 8 px)
  const front = dir === 'front';

  if (sit) {
    // Oberschenkel nach vorn (+v), Füße am Ende
    c.box(u0 + 0.02, v0 + 0.1, 5, 0.08, 0.16, 4, look.legs);
    c.box(u0 + 0.12, v0 + 0.1, 5, 0.08, 0.16, 4, look.legs);
    c.box(u0 + 0.02, v0 + 0.22, 0, 0.08, 0.06, 5, look.legs);
    c.box(u0 + 0.12, v0 + 0.22, 0, 0.08, 0.06, 5, look.legs);
    c.box(u0 + 0.02, v0 + 0.26, 0, 0.08, 0.04, 2.5, shoes);
    c.box(u0 + 0.12, v0 + 0.26, 0, 0.08, 0.04, 2.5, shoes);
  } else {
    // Schuhe und Beine (versetzt beim Gehen)
    const l = Math.max(0, step);
    const r = Math.max(0, -step);
    c.box(u0 + 0.02, v0 + 0.03, l, 0.08, 0.1, 2.5, shoes);
    c.box(u0 + 0.12, v0 + 0.03, r, 0.08, 0.1, 2.5, shoes);
    c.box(u0 + 0.02, v0 + 0.03, 2.5 + l, 0.08, 0.08, 8.5 - l, look.legs);
    c.box(u0 + 0.12, v0 + 0.03, 2.5 + r, 0.08, 0.08, 8.5 - r, look.legs);
  }
  const z0 = 11 + base; // Rumpfunterkante
  if (look.accessory === 'backpack' && front)
    c.box(u0 - 0.01, v0 - 0.05, z0 + 1, w + 0.02, 0.06, 10, look.accent ?? C.gold);
  // Rumpf: Hüfte schmaler, Schultern breiter
  c.box(u0 + 0.01, v0 + 0.01, z0, w - 0.02, d - 0.02, 6, look.body);
  c.box(u0, v0, z0 + 6, w, d, 7, top);
  if (look.apron && front) c.wallV(u0 + 0.04, v0 + d + 0.001, z0 + 0.5, w - 0.08, 11, look.apron);
  if (look.accessory === 'tie' && front)
    c.wallV(u0 + 0.095, v0 + d + 0.002, z0 + 5, 0.03, 7, look.accent ?? C.red);
  if (look.accessory === 'bow' && front)
    c.wallV(u0 + 0.07, v0 + d + 0.002, z0 + 11, 0.08, 2.5, look.accent ?? C.red);
  // Arme mit Händen (schwingen beim Gehen gegenläufig zu den Beinen)
  const swingL = sit ? 0 : -step * 0.5;
  const swingR = sit ? 0 : step * 0.5;
  c.box(u0 - 0.045, v0 + 0.03, z0 + 3 + swingL, 0.045, 0.08, 9, shade(top, 0.9));
  c.box(u0 + w, v0 + 0.03, z0 + 3 + swingR, 0.045, 0.08, 9, shade(top, 0.9));
  const hand = look.gloves ?? skin;
  c.box(u0 - 0.045, v0 + 0.035, z0 + 1 + swingL, 0.045, 0.07, 2.2, hand);
  c.box(u0 + w, v0 + 0.035, z0 + 1 + swingR, 0.045, 0.07, 2.2, hand);
  if (look.accessory === 'tray' && front) {
    // Tablett vor dem Bauch mit zwei Bechern
    c.box(u0 - 0.03, v0 + d, z0 + 4, w + 0.06, 0.16, 1.2, C.steel);
    c.cylinder(u0 + 0.05, v0 + d + 0.08, z0 + 5.2, 0.03, 3.5, C.cup, C.matchaFoam);
    c.cylinder(u0 + 0.16, v0 + d + 0.08, z0 + 5.2, 0.03, 3.5, C.cup, C.matchaFoam);
  }
  // Hals und Kopf
  c.box(u0 + 0.07, v0 + 0.03, z0 + 13, 0.08, 0.08, 1.5, skin);
  c.box(u0 + 0.025, v0 - 0.005, z0 + 14.5, 0.17, 0.15, 9.5, skin);
  // Haare: Kappe oben, vorn Pony, hinten Hinterkopf
  const hz = z0 + 24;
  if (front) {
    c.box(u0 + 0.015, v0 - 0.02, hz, 0.19, 0.17, 3, look.hair);
    c.wallV(u0 + 0.03, v0 + 0.146, hz - 3, 0.16, 3.2, look.hair);
    c.box(u0 + 0.015, v0 - 0.02, hz - 6, 0.03, 0.17, 6, look.hair);
  } else {
    c.box(u0 + 0.015, v0 - 0.02, z0 + 15, 0.19, 0.09, 12, look.hair);
    c.box(u0 + 0.015, v0 - 0.02, hz, 0.19, 0.17, 3, look.hair);
  }
  const hc = look.hatColor ?? C.ink;
  switch (look.hat) {
    case 'cap':
    case 'visor':
      if (look.hat === 'cap') c.box(u0 + 0.005, v0 - 0.03, hz + 1, 0.21, 0.19, 3.5, hc);
      else c.box(u0 + 0.005, v0 - 0.03, hz + 1, 0.21, 0.19, 1.5, hc);
      if (front) c.flat(u0 + 0.02, v0 + 0.16, hz + 1.2, 0.17, 0.09, shade(hc, 0.85));
      break;
    case 'beanie':
      c.box(u0 + 0.005, v0 - 0.03, hz - 1, 0.21, 0.19, 5, hc);
      c.box(u0 + 0.06, v0 + 0.02, hz + 4, 0.1, 0.1, 2.5, tint(hc, 0.25));
      break;
    case 'sunhat':
      c.cylinder(u0 + 0.11, v0 + 0.075, hz + 0.5, 0.2, 1.2, hc, tint(hc, 0.15));
      c.cylinder(u0 + 0.11, v0 + 0.075, hz + 1.7, 0.1, 4, hc, tint(hc, 0.25));
      break;
  }
  if (look.accessory === 'backpack' && !front)
    c.box(u0 + 0.01, v0 + d - 0.1, z0 + 1, 0.2, 0.06, 10, look.accent ?? C.gold);
  if (front) {
    switch (look.accessory) {
      case 'phone':
        c.box(u0 + w + 0.005, v0 + 0.08, z0 + 8, 0.03, 0.07, 6, look.accent ?? C.ink);
        break;
      case 'cup':
        c.cylinder(u0 + w + 0.02, v0 + 0.12, z0 + 1, 0.035, 5, C.cup, C.matchaFoam);
        break;
      case 'notebook':
        c.box(u0 - 0.08, v0 + 0.08, z0 + 2, 0.04, 0.1, 7, look.accent ?? C.white);
        break;
      case 'camera':
        c.box(u0 + 0.07, v0 + d - 0.01, z0 + 7, 0.08, 0.05, 5, C.ink);
        c.cylinder(u0 + 0.11, v0 + d + 0.05, z0 + 8.5, 0.02, 1.5, C.steel, C.glass);
        break;
      case 'mop':
        c.box(u0 + w + 0.03, v0 + 0.1, 0, 0.02, 0.02, 30, C.woodDark);
        c.box(u0 + w - 0.02, v0 + 0.06, 0, 0.12, 0.1, 3, C.tileBlue);
        c.box(u0 + w - 0.01, v0 + 0.07, 3, 0.1, 0.08, 1.5, C.white);
        break;
    }
  }
  return c.svg();
}

/** Kundentypen (GAME_DESIGN § 7.5, UI_STYLE § 4): Typ über Farbe und Accessoire erkennbar. */
const CUSTOMERS: Record<string, Look> = {
  student: {
    body: '#8b93a6',
    top: '#7d879c',
    legs: '#3d4a6b',
    hair: C.hairBrown,
    accessory: 'backpack',
    accent: C.gold,
  },
  tourist: {
    body: C.orange,
    legs: '#e8d6a6',
    hair: C.hairBlond,
    hat: 'sunhat',
    hatColor: '#f4e3b1',
    accessory: 'camera',
  },
  regular: {
    body: '#d9c4a0',
    top: '#c9b48e',
    legs: '#6b5a48',
    hair: C.hairBlack,
    accessory: 'cup',
  },
  influencer: {
    body: C.pink,
    legs: '#3a3150',
    hair: '#f5d4e2',
    accessory: 'phone',
    accent: C.white,
  },
  critic: {
    body: '#4a4a62',
    top: '#3f3f56',
    legs: '#2f2f42',
    hair: '#d7d0c4',
    accessory: 'notebook',
    accent: C.white,
  },
};

/** Personal mit Rollen-Outfit (GAME_DESIGN § 6): Schürze `--c-success`, Kopfbedeckung und Accessoire je Rolle. */
const STAFF: Record<string, Look> = {
  cashier: {
    body: C.white,
    legs: C.ink,
    hair: C.hairBrown,
    apron: C.apron,
    hat: 'visor',
    hatColor: C.matchaDeep,
  },
  barista: {
    body: C.white,
    legs: C.ink,
    hair: C.hairBlack,
    apron: C.apron,
    hat: 'beanie',
    hatColor: C.matchaDeep,
  },
  waiter: {
    body: C.white,
    legs: C.ink,
    hair: C.hairBlond,
    apron: C.apron,
    accessory: 'tray',
  },
  cleaner: {
    body: '#9cc3e6',
    legs: C.ink,
    hair: C.hairBrown,
    apron: C.teal,
    gloves: C.gold,
    accessory: 'mop',
  },
  manager: {
    body: C.ink,
    legs: C.ink,
    hair: C.hairBrown,
    accessory: 'tie',
    accent: C.apron,
  },
  socialMedia: {
    body: C.sakura,
    legs: C.ink,
    hair: C.hairBlack,
    apron: C.apron,
    accessory: 'phone',
    accent: C.ink,
  },
};

export function characterSprites(): SpriteDef[] {
  const out: SpriteDef[] = [];
  const add = (prefix: string, looks: Record<string, Look>, withSit: boolean) => {
    for (const [id, look] of Object.entries(looks)) {
      for (const dir of ['front', 'back'] as const) {
        for (const frame of [0, 1] as const) {
          out.push({
            name: `${prefix}-${id}-${dir}-${String(frame)}`,
            svg: figure(look, dir, frame),
          });
        }
      }
      if (withSit) out.push({ name: `${prefix}-${id}-sit`, svg: figure(look, 'front', 0, 'sit') });
    }
  };
  add('customer', CUSTOMERS, true);
  add('staff', STAFF, false);
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
