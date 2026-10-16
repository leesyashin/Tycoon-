import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  createInitialState,
  createLocationState,
  getLocation,
  withLocation,
  type GameState,
  type LocationState,
} from '@core/GameState';
import { D } from '@core/math';
import {
  buyStation,
  cafeLevelFromSum,
  cafeLevelThreshold,
  collectModifiers,
  computeCafeLevel,
  getBulkCost,
  getNextAmbienceCost,
  getOfflineEfficiency,
} from '@core/economy';
import { computeLocationRates, getTapIncome, peakIncomePerHour } from '@core/customers';
import { getNextStaffCost } from '@core/staff';
import { getOrderCost } from '@core/supply';
import { dayOf } from '@core/time';
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
import { achievementValue, switchLocation, unlockLocation } from '@core/progression';
import { deserialize, migrate, migrations, serialize } from '@core/save';
import { getLocationDef } from '@data/locations';
import { META_UPGRADES, PRESTIGE, getMetaUpgradeDef, type MetaUpgradeId } from '@data/prestige';
import { BALANCE } from '@data/balance';
import { getAchievementDef } from '@data/achievements';
import { STATIONS } from '@data/stations';
import { TIME } from '@data/time';
import { cafeLevelLeaves } from '@data/unlocks';

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
/** Umsatz, bei dem sqrt(earned / (divisor × Preisniveau)) genau `root` ergibt. */
const earnedFor = (root: number, locationId = L): number =>
  root * root * PRESTIGE.zen.divisor * getLocationDef(locationId).scale;
const kyoto = () => {
  const u = getLocationDef('kyoto').unlock;
  if (!u) throw new Error('Kyoto ohne Freischaltung');
  return u;
};

/**
 * Ein laufendes Café auf Café-Level 12, am vierten Spieltag: Geräte, Personal, Ambiente, eigene Öffnungszeiten,
 * guter Matcha im Lager und ein gewachsener Account.
 */
function grown(): GameState {
  let s = patch(fresh(), {
    coins: D(1e9),
    earnedThisRun: D(4e8),
    satisfaction: 90,
    cleanliness: 80,
    ambience: { seats: 5, decor: 3, terrace: 1 },
    staff: { cashier: 3, barista: 4, waiter: 2, manager: 1 },
    autoBuy: true,
    hours: { open: 7, close: 20 },
  });
  const l = loc(s);
  const stations = {
    ...l.stations,
    matchaStation: { level: 20, unlocked: true },
    register: { level: 20, unlocked: true },
    coffeeMachine: { level: 20, unlocked: true },
    iceBox: { level: 15, unlocked: true },
    servingStation: { level: 10, unlocked: true },
  };
  const level = computeCafeLevel({ ...l, stations });
  s = patch(s, {
    stations,
    level,
    bestLevel: level,
    supply: { ...l.supply, stock: l.supply.stock.map((_, i) => (i === 2 ? 5000 : 0)), grade: 2 },
    social: { ...l.social, followers: 25_000, day: 3 },
  });
  return {
    ...s,
    clock: 3 * TIME.minutesPerDay + 12 * 60,
    hourMark: 3 * 24 + 12,
    meta: {
      ...s.meta,
      goldenLeaves: D(17),
      zen: D(3),
      metaUpgrades: { tapPower: 1 },
      achievements: { served1: { unlockedAt: 5 } },
      lifetimeEarned: D(5e8),
    },
  };
}

