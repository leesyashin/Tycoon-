import { describe, expect, it } from 'vitest';
import { foundingStaff } from '@data/staff';
import {
  SCHEMA_VERSION,
  createInitialState,
  getLocation,
  withLocation,
  type GameState,
  type LocationState,
} from '@core/GameState';
import { D } from '@core/math';
import { tick } from '@core/GameLoop';
import {
  applyOffline,
  buyStation,
  collectModifiers,
  getBulkCost,
  getNextAmbienceCost,
  getOfflineEfficiency,
} from '@core/economy';
import { computeLocationRates, getIncomePerSec, getTapIncome } from '@core/customers';
import { getNextStaffCost } from '@core/staff';
import { getMarketingLevelCost } from '@core/marketing';
import {
  affordableMetaLevels,
  buyMetaUpgrade,
  canReset,
  computeZenGain,
  franchiseReset,
  getMetaEffects,
  getMetaUpgradeCost,
  getNextMetaCost,
  getResetStartCoins,
} from '@core/prestige';
import {
  achievementValue,
  canUnlockLocation,
  getLocationRequirement,
  getNextLockedLocation,
  getNextQualityCost,
  isLocationUnlocked,
  switchLocation,
  unlockLocation,
} from '@core/progression';
import { deserialize, migrate, serialize } from '@core/save';
import { LOCATIONS, getLocationDef } from '@data/locations';
import { META_UPGRADES, PRESTIGE, getMetaUpgradeDef, type MetaUpgradeId } from '@data/prestige';
import { BALANCE } from '@data/balance';
import { getAchievementDef } from '@data/achievements';

const L = 'berlin';
const fresh = (): GameState => createInitialState(0);
const patch = (s: GameState, p: Partial<LocationState>, id = L): GameState =>
  withLocation(s, id, { ...getLocation(s, id), ...p });
const loc = (s: GameState, id = L): LocationState => getLocation(s, id);
const withZen = (s: GameState, zen: number): GameState => ({
  ...s,
  meta: { ...s.meta, zen: D(zen) },
});
const withMeta = (s: GameState, ups: Partial<Record<MetaUpgradeId, number>>): GameState => ({
  ...s,
  meta: { ...s.meta, metaUpgrades: { ...s.meta.metaUpgrades, ...ups } },
});

/** Ein laufendes Café auf Café-Level 10 mit Personal, Ambiente, Qualität und Marketing. */
function grown(): GameState {
  let s = patch(fresh(), {
    coins: D(1e9),
    earnedThisRun: D(4e8),
    level: 12,
    bestLevel: 12,
    quality: 3,
    satisfaction: 90,
    cleanliness: 80,
    ambience: { seats: 5, decor: 3 },
    staff: { barista: 4, cashier: 3 },
    marketing: { level: 6, campaignUntil: 500 },
    autoBuy: true,
  });
  s = patch(s, {
    stations: {
      ...loc(s).stations,
      matchaStation: { level: 120, unlocked: true },
      register: { level: 80, unlocked: true },
      coffeeMachine: { level: 80, unlocked: true },
    },
  });
  return {
    ...s,
    meta: {
      ...s.meta,
      goldenLeaves: D(17),
      zen: D(3),
      metaUpgrades: { tapPower: 1 },
      achievements: { coins1: { unlockedAt: 5 } },
      lifetimeEarned: D(5e8),
    },
  };
}

