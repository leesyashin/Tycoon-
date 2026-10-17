import { describe, expect, it } from 'vitest';
import {
  createDayLedger,
  createInitialState,
  createLocationState,
  createStats,
  createSupply,
  getLocation,
  withLocation,
  SCHEMA_VERSION,
  type GameState,
} from '@core/GameState';
import { D } from '@core/math';
import { cafeLevelFromSum, cafeLevelThreshold, getOfflineCapMs } from '@core/economy';
import { tick } from '@core/GameLoop';
import { orderMatcha } from '@core/supply';
import { postVideo } from '@core/social';
import { clampHours, dayOf } from '@core/time';
import {
  SAVE_KEY,
  SaveError,
  clearSave,
  deserialize,
  exportFilename,
  exportSave,
  forwardTime,
  importSave,
  loadGame,
  loadWithOffline,
  migrate,
  migrations,
  saveGame,
  serialize,
  type StorageLike,
} from '@core/save';
import { startAmbience } from '@data/ambience';
import { AUDIO_DEFAULTS } from '@data/audio';
import { BALANCE } from '@data/balance';
import { getLocationDef } from '@data/locations';
import { DELIVERY, MATCHA_GRADES, MAX_GRADE } from '@data/matcha';
import { SOCIAL } from '@data/social';
import { STATIONS } from '@data/stations';
import { foundingStaff, getStaffDef } from '@data/staff';
import { OPENING_HOURS, TIME } from '@data/time';

class MemStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

type Json = Record<string, unknown>;
const L = 'berlin';
/** Ein einzelner Migrationsschritt `from → from + 1`. */
const step = (from: number, raw: Json): Json => {
  const f = migrations[from];
  if (!f) throw new Error(`keine Migration ab v${String(from)}`);
  return f(raw);
};
/** Spielstand als rohes JSON (wie im Speicher). */
const rawOf = (s: GameState = createInitialState(0)): Json => JSON.parse(serialize(s)) as Json;
const locsOf = (raw: Json): Record<string, Json> => raw['locations'] as Record<string, Json>;
const berlinOf = (raw: Json): Json => locsOf(raw)['berlin'] ?? {};

