import { describe, expect, it } from 'vitest';
import { BALANCE } from '@data/balance';
import { RANDOM_EVENTS, getRandomEventDef, type RandomEventDef } from '@data/events';
import { BOOST_RULES } from '@data/leaves';
import { LOCATIONS, getLocationDef } from '@data/locations';
import { MATCHA_GRADES, MAX_GRADE, getGradeDef } from '@data/matcha';
import { getMetaUpgradeDef } from '@data/prestige';
import { getVideoFormat } from '@data/social';
import { MENU_LEVELS, PRODUCT_LINES, STATIONS, getStationDef, menuTierIndex } from '@data/stations';
import { OPENING_HOURS } from '@data/time';
import { getUnlocksAt, type Unlock } from '@data/unlocks';
import {
  createInitialState,
  getLocation,
  withLocation,
  type GameState,
  type LocationState,
} from '@core/GameState';
import { D, type DecimalSource } from '@core/math';
import { computeLocationRates } from '@core/customers';
import {
  buyStation,
  cafeLevelFromSum,
  cafeLevelProgress,
  cafeLevelThreshold,
  collectModifiers,
  computeCafeLevel,
  getBulkCost,
  getCheapestStation,
  getItemPrice,
  getMaxAffordable,
  getStationCost,
  getStationSpeed,
  getStationWorkMinutes,
  isAmbienceUnlocked,
  isStationMaxed,
  isStationUnlocked,
  levelsLeft,
  menuTier,
  nextMenuLevel,
  resolveAmount,
  stationLevelSum,
} from '@core/economy';
import { isFormatUnlocked } from '@core/social';
import { isStaffUnlocked } from '@core/staff';
import { isGradeUnlocked } from '@core/supply';

const L = 'berlin';
const bar = getStationDef('matchaStation');
const register = getStationDef('register');
/** Eine Stunde mitten in der Öffnungszeit (Raten zu einer festen Stunde, unabhängig von der Spieluhr). */
const OPEN_HOUR = OPENING_HOURS.default.open + 1;
/** Preisniveau des Test-Standorts (Berlin = Bezugspunkt der Euro-Werte). */
const SCALE = getLocationDef(L).scale;
const LAST_MENU_LEVEL = Math.max(...MENU_LEVELS);

const fresh = (): GameState => createInitialState(0);
const patch = (s: GameState, p: Partial<LocationState>): GameState =>
  withLocation(s, L, { ...getLocation(s, L), ...p });
const withCoins = (coins: DecimalSource, s: GameState = fresh()): GameState =>
  patch(s, { coins: D(coins) });
const withMeta = (metaUpgrades: Record<string, number>, s: GameState = fresh()): GameState => ({
  ...s,
  meta: { ...s.meta, metaUpgrades },
});
/** Setzt Geräte-Level (die übrigen wie beim Start) und das Café-Level, das zur Summe passt. */
const withStations = (s: GameState, levels: Record<string, number>): GameState => {
  const loc = getLocation(s, L);
  const stations = { ...loc.stations };
  for (const [id, level] of Object.entries(levels)) stations[id] = { level, unlocked: true };
  const next = { ...loc, stations };
  return withLocation(s, L, { ...next, level: computeCafeLevel(next) });
};
/** Matcha der Sorte `grade` im Lager und im Ausschank. */
const serving = (s: GameState, grade: number): GameState => {
  const supply = getLocation(s, L).supply;
  const stock = supply.stock.map((v, g) => (g === grade ? 1_000 : v));
  return patch(s, { supply: { ...supply, stock, grade } });
};
const stationLevel = (s: GameState, id: string): number =>
  getLocation(s, L).stations[id]?.level ?? 0;
/** Geld ohne die Einnahmen des Laufs: Café-Level-Belohnungen zählen als Einnahme, übrig bleiben die Kosten. */
const netCoins = (s: GameState): number => {
  const loc = getLocation(s, L);
  return loc.coins.sub(loc.earnedThisRun).toNumber();
};
const eventDef = (id: string): RandomEventDef => {
  const def = getRandomEventDef(id);
  if (!def) throw new Error(`Event fehlt: ${id}`);
  return def;
};
/** Ist ein Eintrag der Freischalt-Tabelle im Café verfügbar? */
function isUnlocked(s: GameState, u: Unlock): boolean {
  const loc = getLocation(s, L);
  switch (u.kind) {
    case 'station':
      return isStationUnlocked(s, L, u.id);
    case 'ambience':
      return isAmbienceUnlocked(s, L, u.id);
    case 'staff':
      return isStaffUnlocked(s, L, u.id);
    case 'grade':
      return isGradeUnlocked(loc, Number(u.id));
    case 'video': {
      const def = getVideoFormat(u.id);
      return !!def && isFormatUnlocked(loc, def);
    }
  }
}

