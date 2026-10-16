import { BALANCE } from '@data/balance';
import { SCHEMA_VERSION, createEventSchedule, createStats } from '../GameState';
import { FREE_BOOST } from '@data/monetization';
import { AUDIO_DEFAULTS } from '@data/audio';
import { hashString } from '../math/random';
import { cafeLevelFromSum } from '../economy/cafeLevel';
import { STATIONS } from '@data/stations';
import { STAFF_ROLES } from '@data/staff';

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
  // v4 → v5: Bestwert des Café-Levels je Standort (Prestige S6: überlebt den Reset, Freischaltung).
  (raw) => {
    const locations = (raw['locations'] as Record<string, Json> | undefined) ?? {};
    const next: Record<string, Json> = {};
    for (const [id, loc] of Object.entries(locations)) {
      const level = typeof loc['level'] === 'number' ? loc['level'] : 1;
      next[id] = { ...loc, bestLevel: level };
    }
    return { ...raw, schemaVersion: 5, locations: next };
  },
  // v5 → v6: Events mit Standort und Startzeit, Event-Plan, Gratis-Boost-Timer, Influencer-Drops, Skins (S7).
  // Alte `activeEvents` waren nie befüllt (kein Event-System), alte Boosts behalten ihre Form.
  (raw) => {
    const meta = (raw['meta'] as Json | undefined) ?? {};
    const playtime = typeof raw['playtimeSec'] === 'number' ? raw['playtimeSec'] : 0;
    const createdAt = typeof raw['createdAt'] === 'number' ? raw['createdAt'] : 0;
    const schedule = createEventSchedule(hashString(String(createdAt)));
    return {
      ...raw,
      schemaVersion: 6,
      meta: { ...meta, skins: { owned: [], equipped: [] } },
      activeEvents: [],
      calendarEvents: [],
      eventSchedule: { ...schedule, nextAt: playtime + schedule.nextAt },
      freeBoostAt: playtime + FREE_BOOST.intervalSec,
      leafDrops: { date: '', count: 0, fraction: 0 },
    };
  },
  // v6 → v7: Lautstärke für Effekte und Musik (S8).
  (raw) => {
    const settings = (raw['settings'] as Json | undefined) ?? {};
    return {
      ...raw,
      schemaVersion: 7,
      settings: {
        ...settings,
        sfxVolume: AUDIO_DEFAULTS.sfxVolume,
        musicVolume: AUDIO_DEFAULTS.musicVolume,
      },
    };
  },
  // v7 → v8 (S9): Tutorial-Fortschritt; bestehende Spieler kennen das Spiel schon. Café-Level folgt
  // jetzt einer Stufen-Tabelle, daher aus den Stations-Leveln neu berechnet (Bestwert bleibt).
  (raw) => {
    const locations = (raw['locations'] as Record<string, Json> | undefined) ?? {};
    const next: Record<string, Json> = {};
    for (const [id, loc] of Object.entries(locations)) {
      const stations = (loc['stations'] as Record<string, { level?: unknown }> | undefined) ?? {};
      let sum = 0;
      for (const st of Object.values(stations)) {
        if (typeof st.level === 'number' && Number.isFinite(st.level)) sum += Math.max(0, st.level);
      }
      const level = cafeLevelFromSum(sum);
      const best = typeof loc['bestLevel'] === 'number' ? loc['bestLevel'] : level;
      next[id] = { ...loc, level, bestLevel: Math.max(best, level) };
    }
    return { ...raw, schemaVersion: 8, locations: next, tutorial: { step: 0, done: true } };
  },
  // v8 → v9 (Phase 2, bedientes Café): Stationen heißen jetzt Ausstattung (neue IDs, Ausgabe-Station neu),
  // Personal zählt als Köpfe. Bäcker und Tee-Meister werden Baristas; Verkäufer und Bedienungen bekommen die
  // alte Kassierer-Stufe, damit ein großes Café nicht an einer einzelnen Bedienung hängt; mindestens das
  // Gründungsteam. Ein angefangenes Tutorial beginnt neu (die Schritte sind andere).
  (raw) => {
    const RENAME: Record<string, string> = {
      matchaBar: 'matchaStation',
      checkout: 'register',
      togoWindow: 'coffeeMachine',
      icedBar: 'iceBox',
      bakery: 'oven',
      merchShelf: 'displayCase',
      ceremonyCorner: 'grinder',
      workshopRoom: 'ceremonySet',
    };
    const n = (v: unknown): number =>
      typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
    const locations = (raw['locations'] as Record<string, Json> | undefined) ?? {};
    const next: Record<string, Json> = {};
    for (const [id, loc] of Object.entries(locations)) {
      const oldStations = (loc['stations'] as Record<string, Json> | undefined) ?? {};
      const stations: Record<string, Json> = {};
      for (const [sid, st] of Object.entries(oldStations)) stations[RENAME[sid] ?? sid] = st;
      const level = n(loc['level']);
      for (const def of STATIONS) {
        stations[def.id] ??= { level: 0, unlocked: level >= def.unlockCafeLevel };
      }
      const old = (loc['staff'] as Record<string, unknown> | undefined) ?? {};
      const staff: Record<string, number> = {};
      const cap = (role: string, v: number): number =>
        Math.min(STAFF_ROLES.find((r) => r.id === role)?.maxLevel ?? v, v);
      staff['cashier'] = cap('cashier', Math.max(1, n(old['cashier'])));
      staff['barista'] = cap(
        'barista',
        Math.max(1, n(old['barista']) + n(old['baker']) + n(old['teaMaster'])),
      );
      staff['waiter'] = cap(
        'waiter',
        Math.max(1, old['waiter'] === undefined ? n(old['cashier']) : n(old['waiter'])),
      );
      for (const role of ['cleaner', 'manager', 'socialMedia']) {
        const v = n(old[role]);
        if (v > 0) staff[role] = cap(role, v);
      }
      next[id] = { ...loc, stations, staff };
    }
    const tutorial = (raw['tutorial'] as Json | undefined) ?? {};
    return {
      ...raw,
      schemaVersion: 9,
      locations: next,
      tutorial: tutorial['done'] === true ? tutorial : { step: 0, done: false },
    };
  },
  // v9 → v10: Kasse mit offenen Bons je Standort; Geld kommt erst, wenn ein Gast bezahlt hat (leer starten).
  (raw) => {
    const locations = (raw['locations'] as Record<string, Json> | undefined) ?? {};
    const next: Record<string, Json> = {};
    for (const [id, loc] of Object.entries(locations)) {
      next[id] = { ...loc, till: { open: '0', progress: 0, paid: 0 } };
    }
    return { ...raw, schemaVersion: 10, locations: next };
  },
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
