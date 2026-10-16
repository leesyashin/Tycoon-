import { describe, expect, it } from 'vitest';
import { AMBIENCE, getAmbienceDef, startAmbience } from '@data/ambience';
import { BALANCE } from '@data/balance';
import { LOCATIONS, getLocationDef } from '@data/locations';
import { getMetaUpgradeDef } from '@data/prestige';
import { getStationDef } from '@data/stations';
import { OPENING_HOURS } from '@data/time';
import {
  createInitialState,
  createLocationState,
  getLocation,
  withLocation,
  type GameState,
  type LocationState,
} from '@core/GameState';
import {
  buyAmbience,
  computeCafeLevel,
  getAmbienceCost,
  getAmbienceLevel,
  getItemPrice,
  getNextAmbienceCost,
  isAmbienceMaxed,
  isAmbienceUnlocked,
} from '@core/economy';
import {
  capacityPerHour,
  computeLocationRates,
  customerTypeShares,
  regularTipMult,
  rentPerDay,
  tableCount,
  tipRate,
} from '@core/customers';
import { updateSettings } from '@core/settings';
import { clearSave, saveGame, SAVE_KEY, type StorageLike } from '@core/save';
import { D, type DecimalSource } from '@core/math';

const L = 'berlin';
/** Eine Stunde mitten in der Öffnungszeit bzw. die erste geschlossene. */
const OPEN_HOUR = OPENING_HOURS.default.open + 1;
const CLOSED_HOUR = OPENING_HOURS.default.close % 24;
/** Preisniveau des Test-Standorts (Berlin = Bezugspunkt der Euro-Werte). */
const SCALE = getLocationDef(L).scale;

const fresh = (): GameState => createInitialState(0);
const patch = (s: GameState, p: Partial<LocationState>): GameState =>
  withLocation(s, L, { ...getLocation(s, L), ...p });
const withCoins = (coins: DecimalSource, s: GameState = fresh()): GameState =>
  patch(s, { coins: D(coins) });
/** Ambiente-Stufen über den Startstufen setzen. */
const withAmbience = (s: GameState, levels: Record<string, number>): GameState =>
  patch(s, { ambience: { ...startAmbience(), ...levels } });
/** Raten zur Hauptzeit ohne Influencer-Hype (der hängt selbst an der Nachfrage). */
const plainRates = (s: GameState) =>
  computeLocationRates(s, L, { hour: OPEN_HOUR, influencerHype: false });

