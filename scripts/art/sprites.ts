/**
 * Szene-Sprites als Code (selbst gezeichnet, CC0, siehe docs/ASSETS.md): Ambiente, Effekte, Standort-Themen und
 * App-Icon. Ausstattung, Theke und Tische stehen in `equipment.ts`, Figuren in `figures.ts`. `pnpm art` rendert
 * alles als PNG 2× in Texture-Atlanten. Stilregeln: UI_STYLE § 4 (Flat-Shaded-Iso, Dollhouse, Blockfiguren).
 */
import { FRONT_PLANTER_H, SCENE_FX } from '@data/art';
import { STATION_CANVAS } from './equipment';
import { IsoCanvas, Z_PER_TILE, shade, tint, type Vec3 } from './iso';
import { C } from './palette';

export interface SpriteDef {
  name: string;
  svg: string;
}

// ---------------------------------------------------------------------------------------------
// Ambiente: Kachel-Sprites 64×104 wie die Ausstattung. Tische (`seats`) zeichnet `equipment.ts` in Stufen.
// ---------------------------------------------------------------------------------------------
function canvas(): IsoCanvas {
  return new IsoCanvas(STATION_CANVAS.w, STATION_CANVAS.h, STATION_CANVAS.ox, STATION_CANVAS.oy);
}

/** Zimmerpflanze im Terrakotta-Topf: Topf als Kegelstumpf mit Rand, Blätter als gestaffelte Kuppeln. */
function plant(c: IsoCanvas, u: number, v: number, z: number, s = 1) {
  c.shadowDisc(u, v, z, 0.15 * s, 0.24);
  c.frustum(u, v, z, 0.1 * s, 0.13 * s, 12 * s, C.terracotta, shade(C.terracotta, 0.8));
  c.cylinder(
    u,
    v,
    z + 12 * s,
    0.135 * s,
    1.6 * s,
    tint(C.terracotta, 0.12),
    shade(C.terracotta, 0.8),
  );
  c.disc(u, v, z + 13.6 * s, 0.11 * s, C.woodDeep);
  c.box(u - 0.01 * s, v - 0.01 * s, z + 13 * s, 0.02 * s, 0.02 * s, 12 * s, C.woodDark);
  c.dome(u - 0.08 * s, v + 0.02 * s, z + 17 * s, 0.09 * s, 8 * s, C.matchaDeep);
  c.dome(u + 0.08 * s, v + 0.03 * s, z + 20 * s, 0.09 * s, 8 * s, C.matcha);
  c.dome(u - 0.02 * s, v - 0.03 * s, z + 25 * s, 0.1 * s, 9 * s, shade(C.matcha, 0.92));
  c.dome(u + 0.03 * s, v + 0.04 * s, z + 30 * s, 0.075 * s, 7 * s, tint(C.matcha, 0.15));
}

/** Kreis auf einer Front in der Ebene v (Lautsprecher-Membran), als Polygon in Iso-Koordinaten. */
function frontCircle(c: IsoCanvas, u: number, v: number, z: number, r: number, color: string) {
  const pts: Vec3[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    pts.push([u + Math.cos(a) * r, v, z + Math.sin(a) * r * Z_PER_TILE]);
  }
  c.poly(pts, color);
}

/** Gartenstuhl der Terrasse. */
function terraceChair(c: IsoCanvas, u: number, v: number, color: string, back: 'left' | 'right') {
  c.shadow(u - 0.02, v - 0.02, 0, 0.2, 0.2, 0.2);
  for (const [lx, ly] of [
    [u, v],
    [u + 0.13, v],
    [u, v + 0.13],
    [u + 0.13, v + 0.13],
  ] as const)
    c.box(lx, ly, 0, 0.03, 0.03, 8, shade(color, 0.8));
  c.bevel(u, v, 8, 0.16, 0.16, 2.5, color, { b: 0.6 });
  if (back === 'left') c.bevel(u, v, 10.5, 0.03, 0.16, 10, color, { b: 0.8 });
  else c.bevel(u + 0.13, v, 10.5, 0.03, 0.16, 10, color, { b: 0.8 });
}

