import { describe, expect, it } from 'vitest';
import { getAmbienceDef } from '@data/ambience';
import { BALANCE } from '@data/balance';
import { CUSTOMER_EFFECTS } from '@data/customerTypes';
import { BOOST_RULES } from '@data/leaves';
import { getStaffDef } from '@data/staff';
import { getStationDef } from '@data/stations';
import { OPENING_HOURS, TIME } from '@data/time';
import {
  createInitialState,
  createLocationState,
  getLocation,
  withLocation,
  type GameState,
  type LocationState,
} from '@core/GameState';
import { applyOffline, computeCafeLevel, getOfflineEfficiency, menuTier } from '@core/economy';
import {
  attachMult,
  computeLocationRates,
  customerTypeShares,
  influencerHypeMult,
  regularTipMult,
  tipRate,
  tipSatisfactionTerm,
  type LocationRates,
} from '@core/customers';

/** Eine volle Stunde mitten in der Öffnungszeit bzw. die erste geschlossene. */
const OPEN_HOUR = OPENING_HOURS.default.open + 1;
const CLOSED_HOUR = OPENING_HOURS.default.close % 24;

/**
 * Café mit Matcha-Station, Kasse und Kuchenvitrine auf Höchstlevel an `locationId`, volles Service-Personal
 * (reichlich Durchsatz), `seats` Tische; die Spieluhr steht mitten in der Öffnungszeit.
 */
const withMerch = (locationId: string, seats = getAmbienceDef('seats').startLevel): GameState => {
  const s = createInitialState(0);
  const base = createLocationState(locationId);
  const stations = { ...base.stations };
  for (const id of ['matchaStation', 'register', CUSTOMER_EFFECTS.touristStationId]) {
    stations[id] = { level: getStationDef(id).maxLevel, unlocked: true };
  }
  const staff: Record<string, number> = {};
  for (const id of ['cashier', 'barista', 'waiter']) staff[id] = getStaffDef(id).maxLevel;
  const loc: LocationState = { ...base, stations, staff, ambience: { ...base.ambience, seats } };
  return withLocation({ ...s, clock: OPEN_HOUR * 60, hourMark: OPEN_HOUR }, locationId, {
    ...loc,
    level: computeCafeLevel(loc),
  });
};
const tierAttach = (id: string): number => {
  const def = getStationDef(id);
  return menuTier(def, def.maxLevel)?.attach ?? NaN;
};