describe('Ambiente (GAME_DESIGN § 5.1)', () => {
  it('ein neues Café startet mit seinen Startstufen (ein Tisch steht schon)', () => {
    const s = fresh();
    for (const a of AMBIENCE) expect(getAmbienceLevel(s, L, a.id), a.id).toBe(a.startLevel);
    expect(getLocation(s, L).ambience).toEqual(startAmbience());
    for (const place of LOCATIONS) {
      expect(createLocationState(place.id).ambience, place.id).toEqual(startAmbience());
    }
    expect(getAmbienceDef('seats').startLevel).toBeGreaterThan(0);
  });

  it('Kosten = Grundpreis × g^(Stufe − Startstufe) × Preisniveau × (1 − Rabatt)', () => {
    for (const a of AMBIENCE) {
      expect(getAmbienceCost(a, a.startLevel, L).toNumber(), a.id).toBeCloseTo(
        a.baseCost * SCALE,
        9,
      );
      expect(getAmbienceCost(a, a.startLevel + 2, L).toNumber(), a.id).toBeCloseTo(
        a.baseCost * a.growth ** 2 * SCALE,
        6,
      );
      for (const place of LOCATIONS) {
        expect(getAmbienceCost(a, a.startLevel, place.id).toNumber(), place.id).toBeCloseTo(
          a.baseCost * place.scale,
          9,
        );
      }
      expect(getAmbienceCost(a, a.startLevel, L, 0.25).toNumber()).toBeCloseTo(
        a.baseCost * SCALE * 0.75,
        9,
      );
    }
  });

  it('Kauf zieht Geld ab und erhöht die Stufe; die nächste kostet × g', () => {
    const seats = getAmbienceDef('seats');
    const price = seats.baseCost * SCALE;
    const s = withCoins(price * 2);
    expect(getNextAmbienceCost(s, L, 'seats').toNumber()).toBeCloseTo(price, 9);
    const after = buyAmbience(s, L, 'seats');
    expect(getAmbienceLevel(after, L, 'seats')).toBe(seats.startLevel + 1);
    expect(getLocation(after, L).coins.toNumber()).toBeCloseTo(price, 9);
    expect(getNextAmbienceCost(after, L, 'seats').toNumber()).toBeCloseTo(price * seats.growth, 9);
  });

  it('der Zen-Rabatt gilt auch fürs Ambiente', () => {
    const decor = getAmbienceDef('decor');
    const s = fresh();
    const zen = { ...s, meta: { ...s.meta, metaUpgrades: { discount: 4 } } };
    expect(getNextAmbienceCost(zen, L, 'decor').toNumber()).toBeCloseTo(
      decor.baseCost * SCALE * (1 - 4 * getMetaUpgradeDef('discount').perLevel),
      9,
    );
  });

  it('zu wenig Geld oder Minus auf dem Konto: nichts passiert', () => {
    const decor = getAmbienceDef('decor');
    const poor = withCoins(decor.baseCost * SCALE - 0.01);
    expect(buyAmbience(poor, L, 'decor')).toBe(poor);
    const broke = withCoins(-100);
    expect(buyAmbience(broke, L, 'decor')).toBe(broke);
  });

  it('die Höchststufe wird nicht überschritten', () => {
    const terrace = getAmbienceDef('terrace');
    let s = patch(withCoins('1e12'), { level: terrace.unlockCafeLevel });
    for (let i = 0; i < terrace.maxLevel + 2; i++) s = buyAmbience(s, L, 'terrace');
    expect(getAmbienceLevel(s, L, 'terrace')).toBe(terrace.maxLevel);
    expect(isAmbienceMaxed(s, L, 'terrace')).toBe(true);
    expect(buyAmbience(s, L, 'terrace')).toBe(s);
  });

  it('jedes Element ist erst ab seinem Café-Level kaufbar', () => {
    for (const a of AMBIENCE) {
      const below = patch(withCoins('1e12'), { level: a.unlockCafeLevel - 1 });
      expect(isAmbienceUnlocked(below, L, a.id), a.id).toBe(false);
      expect(buyAmbience(below, L, a.id), a.id).toBe(below);
      const at = patch(below, { level: a.unlockCafeLevel });
      expect(isAmbienceUnlocked(at, L, a.id), a.id).toBe(true);
      expect(getAmbienceLevel(buyAmbience(at, L, a.id), L, a.id), a.id).toBe(a.startLevel + 1);
    }
  });

  it('jedes Element hat gültige Werte', () => {
    expect(new Set(AMBIENCE.map((a) => a.id)).size).toBe(AMBIENCE.length);
    for (const a of AMBIENCE) {
      expect(a.growth, a.id).toBeGreaterThan(1);
      expect(a.baseCost, a.id).toBeGreaterThan(0);
      expect(a.startLevel, a.id).toBeGreaterThanOrEqual(0);
      expect(a.maxLevel, a.id).toBeGreaterThan(a.startLevel);
      expect(a.unlockCafeLevel, a.id).toBeGreaterThanOrEqual(1);
    }
    expect(() => getAmbienceDef('nope')).toThrow();
  });
});

describe('Parkplatz', () => {
  it('erst ab seinem Café-Level, dann jede Stufe teurer', () => {
    const parking = getAmbienceDef('parking');
    const locked = patch(withCoins('1e9'), { level: parking.unlockCafeLevel - 1 });
    expect(buyAmbience(locked, L, 'parking')).toBe(locked);
    let s = patch(locked, { level: parking.unlockCafeLevel });
    s = buyAmbience(s, L, 'parking');
    expect(getAmbienceLevel(s, L, 'parking')).toBe(1);
    expect(getLocation(s, L).coins.toNumber()).toBeCloseTo(1e9 - parking.baseCost * SCALE, 3);
    expect(getNextAmbienceCost(s, L, 'parking').toNumber()).toBeCloseTo(
      parking.baseCost * parking.growth * SCALE,
      9,
    );
    for (let i = 0; i < parking.maxLevel + 2; i++) s = buyAmbience(s, L, 'parking');
    expect(getAmbienceLevel(s, L, 'parking')).toBe(parking.maxLevel);
  });

  it('bringt mehr Gäste und kostet Miete', () => {
    const s = fresh();
    const loc = getLocation(s, L);
    for (const n of [1, 3]) {
      const parked = withAmbience(s, { parking: n });
      expect(plainRates(parked).demand / plainRates(s).demand).toBeCloseTo(
        1 + n * BALANCE.demand.perParking,
        9,
      );
      const more = rentPerDay(getLocation(parked, L), L) - rentPerDay(loc, L);
      expect(more).toBeCloseTo(n * BALANCE.rent.perParkingPerDay * SCALE, 9);
      // Die Miete läuft rund um die Uhr, auch wenn das Café geschlossen hat.
      for (const hour of [OPEN_HOUR, CLOSED_HOUR]) {
        const rent = (x: GameState): number =>
          computeLocationRates(x, L, { hour }).rentPerHour.toNumber();
        expect(rent(parked) - rent(s), `${String(hour)} Uhr`).toBeCloseTo(more / 24, 9);
      }
    }
  });
});

