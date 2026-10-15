import { describe, expect, it } from 'vitest';
import { BALANCE } from '@data/balance';
import { getStationDef } from '@data/stations';
import { createInitialState, getLocation, withLocation } from '@core/GameState';
import { D } from '@core/math';
import {
  buyStation,
  collectModifiers,
  computeCafeLevel,
  cafeLevelProgress,
  cafeLevelThreshold,
  getBulkCost,
  getMaxAffordable,
  getStationCost,
  getStationPrice,
  getStationSpeed,
  getStationWorkSeconds,
  isStationUnlocked,
  milestoneLevels,
  milestonePriceMult,
  milestoneSpeedMult,
  nextMilestone,
  resolveAmount,
} from '@core/economy';

const bar = getStationDef('matchaStation');
const fresh = () => createInitialState(0);
const withCoins = (coins: number | string) => {
  const s = fresh();
  return withLocation(s, 'berlin', { ...getLocation(s, 'berlin'), coins: D(coins) });
};

describe('Kosten', () => {
  it('Level 1→2 der Matcha-Station = 10 × g', () => {
    expect(getStationCost(bar, 1, 1, 'berlin').toNumber()).toBeCloseTo(10 * bar.growth, 6);
  });
  it('Startlevel 0 kostet Basiskosten', () => {
    expect(getStationCost(getStationDef('register'), 0, 1, 'berlin').toNumber()).toBeCloseTo(60, 6);
  });
  it('Bulk = Summe der Einzelkäufe (geometrische Reihe)', () => {
    let sum = 0;
    for (let l = 5; l < 15; l++) sum += getStationCost(bar, l, 1, 'berlin').toNumber();
    expect(getStationCost(bar, 5, 10, 'berlin').toNumber()).toBeCloseTo(sum, 6);
  });
  it('skaliert mit Standort und Rabatt', () => {
    expect(getStationCost(bar, 1, 1, 'kyoto').toNumber()).toBeCloseTo(10 * bar.growth * 25, 6);
    expect(getStationCost(bar, 1, 1, 'berlin', 0.5).toNumber()).toBeCloseTo(5 * bar.growth, 6);
  });
  it('amount 0 kostet nichts', () => {
    expect(getStationCost(bar, 3, 0, 'berlin').toNumber()).toBe(0);
  });
  it('unbekannte Station/Standort wirft', () => {
    expect(() => getStationDef('nope')).toThrow();
    expect(() => getStationCost(bar, 1, 1, 'nope')).toThrow();
  });
});

describe('Max-Kauf', () => {
  it('0, wenn Coins nicht für ein Level reichen', () => {
    expect(getMaxAffordable(bar, 1, D(10), 'berlin')).toBe(0);
  });
  it('größtes n, das bezahlbar ist', () => {
    for (const coins of [11, 100, 1234, 1e6, 5e9]) {
      const n = getMaxAffordable(bar, 1, D(coins), 'berlin');
      expect(getStationCost(bar, 1, n, 'berlin').lte(coins)).toBe(true);
      expect(getStationCost(bar, 1, n + 1, 'berlin').gt(coins)).toBe(true);
    }
  });
});

describe('Meilensteine', () => {
  it('Stufen 10/25/50/100/200/…/500, danach alle 100', () => {
    expect(milestoneLevels(700)).toEqual([10, 25, 50, 100, 200, 300, 400, 500, 600, 700]);
    expect(milestoneLevels(9)).toEqual([]);
  });
  it('nextMilestone', () => {
    expect(nextMilestone(0)).toBe(10);
    expect(nextMilestone(10)).toBe(25);
    expect(nextMilestone(499)).toBe(500);
    expect(nextMilestone(500)).toBe(600);
    expect(nextMilestone(650)).toBe(700);
  });
  it('Tempo verdoppelt sich bis Meilenstein 3, ab 4 wechseln Preis und Tempo', () => {
    expect(milestoneSpeedMult(9)).toBe(1);
    expect(milestoneSpeedMult(10)).toBe(2);
    expect(milestoneSpeedMult(50)).toBe(8);
    expect(milestonePriceMult(50)).toBe(1);
    expect(milestonePriceMult(100)).toBe(2); // Meilenstein 4 = Preis
    expect(milestoneSpeedMult(100)).toBe(8);
    expect(milestoneSpeedMult(200)).toBe(16); // Meilenstein 5 = Tempo
    expect(milestonePriceMult(300)).toBe(4); // Meilenstein 6 = Preis
  });
});

