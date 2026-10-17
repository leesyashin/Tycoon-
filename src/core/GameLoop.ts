import { BALANCE } from '@data/balance';
import { getLocation, type GameState } from './GameState';
import { applyOffline } from './economy/offline';
import { autoBuyStep } from './economy/actions';
import { advanceRealSeconds } from './economy/simulate';
import { HIGH_SATISFACTION } from '@data/achievements';
import { stepEvents } from './events/schedule';

/**
 * Ein Simulationsschritt über `dtMs` echte Millisekunden: Die Spieluhr läuft (geöffnet 1 Spielminute je Sekunde,
 * nachts schneller), die Cafés arbeiten in Spielzeit (`economy/simulate`), Boosts, Hype und Events laufen in
 * aktiver Spielzeit (`playtimeSec`). Der Umsatz landet zuerst auf den offenen Bons der Kasse und kommt erst ins
 * Geld, wenn ein Gast bezahlt hat; Kosten werden zu jeder vollen Spielstunde abgebucht.
 */
export function tick(state: GameState, dtMs: number): GameState {
  const dt = Number.isFinite(dtMs) ? Math.max(0, dtMs) / 1000 : 0;
  if (dt === 0) return state;

  let next = advanceRealSeconds(state, dt);
  const activeSat = getLocation(next, next.activeLocationId).satisfaction;
  const highSec =
    activeSat >= HIGH_SATISFACTION.threshold ? next.stats.highSatisfactionSec + dt : 0;
  const playtimeSec = next.playtimeSec + dt;
  next = {
    ...next,
    playtimeSec,
    stats: {
      ...next.stats,
      highSatisfactionSec: highSec,
      highSatisfactionBestSec: Math.max(next.stats.highSatisfactionBestSec, highSec),
    },
    boosts: next.boosts.filter((b) => b.until > playtimeSec),
    tap: { ...next.tap, hype: Math.max(0, next.tap.hype - BALANCE.tap.hypeDecayPerSec * dt) },
  };
  next = stepEvents(next);
  for (const id of Object.keys(next.locations)) next = autoBuyStep(next, id);
  return next;
}

export interface FrameResult {
  state: GameState;
  /** Verbleibende Zeit < 1 Tick, wird im nächsten Frame weiterverwendet. */
  accumulatorMs: number;
  ticks: number;
  /** Zeit, die nicht in Einzelticks simuliert, sondern als Offline-Lump gerechnet wurde. */
  lumpMs: number;
}

/**
 * Treibt die Simulation mit festem Tick. Mehr als `maxTicksPerFrame` Ticks pro Frame
 * (z. B. nach Tab-Wechsel) werden nicht einzeln simuliert, sondern wie Abwesenheit gerechnet.
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