describe('Zen-Formel (GAME_DESIGN § 11.2)', () => {
  it('floor(factor × sqrt(earned / (1e6 × scale)) × (1 + prestige × 0.1))', () => {
    const f = PRESTIGE.zen.factor;
    const s = patch(fresh(), { earnedThisRun: D(64e6) });
    expect(computeZenGain(s, L).toNumber()).toBe(Math.floor(f * 8));
    const p2 = patch(s, { prestigeCount: 2 });
    expect(computeZenGain(p2, L).toNumber()).toBe(Math.floor(f * 8 * 1.2));
    const tiny = patch(fresh(), { earnedThisRun: D(1e5) });
    expect(computeZenGain(tiny, L).toNumber()).toBe(Math.floor(f * Math.sqrt(0.1)));
    expect(computeZenGain(patch(fresh(), { earnedThisRun: D(0) }), L).toNumber()).toBe(0);
  });
  it('Standort-Skalierung gleicht die Zen-Menge an', () => {
    let s = unlockLocation(withZen(patch(fresh(), { bestLevel: 15 }), 10), 'kyoto');
    s = patch(s, { earnedThisRun: D(64e6 * getLocationDef('kyoto').scale) }, 'kyoto');
    expect(computeZenGain(s, 'kyoto').toNumber()).toBe(Math.floor(PRESTIGE.zen.factor * 8));
  });
  it('Richtwert: ~3 h Berlin geben 20–30 Zen', () => {
    // Balance-Sim (S9): Berlin hat beim ersten Reset nach ~3 h 30 min rund 190 M verdient.
    const s = patch(fresh(), { earnedThisRun: D(190e6) });
    const z = computeZenGain(s, L).toNumber();
    expect(z).toBeGreaterThanOrEqual(20);
    expect(z).toBeLessThanOrEqual(30);
  });
  it('bleibt bei riesigen Werten endlich', () => {
    const s = patch(fresh(), { earnedThisRun: D('1e400') });
    expect(computeZenGain(s, L).toString()).toContain('e');
  });
});