describe('Kosten (Euro, Preisniveau des Standorts)', () => {
  it('Level 1→2 der Matcha-Station = Grundpreis × g', () => {
    expect(getStationCost(bar, 1, 1, L).toNumber()).toBeCloseTo(
      bar.baseCost * bar.growth * SCALE,
      9,
    );
  });
  it('ein Gerät ab Level 0 kostet beim Kauf den Grundpreis', () => {
    expect(getStationCost(register, 0, 1, L).toNumber()).toBeCloseTo(register.baseCost * SCALE, 9);
  });
  it('Mehrfachkauf = Summe der Einzelkäufe (geometrische Reihe)', () => {
    let sum = 0;
    for (let l = 5; l < 10; l++) sum += getStationCost(bar, l, 1, L).toNumber();
    expect(getStationCost(bar, 5, 5, L).toNumber()).toBeCloseTo(sum, 6);
  });
  it('skaliert mit dem Preisniveau des Standorts und dem Rabatt', () => {
    const berlin = getStationCost(bar, 1, 1, L).toNumber() / SCALE;
    for (const place of LOCATIONS) {
      expect(getStationCost(bar, 1, 1, place.id).toNumber(), place.id).toBeCloseTo(
        berlin * place.scale,
        9,
      );
    }
    expect(getStationCost(bar, 1, 1, L, 0.5).toNumber()).toBeCloseTo(
      getStationCost(bar, 1, 1, L).toNumber() * 0.5,
      9,
    );
  });
  it('0 Level oder über das Höchstlevel hinaus kostet nichts', () => {
    expect(getStationCost(bar, 3, 0, L).toNumber()).toBe(0);
    const top = bar.maxLevel;
    expect(getStationCost(bar, top - 2, 5, L).toNumber()).toBeCloseTo(
      getStationCost(bar, top - 2, 2, L).toNumber(),
      9,
    );
    expect(getStationCost(bar, top, 1, L).toNumber()).toBe(0);
  });
  it('unbekanntes Gerät oder unbekannter Standort wirft', () => {
    expect(() => getStationDef('nope')).toThrow();
    expect(() => getStationCost(bar, 1, 1, 'nope')).toThrow();
  });
});

describe('Höchstlevel und Max-Kauf', () => {
  it('jedes Gerät endet bei seinem Höchstlevel', () => {
    for (const def of STATIONS) {
      expect(levelsLeft(def, 0), def.id).toBe(def.maxLevel);
      expect(levelsLeft(def, def.maxLevel), def.id).toBe(0);
      expect(levelsLeft(def, def.maxLevel + 3), def.id).toBe(0);
    }
  });
  it('0, wenn das Geld nicht für ein Level reicht – auch im Minus', () => {
    const one = getStationCost(bar, 1, 1, L);
    expect(getMaxAffordable(bar, 1, one.sub(0.01), L)).toBe(0);
    expect(getMaxAffordable(bar, 1, one, L)).toBe(1);
    expect(getMaxAffordable(bar, 1, D(-500), L)).toBe(0);
  });
  it('größtes bezahlbares n, höchstens bis zum Höchstlevel', () => {
    for (const k of [1.5, 4, 20, 80]) {
      const coins = D(bar.baseCost * SCALE * k);
      const n = getMaxAffordable(bar, 1, coins, L);
      expect(getStationCost(bar, 1, n, L).lte(coins)).toBe(true);
      if (n < levelsLeft(bar, 1)) expect(getStationCost(bar, 1, n + 1, L).gt(coins)).toBe(true);
    }
    expect(getMaxAffordable(bar, 1, D('1e30'), L)).toBe(levelsLeft(bar, 1));
    expect(getMaxAffordable(bar, bar.maxLevel, D('1e30'), L)).toBe(0);
  });
  it('Preisniveau und Rabatt zählen mit', () => {
    for (const place of LOCATIONS) {
      const coins = getStationCost(bar, 1, 3, place.id, 0.2);
      expect(getMaxAffordable(bar, 1, coins, place.id, 0.2), place.id).toBe(3);
    }
  });
});