describe('Serialisierung', () => {
  it('Roundtrip erhält Decimals, auch sehr große', () => {
    let s = createInitialState(1000, 'de');
    s = {
      ...s,
      locations: { berlin: { ...getLocation(s, 'berlin'), coins: D('1.2345e300') } },
      meta: { ...s.meta, zen: D(42), lifetimeEarned: D('7e50') },
    };
    const back = deserialize(serialize(s));
    expect(getLocation(back, 'berlin').coins.eq(D('1.2345e300'))).toBe(true);
    expect(back.meta.zen.toNumber()).toBe(42);
    expect(back.meta.lifetimeEarned.eq(D('7e50'))).toBe(true);
    expect(back.settings.lang).toBe('de');
    expect(serialize(back)).toBe(serialize(s));
  });
  it('Decimals stehen als Strings im JSON', () => {
    const json = JSON.parse(serialize(createInitialState(0))) as {
      locations: {
        berlin: {
          coins: unknown;
          till: { open: unknown };
          bills: { pending: unknown; last: unknown };
          ledger: { today: { revenue: unknown; wages: unknown } };
        };
      };
      schemaVersion: number;
    };
    const b = json.locations.berlin;
    for (const v of [b.coins, b.till.open, b.bills.pending, b.bills.last, b.ledger.today.revenue])
      expect(typeof v).toBe('string');
    expect(typeof b.ledger.today.wages).toBe('string');
    expect(json.schemaVersion).toBe(SCHEMA_VERSION);
  });
  it('Roundtrip nach Simulation', () => {
    const s = tick(createInitialState(0), 5000);
    expect(serialize(deserialize(serialize(s)))).toBe(serialize(s));
  });
  it('Roundtrip der Phase-3-Felder: Spieluhr, Lieferungen, Videos, Tagesbilanz, offene Kosten', () => {
    let s = createInitialState(0);
    const start = getLocation(s, L);
    // Ohne automatische Nachbestellung: genau die beiden Bestellungen dieses Tests.
    s = withLocation(s, L, {
      ...start,
      coins: D(5000),
      supply: { ...start.supply, autoReorder: false },
    });
    s = orderMatcha(s, L, 0, 0, true); // Express, kommt nach ein paar Spielstunden
    s = tick(s, 700_000); // über Mitternacht: gestern hat eine Bilanz, die Lieferung ist da
    s = orderMatcha(s, L, 0, 1); // normale Lieferung, noch unterwegs
    s = postVideo(s, L, 'latteArt');
    s = tick(s, 30_000); // mitten in einer Stunde: Kosten seit der letzten vollen Stunde stehen noch offen
    const l = getLocation(s, L);
    expect(dayOf(s.clock)).toBe(1);
    expect(l.supply.delivered).toBe(1);
    expect(l.supply.orders).toHaveLength(1);
    expect(l.social.recent).toHaveLength(1);
    expect(l.ledger.yesterday?.revenue.gt(0)).toBe(true);
    expect(l.ledger.today.matcha.gt(0)).toBe(true);
    expect(l.bills.pending.gt(0)).toBe(true);
    expect(l.bills.count).toBeGreaterThan(0);

    const back = deserialize(serialize(s));
    expect(serialize(back)).toBe(serialize(s));
    const b = getLocation(back, L);
    expect(back.clock).toBe(s.clock);
    expect(back.hourMark).toBe(s.hourMark);
    expect(b.hours).toEqual(l.hours);
    expect(b.supply).toEqual(l.supply);
    expect(b.social).toEqual(l.social);
    expect(b.ledger.day).toBe(l.ledger.day);
    expect(b.ledger.yesterday?.revenue.eq(l.ledger.yesterday?.revenue ?? D(-1))).toBe(true);
    expect(b.ledger.yesterday?.guests).toBeCloseTo(l.ledger.yesterday?.guests ?? -1, 9);
    expect(b.ledger.today.matcha.eq(l.ledger.today.matcha)).toBe(true);
    expect(b.ledger.today.marketing.eq(l.ledger.today.marketing)).toBe(true);
    expect(b.bills.pending.eq(l.bills.pending)).toBe(true);
    expect(b.bills.last.eq(l.bills.last)).toBe(true);
    expect(b.bills.count).toBe(l.bills.count);
    expect(b.till.open.eq(l.till.open)).toBe(true);
  });
  it('Härtung der Phase-3-Felder', () => {
    const raw = rawOf();
    raw['clock'] = -100;
    const b = berlinOf(raw);
    b['hours'] = { open: 2, close: 99 };
    const order = { grade: 0, grams: 250, arriveAt: 900, express: false };
    b['supply'] = {
      stock: [-5, 'x', 30],
      grade: 99,
      orders: [
        { grade: 99, grams: 10, arriveAt: 5 },
        { grade: 0, grams: -3, arriveAt: 5 },
        { grade: 1, grams: 250, arriveAt: 1e12, express: 'ja' },
        ...Array.from({ length: DELIVERY.maxOrders + 2 }, () => order),
      ],
      autoPackage: 42,
      bestGrade: 99,
      delivered: -1,
    };
    b['social'] = {
      followers: -10,
      buzz: 'x',
      postsToday: 99,
      bonusToday: -1,
      recent: [
        { format: 'nope', minute: 1, views: 5, followers: 1 },
        { format: 'latteArt', minute: 3, views: -5, followers: 2, viral: 'ja' },
      ],
    };
    b['bills'] = { pending: '-50', last: '12.5', count: -2 };
    b['ledger'] = 'kaputt';
    b['till'] = { open: '-3', progress: 7, paid: 2.7 };
    const s = deserialize(JSON.stringify(raw));
    const l = getLocation(s, L);
    expect(s.clock).toBe(0);
    expect(s.hourMark).toBe(0);
    expect(l.hours).toEqual(clampHours({ open: 2, close: 99 }));
    expect(l.hours).toEqual({ open: OPENING_HOURS.earliestOpen, close: OPENING_HOURS.latestClose });
    expect(l.supply.stock).toEqual(MATCHA_GRADES.map((_, i) => (i === 2 ? 30 : 0)));
    expect(l.supply.grade).toBe(0);
    // Nur gültige Bestellungen, keine später als zwei Spieltage, höchstens so viele wie erlaubt.
    expect(l.supply.orders).toHaveLength(DELIVERY.maxOrders);
    expect(l.supply.orders[0]).toEqual({
      grade: 1,
      grams: 250,
      arriveAt: s.clock + 2 * TIME.minutesPerDay,
      express: false,
    });
    expect(l.supply.autoPackage).toBe(createSupply().autoPackage);
    expect(l.supply.bestGrade).toBe(MAX_GRADE);
    expect(l.supply.delivered).toBe(0);
    expect(l.social).toEqual({
      followers: 0,
      buzz: 0,
      day: 0,
      postsToday: SOCIAL.postsPerDay,
      bonusToday: 0,
      count: 0,
      recent: [{ format: 'latteArt', minute: 3, views: 0, followers: 2, viral: false }],
    });
    expect(l.bills.pending.toNumber()).toBe(0);
    expect(l.bills.last.toNumber()).toBe(12.5);
    expect(l.bills.count).toBe(0);
    expect(l.ledger).toEqual({ day: 0, today: createDayLedger(), yesterday: null });
    expect(l.till.open.toNumber()).toBe(0);
    expect(l.till.progress).toBe(1);
    expect(l.till.paid).toBe(2);
    // Kaputte Beträge in der Tagesbilanz sind ein kaputter Save.
    berlinOf(raw)['ledger'] = { day: 0, today: { revenue: 'viel' } };
    expect(() => deserialize(JSON.stringify(raw))).toThrow(SaveError);
  });
  it('lehnt kaputte Saves ab', () => {
    expect(() => deserialize('{nope')).toThrow(SaveError);
    expect(() => deserialize('[]')).toThrow(SaveError);
    expect(() => deserialize('"x"')).toThrow(SaveError);
    const s = rawOf();
    expect(() => deserialize(JSON.stringify({ ...s, locations: 5 }))).toThrow(SaveError);
    expect(() => deserialize(JSON.stringify({ ...s, activeLocationId: 'mars' }))).toThrow(
      SaveError,
    );
    const bad = JSON.parse(serialize(createInitialState(0))) as {
      meta: { zen: unknown };
    };
    bad.meta.zen = 'abc';
    expect(() => deserialize(JSON.stringify(bad))).toThrow(SaveError);
    bad.meta.zen = { x: 1 };
    expect(() => deserialize(JSON.stringify(bad))).toThrow(SaveError);
    const badLoc = JSON.parse(serialize(createInitialState(0))) as {
      locations: { berlin: unknown };
    };
    badLoc.locations.berlin = 3;
    expect(() => deserialize(JSON.stringify(badLoc))).toThrow(SaveError);
  });
  it('setzt fehlende Zahlen auf Default', () => {
    const s = rawOf();
    s['playtimeSec'] = 'kaputt';
    delete s['clock'];
    const back = deserialize(JSON.stringify(s));
    expect(back.playtimeSec).toBe(0);
    expect(back.clock).toBe(TIME.startMinute);
  });
});