const AMBIENCE: Record<string, (c: IsoCanvas) => void> = {
  decor(c) {
    plant(c, 0.5, 0.5, 0, 1);
  },
  music(c) {
    // Sideboard mit Plattenspieler und Platten, Standlautsprecher davor
    c.shadow(0.22, 0.26, 0, 0.6, 0.5, 0.24);
    c.bevel(0.24, 0.28, 0, 0.54, 0.44, 14, C.oak, { b: 1.2 });
    c.wallV(0.27, 0.721, 2, 0.24, 10, shade(C.woodDeep, 0.9));
    for (const [k, col] of [C.sakura, C.ink, C.matcha, C.cream, C.blue].entries())
      c.wallV(0.28 + k * 0.045, 0.722, 2.5, 0.03, 8.5, col);
    c.wallV(0.55, 0.721, 2, 0.2, 10, shade(C.oak, 0.85));
    c.bevel(0.3, 0.34, 14, 0.36, 0.3, 2.5, C.ink, { b: 0.6 });
    c.cylinder(0.46, 0.49, 16.5, 0.12, 0.8, C.ink, shade(C.ink, 1.4));
    c.disc(0.46, 0.49, 17.4, 0.04, C.sakura);
    c.box(0.6, 0.38, 16.5, 0.02, 0.18, 1.2, C.chrome);
    c.shadow(0.06, 0.62, 0, 0.24, 0.2, 0.24);
    c.bevel(0.08, 0.64, 0, 0.2, 0.16, 26, C.ink, { b: 1.2 });
    for (const [zz, r] of [
      [19, 0.045],
      [9, 0.065],
    ] as const) {
      frontCircle(c, 0.18, 0.801, zz, r, shade(C.ink, 1.6));
      frontCircle(c, 0.18, 0.802, zz, r * 0.45, shade(C.ink, 0.8));
    }
  },
  wifi(c) {
    // Beistelltisch mit Router (blinkende LED) und Steckdosenleiste
    c.shadowDisc(0.5, 0.5, 0, 0.2, 0.24);
    c.cylinder(0.5, 0.5, 0, 0.12, 1.2, C.ink);
    c.cylinder(0.5, 0.5, 1.2, 0.03, 12, C.ink);
    c.cylinder(0.5, 0.5, 13, 0.2, 2, C.oak, C.oakLight);
    c.shadow(0.38, 0.42, 15, 0.26, 0.18, 0.2);
    c.bevel(0.38, 0.42, 15, 0.26, 0.18, 4, C.white, { b: 1 });
    c.box(0.42, 0.46, 19, 0.025, 0.025, 10, C.ink);
    c.box(0.58, 0.46, 19, 0.025, 0.025, 10, C.ink);
    c.wallV(0.42, 0.601, 16.5, 0.05, 1.4, C.apron);
    c.wallV(0.5, 0.601, 16.5, 0.05, 1.4, C.apron);
    c.shadow(0.2, 0.74, 0, 0.32, 0.1, 0.2);
    c.bevel(0.2, 0.74, 0, 0.32, 0.1, 2, C.white, { b: 0.5 });
  },
  terrace(c) {
    c.shadowDisc(0.5, 0.5, 0, 0.32, 0.18);
    c.cylinder(0.5, 0.5, 0, 0.1, 1.2, C.ink);
    c.cylinder(0.5, 0.5, 0, 0.03, 34, C.white);
    c.cylinder(0.5, 0.5, 11, 0.2, 2, C.white, tint(C.wood, 0.4));
    terraceChair(c, 0.15, 0.45, C.cobalt, 'left');
    terraceChair(c, 0.6, 0.15, C.cobalt, 'right');
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
      const col = i % 2 ? C.white : C.cobalt;
      c.raw(`<polygon points="${pts(a0, a1)}" fill="${lit ? col : shade(col, 0.85)}"/>`);
    }
  },
};

/** Ambiente-Sprites (`ambience-<id>`, ohne Tische) und der Schmutz-Marker für Tische. */
export function ambienceSprites(): SpriteDef[] {
  const out = Object.entries(AMBIENCE).map(([id, draw]) => {
    const c = canvas();
    draw(c);
    return { name: `ambience-${id}`, svg: c.svg() };
  });
  // Schmutz-Marker für dreckige Tische (liegt auf der Tischplatte).
  const d = canvas();
  d.disc(0.4, 0.56, 16, 0.05, shade(C.wood, 0.7));
  d.disc(0.62, 0.5, 16, 0.035, shade(C.wood, 0.7));
  d.disc(0.5, 0.4, 16, 0.025, C.matchaDeep);
  d.cylinder(0.56, 0.62, 16, 0.035, 2, C.cup, C.cup);
  d.disc(0.66, 0.64, 16, 0.045, C.matchaFoam);
  out.push({ name: 'fx-dirt', svg: d.svg() });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Kleinteile: Smileys, Münze, Blatt, Partikel, Emotes, Licht.
// ---------------------------------------------------------------------------------------------
function flat(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(w * 2)}" height="${String(h * 2)}" viewBox="0 0 ${String(w)} ${String(h)}">${body}</svg>`;
}

/**
 * Fortschrittsring (UI_STYLE § 3.10) in `SCENE_FX.ringSteps` Stufen: weiße Scheibe mit Schlagschatten, helle Spur,
 * grüner Bogen mit runden Enden. Als Bild statt Phaser-Graphics, damit Kanten in jedem Zoom glatt bleiben.
 */