describe('Speisekarte und Preise', () => {
  it('an jedem Optik-Level kommt die nächste Stufe der Karte', () => {
    MENU_LEVELS.forEach((from, i) => {
      expect(menuTierIndex(from)).toBe(i + 1);
      if (from > 1) expect(menuTierIndex(from - 1)).toBe(i);
      expect(menuTier(bar, from)).toBe(bar.menu[i]);
      expect(nextMenuLevel(from)).toBe(MENU_LEVELS[i + 1] ?? null);
      if (from > 1) expect(nextMenuLevel(from - 1)).toBe(from);
    });
    expect(menuTierIndex(0)).toBe(1);
    expect(menuTier(register, LAST_MENU_LEVEL)).toBeNull();
    expect(menuTier(getStationDef('servingStation'), LAST_MENU_LEVEL)).toBeNull();
  });
  it('jede Produktlinie: eine Stufe je Optik-Level, teurer, öfter bestellt, zieht mehr Gäste', () => {
    for (const def of PRODUCT_LINES) {
      expect(def.menu, def.id).toHaveLength(MENU_LEVELS.length);
      // Alle Stufen sind erreichbar.
      expect(def.maxLevel, def.id).toBeGreaterThanOrEqual(LAST_MENU_LEVEL);
      def.menu.forEach((tier, i) => {
        const prev = def.menu[i - 1];
        if (!prev) return;
        expect(tier.price, def.id).toBeGreaterThan(prev.price);
        expect(tier.attach, def.id).toBeGreaterThanOrEqual(prev.attach);
        expect(tier.demand, def.id).toBeGreaterThanOrEqual(prev.demand);
      });
    }
  });
  it('Preis je Stück = Karte × Preisniveau, Matcha-Produkte × Faktor der Sorte', () => {
    for (const lvl of MENU_LEVELS) {
      const price = menuTier(bar, lvl)?.price ?? NaN;
      for (const place of LOCATIONS) {
        expect(getItemPrice(bar, lvl, place.id).toNumber(), place.id).toBeCloseTo(
          price * place.scale * getGradeDef(0).priceMult,
          9,
        );
      }
      for (const g of MATCHA_GRADES) {
        expect(getItemPrice(bar, lvl, L, g.grade).toNumber()).toBeCloseTo(
          price * SCALE * g.priceMult,
          9,
        );
      }
      // Kein Matcha vorrätig (Sorte −1): Kartenpreis ohne Faktor.
      expect(getItemPrice(bar, lvl, L, -1).toNumber()).toBeCloseTo(price * SCALE, 9);
    }
    // Ohne Matcha im Produkt ist die Sorte egal.
    const coffee = getStationDef('coffeeMachine');
    expect(getItemPrice(coffee, 1, L, MAX_GRADE).toNumber()).toBeCloseTo(
      (menuTier(coffee, 1)?.price ?? NaN) * SCALE,
      9,
    );
  });
  it('bessere Sorte, höherer Preis; die Startsorte ist der Kartenpreis', () => {
    expect(getGradeDef(0).priceMult).toBe(1);
    MATCHA_GRADES.forEach((g, i) => {
      const prev = MATCHA_GRADES[i - 1];
      if (prev) expect(g.priceMult).toBeGreaterThan(prev.priceMult);
    });
  });
  it('ohne Level oder ohne Produkt kein Preis', () => {
    expect(getItemPrice(bar, 0, L).toNumber()).toBe(0);
    expect(getItemPrice(register, 5, L).toNumber()).toBe(0);
    expect(getItemPrice(getStationDef('servingStation'), 5, L).toNumber()).toBe(0);
  });
  it('der Bon im Café folgt Karte und Sorte im Ausschank', () => {
    const coffee = getStationDef('coffeeMachine');
    const lvl = MENU_LEVELS[2];
    const s = serving(withStations(fresh(), { matchaStation: lvl, coffeeMachine: 1 }), MAX_GRADE);
    const r = computeLocationRates(s, L, { hour: OPEN_HOUR });
    expect(r.grade).toBe(MAX_GRADE);
    const line = (def: typeof bar, level: number): number =>
      getItemPrice(def, level, L, MAX_GRADE).toNumber() * (menuTier(def, level)?.attach ?? NaN);
    expect(r.avgTicket.toNumber()).toBeCloseTo(line(bar, lvl) + line(coffee, 1), 9);
  });
});

