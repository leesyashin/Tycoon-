import { describe, expect, it } from 'vitest';
import { BALANCE } from '@data/balance';
import { HIGH_SATISFACTION } from '@data/achievements';
import { foundingStaff } from '@data/staff';
import { DEMAND_CURVE, OPENING_HOURS, TIME } from '@data/time';
import {
  createInitialState,
  getLocation,
  withLocation,
  type GameState,
  type LocationState,
} from '@core/GameState';
import { runFrame, tick } from '@core/GameLoop';
import { D } from '@core/math';
import { computeLocationRates } from '@core/customers';
import { advanceRealSeconds, applyOffline, getCheapestStation } from '@core/economy';
import { setAutoBuy } from '@core/staff';

const LOC = 'berlin';
const HOURS = OPENING_HOURS.default;
/** Stunde mit der höchsten Nachfrage in den Standard-Öffnungszeiten. */
const PEAK = Array.from({ length: HOURS.close - HOURS.open }, (_, i) => HOURS.open + i).reduce(
  (best, h) => ((DEMAND_CURVE[h] ?? 0) > (DEMAND_CURVE[best] ?? 0) ? h : best),
  HOURS.open,
);
/** Eine Stunde, zu der kein Café geöffnet haben kann. */
const NIGHT = OPENING_HOURS.earliestOpen - 1;

const fresh = (): GameState => createInitialState(0);
/** Spieluhr auf Tag 0, volle Stunde `hour` stellen. */
const at = (s: GameState, hour: number): GameState => ({ ...s, clock: hour * 60, hourMark: hour });
const loc = (s: GameState): LocationState => getLocation(s, LOC);
const patch = (s: GameState, p: Partial<LocationState>): GameState =>
  withLocation(s, LOC, { ...loc(s), ...p });