function ringSprites(): SpriteDef[] {
  const size = 18;
  const c = size / 2;
  const r = 5.6;
  const n = (v: number) => v.toFixed(3);
  const out: SpriteDef[] = [];
  for (let k = 0; k <= SCENE_FX.ringSteps; k++) {
    const f = k / SCENE_FX.ringSteps;
    let arc = '';
    if (k === SCENE_FX.ringSteps) {
      arc = `<circle cx="${n(c)}" cy="${n(c)}" r="${n(r)}" fill="none" stroke="${C.apron}" stroke-width="2.6"/>`;
    } else if (k > 0) {
      const a = -Math.PI / 2 + f * Math.PI * 2;
      const large = f > 0.5 ? 1 : 0;
      arc = `<path d="M${n(c)},${n(c - r)} A${n(r)},${n(r)} 0 ${String(large)} 1 ${n(c + Math.cos(a) * r)},${n(c + Math.sin(a) * r)}" fill="none" stroke="${C.apron}" stroke-width="2.6" stroke-linecap="round"/>`;
    }
    out.push({
      name: `ring-${String(k)}`,
      svg: flat(
        size,
        size,
        `<circle cx="${n(c)}" cy="${n(c + 0.9)}" r="8.2" fill="${C.ink}" fill-opacity="0.22"/>` +
          `<circle cx="${n(c)}" cy="${n(c)}" r="8.2" fill="${C.white}"/>` +
          `<circle cx="${n(c)}" cy="${n(c)}" r="${n(r)}" fill="none" stroke="${tint(C.apron, 0.72)}" stroke-width="2.6"/>` +
          arc,
      ),
    });
  }
  return out;
}

/**
 * Was Baristas auf die Ausgabe stellen (`item-<id>`, `PASS_ITEMS`): Matcha-Latte, Kaffee, Iced Matcha, Croissant,
 * Kuchenstück, Chawan. Kleine Leinwand, Bodenpunkt bei (12, 16).
 */
function passItemSprites(): SpriteDef[] {
  const canvasItem = () => new IsoCanvas(24, 22, 12, 16);
  const saucer = (c: IsoCanvas) => {
    c.shadowDisc(0, 0, 0, 0.1, 0.22);
    c.cylinder(0, 0, 0, 0.09, 0.8, C.cup, tint(C.cup, 0.2));
  };
  const items: Record<string, (c: IsoCanvas) => void> = {
    matcha(c) {
      saucer(c);
      c.frustum(0, 0, 0.8, 0.045, 0.06, 6, C.cup, C.matchaFoam);
      c.disc(-0.01, -0.01, 6.85, 0.025, tint(C.matchaFoam, 0.5));
      c.box(0.055, -0.008, 3, 0.02, 0.016, 2.6, C.cup);
    },
    coffee(c) {
      saucer(c);
      c.frustum(0, 0, 0.8, 0.04, 0.052, 5, C.cobalt, C.coffee);
      c.disc(0, 0, 5.85, 0.032, tint(C.coffee, 0.35));
      c.box(0.048, -0.008, 2.6, 0.02, 0.016, 2.4, C.cobalt);
    },
    iced(c) {
      c.shadowDisc(0, 0, 0, 0.06, 0.2);
      c.group(0.85, () => c.cylinder(0, 0, 0, 0.045, 3.4, C.white, C.matchaFoam));
      c.cylinder(0, 0, 3.4, 0.045, 3, C.matcha, C.matchaFoam);
      c.group(0.55, () => c.cylinder(0, 0, 6.4, 0.047, 2.6, C.glass, tint(C.glass, 0.5)));
      c.box(0.012, -0.006, 8, 0.012, 0.012, 5, C.cobalt);
    },
    croissant(c) {
      saucer(c);
      c.dome(-0.035, 0.02, 0.8, 0.035, 3.2, '#d9953f');
      c.dome(0.0, 0.0, 0.8, 0.045, 4.2, '#e6a64d');
      c.dome(0.04, -0.02, 0.8, 0.035, 3.2, '#d9953f');
    },
    cake(c) {
      saucer(c);
      c.poly(
        [
          [-0.05, -0.03, 0.8],
          [0.05, -0.03, 0.8],
          [0.0, 0.07, 0.8],
        ],
        C.ink,
        0.15,
      );
      c.box(-0.04, -0.03, 0.8, 0.08, 0.07, 4.2, '#f2e3c4', { top: C.matchaFoam });
      c.box(-0.04, -0.03, 2.6, 0.08, 0.07, 0.8, C.matcha, { top: C.matchaFoam });
      c.dome(0, 0, 5, 0.018, 2, C.red);
    },
    bowl(c) {
      c.shadowDisc(0, 0, 0, 0.08, 0.22);
      c.frustum(0, 0, 0, 0.04, 0.07, 4.6, '#5a4a3e', '#7a6656');
      c.disc(0, 0, 4.4, 0.056, C.matchaFoam);
      c.disc(-0.01, -0.01, 4.45, 0.022, tint(C.matchaFoam, 0.5));
    },
  };
  return Object.entries(items).map(([id, draw]) => {
    const c = canvasItem();
    draw(c);
    return { name: `item-${id}`, svg: c.svg() };
  });
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
      // Dampf-Wölkchen: heller Kern, kühlgrauer Rand – sichtbar auch vor weißen Wänden (wird beim Aufsteigen
      // größer und blasser)
      name: 'fx-steam',
      svg: flat(
        10,
        10,
        `<defs><radialGradient id="s"><stop offset="0" stop-color="${C.white}" stop-opacity="0.95"/><stop offset="0.5" stop-color="${C.white}" stop-opacity="0.85"/><stop offset="0.78" stop-color="#b9c6dc" stop-opacity="0.7"/><stop offset="1" stop-color="#9fb0cc" stop-opacity="0"/></radialGradient></defs><circle cx="5" cy="5" r="5" fill="url(#s)"/>`,
      ),
    },
    {
      // Frost am Kühlfach: kleiner Eiskristall
      name: 'fx-frost',
      svg: flat(
        6,
        6,
        `<path d="M3 0.2 L3.5 2.5 L5.8 3 L3.5 3.5 L3 5.8 L2.5 3.5 L0.2 3 L2.5 2.5 Z" fill="#e6f7ff"/><circle cx="3" cy="3" r="0.8" fill="${C.white}"/>`,
      ),
    },
    {
      // Matcha-Pulver aus der Steinmühle
      name: 'fx-powder',
      svg: flat(4, 4, `<circle cx="2" cy="2" r="1.6" fill="${C.matcha}"/>`),
    },
    {
      // Musiknote über der Anlage
      name: 'fx-note',
      svg: flat(
        8,
        9,
        `<path d="M2.6 1.4 L7 0.4 L7 6.4 A1.5 1.3 0 1 1 6 5.2 L6 2.2 L3.6 2.7 L3.6 7.6 A1.5 1.3 0 1 1 2.6 6.4 Z" fill="${C.ink}"/>`,
      ),
    },
    {
      // Wassertropfen (Brunnen im Park)
      name: 'fx-drop',
      svg: flat(
        4,
        5,
        `<path d="M2 0.2 C3.4 2 3.8 2.9 3.8 3.4 A1.8 1.6 0 1 1 0.2 3.4 C0.2 2.9 0.6 2 2 0.2 Z" fill="#9fd4f2"/>`,
      ),
    },
    ...ringSprites(),
    ...passItemSprites(),
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
  /** Glasierte Fliesen im unteren Wanddrittel (statt Sockelleiste in `wallTrim`). */
  wainscot?: string;
  /** Wandschmuck jeder dritten Wandkachel: Fenster oder (Kiez-Café) Leuchtkasten-Karte bzw. Becherregal. */
  deco?: 'window' | 'lightbox';
  /** Niedrige Vorderwand (Fassade zur Straße) und ihre Abdeckung; Standard: Wandfarbe. */
  front?: string;
  frontCap?: string;
  /** Endausbau (Deko-Level): Marmor hell/dunkel mit Adern, Messing für Intarsien und Leisten. */
  lux: { marbleA: string; marbleB: string; veinA: string; chips: readonly string[] };
}

