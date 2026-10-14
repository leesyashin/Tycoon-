import { BALANCE } from '@data/balance';
import { EVENT_CONFIG, RANDOM_EVENTS, getRandomEventDef, type RandomEventDef } from '@data/events';
import {
  getLocation,
  grantLeaves,
  withLocation,
  type ActiveEvent,
  type GameState,
} from '../GameState';
import { rng } from '../math/random';
import { D, type Decimal } from '../math/bignum';
import { computeLocationRates } from '../customers/rates';

export interface EventDraw {
  def: RandomEventDef;
  durationSec: number;
  /** Abstand bis zum übernächsten Event (Start zu Start). */
  intervalSec: number;
}

/** Das `count`-te Event aus `seed` – gleicher Seed, gleiche Folge (testbar, nicht per Neuladen umwürfelbar). */
export function drawEvent(seed: number, count: number): EventDraw {
  const rand = rng((seed + Math.imul(count + 1, 0x9e3779b1)) >>> 0);
  const total = RANDOM_EVENTS.reduce((a, e) => a + e.weight, 0);
  let roll = rand() * total;
  let def = RANDOM_EVENTS[RANDOM_EVENTS.length - 1] as RandomEventDef;
  for (const e of RANDOM_EVENTS) {
    roll -= e.weight;
    if (roll < 0) {
      def = e;
      break;
    }
  }
  const c = EVENT_CONFIG;
  const randomDuration = c.durationMinSec + rand() * (c.durationMaxSec - c.durationMinSec);
  const intervalSec = c.intervalMinSec + rand() * (c.intervalMaxSec - c.intervalMinSec);
  return { def, durationSec: def.durationSec ?? randomDuration, intervalSec };
}

/** Startet das nächste geplante Event am aktiven Standort. */
export function startNextEvent(state: GameState): GameState {
  const sch = state.eventSchedule;
  const draw = drawEvent(sch.seed, sch.count);
  const ev: ActiveEvent = {
    id: draw.def.id,
    locationId: state.activeLocationId,
    startedAt: state.playtimeSec,
    until: state.playtimeSec + draw.durationSec,
  };
  return {
    ...state,
    activeEvents: [...state.activeEvents, ev],
    eventSchedule: { ...sch, count: sch.count + 1, nextAt: state.playtimeSec + draw.intervalSec },
  };
}

/** Beendet ein Event: Zähler, Belohnung (wenn verdient), Nachwirkung am Standort. */
function finishEvent(state: GameState, index: number, rewarded: boolean): GameState {
  const ev = state.activeEvents[index];
  if (!ev) return state;
  const def = getRandomEventDef(ev.id);
  let s: GameState = {
    ...state,
    activeEvents: state.activeEvents.filter((_, i) => i !== index),
  };
  if (!def) return s;
  s = { ...s, stats: { ...s.stats, events: s.stats.events + 1 } };
  if (def.endSatisfaction && s.locations[ev.locationId]) {
    const loc = getLocation(s, ev.locationId);
    const satisfaction = Math.min(100, Math.max(0, loc.satisfaction + def.endSatisfaction));
    s = withLocation(s, ev.locationId, { ...loc, satisfaction });
  }
  return rewarded ? grantLeaves(s, def.reward) : s;
}

/** Abgelaufene Events abschließen. Behebbare Events (Lieferengpass) bringen ohne Beheben nichts. */
export function settleEvents(state: GameState): GameState {
  let s = state;
  for (let i = s.activeEvents.length - 1; i >= 0; i--) {
    const ev = s.activeEvents[i];
    if (!ev || ev.until > s.playtimeSec) continue;
    s = finishEvent(s, i, getRandomEventDef(ev.id)?.resolve === undefined);
  }
  return s;
}

/** Pro Tick: Abgelaufenes abschließen, dann ggf. das nächste Event starten (immer nur eins zur Zeit). */
export function stepEvents(state: GameState): GameState {
  let s = state.activeEvents.length > 0 ? settleEvents(state) : state;
  if (s.playtimeSec >= s.eventSchedule.nextAt && s.activeEvents.length === 0) {
    s = startNextEvent(s);
  }
  return s;
}

/**
 * Offline (und beim Tab-Lump) steht die Spielzeit still, Events laufen aber in Echtzeit weiter:
 * ihre Restzeit sinkt um die Abwesenheit, Abgelaufenes wird beim Laden abgeschlossen.
 */
export function advanceEventsOffline(state: GameState, elapsedSec: number): GameState {
  if (state.activeEvents.length === 0 || !(elapsedSec > 0)) return state;
  const activeEvents = state.activeEvents.map((e) => ({
    ...e,
    startedAt: e.startedAt - elapsedSec,
    until: e.until - elapsedSec,
  }));
  return settleEvents({ ...state, activeEvents });
}

/** Kosten, um ein behebbares Event sofort zu beenden; `null`, wenn es nicht behebbar ist. */
export function getEventResolveCost(state: GameState, index: number): Decimal | null {
  const ev = state.activeEvents[index];
  const def = ev && getRandomEventDef(ev.id);
  if (!ev || !def?.resolve || !state.locations[ev.locationId]) return null;
  const income = computeLocationRates(state, ev.locationId).incomePerSec;
  const floor = D(BALANCE.startCoins);
  const cost = income.mul(def.resolve.incomeSec);
  return cost.lt(floor) ? floor : cost;
}

/** Lieferengpass beheben: Münzen des Standorts zahlen, Event endet sofort mit Belohnung. */
export function resolveEvent(state: GameState, index: number): GameState {
  const cost = getEventResolveCost(state, index);
  const ev = state.activeEvents[index];
  if (!cost || !ev || ev.until <= state.playtimeSec) return state;
  const loc = getLocation(state, ev.locationId);
  if (loc.coins.lt(cost)) return state;
  const paid = withLocation(state, ev.locationId, { ...loc, coins: loc.coins.sub(cost) });
  return finishEvent(paid, index, true);
}