describe('Franchise-Reset (GAME_DESIGN § 11.1)', () => {
  it('erst ab Café-Level 10', () => {
    const s = patch(fresh(), { level: PRESTIGE.resetMinCafeLevel - 1, earnedThisRun: D(1e9) });
    expect(canReset(s, L)).toBe(false);
    expect(franchiseReset(s, L)).toBe(s);
    expect(canReset(patch(s, { level: PRESTIGE.resetMinCafeLevel }), L)).toBe(true);
  });
  it('löscht nur den LocationState, nie meta', () => {
    const s = grown();
    const gain = computeZenGain(s, L);
    const r = franchiseReset(s, L);
    // meta bleibt vollständig erhalten, nur Zen kommt dazu.
    expect(r.meta.goldenLeaves.toNumber()).toBe(17);
    expect(r.meta.metaUpgrades).toEqual({ tapPower: 1 });
    expect(r.meta.achievements).toEqual({ coins1: { unlockedAt: 5 } });
    expect(r.meta.lifetimeEarned.toNumber()).toBe(5e8);
    expect(r.meta.unlockedLocations).toEqual(['berlin']);
    expect(r.meta.zen.toNumber()).toBe(3 + gain.toNumber());
    // Standort ist zurück am Anfang …
    const l = loc(r);
    expect(l.coins.toNumber()).toBe(BALANCE.startCoins);
    expect(l.earnedThisRun.toNumber()).toBe(0);
    expect(l.level).toBe(1);
    expect(l.quality).toBe(0);
    expect(l.ambience).toEqual({});
    expect(l.staff).toEqual(foundingStaff());
    expect(l.marketing).toEqual({ level: 0 });
    expect(l.autoBuy).toBe(false);
    expect(l.stations['matchaStation']?.level).toBe(1);
    expect(l.stations['register']?.level).toBe(0);
    // … nur Prestige-Zähler und Bestwert bleiben.
    expect(l.prestigeCount).toBe(1);
    expect(l.bestLevel).toBe(12);
    expect(r.stats.resets).toBe(1);
    expect(achievementValue(r, getAchievementDef('resets1'))).toBe(1);
  });
  it('lässt andere Standorte unberührt', () => {
    let s = unlockLocation(withZen(patch(grown(), { bestLevel: 15 }), 20), 'kyoto');
    s = patch(s, { coins: D(777) }, 'kyoto');
    const r = franchiseReset(s, L);
    expect(loc(r, 'kyoto')).toEqual(loc(s, 'kyoto'));
  });
  it('zweiter Reset gibt durch prestigeCount mehr Zen', () => {
    const a = patch(fresh(), { level: 10, earnedThisRun: D(1e8) });
    const first = computeZenGain(a, L).toNumber();
    const r = patch(franchiseReset(a, L), { level: 10, earnedThisRun: D(1e8) });
    const f = PRESTIGE.zen.factor;
    expect(computeZenGain(r, L).toNumber()).toBe(Math.floor(f * 10 * 1.1));
    expect(first).toBe(Math.floor(f * 10));
  });
  it('Start-Kapital: 10 min Einkommen des Vor-Runs je Stufe', () => {
    const s = withMeta(grown(), { startCapital: 2 });
    const income = getIncomePerSec(s, L);
    const expected = income.mul(1200).add(BALANCE.startCoins);
    expect(getResetStartCoins(s, L).toNumber()).toBeCloseTo(expected.toNumber(), 3);
    expect(loc(franchiseReset(s, L)).coins.toNumber()).toBeCloseTo(expected.toNumber(), 3);
  });
  it('Schnellstart: die ersten N Stationen starten auf Level 10', () => {
    const s = withMeta(grown(), { fastStart: 2 });
    const l = loc(franchiseReset(s, L));
    expect(l.stations['matchaStation']).toEqual({ level: 10, unlocked: true });
    expect(l.stations['register']).toEqual({ level: 10, unlocked: true });
    expect(l.stations['coffeeMachine']?.level).toBe(0);
    expect(l.level).toBe(1);
    const four = loc(franchiseReset(withMeta(grown(), { fastStart: 4 }), L));
    expect(four.stations['iceBox']).toEqual({ level: 10, unlocked: true });
    expect(four.level).toBe(2);
    expect(four.stations['coffeeMachine']).toEqual({ level: 10, unlocked: true });
    expect(four.stations['oven']).toEqual({ level: 0, unlocked: false });
  });
  it('Blätter für Café-Level gibt es nach dem Reset nur über dem Bestwert', () => {
    // Reset bei Café-Level 12 → die Level 2..12 bringen beim Wiederaufstieg keine Blätter mehr.
    let s = franchiseReset(grown(), L);
    s = patch(s, {
      coins: D(1e15),
      stations: { ...loc(s).stations, matchaStation: { level: 24, unlocked: true } },
    });
    const leaves = s.meta.goldenLeaves.toNumber();
    s = buyStation(s, L, 'matchaStation', 1);
    expect(loc(s).level).toBe(2);
    expect(s.meta.goldenLeaves.toNumber()).toBe(leaves);
    // Münz-Belohnung gibt es weiterhin (Neustart-Hilfe).
    expect(s.meta.lifetimeEarned.gt(grown().meta.lifetimeEarned)).toBe(true);
  });
});