describe('Tempo', () => {
  it('jedes Level über 1 macht das Gerät schneller', () => {
    const per = BALANCE.equipment.speedPerLevel;
    expect(getStationSpeed(bar, 1)).toBe(1);
    for (const lvl of [2, 5, 10, bar.maxLevel]) {
      expect(getStationSpeed(bar, lvl)).toBeCloseTo(1 + (lvl - 1) * per, 9);
      expect(getStationSpeed(bar, lvl)).toBeGreaterThan(getStationSpeed(bar, lvl - 1));
    }
  });
  it('ohne Level: Handkasse, Ausgabe mit Tempo 1, Produktlinie aus', () => {
    expect(getStationSpeed(register, 0)).toBe(BALANCE.order.handRegisterSpeed);
    expect(getStationSpeed(getStationDef('servingStation'), 0)).toBe(1);
    expect(getStationSpeed(bar, 0)).toBe(0);
    expect(getStationWorkMinutes(bar, 0)).toBe(Infinity);
    expect(getStationWorkMinutes(bar, 1)).toBe(bar.workMin);
    expect(getStationWorkMinutes(bar, 10)).toBeCloseTo(bar.workMin / getStationSpeed(bar, 10), 9);
  });
  it('schnellere Geräte: weniger Barista-Zeit je Gast, mehr Bestellungen an der Kasse', () => {
    for (const lvl of [1, MENU_LEVELS[2], bar.maxLevel]) {
      const s = withStations(fresh(), { matchaStation: lvl, register: lvl });
      const r = computeLocationRates(s, L, { hour: OPEN_HOUR });
      const attach = menuTier(bar, lvl)?.attach ?? NaN;
      expect(r.loadPerCustomer).toBeCloseTo((attach * bar.workMin) / getStationSpeed(bar, lvl), 9);
      const cashiers = getLocation(s, L).staff['cashier'] ?? 0;
      expect(r.stages.order).toBeCloseTo(
        (cashiers * getStationSpeed(register, lvl) * 60) / BALANCE.order.orderMin,
        9,
      );
    }
  });
});

describe('Café-Level aus den Geräte-Leveln', () => {
  it('Schwellen aus der Stufen-Tabelle', () => {
    const { steps, stepAfter } = BALANCE.cafeLevel;
    expect(cafeLevelThreshold(1)).toBe(0);
    expect(cafeLevelThreshold(2)).toBe(steps[0]);
    expect(cafeLevelThreshold(3)).toBe((steps[0] ?? 0) + (steps[1] ?? 0));
    const sumSteps = steps.reduce((a, b) => a + b, 0);
    expect(cafeLevelThreshold(steps.length + 3)).toBe(sumSteps + 2 * stepAfter);
  });
  it('Café-Level zur Summe der Geräte-Level, gedeckelt', () => {
    const { max } = BALANCE.cafeLevel;
    expect(cafeLevelFromSum(0)).toBe(1);
    for (let lv = 2; lv <= max; lv++) {
      expect(cafeLevelFromSum(cafeLevelThreshold(lv) - 1)).toBe(lv - 1);
      expect(cafeLevelFromSum(cafeLevelThreshold(lv))).toBe(lv);
    }
    expect(cafeLevelFromSum(99_999)).toBe(max);
  });
  it('ein neues Café: Summe der Start-Level, Café-Level 1', () => {
    const loc = getLocation(fresh(), L);
    const start = STATIONS.reduce((a, d) => a + d.startLevel, 0);
    expect(stationLevelSum(loc)).toBe(start);
    expect(loc.level).toBe(1);
    expect(computeCafeLevel(loc)).toBe(loc.level);
  });
  it('alle Geräte zählen mit', () => {
    const s = withStations(fresh(), { matchaStation: 7, register: 3, coffeeMachine: 2 });
    expect(stationLevelSum(getLocation(s, L))).toBe(12);
    expect(computeCafeLevel(getLocation(s, L))).toBe(cafeLevelFromSum(12));
  });
  it('Fortschritt zum nächsten Café-Level', () => {
    const loc = getLocation(fresh(), L);
    const at = (sum: number): LocationState => ({
      ...loc,
      stations: { matchaStation: { level: sum, unlocked: true } },
    });
    const t3 = cafeLevelThreshold(3);
    const need = cafeLevelThreshold(4) - t3;
    const done = Math.floor(need / 2);
    expect(cafeLevelProgress(at(t3 + done))).toEqual({ done, need });
    expect(cafeLevelProgress(at(t3))).toEqual({ done: 0, need });
    const max = cafeLevelProgress(at(99_999));
    expect(max.done).toBe(max.need);
  });
});

