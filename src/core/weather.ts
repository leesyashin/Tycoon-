import { CLIMATE, WEATHER, WEATHER_KINDS, type WeatherKind } from '@data/weather';
import type { GameState } from './GameState';
import { isEventRunning } from './events/effects';
import { dayOf, minuteOfDay } from './time/clock';

/** Wetter zu einer Spieluhr-Zeit (rein kosmetisch, GAME_DESIGN § 12.4). */
export interface Weather {
  kind: WeatherKind;
  /** Regenstärke 0..1: Schauer setzen sanft ein und hören sanft auf. */
  rain: number;
  /** Bewölkung 0..1. */
  clouds: number;
}

/** Tageswetter: Art und Schauer in Minuten des Tages (an trockenen Tagen leer). */
export interface DayWeather {
  kind: WeatherKind;
  showerFrom: number;
  showerTo: number;
}

/** Gleichverteilte Zahl 0..1 aus einem Text (FNV-1a), damit das Wetter je Standort und Tag feststeht. */
function hash01(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Letzte Durchmischung, damit benachbarte Tage nicht ähnlich fallen.
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4_294_967_296;
}

const smooth = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Art und Schauer eines Spieltags an einem Standort (ohne Events). */
export function dayWeather(locationId: string, day: number): DayWeather {
  const none = { showerFrom: 0, showerTo: 0 };
  if (WEATHER.firstDaySun && day <= 0) return { kind: 'sun', ...none };
  const climate = CLIMATE[locationId] ?? CLIMATE['default'];
  const roll = hash01(`${locationId}:${String(day)}`);
  let kind: WeatherKind = 'sun';
  let acc = 0;
  for (const k of WEATHER_KINDS) {
    acc += climate?.[k] ?? 0;
    if (roll < acc) {
      kind = k;
      break;
    }
  }
  if (kind !== 'rain') return { kind, ...none };
  const s = WEATHER.showerStart;
  const d = WEATHER.showerHours;
  const startHour =
    s.from + Math.floor(hash01(`${locationId}:${String(day)}:start`) * (s.to - s.from + 1));
  const hours = d.min + hash01(`${locationId}:${String(day)}:hours`) * (d.max - d.min);
  return { kind, showerFrom: startHour * 60, showerTo: Math.round((startHour + hours) * 60) };
}

/** Wetter zur Spieluhr-Zeit `clock`; `forced` (Event) gilt den ganzen Tag in voller Stärke. */
export function weatherAt(locationId: string, clock: number, forced?: WeatherKind | null): Weather {
  if (forced === 'rain') return { kind: 'rain', rain: 1, clouds: 1 };
  if (forced === 'sun') return { kind: 'sun', rain: 0, clouds: 0 };
  if (forced === 'clouds') return { kind: 'clouds', rain: 0, clouds: 1 };
  const day = dayWeather(locationId, dayOf(clock));
  if (day.kind === 'sun') return { kind: 'sun', rain: 0, clouds: 0 };
  if (day.kind === 'clouds') return { kind: 'clouds', rain: 0, clouds: 1 };
  const m = minuteOfDay(clock);
  const ramp = WEATHER.rampMinutes;
  const rain = Math.min(smooth((m - day.showerFrom) / ramp), smooth((day.showerTo - m) / ramp));
  return {
    kind: 'rain',
    rain,
    clouds: WEATHER.rainDayClouds + (1 - WEATHER.rainDayClouds) * rain,
  };
}

/** Event, das am Standort gerade läuft und das Wetter festlegt (Regentag, Hitzewelle), sonst `null`. */
export function eventWeather(state: GameState, locationId: string): WeatherKind | null {
  for (const ev of state.activeEvents) {
    if (ev.locationId !== locationId || !isEventRunning(ev, state.playtimeSec)) continue;
    const kind = WEATHER.eventWeather[ev.id];
    if (kind) return kind;
  }
  return null;
}

/** Wetter am Standort (Standard: aktives Café) jetzt. */
export function currentWeather(state: GameState, locationId = state.activeLocationId): Weather {
  return weatherAt(locationId, state.clock, eventWeather(state, locationId));
}