describe('Meta-Upgrades (GAME_DESIGN § 11.3)', () => {
  it('Tabelle wie im Design', () => {
    const t = Object.fromEntries(META_UPGRADES.map((m) => [m.id, [m.cost, m.growth, m.maxLevel]]));
    expect(t).toEqual({
      globalIncome: [5, 1.5, 50],
      startCapital: [10, 2, 5],
      offlineEfficiency: [8, 1.4, 10],
      discount: [12, 1.6, 15],
      tapPower: [6, 1.5, 10],
      fastStart: [25, 2.5, 4],
      satisfactionBase: [10, 1.5, 10],
    });
  });
  it('Kosten cost × growth^level, abgerundet', () => {
    expect(getMetaUpgradeCost('globalIncome', 0).toNumber()).toBe(5);
    expect(getMetaUpgradeCost('globalIncome', 1).toNumber()).toBe(7);
    expect(getMetaUpgradeCost('globalIncome', 2).toNumber()).toBe(11);
    expect(getMetaUpgradeCost('fastStart', 3).toNumber()).toBe(Math.floor(25 * 2.5 ** 3));
  });
  it('Kauf zieht Zen ab, ohne genug Zen und am Maximum passiert nichts', () => {
    const s = withZen(fresh(), 12);
    const a = buyMetaUpgrade(s, 'globalIncome');
    expect(a.meta.zen.toNumber()).toBe(7);
    expect(a.meta.metaUpgrades['globalIncome']).toBe(1);
    const b = buyMetaUpgrade(a, 'globalIncome');
    expect(b.meta.zen.toNumber()).toBe(0);
    expect(buyMetaUpgrade(b, 'globalIncome')).toBe(b);
    const max = withZen(withMeta(fresh(), { fastStart: 4 }), 1e9);
    expect(getNextMetaCost(max, 'fastStart')).toBeNull();
    expect(buyMetaUpgrade(max, 'fastStart')).toBe(max);
  });
  it('affordableMetaLevels zählt kaufbare Stufen', () => {
    expect(affordableMetaLevels(fresh(), 'globalIncome', D(23))).toBe(3);
    expect(affordableMetaLevels(fresh(), 'globalIncome', D(4))).toBe(0);
    expect(affordableMetaLevels(withMeta(fresh(), { fastStart: 3 }), 'fastStart', D(1e9))).toBe(1);
  });
  it('globales Einkommen +10 % je Stufe an allen Standorten', () => {
    let s = unlockLocation(
      withZen(patch(fresh(), { bestLevel: 15, satisfaction: 70 }), 10),
      'kyoto',
    );
    s = patch(s, { satisfaction: 70 }, 'kyoto');
    const b = getIncomePerSec(s, L).toNumber();
    const k = getIncomePerSec(s, 'kyoto').toNumber();
    const up = withMeta(s, { globalIncome: 3 });
    expect(collectModifiers(up, 'kyoto').prestigeMult).toBeCloseTo(1.3);
    expect(getIncomePerSec(up, L).toNumber()).toBeCloseTo(b * 1.3, 6);
    expect(getIncomePerSec(up, 'kyoto').toNumber()).toBeCloseTo(k * 1.3, 6);
  });
  it('Rabatt −2 % je Stufe auf alle Münz-Kosten', () => {
    const s = patch(fresh(), { level: 10 });
    const up = withMeta(s, { discount: 5 });
    expect(getMetaEffects(up).discount).toBeCloseTo(0.1);
    const ratio = (f: (x: GameState) => number): number => f(up) / f(s);
    expect(ratio((x) => getBulkCost(x, L, 'matchaStation', 10).toNumber())).toBeCloseTo(0.9);
    expect(ratio((x) => getNextAmbienceCost(x, L, 'decor').toNumber())).toBeCloseTo(0.9);
    expect(ratio((x) => getNextStaffCost(x, L, 'barista').toNumber())).toBeCloseTo(0.9);
    expect(ratio((x) => getMarketingLevelCost(x, L).toNumber())).toBeCloseTo(0.9);
    expect(ratio((x) => getNextQualityCost(x, L)?.toNumber() ?? 0)).toBeCloseTo(0.9);
  });
  it('Rabatt ist gedeckelt', () => {
    const s = withMeta(fresh(), { discount: 1000 });
    expect(getMetaEffects(s).discount).toBe(BALANCE.maxDiscount);
  });
  it('Offline-Effizienz +5 % je Stufe, höchstens 100 %', () => {
    expect(getOfflineEfficiency(fresh())).toBe(0.5);
    expect(getOfflineEfficiency(withMeta(fresh(), { offlineEfficiency: 4 }))).toBeCloseTo(0.7);
    expect(getOfflineEfficiency(withMeta(fresh(), { offlineEfficiency: 10 }))).toBe(1);
  });
  it('Tap-Stärke +50 % je Stufe', () => {
    const s = patch(fresh(), { satisfaction: 70 });
    const base = getTapIncome(s, L).toNumber();
    expect(getTapIncome(withMeta(s, { tapPower: 2 }), L).toNumber()).toBeCloseTo(base * 2);
  });
  it('Basis-Zufriedenheit +2 je Stufe im Zielwert', () => {
    const s = fresh();
    const base = computeLocationRates(s, L).satisfaction;
    const up = computeLocationRates(withMeta(s, { satisfactionBase: 3 }), L).satisfaction;
    expect(up.zen).toBe(6);
    expect(up.target).toBeCloseTo(Math.min(100, base.target + 6));
  });
  it('perLevel-Werte kommen aus den Daten', () => {
    expect(getMetaUpgradeDef('globalIncome').perLevel).toBe(0.1);
    expect(() => getMetaUpgradeDef('nope')).toThrow();
  });
});

