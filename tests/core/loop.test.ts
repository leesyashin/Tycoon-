import { describe, expect, it } from 'vitest';
import { BALANCE } from '@data/balance';
import { createInitialState, getLocation, withLocation } from '@core/GameState';
import { runFrame, tick } from '@core/GameLoop';
import {
  computeLocationRates,
  computeSpawnRate,
  getIncomePerSec,
  satisfactionFactor,
  tipRate,
} from '@core/customers';
import { applyOffline, getOfflineCapMs, getOfflineEfficiency } from '@core/economy';

const fresh = () => createInitialState(0);

describe('Rate-Modell', () => {
  it('Start: Spawn durch Kapazität begrenzt, Durchsatz begrenzt Bedienung', () => {
    const r = computeLocationRates(fresh(), 'berlin');
    expect(r.spawnRate).toBeCloseTo(0.2, 9); // min(0.25, 0.1×2) × (0.5+0.5)
    expect(r.totalThroughput).toBeCloseTo(0.25, 9);
    expect(r.served).toBeCloseTo(0.2, 9);
    expect(r.waitPressure).toBe(0);
  });
  it('Einkommen = bediente Kunden × Preis × (1 + Trinkgeld)', () => {
    const s = fresh();
    const r = computeLocationRates(s, 'berlin');
    expect(r.tipRate).toBeCloseTo(0.075, 9);
    expect(r.incomePerSec.toNumber()).toBeCloseTo(0.2 * 3 * 1.075, 9);
    expect(getIncomePerSec(s, 'berlin').toNumber()).toBeCloseTo(0.645, 9);
  });
  it('Warteschlange erzeugt Druck (Nachfrage > Durchsatz)', () => {
    const s = fresh();
    const loc = getLocation(s, 'berlin');
    const busy = {
      ...s,
      locations: { berlin: { ...loc, ambience: { terrace: 20 }, level: 10 } },
    };
    const r = computeLocationRates(busy, 'berlin');
    expect(r.waitPressure).toBeGreaterThan(0);
    expect(r.satisfaction.waitPressure).toBeLessThan(0);
    expect(r.served).toBeCloseTo(r.totalThroughput, 9);
  });
  it('Zufriedenheit: Faktor 0.5…1.5, Trinkgeld mit Musik', () => {
    expect(satisfactionFactor(0)).toBe(0.5);
    expect(satisfactionFactor(100)).toBe(1.5);
    const loc = { ...getLocation(fresh(), 'berlin'), satisfaction: 100, ambience: { music: 2 } };
    expect(tipRate(loc)).toBeCloseTo(0.16, 9);
  });
  it('Spawn wächst mit Café-Level, WLAN, Marketing und Events', () => {
    const base = getLocation(fresh(), 'berlin');
    const roomy = { ...base, ambience: { seats: 50 } };
    const a = computeSpawnRate(roomy);
    expect(computeSpawnRate({ ...roomy, level: 4 })).toBeGreaterThan(a);
    expect(computeSpawnRate({ ...roomy, marketing: { level: 2 } })).toBeCloseTo(a * 1.1, 9);
    expect(computeSpawnRate({ ...roomy, ambience: { seats: 50, wifi: 10 } })).toBeCloseTo(
      a * 1.3,
      9,
    );
    expect(computeSpawnRate(roomy, 2)).toBeCloseTo(a * 2, 9);
  });
  it('Zufriedenheits-Ziel wird auf 0..100 begrenzt', () => {
    const base = getLocation(fresh(), 'berlin');
    const r = computeLocationRates(
      { ...fresh(), locations: { berlin: { ...base, quality: 100, ambience: { decor: 500 } } } },
      'berlin',
    );
    expect(r.satisfaction.target).toBe(100);
  });
});

