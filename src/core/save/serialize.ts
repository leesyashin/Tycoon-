import { BALANCE } from '@data/balance';
import { D, Decimal, isDecimalNaN } from '../math/bignum';
import {
  SCHEMA_VERSION,
  createStats,
  type GameState,
  type LocationState,
  type QuestItem,
  type QuestState,
  type Stats,
} from '../GameState';
import { migrate, SaveError } from './migrations';

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Decimals werden als String gespeichert (GAME_DESIGN § 18). */
export function serialize(state: GameState): string {
  return JSON.stringify(state, (_k, v: unknown) => (v instanceof Decimal ? v.toString() : v));
}

function dec(v: unknown, what: string): Decimal {
  if (typeof v !== 'string' && typeof v !== 'number')
    throw new SaveError(`Invalid number: ${what}`);
  let d: Decimal;
  try {
    d = D(v);
  } catch {
    throw new SaveError(`Invalid number: ${what}`);
  }
  if (isDecimalNaN(d)) throw new SaveError(`Invalid number: ${what}`);
  return d;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function reviveLocation(id: string, raw: unknown): LocationState {
  if (!isObj(raw)) throw new SaveError(`Invalid location: ${id}`);
  const level = Math.max(1, Math.floor(num(raw['level'], 1)));
  return {
    ...(raw as unknown as LocationState),
    coins: dec(raw['coins'], `${id}.coins`),
    earnedThisRun: dec(raw['earnedThisRun'], `${id}.earnedThisRun`),
    cleanliness: Math.min(
      BALANCE.cleanliness.max,
      Math.max(0, num(raw['cleanliness'], BALANCE.cleanliness.start)),
    ),
    autoBuy: raw['autoBuy'] === true,
    level,
    bestLevel: Math.max(level, Math.floor(num(raw['bestLevel'], level))),
    prestigeCount: Math.max(0, Math.floor(num(raw['prestigeCount'], 0))),
    staff: isObj(raw['staff']) ? (raw['staff'] as Record<string, number>) : {},
  };
}

function reviveTap(raw: unknown): GameState['tap'] {
  const t = isObj(raw) ? raw : {};
  return {
    hype: Math.max(0, num(t['hype'], 0)),
    windowStart: num(t['windowStart'], 0),
    windowTaps: Math.max(0, num(t['windowTaps'], 0)),
  };
}

/** Unbekannte oder kaputte Zähler werden 0, damit ein beschädigter Save nicht Achievements verschenkt. */
function reviveStats(raw: unknown): Stats {
  const r = isObj(raw) ? raw : {};
  const out = createStats();
  for (const k of Object.keys(out) as (keyof Stats)[]) out[k] = Math.max(0, num(r[k], 0));
  return out;
}

function reviveQuests(raw: unknown): QuestState {
  const r = isObj(raw) ? raw : {};
  const items: QuestItem[] = [];
  if (Array.isArray(r['items'])) {
    for (const it of r['items'] as unknown[]) {
      if (!isObj(it) || typeof it['id'] !== 'string') continue;
      items.push({
        id: it['id'],
        base: num(it['base'], 0),
        progress: Math.max(0, num(it['progress'], 0)),
        claimed: it['claimed'] === true,
      });
    }
  }
  return {
    date: typeof r['date'] === 'string' ? r['date'] : '',
    items,
    bonusClaimed: r['bonusClaimed'] === true,
  };
}

export function deserialize(text: string): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SaveError('Save is not valid JSON');
  }
  if (!isObj(parsed)) throw new SaveError('Save has wrong shape');
  const raw = migrate(parsed);
  const meta = raw['meta'];
  const locations = raw['locations'];
  if (!isObj(meta) || !isObj(locations)) throw new SaveError('Save has wrong shape');

  const revived: Record<string, LocationState> = {};
  for (const [id, loc] of Object.entries(locations)) revived[id] = reviveLocation(id, loc);
  const activeLocationId = raw['activeLocationId'];
  if (typeof activeLocationId !== 'string' || !revived[activeLocationId]) {
    throw new SaveError('Active location missing');
  }
  // Freigeschaltet ist nur, was auch einen Standort-Zustand hat (sonst zeigte die UI leere Cafés).
  const listed = Array.isArray(meta['unlockedLocations'])
    ? (meta['unlockedLocations'] as unknown[])
    : [];
  const unlockedLocations = Object.keys(revived).filter(
    (id) => listed.includes(id) || id === activeLocationId,
  );
  const metaUpgrades: Record<string, number> = {};
  if (isObj(meta['metaUpgrades'])) {
    for (const [k, v] of Object.entries(meta['metaUpgrades'])) {
      const lvl = Math.floor(num(v, 0));
      if (lvl > 0) metaUpgrades[k] = lvl;
    }
  }
  return {
    ...(raw as unknown as GameState),
    schemaVersion: SCHEMA_VERSION,
    createdAt: num(raw['createdAt'], 0),
    lastSavedAt: num(raw['lastSavedAt'], 0),
    playtimeSec: num(raw['playtimeSec'], 0),
    meta: {
      ...(meta as unknown as GameState['meta']),
      goldenLeaves: dec(meta['goldenLeaves'], 'goldenLeaves'),
      zen: dec(meta['zen'], 'zen'),
      lifetimeEarned: dec(meta['lifetimeEarned'], 'lifetimeEarned'),
      unlockedLocations,
      metaUpgrades,
    },
    locations: revived,
    tap: reviveTap(raw['tap']),
    stats: reviveStats(raw['stats']),
    quests: reviveQuests(raw['quests']),
  };
}