describe('Käufe', () => {
  it('Kauf zieht den Preis ab, erhöht das Level und zählt mit', () => {
    const cost = getStationCost(bar, bar.startLevel, 1, L);
    const s = withCoins(cost.mul(2));
    expect(getBulkCost(s, L, 'matchaStation', 1).toNumber()).toBeCloseTo(cost.toNumber(), 9);
    const after = buyStation(s, L, 'matchaStation', 1);
    const loc = getLocation(after, L);
    expect(stationLevel(after, 'matchaStation')).toBe(bar.startLevel + 1);
    // Noch kein Café-Level-Aufstieg, also keine Belohnung: es fehlt genau der Preis.
    expect(loc.level).toBe(getLocation(s, L).level);
    expect(loc.coins.toNumber()).toBeCloseTo(cost.toNumber(), 9);
    expect(after.stats.levelsBought).toBe(1);
  });
  it('zu wenig Geld, Minus auf dem Konto oder gesperrt: nichts passiert', () => {
    const cost = getStationCost(bar, bar.startLevel, 1, L);
    const poor = withCoins(cost.sub(0.01));
    expect(buyStation(poor, L, 'matchaStation', 1)).toBe(poor);
    // Laufende Kosten können das Konto ins Minus ziehen; dann wird nichts gekauft.
    const broke = withCoins(-250);
    for (const amount of [1, 5, 'max'] as const) {
      expect(buyStation(broke, L, 'matchaStation', amount)).toBe(broke);
    }
    expect(resolveAmount(broke, L, 'matchaStation', 'max')).toBe(0);
    expect(getBulkCost(broke, L, 'matchaStation', 'max').toNumber()).toBe(0);
    const rich = withCoins('1e9');
    const locked = STATIONS.filter((d) => d.unlockCafeLevel > getLocation(rich, L).level);
    expect(locked.length).toBeGreaterThan(0);
    for (const def of locked) {
      expect(isStationUnlocked(rich, L, def.id), def.id).toBe(false);
      expect(buyStation(rich, L, def.id, 1), def.id).toBe(rich);
    }
  });
  it('×5 und Max kaufen mehrere Level auf einmal', () => {
    const five = getStationCost(bar, bar.startLevel, 5, L);
    const s = withCoins(five.mul(2));
    const x5 = buyStation(s, L, 'matchaStation', 5);
    expect(stationLevel(x5, 'matchaStation')).toBe(bar.startLevel + 5);
    expect(x5.stats.levelsBought).toBe(5);
    expect(netCoins(s) - netCoins(x5)).toBeCloseTo(five.toNumber(), 6);
    const rich = withCoins('1e9');
    expect(resolveAmount(rich, L, 'matchaStation', 'max')).toBe(levelsLeft(bar, bar.startLevel));
    const max = buyStation(rich, L, 'matchaStation', 'max');
    expect(stationLevel(max, 'matchaStation')).toBe(bar.maxLevel);
    expect(isStationMaxed(max, L, 'matchaStation')).toBe(true);
  });
  it('×5 ohne genug Geld kauft gar nichts (kein Teilkauf)', () => {
    const s = withCoins(getStationCost(bar, bar.startLevel, 5, L).sub(0.01));
    expect(buyStation(s, L, 'matchaStation', 5)).toBe(s);
  });
  it('Max kauft so viele Level, wie das Geld reicht', () => {
    const two = getStationCost(bar, bar.startLevel, 2, L);
    const s = withCoins(two.add(1));
    expect(resolveAmount(s, L, 'matchaStation', 'max')).toBe(2);
    expect(getBulkCost(s, L, 'matchaStation', 'max').toNumber()).toBeCloseTo(two.toNumber(), 9);
    const after = buyStation(s, L, 'matchaStation', 'max');
    expect(stationLevel(after, 'matchaStation')).toBe(bar.startLevel + 2);
    expect(netCoins(after)).toBeCloseTo(1, 6);
  });
  it('Max mit zu wenig Geld kauft nichts', () => {
    const s = withCoins(1);
    expect(buyStation(s, L, 'matchaStation', 'max')).toBe(s);
  });
  it('am Höchstlevel ist Schluss', () => {
    const s = withStations(withCoins('1e9'), { matchaStation: bar.maxLevel });
    expect(isStationMaxed(s, L, 'matchaStation')).toBe(true);
    expect(isStationMaxed(s, L, 'register')).toBe(false);
    for (const amount of [1, 5, 'max'] as const) {
      expect(resolveAmount(s, L, 'matchaStation', amount)).toBe(0);
      expect(getBulkCost(s, L, 'matchaStation', amount).toNumber()).toBe(0);
      expect(buyStation(s, L, 'matchaStation', amount)).toBe(s);
    }
    // Der Auto-Kauf sucht sich ein anderes Gerät.
    expect(getCheapestStation(s, L)?.id).not.toBe('matchaStation');
  });
  it('×5 kurz vor dem Höchstlevel kauft nur bis zum Höchstlevel', () => {
    const from = bar.maxLevel - 2;
    const s = withStations(withCoins('1e9'), { matchaStation: from });
    expect(resolveAmount(s, L, 'matchaStation', 5)).toBe(2);
    expect(getBulkCost(s, L, 'matchaStation', 5).toNumber()).toBeCloseTo(
      getStationCost(bar, from, 2, L).toNumber(),
      6,
    );
    const after = buyStation(s, L, 'matchaStation', 5);
    expect(stationLevel(after, 'matchaStation')).toBe(bar.maxLevel);
    expect(after.stats.levelsBought).toBe(2);
  });
  it('Café-Level-Aufstieg schaltet frei, was die Freischalt-Tabelle verspricht', () => {
    const target = getStationDef('oven').unlockCafeLevel;
    // Ein Geräte-Level fehlt bis zum Café-Level des Ofens.
    const need = cafeLevelThreshold(target) - 1;
    const reg = Math.min(register.maxLevel, need - 1);
    const before = withStations(fresh(), { register: reg, matchaStation: need - reg });
    const cost = getBulkCost(before, L, 'matchaStation', 1);
    const s = patch(before, { coins: cost.mul(2) });
    expect(getLocation(s, L).level).toBe(target - 1);
    expect(isStationUnlocked(s, L, 'oven')).toBe(false);

    const after = buyStation(s, L, 'matchaStation', 1);
    const loc = getLocation(after, L);
    expect(loc.level).toBe(target);
    // Der Kauf kostet genau seinen Preis, die Belohnung des Aufstiegs kommt als Einnahme dazu.
    expect(netCoins(s) - netCoins(after)).toBeCloseTo(cost.toNumber(), 6);
    expect(loc.earnedThisRun.gt(0)).toBe(true);
    for (const def of STATIONS) {
      expect(loc.stations[def.id]?.unlocked, def.id).toBe(def.unlockCafeLevel <= target);
    }
    for (let lv = 1; lv <= BALANCE.cafeLevel.max; lv++) {
      for (const u of getUnlocksAt(lv)) {
        expect(isUnlocked(after, u), `${u.kind}:${u.id}`).toBe(lv <= target);
      }
    }
  });
});

