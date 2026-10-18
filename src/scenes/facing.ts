import { SCENE_FX } from '@data/art';

/** Ansicht einer Figur: `front` blickt zur Kamera, gespiegelt für die zweite Achse. */
export type Look = { dir: 'front' | 'back'; flip: boolean };

/** Blickrichtung einer Figur aus einem Bewegungs-/Blickvektor im Grid. */
export function facing(dx: number, dy: number): Look {
  if (Math.abs(dx) > Math.abs(dy)) return { dir: dx > 0 ? 'front' : 'back', flip: true };
  return { dir: dy >= 0 ? 'front' : 'back', flip: false };
}

/**
 * Blickrichtung beim Gehen mit Hysterese: Die Figuren haben nur vier Ansichten (entlang der Raster-Achsen); auf
 * schrägen Wegen und in Kurven bleibt die bisherige Ansicht, solange die Figur in diese Richtung vorankommt und die
 * andere Achse nicht deutlich überwiegt – sonst flackert sie auf jeder Diagonale zwischen zwei Ansichten.
 */
export function walkFacing(prev: Look | null, dx: number, dy: number): Look {
  if (!prev) return facing(dx, dy);
  const sign = prev.dir === 'front' ? 1 : -1;
  const along = (prev.flip ? dx : dy) * sign;
  const across = Math.abs(prev.flip ? dy : dx);
  if (along > 0 && across < along * SCENE_FX.facingKeep) return prev;
  return facing(dx, dy);
}
