import { CALENDAR_EVENTS, type CalendarEventDef } from '@data/events';
import type { GameState } from '../GameState';

const MS_PER_MIN = 60_000;

/** Liegt (Monat, Tag) im Bereich? Ein Ende vor dem Start läuft über den Jahreswechsel. */
function inRange(def: CalendarEventDef, month: number, day: number): boolean {
  const key = month * 100 + day;
  const from = def.from.month * 100 + def.from.day;
  const to = def.to.month * 100 + def.to.day;
  return from <= to ? key >= from && key <= to : key >= from || key <= to;
}

/** Laufende Kalender-Events am lokalen Datum; `tzOffsetMin` wie `Date#getTimezoneOffset()`. */
export function calendarEventsAt(now: number, tzOffsetMin: number): string[] {
  const d = new Date(now - tzOffsetMin * MS_PER_MIN);
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return CALENDAR_EVENTS.filter((e) => inRange(e, month, day)).map((e) => e.id);
}

/** Gibt dieselbe Referenz zurück, wenn sich nichts ändert (UI vergleicht Zustände). */
export function refreshCalendarEvents(
  state: GameState,
  now: number,
  tzOffsetMin: number,
): GameState {
  const ids = calendarEventsAt(now, tzOffsetMin);
  const same =
    ids.length === state.calendarEvents.length &&
    ids.every((id, i) => state.calendarEvents[i] === id);
  return same ? state : { ...state, calendarEvents: ids };
}