describe('Migration', () => {
  const v0 = {
    createdAt: 5,
    lastSavedAt: 9,
    coins: '1234.5',
    stationLevels: { matchaBar: 7, checkout: 0 },
    playtimeSec: 60,
  };
  it('für jede Version genau ein Schritt, jeder hebt um eins', () => {
    expect(migrations).toHaveLength(SCHEMA_VERSION);
    migrations.forEach((m, i) => {
      expect(m({ schemaVersion: i })['schemaVersion'], `v${String(i)}`).toBe(i + 1);
    });
  });
  it('v0 → v1: flaches Ur-Format wird Berlin mit Meta', () => {
    const m = step(0, v0);
    expect(m['schemaVersion']).toBe(1);
    expect(m['lastSavedAt']).toBe(9);
    expect(m['playtimeSec']).toBe(60);
    expect(m['activeLocationId']).toBe('berlin');
    const berlin = berlinOf(m);
    expect(berlin['coins']).toBe('1234.5');
    expect(berlin['stations']).toEqual({
      matchaBar: { level: 7, unlocked: true },
      checkout: { level: 0, unlocked: false },
    });
    expect(m['meta']).toMatchObject({ lifetimeEarned: '1234.5', unlockedLocations: ['berlin'] });
  });
  it('v0 bis heute: Zeiten und Standort bleiben, das Café startet in Phase 3 neu', () => {
    const s = deserialize(JSON.stringify(v0));
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.createdAt).toBe(5);
    expect(s.lastSavedAt).toBe(9);
    expect(s.playtimeSec).toBe(60);
    expect(s.meta.unlockedLocations).toEqual(['berlin']);
    expect(getLocation(s, 'berlin')).toEqual(createLocationState('berlin'));
  });
  it('v0 mit fehlenden Feldern bekommt Defaults', () => {
    expect(berlinOf(step(0, {}))['coins']).toBe('0');
    const s = deserialize('{}');
    expect(getLocation(s, 'berlin').coins.toNumber()).toBe(BALANCE.startCoins);
    expect(s.createdAt).toBe(0);
  });
  it('v1 → v2 ergänzt den Tap-Zustand und behält alles andere', () => {
    const v1 = rawOf();
    v1['schemaVersion'] = 1;
    delete v1['tap'];
    (v1['meta'] as Json)['zen'] = '42';
    expect(step(1, v1)).toEqual({
      ...v1,
      schemaVersion: 2,
      tap: { hype: 0, windowStart: 0, windowTaps: 0 },
    });
    const s = deserialize(JSON.stringify(v1));
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.tap).toEqual({ hype: 0, windowStart: 0, windowTaps: 0 });
    expect(s.meta.zen.toNumber()).toBe(42);
  });
  it('kaputter Tap-Zustand wird auf gültige Werte gesetzt', () => {
    const raw = rawOf();
    raw['tap'] = { hype: -3, windowStart: 'x' };
    expect(deserialize(JSON.stringify(raw)).tap).toEqual({
      hype: 0,
      windowStart: 0,
      windowTaps: 0,
    });
  });
  it('Saves aus der Zukunft werden abgelehnt', () => {
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION + 1 })).toThrow(SaveError);
  });
  it('aktuelle Version bleibt unverändert', () => {
    const raw = rawOf();
    expect(migrate(raw)).toBe(raw);
  });
});