export const THEME_ART: Record<string, ThemeArt> = {
  // Kiez-Café im Stil der knallblauen Berliner Kettencafés: Terrazzo, weiße Wände, blaue Fliesen, Edelstahl.
  berlin: {
    floorA: C.terrazzo,
    floorB: C.terrazzoDark,
    wall: C.white,
    wallTrim: C.stainless,
    window: C.glass,
    frame: C.stainless,
    terrace: C.terrazzoDark,
    accent: C.cobalt,
    wainscot: C.cobaltTile,
    deco: 'lightbox',
    front: C.cobalt,
    frontCap: C.stainless,
    lux: {
      marbleA: '#f3f1ec',
      marbleB: '#1f2c6e',
      veinA: '#cdd3e2',
      chips: [C.cobalt, C.cobaltLight, C.stainlessDark, C.white],
    },
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
    lux: {
      marbleA: '#f1e8d2',
      marbleB: '#4a3426',
      veinA: '#d8c9a6',
      chips: [C.sakura, C.matcha, C.woodDark, C.white],
    },
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
    lux: {
      marbleA: '#e9e6f2',
      marbleB: '#262a4c',
      veinA: '#c8c2dc',
      chips: [C.pink, '#7fd6ff', C.white, '#2b2f52'],
    },
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
    lux: {
      marbleA: '#f2f5f0',
      marbleB: '#2f5a46',
      veinA: '#cfdccf',
      chips: [C.gold, C.matcha, C.white, '#9fb7d0'],
    },
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
    lux: {
      marbleA: '#efe9e1',
      marbleB: '#2a2a33',
      veinA: '#d4cbbf',
      chips: [C.gold, '#a0523d', C.white, '#5c3a30'],
    },
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
    lux: {
      marbleA: '#f3ead6',
      marbleB: '#4f6b43',
      veinA: '#ddd0b2',
      chips: [C.teal, '#8a6a3c', C.white, C.matcha],
    },
  },
};

/** Wandhöhe hinten (Dollhouse) und vorn (25 %). */
export const WALL = { back: 64, front: 16 } as const;

