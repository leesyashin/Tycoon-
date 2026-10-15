/**
 * Lager mit Vorräten (Vorgabe Vincent, 2026-10-15: „Lager mit Vorräten wie Matcha, Kaffeebohnen usw.“) im
 * Flat-Shaded-Iso-Stil der Geräte (UI_STYLE § 4). Edelstahl-Regale mit kobaltblauen Stehern wie die Kiez-Theke,
 * darauf Matcha-Dosen, Kaffeebohnen-Säcke, Milch- und Hafermilch-Kartons, Sirup-Flaschen, Becher-Stapel, Zucker,
 * Mehlsäcke und Croissant-Kisten. Drei Stufen nach Zahl gekaufter Geräte (`STORAGE_LOOK_DEVICES`): (1) Eckregal
 * mit dem Nötigsten, (2) volle Regale und ein zweites an der Seitenwand, (3) dazu Säcke und Kisten auf einer
 * Palette. Dazu kleine Einzelbilder der Ware, die ein Barista ans Gerät trägt (`SUPPLY_ITEMS`). Selbst gezeichnet,
 * CC0. Platzierung: `storage` in `src/data/layouts.ts`.
 *
 * Koordinaten wie `equipment.ts` (Theken-Koordinaten): x entlang der Wand, y Tiefe (0 = Wand), z Höhe in Pixeln.
 */
import { SUPPLY_CANVAS, SUPPLY_ITEMS, type StorageTier } from '@data/art';
import { LAYOUTS } from '@data/layouts';
import { FacingCanvas, type Facing } from './equipment';
import { IsoCanvas, shade, tint } from './iso';
import { C } from './palette';
import type { SpriteDef } from './sprites';

export const STORAGE_TIERS: readonly StorageTier[] = [1, 2, 3];

/** Tiefe eines Regals (von der Wand) und Höhe der Böden in Pixeln. */
const RACK_D = 0.36;
/** Drei Böden; auf dem Deckbrett (`RACK_H`) liegen Kisten. */
const BOARDS = [2, 18, 34] as const;
const RACK_H = 50;

type Item = (c: FacingCanvas, x: number, y: number, z: number) => void;

// ---------------------------------------------------------------------------------------------
// Ware
// ---------------------------------------------------------------------------------------------

/** Matcha-Dose: grüner Zylinder mit Banderole und Stahldeckel. */
const tin: Item = (c, x, y, z) => {
  c.fshadowDisc(x, y, z, 0.065, 0.16);
  c.fcyl(x, y, z, 0.058, 9.5, C.matchaDeep);
  c.fcyl(x, y, z + 3, 0.059, 2.8, C.paper);
  c.fcyl(x, y, z + 3.8, 0.06, 1.2, C.matcha);
  c.fcyl(x, y, z + 9.5, 0.061, 1.6, C.steel, tint(C.steel, 0.35));
};

/** Kaffeebohnen-Sack (Jute) mit dunkler Bohne vorn und Zipfel oben. */
const beanSack: Item = (c, x, y, z) => {
  const w = 0.24;
  const d = 0.2;
  c.fshadow(x - 0.01, y - 0.01, z, w + 0.02, d + 0.02, 0.18);
  c.fbevel(x, y, z, w, d, 12, C.oakLight, { b: 3, edge: 0.15 });
  c.fbox(x + w / 2 - 0.025, y + d / 2 - 0.025, z + 12, 0.05, 0.05, 2.6, shade(C.oakLight, 0.85));
  const cx = x + w / 2;
  c.frontPoly(
    y + d + 0.001,
    [
      [cx - 0.045, z + 6],
      [cx, z + 9.2],
      [cx + 0.045, z + 6],
      [cx, z + 2.8],
    ],
    C.coffee,
  );
  c.frontLit(cx - 0.004, y + d + 0.002, z + 3.4, 0.008, 5.2, shade(C.oakLight, 0.9));
};

/** Mehlsack (hell) mit blauem Band. */
const flourSack: Item = (c, x, y, z) => {
  const w = 0.24;
  const d = 0.2;
  c.fshadow(x - 0.01, y - 0.01, z, w + 0.02, d + 0.02, 0.18);
  c.fbevel(x, y, z, w, d, 13, C.paper, { b: 3, edge: 0.1 });
  c.front(x + 0.03, y + d + 0.001, z + 5, w - 0.06, 2.6, C.cobaltLight);
  c.fbox(x + w / 2 - 0.025, y + d / 2 - 0.025, z + 13, 0.05, 0.05, 2.6, shade(C.paper, 0.9));
};