describe('Preis und Tempo', () => {
  it('Preis = base × level × scale × Meilenstein; Kasse und Ausgabe ohne Preis', () => {
    expect(getStationPrice(bar, 4, 'berlin').toNumber()).toBe(12);
    expect(getStationPrice(bar, 4, 'kyoto').toNumber()).toBe(300);
    expect(getStationPrice(bar, 100, 'berlin').toNumber()).toBe(3 * 100 * 2);
    expect(getStationPrice(bar, 0, 'berlin').toNumber()).toBe(0);
    expect(getStationPrice(getStationDef('register'), 5, 'berlin').toNumber()).toBe(0);
    expect(getStationPrice(getStationDef('servingStation'), 5, 'berlin').toNumber()).toBe(0);
  });
  it('Tempo = (1 + (level − 1) × 2 %) × Tempo-Meilensteine', () => {
    const per = BALANCE.equipment.speedPerLevel;
    expect(getStationSpeed(bar, 1)).toBe(1);
    expect(getStationSpeed(bar, 5)).toBeCloseTo(1 + 4 * per, 9);
    expect(getStationSpeed(bar, 10)).toBeCloseTo((1 + 9 * per) * 2, 9);
    expect(getStationSpeed(bar, 100)).toBeCloseTo((1 + 99 * per) * 8, 9);
    expect(getStationSpeed(bar, 0)).toBe(0);
  });
  it('ohne Level: Handkasse, Ausgabe mit Tempo 1, Produktlinie aus', () => {
    expect(getStationSpeed(getStationDef('register'), 0)).toBe(BALANCE.order.handRegisterSpeed);
    expect(getStationSpeed(getStationDef('servingStation'), 0)).toBe(1);
    expect(getStationWorkSeconds(bar, 0)).toBe(Infinity);
    expect(getStationWorkSeconds(bar, 1)).toBe(4);
    expect(getStationWorkSeconds(bar, 10)).toBeCloseTo(4 / getStationSpeed(bar, 10), 9);
  });
});