/** Deterministische Zufallszahl 0..1 (Einschlüsse im Terrazzo, Marmoradern). */
function rnd(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Terrazzo mit farbigen Einschlüssen und Messing-Fugen (Boden-Stufe 2). */
function terrazzoLux(t: ThemeArt, base: string, phase: number): string {
  const c = new IsoCanvas(64, 32, 32, 0);
  c.flat(0, 0, 0, 1, 1, base);
  for (let k = 0; k < 22; k++) {
    const u = 0.06 + rnd(k + phase * 50) * 0.86;
    const v = 0.06 + rnd(k * 3.1 + phase * 50 + 7) * 0.86;
    const s = 0.018 + rnd(k * 1.7 + phase) * 0.03;
    const col = t.lux.chips[k % t.lux.chips.length] ?? C.white;
    c.poly(
      [
        [u, v, 0],
        [u + s, v + s * 0.3, 0],
        [u + s * 0.7, v + s, 0],
        [u - s * 0.2, v + s * 0.6, 0],
      ],
      col,
    );
  }
  c.flat(0, 0.975, 0, 1, 0.025, C.brass);
  c.flat(0.975, 0, 0, 0.025, 1, shade(C.brass, 0.9));
  return c.svg();
}

/**
 * Heller Marmor mit Adern, Messingfugen und kleinen dunklen Einlegern an den Fliesenecken (Boden-Stufe 3). Jede
 * Fliese zeichnet ein Viertel der Raute an jeder Ecke, zusammen ergeben sie ganze Einleger. `phase` variiert die
 * Adern; die zweite Fliese ist eine Spur wärmer, damit die Fläche lebt.
 */
function marble(t: ThemeArt, phase: number): string {
  const c = new IsoCanvas(64, 32, 32, 0);
  const base = phase ? shade(tint(t.lux.marbleA, 0.1), 0.975) : t.lux.marbleA;
  c.flat(0, 0, 0, 1, 1, base);
  for (let k = 0; k < 3; k++) {
    const v0 = rnd(k + phase * 10 + 3);
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;
      const v = v0 + (rnd(i + k * 9 + phase) - 0.5) * 0.16 + u * 0.3 - 0.15;
      pts.push([u, Math.min(0.97, Math.max(0.03, v)), 0]);
    }
    const w = 0.005 + k * 0.003;
    c.poly(
      [
        ...pts,
        ...pts
          .slice()
          .reverse()
          .map(([u, v, z]) => [u, v + w, z] as [number, number, number]),
      ],
      t.lux.veinA,
      0.8,
    );
  }
  // Polierter Stein: heller Glanzstreif
  c.poly(
    [
      [0.14, 0.12, 0],
      [0.3, 0.12, 0],
      [0.2, 0.46, 0],
      [0.08, 0.46, 0],
    ],
    C.white,
    0.4,
  );
  c.flat(0, 0.975, 0, 1, 0.025, C.brass);
  c.flat(0.975, 0, 0, 0.025, 1, shade(C.brass, 0.88));
  // Einleger: Viertel-Rauten in den vier Ecken (dunkler Marmor mit Messingrand)
  const q = 0.14;
  for (const [cu, cv] of [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ] as const) {
    const du = cu === 0 ? 1 : -1;
    const dv = cv === 0 ? 1 : -1;
    c.poly(
      [
        [cu, cv, 0],
        [cu + du * (q + 0.025), cv, 0],
        [cu, cv + dv * (q + 0.025), 0],
      ],
      C.brass,
    );
    c.poly(
      [
        [cu, cv, 0],
        [cu + du * q, cv, 0],
        [cu, cv + dv * q, 0],
      ],
      t.lux.marbleB,
    );
  }
  return c.svg();
}

function tile(color: string, edge: string): string {
  const c = new IsoCanvas(64, 32, 32, 0);
  c.flat(0, 0, 0, 1, 1, color);
  // Feine Fuge als zweite Fläche (kein Outline): schmaler Streifen an zwei Kanten
  c.flat(0, 0.96, 0, 1, 0.04, edge);
  c.flat(0.96, 0, 0, 0.04, 1, edge);
  return c.svg();
}

/** Höhe der Fliesen im unteren Wandteil (Kiez-Café). */
const WAINSCOT_H = 28;

/**
 * Eine Wandfläche als Funktion: `face(u0, z, w, h, color)` zeichnet in der Wandebene (u0 entlang der Wand),
 * `shadeF` ist die Seitenhelligkeit der Wand (links 95 %, rechts 80 %).
 */
type Face = (a: number, z: number, w: number, h: number, color: string, layer?: number) => void;

/**
 * Wand mit Sockel bzw. Fliesenspiegel, oberer Abschlussleiste und optional Fenster/Leuchtkasten/Regal. `lux`:
 * Endausbau mit Riffelpaneelen, Messingleiste und Gesims, Rahmen in Messing.
 */
