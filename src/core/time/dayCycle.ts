import { DAY_CYCLE } from '@data/ui';
import { dayOf, minuteOfDay } from './clock';

export interface CafeClock {
  /** Spieltag (0 = erster Tag). */
  day: number;
  /** 0..23 */
  hour: number;
  /** 0..59 */
  minute: number;
  /** Nacht-Anteil 0 (Tag) … 1 (tiefe Nacht), weich über Dämmerung/Morgengrauen. */
  night: number;
}

const smooth = (x: number): number => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

/** Café-Tageszeit aus der Spieluhr (`GameState.clock`, Spielminuten) mit weichem Licht für die Szene. */
export function getCafeClock(clock: number): CafeClock {
  const c = DAY_CYCLE;
  const m = minuteOfDay(clock);
  // Kleiner Zuschlag gegen Rundungsfehler (8:00 soll nicht als 7:59 erscheinen).
  const totalMin = Math.floor(m + 1e-6) % (24 * 60);
  const h = m / 60;
  // Abends von duskFrom bis nightFrom dunkler werden, morgens von nightTo bis dawnTo heller.
  const night =
    h >= c.duskFrom
      ? smooth((h - c.duskFrom) / (c.nightFrom - c.duskFrom))
      : h < c.dawnTo
        ? 1 - smooth((h - c.nightTo) / (c.dawnTo - c.nightTo))
        : 0;
  return { day: dayOf(clock), hour: Math.floor(totalMin / 60), minute: totalMin % 60, night };
}