describe('Café-Level und Käufe', () => {
  it('Café-Level aus Σ Stations-Level über die Stufen-Tabelle, max 50', () => {
    const loc = getLocation(fresh(), 'berlin');
    const at = (level: number) => ({ ...loc, stations: { matchaStation: { level, unlocked: true } } });
    const { steps, stepAfter } = BALANCE.cafeLevel;
    expect(computeCafeLevel(loc)).toBe(1);
    expect(cafeLevelThreshold(1)).toBe(0);
    expect(cafeLevelThreshold(2)).toBe(steps[0]);
    expect(cafeLevelThreshold(3)).toBe((steps[0] ?? 0) + (steps[1] ?? 0));
    const sumSteps = steps.reduce((a, b) => a + b, 0);
    expect(cafeLevelThreshold(steps.length + 3)).toBe(sumSteps + 2 * stepAfter);
    for (const lv of [2, 3, 5, 10, 14, 20]) {
      expect(computeCafeLevel(at(cafeLevelThreshold(lv) - 1))).toBe(lv - 1);
      expect(computeCafeLevel(at(cafeLevelThreshold(lv)))).toBe(lv);
    }
    expect(computeCafeLevel(at(99999))).toBe(50);
  });
  it('Fortschritt zum nächsten Café-Level', () => {
    const loc = getLocation(fresh(), 'berlin');
    const at = (level: number) => ({ ...loc, stations: { matchaStation: { level, unlocked: true } } });
    const t3 = cafeLevelThreshold(3);
    expect(cafeLevelProgress(at(t3 + 4))).toEqual({
      done: 4,
      need: cafeLevelThreshold(4) - t3,
    });
    const max = cafeLevelProgress(at(99999));
    expect(max.done).toBe(max.need);
  });
  it('Kauf zieht Münzen ab und erhöht das Level', () => {
    const s = buyStation(withCoins(100), 'berlin', 'matchaStation', 1);
    const loc = getLocation(s, 'berlin');
    expect(loc.stations['matchaStation']?.level).toBe(2);
    expect(loc.coins.toNumber()).toBeCloseTo(100 - 10 * bar.growth, 6);
  });
  it('Kauf ohne Geld oder gesperrt ändert nichts', () => {
    const poor = fresh();
    expect(buyStation(poor, 'berlin', 'matchaStation', 1)).toBe(poor);
    const rich = withCoins(1e9);
    expect(isStationUnlocked(rich, 'berlin', 'oven')).toBe(false);
    expect(buyStation(rich, 'berlin', 'oven', 1)).toBe(rich);
  });
  it('Bulk x10 und x100 und max', () => {
    const s = withCoins('1e12');
    const x10 = buyStation(s, 'berlin', 'matchaStation', 10);
    expect(getLocation(x10, 'berlin').stations['matchaStation']?.level).toBe(11);
    const x100 = buyStation(s, 'berlin', 'matchaStation', 100);
    expect(getLocation(x100, 'berlin').stations['matchaStation']?.level).toBe(101);
    const max = buyStation(s, 'berlin', 'matchaStation', 'max');
    const n = resolveAmount(s, 'berlin', 'matchaStation', 'max');
    expect(getLocation(max, 'berlin').stations['matchaStation']?.level).toBe(1 + n);
    expect(getBulkCost(s, 'berlin', 'matchaStation', 'max').lte(1e12)).toBe(true);
  });
  it('x10 ohne genug Geld kauft nichts', () => {
    const s = withCoins(20);
    expect(buyStation(s, 'berlin', 'matchaStation', 10)).toBe(s);
  });
  it('max mit zu wenig Geld kauft nichts', () => {
    const s = withCoins(1);
    expect(buyStation(s, 'berlin', 'matchaStation', 'max')).toBe(s);
  });
  it('Café-Level-Aufstieg schaltet Stationen frei', () => {
    let s = withCoins('1e30');
    // Matcha-Station startet auf Level 1; ein Kauf fehlt noch bis Café-Level 5.
    const base = getLocation(s, 'berlin');
    const level = cafeLevelThreshold(5) - 1;
    s = withLocation(s, 'berlin', {
      ...base,
      stations: { ...base.stations, matchaStation: { level, unlocked: true } },
    });
    s = buyStation(s, 'berlin', 'matchaStation', 1);
    const loc = getLocation(s, 'berlin');
    expect(loc.level).toBe(5);
    expect(loc.stations['oven']?.unlocked).toBe(true);
    expect(loc.stations['coffeeMachine']?.unlocked).toBe(true);
    expect(isStationUnlocked(s, 'berlin', 'coffeeMachine')).toBe(true);
  });
});

describe('Modifiers', () => {
  it('Standard = 1', () => {
    expect(collectModifiers(fresh())).toEqual({
      spawnMult: 1,
      incomeMult: 1,
      priceMult: 1,
      speedMult: 1,
      prestigeMult: 1,
      discount: 0,
      satisfactionBonus: 0,
      stationPriceMult: {},
      tipMult: 1,
      eventSatisfaction: 0,
      qualityPenalty: 0,
    });
  });
  it('aktive Events und Boosts multiplizieren, abgelaufene nicht', () => {
    const s = {
      ...fresh(),
      playtimeSec: 10,
      activeEvents: [
        // Hitzewelle: Spawn ×1.3, Eisfach ×3
        { id: 'heatwave', locationId: 'berlin', startedAt: 0, until: 20 },
        { id: 'influencerVisit', locationId: 'berlin', startedAt: 0, until: 5 },
      ],
      boosts: [{ id: 'b', until: 30, spawnMult: 1.5, incomeMult: 2, speedMult: 3 }],
    };
    const m = collectModifiers(s);
    expect(m.spawnMult).toBeCloseTo(1.3 * 1.5, 9);
    expect(m.incomeMult).toBeCloseTo(2, 9);
    expect(m.speedMult).toBe(3);
    expect(m.stationPriceMult['iceBox']).toBe(3);
  });
});