describe('Modifikatoren', () => {
  it('Standard: alles neutral', () => {
    expect(collectModifiers(fresh())).toEqual({
      spawnMult: 1,
      incomeMult: 1,
      speedMult: 1,
      prestigeMult: 1,
      discount: 0,
      satisfactionBonus: 0,
      stationAttachMult: {},
      tipMult: 1,
      eventSatisfaction: 0,
      qualityPenalty: 0,
    });
  });
  it('aktive Events und Boosts multiplizieren, abgelaufene und fremde nicht', () => {
    const heat = eventDef('heatwave');
    const s: GameState = {
      ...fresh(),
      playtimeSec: 10,
      activeEvents: [
        { id: heat.id, locationId: L, startedAt: 0, until: 20 },
        // abgelaufen bzw. an einem anderen Standort
        { id: 'influencerVisit', locationId: L, startedAt: 0, until: 5 },
        { id: 'rainyDay', locationId: 'kyoto', startedAt: 0, until: 20 },
      ],
      boosts: [
        { id: 'b', until: 30, spawnMult: 1.5, incomeMult: 2, speedMult: 3 },
        { id: 'alt', until: 5, spawnMult: 4, incomeMult: 4, speedMult: 4 },
      ],
    };
    const m = collectModifiers(s);
    expect(m.spawnMult).toBeCloseTo((heat.effect.spawnMult ?? 1) * 1.5, 9);
    expect(m.incomeMult).toBeCloseTo((heat.effect.incomeMult ?? 1) * 2, 9);
    expect(m.speedMult).toBe(3);
    expect(m.stationAttachMult).toEqual(heat.effect.stationAttachMult);
    expect(m.tipMult).toBe(1);
  });
  it('zeitlich begrenzte Multiplikatoren sind gedeckelt', () => {
    const cap = BOOST_RULES.maxMult;
    const s: GameState = {
      ...fresh(),
      boosts: [
        { id: 'a', until: 60, spawnMult: cap, incomeMult: cap, speedMult: cap },
        { id: 'b', until: 60, spawnMult: 2, incomeMult: 2, speedMult: 2 },
      ],
    };
    const m = collectModifiers(s);
    expect(m.spawnMult).toBe(cap);
    expect(m.incomeMult).toBe(cap);
    expect(m.speedMult).toBe(cap);
  });
  it('Zen-Upgrades: Einkommen, Rabatt (gedeckelt) und Zufriedenheit', () => {
    const per = (id: string): number => getMetaUpgradeDef(id).perLevel;
    const m = collectModifiers(withMeta({ globalIncome: 3, discount: 2, satisfactionBase: 4 }));
    expect(m.prestigeMult).toBeCloseTo(1 + 3 * per('globalIncome'), 9);
    expect(m.discount).toBeCloseTo(2 * per('discount'), 9);
    expect(m.satisfactionBonus).toBeCloseTo(4 * per('satisfactionBase'), 9);
    expect(collectModifiers(withMeta({ discount: 1_000 })).discount).toBe(BALANCE.maxDiscount);
  });
  it('Rabatt verbilligt Geräte, auch beim Max-Kauf', () => {
    const d = 3 * getMetaUpgradeDef('discount').perLevel;
    const full = getStationCost(bar, bar.startLevel, 1, L);
    const s = withCoins(getStationCost(bar, bar.startLevel, 1, L, d), withMeta({ discount: 3 }));
    expect(getBulkCost(s, L, 'matchaStation', 1).toNumber()).toBeCloseTo(
      full.toNumber() * (1 - d),
      9,
    );
    // Genau der rabattierte Preis reicht für ein Level, der volle nicht.
    expect(getLocation(s, L).coins.lt(full)).toBe(true);
    expect(resolveAmount(s, L, 'matchaStation', 'max')).toBe(1);
    const after = buyStation(s, L, 'matchaStation', 'max');
    expect(stationLevel(after, 'matchaStation')).toBe(bar.startLevel + 1);
  });
  it('Lieferengpass: der Matcha im Ausschank wirkt Stufen schlechter', () => {
    const shortage = RANDOM_EVENTS.find((e) => (e.effect.qualityPenalty ?? 0) > 0);
    if (!shortage) throw new Error('kein Event mit Lieferengpass');
    const penalty = shortage.effect.qualityPenalty ?? 0;
    const s: GameState = {
      ...serving(fresh(), MAX_GRADE),
      activeEvents: [{ id: shortage.id, locationId: L, startedAt: 0, until: 60 }],
    };
    expect(collectModifiers(s).qualityPenalty).toBe(penalty);
    const r = computeLocationRates(s, L, { hour: OPEN_HOUR });
    expect(r.grade).toBe(MAX_GRADE);
    expect(r.effectiveGrade).toBe(MAX_GRADE - penalty);
    expect(r.avgTicket.toNumber()).toBeCloseTo(
      getItemPrice(bar, bar.startLevel, L, MAX_GRADE - penalty).toNumber() *
        (menuTier(bar, bar.startLevel)?.attach ?? NaN),
      9,
    );
  });
});
