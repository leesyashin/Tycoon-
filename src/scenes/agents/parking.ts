import { PARKING_CROWD, PARKING_LOT, type ParkingSlot } from '@data/parking';
import type { GridPos } from '@data/layouts';

/**
 * Fahrten auf dem Parkplatz (kosmetisch, ohne Phaser): Ein Auto biegt vom Bordstein in die Einfahrt, fährt die
 * Fahrgasse entlang und vorwärts in seine Box; beim Wegfahren denselben Weg zurück. Rad und Roller tauchen einfach
 * auf bzw. verschwinden (`PARKING_CROWD.popSec`). Grid-Koordinaten der Stadt.
 */

/** Weg eines Autos vom Bordstein in seine Box (Grid). */
export function carPath(slot: ParkingSlot): GridPos[] {
  const { driveX, streetY, aisleY } = PARKING_LOT;
  const pts: GridPos[] = [{ x: driveX, y: streetY }];
  if (Math.abs(slot.x - driveX) > 1e-6) {
    pts.push({ x: driveX, y: aisleY });
    pts.push({ x: slot.x, y: aisleY });
  }
  pts.push({ x: slot.x, y: slot.y });
  return pts;
}

export function polylineLength(pts: readonly GridPos[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a && b) len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

/** Punkt und Fahrtrichtung bei Strecke `d` entlang eines Wegs. */
export function pointAt(
  pts: readonly GridPos[],
  d: number,
): { x: number; y: number; dx: number; dy: number } {
  let rest = Math.max(0, d);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (rest <= len || i === pts.length - 1) {
      const t = len > 0 ? Math.min(1, rest / len) : 1;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        dx: len > 0 ? (b.x - a.x) / len : 0,
        dy: len > 0 ? (b.y - a.y) / len : 0,
      };
    }
    rest -= len;
  }
  const last = pts[pts.length - 1] ?? { x: 0, y: 0 };
  return { x: last.x, y: last.y, dx: 0, dy: -1 };
}

/** Wie lange Ein- bzw. Ausparken dauert (Sekunden): Autos fahren ihren Weg, Rad und Roller erscheinen. */
export function parkSec(slot: ParkingSlot): number {
  if (slot.kind !== 'car') return PARKING_CROWD.popSec;
  return polylineLength(carPath(slot)) / PARKING_CROWD.carTilesPerSec;
}
