import { describe, expect, it } from 'vitest';
import { OPENING_HOURS, TIME } from '@data/time';
import {
  createInitialState,
  getLocation,
  withLocation,
  type GameState,
  type OpeningHours,
} from '@core/GameState';
import { advanceRealSeconds } from '@core/economy';
import { computeLocationRates } from '@core/customers';
import {
  clampHours,
  clockSpeed,
  dayOf,
  hourOf,
  isOpenAt,
  isOpenHour,
  minuteOfDay,
  minutesToNextHour,
  nextOpeningAt,
  openHoursPerDay,
  realSecondsPerDay,
  setOpeningHours,
} from '@core/time';

const LOC = 'berlin';
const DAY = TIME.minutesPerDay;
const HOURS = OPENING_HOURS.default;
const fresh = (): GameState => createInitialState(0);
/** Spielminute von Tag `day`, `hour`:`minute`. */
const at = (day: number, hour: number, minute = 0): number => day * DAY + hour * 60 + minute;
/** Spieluhr stellen; `hourMark` passend, damit keine Stunden nachgebucht werden. */
const withClock = (s: GameState, clock: number): GameState => ({
  ...s,
  clock,
  hourMark: Math.floor(clock / 60),
});

describe('Spieluhr: Tag, Stunde und Minute aus Spielminuten', () => {
  it('ein Tag hat 24 × 60 Spielminuten', () => {
    expect(DAY).toBe(24 * 60);
  });

  it('minuteOfDay, hourOf und dayOf zerlegen die Uhr', () => {
    expect(minuteOfDay(at(0, 7, 40))).toBe(7 * 60 + 40);
    expect(minuteOfDay(at(3, 7, 40))).toBe(7 * 60 + 40);
    expect(dayOf(at(3, 7, 40))).toBe(3);
    expect(hourOf(at(3, 23, 59))).toBe(23);
    expect(hourOf(at(2, 0))).toBe(0);
    expect(dayOf(at(2, 0))).toBe(2);
    expect(dayOf(at(2, 0) - 0.5)).toBe(1);
    expect(hourOf(at(5, 13, 30.5))).toBe(13);
  });

  it('negative Zeiten werden sauber umgebrochen', () => {
    expect(minuteOfDay(-60)).toBe(DAY - 60);
    expect(hourOf(-60)).toBe(23);
    expect(dayOf(-1)).toBe(-1);
  });

  it('ein neues Spiel beginnt an Tag 0 kurz vor der ersten Öffnung', () => {
    const s = fresh();
    const loc = getLocation(s, LOC);
    expect(s.clock).toBe(TIME.startMinute);
    expect(s.hourMark).toBe(Math.floor(TIME.startMinute / 60));
    expect(dayOf(s.clock)).toBe(0);
    expect(loc.hours).toEqual(HOURS);
    expect(isOpenAt(loc, s.clock)).toBe(false);
    // Die erste Öffnung ist noch am selben Tag.
    expect(nextOpeningAt(loc, s.clock)).toBe(at(0, HOURS.open));
  });
});

describe('Öffnungszeiten', () => {
  it('geöffnet von `open` bis vor `close` (volle Stunden)', () => {
    expect(isOpenHour(HOURS, HOURS.open - 1)).toBe(false);
    expect(isOpenHour(HOURS, HOURS.open)).toBe(true);
    expect(isOpenHour(HOURS, HOURS.close - 1)).toBe(true);
    expect(isOpenHour(HOURS, HOURS.close)).toBe(false);
    // `close` 24 = bis Mitternacht.
    expect(isOpenHour({ open: 8, close: 24 }, 23)).toBe(true);
    expect(isOpenHour({ open: 8, close: 24 }, 0)).toBe(false);
  });

  it('openHoursPerDay = close − open, nie negativ', () => {
    expect(openHoursPerDay(HOURS)).toBe(HOURS.close - HOURS.open);
    expect(openHoursPerDay({ open: 6, close: 22 })).toBe(16);
    expect(openHoursPerDay({ open: 10, close: 8 })).toBe(0);
  });

  it('isOpenAt prüft die Stunde der Spieluhr an jedem Tag', () => {
    const loc = getLocation(fresh(), LOC);
    expect(isOpenAt(loc, at(5, HOURS.open))).toBe(true);
    expect(isOpenAt(loc, at(5, HOURS.close - 1, 59))).toBe(true);
    expect(isOpenAt(loc, at(5, HOURS.close))).toBe(false);
    expect(isOpenAt(loc, at(5, 3))).toBe(false);
  });

  it('nextOpeningAt: jetzt, wenn geöffnet; sonst heute oder morgen früh', () => {
    const loc = getLocation(fresh(), LOC);
    expect(nextOpeningAt(loc, at(2, HOURS.open, 30))).toBe(at(2, HOURS.open, 30));
    expect(nextOpeningAt(loc, at(2, 0))).toBe(at(2, HOURS.open));
    expect(nextOpeningAt(loc, at(2, HOURS.open - 1, 59))).toBe(at(2, HOURS.open));
    expect(nextOpeningAt(loc, at(2, HOURS.close))).toBe(at(3, HOURS.open));
    expect(nextOpeningAt(loc, at(2, 23, 59))).toBe(at(3, HOURS.open));
  });
});

