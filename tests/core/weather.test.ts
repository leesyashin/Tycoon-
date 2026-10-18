import { describe, expect, it } from 'vitest';
import { createInitialState, type GameState } from '@core/GameState';
import { currentWeather, dayWeather, eventWeather, weatherAt } from '@core/weather';
import { CLIMATE, WEATHER, WEATHER_KINDS, type WeatherKind } from '@data/weather';
import { LOCATIONS } from '@data/locations';
import { RANDOM_EVENTS } from '@data/events';
import { TIME } from '@data/time';

const DAY = TIME.minutesPerDay;
const at = (day: number, hour: number, minute = 0): number => day * DAY + hour * 60 + minute;

/** Ein Regentag am Standort (nach Tag 0). */
function rainDay(loc: string): number {
  for (let d = 1; d < 500; d++) if (dayWeather(loc, d).kind === 'rain') return d;
  throw new Error('kein Regentag');
}

describe('Wetter (kosmetisch)', () => {
  it('jedes Klima summiert sich zu 1, jeder Standort hat eins', () => {
    for (const c of Object.values(CLIMATE)) {
      const sum = WEATHER_KINDS.reduce((a, k) => a + c[k], 0);
      expect(sum).toBeCloseTo(1, 9);
    }
    for (const l of LOCATIONS) expect(CLIMATE[l.id]).toBeDefined();
  });

  it('steht je Standort und Spieltag fest; der erste Tag ist sonnig', () => {
    expect(dayWeather('berlin', 0).kind).toBe('sun');
    for (let d = 0; d < 40; d++) expect(dayWeather('berlin', d)).toEqual(dayWeather('berlin', d));
    // Über viele Tage etwa die Anteile des Klimas, und die Tage unterscheiden sich.
    const n = 4000;
    const count: Record<WeatherKind, number> = { sun: 0, clouds: 0, rain: 0 };
    for (let d = 1; d <= n; d++) count[dayWeather('berlin', d).kind]++;
    const berlin = CLIMATE['berlin'];
    if (!berlin) throw new Error('kein Klima');
    for (const k of WEATHER_KINDS) expect(count[k] / n).toBeCloseTo(berlin[k], 1);
    // Andere Stadt, anderes Wetter am selben Tag (nicht immer gleich).
    let differs = 0;
    for (let d = 1; d <= 60; d++)
      if (dayWeather('berlin', d).kind !== dayWeather('kyoto', d).kind) differs++;
    expect(differs).toBeGreaterThan(10);
  });

  it('Regentage haben einen Schauer, der sanft einsetzt und aufhört', () => {
    const d = rainDay('berlin');
    const w = dayWeather('berlin', d);
    expect(w.showerFrom).toBeGreaterThanOrEqual(WEATHER.showerStart.from * 60);
    expect(w.showerFrom).toBeLessThanOrEqual(WEATHER.showerStart.to * 60);
    expect(w.showerTo - w.showerFrom).toBeGreaterThanOrEqual(WEATHER.showerHours.min * 60 - 1);
    expect(w.showerTo - w.showerFrom).toBeLessThanOrEqual(WEATHER.showerHours.max * 60 + 1);
    const day = d * DAY;
    // Vor dem Schauer trocken, aber bewölkt; mitten drin voller Regen; danach wieder trocken.
    expect(weatherAt('berlin', day + w.showerFrom - 1)).toMatchObject({ kind: 'rain', rain: 0 });
    expect(weatherAt('berlin', day + w.showerFrom - 1).clouds).toBeCloseTo(
      WEATHER.rainDayClouds,
      9,
    );
    const mid = weatherAt('berlin', day + (w.showerFrom + w.showerTo) / 2);
    expect(mid.rain).toBeCloseTo(1, 9);
    expect(mid.clouds).toBeCloseTo(1, 9);
    expect(weatherAt('berlin', day + w.showerTo + 1).rain).toBe(0);
    // Sanft: kein Sprung von Minute zu Minute.
    let prev = 0;
    for (let m = w.showerFrom - 5; m <= w.showerTo + 5; m++) {
      const r = weatherAt('berlin', day + m).rain;
      expect(Math.abs(r - prev)).toBeLessThan(0.1);
      prev = r;
    }
  });

  it('Sonnen- und Wolkentage regnen nie', () => {
    for (let d = 0; d < 60; d++) {
      const k = dayWeather('bali', d).kind;
      if (k === 'rain') continue;
      for (let h = 0; h < 24; h += 3) {
        const w = weatherAt('bali', at(d, h));
        expect(w.rain).toBe(0);
        expect(w.clouds).toBe(k === 'clouds' ? 1 : 0);
      }
    }
  });

  it('Events legen das Wetter fest: Regentag regnet durchgehend, Hitzewelle ist sonnig', () => {
    expect(weatherAt('berlin', at(5, 9), 'rain')).toEqual({ kind: 'rain', rain: 1, clouds: 1 });
    expect(weatherAt('berlin', at(rainDay('berlin'), 12), 'sun')).toEqual({
      kind: 'sun',
      rain: 0,
      clouds: 0,
    });
    const s0 = createInitialState(0);
    const withEvent = (id: string, startedAt: number, until: number): GameState => ({
      ...s0,
      playtimeSec: 100,
      activeEvents: [{ id, locationId: 'berlin', startedAt, until }],
    });
    expect(RANDOM_EVENTS.some((e) => e.id === 'rainyDay')).toBe(true);
    expect(eventWeather(withEvent('rainyDay', 50, 400), 'berlin')).toBe('rain');
    expect(currentWeather(withEvent('rainyDay', 50, 400))).toMatchObject({ kind: 'rain', rain: 1 });
    expect(eventWeather(withEvent('heatwave', 50, 400), 'berlin')).toBe('sun');
    // Vorbei oder an einem anderen Standort: das normale Wetter gilt.
    expect(eventWeather(withEvent('rainyDay', 10, 60), 'berlin')).toBeNull();
    expect(eventWeather(withEvent('rainyDay', 50, 400), 'kyoto')).toBeNull();
    expect(eventWeather(withEvent('foodBlogger', 50, 400), 'berlin')).toBeNull();
    expect(currentWeather(s0)).toEqual(weatherAt('berlin', s0.clock));
  });
});