function wallFace(
  t: ThemeArt,
  h: number,
  face: Face,
  f: number,
  deco: 'none' | 'u' | 'v',
  lux = false,
) {
  face(0, 0, 1, h, shade(t.wall, f));
  if (lux) {
    // Riffelpaneele: schmale Schattenkanten alle 1/12 Kachel über dem Sockel bzw. den Fliesen
    const from = t.wainscot ? WAINSCOT_H + 1.5 : 6;
    for (let a = 1 / 24; a < 1; a += 1 / 12) {
      face(a, from, 0.014, h - from - 6, shade(t.wall, f * 0.9), 1);
      face(a + 0.016, from, 0.01, h - from - 6, shade(tint(t.wall, 0.5), f), 1);
    }
    // Gesims oben mit Messinglinie
    face(0, h - 6, 1, 3, shade(tint(t.wall, 0.25), f * 0.96), 2);
    face(0, h - 6.6, 1, 0.8, shade(C.brass, f), 3);
  }
  if (t.wainscot) {
    // Glasierte Fliesen (4 × 8 je Kachel) mit hellen Fugen, Edelstahl-Sockel und -Abschlussleiste
    const tile = shade(t.wainscot, f);
    const fuge = shade(tint(t.wainscot, 0.55), f);
    face(0, 0, 1, WAINSCOT_H, tile, 1);
    for (let z = 3 + 5; z < WAINSCOT_H; z += 5) face(0, z, 1, 0.5, fuge, 2);
    // Glasur: je Fliese ein kurzer Glanzstrich oben links (wie Metro-Fliesen im Licht)
    const glanz = shade(tint(t.wainscot, 0.7), f);
    for (let row = 0, z = 3; z < WAINSCOT_H; row++, z += 5) {
      for (let a = row % 2 ? 0.0625 : 0.125; a < 1; a += 0.125)
        face(a, z, 0.012, Math.min(5, WAINSCOT_H - z), fuge, 2);
      for (let a = row % 2 ? 0.0825 : 0.02; a < 0.95; a += 0.125)
        face(a, z + 3.4, 0.05, 0.6, glanz, 3);
    }
    face(0, 0, 1, 3, shade(t.wallTrim, f), 3);
    face(0, WAINSCOT_H, 1, 1.5, shade(lux ? C.brass : tint(t.wallTrim, 0.3), f), 3);
  } else {
    face(0, 0, 1, 6, shade(t.wallTrim, f), 1);
    if (lux) face(0, 6, 1, 1.2, shade(C.brass, f), 2);
  }
  face(0, h - 3, 1, 3, shade(tint(t.wall, 0.3), f), 1);
  if (deco === 'none') return;
  if (t.deco !== 'lightbox') {
    face(0.18, 18, 0.64, 34, shade(lux ? C.brass : t.frame, f), 4);
    face(0.24, 21, 0.52, 28, shade(t.window, f + 0.05 > 1 ? 1 : f + 0.05), 5);
    face(0.24, 33, 0.52, 3, shade(lux ? C.brass : t.frame, f), 6);
    return;
  }
  const frame = lux ? C.brass : t.frame;
  if (deco === 'u') {
    // Leuchtkasten-Menü: Edelstahl- bzw. Messingrahmen, weiße Fläche, Blatt-Emblem und Zeilen als Balken
    face(0.12, 34, 0.76, 24, shade(frame, f), 4);
    face(0.15, 35.5, 0.7, 21, C.lightbox, 5);
    face(0.2, 44, 0.16, 9, C.matcha, 6);
    face(0.24, 46, 0.08, 5, C.matchaFoam, 7);
    for (let i = 0; i < 4; i++) {
      face(0.42, 52 - i * 4.4, 0.26, 1.6, C.cobalt, 6);
      face(0.74, 52 - i * 4.4, 0.06, 1.6, C.cobaltLight, 6);
    }
    face(0.2, 38, 0.16, 1.4, C.cobalt, 6);
  } else {
    // Wandregal: zwei Edelstahlböden mit blauen Bechern und Matcha-Dosen
    for (const z of [36, 48]) {
      face(0.08, z, 0.84, 1.6, shade(frame, f), 4);
      for (let k = 0; k < 5; k++) {
        const a = 0.14 + k * 0.15;
        const col = (k + z) % 3 === 0 ? C.matcha : k % 2 ? C.cobalt : C.white;
        face(a, z + 1.6, 0.08, k % 2 ? 6 : 7.5, shade(col, f), 5);
        face(a, z + (k % 2 ? 6.6 : 8.1), 0.08, 1, shade(tint(col, 0.4), f), 6);
      }
    }
  }
}

/** Wandsegment entlang u (eine Kachel), Fläche zeigt nach +v. `deco` setzt Fenster bzw. Leuchtkasten. */
function wallSegU(t: ThemeArt, h: number, deco: boolean, lux = false): string {
  const c = new IsoCanvas(32, 16 + h + 4, 0, h + 4);
  wallFace(
    t,
    h,
    (a, z, w, hh, color, layer = 0) => c.wallV(a, layer * 0.001, z, w, hh, color),
    0.95,
    deco ? 'u' : 'none',
    lux,
  );
  return c.svg();
}

