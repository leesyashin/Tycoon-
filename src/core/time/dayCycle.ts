import { DAY_CYCLE } from '@data/ui';

export interface CafeClock {
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

/**
 * Café-Tageszeit aus der Spielzeit (UI_STYLE § 4: 24 min = 1 Tag). Rein kosmetisch: weder Einnahmen
 * noch Kunden hängen daran (CLAUDE.md).
 */
export function getCafeClock(playtimeSec: number): CafeClock {
  const c = DAY_CYCLE;
  const dayFrac = (((playtimeSec / c.dayLengthSec + c.startHour / 24) % 1) + 1) % 1;
  // Kleiner Zuschlag gegen Rundungsfehler (8:00 soll nicht als 7:59 erscheinen).
  const totalMin = Math.floor(dayFrac * 24 * 60 + 1e-6) % (24 * 60);
  const h = dayFrac * 24;
  // Abends von duskFrom bis nightFrom dunkler werden, morgens von nightTo bis dawnTo heller.
  const night =
    h >= c.duskFrom
      ? smooth((h - c.duskFrom) / (c.nightFrom - c.duskFrom))
      : h < c.dawnTo
        ? 1 - smooth((h - c.nightTo) / (c.dawnTo - c.nightTo))
        : 0;
  return { hour: Math.floor(totalMin / 60), minute: totalMin % 60, night };
}