describe('Wirkung der Elemente', () => {
  it('Tische und Terrasse fassen mehr Gäste', () => {
    const c = BALANCE.capacity;
    const loc = getLocation(fresh(), L);
    expect(tableCount(loc)).toBe(getAmbienceDef('seats').startLevel);
    expect(capacityPerHour(loc)).toBeCloseTo(
      c.takeawayPerHour + tableCount(loc) * c.perTablePerHour,
      9,
    );
    const terrace = getAmbienceDef('terrace').maxLevel;
    const big: LocationState = { ...loc, ambience: { seats: 4, terrace } };
    expect(tableCount(big)).toBe(4 + (c.terraceTables[terrace] ?? NaN));
    expect(capacityPerHour(big)).toBeCloseTo(
      c.takeawayPerHour + tableCount(big) * c.perTablePerHour,
      9,
    );
  });

  it('Deko und WLAN ziehen Gäste an, Deko macht zufriedener', () => {
    const s = fresh();
    const base = plainRates(s);
    const decor = plainRates(withAmbience(s, { decor: 5 }));
    expect(decor.demand / base.demand).toBeCloseTo(1 + 5 * BALANCE.demand.perDecor, 9);
    expect(decor.satisfaction.decor).toBeCloseTo(5 * BALANCE.satisfaction.perDecor, 9);
    const wifi = plainRates(withAmbience(s, { wifi: 3 }));
    expect(wifi.demand / base.demand).toBeCloseTo(1 + 3 * BALANCE.demand.perWifi, 9);
  });

  it('Musik hebt das Trinkgeld', () => {
    const loc = getLocation(fresh(), L);
    const music: LocationState = { ...loc, ambience: { ...loc.ambience, music: 4 } };
    expect(tipRate(music, L) - tipRate(loc, L)).toBeCloseTo(
      4 * BALANCE.tips.perMusicLevel * regularTipMult(customerTypeShares(L).regular),
      9,
    );
  });

  it('die Terrasse kostet Miete', () => {
    const loc = getLocation(fresh(), L);
    const terrace: LocationState = { ...loc, ambience: { ...loc.ambience, terrace: 2 } };
    expect(rentPerDay(terrace, L) - rentPerDay(loc, L)).toBeCloseTo(
      2 * BALANCE.rent.perTerracePerDay * SCALE,
      9,
    );
  });
});

describe('Einnahmen je Gerät', () => {
  const BOOST = 2;
  /** Café mit vier Produktlinien, einer Bedienung (Trinkgeld am Tisch) und einem Einnahmen-Boost. */
  const busy = (): GameState => {
    const s = fresh();
    const loc = getLocation(s, L);
    const stations = { ...loc.stations };
    const levels = { matchaStation: 10, coffeeMachine: 5, oven: 3, displayCase: 2 };
    for (const [id, level] of Object.entries(levels)) stations[id] = { level, unlocked: true };
    const next: LocationState = { ...loc, stations, staff: { ...loc.staff, waiter: 1 } };
    return {
      ...withLocation(s, L, { ...next, level: computeCafeLevel(next) }),
      boosts: [{ id: 'leaf', until: 60, spawnMult: 1, incomeMult: BOOST, speedMult: 1 }],
    };
  };

  it('summieren sich zum Umsatz (mit Trinkgeld und Boosts)', () => {
    const s = busy();
    const r = computeLocationRates(s, L, { hour: OPEN_HOUR });
    expect(r.tableServiceShare).toBeGreaterThan(0);
    const sum = Object.values(r.perStationIncome).reduce((a, b) => a.add(b), D(0));
    expect(sum.toNumber()).toBeCloseTo(r.incomePerHour.toNumber(), 6);
    expect(Object.keys(r.perStationIncome).sort()).toEqual(
      ['matchaStation', 'coffeeMachine', 'oven', 'displayCase'].sort(),
    );
    // Je Gerät: Preis × bestellte Stück × (1 + Trinkgeld) × Boost.
    const loc = getLocation(s, L);
    for (const [id, pieces] of Object.entries(r.perStation)) {
      const level = loc.stations[id]?.level ?? 0;
      const price = getItemPrice(getStationDef(id), level, L, r.effectiveGrade);
      expect(r.perStationIncome[id]?.toNumber(), id).toBeCloseTo(
        price.toNumber() * pieces * (1 + r.tipRate) * BOOST,
        6,
      );
      expect(pieces, id).toBeGreaterThan(0);
    }
  });

  it('geschlossen: kein Umsatz, an keinem Gerät', () => {
    const r = computeLocationRates(busy(), L, { hour: CLOSED_HOUR });
    expect(r.open).toBe(false);
    expect(r.incomePerHour.toNumber()).toBe(0);
    for (const v of Object.values(r.perStationIncome)) expect(v.toNumber()).toBe(0);
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
