import { describe, expect, it } from 'vitest';
import { BALANCE } from '@data/balance';
import { getMetaUpgradeDef } from '@data/prestige';
import { OPENING_HOURS } from '@data/time';
import { UI_CONFIG } from '@data/ui';
import { createInitialState, getLocation, type GameState } from '@core/GameState';
import { tick } from '@core/GameLoop';
import { collectModifiers } from '@core/economy';
import {
  computeLocationRates,
  getHypeProgress,
  getHypeRemaining,
  getIncomePerHour,
  getTapIncome,
  mood,
  tapCafe,
} from '@core/customers';
import { createStore } from '@core/store';

const L = 'berlin';
const fresh = (): GameState => createInitialState(0);
/** Spieluhr auf eine volle Stunde stellen; die Stunden davor gelten als abgerechnet. */
const atHour = (s: GameState, hour: number): GameState => ({
  ...s,
  clock: hour * 60,
  hourMark: hour,
});
/** Mitten in der Öffnungszeit (der Spielstart liegt kurz vor der ersten Öffnung). */
const open = (): GameState => atHour(fresh(), OPENING_HOURS.default.open + 1);

function tapN(state: GameState, n: number): GameState {
  let s = state;
  for (let i = 0; i < n; i++) s = tapCafe(s, L).state;
  return s;
}

describe('Tap-Bonus', () => {
  it('ein Tap bringt eine halbe Spielminute Umsatz', () => {
    const s = open();
    const r = tapCafe(s, L);
    const expected = getIncomePerHour(s, L)
      .mul(BALANCE.tap.incomeMinutes / 60)
      .toNumber();
    expect(expected).toBeGreaterThan(0);
    expect(r.accepted).toBe(true);
    expect(r.gained.toNumber()).toBeCloseTo(expected, 9);
    const loc = getLocation(r.state, L);
    expect(loc.coins.toNumber()).toBeCloseTo(getLocation(s, L).coins.toNumber() + expected, 9);
    expect(loc.earnedThisRun.toNumber()).toBeCloseTo(expected, 9);
    expect(r.state.meta.lifetimeEarned.toNumber()).toBeCloseTo(expected, 9);
    expect(r.state.tap.hype).toBe(1);
    expect(r.state.stats.taps).toBe(1);
  });
  it('geschlossen bringt Anfeuern kein Geld', () => {
    const s = atHour(fresh(), OPENING_HOURS.default.close % 24);
    expect(computeLocationRates(s, L).open).toBe(false);
    const r = tapCafe(s, L);
    expect(r.gained.toNumber()).toBe(0);
    expect(getLocation(r.state, L).coins.eq(getLocation(s, L).coins)).toBe(true);
  });
  it('Meta-Upgrade tapPower erhöht den Tap-Wert', () => {
    const s = open();
    const boosted = { ...s, meta: { ...s.meta, metaUpgrades: { tapPower: 2 } } };
    const base = getTapIncome(s, L).toNumber();
    expect(base).toBeGreaterThan(0);
    expect(getTapIncome(boosted, L).toNumber()).toBeCloseTo(
      base * (1 + 2 * getMetaUpgradeDef('tapPower').perLevel),
      9,
    );
  });
  it('höchstens maxPerSec Taps pro Spielsekunde', () => {
    let s = open();
    s = tapN(s, BALANCE.tap.maxPerSec);
    const r = tapCafe(s, L);
    expect(r.accepted).toBe(false);
    expect(r.state).toBe(s);
    expect(r.gained.toNumber()).toBe(0);
    // Nächste Sekunde: Fenster wird zurückgesetzt.
    const later = tick(s, 1000);
    expect(tapCafe(later, L).accepted).toBe(true);
  });
  it('voller Hype-Balken startet den Spawn-Boost', () => {
    let s = open();
    for (let i = 0; i < BALANCE.tap.hypeMax - 1; i++) {
      s = tapCafe(s, L).state;
      if ((i + 1) % BALANCE.tap.maxPerSec === 0) s = { ...s, playtimeSec: s.playtimeSec + 1 };
    }
    expect(getHypeProgress(s)).toBeCloseTo((BALANCE.tap.hypeMax - 1) / BALANCE.tap.hypeMax, 9);
    const r = tapCafe(s, L);
    expect(r.hypeTriggered).toBe(true);
    expect(r.state.tap.hype).toBe(0);
    expect(r.state.stats.hypeFills).toBe(1);
    expect(collectModifiers(r.state).spawnMult).toBe(BALANCE.tap.hypeSpawnMult);
    expect(getHypeRemaining(r.state)).toBeCloseTo(BALANCE.tap.hypeDurationSec, 9);
    // Mehr Gäste wollen kommen, und das Café fasst im Ansturm entsprechend mehr.
    const plain = (x: GameState) => computeLocationRates(x, L, { influencerHype: false });
    expect(plain(r.state).demand / plain(s).demand).toBeCloseTo(BALANCE.tap.hypeSpawnMult, 9);
    expect(plain(r.state).capacity / plain(s).capacity).toBeCloseTo(BALANCE.tap.hypeSpawnMult, 9);
    const after = tick(r.state, BALANCE.tap.hypeDurationSec * 1000 + 100);
    expect(getHypeRemaining(after)).toBe(0);
    expect(collectModifiers(after).spawnMult).toBe(1);
  });
  it('erneuter Hype verlängert statt zu stapeln', () => {
    let s = open();
    s = { ...s, tap: { ...s.tap, hype: BALANCE.tap.hypeMax - 1 } };
    s = tapCafe(s, L).state;
    s = { ...s, playtimeSec: s.playtimeSec + 5, tap: { ...s.tap, hype: BALANCE.tap.hypeMax - 1 } };
    s = tapCafe(s, L).state;
    expect(s.boosts.filter((b) => b.id === BALANCE.tap.boostId)).toHaveLength(1);
    expect(getHypeRemaining(s)).toBeCloseTo(BALANCE.tap.hypeDurationSec, 9);
  });
  it('Hype verfällt langsam und wird nie negativ', () => {
    let s = tapN(open(), 4);
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
    store.dispatch((st) => tapCafe(st, L).state);
    expect(store.getState().tap.hype).toBe(1);
    const before = seen.length;
    store.dispatch((st) => st); // keine Änderung → keine Benachrichtigung
    expect(seen.length).toBe(before);
    off();
    store.advance(1000);
    expect(seen.length).toBe(before);
  });
});

describe('Stimmung', () => {
  it('Schwellen aus UI_CONFIG.mood', () => {
    const m = UI_CONFIG.mood;
    expect(mood(100)).toBe('happy');
    expect(mood(m.happyFrom)).toBe('happy');
    expect(mood(m.happyFrom - 0.1)).toBe('neutral');
    expect(mood(m.neutralFrom)).toBe('neutral');
    expect(mood(m.neutralFrom - 0.1)).toBe('sad');
    expect(mood(0)).toBe('sad');
  });
});