describe('tick', () => {
  it('lässt die Spieluhr laufen: geöffnet 1 Spielminute je Sekunde, nachts im Zeitraffer', () => {
    const open = at(fresh(), PEAK);
    expect(tick(open, 1000).clock).toBeCloseTo(open.clock + TIME.openMinutesPerSec, 9);
    const night = at(fresh(), NIGHT);
    expect(tick(night, 1000).clock).toBeCloseTo(night.clock + TIME.closedMinutesPerSec, 9);
    // Beim Spielstart ist noch geschlossen.
    const s = fresh();
    expect(tick(s, 1000).clock).toBeCloseTo(s.clock + TIME.closedMinutesPerSec, 9);
  });

  it('rechnet die Cafés wie advanceRealSeconds und zählt dazu die Spielzeit', () => {
    const s = at(fresh(), PEAK);
    const a = tick(s, 5000);
    const b = advanceRealSeconds(s, 5);
    expect(a.locations).toEqual(b.locations);
    expect(a.clock).toBe(b.clock);
    expect(a.hourMark).toBe(b.hourMark);
    expect(a.meta.lifetimeEarned.eq(b.meta.lifetimeEarned)).toBe(true);
    expect(a.playtimeSec).toBeCloseTo(s.playtimeSec + 5, 9);
    expect(b.playtimeSec).toBe(s.playtimeSec);
  });

  it('legt den Umsatz auf die offenen Bons; ins Geld kommt er erst beim Bezahlen', () => {
    const s = at(fresh(), PEAK);
    const r = computeLocationRates(s, LOC);
    // Eine Spielminute: weniger als ein ganzer Gast, also hat noch niemand bezahlt.
    expect(r.served / 60).toBeLessThan(1);
    const n = tick(s, 1000 / TIME.openMinutesPerSec);
    const l = loc(n);
    expect(l.till.open.toNumber()).toBeCloseTo(r.incomePerHour.toNumber() / 60, 9);
    expect(l.till.progress).toBeCloseTo(r.served / 60, 9);
    expect(l.coins.eq(loc(s).coins)).toBe(true);
    expect(n.meta.lifetimeEarned.toNumber()).toBe(0);
    expect(l.earnedThisRun.toNumber()).toBe(0);
    // Die Kosten sammeln sich bis zur vollen Stunde.
    expect(l.bills.pending.toNumber()).toBeCloseTo(
      r.goodsPerHour.add(r.wagesPerHour).add(r.rentPerHour).toNumber() / 60,
      9,
    );
  });

  it('ist pur und ignoriert negative oder ungültige Deltas', () => {
    const s = fresh();
    expect(tick(s, -500)).toBe(s);
    expect(tick(s, Number.NaN)).toBe(s);
    expect(tick(s, Infinity)).toBe(s);
    expect(tick(s, 0)).toBe(s);
    const before = structuredClone(s);
    tick(s, 60_000);
    expect(s).toEqual(before);
    expect(loc(s).coins.toNumber()).toBe(BALANCE.startCoins);
  });

  it('Zufriedenheit nähert sich geöffnet dem Ziel; nachts bleibt sie stehen', () => {
    const open = patch(at(fresh(), PEAK), { satisfaction: 10 });
    const target = computeLocationRates(open, LOC).satisfaction.target;
    let s = open;
    for (let i = 0; i < 10; i++) s = tick(s, 1000);
    const sat = loc(s).satisfaction;
    expect(sat).toBeGreaterThan(10);
    expect(Math.abs(sat - target)).toBeLessThan(Math.abs(10 - target));
    const night = patch(at(fresh(), NIGHT), { satisfaction: 10 });
    expect(loc(tick(night, 10_000)).satisfaction).toBe(10);
  });

  it('Hype verfällt, abgelaufene Boosts verschwinden', () => {
    const s = {
      ...fresh(),
      tap: { ...fresh().tap, hype: 10 },
      boosts: [
        { id: 'a', until: 1, spawnMult: 1, incomeMult: 1, speedMult: 1 },
        { id: 'b', until: 100, spawnMult: 1, incomeMult: 1, speedMult: 1 },
      ],
    };
    const n = tick(s, 2000);
    expect(n.tap.hype).toBeCloseTo(Math.max(0, 10 - 2 * BALANCE.tap.hypeDecayPerSec), 9);
    expect(n.boosts.map((b) => b.id)).toEqual(['b']);
    const empty = tick({ ...s, tap: { ...s.tap, hype: 0.1 } }, 10_000);
    expect(empty.tap.hype).toBe(0);
  });

  it('schließt abgelaufene Events ab und startet das nächste nach Plan', () => {
    const s = {
      ...fresh(),
      activeEvents: [{ id: 'heatwave', locationId: LOC, startedAt: 0, until: 1 }],
    };
    const n = tick(s, 2000);
    expect(n.activeEvents).toHaveLength(0);
    expect(n.stats.events).toBe(s.stats.events + 1);
    const due = { ...fresh(), eventSchedule: { ...fresh().eventSchedule, nextAt: 0.5 } };
    const started = tick(due, 1000);
    expect(started.activeEvents).toHaveLength(1);
    expect(started.activeEvents[0]?.locationId).toBe(due.activeLocationId);
    expect(started.eventSchedule.count).toBe(due.eventSchedule.count + 1);
    expect(started.eventSchedule.nextAt).toBeGreaterThan(started.playtimeSec);
  });

  it('zählt Sekunden mit hoher Zufriedenheit am Stück', () => {
    // Nachts ändert sich die Zufriedenheit nicht, so bleibt sie über der Schwelle.
    const high = patch(at(fresh(), NIGHT), { satisfaction: HIGH_SATISFACTION.threshold + 1 });
    const one = tick(high, 1000);
    const two = tick(one, 1000);
    expect(two.stats.highSatisfactionSec).toBeCloseTo(2, 9);
    expect(two.stats.highSatisfactionBestSec).toBeCloseTo(2, 9);
    const low = tick(patch(two, { satisfaction: HIGH_SATISFACTION.threshold - 1 }), 1000);
    expect(low.stats.highSatisfactionSec).toBe(0);
    expect(low.stats.highSatisfactionBestSec).toBeCloseTo(2, 9);
  });

  it('der Filialleiter kauft in jedem Tick automatisch', () => {
    const s = patch(at(fresh(), PEAK), {
      coins: D(1e6),
      staff: { ...foundingStaff(), manager: 1 },
    });
    const on = setAutoBuy(s, LOC, true);
    const pick = getCheapestStation(on, LOC);
    expect(pick).not.toBeNull();
    if (!pick) return;
    const before = loc(on).stations[pick.id]?.level ?? 0;
    expect(loc(tick(on, BALANCE.tickMs)).stations[pick.id]?.level).toBe(before + 1);
    // Ohne Schalter kein Kauf.
    expect(loc(tick(s, BALANCE.tickMs)).stations[pick.id]?.level).toBe(before);
  });
});

describe('runFrame', () => {
  const step = BALANCE.tickMs;

  it('führt nur volle Ticks aus und behält den Rest', () => {
    const r = runFrame(fresh(), 0.3 * step, 2.5 * step);
    expect(r.ticks).toBe(2);
    expect(r.accumulatorMs).toBeCloseTo(0.8 * step, 9);
    expect(r.lumpMs).toBe(0);
    let manual = fresh();
    for (let i = 0; i < 2; i++) manual = tick(manual, step);
    expect(r.state).toEqual(manual);
  });

  it('mehr als maxTicksPerFrame → der Rest wird wie Abwesenheit gerechnet', () => {
    const max = BALANCE.maxTicksPerFrame;
    const r = runFrame(fresh(), 0, (max + 1000) * step);
    expect(r.ticks).toBe(max);
    expect(r.lumpMs).toBe(1000 * step);
    expect(r.accumulatorMs).toBe(0);
    expect(r.state.playtimeSec).toBeCloseTo((max * step) / 1000, 6);
    let manual = fresh();
    for (let i = 0; i < max; i++) manual = tick(manual, step);
    expect(r.state).toEqual(applyOffline(manual, r.lumpMs).state);
  });

  it('negatives oder ungültiges frameMs wird geklemmt', () => {
    const r = runFrame(fresh(), 50, -1000);
    expect(r.ticks).toBe(0);
    expect(r.accumulatorMs).toBe(50);
    const nan = runFrame(fresh(), 50, Number.NaN);
    expect(nan.ticks).toBe(0);
    expect(nan.accumulatorMs).toBe(50);
  });
});