describe('Storage und Export', () => {
  it('speichert und lädt', () => {
    const st = new MemStorage();
    expect(loadGame(st)).toBeNull();
    const saved = saveGame(st, createInitialState(0), 777);
    expect(saved.lastSavedAt).toBe(777);
    expect(SAVE_KEY).toBe(`mce.save.v${String(SCHEMA_VERSION)}`);
    expect(st.getItem(SAVE_KEY)).not.toBeNull();
    expect(loadGame(st)?.lastSavedAt).toBe(777);
    clearSave(st);
    expect(loadGame(st)).toBeNull();
  });
  it('liest den alten v0-Schlüssel und migriert', () => {
    const st = new MemStorage();
    st.setItem('mce.save.v0', JSON.stringify({ coins: '10', stationLevels: { matchaBar: 2 } }));
    expect(loadGame(st)?.schemaVersion).toBe(SCHEMA_VERSION);
  });
  it('liest den alten v1-Schlüssel und migriert', () => {
    const st = new MemStorage();
    const v1 = rawOf();
    v1['schemaVersion'] = 1;
    delete v1['tap'];
    st.setItem('mce.save.v1', JSON.stringify(v1));
    expect(loadGame(st)?.tap.hype).toBe(0);
  });
  it('Laden bringt den Offline-Betrieb und setzt lastSavedAt', () => {
    const st = new MemStorage();
    saveGame(st, createInitialState(0), 1000);
    expect(loadWithOffline(new MemStorage(), 5000)).toBeNull();
    const r = loadWithOffline(st, 1000 + 3_600_000);
    if (!r) throw new Error('kein Stand');
    // Eine Stunde weg: angerechnet bis zum Deckel (Spieltage in echter Zeit).
    expect(r.offline.creditedMs).toBe(Math.min(3_600_000, getOfflineCapMs(createInitialState(0))));
    expect(r.offline.revenue.gt(0)).toBe(true);
    expect(r.offline.guests).toBeGreaterThan(0);
    expect(r.state.clock).toBeGreaterThan(createInitialState(0).clock);
    // Netto = Geld danach − vorher (Umsatz minus Löhne, Miete, Ware).
    const before = createInitialState(0);
    expect(r.offline.earned.toNumber()).toBeCloseTo(
      getLocation(r.state, L).coins.sub(getLocation(before, L).coins).toNumber(),
      6,
    );
    expect(r.state.lastSavedAt).toBe(1000 + 3_600_000);
  });
  it('Uhr zurückgestellt → keine negativen Einnahmen', () => {
    const st = new MemStorage();
    saveGame(st, createInitialState(0), 10_000);
    const r = loadWithOffline(st, 5_000);
    expect(r?.offline.creditedMs).toBe(0);
    expect(r?.offline.earned.toNumber()).toBe(0);
  });
  it('Export/Import-Roundtrip und Dateiname', () => {
    const s = tick(createInitialState(0), 3000);
    expect(serialize(importSave(exportSave(s)))).toBe(serialize(s));
    expect(exportFilename(Date.UTC(2026, 9, 14))).toBe('matcha-cafe-empire-2026-10-14.json');
  });
  it('Import ohne Standorte schlägt fehl', () => {
    const raw = rawOf();
    raw['locations'] = {};
    raw['activeLocationId'] = 'x';
    expect(() => importSave(JSON.stringify(raw))).toThrow(SaveError);
  });
});

describe('Save v7 (Lautstärke, S8)', () => {
  it('Migration v6 → v7 setzt Standard-Lautstärken und behält die Schalter', () => {
    const v6 = rawOf(createInitialState(0, 'de'));
    v6['schemaVersion'] = 6;
    v6['settings'] = { lang: 'de', sfx: false, music: true, numberFormat: 'scientific' };
    const expected = {
      lang: 'de',
      sfx: false,
      music: true,
      sfxVolume: AUDIO_DEFAULTS.sfxVolume,
      musicVolume: AUDIO_DEFAULTS.musicVolume,
      numberFormat: 'scientific',
    };
    expect(step(6, v6)['settings']).toEqual(expected);
    // Einstellungen überleben die ganze Kette.
    const s = deserialize(JSON.stringify(v6));
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.settings).toEqual(expected);
  });
  it('liest den alten v6-Schlüssel', () => {
    const st = new MemStorage();
    const v6 = rawOf();
    v6['schemaVersion'] = 6;
    st.setItem('mce.save.v6', JSON.stringify(v6));
    expect(loadGame(st)?.settings.musicVolume).toBe(AUDIO_DEFAULTS.musicVolume);
  });
  it('Härtung: Lautstärke geklemmt, unbekannte Werte auf Standard', () => {
    const raw = rawOf();
    raw['settings'] = { lang: 'xx', sfx: 'ja', sfxVolume: 7, musicVolume: -1, numberFormat: 1 };
    const s = deserialize(JSON.stringify(raw)).settings;
    expect(s).toMatchObject({ lang: 'en', sfx: true, sfxVolume: 1, musicVolume: 0 });
    expect(s.numberFormat).toBe('short');
  });
});