describe('tick', () => {
  it('schreibt Einkommen gut und zählt Spielzeit', () => {
    const s = tick(fresh(), 1000);
    expect(s.playtimeSec).toBeCloseTo(1, 9);
    const gained = getLocation(s, 'berlin').coins.toNumber() - BALANCE.startCoins;
    expect(gained).toBeCloseTo(0.645, 6);
    expect(s.meta.lifetimeEarned.toNumber()).toBeCloseTo(0.645, 6);
    expect(getLocation(s, 'berlin').earnedThisRun.toNumber()).toBeCloseTo(0.645, 6);
  });
  it('ist pur und ignoriert negative/ungültige Deltas', () => {
    const s = fresh();
    expect(tick(s, -500)).toBe(s);
    expect(tick(s, NaN)).toBe(s);
    expect(tick(s, 0)).toBe(s);
    expect(getLocation(s, 'berlin').coins.toNumber()).toBe(BALANCE.startCoins);
  });
  it('Zufriedenheit nähert sich dem Ziel', () => {
    let s = fresh();
    const target = computeLocationRates(s, 'berlin').satisfaction.target;
    for (let i = 0; i < 100; i++) s = tick(s, 1000);
    const sat = getLocation(s, 'berlin').satisfaction;
    expect(Math.abs(sat - target)).toBeLessThan(Math.abs(50 - target) + 1e-9);
  });
  it('entfernt abgelaufene Events und Boosts', () => {
    const s = {
      ...fresh(),
      activeEvents: [{ id: 'heatwave', locationId: 'berlin', startedAt: 0, until: 1 }],
      boosts: [{ id: 'b', until: 100, spawnMult: 1, incomeMult: 1, speedMult: 1 }],
    };
    const n = tick(s, 2000);
    expect(n.activeEvents).toHaveLength(0);
    expect(n.boosts).toHaveLength(1);
  });
  it('ein 10-s-Tick entspricht 100 × 100 ms (Einkommen, eingeschwungener Zustand)', () => {
    // Sauberkeit 100 bleibt mit Reinigung ≥ 3 konstant, Zufriedenheit steht auf ihrem Ziel (59):
    // nur dann ist das Einkommen über den Schritt konstant und die Schrittweite egal.
    const s = fresh();
    const steady = withLocation(s, 'berlin', {
      ...getLocation(s, 'berlin'),
      cleanliness: 100,
      satisfaction: 59,
      staff: { cleaner: 3 },
    });
    let a = steady;
    for (let i = 0; i < 100; i++) a = tick(a, 100);
    const b = tick(steady, 10_000);
    expect(getLocation(a, 'berlin').satisfaction).toBeCloseTo(59, 6);
    expect(getLocation(a, 'berlin').coins.toNumber()).toBeCloseTo(
      getLocation(b, 'berlin').coins.toNumber(),
      6,
    );
  });
});

describe('runFrame', () => {
  it('führt nur volle Ticks aus und behält den Rest', () => {
    const r = runFrame(fresh(), 30, 250);
    expect(r.ticks).toBe(2);
    expect(r.accumulatorMs).toBe(80);
    expect(r.lumpMs).toBe(0);
  });
  it('mehr als 1000 Ticks → Rest als Offline-Lump', () => {
    const r = runFrame(fresh(), 0, 200_000);
    expect(r.ticks).toBe(1000);
    expect(r.lumpMs).toBe(100_000);
    expect(r.state.playtimeSec).toBeCloseTo(100, 6);
    expect(getLocation(r.state, 'berlin').coins.toNumber()).toBeGreaterThan(
      getLocation(tick(fresh(), 100_000), 'berlin').coins.toNumber(),
    );
  });
  it('negatives frameMs wird geklemmt', () => {
    const r = runFrame(fresh(), 50, -1000);
    expect(r.ticks).toBe(0);
    expect(r.accumulatorMs).toBe(50);
  });
});

describe('Offline', () => {
  it('Cap 4 h, Effizienz 50 %', () => {
    const s = fresh();
    expect(getOfflineCapMs(s)).toBe(4 * 3_600_000);
    expect(getOfflineEfficiency(s)).toBe(0.5);
    const r = applyOffline(s, 10 * 3_600_000);
    expect(r.creditedMs).toBe(4 * 3_600_000);
    expect(r.earned.toNumber()).toBeCloseTo(0.645 * 4 * 3600 * 0.5, 4);
    expect(getLocation(r.state, 'berlin').coins.toNumber()).toBeCloseTo(
      BALANCE.startCoins + r.earned.toNumber(),
      4,
    );
    expect(r.state.meta.lifetimeEarned.toNumber()).toBeCloseTo(r.earned.toNumber(), 6);
  });
  it('Manager und Meta-Upgrades erhöhen Cap und Effizienz (gedeckelt)', () => {
    const s = fresh();
    const loc = getLocation(s, 'berlin');
    const upgraded = {
      ...s,
      meta: { ...s.meta, metaUpgrades: { offlineEfficiency: 100 } },
      locations: { berlin: { ...loc, staff: { manager: 100 } } },
    };
    expect(getOfflineCapMs(upgraded)).toBe(14 * 3_600_000);
    expect(getOfflineEfficiency(upgraded)).toBe(1);
  });
  it('negative oder ungültige Zeitdeltas bringen nichts', () => {
    const s = fresh();
    expect(applyOffline(s, -5000).earned.toNumber()).toBe(0);
    expect(applyOffline(s, NaN).creditedMs).toBe(0);
    expect(applyOffline(s, -5000).state).toBe(s);
  });
  it('Offline-Einnahmen gelten für alle Standorte (Kyoto ×25 Preise)', () => {
    const s = fresh();
    const loc = getLocation(s, 'berlin');
    const two = { ...s, locations: { berlin: loc, kyoto: { ...loc } } };
    const one = applyOffline(s, 3_600_000).earned.toNumber();
    expect(applyOffline(two, 3_600_000).earned.toNumber()).toBeCloseTo(26 * one, 4);
  });
});