describe('Zen-Formel (GAME_DESIGN § 11.2)', () => {
  it('floor(factor × sqrt(earned / (divisor × scale)) × (1 + prestige × perPrestige))', () => {
    const { factor: f, perPrestige } = PRESTIGE.zen;
    const s = patch(fresh(), { earnedThisRun: D(earnedFor(8)) });
    expect(computeZenGain(s, L).toNumber()).toBe(Math.floor(f * 8));
    const p2 = patch(s, { prestigeCount: 2 });
    expect(computeZenGain(p2, L).toNumber()).toBe(Math.floor(f * 8 * (1 + 2 * perPrestige)));
    const tiny = patch(fresh(), { earnedThisRun: D(earnedFor(Math.sqrt(0.1))) });
    expect(computeZenGain(tiny, L).toNumber()).toBe(Math.floor(f * Math.sqrt(0.1)));
    expect(computeZenGain(patch(fresh(), { earnedThisRun: D(0) }), L).toNumber()).toBe(0);
  });
  it('Standort-Skalierung gleicht die Zen-Menge an', () => {
    const s = withLocation(fresh(), 'kyoto', {
      ...createLocationState('kyoto'),
      earnedThisRun: D(earnedFor(8, 'kyoto')),
    });
    expect(computeZenGain(s, 'kyoto').toNumber()).toBe(Math.floor(PRESTIGE.zen.factor * 8));
  });
  it('Richtwert: ein erster Lauf mit rund 1 Mio. € Umsatz bringt gut 20 Zen', () => {
    const s = patch(fresh(), { earnedThisRun: D(1e6) });
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
    expect(loc(grown()).level).toBeGreaterThanOrEqual(PRESTIGE.resetMinCafeLevel);
  });
  it('löscht nur den LocationState, nie meta', () => {
    const s = grown();
    const old = loc(s);
    const gain = computeZenGain(s, L);
    expect(gain.toNumber()).toBeGreaterThan(0);
    const r = franchiseReset(s, L);
    // meta bleibt vollständig erhalten, nur Zen kommt dazu.
    expect(r.meta.goldenLeaves.toNumber()).toBe(17);
    expect(r.meta.metaUpgrades).toEqual({ tapPower: 1 });
    expect(r.meta.achievements).toEqual({ served1: { unlockedAt: 5 } });
    expect(r.meta.lifetimeEarned.toNumber()).toBe(5e8);
    expect(r.meta.unlockedLocations).toEqual(['berlin']);
    expect(r.meta.zen.toNumber()).toBe(3 + gain.toNumber());
    // Das Café ist wieder eine neue Filiale (Startkapital, Gründungsteam, ein Tisch, frischer Account und Lager,
    // Tagesbilanz ab heute) – nur Prestige-Zähler, Bestwert und die Öffnungszeiten bleiben.
    expect(loc(r)).toEqual({
      ...createLocationState(L, dayOf(s.clock)),
      prestigeCount: 1,
      bestLevel: old.level,
      hours: old.hours,
    });
    expect(loc(r).coins.toNumber()).toBe(BALANCE.startCoins);
    expect(loc(r).ledger.day).toBe(3);
    expect(r.clock).toBe(s.clock);
    expect(r.stats.resets).toBe(1);
    expect(achievementValue(r, getAchievementDef('resets1'))).toBe(1);
  });
  it('lässt andere Standorte unberührt', () => {
    let s = unlockLocation(withZen(grown(), kyoto().zen), 'kyoto');
    s = patch(s, { coins: D(777) }, 'kyoto');
    const r = franchiseReset(s, L);
    expect(loc(r, 'kyoto')).toEqual(loc(s, 'kyoto'));
  });
  it('zweiter Reset gibt durch prestigeCount mehr Zen', () => {
    const { factor: f, perPrestige } = PRESTIGE.zen;
    const level = PRESTIGE.resetMinCafeLevel;
    const a = patch(fresh(), { level, earnedThisRun: D(earnedFor(10)) });
    expect(computeZenGain(a, L).toNumber()).toBe(Math.floor(f * 10));
    const r = patch(franchiseReset(a, L), { level, earnedThisRun: D(earnedFor(10)) });
    expect(loc(r).prestigeCount).toBe(1);
    expect(computeZenGain(r, L).toNumber()).toBe(Math.floor(f * 10 * (1 + perPrestige)));
  });
  it('Start-Kapital: Spielstunden Umsatz des Vor-Runs zur Hauptzeit je Stufe', () => {
    const base = createLocationState(L).coins;
    expect(getResetStartCoins(grown(), L).eq(base)).toBe(true);
    const s = withMeta(grown(), { startCapital: 2 });
    const hours = 2 * getMetaUpgradeDef('startCapital').perLevel;
    expect(getMetaEffects(s).startCapitalHours).toBe(hours);
    const expected = peakIncomePerHour(s, L).mul(hours).add(base).toNumber();
    expect(expected).toBeGreaterThan(base.toNumber());
    expect(getResetStartCoins(s, L).toNumber()).toBeCloseTo(expected, 6);
    expect(loc(franchiseReset(s, L)).coins.toNumber()).toBeCloseTo(expected, 6);
    // Zur Hauptzeit gerechnet: um Mitternacht (Café zu) gibt es genauso viel.
    const night = { ...s, clock: 4 * TIME.minutesPerDay, hourMark: 4 * 24 };
    expect(getResetStartCoins(night, L).toNumber()).toBeCloseTo(expected, 6);
  });
  it('Schnellstart: die ersten N Geräte (Freischalt-Reihenfolge) starten auf festem Level', () => {
    const fast = getMetaUpgradeDef('fastStart');
    const order = [...STATIONS].sort((a, b) => a.unlockCafeLevel - b.unlockCafeLevel);
    const ids = order.map((d) => d.id);
    expect(ids.slice(0, 2)).toEqual(expect.arrayContaining(['register', 'matchaStation']));

    const two = loc(franchiseReset(withMeta(grown(), { fastStart: 2 }), L));
    for (const id of ids.slice(0, 2))
      expect(two.stations[id]).toEqual({ level: fast.perLevel, unlocked: true });
    expect(two.stations[ids[2] ?? '']?.level).toBe(0);
    expect(two.level).toBe(cafeLevelFromSum(2 * fast.perLevel));

    const all = loc(franchiseReset(withMeta(grown(), { fastStart: fast.maxLevel }), L));
    for (const id of ids.slice(0, fast.maxLevel))
      expect(all.stations[id]).toEqual({ level: fast.perLevel, unlocked: true });
    expect(all.level).toBe(cafeLevelFromSum(fast.maxLevel * fast.perLevel));
    expect(all.bestLevel).toBe(loc(grown()).level);
    // Was danach kommt, startet wie in einem neuen Café.
    const next = order[fast.maxLevel];
    if (!next) throw new Error('zu wenige Geräte');
    expect(all.stations[next.id]).toEqual(createLocationState(L).stations[next.id]);
  });
  it('Blätter für Café-Level gibt es nach dem Reset nur über dem Bestwert', () => {
    const best = loc(grown()).level;
    let s = franchiseReset(grown(), L);
    s = patch(s, {
      coins: D(1e15),
      stations: {
        ...loc(s).stations,
        matchaStation: { level: cafeLevelThreshold(2) - 1, unlocked: true },
      },
    });
    const leaves = s.meta.goldenLeaves.toNumber();
    s = buyStation(s, L, 'matchaStation', 1);
    expect(loc(s).level).toBe(2);
    expect(s.meta.goldenLeaves.toNumber()).toBe(leaves);
    // Geld-Belohnung gibt es weiterhin (Neustart-Hilfe).
    expect(s.meta.lifetimeEarned.gt(grown().meta.lifetimeEarned)).toBe(true);
    // Erst über dem alten Bestwert kommen wieder Blätter.
    const top = { ...loc(s).stations };
    let need = cafeLevelThreshold(best + 1) - 1;
    for (const d of STATIONS) {
      const level = Math.min(d.maxLevel, need);
      top[d.id] = { level, unlocked: true };
      need -= level;
    }
    s = patch(s, { stations: top, level: best });
    expect(computeCafeLevel(loc(s))).toBe(best);
    const pick = STATIONS.find((d) => (top[d.id]?.level ?? 0) < d.maxLevel);
    if (!pick) throw new Error('alle Geräte voll');
    s = buyStation(s, L, pick.id, 1);
    expect(loc(s).level).toBe(best + 1);
    expect(loc(s).bestLevel).toBe(best + 1);
    expect(s.meta.goldenLeaves.toNumber()).toBe(leaves + cafeLevelLeaves(best + 1));
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
    const u = kyoto();
    let s = withZen(patch(fresh(), { bestLevel: u.cafeLevel, coins: D(u.cost) }), u.zen);
    s = unlockLocation(s, 'kyoto');
    expect(s.meta.unlockedLocations).toContain('kyoto');
    const per = getMetaUpgradeDef('globalIncome').perLevel;
    const b = peakIncomePerHour(s, L).toNumber();
    const k = peakIncomePerHour(s, 'kyoto').toNumber();
    expect(b).toBeGreaterThan(0);
    expect(k).toBeGreaterThan(0);
    const up = withMeta(s, { globalIncome: 3 });
    expect(collectModifiers(up, 'kyoto').prestigeMult).toBeCloseTo(1 + 3 * per);
    expect(peakIncomePerHour(up, L).toNumber()).toBeCloseTo(b * (1 + 3 * per), 6);
    expect(peakIncomePerHour(up, 'kyoto').toNumber()).toBeCloseTo(k * (1 + 3 * per), 6);
  });
  it('Rabatt −2 % je Stufe auf Ausbau, Einstellungen und Matcha-Einkauf', () => {
    const s = patch(fresh(), { level: 10 });
    const up = withMeta(s, { discount: 5 });
    const off = 5 * getMetaUpgradeDef('discount').perLevel;
    expect(getMetaEffects(up).discount).toBeCloseTo(off);
    const ratio = (f: (x: GameState) => number): number => f(up) / f(s);
    expect(ratio((x) => getBulkCost(x, L, 'matchaStation', 5).toNumber())).toBeCloseTo(1 - off);
    expect(ratio((x) => getNextAmbienceCost(x, L, 'decor').toNumber())).toBeCloseTo(1 - off);
    expect(ratio((x) => getNextStaffCost(x, L, 'barista').toNumber())).toBeCloseTo(1 - off);
    expect(ratio((x) => getOrderCost(x, L, 1, 1, false).toNumber())).toBeCloseTo(1 - off);
  });
  it('Rabatt ist gedeckelt', () => {
    const s = withMeta(fresh(), { discount: 1000 });
    expect(getMetaEffects(s).discount).toBe(BALANCE.maxDiscount);
  });
  it('Offline-Effizienz +5 % je Stufe, höchstens 100 %', () => {
    const o = BALANCE.offline;
    const per = getMetaUpgradeDef('offlineEfficiency').perLevel;
    expect(getOfflineEfficiency(fresh())).toBe(o.baseEfficiency);
    expect(getOfflineEfficiency(withMeta(fresh(), { offlineEfficiency: 4 }))).toBeCloseTo(
      o.baseEfficiency + 4 * per,
    );
    expect(getOfflineEfficiency(withMeta(fresh(), { offlineEfficiency: 10 }))).toBe(
      o.maxEfficiency,
    );
  });
  it('Tap-Stärke +50 % je Stufe', () => {
    // mittags, damit das Café Umsatz macht (nachts bringt Anfeuern nichts)
    const s = { ...patch(fresh(), { satisfaction: 70 }), clock: 12 * 60, hourMark: 12 };
    const base = getTapIncome(s, L).toNumber();
    expect(base).toBeGreaterThan(0);
    const per = getMetaUpgradeDef('tapPower').perLevel;
    expect(getTapIncome(withMeta(s, { tapPower: 2 }), L).toNumber()).toBeCloseTo(
      base * (1 + 2 * per),
    );
  });
  it('Basis-Zufriedenheit +2 je Stufe im Zielwert', () => {
    const s = fresh();
    const per = getMetaUpgradeDef('satisfactionBase').perLevel;
    const base = computeLocationRates(s, L).satisfaction;
    const up = computeLocationRates(withMeta(s, { satisfactionBase: 3 }), L).satisfaction;
    expect(up.zen).toBe(3 * per);
    expect(up.target).toBeCloseTo(Math.min(100, base.target + 3 * per));
  });
  it('perLevel-Werte kommen aus den Daten', () => {
    expect(getMetaUpgradeDef('globalIncome').perLevel).toBe(0.1);
    expect(() => getMetaUpgradeDef('nope')).toThrow();
  });
});

