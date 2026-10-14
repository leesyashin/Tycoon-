import { BALANCE } from '@data/balance';
import { getLocation, type GameState, type LocationState } from './GameState';
import { computeLocationRates } from './customers/rates';
import { applyOffline } from './economy/offline';
import { autoBuyStep } from './economy/actions';
import { advanceCleanliness } from './staff/effects';
import { HIGH_SATISFACTION } from '@data/achievements';

/**
 * Ein Simulationsschritt beliebiger Länge; die Rate-Formeln sind linear, die Zufriedenheit nähert sich exakt.
 * Einnahmen nutzen den Zustand zu Beginn des Schritts, danach ändern sich Sauberkeit und Zufriedenheit.
 */
export function tick(state: GameState, dtMs: number): GameState {
  const dt = Number.isFinite(dtMs) ? Math.max(0, dtMs) / 1000 : 0;
  if (dt === 0) return state;

  const locations: Record<string, LocationState> = {};
  let earnedTotal = state.meta.lifetimeEarned;
  let served = 0;
  const keep = 1 - BALANCE.satisfaction.approachPerSec;
  for (const id of Object.keys(state.locations)) {
    const loc = getLocation(state, id);
    const rates = computeLocationRates(state, id);
    const gain = rates.incomePerSec.mul(dt);
    const target = rates.satisfaction.target;
    const satisfaction = target + (loc.satisfaction - target) * keep ** dt;
    locations[id] = {
      ...loc,
      coins: loc.coins.add(gain),
      earnedThisRun: loc.earnedThisRun.add(gain),
      satisfaction,
      cleanliness: advanceCleanliness(loc, dt),
    };
    earnedTotal = earnedTotal.add(gain);
    served += rates.served * dt;
  }
  const activeSat = getLocation(state, state.activeLocationId).satisfaction;
  const highSec =
    activeSat >= HIGH_SATISFACTION.threshold ? state.stats.highSatisfactionSec + dt : 0;
  const playtimeSec = state.playtimeSec + dt;
  let next: GameState = {
    ...state,
    playtimeSec,
    locations,
    meta: { ...state.meta, lifetimeEarned: earnedTotal },
    stats: {
      ...state.stats,
      customersServed: state.stats.customersServed + served,
      highSatisfactionSec: highSec,
      highSatisfactionBestSec: Math.max(state.stats.highSatisfactionBestSec, highSec),
    },
    activeEvents: state.activeEvents.filter((e) => e.until > playtimeSec),
    boosts: state.boosts.filter((b) => b.until > playtimeSec),
    tap: { ...state.tap, hype: Math.max(0, state.tap.hype - BALANCE.tap.hypeDecayPerSec * dt) },
  };
  for (const id of Object.keys(next.locations)) next = autoBuyStep(next, id);
  return next;
}

export interface FrameResult {
  state: GameState;
  /** Verbleibende Zeit < 1 Tick, wird im nächsten Frame weiterverwendet. */
  accumulatorMs: number;
  ticks: number;
  /** Zeit, die nicht in Einzelticks simuliert, sondern als Offline-Lump gutgeschrieben wurde. */
  lumpMs: number;
}

/**
 * Treibt die Simulation mit festem Tick. Mehr als `maxTicksPerFrame` Ticks pro Frame
 * (z. B. nach Tab-Wechsel) werden nicht simuliert, sondern als Offline-Lump verrechnet.
 */
export function runFrame(state: GameState, accumulatorMs: number, frameMs: number): FrameResult {
  const delta = Number.isFinite(frameMs) ? Math.max(0, frameMs) : 0;
  const total = accumulatorMs + delta;
  const pending = Math.floor(total / BALANCE.tickMs);
  const ticks = Math.min(pending, BALANCE.maxTicksPerFrame);
  let s = state;
  for (let i = 0; i < ticks; i++) s = tick(s, BALANCE.tickMs);
  const lumpMs = (pending - ticks) * BALANCE.tickMs;
  if (lumpMs > 0) s = applyOffline(s, lumpMs).state;
  return { state: s, accumulatorMs: total - pending * BALANCE.tickMs, ticks, lumpMs };
}
