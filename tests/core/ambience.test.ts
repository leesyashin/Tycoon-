import { describe, expect, it } from 'vitest';
import { createInitialState, getLocation, withLocation, type GameState } from '@core/GameState';
import { buyAmbience, getAmbienceCost, getNextAmbienceCost, isAmbienceMaxed } from '@core/economy';
import { computeLocationRates } from '@core/customers';
import { updateSettings } from '@core/settings';
import { clearSave, saveGame, SAVE_KEY, type StorageLike } from '@core/save';
import { D } from '@core/math';
import { AMBIENCE, getAmbienceDef } from '@data/ambience';

const rich = (coins = 1e9): GameState => {
  const s = createInitialState(0);
  return withLocation(s, 'berlin', { ...getLocation(s, 'berlin'), coins: D(coins) });
};

describe('Ambiente', () => {
  it('Kosten folgen base × g^level × Standort-Skalierung', () => {
    const seats = getAmbienceDef('seats');
    expect(getAmbienceCost(seats, 0, 'berlin').toNumber()).toBeCloseTo(50);
    expect(getAmbienceCost(seats, 2, 'berlin').toNumber()).toBeCloseTo(50 * 1.15 ** 2);
    expect(getAmbienceCost(seats, 0, 'kyoto').toNumber()).toBeCloseTo(50 * 25);
  });

  it('Kauf zieht Münzen ab und erhöht das Level', () => {
    const s = buyAmbience(rich(100), 'berlin', 'seats');
    const loc = getLocation(s, 'berlin');
    expect(loc.ambience['seats']).toBe(1);
    expect(loc.coins.toNumber()).toBeCloseTo(50);
    expect(getNextAmbienceCost(s, 'berlin', 'seats').toNumber()).toBeCloseTo(57.5);
  });

  it('ohne Geld passiert nichts', () => {
    const s = rich(10);
    expect(buyAmbience(s, 'berlin', 'decor')).toBe(s);
  });

  it('Max-Level wird nicht überschritten', () => {
    let s = rich(1e12);
    for (let i = 0; i < 5; i++) s = buyAmbience(s, 'berlin', 'terrace');
    expect(getLocation(s, 'berlin').ambience['terrace']).toBe(getAmbienceDef('terrace').maxLevel);
    expect(isAmbienceMaxed(s, 'berlin', 'terrace')).toBe(true);
    expect(buyAmbience(s, 'berlin', 'terrace')).toBe(s);
  });

  it('gesperrte Elemente sind nicht kaufbar', () => {
    const s = rich();
    const locked = withLocation(s, 'berlin', { ...getLocation(s, 'berlin'), level: 0 });
    expect(buyAmbience(locked, 'berlin', 'seats')).toBe(locked);
  });

  it('jedes Element hat gültige Werte', () => {
    for (const a of AMBIENCE) {
      expect(a.growth).toBeGreaterThan(1);
      expect(a.maxLevel).toBeGreaterThan(0);
    }
    expect(() => getAmbienceDef('nope')).toThrow();
  });
});

describe('Einnahmen je Station', () => {
  it('summieren sich zum Gesamteinkommen', () => {
    const s = createInitialState(0);
    const r = computeLocationRates(s, 'berlin');
    const sum = Object.values(r.perStationIncome).reduce((a, b) => a.add(b), D(0));
    expect(sum.toNumber()).toBeCloseTo(r.incomePerSec.toNumber());
    expect(r.perStationIncome['matchaBar']?.gt(0)).toBe(true);
  });
});

describe('Settings', () => {
  it('ändert nur die übergebenen Felder', () => {
    const s = createInitialState(0, 'de');
    const n = updateSettings(s, { numberFormat: 'scientific' });
    expect(n.settings).toEqual({ ...s.settings, numberFormat: 'scientific' });
    expect(s.settings.numberFormat).toBe('short');
  });
});

describe('clearSave', () => {
  it('entfernt aktuellen und alte Schlüssel', () => {
    const data = new Map<string, string>();
    const storage: StorageLike = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => data.set(k, v),
      removeItem: (k) => data.delete(k),
    };
    saveGame(storage, createInitialState(0), 1);
    data.set('mce.save.v1', '{}');
    expect(data.has(SAVE_KEY)).toBe(true);
    clearSave(storage);
    expect(data.size).toBe(0);
  });
});