/** Milch- (weiß, blau) bzw. Hafermilch-Karton (beige, braun) mit Giebel. */
function carton(oat: boolean): Item {
  return (c, x, y, z) => {
    const body = oat ? C.enamelCream : C.white;
    const band = oat ? C.woodDark : C.blue;
    const w = 0.1;
    c.fshadow(x, y, z, w, w, 0.16);
    c.fbox(x, y, z, w, w, 11, body);
    c.front(x, y + w + 0.001, z + 3.5, w, 3, band);
    // Giebel: zwei Dachflächen, Giebelfläche nach vorn
    c.fpoly(
      [
        [x, y, z + 11],
        [x, y + w, z + 11],
        [x + w / 2, y + w, z + 14],
        [x + w / 2, y, z + 14],
      ],
      tint(body, 0.2),
    );
    c.fpoly(
      [
        [x + w, y, z + 11],
        [x + w, y + w, z + 11],
        [x + w / 2, y + w, z + 14],
        [x + w / 2, y, z + 14],
      ],
      shade(body, 0.8),
    );
    c.frontPoly(
      y + w,
      [
        [x, z + 11],
        [x + w, z + 11],
        [x + w / 2, z + 14],
      ],
      c.frontShade(body),
    );
  };
}
const milk = carton(false);
const oat = carton(true);

/** Sirup-Flasche (Karamell, Vanille, Haselnuss, Sakura) mit Etikett und Ausgießer. */
function syrup(color: string): Item {
  return (c, x, y, z) => {
    c.fshadowDisc(x, y, z, 0.04, 0.16);
    c.fcyl(x, y, z, 0.034, 10, color, tint(color, 0.3));
    c.fcyl(x, y, z + 3, 0.035, 3.6, C.paper);
    c.fcyl(x, y, z + 10, 0.015, 3.2, color);
    c.fcyl(x, y, z + 13.2, 0.019, 1.6, C.ink);
  };
}
const SYRUPS = [C.copper, C.enamelCream, C.woodDeep, C.sakura] as const;

/** Becher-Stapel (blaue To-go-Becher bzw. weiße Tassen). */
function cups(color: string): Item {
  return (c, x, y, z) => {
    c.fshadowDisc(x, y, z, 0.065, 0.16);
    for (let i = 0; i < 4; i++) c.ffrustum(x, y, z + i * 3.2, 0.044, 0.058, 3.6, color, C.white);
  };
}
const blueCups = cups(C.cobalt);
const whiteCups = cups(C.cup);

/** Zucker: Papiertüte mit blauem Etikett. */
const sugar: Item = (c, x, y, z) => {
  c.fshadow(x, y, z, 0.13, 0.09, 0.16);
  c.fbevel(x, y, z, 0.13, 0.09, 10, C.white, { b: 0.8, edge: 0.1 });
  c.front(x + 0.02, y + 0.091, z + 3, 0.09, 3.2, C.cobaltLight);
  c.fbox(x, y + 0.025, z + 10, 0.13, 0.04, 1.2, shade(C.white, 0.9));
};

/** Holzkiste mit Croissants (Bäckerei-Lieferung). */
function crate(c: FacingCanvas, x: number, y: number, z: number, w: number, d: number) {
  const h = 8;
  c.fshadow(x - 0.01, y - 0.01, z, w + 0.02, d + 0.02, 0.18);
  c.fbox(x, y, z, w, d, h, C.pine);
  for (let k = 1; k < 3; k++) c.front(x, y + d + 0.001, z + k * 2.4 - 0.4, w, 0.5, C.woodDark);
  c.fflat(x + 0.02, y + 0.02, z + h - 0.5, w - 0.04, d - 0.04, shade(C.pine, 0.75));
  for (let k = 0; k < 3; k++) {
    const cx = x + 0.06 + k * ((w - 0.12) / 2);
    c.fdome(cx, y + d / 2, z + h - 1, 0.055, 3, C.oakLight);
    c.fdisc(cx, y + d / 2, z + h + 1.2, 0.024, tint(C.oakLight, 0.35));
  }
}

/** Reihe gleicher Stücke auf einem Boden. */
function row(c: FacingCanvas, item: Item, x0: number, x1: number, y: number, z: number, n: number) {
  for (let i = 0; i < n; i++) item(c, x0 + ((x1 - x0) * (i + 0.5)) / n, y, z);
}

// ---------------------------------------------------------------------------------------------
// Regale
// ---------------------------------------------------------------------------------------------

/**
 * Wandregal zwischen x0 und x1 an der Wand (y = 0): vier Böden aus Edelstahl, kobaltblaue Steher. `fill` legt je
 * Boden die Ware auf (Index 0 = unten); gezeichnet wird von unten nach oben, Steher vorn zuletzt.
 */
