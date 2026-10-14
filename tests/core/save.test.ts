import { describe, expect, it } from 'vitest';
import { createInitialState, getLocation, SCHEMA_VERSION } from '@core/GameState';
import { D } from '@core/math';
import { cafeLevelThreshold } from '@core/economy';
import { tick } from '@core/GameLoop';
import {
  SAVE_KEY,
  SaveError,
  deserialize,
  exportFilename,
  exportSave,
  importSave,
  loadGame,
  loadWithOffline,
  migrate,
  saveGame,
  serialize,
  type StorageLike,
} from '@core/save';

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
      locations: { berlin: { coins: unknown } };
      schemaVersion: number;
    };
    expect(typeof json.locations.berlin.coins).toBe('string');
    expect(json.schemaVersion).toBe(SCHEMA_VERSION);
  });
  it('Roundtrip nach Simulation', () => {
    const s = tick(createInitialState(0), 5000);
    expect(serialize(deserialize(serialize(s)))).toBe(serialize(s));
  });
  it('lehnt kaputte Saves ab', () => {
    expect(() => deserialize('{nope')).toThrow(SaveError);
    expect(() => deserialize('[]')).toThrow(SaveError);
    expect(() => deserialize('"x"')).toThrow(SaveError);
    const s = JSON.parse(serialize(createInitialState(0))) as Record<string, unknown>;
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
    const s = JSON.parse(serialize(createInitialState(0))) as Record<string, unknown>;
    s['playtimeSec'] = 'kaputt';
    expect(deserialize(JSON.stringify(s)).playtimeSec).toBe(0);
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
  it('v0 → v1', () => {
    const s = deserialize(JSON.stringify(v0));
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    const loc = getLocation(s, 'berlin');
    expect(loc.coins.toNumber()).toBe(1234.5);
    expect(loc.stations['matchaBar']).toEqual({ level: 7, unlocked: true });
    expect(loc.stations['checkout']).toEqual({ level: 0, unlocked: false });
    expect(s.lastSavedAt).toBe(9);
    expect(s.meta.unlockedLocations).toEqual(['berlin']);
    expect(s.playtimeSec).toBe(60);
  });
  it('v0 mit fehlenden Feldern bekommt Defaults', () => {
    const s = deserialize('{}');
    expect(getLocation(s, 'berlin').coins.toNumber()).toBe(0);
    expect(s.createdAt).toBe(0);
  });
  it('v1 → v2 ergänzt den Tap-Zustand und behält alles andere', () => {
    const v1 = JSON.parse(serialize(createInitialState(0))) as Record<string, unknown>;
    v1['schemaVersion'] = 1;
    delete v1['tap'];
    (v1['locations'] as { berlin: { coins: string } }).berlin.coins = '42';
    const s = deserialize(JSON.stringify(v1));
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.tap).toEqual({ hype: 0, windowStart: 0, windowTaps: 0 });
    expect(getLocation(s, 'berlin').coins.toNumber()).toBe(42);
  });
  it('kaputter Tap-Zustand wird auf gültige Werte gesetzt', () => {
    const raw = JSON.parse(serialize(createInitialState(0))) as Record<string, unknown>;
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
    const raw = JSON.parse(serialize(createInitialState(0))) as Record<string, unknown>;
    expect(migrate(raw)).toBe(raw);
  });
});

describe('Storage und Export', () => {
  it('speichert und lädt', () => {
    const st = new MemStorage();
    expect(loadGame(st)).toBeNull();
    const saved = saveGame(st, createInitialState(0), 777);
    expect(saved.lastSavedAt).toBe(777);
    expect(st.getItem(SAVE_KEY)).not.toBeNull();
    expect(loadGame(st)?.lastSavedAt).toBe(777);
  });
  it('liest den alten v0-Schlüssel und migriert', () => {
    const st = new MemStorage();
    st.setItem('mce.save.v0', JSON.stringify({ coins: '10', stationLevels: { matchaBar: 2 } }));
    expect(loadGame(st)?.schemaVersion).toBe(SCHEMA_VERSION);
  });
  it('liest den alten v1-Schlüssel und migriert', () => {
    const st = new MemStorage();
    const v1 = JSON.parse(serialize(createInitialState(0))) as Record<string, unknown>;
    v1['schemaVersion'] = 1;
    delete v1['tap'];
    st.setItem('mce.save.v1', JSON.stringify(v1));
    expect(loadGame(st)?.tap.hype).toBe(0);
    expect(SAVE_KEY).toBe('mce.save.v8');
  });
  it('Laden bringt Offline-Einnahmen und setzt lastSavedAt', () => {
    const st = new MemStorage();
    saveGame(st, createInitialState(0), 1000);
    expect(loadWithOffline(new MemStorage(), 5000)).toBeNull();
    const r = loadWithOffline(st, 1000 + 3_600_000);
    expect(r?.offline.creditedMs).toBe(3_600_000);
    expect(r?.offline.earned.gt(0)).toBe(true);
    expect(r?.state.lastSavedAt).toBe(1000 + 3_600_000);
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
    const raw = JSON.parse(serialize(createInitialState(0))) as Record<string, unknown>;
    raw['locations'] = {};
    raw['activeLocationId'] = 'x';
    expect(() => importSave(JSON.stringify(raw))).toThrow(SaveError);
  });
});