describe('Save v5', () => {
  it('Migration v4 → v5 setzt bestLevel = level', () => {
    const v4 = JSON.parse(serialize(patch(fresh(), { level: 7 }))) as Record<string, unknown>;
    v4['schemaVersion'] = 4;
    const locs = v4['locations'] as Record<string, Record<string, unknown>>;
    delete locs['berlin']?.['bestLevel'];
    locs['kyoto'] = { ...locs['berlin'], level: 'kaputt' };
    const step = migrations[4];
    if (!step) throw new Error('Migration v4 → v5 fehlt');
    const m = step(v4);
    expect(m['schemaVersion']).toBe(5);
    const next = m['locations'] as Record<string, Record<string, unknown>>;
    expect(next['berlin']?.['bestLevel']).toBe(7);
    expect(next['kyoto']?.['bestLevel']).toBe(1);
    // Die Kette läuft bis zur aktuellen Version durch.
    expect(migrate(v4)['schemaVersion']).toBe(SCHEMA_VERSION);
  });
  it('Roundtrip mit mehreren Standorten, Zen und Meta-Upgrades', () => {
    const u = kyoto();
    let s = withZen(patch(fresh(), { bestLevel: u.cafeLevel, coins: D(u.cost) }), u.zen + 20);
    s = unlockLocation(s, 'kyoto');
    s = buyMetaUpgrade(switchLocation(s, 'kyoto'), 'globalIncome');
    const back = deserialize(serialize(s));
    expect(back.activeLocationId).toBe('kyoto');
    expect(back.meta.unlockedLocations).toEqual(['berlin', 'kyoto']);
    expect(back.meta.zen.toNumber()).toBe(20 - getMetaUpgradeCost('globalIncome', 0).toNumber());
    expect(back.meta.metaUpgrades).toEqual({ globalIncome: 1 });
    expect(back.locations['kyoto']?.coins.toNumber()).toBeCloseTo(
      BALANCE.startCoins * getLocationDef('kyoto').scale,
      6,
    );
    expect(back.locations['berlin']?.coins.toNumber()).toBe(0);
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