function rack(c: FacingCanvas, x0: number, x1: number, fill: readonly ((z: number) => void)[]) {
  const post = C.cobalt;
  const board = (z: number) =>
    c.fbevel(x0 + 0.01, 0.02, z, x1 - x0 - 0.02, RACK_D - 0.02, 1.6, C.stainless, {
      b: 0.5,
      frontColor: C.stainlessDark,
    });
  c.fshadow(x0, 0, 0, x1 - x0, RACK_D + 0.04, 0.22);
  for (const px of [x0 + 0.02, x1 - 0.05])
    c.fbox(px, 0.01, 0, 0.03, 0.03, RACK_H, shade(post, 0.85));
  BOARDS.forEach((z, i) => {
    board(z);
    fill[i]?.(z + 1.6);
  });
  board(RACK_H - 1.6);
  for (const px of [x0 + 0.02, x1 - 0.05]) c.fbox(px, RACK_D - 0.03, 0, 0.03, 0.03, RACK_H, post);
  // Kisten oben auf dem Regal, vor den Stehern
  fill[BOARDS.length]?.(RACK_H);
}

/** Ware im Eckregal an der hinteren Wand (lange Seite) je Stufe: unten Säcke, Mitte Dosen, oben Becher. */
function cornerBack(c: FacingCanvas, tier: StorageTier): ((z: number) => void)[] {
  const y = 0.14;
  return [
    (z) => {
      beanSack(c, 0.04, 0.08, z);
      beanSack(c, 0.3, 0.08, z);
      if (tier >= 2) beanSack(c, 0.56, 0.08, z);
      else sugar(c, 0.62, 0.12, z);
    },
    (z) => {
      row(c, tin, 0.06, tier >= 2 ? 0.94 : 0.56, y + 0.04, z, tier >= 2 ? 6 : 3);
    },
    (z) => {
      row(c, blueCups, 0.06, 0.52, y + 0.04, z, tier >= 2 ? 3 : 2);
      if (tier >= 2) {
        sugar(c, 0.6, y, z);
        sugar(c, 0.76, y, z);
      }
    },
    (z) => {
      if (tier >= 3) crate(c, 0.5, 0.06, z, 0.42, 0.24);
    },
  ];
}

/** Ware im Regal an der Seitenwand (kurze Seite des Eckregals): Milch, Sirup, Hafermilch je Stufe. */
function sideShelf(
  c: FacingCanvas,
  tier: StorageTier,
  x0: number,
  x1: number,
): ((z: number) => void)[] {
  const y = 0.13;
  const n = (k: number) => Math.max(1, Math.round(k * (x1 - x0)));
  return [
    (z) => {
      row(c, milk, x0 + 0.02, tier >= 2 ? (x0 + x1) / 2 : x1 - 0.1, y, z, n(tier >= 2 ? 3 : 3));
      if (tier >= 2) row(c, oat, (x0 + x1) / 2, x1 - 0.04, y, z, n(3));
    },
    (z) => {
      const k = n(tier >= 2 ? 7 : 4);
      for (let i = 0; i < k; i++)
        syrup(SYRUPS[i % SYRUPS.length] ?? C.copper)(
          c,
          x0 + 0.04 + ((x1 - x0 - 0.08) * (i + 0.5)) / k,
          y + 0.06,
          z,
        );
    },
    (z) => {
      if (tier >= 2) row(c, whiteCups, x0 + 0.04, x1 - 0.04, y + 0.05, z, n(4));
    },
    (z) => {
      if (tier >= 3) crate(c, x0 + 0.06, 0.06, z, Math.min(0.42, x1 - x0 - 0.1), 0.24);
    },
  ];
}

/** Eckregal: lange Seite an der hinteren Wand, kurze Seite an der linken (quer gezeichnet). */
function corner(tier: StorageTier): string {
  const c = new FacingCanvas('a');
  rack(c, 0, 1, cornerBack(c, tier));
  c.turned(() => rack(c, RACK_D, 1, sideShelf(c, tier, RACK_D, 1)));
  return c.svg();
}

/** Zweites Regal an der Seitenwand (ab Stufe 2), Front zur Raummitte: Mehl, Milch, Sirup, Kisten. */
function sideRack(tier: StorageTier, facing: Facing): string {
  const c = new FacingCanvas(facing);
  rack(c, 0, 1, [
    (z) => {
      flourSack(c, 0.04, 0.08, z);
      flourSack(c, 0.3, 0.08, z);
      if (tier >= 3) beanSack(c, 0.58, 0.08, z);
    },
    (z) => {
      row(c, milk, 0.04, 0.6, 0.13, z, 4);
      row(c, oat, 0.6, 0.96, 0.13, z, tier >= 3 ? 3 : 2);
    },
    (z) => {
      row(c, syrup(C.sakura), 0.04, 0.42, 0.19, z, 3);
      row(c, tin, 0.48, 0.96, 0.18, z, 3);
    },
    (z) => {
      crate(c, 0.06, 0.06, z, 0.4, 0.24);
      if (tier >= 3) crate(c, 0.52, 0.06, z, 0.4, 0.24);
    },
  ]);
  return c.svg();
}