describe('Tempo der Uhr', () => {
  it('geöffnet 1 Spielminute je Sekunde, geschlossen spult die Nacht vor', () => {
    expect(TIME.closedMinutesPerSec).toBeGreaterThan(TIME.openMinutesPerSec);
    const s = fresh();
    expect(clockSpeed(withClock(s, at(0, HOURS.open)))).toBe(TIME.openMinutesPerSec);
    expect(clockSpeed(withClock(s, at(0, HOURS.close - 1, 30)))).toBe(TIME.openMinutesPerSec);
    expect(clockSpeed(withClock(s, at(0, HOURS.close)))).toBe(TIME.closedMinutesPerSec);
    expect(clockSpeed(withClock(s, at(1, 2)))).toBe(TIME.closedMinutesPerSec);
  });

  it('es zählt das aktive Café', () => {
    const s = fresh();
    const l = getLocation(s, LOC);
    // Berlin schließt um 18 Uhr, Kyoto erst um Mitternacht.
    const early = withLocation(s, LOC, { ...l, hours: { open: 8, close: 18 } });
    const late = withLocation(early, 'kyoto', { ...l, hours: { open: 8, close: 24 } });
    const evening = withClock(late, at(0, 22));
    expect(clockSpeed(evening)).toBe(TIME.closedMinutesPerSec);
    expect(clockSpeed({ ...evening, activeLocationId: 'kyoto' })).toBe(TIME.openMinutesPerSec);
    // Ohne aktives Café läuft die Uhr wie geöffnet (kein Vorspulen ins Leere).
    expect(clockSpeed({ ...evening, activeLocationId: 'nowhere' })).toBe(TIME.openMinutesPerSec);
  });

  it('minutesToNextHour: bis zur nächsten vollen Stunde, auf der vollen Stunde eine ganze', () => {
    expect(minutesToNextHour(at(0, 8))).toBe(60);
    expect(minutesToNextHour(at(0, 7, 40))).toBe(20);
    expect(minutesToNextHour(at(0, 7, 59.5))).toBeCloseTo(0.5, 9);
    expect(minutesToNextHour(at(1, 23, 30))).toBe(30);
    // Rundungsfehler knapp vor der vollen Stunde zählen als volle Stunde (keine Mini-Abschnitte).
    expect(minutesToNextHour(at(0, 8) - 1e-12)).toBeCloseTo(60, 9);
    for (const clock of [0, 59.999, 61, 1439, 1440, 10_000.25]) {
      expect(minutesToNextHour(clock)).toBeGreaterThan(0);
      expect(minutesToNextHour(clock)).toBeLessThanOrEqual(60);
    }
  });

  it('realSecondsPerDay: geöffnete Minuten mit Öffnungs-Tempo, der Rest im Zeitraffer', () => {
    const openMin = openHoursPerDay(HOURS) * 60;
    expect(realSecondsPerDay(HOURS)).toBeCloseTo(
      openMin / TIME.openMinutesPerSec + (DAY - openMin) / TIME.closedMinutesPerSec,
      9,
    );
    // Länger geöffnet = längerer echter Tag; rund um die Uhr geöffnet = 24 Spielstunden in Echtzeit-Minuten.
    expect(realSecondsPerDay({ open: 6, close: 22 })).toBeGreaterThan(realSecondsPerDay(HOURS));
    expect(realSecondsPerDay({ open: 0, close: 24 })).toBeCloseTo(DAY / TIME.openMinutesPerSec, 9);
  });

  it('im Betrieb dauert ein Spieltag genau realSecondsPerDay echte Sekunden', () => {
    const s = fresh();
    const day = advanceRealSeconds(s, realSecondsPerDay(HOURS));
    expect(day.clock).toBeCloseTo(s.clock + DAY, 6);
    const two = advanceRealSeconds(s, 2 * realSecondsPerDay(HOURS));
    expect(two.clock).toBeCloseTo(s.clock + 2 * DAY, 6);
  });
});

