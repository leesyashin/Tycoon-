/**
 * Parkplatz neben dem Café (Vorgabe Vincent, 2026-10-16: „neben dem Laden einen Parkplatz mit Plätzen plus
 * Roller-/Fahrradständern“): links neben dem Café-Block, wo früher ein Altbau stand. Ausbaustufen = Ambiente
 * `parking` (Wirkung in `BALANCE.demand.perParking`): erst Fahrradständer, dann Roller-Plätze, dann Auto-Stellplätze
 * mit Ladesäule. Gäste kommen sichtbar mit Rad, Roller oder Auto, parken und gehen zu Fuß ins Café (nur Optik).
 *
 * Koordinaten im Grid der Stadt (`data/city.ts`, Kachel x reicht von x bis x + 1); die Figuren rechnen in
 * Agenten-Koordinaten (Grid − 0,5).
 */
export type VehicleKind = 'bike' | 'moped' | 'car';

export interface ParkingSlot {
  kind: VehicleKind;
  /** Mitte des Fahrzeugs (Grid). Räder und Roller stehen quer zum Gehweg, Autos mit der Front zur Rückwand. */
  x: number;
  y: number;
  /** Sichtbar und belegbar ab dieser Ausbaustufe. */
  minLevel: number;
}

export interface GridRectP {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const PARKING_LOT = {
  /** Fläche des Parkplatzes (Grid). */
  rect: { x0: -7, y0: 7, x1: 1, y1: 12 } as GridRectP,
  /** Einfahrt über den abgesenkten Bordstein: Autos fahren auf dieser Linie (x) von der Straße herein. */
  driveX: -6.3,
  /** Hier beginnt bzw. endet eine Autofahrt (am Bordstein, Grid y). */
  streetY: 15.4,
  /** Fahrgasse vor den Stellplätzen (Grid y). */
  aisleY: 9.95,
  slots: [
    // Fahrradständer vorn am Gehweg (Stufe 1: zwei Bügel, Stufe 2: zwei weitere). Erst ab x ≈ −2: Weiter rechts
    // stünden die Räder in der Ansicht hinter der Glaswand des Wintergartens, die immer hinten gezeichnet wird.
    { kind: 'bike', x: -1.95, y: 11.4, minLevel: 1 },
    { kind: 'bike', x: -2.5, y: 11.4, minLevel: 1 },
    { kind: 'bike', x: -3.05, y: 11.4, minLevel: 2 },
    { kind: 'bike', x: -3.6, y: 11.4, minLevel: 2 },
    // Roller-Plätze daneben (Stufe 3)
    { kind: 'moped', x: -4.05, y: 11.35, minLevel: 3 },
    { kind: 'moped', x: -4.65, y: 11.35, minLevel: 3 },
    { kind: 'moped', x: -5.25, y: 11.35, minLevel: 3 },
    // Auto-Stellplätze an der Rückwand (Stufe 4: zwei, Stufe 5: zwei weitere mit Ladesäule)
    { kind: 'car', x: -6.3, y: 8.15, minLevel: 4 },
    { kind: 'car', x: -5.0, y: 8.15, minLevel: 4 },
    { kind: 'car', x: -3.7, y: 8.15, minLevel: 5 },
    { kind: 'car', x: -2.4, y: 8.15, minLevel: 5 },
  ] as readonly ParkingSlot[],
  /** Schild „P“ an der Einfahrt und Ladesäule (ab Stufe 5) an der Rückwand. */
  sign: { x: -6.95, y: 11.85 },
  charger: { x: -1.55, y: 7.35, minLevel: 5 },
  /** Bauzaun entlang des Gehwegs, solange noch nichts gebaut ist (Stufe 0). */
  fenceY: 11.92,
  /** Stellplatz-Markierungen: Breite eines Auto-Stellplatzes und Tiefe (Grid). */
  bay: { w: 1.3, d: 2.1 },
} as const;

/** Was Gäste mit dem Fahrzeug betrifft (nur Optik). */
export const PARKING_CROWD = {
  /** Anteil der Gäste, die mit dem Fahrzeug kommen, je Ausbaustufe 0..5 (wenn ein Platz frei ist). */
  vehicleShare: [0, 0.14, 0.22, 0.3, 0.36, 0.42] as readonly number[],
  /** Unter den freien Plätzen: so oft wird ein Auto gewählt (sonst Rad oder Roller), wenn beides frei ist. */
  carShare: 0.4,
  /** Autos fahren so schnell (Kacheln/s) und blenden auf so vielen Kacheln am Bordstein ein bzw. aus. */
  carTilesPerSec: 2.2,
  carFadeTiles: 1.2,
  /** Rad und Roller erscheinen bzw. verschwinden so schnell (Sekunden). */
  popSec: 0.35,
} as const;

/** Sichtbare Plätze einer Ausbaustufe (Index in `PARKING_LOT.slots`). */
export function parkingSlotsAt(level: number): number[] {
  return PARKING_LOT.slots.flatMap((s, i) => (level >= s.minLevel ? [i] : []));
}

/**
 * Wo ein Gast neben seinem Fahrzeug auftaucht bzw. verschwindet (Grid): bei Rad und Roller vorn auf dem Gehweg, beim
 * Auto in der Fahrgasse neben der Fahrertür.
 */
export function parkingExit(slot: ParkingSlot): { x: number; y: number } {
  if (slot.kind === 'car') return { x: slot.x + 0.55, y: PARKING_LOT.aisleY - 0.15 };
  return { x: slot.x + 0.28, y: PARKING_LOT.rect.y1 + 0.35 };
}
