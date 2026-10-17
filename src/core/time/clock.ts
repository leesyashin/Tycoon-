import { OPENING_HOURS, TIME } from '@data/time';
import type { GameState, LocationState, OpeningHours } from '../GameState';

/** Minute des Tages 0..1439 einer Spieluhr-Zeit. */
export function minuteOfDay(clock: number): number {
  const m = clock % TIME.minutesPerDay;
  return m < 0 ? m + TIME.minutesPerDay : m;
}

/** Spieltag (0 = erster Tag). */
export function dayOf(clock: number): number {
  return Math.floor(clock / TIME.minutesPerDay);
}

/** Stunde des Tages 0..23. */
export function hourOf(clock: number): number {
  return Math.floor(minuteOfDay(clock) / 60);
}

/** Hat das Café zu dieser Tagesstunde geöffnet? */
export function isOpenHour(hours: OpeningHours, hour: number): boolean {
  return hour >= hours.open && hour < hours.close;
}

/** Hat das Café zur Spieluhr-Zeit `clock` geöffnet? */
export function isOpenAt(loc: LocationState, clock: number): boolean {
  return isOpenHour(loc.hours, hourOf(clock));
}

/** Geöffnete Stunden je Tag. */
export function openHoursPerDay(hours: OpeningHours): number {
  return Math.max(0, hours.close - hours.open);
}

/**
 * Spielminuten je echter Sekunde: geöffnet 1 (1 Spielstunde = 1 Minute), geschlossen schneller. Es zählt das aktive
 * Café, weil der Spieler dessen Tag sieht; alle Cafés rechnen in Spielzeit, ihre Ergebnisse hängen also nicht davon ab.
 */
export function clockSpeed(state: GameState): number {
  const loc = state.locations[state.activeLocationId];
  const open = loc ? isOpenAt(loc, state.clock) : true;
  return open ? TIME.openMinutesPerSec : TIME.closedMinutesPerSec;
}

/** Spielminuten bis zur nächsten vollen Stunde (> 0). */
export function minutesToNextHour(clock: number): number {
  const next = (Math.floor(clock / 60 + 1e-9) + 1) * 60;
  return next - clock;
}

/** Wie viele echte Sekunden ein ganzer Spieltag mit diesen Öffnungszeiten dauert. */
export function realSecondsPerDay(hours: OpeningHours): number {
  const open = openHoursPerDay(hours) * 60;
  const closed = TIME.minutesPerDay - open;
  return open / TIME.openMinutesPerSec + closed / TIME.closedMinutesPerSec;
}

/** Spielminute, zu der das Café als Nächstes öffnet (oder `clock`, wenn es gerade geöffnet hat). */
export function nextOpeningAt(loc: LocationState, clock: number): number {
  if (isOpenAt(loc, clock)) return clock;
  const day = dayOf(clock);
  const today = day * TIME.minutesPerDay + loc.hours.open * 60;
  return today > clock ? today : today + TIME.minutesPerDay;
}

/** Gültige Öffnungszeiten (ganze Stunden, Grenzen und Mindestdauer aus `OPENING_HOURS`). */
export function clampHours(h: OpeningHours): OpeningHours {
  const o = OPENING_HOURS;
  // Kaputte Werte (NaN, ±∞) fallen auf die Standardzeiten zurück.
  const wantOpen = Number.isFinite(h.open) ? h.open : o.default.open;
  const wantClose = Number.isFinite(h.close) ? h.close : o.default.close;
  const open = Math.min(o.latestOpen, Math.max(o.earliestOpen, Math.round(wantOpen)));
  const close = Math.min(
    o.latestClose,
    Math.max(o.earliestClose, open + o.minHours, Math.round(wantClose)),
  );
  return { open, close };
}