describe('clampHours: gültige Öffnungszeiten', () => {
  const o = OPENING_HOURS;

  it('lässt gültige Zeiten unverändert und rundet auf volle Stunden', () => {
    expect(clampHours(HOURS)).toEqual(HOURS);
    expect(clampHours({ open: HOURS.open + 0.4, close: HOURS.close - 0.4 })).toEqual(HOURS);
  });

  it('Grenzen für Öffnen und Schließen', () => {
    expect(clampHours({ open: 0, close: HOURS.close }).open).toBe(o.earliestOpen);
    expect(clampHours({ open: 23, close: 24 }).open).toBe(o.latestOpen);
    expect(clampHours({ open: HOURS.open, close: 30 }).close).toBe(o.latestClose);
    expect(clampHours({ open: o.earliestOpen, close: 0 }).close).toBe(
      Math.max(o.earliestClose, o.earliestOpen + o.minHours),
    );
  });

  it('Mindestdauer: zu kurz wird nach hinten verlängert', () => {
    const h = clampHours({ open: o.latestOpen, close: o.latestOpen + 1 });
    expect(h.open).toBe(o.latestOpen);
    expect(h.close).toBe(Math.max(o.earliestClose, o.latestOpen + o.minHours));
  });

  it('jede Eingabe ergibt ganze Stunden in den Grenzen mit Mindestdauer', () => {
    for (let open = -3; open <= 27; open++) {
      for (let close = -3; close <= 27; close += 2) {
        const h = clampHours({ open: open + 0.3, close });
        expect(Number.isInteger(h.open) && Number.isInteger(h.close)).toBe(true);
        expect(h.open).toBeGreaterThanOrEqual(o.earliestOpen);
        expect(h.open).toBeLessThanOrEqual(o.latestOpen);
        expect(h.close).toBeGreaterThanOrEqual(o.earliestClose);
        expect(h.close).toBeLessThanOrEqual(o.latestClose);
        expect(openHoursPerDay(h)).toBeGreaterThanOrEqual(o.minHours);
      }
    }
  });

  it('die Vorgabe selbst ist gültig', () => {
    expect(clampHours(o.default)).toEqual(o.default);
  });
});

describe('setOpeningHours (Aktion)', () => {
  it('gilt sofort und nur für dieses Café', () => {
    const s = fresh();
    const two = withLocation(s, 'kyoto', getLocation(s, LOC));
    const wide: OpeningHours = { open: 6, close: 22 };
    const n = setOpeningHours(two, LOC, wide);
    expect(getLocation(n, LOC).hours).toEqual(wide);
    expect(getLocation(n, 'kyoto').hours).toEqual(HOURS);
    // Abends geöffnet: die Stunde bringt Gäste (und kostet Löhne).
    const r = computeLocationRates(n, LOC, { hour: 20 });
    expect(r.open).toBe(true);
    expect(r.wagesPerHour.toNumber()).toBeGreaterThan(0);
    expect(computeLocationRates(two, LOC, { hour: 20 }).open).toBe(false);
  });

  it('klemmt ungültige Zeiten', () => {
    const wish: OpeningHours = { open: 0, close: 99 };
    const n = setOpeningHours(fresh(), LOC, wish);
    expect(getLocation(n, LOC).hours).toEqual(clampHours(wish));
  });

  it('ohne Änderung bleibt der State derselbe; unbekanntes Café wirft', () => {
    const s = fresh();
    expect(setOpeningHours(s, LOC, { ...HOURS })).toBe(s);
    expect(setOpeningHours(s, LOC, { open: HOURS.open + 0.2, close: HOURS.close })).toBe(s);
    expect(() => setOpeningHours(s, 'nowhere', HOURS)).toThrow();
  });
});