/** Palette mit Säcken und Kisten (Stufe 3), hoch genug, um über die Theke zu schauen. */
function stock(): string {
  const c = new FacingCanvas('a');
  c.fshadow(0.08, 0.12, 0, 0.84, 0.76, 0.24);
  c.fbox(0.1, 0.14, 0, 0.8, 0.72, 1.2, C.oak);
  for (const y of [0.16, 0.48, 0.8]) c.fbox(0.1, y, 1.2, 0.8, 0.06, 1.6, shade(C.oak, 0.9));
  c.fbox(0.1, 0.14, 2.8, 0.8, 0.72, 1, C.oakLight);
  const z = 3.8;
  beanSack(c, 0.14, 0.2, z);
  beanSack(c, 0.14, 0.56, z);
  crate(c, 0.46, 0.2, z, 0.4, 0.28);
  crate(c, 0.46, 0.2, z + 7, 0.4, 0.28);
  flourSack(c, 0.48, 0.56, z);
  crate(c, 0.46, 0.22, z + 14, 0.38, 0.26);
  beanSack(c, 0.16, 0.36, z + 9);
  return c.svg();
}

/** Ware, die ein Barista trägt: kleine Leinwand (`SUPPLY_CANVAS`), Gegenstand um den Bodenpunkt zentriert. */
function supply(id: string): string {
  const s = SUPPLY_CANVAS;
  const c = new FacingCanvas('a', s.w, s.h, s.ox, s.oy);
  // Gegenstand um u = v = 0 zentriert
  switch (id) {
    case 'beans':
      beanSack(c, -0.1, -0.08, 0);
      break;
    case 'flour':
      flourSack(c, -0.1, -0.08, 0);
      break;
    case 'milk':
      milk(c, -0.09, -0.04, 0);
      oat(c, 0.01, -0.04, 0);
      break;
    case 'crate':
      crate(c, -0.17, -0.11, 0, 0.34, 0.22);
      break;
    default:
      tin(c, -0.05, 0, 0);
      tin(c, 0.06, 0, 0);
  }
  return c.svg();
}

/** Richtungen der Seitenregale, die ein Grundriss braucht. */
export function storageRackFacings(): Facing[] {
  const out = new Set<Facing>();
  for (const l of Object.values(LAYOUTS))
    for (const p of l.storage.pieces) if (p.piece === 'rack') out.add(p.facesX ? 'b' : 'a');
  return [...out];
}

/**
 * Lager-Sprites: `storage-corner-<stufe>` (Eckregal), `storage-rack-<stufe>-<a|b>` (Seitenregal),
 * `storage-stock` (Palette, Stufe 3), `supply-<ware>` (getragene Ware). `rackFacings` = gebrauchte Richtungen.
 */
export function storageSprites(rackFacings: readonly Facing[] = storageRackFacings()): SpriteDef[] {
  const out: SpriteDef[] = [];
  for (const tier of STORAGE_TIERS) {
    out.push({ name: `storage-corner-${String(tier)}`, svg: corner(tier) });
    if (tier >= 2)
      for (const f of rackFacings)
        out.push({ name: `storage-rack-${String(tier)}-${f}`, svg: sideRack(tier, f) });
  }
  out.push({ name: 'storage-stock', svg: stock() });
  for (const id of new Set(Object.values(SUPPLY_ITEMS)))
    out.push({ name: `supply-${id}`, svg: supply(id) });
  return out;
}

/** Nur für den Kontaktbogen: eine Lager-Ecke wie in der Szene (Eckregal + Seitenregal + Palette) je Stufe. */
export function storagePreview(tier: StorageTier): string {
  const c = new IsoCanvas(160, 150, 64, 70);
  const part = (
    svg: string,
    u: number,
    v: number,
    w: number,
    h: number,
    ox: number,
    oy: number,
  ) => {
    const [px, py] = c.p([u, v, 0]);
    c.raw(
      `<image x="${(px - ox).toFixed(1)}" y="${(py - oy).toFixed(1)}" width="${String(w)}" height="${String(h)}" href="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}"/>`,
    );
  };
  part(corner(tier), 0, 0, 64, 104, 32, 72);
  if (tier >= 2) part(sideRack(tier, 'b'), 0, 1, 64, 104, 32, 72);
  if (tier >= 3) part(stock(), 2, 2, 64, 104, 32, 72);
  return c.svg();
}
