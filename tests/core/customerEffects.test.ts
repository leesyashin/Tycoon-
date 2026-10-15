import { describe, expect, it } from 'vitest';
import { CUSTOMER_EFFECTS } from '@data/customerTypes';
import { createInitialState, getLocation, withLocation, type GameState } from '@core/GameState';
import { D } from '@core/math';
import { applyOffline } from '@core/economy';
import {
  computeLocationRates,
  customerTypeShares,
  influencerHypeMult,
  regularTipMult,
  stationDemandWeight,
  tipRate,
  tipSatisfactionTerm,
} from '@core/customers';

/** Café mit Matcha-Bar, Kasse und Merch-Regal an `locationId`. */
const withMerch = (locationId: string): GameState => {
  const s = createInitialState(0);
  const base = getLocation(s, 'berlin');
  return withLocation(s, locationId, {
    ...base,
    coins: D(0),
    level: 10,
    stations: {
      ...base.stations,
      matchaBar: { level: 20, unlocked: true },
      checkout: { level: 40, unlocked: true },
      merchShelf: { level: 20, unlocked: true },
    },
  });
};

describe('Kundentypen-Effekte (GAME_DESIGN § 7.5)', () => {
  it('Kritiker zählen die Abweichung der Zufriedenheit doppelt, ohne negatives Trinkgeld', () => {
    expect(tipSatisfactionTerm(80, 0)).toBeCloseTo(0.8, 9);
    // Beim neutralen Wert ändern Kritiker nichts.
    expect(tipSatisfactionTerm(50, 1)).toBeCloseTo(0.5, 9);
    expect(tipSatisfactionTerm(100, 1)).toBeCloseTo(1.5, 9);
    expect(tipSatisfactionTerm(20, 1)).toBe(0);
    expect(tipSatisfactionTerm(90, 0.05)).toBeCloseTo(0.95 * 0.9 + 0.05 * 1.3, 9);
  });
  it('Stammgäste geben +10 % Trinkgeld', () => {
    expect(regularTipMult(0)).toBe(1);
    expect(regularTipMult(1)).toBeCloseTo(1 + CUSTOMER_EFFECTS.regularTipBonus, 9);
    const loc = { ...getLocation(createInitialState(0), 'berlin'), satisfaction: 50 };
    expect(tipRate(loc)).toBeCloseTo(0.075 * regularTipMult(customerTypeShares('berlin').regular));
  });
  it('Influencer-Hype: Anteil der Zeit mit Hype, höchstens ×1.5', () => {
    expect(influencerHypeMult(0)).toBe(1);
    expect(influencerHypeMult(-1)).toBe(1);
    expect(influencerHypeMult(1000)).toBeCloseTo(CUSTOMER_EFFECTS.influencerHype.spawnMult, 9);
    // Ein Influencer alle 5 s → 1 − 1/e der Zeit Hype.
    expect(influencerHypeMult(0.2)).toBeCloseTo(1 + 0.5 * (1 - Math.exp(-1)), 9);
    expect(influencerHypeMult(0.5)).toBeGreaterThan(influencerHypeMult(0.1));
  });
  it('Touristen ziehen Kunden zum Merch-Regal', () => {
    expect(stationDemandWeight('matchaBar', 1)).toBe(1);
    expect(stationDemandWeight(CUSTOMER_EFFECTS.merchStationId, 0.25)).toBeCloseTo(1.125, 9);
    const r = computeLocationRates(withMerch('berlin'), 'berlin');
    const total = Object.values(r.perStation).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(r.served, 9);
    // Bali hat fast doppelt so viele Touristen: größerer Merch-Anteil bei gleichen Stationen.
    const bali = computeLocationRates(withMerch('bali'), 'bali');
    const share = (x: typeof r): number => (x.perStation['merchShelf'] ?? 0) / x.served;
    expect(customerTypeShares('bali').tourist).toBeGreaterThan(
      customerTypeShares('berlin').tourist,
    );
    expect(share(bali)).toBeGreaterThan(share(r));
  });
  it('Tokio (mehr Influencer) hat mehr Hype als Berlin bei gleichem Café', () => {
    const berlin = computeLocationRates(withMerch('berlin'), 'berlin');
    const tokyo = computeLocationRates(withMerch('tokyo'), 'tokyo');
    expect(tokyo.influencerHypeMult).toBeGreaterThan(berlin.influencerHypeMult);
    expect(berlin.influencerHypeMult).toBeGreaterThan(1);
  });
  it('Influencer-Hype hebt nur die Nachfrage und zählt offline nicht (5-s-Boost)', () => {
    // Viele Sitzplätze: Nachfrage begrenzt, also wirkt der Hype.
    const st = withMerch('berlin');
    const roomy = withLocation(st, 'berlin', {
      ...getLocation(st, 'berlin'),
      ambience: { seats: 200 },
    });
    const on = computeLocationRates(roomy, 'berlin');
    const off = computeLocationRates(roomy, 'berlin', { influencerHype: false });
    expect(on.influencerHypeMult).toBeGreaterThan(1);
    expect(off.influencerHypeMult).toBe(1);
    expect(on.spawnRate).toBeCloseTo(off.spawnRate * on.influencerHypeMult, 9);
    const r = applyOffline(roomy, 3_600_000);
    expect(r.earned.toNumber()).toBeCloseTo(off.incomePerSec.toNumber() * 3600 * 0.5, 3);
  });
});
