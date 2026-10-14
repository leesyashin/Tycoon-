import Phaser from 'phaser';
import { CUSTOMER_TYPES, type CustomerTypeDef } from '@data/customerTypes';
import { STATIONS } from '@data/stations';
import { TILE_H, TILE_W } from './iso/iso';

/**
 * Programmatisch erzeugte, farbcodierte Platzhalter (PLAN § 2.3, Assets Phase 1).
 * S8 ersetzt sie durch echte Sprites mit denselben Texture-Keys.
 */
export const TEX = {
  tileA: 'tile-a',
  tileB: 'tile-b',
  entrance: 'entrance',
  ghost: 'station-ghost',
  coin: 'coin',
  leaf: 'leaf',
  station: (id: string) => `station-${id}`,
  customer: (id: string) => `customer-${id}`,
  ambience: (id: string) => `ambience-${id}`,
} as const;

/** Höhe der Stations-Blöcke in px. */
export const STATION_BOX_H = 26;

const STATION_COLORS: Record<string, number> = {
  matchaBar: 0x5f9e3c,
  checkout: 0xc9a227,
  togoWindow: 0x3c8e9e,
  icedBar: 0x7fc4e0,
  bakery: 0xc77d3c,
  merchShelf: 0x9e5fc0,
  ceremonyCorner: 0x8e3c3c,
  workshopRoom: 0x3c5e9e,
};

const AMBIENCE: Record<string, { color: number; h: number; scale: number }> = {
  seats: { color: 0x9c7a54, h: 10, scale: 0.6 },
  decor: { color: 0x3f8f3f, h: 18, scale: 0.4 },
  music: { color: 0x333344, h: 16, scale: 0.35 },
  wifi: { color: 0xdddddd, h: 6, scale: 0.3 },
};

function shade(color: number, f: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  return Phaser.Display.Color.GetColor(
    Math.round(c.red * f),
    Math.round(c.green * f),
    Math.round(c.blue * f),
  );
}

function diamond(w: number, h: number, ox = 0, oy = 0): Phaser.Geom.Point[] {
  return [
    new Phaser.Geom.Point(ox + w / 2, oy),
    new Phaser.Geom.Point(ox + w, oy + h / 2),
    new Phaser.Geom.Point(ox + w / 2, oy + h),
    new Phaser.Geom.Point(ox, oy + h / 2),
  ];
}

/** Iso-Quader: Deckfläche oben, Seiten darunter; Textur-Unterkante = untere Spitze. */
function drawBox(
  g: Phaser.GameObjects.Graphics,
  color: number,
  w: number,
  h: number,
  boxH: number,
) {
  const top = diamond(w, h);
  g.fillStyle(shade(color, 0.7), 1);
  g.fillPoints(
    [
      new Phaser.Geom.Point(0, h / 2),
      new Phaser.Geom.Point(w / 2, h),
      new Phaser.Geom.Point(w / 2, h + boxH),
      new Phaser.Geom.Point(0, h / 2 + boxH),
    ],
    true,
  );
  g.fillStyle(shade(color, 0.5), 1);
  g.fillPoints(
    [
      new Phaser.Geom.Point(w, h / 2),
      new Phaser.Geom.Point(w / 2, h),
      new Phaser.Geom.Point(w / 2, h + boxH),
      new Phaser.Geom.Point(w, h / 2 + boxH),
    ],
    true,
  );
  g.fillStyle(color, 1);
  g.fillPoints(top, true);
  g.lineStyle(1, shade(color, 0.35), 1);
  g.strokePoints(top, true);
}

function make(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
) {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

function drawCustomer(g: Phaser.GameObjects.Graphics, t: CustomerTypeDef) {
  // 14×24: Beine, Körper, Kopf, Accessoire. Ursprung später unten Mitte.
  g.fillStyle(0x2b2b2b, 1);
  g.fillRect(4, 18, 2, 6);
  g.fillRect(8, 18, 2, 6);
  g.fillStyle(t.body, 1);
  g.fillRoundedRect(2, 8, 10, 11, 3);
  g.fillStyle(0xf1c9a5, 1);
  g.fillCircle(7, 5, 4);
  g.fillStyle(t.accent, 1);
  switch (t.accessory) {
    case 'backpack':
      g.fillRect(10, 9, 4, 7);
      break;
    case 'hat':
      g.fillRect(1, 1, 12, 2);
      g.fillRect(4, 0, 6, 2);
      break;
    case 'cup':
      g.fillRect(11, 11, 3, 4);
      break;
    case 'phone':
      g.fillRect(11, 6, 3, 5);
      g.lineStyle(1, t.accent, 1);
      g.strokeCircle(7, 5, 6);
      break;
    case 'notebook':
      g.fillRect(0, 11, 4, 5);
      break;
  }
}

export function generatePlaceholders(scene: Phaser.Scene): void {
  for (const [key, color] of [
    [TEX.tileA, 0xc9b28a],
    [TEX.tileB, 0xbda57c],
  ] as const) {
    make(scene, key, TILE_W, TILE_H, (g) => {
      const pts = diamond(TILE_W, TILE_H);
      g.fillStyle(color, 1);
      g.fillPoints(pts, true);
      g.lineStyle(1, 0xa38b62, 1);
      g.strokePoints(pts, true);
    });
  }
  make(scene, TEX.entrance, TILE_W, TILE_H, (g) => {
    const pts = diamond(TILE_W, TILE_H);
    g.fillStyle(0x6b4a2f, 1);
    g.fillPoints(pts, true);
  });
  make(scene, TEX.ghost, TILE_W, TILE_H + STATION_BOX_H, (g) => {
    const pts = diamond(TILE_W - 4, TILE_H - 2, 2, STATION_BOX_H + 1);
    g.fillStyle(0xffffff, 0.15);
    g.fillPoints(pts, true);
    g.lineStyle(2, 0xffffff, 0.7);
    g.strokePoints(pts, true);
  });
  for (const s of STATIONS) {
    make(scene, TEX.station(s.id), TILE_W, TILE_H + STATION_BOX_H, (g) =>
      drawBox(g, STATION_COLORS[s.id] ?? 0x888888, TILE_W, TILE_H, STATION_BOX_H),
    );
  }
  for (const [id, a] of Object.entries(AMBIENCE)) {
    const w = Math.round(TILE_W * a.scale);
    const h = Math.round(TILE_H * a.scale);
    make(scene, TEX.ambience(id), w, h + a.h, (g) => drawBox(g, a.color, w, h, a.h));
  }
  for (const t of CUSTOMER_TYPES)
    make(scene, TEX.customer(t.id), 14, 24, (g) => drawCustomer(g, t));
  make(scene, TEX.coin, 10, 10, (g) => {
    g.fillStyle(0xf5c542, 1);
    g.fillCircle(5, 5, 5);
    g.fillStyle(0xfff0a0, 1);
    g.fillCircle(4, 4, 2);
  });
  make(scene, TEX.leaf, 8, 6, (g) => {
    g.fillStyle(0x7dc34a, 1);
    g.fillPoints(diamond(8, 6), true);
  });
}
