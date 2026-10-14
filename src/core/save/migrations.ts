import { BALANCE } from '@data/balance';
import { SCHEMA_VERSION, createStats } from '../GameState';

type Json = Record<string, unknown>;

/** `migrations[i]` hebt einen Save von Version i auf i+1. Jede Schema-Änderung braucht hier einen Eintrag und einen Test. */
export const migrations: ((raw: Json) => Json)[] = [
  // v0 → v1: flaches Ur-Format (ein Café) → mehrere Standorte + Meta.
  (raw) => {
    const levels = (raw['stationLevels'] as Record<string, number> | undefined) ?? {};
    const stations: Record<string, { level: number; unlocked: boolean }> = {};
    for (const [id, level] of Object.entries(levels)) stations[id] = { level, unlocked: level > 0 };
    const createdAt = (raw['createdAt'] as number | undefined) ?? 0;
    const coins = (raw['coins'] as string | undefined) ?? '0';
    return {
      schemaVersion: 1,
      createdAt,
      lastSavedAt: (raw['lastSavedAt'] as number | undefined) ?? createdAt,
      playtimeSec: (raw['playtimeSec'] as number | undefined) ?? 0,
      settings: { lang: 'en', sfx: true, music: true, numberFormat: 'short' },
      meta: {
        goldenLeaves: '0',
        zen: '0',
        metaUpgrades: {},
        achievements: {},
        lifetimeEarned: coins,
        unlockedLocations: ['berlin'],
      },
      activeLocationId: 'berlin',
      locations: {
        berlin: {
          coins,
          earnedThisRun: coins,
          level: 1,
          stations,
          ambience: {},
          staff: {},
          quality: 0,
          satisfaction: 50,
          marketing: { level: 0 },
          prestigeCount: 0,
        },
      },
      activeEvents: [],
      boosts: [],
      quests: { date: '', items: [] },
    };
  },
  // v1 → v2: Tap-Bonus-Zustand (Hype-Balken) ergänzt.
  (raw) => ({
    ...raw,
    schemaVersion: 2,
    tap: { hype: 0, windowStart: 0, windowTaps: 0 },
  }),
  // v2 → v3: Sauberkeit und Auto-Kauf je Standort (Personal-System S4).
  (raw) => {
    const locations = (raw['locations'] as Record<string, Json> | undefined) ?? {};
    const next: Record<string, Json> = {};
    for (const [id, loc] of Object.entries(locations)) {
      next[id] = { ...loc, cleanliness: BALANCE.cleanliness.start, autoBuy: false };
    }
    return { ...raw, schemaVersion: 3, locations: next };
  },
  // v3 → v4: Statistik-Zähler und Daily Quests mit Basiswert (Progression S5). Alte Quests waren nie befüllt.
  (raw) => ({
    ...raw,
    schemaVersion: 4,
    stats: createStats(),
    quests: { date: '', items: [], bonusClaimed: false },
  }),
];

export class SaveError extends Error {}

export function migrate(raw: Json): Json {
  let version = typeof raw['schemaVersion'] === 'number' ? raw['schemaVersion'] : 0;
  if (version > SCHEMA_VERSION)
    throw new SaveError(`Save is from a newer version (${String(version)})`);
  let cur = raw;
  while (version < SCHEMA_VERSION) {
    const step = migrations[version];
    if (!step) throw new SaveError(`No migration from v${String(version)}`);
    cur = step(cur);
    version = typeof cur['schemaVersion'] === 'number' ? cur['schemaVersion'] : version + 1;
  }
  return cur;
}