describe('Save v8 (Tutorial, Café-Level-Stufen, S9)', () => {
  const v7 = (): Json => {
    const raw = rawOf();
    raw['schemaVersion'] = 7;
    delete raw['tutorial'];
    return raw;
  };
  it('Neues Spiel startet mit Tutorial-Schritt 0', () => {
    expect(createInitialState(0).tutorial).toEqual({ step: 0, done: false });
  });
  it('Migration v7 → v8: Bestandsspieler haben das Tutorial erledigt', () => {
    const m = step(7, v7());
    expect(m['schemaVersion']).toBe(8);
    expect(m['tutorial']).toEqual({ step: 0, done: true });
  });
  it('Migration v7 → v8 berechnet das Café-Level neu, der Bestwert bleibt', () => {
    const raw = v7();
    const berlin = berlinOf(raw);
    const stations = berlin['stations'] as Record<string, { level: number; unlocked: boolean }>;
    stations['matchaStation'] = { level: cafeLevelThreshold(4), unlocked: true };
    berlin['level'] = 9;
    berlin['bestLevel'] = 9;
    const m = berlinOf(step(7, raw));
    expect(m['level']).toBe(cafeLevelFromSum(cafeLevelThreshold(4)));
    expect(m['level']).toBe(4);
    expect(m['bestLevel']).toBe(9);
  });
  it('liest den alten v7-Schlüssel', () => {
    const st = new MemStorage();
    const raw = v7();
    (raw['meta'] as Json)['goldenLeaves'] = '12';
    st.setItem('mce.save.v7', JSON.stringify(raw));
    const s = loadGame(st);
    expect(s?.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s?.meta.goldenLeaves.toNumber()).toBe(12);
  });
  it('Härtung: kaputter Tutorial-Stand gilt als erledigt, Schritt geklemmt', () => {
    const raw = rawOf();
    raw['tutorial'] = 'kaputt';
    expect(deserialize(JSON.stringify(raw)).tutorial.done).toBe(true);
    raw['tutorial'] = { step: -3, done: false };
    expect(deserialize(JSON.stringify(raw)).tutorial).toEqual({ step: 0, done: false });
    raw['tutorial'] = { step: 999, done: false };
    expect(deserialize(JSON.stringify(raw)).tutorial.done).toBe(true);
  });
});

describe('Save v9 (Phase 2: Ausstattung, Personal als Köpfe)', () => {
  /** Echter v8-Spielstand: alte Stations-IDs, Personal als Stufen, Bäcker und Tee-Meister. */
  const v8 = (): Json => {
    const raw = rawOf();
    raw['schemaVersion'] = 8;
    const berlin = berlinOf(raw);
    berlin['stations'] = {
      matchaBar: { level: 40, unlocked: true },
      checkout: { level: 12, unlocked: true },
      togoWindow: { level: 9, unlocked: true },
      icedBar: { level: 0, unlocked: true },
      bakery: { level: 0, unlocked: false },
      merchShelf: { level: 0, unlocked: false },
      ceremonyCorner: { level: 0, unlocked: false },
      workshopRoom: { level: 0, unlocked: false },
    };
    berlin['level'] = 3;
    berlin['bestLevel'] = 3;
    berlin['staff'] = { barista: 4, cashier: 2, baker: 1, teaMaster: 1, cleaner: 2, manager: 1 };
    raw['tutorial'] = { step: 3, done: false };
    return raw;
  };
  const migrated = (raw: Json): Json => berlinOf(step(8, raw));
  it('benennt die Ausstattung um, ergänzt die Ausgabe-Station und behält die Level', () => {
    const m = step(8, v8());
    expect(m['schemaVersion']).toBe(9);
    const stations = berlinOf(m)['stations'] as Record<string, unknown>;
    expect(stations['matchaStation']).toEqual({ level: 40, unlocked: true });
    expect(stations['register']).toEqual({ level: 12, unlocked: true });
    expect(stations['coffeeMachine']).toEqual({ level: 9, unlocked: true });
    expect(stations['iceBox']).toEqual({ level: 0, unlocked: true });
    expect(stations['oven']).toEqual({ level: 0, unlocked: false });
    expect(stations['ceremonySet']).toEqual({ level: 0, unlocked: false });
    expect(stations['servingStation']).toEqual({ level: 0, unlocked: false });
    expect(stations['matchaBar']).toBeUndefined();
    expect(berlinOf(m)['level']).toBe(3);
  });
  it('übersetzt Personal-Stufen in Köpfe: Bäcker und Tee-Meister werden Baristas, Bedienungen wie Verkäufer', () => {
    expect(migrated(v8())['staff']).toEqual({
      cashier: 2,
      barista: 6,
      waiter: 2,
      cleaner: 2,
      manager: 1,
    });
  });
  it('ohne Personal gibt es mindestens das Gründungsteam; Köpfe sind gedeckelt', () => {
    const raw = v8();
    berlinOf(raw)['staff'] = { barista: 15, baker: 10 };
    expect(migrated(raw)['staff']).toEqual({
      cashier: 1,
      barista: getStaffDef('barista').maxLevel,
      waiter: 1,
    });
  });
  it('ein angefangenes Tutorial beginnt neu, ein erledigtes bleibt erledigt', () => {
    expect(step(8, v8())['tutorial']).toEqual({ step: 0, done: false });
    const raw = v8();
    raw['tutorial'] = { step: 8, done: true };
    expect(step(8, raw)['tutorial']).toEqual({ step: 8, done: true });
  });
  it('liest den alten v8-Schlüssel', () => {
    const st = new MemStorage();
    st.setItem('mce.save.v8', JSON.stringify(v8()));
    const s = loadGame(st);
    expect(s?.schemaVersion).toBe(SCHEMA_VERSION);
    // Phase 3 startet das Café neu: das Personal ist das Gründungsteam.
    expect(getLocation(s ?? createInitialState(0), L).staff).toEqual(foundingStaff());
  });
});