/** Wandsegment entlang v, Fläche zeigt nach +u. */
function wallSegV(t: ThemeArt, h: number, deco: boolean, lux = false): string {
  const c = new IsoCanvas(32, 16 + h + 4, 32, h + 4);
  wallFace(
    t,
    h,
    (a, z, w, hh, color, layer = 0) => c.wallU(layer * 0.001, a, z, w, hh, color),
    0.8,
    deco ? 'v' : 'none',
    lux,
  );
  return c.svg();
}

/**
 * Niedrige Vorderwand (25 %) als Quader, damit sie Tiefe hat; im Kiez-Café blau mit Edelstahl-Abdeckung. Leinwand
 * `FRONT_PLANTER_H` höher, damit der Endausbau Blumenkästen daraufsetzen kann (`planter`).
 */
function frontWall(t: ThemeArt, alongU: boolean, planter = false): string {
  const top = WALL.front + 2 + FRONT_PLANTER_H;
  const c = new IsoCanvas(64, 32 + top, 32, top);
  const body = t.front ?? t.wall;
  const cap = t.frontCap ?? tint(t.wall, 0.3);
  if (alongU) {
    c.box(0, 0.88, 0, 1, 0.12, WALL.front - 2, body, { top: cap });
    c.box(0, 0.87, WALL.front - 2, 1, 0.14, 2, cap);
  } else {
    c.box(0.88, 0, 0, 0.12, 1, WALL.front - 2, body, { top: cap });
    c.box(0.87, 0, WALL.front - 2, 0.14, 1, 2, cap);
  }
  if (planter) flowerBox(c, alongU, WALL.front, t);
  return c.svg();
}

/** Blumenkasten auf der Vorderwand: Kasten in Nussbaum, Buchs als Kuppeln, kleine Blüten (Endausbau). */
function flowerBox(c: IsoCanvas, alongU: boolean, z: number, t: ThemeArt) {
  const box = C.walnut;
  const at = (a: number, b: number): [number, number] => (alongU ? [a, b] : [b, a]);
  const [u0, v0] = at(0.03, 0.86);
  const [w, d] = alongU ? [0.94, 0.16] : [0.16, 0.94];
  c.box(u0, v0, z, w, d, 4, box, { top: shade(box, 0.75) });
  c.box(u0, v0, z + 4, w, d, 0.8, C.brass);
  const bloom = [C.sakura, C.white, t.accent, C.gold];
  for (let k = 0; k < 5; k++) {
    const [u, v] = at(0.12 + k * 0.19, 0.94);
    c.dome(u, v, z + 4.6, 0.075, 7 + (k % 2) * 2, k % 2 ? C.matcha : C.matchaDeep);
    const [fu, fv] = at(0.1 + k * 0.19 + 0.04, 0.95);
    c.disc(fu, fv, z + 10 + (k % 2) * 2, 0.02, bloom[k % bloom.length] ?? C.sakura);
    const [gu, gv] = at(0.1 + k * 0.19 - 0.03, 0.97);
    c.disc(gu, gv, z + 9, 0.016, bloom[(k + 2) % bloom.length] ?? C.white);
  }
}

/** Höhe der Glaswände des Wintergartens (Szene: `GLASS_H`). */
const GLASS = 40;

/** Holzboden im Fischgrätmuster (Wintergarten): Dielen als schmale Rauten in zwei Holztönen. */
function herringbone(t: ThemeArt, phase: number): string {
  const c = new IsoCanvas(64, 32, 32, 0);
  const a = t.deco === 'lightbox' ? C.oakLight : shade(t.floorA, 0.92);
  const b = shade(a, 0.9);
  c.flat(0, 0, 0, 1, 1, a);
  for (let k = 0; k < 4; k++) {
    const v = k * 0.25;
    c.poly(
      [
        [0, v, 0],
        [0.5, v + 0.12, 0],
        [0.5, v + 0.25, 0],
        [0, v + 0.13, 0],
      ],
      (k + phase) % 2 ? b : a,
    );
    c.poly(
      [
        [0.5, v + 0.12, 0],
        [1, v, 0],
        [1, v + 0.13, 0],
        [0.5, v + 0.25, 0],
      ],
      (k + phase) % 2 ? a : b,
    );
  }
  c.flat(0, 0.98, 0, 1, 0.02, shade(a, 0.8));
  return c.svg();
}

