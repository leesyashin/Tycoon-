import { describe, expect, it } from 'vitest';
import { createInitialState, getLocation, SCHEMA_VERSION } from '@core/GameState';
import { D } from '@core/math';
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