describe('Save v11 (Phase 3: realistisches Café)', () => {
  /** Café aus Phase 2: Tycoon-Zahlen, Qualität und Marketing, offene Bons, Level weit über 20. */
  const phase2Cafe = (prestigeCount: unknown): Json => ({
    coins: '1.5e30',
    earnedThisRun: '4e29',
    level: 25,
    stations: Object.fromEntries(STATIONS.map((d) => [d.id, { level: 120, unlocked: true }])),
    ambience: { seats: 30, decor: 40, music: 20, terrace: 3 },
    staff: { cashier: 6, barista: 18, waiter: 5, cleaner: 3, manager: 5, socialMedia: 2 },
    quality: 4,
    satisfaction: 88,
    cleanliness: 70,
    marketing: { level: 12, campaignUntil: 6000 },
    autoBuy: true,
    prestigeCount,
    bestLevel: 30,
    till: { open: '1234', progress: 0.5, paid: 77 },
  });
  /** Echter v10-Spielstand (ohne Spieluhr) mit zwei Cafés, Meta-Fortschritt und laufendem Boost. */
  const v10 = (): Json => ({
    schemaVersion: 10,
    createdAt: 1000,
    lastSavedAt: 5000,
    playtimeSec: 7200,
    settings: {
      lang: 'de',
      sfx: false,
      music: true,
      sfxVolume: 0.3,
      musicVolume: 0.2,
      numberFormat: 'scientific',
    },
    meta: {
      goldenLeaves: '77',
      zen: '1234',
      metaUpgrades: { globalIncome: 3, startCapital: 1 },
      achievements: { served1: { unlockedAt: 5 }, campaigns1: { unlockedAt: 6 } },
      lifetimeEarned: '5e40',
      unlockedLocations: ['berlin', 'kyoto'],
      skins: { owned: ['sakuraBar'], equipped: ['sakuraBar'] },
    },
    activeLocationId: 'kyoto',
    locations: { berlin: phase2Cafe(3), kyoto: phase2Cafe(0) },
    activeEvents: [{ id: 'heatwave', locationId: 'berlin', startedAt: 7000, until: 7300 }],
    calendarEvents: ['hanami'],
    eventSchedule: { seed: 42, count: 7, nextAt: 8000 },
    boosts: [{ id: 'leaf', until: 9000, spawnMult: 1, incomeMult: 2, speedMult: 1 }],
    freeBoostAt: 7500,
    leafDrops: { date: '2026-10-15', count: 2, fraction: 0.5 },
    quests: {
      date: '2026-10-15',
      items: [
        { id: 'campaign1', base: 1, progress: 0, claimed: false },
        { id: 'serve500', base: 10, progress: 200, claimed: false },
      ],
      bonusClaimed: false,
    },
    tap: { hype: 12, windowStart: 7100, windowTaps: 3 },
    stats: {
      customersServed: 12345,
      levelsBought: 400,
      taps: 999,
      hypeFills: 30,
      campaigns: 4,
      resets: 3,
      events: 9,
      questsCompleted: 11,
      highSatisfactionSec: 0,
      highSatisfactionBestSec: 650,
      leavesEarned: 120,
    },
    tutorial: { step: 8, done: true },
  });
  const load = (raw: Json = v10()): GameState => deserialize(JSON.stringify(raw));

  it('Schritt v10 → v11: Version 11, Spieluhr kurz vor der ersten Öffnung', () => {
    const m = step(10, v10());
    expect(m['schemaVersion']).toBe(11);
    expect(m['clock']).toBe(TIME.startMinute);
    expect(m['hourMark']).toBe(Math.floor(TIME.startMinute / 60));
    expect(Object.keys(locsOf(m))).toEqual(['berlin', 'kyoto']);
    const s = load();
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.clock).toBe(TIME.startMinute);
    expect(s.hourMark).toBe(Math.floor(TIME.startMinute / 60));
  });
  it('jedes Café startet neu: Startkapital × Preisniveau, ein Tisch, du an der Kasse und ein Barista', () => {
    const s = load();
    for (const [id, prestigeCount] of [
      ['berlin', 3],
      ['kyoto', 0],
    ] as const) {
      const l = getLocation(s, id);
      const { coins, ...rest } = l;
      const { coins: start, ...fresh } = createLocationState(id);
      expect(rest).toEqual({ ...fresh, prestigeCount });
      expect(coins.toNumber()).toBeCloseTo(start.toNumber(), 6);
      expect(coins.toNumber()).toBeCloseTo(BALANCE.startCoins * getLocationDef(id).scale, 6);
      expect(l.earnedThisRun.toNumber()).toBe(0);
      expect(l.level).toBe(1);
      expect(l.bestLevel).toBe(1);
      expect(l.ambience).toEqual(startAmbience());
      expect(l.staff).toEqual(foundingStaff());
      expect(l.autoBuy).toBe(false);
      // Phase-2-Felder sind weg.
      expect(l).not.toHaveProperty('quality');
      expect(l).not.toHaveProperty('marketing');
    }
  });
  it('Öffnungszeiten, Matcha-Vorrat, Social-Media-Account, Tagesbilanz und Kosten beginnen frisch', () => {
    const l = getLocation(load(), 'kyoto');
    expect(l.hours).toEqual(OPENING_HOURS.default);
    expect(l.supply.stock).toEqual(
      MATCHA_GRADES.map((g) => (g.grade === 0 ? DELIVERY.startStockGrams : 0)),
    );
    expect(l.supply.orders).toEqual([]);
    expect(l.supply.grade).toBe(0);
    expect(l.social.followers).toBe(SOCIAL.startFollowers);
    expect(l.social.recent).toEqual([]);
    expect(l.social.day).toBe(dayOf(TIME.startMinute));
    expect(l.ledger).toEqual({
      day: dayOf(TIME.startMinute),
      today: createDayLedger(),
      yesterday: null,
    });
    expect(l.bills.pending.toNumber()).toBe(0);
    expect(l.bills.last.toNumber()).toBe(0);
    expect(l.bills.count).toBe(0);
    // Die offenen Bons der alten Kasse verfallen (Tycoon-Beträge).
    expect(l.till.open.toNumber()).toBe(0);
    expect(l.till.paid).toBe(0);
  });
  it('Franchise-Resets bleiben (Zen-Faktor), kaputte Zähler werden 0', () => {
    const raw = v10();
    locsOf(raw)['berlin'] = phase2Cafe(2.7);
    locsOf(raw)['kyoto'] = phase2Cafe(-4);
    const m = locsOf(step(10, raw));
    expect(m['berlin']?.['prestigeCount']).toBe(2);
    expect(m['kyoto']?.['prestigeCount']).toBe(0);
    locsOf(raw)['berlin'] = phase2Cafe('drei');
    expect(locsOf(step(10, raw))['berlin']?.['prestigeCount']).toBe(0);
  });
  it('Meta bleibt: Blätter, Zen, Meta-Upgrades, Erfolge, Standorte, Skins; Lebenszeit-Einnahmen zählen neu', () => {
    const s = load();
    expect(s.meta.goldenLeaves.toNumber()).toBe(77);
    expect(s.meta.zen.toNumber()).toBe(1234);
    expect(s.meta.metaUpgrades).toEqual({ globalIncome: 3, startCapital: 1 });
    expect(s.meta.achievements).toEqual({
      served1: { unlockedAt: 5 },
      campaigns1: { unlockedAt: 6 },
    });
    expect(s.meta.unlockedLocations).toEqual(['berlin', 'kyoto']);
    expect(s.meta.skins).toEqual({ owned: ['sakuraBar'], equipped: ['sakuraBar'] });
    // Ab jetzt in Euro statt Tycoon-Münzen.
    expect(s.meta.lifetimeEarned.toNumber()).toBe(0);
  });
  it('Statistik und Einstellungen bleiben; Videos und Matcha-Bestellungen beginnen bei 0', () => {
    const s = load();
    expect(s.stats).toEqual({
      ...createStats(),
      customersServed: 12345,
      levelsBought: 400,
      taps: 999,
      hypeFills: 30,
      resets: 3,
      events: 9,
      questsCompleted: 11,
      highSatisfactionBestSec: 650,
      leavesEarned: 120,
    });
    expect(s.stats).not.toHaveProperty('campaigns');
    expect(s.settings).toEqual({
      lang: 'de',
      sfx: false,
      music: true,
      sfxVolume: 0.3,
      musicVolume: 0.2,
      numberFormat: 'scientific',
    });
  });
  it('Events, Boosts und alte Tagesaufgaben verfallen, das Tutorial erklärt die neuen Systeme; Zeiten und Pläne bleiben', () => {
    const s = load();
    expect(s.activeEvents).toEqual([]);
    expect(s.boosts).toEqual([]);
    expect(s.tutorial).toEqual({ step: 0, done: false });
    expect(s.activeLocationId).toBe('kyoto');
    expect(s.createdAt).toBe(1000);
    expect(s.lastSavedAt).toBe(5000);
    expect(s.playtimeSec).toBe(7200);
    expect(s.calendarEvents).toEqual(['hanami']);
    expect(s.eventSchedule).toEqual({ seed: 42, count: 7, nextAt: 8000 });
    expect(s.freeBoostAt).toBe(7500);
    expect(s.leafDrops).toEqual({ date: '2026-10-15', count: 2, fraction: 0.5 });
    expect(s.tap).toEqual({ hype: 12, windowStart: 7100, windowTaps: 3 });
    // Alte Aufgaben (z. B. Kampagnen) lassen sich nicht mehr erfüllen: heute wird neu gezogen.
    expect(s.quests).toEqual({ date: '', items: [], bonusClaimed: false });
  });
  it('unbekannte Standorte im alten Save fallen weg', () => {
    const raw = v10();
    locsOf(raw)['atlantis'] = phase2Cafe(1);
    (raw['meta'] as Json)['unlockedLocations'] = ['berlin', 'kyoto', 'atlantis'];
    expect(Object.keys(locsOf(step(10, raw)))).toEqual(['berlin', 'kyoto']);
    const s = load(raw);
    expect(Object.keys(s.locations)).toEqual(['berlin', 'kyoto']);
    expect(s.meta.unlockedLocations).toEqual(['berlin', 'kyoto']);
  });
  it('das migrierte Café läuft wie ein neues und lässt sich wieder speichern', () => {
    const s = load();
    const t = tick(s, 60_000);
    expect(t.clock).toBeGreaterThan(s.clock);
    expect(getLocation(t, 'kyoto').ledger.today.guests).toBeGreaterThan(0);
    expect(serialize(deserialize(serialize(t)))).toBe(serialize(t));
  });
  it('liest den alten v10-Schlüssel (letzter Stand vor Phase 3), Neustart löscht ihn', () => {
    const st = new MemStorage();
    st.setItem('mce.save.v10', JSON.stringify(v10()));
    const s = loadGame(st);
    expect(s?.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s?.meta.zen.toNumber()).toBe(1234);
    clearSave(st);
    expect(st.data.size).toBe(0);
  });
});

