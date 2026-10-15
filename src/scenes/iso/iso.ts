export const TILE_W = 64;
export const TILE_H = 32;
export const GRID_SIZE = 12;

export interface Point {
  x: number;
  y: number;
}

/** Grid → Bildschirm (2:1-Diamant), Ursprung = Spitze der Kachel (0,0). */
export function toScreen(gx: number, gy: number): Point {
  return { x: ((gx - gy) * TILE_W) / 2, y: ((gx + gy) * TILE_H) / 2 };
}

/** Bildschirm → Grid (Fließkomma; mit Math.floor auf die Kachel runden). */
export function toGrid(sx: number, sy: number): Point {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Größere Werte werden weiter vorne gezeichnet. */
export function depth(gx: number, gy: number): number {
  return gx + gy;
}

/** Zeichentiefe der Szene nach Kachel-Position (Kachel-Index, Mitte = ganze Zahl); Feinsortierung über `bias`. */
export const isoDepth = (x: number, y: number, bias = 0): number => (x + y) * 10 + bias;