/** Glaswand mit Sprossen und Rahmen in der Fassadenfarbe, Brüstung unten, halbtransparent. */
function glassWall(t: ThemeArt, alongU: boolean): string {
  const c = new IsoCanvas(64, 32 + GLASS + 2, 32, GLASS + 2);
  const frame = t.front ?? t.frame;
  const cap = t.frontCap ?? tint(t.wall, 0.3);
  if (alongU) {
    c.box(0, 0.9, 0, 1, 0.1, 8, frame, { top: cap });
    c.group(0.38, () => c.wallV(0, 0.95, 8, 1, GLASS - 10, C.glass));
    c.poly(
      [
        [0.15, 0.951, 12],
        [0.3, 0.951, 12],
        [0.5, 0.951, GLASS - 4],
        [0.35, 0.951, GLASS - 4],
      ],
      C.white,
      0.35,
    );
    for (const u of [0, 0.5]) c.box(u, 0.92, 8, 0.05, 0.06, GLASS - 10, frame);
    c.box(0, 0.9, GLASS - 2, 1, 0.1, 2, frame, { top: cap });
  } else {
    c.box(0.9, 0, 0, 0.1, 1, 8, frame, { top: cap });
    c.group(0.38, () => c.wallU(0.95, 0, 8, 1, GLASS - 10, shade(C.glass, 0.9)));
    for (const v of [0, 0.5]) c.box(0.92, v, 8, 0.06, 0.05, GLASS - 10, frame);
    c.box(0.9, 0, GLASS - 2, 0.1, 1, 2, frame, { top: cap });
  }
  return c.svg();
}

/** Linke Glaswand des Wintergartens in Rückwandhöhe: Rahmen, Sprossen, kaum getöntes Glas. */
function glassBack(t: ThemeArt): string {
  const h = WALL.back;
  const c = new IsoCanvas(32, 16 + h + 4, 32, h + 4);
  const frame = t.front ?? t.frame;
  c.wallU(0, 0, 0, 1, 8, shade(frame, 0.8));
  c.group(0.3, () => c.wallU(0.001, 0, 8, 1, h - 12, shade(C.glass, 0.85)));
  for (const v of [0, 0.5, 0.97]) c.wallU(0.002, v, 8, 0.04, h - 12, shade(frame, 0.8));
  c.wallU(0.002, 0, h - 4, 1, 4, shade(frame, 0.8));
  c.wallU(0.002, 0, 30, 1, 1.2, shade(frame, 0.8));
  return c.svg();
}

export function themeSprites(locationId: string): SpriteDef[] {
  const t = THEME_ART[locationId];
  if (!t) throw new Error(`No theme art: ${locationId}`);
  const entrance = new IsoCanvas(64, 32, 32, 0);
  entrance.flat(0, 0, 0, 1, 1, t.floorA);
  entrance.flat(0.15, 0.15, 0, 0.7, 0.7, t.accent);
  if (t.deco === 'lightbox') {
    // Fußmatte mit hellem Blatt-Emblem
    entrance.flat(0.2, 0.2, 0, 0.6, 0.6, shade(t.accent, 0.9));
    entrance.poly(
      [
        [0.36, 0.64, 0],
        [0.38, 0.42, 0],
        [0.62, 0.36, 0],
        [0.6, 0.58, 0],
      ],
      C.white,
    );
  }
  const deck = new IsoCanvas(64, 32, 32, 0);
  deck.flat(0, 0, 0, 1, 1, t.terrace);
  for (let i = 1; i < 4; i++) deck.flat(0, i * 0.25 - 0.02, 0, 1, 0.04, shade(t.terrace, 0.85));
  return [
    { name: 'floor-a', svg: tile(t.floorA, shade(t.floorA, 0.9)) },
    { name: 'floor-b', svg: tile(t.floorB, shade(t.floorB, 0.9)) },
    { name: 'entrance', svg: entrance.svg() },
    { name: 'terrace', svg: deck.svg() },
    { name: 'wall-u', svg: wallSegU(t, WALL.back, false) },
    { name: 'wall-u-deco', svg: wallSegU(t, WALL.back, true) },
    { name: 'wall-v', svg: wallSegV(t, WALL.back, false) },
    { name: 'wall-v-deco', svg: wallSegV(t, WALL.back, true) },
    { name: 'front-u', svg: frontWall(t, true) },
    { name: 'front-v', svg: frontWall(t, false) },
    // Endausbau nach Deko-Level (`ROOM_LOOK_DECOR_LEVELS`)
    { name: 'floor-2-a', svg: terrazzoLux(t, t.floorA, 0) },
    { name: 'floor-2-b', svg: terrazzoLux(t, t.floorB, 1) },
    { name: 'floor-3-a', svg: marble(t, 0) },
    { name: 'floor-3-b', svg: marble(t, 1) },
    { name: 'wall-u-2', svg: wallSegU(t, WALL.back, false, true) },
    { name: 'wall-u-2-deco', svg: wallSegU(t, WALL.back, true, true) },
    { name: 'wall-v-2', svg: wallSegV(t, WALL.back, false, true) },
    { name: 'wall-v-2-deco', svg: wallSegV(t, WALL.back, true, true) },
    { name: 'front-u-2', svg: frontWall(t, true, true) },
    { name: 'front-v-2', svg: frontWall(t, false, true) },
    { name: 'floor-wg-a', svg: herringbone(t, 0) },
    { name: 'floor-wg-b', svg: herringbone(t, 1) },
    { name: 'glass-u', svg: glassWall(t, true) },
    { name: 'glass-v', svg: glassWall(t, false) },
    { name: 'glass-back-v', svg: glassBack(t) },
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
