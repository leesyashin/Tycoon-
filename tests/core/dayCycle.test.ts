import { describe, expect, it } from 'vitest';
import { getCafeClock } from '@core/time/dayCycle';
import { nextOpeningAt } from '@core/time/clock';
import { createInitialState, getLocation } from '@core/GameState';
import { tick } from '@core/GameLoop';
import { DAY_CYCLE } from '@data/ui';
import { TIME } from '@data/time';

const DAY = TIME.minutesPerDay;
/** Spielminute von Tag `day`, Stunde `hour` (auch mit Bruchteil). */
const at = (day: number, hour: number, minute = 0): number => day * DAY + hour * 60 + minute;
const nightAt = (hour: number, day = 0): number => getCafeClock(at(day, hour)).night;

describe('Café-Tageszeit aus der Spieluhr', () => {
  it('neues Spiel: Tag 0 zur Startzeit', () => {
    expect(getCafeClock(TIME.startMinute)).toMatchObject({
      day: 0,
      hour: Math.floor(TIME.startMinute / 60),
      minute: TIME.startMinute % 60,
    });
  });

  it('1 Spielminute = 1 Café-Minute, 1440 Spielminuten = 1 Tag', () => {
    expect(getCafeClock(at(0, 13, 5))).toMatchObject({ day: 0, hour: 13, minute: 5 });
    expect(getCafeClock(at(0, 13, 6)).minute).toBe(6);
    expect(getCafeClock(at(0, 13, 59) + 1)).toMatchObject({ hour: 14, minute: 0 });
    expect(getCafeClock(TIME.startMinute + DAY)).toEqual({
      ...getCafeClock(TIME.startMinute),
      day: 1,
    });
    expect(getCafeClock(at(4, 23, 59))).toMatchObject({ day: 4, hour: 23, minute: 59 });
    expect(getCafeClock(at(5, 0))).toMatchObject({ day: 5, hour: 0, minute: 0 });
  });

  it('eine volle Stunde erscheint trotz Rundungsfehler nicht als xx:59', () => {
    expect(getCafeClock(at(0, 8) - 1e-9)).toMatchObject({ hour: 8, minute: 0 });
    expect(getCafeClock(at(2, 0) - 1e-9)).toMatchObject({ hour: 0, minute: 0 });
  });

  it('negative Zeit wird sauber umgebrochen', () => {
    expect(getCafeClock(-60)).toMatchObject({ day: -1, hour: 23, minute: 0 });
  });

  it('folgt der Spieluhr im Spiel (nachts im Zeitraffer)', () => {
    const s = createInitialState(0);
    // Halbe Zeit bis zur Öffnung: so lange läuft die Uhr mit dem Nacht-Tempo.
    const half = (nextOpeningAt(getLocation(s, 'berlin'), s.clock) - s.clock) / 2;
    const n = tick(s, (half / TIME.closedMinutesPerSec) * 1000);
    expect(n.clock).toBeCloseTo(s.clock + half, 9);
    const c = getCafeClock(n.clock);
    const expected = getCafeClock(s.clock + half);
    expect(c).toMatchObject({ day: expected.day, hour: expected.hour, minute: expected.minute });
    expect(c.night).toBeCloseTo(expected.night, 6);
  });
});

describe('Licht: Nacht-Anteil', () => {
  const c = DAY_CYCLE;

  it('tiefe Nacht zwischen nightFrom und nightTo', () => {
    expect(nightAt(c.nightFrom)).toBe(1);
    expect(nightAt((c.nightFrom + 24) / 2)).toBe(1);
    expect(nightAt(0)).toBe(1);
    expect(nightAt(c.nightTo / 2, 3)).toBe(1);
    expect(nightAt(c.nightTo)).toBe(1);
  });

  it('heller Tag zwischen dawnTo und duskFrom', () => {
    expect(nightAt(c.dawnTo)).toBe(0);
    expect(nightAt((c.dawnTo + c.duskFrom) / 2)).toBe(0);
    expect(nightAt(c.duskFrom)).toBe(0);
  });

  it('weich in Dämmerung und Morgengrauen (Mitte = halb dunkel)', () => {
    expect(nightAt((c.duskFrom + c.nightFrom) / 2)).toBeCloseTo(0.5, 9);
    expect(nightAt((c.nightTo + c.dawnTo) / 2)).toBeCloseTo(0.5, 9);
    // Abends stetig dunkler, morgens stetig heller.
    let prev = nightAt(c.duskFrom);
    for (let h = c.duskFrom + 0.25; h <= c.nightFrom; h += 0.25) {
      expect(nightAt(h)).toBeGreaterThan(prev);
      prev = nightAt(h);
    }
    prev = nightAt(c.nightTo);
    for (let h = c.nightTo + 0.25; h <= c.dawnTo; h += 0.25) {
      expect(nightAt(h)).toBeLessThan(prev);
      prev = nightAt(h);
    }
  });

  it('jeder Tag sieht gleich aus', () => {
    for (const h of [0, c.nightTo + 0.5, 12, c.duskFrom + 1, 23]) {
      expect(nightAt(h, 7)).toBeCloseTo(nightAt(h), 12);
    }
  });
});