describe('Standorte: Freischalt-Kette (GAME_DESIGN § 3)', () => {
  it('Kette Berlin → Kyoto → Tokio … mit Café-Level und Zen', () => {
    const chain = LOCATIONS.map((l) => l.unlock?.prevLocationId ?? null);
    expect(chain).toEqual([null, 'berlin', 'kyoto', 'tokyo', 'seoul', 'newyork']);
    expect(LOCATIONS.map((l) => l.unlock?.zen ?? 0)).toEqual([0, 10, 50, 250, 1200, 6000]);
  });
  it('braucht Café-Level-Bestwert des Vorgängers und Zen', () => {
    const need = getLocationDef('kyoto').unlock?.cafeLevel ?? 0;
    let s = withZen(fresh(), 9);
    expect(canUnlockLocation(s, 'kyoto')).toBe(false);
    s = patch(s, { bestLevel: need });
    expect(getLocationRequirement(s, 'kyoto')).toMatchObject({ levelOk: true, zenOk: false });
    expect(unlockLocation(s, 'kyoto')).toBe(s);
    s = withZen(s, 10);
    expect(canUnlockLocation(s, 'kyoto')).toBe(true);
    // Tokio braucht Kyoto, nicht Berlin.
    expect(canUnlockLocation(withZen(s, 1e6), 'tokyo')).toBe(false);
    const u = unlockLocation(s, 'kyoto');
    expect(u.meta.zen.toNumber()).toBe(0);
    expect(u.meta.unlockedLocations).toEqual(['berlin', 'kyoto']);
    expect(isLocationUnlocked(u, 'kyoto')).toBe(true);
    expect(canUnlockLocation(withZen(u, 100), 'kyoto')).toBe(false);
    // Neuer Standort startet frisch, mit skalierten Start-Münzen; aktiv bleibt Berlin.
    expect(loc(u, 'kyoto').coins.toNumber()).toBe(BALANCE.startCoins * 25);
    expect(loc(u, 'kyoto').level).toBe(1);
    expect(u.activeLocationId).toBe(L);
    expect(getNextLockedLocation(u)).toBe('tokyo');
    expect(achievementValue(u, getAchievementDef('locations1'))).toBe(2);
  });
  it('Bestwert zählt auch nach einem Reset (Berlin wieder auf Level 1)', () => {
    const need = getLocationDef('kyoto').unlock?.cafeLevel ?? 0;
    const s = franchiseReset(patch(fresh(), { level: need, earnedThisRun: D(4e7) }), L);
    expect(loc(s).level).toBe(1);
    expect(s.meta.zen.toNumber()).toBeGreaterThanOrEqual(10);
    expect(canUnlockLocation(s, 'kyoto')).toBe(true);
  });
  it('Wechseln nur zu freigeschalteten Standorten', () => {
    const s = fresh();
    expect(switchLocation(s, 'kyoto')).toBe(s);
    expect(switchLocation(s, L)).toBe(s);
    const u = unlockLocation(withZen(patch(s, { bestLevel: 15 }), 10), 'kyoto');
    expect(switchLocation(u, 'kyoto').activeLocationId).toBe('kyoto');
  });
  it('alle Standorte produzieren parallel – online und offline', () => {
    let s = unlockLocation(withZen(patch(fresh(), { bestLevel: 15 }), 10), 'kyoto');
    s = switchLocation(s, 'kyoto');
    const t = tick(s, 10_000);
    expect(loc(t, L).coins.gt(loc(s, L).coins)).toBe(true);
    expect(loc(t, 'kyoto').coins.gt(loc(s, 'kyoto').coins)).toBe(true);
    const o = applyOffline(s, 3_600_000);
    expect(loc(o.state, L).coins.gt(loc(s, L).coins)).toBe(true);
    expect(loc(o.state, 'kyoto').coins.gt(loc(s, 'kyoto').coins)).toBe(true);
    const sum = loc(o.state, L)
      .coins.sub(loc(s, L).coins)
      .add(loc(o.state, 'kyoto').coins.sub(loc(s, 'kyoto').coins));
    expect(sum.toNumber()).toBeCloseTo(o.earned.toNumber(), 3);
  });
  it('Stationen am neuen Standort kosten und verdienen skaliert', () => {
    const s = unlockLocation(withZen(patch(fresh(), { bestLevel: 15 }), 10), 'kyoto');
    expect(getBulkCost(s, 'kyoto', 'matchaStation', 1).toNumber()).toBeCloseTo(
      getBulkCost(s, L, 'matchaStation', 1).toNumber() * 25,
    );
  });
});