describe('Uhr-Manipulation (S9)', () => {
  it('Uhr vor- und zurückstellen bringt die Offline-Zeit nicht zweimal', () => {
    const st = new MemStorage();
    saveGame(st, createInitialState(0), 1000);
    const day = 24 * 3_600_000;
    // Uhr +1 Tag: einmal Offline-Betrieb (gedeckelt), dann wird bei „zurückgestellter“ Uhr gespeichert.
    const first = loadWithOffline(st, 1000 + day);
    if (!first) throw new Error('kein Stand');
    expect(first.offline.creditedMs).toBeGreaterThan(0);
    expect(first.offline.creditedMs).toBeLessThan(day);
    expect(first.offline.revenue.gt(0)).toBe(true);
    saveGame(st, first.state, 2000);
    expect(loadGame(st)?.lastSavedAt).toBe(1000 + day);
    // Wieder +1 Tag ab der echten Zeit: der Zeitstempel steht schon dort, also nichts.
    const again = loadWithOffline(st, 1000 + day);
    expect(again?.offline.creditedMs).toBe(0);
    expect(again?.offline.earned.toNumber()).toBe(0);
    expect(again?.offline.revenue.toNumber()).toBe(0);
    expect(again?.state.clock).toBe(first.state.clock);
  });
  it('forwardTime ignoriert ungültige Uhrzeiten', () => {
    expect(forwardTime(500, Number.NaN)).toBe(500);
    expect(forwardTime(500, 400)).toBe(500);
    expect(forwardTime(500, 600)).toBe(600);
  });
});