describe('Kundentypen-Effekte (GAME_DESIGN § 7.5)', () => {
  it('Kritiker zählen die Abweichung der Zufriedenheit doppelt, ohne negatives Trinkgeld', () => {
    const neutral = BALANCE.satisfaction.base / 100;
    const w = CUSTOMER_EFFECTS.criticSatisfactionWeight;
    expect(w).toBeGreaterThan(1);
    expect(tipSatisfactionTerm(80, 0)).toBeCloseTo(0.8, 9);
    // Beim neutralen Wert ändern Kritiker nichts.
    expect(tipSatisfactionTerm(neutral * 100, 1)).toBeCloseTo(neutral, 9);
    expect(tipSatisfactionTerm(100, 1)).toBeCloseTo(neutral + (1 - neutral) * w, 9);
    expect(tipSatisfactionTerm(0, 1)).toBe(0);
    const critics = 0.05;
    expect(tipSatisfactionTerm(90, critics)).toBeCloseTo(
      (1 - critics) * 0.9 + critics * (neutral + (0.9 - neutral) * w),
      9,
    );
  });
  it('Stammgäste geben mehr Trinkgeld', () => {
    const bonus = CUSTOMER_EFFECTS.regularTipBonus;
    expect(bonus).toBeGreaterThan(0);
    expect(regularTipMult(0)).toBe(1);
    expect(regularTipMult(1)).toBeCloseTo(1 + bonus, 9);
    const t = BALANCE.tips;
    const base = getLocation(createInitialState(0), 'berlin');
    const loc: LocationState = {
      ...base,
      satisfaction: 70,
      ambience: { ...base.ambience, music: 2 },
    };
    for (const id of ['berlin', 'kyoto', 'newyork']) {
      const sh = customerTypeShares(id);
      expect(tipRate(loc, id), id).toBeCloseTo(
        (tipSatisfactionTerm(70, sh.critic) * t.satisfactionFactor + 2 * t.perMusicLevel) *
          regularTipMult(sh.regular),
        9,
      );
    }
  });
  it('das Trinkgeld landet obendrauf im Umsatz', () => {
    // Ohne Bedienung gibt es kein Trinkgeld am Tisch: die Quote ist die der Gäste.
    const s = createInitialState(0);
    const r = computeLocationRates(s, 'berlin', { hour: OPEN_HOUR });
    expect(r.tableServiceShare).toBe(0);
    expect(r.tipRate).toBeCloseTo(tipRate(getLocation(s, 'berlin'), 'berlin'), 9);
    const sales = r.incomePerHour.sub(r.tipsPerHour).toNumber();
    expect(r.tipsPerHour.toNumber()).toBeCloseTo(sales * r.tipRate, 9);
  });
  it('Influencer-Hype: Anteil der Zeit mit Hype, höchstens × spawnMult', () => {
    const h = CUSTOMER_EFFECTS.influencerHype;
    expect(influencerHypeMult(0)).toBe(1);
    expect(influencerHypeMult(-1)).toBe(1);
    expect(influencerHypeMult(Number.NaN)).toBe(1);
    expect(influencerHypeMult(1000)).toBeCloseTo(h.spawnMult, 9);
    // Im Schnitt ein Influencer je Hype-Dauer → 1 − 1/e der Zeit Hype.
    expect(influencerHypeMult(1 / h.durationSec)).toBeCloseTo(
      1 + (h.spawnMult - 1) * (1 - Math.exp(-1)),
      9,
    );
    expect(influencerHypeMult(0.5)).toBeGreaterThan(influencerHypeMult(0.1));
  });
  it('Touristen greifen eher zur Kuchenvitrine', () => {
    const matcha = getStationDef('matchaStation');
    const vitrine = getStationDef(CUSTOMER_EFFECTS.touristStationId);
    expect(attachMult(matcha, 1)).toBe(1);
    expect(attachMult(vitrine, 0)).toBe(1);
    expect(attachMult(vitrine, 0.25)).toBeCloseTo(
      1 + CUSTOMER_EFFECTS.touristAttachBonus * 0.25,
      9,
    );
    const r = computeLocationRates(withMerch('berlin'), 'berlin');
    expect(r.served).toBeGreaterThan(0);
    // Matcha nach der Karte (manche nehmen zwei), die Vitrine mit dem Touristen-Faktor des Standorts.
    expect(r.perStation['matchaStation']).toBeCloseTo(r.served * tierAttach('matchaStation'), 9);
    expect(r.perStation[vitrine.id]).toBeCloseTo(
      r.served * tierAttach(vitrine.id) * attachMult(vitrine, customerTypeShares('berlin').tourist),
      9,
    );
    // Bali hat fast doppelt so viele Touristen: größerer Vitrinen-Anteil bei gleicher Ausstattung.
    const bali = computeLocationRates(withMerch('bali'), 'bali');
    const share = (x: LocationRates): number => (x.perStation[vitrine.id] ?? 0) / x.served;
    expect(customerTypeShares('bali').tourist).toBeGreaterThan(
      customerTypeShares('berlin').tourist,
    );
    expect(share(bali)).toBeGreaterThan(share(r));
  });
  it('Tokio (mehr Influencer) hat mehr Hype als Berlin bei gleichem Café', () => {
    const berlin = computeLocationRates(withMerch('berlin'), 'berlin');
    const tokyo = computeLocationRates(withMerch('tokyo'), 'tokyo');
    expect(customerTypeShares('tokyo').influencer).toBeGreaterThan(
      customerTypeShares('berlin').influencer,
    );
    expect(tokyo.influencerHypeMult).toBeGreaterThan(berlin.influencerHypeMult);
    expect(berlin.influencerHypeMult).toBeGreaterThan(1);
  });
  it('Influencer-Hype hebt nur die Nachfrage, nicht die Plätze', () => {
    // Viele Tische: die Nachfrage begrenzt, also kommen mit Hype mehr Gäste.
    const roomy = withMerch('berlin', getAmbienceDef('seats').maxLevel);
    const on = computeLocationRates(roomy, 'berlin');
    const off = computeLocationRates(roomy, 'berlin', { influencerHype: false });
    expect(on.influencerHypeMult).toBeGreaterThan(1);
    expect(off.influencerHypeMult).toBe(1);
    expect(on.demand).toBeCloseTo(off.demand * on.influencerHypeMult, 9);
    expect(on.capacity).toBe(off.capacity);
    expect(on.spawnRate).toBeLessThan(on.capacity);
    expect(on.spawnRate).toBeCloseTo(off.spawnRate * on.influencerHypeMult, 9);
    // Ein volles Café (ohne Tische nur Mitnahme) bekommt durch den Hype keine Plätze dazu.
    const full = withMerch('berlin', 0);
    const fullOn = computeLocationRates(full, 'berlin');
    const fullOff = computeLocationRates(full, 'berlin', { influencerHype: false });
    expect(fullOff.demand).toBeGreaterThan(fullOff.capacity);
    expect(fullOn.spawnRate).toBe(fullOff.capacity);
  });
  it('kein Hype, wenn das Café geschlossen hat oder Boosts schon am Deckel sind', () => {
    const roomy = withMerch('berlin', getAmbienceDef('seats').maxLevel);
    expect(computeLocationRates(roomy, 'berlin', { hour: CLOSED_HOUR }).influencerHypeMult).toBe(1);
    const cap = BOOST_RULES.maxMult;
    const capped: GameState = {
      ...roomy,
      boosts: [{ id: 'x', until: 60, spawnMult: cap, incomeMult: 1, speedMult: 1 }],
    };
    expect(computeLocationRates(capped, 'berlin').influencerHypeMult).toBe(1);
  });
  it('offline zählt der Hype nicht (er ist ein 5-s-Boost aktiver Spielzeit)', () => {
    const roomy = withMerch('berlin', getAmbienceDef('seats').maxLevel);
    const on = computeLocationRates(roomy, 'berlin');
    const off = computeLocationRates(roomy, 'berlin', { influencerHype: false });
    // Eine Minute weg: so viele Spielminuten laufen, alle in derselben Stunde (gleichbleibende Raten).
    const minutes = 60 * getOfflineEfficiency(roomy) * TIME.openMinutesPerSec;
    expect(minutes).toBeLessThan(60);
    const away = applyOffline(roomy, 60_000);
    expect(away.revenue.toNumber()).toBeCloseTo((off.incomePerHour.toNumber() * minutes) / 60, 6);
    expect(away.revenue.toNumber()).toBeLessThan((on.incomePerHour.toNumber() * minutes) / 60);
  });
});