describe('Save v5', () => {
  it('Migration v4 → v5 setzt bestLevel = level', () => {
    const s = patch(fresh(), { level: 7 });
    const v4 = JSON.parse(serialize(s)) as Record<string, unknown>;
    v4['schemaVersion'] = 4;
    const locs = v4['locations'] as Record<string, Record<string, unknown>>;
    delete locs['berlin']?.['bestLevel'];
    const m = migrate(v4);
    expect(m['schemaVersion']).toBe(SCHEMA_VERSION);
    expect(deserialize(JSON.stringify(m)).locations['berlin']?.bestLevel).toBe(7);
  });
  it('Roundtrip mit mehreren Standorten, Zen und Meta-Upgrades', () => {
    let s = unlockLocation(withZen(patch(fresh(), { bestLevel: 15 }), 30), 'kyoto');
    s = buyMetaUpgrade(switchLocation(s, 'kyoto'), 'globalIncome');
    const back = deserialize(serialize(s));
    expect(back.activeLocationId).toBe('kyoto');
    expect(back.meta.unlockedLocations).toEqual(['berlin', 'kyoto']);
    expect(back.meta.zen.toNumber()).toBe(15);
    expect(back.meta.metaUpgrades).toEqual({ globalIncome: 1 });
    expect(back.locations['kyoto']?.coins.toNumber()).toBe(125);
  });
  it('härtet kaputte Prestige-Werte', () => {
    const raw = JSON.parse(serialize(fresh())) as Record<string, unknown>;
    const meta = raw['meta'] as Record<string, unknown>;
    meta['unlockedLocations'] = ['berlin', 'kyoto', 42];
    meta['metaUpgrades'] = { globalIncome: 'x', discount: 2, tapPower: -1 };
    const b = (raw['locations'] as Record<string, Record<string, unknown>>)['berlin'] ?? {};
    b['bestLevel'] = 'kaputt';
    b['prestigeCount'] = -3;
    const s = deserialize(JSON.stringify(raw));
    // Kyoto hat keinen Standort-Zustand → gilt nicht als freigeschaltet.
    expect(s.meta.unlockedLocations).toEqual(['berlin']);
    expect(s.meta.metaUpgrades).toEqual({ discount: 2 });
    expect(loc(s).bestLevel).toBe(1);
    expect(loc(s).prestigeCount).toBe(0);
  });
});
