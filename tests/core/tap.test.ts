import { describe, expect, it } from 'vitest';
import { BALANCE } from '@data/balance';
import { createInitialState, getLocation, type GameState } from '@core/GameState';
import { tick } from '@core/GameLoop';
import { collectModifiers } from '@core/economy';
import {
  getHypeProgress,
  getHypeRemaining,
  getIncomePerSec,
  getTapIncome,
  tapCafe,
} from '@core/customers';
import { createStore } from '@core/store';

const fresh = () => createInitialState(0);

function tapN(state: GameState, n: number): GameState {
  let s = state;
  for (let i = 0; i < n; i++) s = tapCafe(s, 'berlin').state;
  return s;
}

describe('Tap-Bonus', () => {
  it('ein Tap bringt 0.5 s Einkommen', () => {
    const s = fresh();
    const r = tapCafe(s, 'berlin');
    const expected = getIncomePerSec(s, 'berlin').mul(0.5).toNumber();
    expect(r.accepted).toBe(true);
    expect(r.gained.toNumber()).toBeCloseTo(expected, 9);
    const loc = getLocation(r.state, 'berlin');
    expect(loc.coins.toNumber()).toBeCloseTo(BALANCE.startCoins + expected, 9);
    expect(loc.earnedThisRun.toNumber()).toBeCloseTo(expected, 9);
    expect(r.state.meta.lifetimeEarned.toNumber()).toBeCloseTo(expected, 9);
    expect(r.state.tap.hype).toBe(1);
  });
  it('Meta-Upgrade tapPower erhöht den Tap-Wert', () => {
    const s = fresh();
    const boosted = { ...s, meta: { ...s.meta, metaUpgrades: { tapPower: 2 } } };
    expect(getTapIncome(boosted, 'berlin').toNumber()).toBeCloseTo(
      getTapIncome(s, 'berlin').toNumber() * 2,
      9,
    );
  });
  it('höchstens 10 Taps pro Spielsekunde', () => {
    let s = fresh();
    s = tapN(s, BALANCE.tap.maxPerSec);
    const r = tapCafe(s, 'berlin');
    expect(r.accepted).toBe(false);
    expect(r.state).toBe(s);
    expect(r.gained.toNumber()).toBe(0);
    // Nächste Sekunde: Fenster wird zurückgesetzt.
    const later = tick(s, 1000);
    expect(tapCafe(later, 'berlin').accepted).toBe(true);
  });
  it('voller Hype-Balken startet 10 s ×2 Spawn', () => {
    let s = fresh();
    for (let i = 0; i < BALANCE.tap.hypeMax - 1; i++) {
      s = tapCafe(s, 'berlin').state;
      if ((i + 1) % BALANCE.tap.maxPerSec === 0) s = { ...s, playtimeSec: s.playtimeSec + 1 };
    }
    expect(getHypeProgress(s)).toBeCloseTo((BALANCE.tap.hypeMax - 1) / BALANCE.tap.hypeMax, 9);
    const r = tapCafe(s, 'berlin');
    expect(r.hypeTriggered).toBe(true);
    expect(r.state.tap.hype).toBe(0);
    expect(collectModifiers(r.state).spawnMult).toBe(BALANCE.tap.hypeSpawnMult);
    expect(getHypeRemaining(r.state)).toBeCloseTo(BALANCE.tap.hypeDurationSec, 9);
    const after = tick(r.state, BALANCE.tap.hypeDurationSec * 1000 + 100);
    expect(getHypeRemaining(after)).toBe(0);
    expect(collectModifiers(after).spawnMult).toBe(1);
  });
  it('erneuter Hype verlängert statt zu stapeln', () => {
    let s = fresh();
    s = { ...s, tap: { ...s.tap, hype: BALANCE.tap.hypeMax - 1 } };
    s = tapCafe(s, 'berlin').state;
    s = { ...s, playtimeSec: s.playtimeSec + 5, tap: { ...s.tap, hype: BALANCE.tap.hypeMax - 1 } };
    s = tapCafe(s, 'berlin').state;
    expect(s.boosts.filter((b) => b.id === BALANCE.tap.boostId)).toHaveLength(1);
    expect(getHypeRemaining(s)).toBeCloseTo(BALANCE.tap.hypeDurationSec, 9);
  });
  it('Hype verfällt langsam und wird nie negativ', () => {
    let s = tapN(fresh(), 4);
    s = tick(s, 2000);
    expect(s.tap.hype).toBeCloseTo(4 - 2 * BALANCE.tap.hypeDecayPerSec, 9);
    s = tick(s, 60_000);
    expect(s.tap.hype).toBe(0);
  });
});

describe('Store', () => {
  it('dispatch, advance und subscribe', () => {
    const store = createStore(fresh());
    const seen: number[] = [];
    const off = store.subscribe((st) => seen.push(st.playtimeSec));
    store.advance(250);
    expect(store.getState().playtimeSec).toBeCloseTo(0.2, 9);
    store.advance(50); // Akkumulator 50 + 50 = 1 Tick
    expect(store.getState().playtimeSec).toBeCloseTo(0.3, 9);
    store.dispatch((st) => tapCafe(st, 'berlin').state);
    expect(store.getState().tap.hype).toBe(1);
    const before = seen.length;
    store.dispatch((st) => st); // keine Änderung → keine Benachrichtigung
    expect(seen.length).toBe(before);
    off();
    store.advance(1000);
    expect(seen.length).toBe(before);
  });
});