describe('Save v7 (Lautstärke, S8)', () => {
  it('Migration v6 → v7 setzt Standard-Lautstärken und behält die Schalter', () => {
    const v6 = JSON.parse(serialize(createInitialState(0, 'de'))) as Record<string, unknown>;
    v6['schemaVersion'] = 6;
    v6['settings'] = { lang: 'de', sfx: false, music: true, numberFormat: 'scientific' };
    const s = deserialize(JSON.stringify(v6));
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.settings).toEqual({
      lang: 'de',
      sfx: false,
      music: true,
      sfxVolume: 0.7,
      musicVolume: 0.4,
      numberFormat: 'scientific',
    });
  });
  it('liest den alten v6-Schlüssel', () => {
    const st = new MemStorage();
    const v6 = JSON.parse(serialize(createInitialState(0))) as Record<string, unknown>;
    v6['schemaVersion'] = 6;
    st.setItem('mce.save.v6', JSON.stringify(v6));
    expect(loadGame(st)?.settings.musicVolume).toBe(0.4);
  });
  it('Härtung: Lautstärke geklemmt, unbekannte Werte auf Standard', () => {
    const raw = JSON.parse(serialize(createInitialState(0))) as Record<string, unknown>;
    raw['settings'] = { lang: 'xx', sfx: 'ja', sfxVolume: 7, musicVolume: -1, numberFormat: 1 };
    const s = deserialize(JSON.stringify(raw)).settings;
    expect(s).toMatchObject({ lang: 'en', sfx: true, sfxVolume: 1, musicVolume: 0 });
    expect(s.numberFormat).toBe('short');
  });
});

describe('Save v8 (Tutorial, Café-Level-Stufen, S9)', () => {
  const v7 = (): Record<string, unknown> => {
    const raw = JSON.parse(serialize(createInitialState(0))) as Record<string, unknown>;
    raw['schemaVersion'] = 7;
    delete raw['tutorial'];
    return raw;
  };
  it('Neues Spiel startet mit Tutorial-Schritt 0', () => {
    expect(createInitialState(0).tutorial).toEqual({ step: 0, done: false });
  });
  it('Migration v7 → v8: Bestandsspieler haben das Tutorial erledigt', () => {
    const s = deserialize(JSON.stringify(v7()));
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(s.tutorial).toEqual({ step: 0, done: true });
  });
  it('Migration v7 → v8 berechnet das Café-Level neu, der Bestwert bleibt', () => {
    const raw = v7();
    const locs = raw['locations'] as Record<string, Record<string, unknown>>;
    const berlin = locs['berlin'] ?? {};
    const stations = berlin['stations'] as Record<string, { level: number; unlocked: boolean }>;
    stations['matchaBar'] = { level: cafeLevelThreshold(4), unlocked: true };
    berlin['level'] = 9;
    berlin['bestLevel'] = 9;
    const loc = getLocation(deserialize(JSON.stringify(raw)), 'berlin');
    expect(loc.level).toBe(4);
    expect(loc.bestLevel).toBe(9);
  });
  it('liest den alten v7-Schlüssel', () => {
    const st = new MemStorage();
    st.setItem('mce.save.v7', JSON.stringify(v7()));
    expect(loadGame(st)?.tutorial.done).toBe(true);
  });
  it('Härtung: kaputter Tutorial-Stand gilt als erledigt, Schritt geklemmt', () => {
    const raw = JSON.parse(serialize(createInitialState(0))) as Record<string, unknown>;
    raw['tutorial'] = 'kaputt';
    expect(deserialize(JSON.stringify(raw)).tutorial.done).toBe(true);
    raw['tutorial'] = { step: -3, done: false };
    expect(deserialize(JSON.stringify(raw)).tutorial).toEqual({ step: 0, done: false });
    raw['tutorial'] = { step: 999, done: false };
    expect(deserialize(JSON.stringify(raw)).tutorial.done).toBe(true);
  });
});
