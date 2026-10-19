import type { TablePlacement } from '@data/layouts';

/**
 * Antippen in der Szene: Jedes Objekt im Café öffnet sein Upgrade-Panel. Ziel ist eine Stations-ID oder
 * `ambience:<id>` (wie `UI_EVENTS.openStation`), abgelegt unter diesem Data-Schlüssel am Game Object.
 */
export const TAP_TARGET_KEY = 'tapTarget';

export function ambienceTarget(id: string): string {
  return `ambience:${id}`;
}

/**
 * Objekt eines offenen Objekt-Panels (Panel-Schlüssel `station:<id>` bzw. `station:ambience-<id>`) als Ziel wie beim
 * Antippen (`<id>` bzw. `ambience:<id>`): darauf schaut die Kamera. Andere Panels zeigen kein Objekt (`null`).
 */
export function panelTarget(key: string | undefined): string | null {
  if (!key?.startsWith('station:')) return null;
  const id = key.slice('station:'.length);
  return id.startsWith('ambience-') ? ambienceTarget(id.slice('ambience-'.length)) : id;
}

/** Tische drinnen kommen mit „Tische“, Terrassen-Tische mit der Terrasse. */
export function tableTarget(p: TablePlacement): string {
  return ambienceTarget(p.outside ? 'terrace' : 'seats');
}

export interface TapCandidate {
  target: string;
  /** Unter dem Finger liegt ein sichtbares Pixel des Objekts, nicht nur sein (leerer) Bildrahmen. */
  solid: boolean;
}

/**
 * Wählt aus den Objekten unter dem Finger (oberstes zuerst) das oberste, das dort sichtbar ist: Der leere Rahmen
 * eines Tischs soll nicht die Theke dahinter verdecken. Trifft der Finger knapp daneben, zählt das oberste
 * getroffene Objekt, denn Geräte und Tische sind auf dem Handy klein.
 */
export function pickTapTarget(candidates: readonly TapCandidate[]): string | null {
  return (candidates.find((c) => c.solid) ?? candidates[0])?.target ?? null;
}
