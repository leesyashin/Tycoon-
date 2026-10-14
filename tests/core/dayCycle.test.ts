import { describe, expect, it } from 'vitest';
import { getCafeClock } from '@core/time/dayCycle';
import { DAY_CYCLE } from '@data/ui';

const hourSec = DAY_CYCLE.dayLengthSec / 24;

describe('Café-Tageszeit (kosmetisch)', () => {
  it('neues Spiel beginnt um startHour, Tag', () => {
    expect(getCafeClock(0)).toEqual({ hour: DAY_CYCLE.startHour, minute: 0, night: 0 });
  });
  it('24 min Spielzeit = 1 Tag, 1 Spielsekunde = 1 Café-Minute', () => {
    expect(getCafeClock(DAY_CYCLE.dayLengthSec)).toEqual(getCafeClock(0));
    expect(getCafeClock(1).minute).toBe(1);
    expect(getCafeClock(hourSec * 3).hour).toBe(DAY_CYCLE.startHour + 3);
  });
  it('Nacht ist 1 zwischen nightFrom und nightTo, weich in der Dämmerung', () => {
    const at = (h: number) => getCafeClock((h - DAY_CYCLE.startHour + 24) * hourSec).night;
    expect(at(23)).toBe(1);
    expect(at(2)).toBe(1);
    expect(at(12)).toBe(0);
    expect(at(19.5)).toBeGreaterThan(0);
    expect(at(19.5)).toBeLessThan(1);
    expect(at(6)).toBeGreaterThan(0);
    expect(at(6)).toBeLessThan(1);
    expect(at(8)).toBe(0);
  });
  it('negative Zeit wird sauber umgebrochen', () => {
    const c = getCafeClock(-hourSec);
    expect(c.hour).toBe(DAY_CYCLE.startHour - 1);
  });
});
