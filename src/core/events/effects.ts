import {
  getCalendarEventDef,
  getRandomEventDef,
  type EventEffect,
  type EventOverlay,
} from '@data/events';
import type { ActiveEvent, GameState } from '../GameState';

/** Summe aller Event-Wirkungen an einem Standort (Zufalls-Events dort + Kalender-Events überall). */
export interface EventModifiers {
  spawnMult: number;
  incomeMult: number;
  stationPriceMult: Record<string, number>;
  tipMult: number;
  satisfactionBonus: number;
  qualityPenalty: number;
}

export function neutralEventModifiers(): EventModifiers {
  return {
    spawnMult: 1,
    incomeMult: 1,
    stationPriceMult: {},
    tipMult: 1,
    satisfactionBonus: 0,
    qualityPenalty: 0,
  };
}

function apply(m: EventModifiers, e: EventEffect, withSpawn: boolean): void {
  if (withSpawn) m.spawnMult *= e.spawnMult ?? 1;
  m.incomeMult *= e.incomeMult ?? 1;
  m.tipMult *= e.tipMult ?? 1;
  m.satisfactionBonus += e.satisfactionBonus ?? 0;
  m.qualityPenalty += e.qualityPenalty ?? 0;
  for (const [id, mult] of Object.entries(e.stationPriceMult ?? {})) {
    m.stationPriceMult[id] = (m.stationPriceMult[id] ?? 1) * mult;
  }
}

export function isEventRunning(ev: ActiveEvent, playtimeSec: number): boolean {
  return ev.until > playtimeSec;
}

/** Der Influencer-Ansturm wirkt nur in den ersten `rushSec` Sekunden auf die Kundenzahl. */
export function isRushActive(ev: ActiveEvent, playtimeSec: number): boolean {
  const def = getRandomEventDef(ev.id);
  if (def?.rushSec === undefined) return true;
  return playtimeSec < ev.startedAt + def.rushSec;
}

export function collectEventEffects(state: GameState, locationId: string): EventModifiers {
  const m = neutralEventModifiers();
  for (const ev of state.activeEvents) {
    if (ev.locationId !== locationId || !isEventRunning(ev, state.playtimeSec)) continue;
    const def = getRandomEventDef(ev.id);
    if (def) apply(m, def.effect, isRushActive(ev, state.playtimeSec));
  }
  for (const id of state.calendarEvents) {
    const def = getCalendarEventDef(id);
    if (def) apply(m, def.effect, true);
  }
  return m;
}

/** Farbfilter der Szene am Standort: das laufende Zufalls-Event hat Vorrang vor Kalender-Events. */
export function getEventOverlay(state: GameState, locationId: string): EventOverlay | null {
  const ev = state.activeEvents.find(
    (e) => e.locationId === locationId && isEventRunning(e, state.playtimeSec),
  );
  const random = ev ? getRandomEventDef(ev.id) : undefined;
  if (random) return random.overlay;
  for (const id of state.calendarEvents) {
    const def = getCalendarEventDef(id);
    if (def) return def.overlay;
  }
  return null;
}
