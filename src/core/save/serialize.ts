import { BALANCE } from '@data/balance';
import { getCalendarEventDef, getRandomEventDef } from '@data/events';
import { BOOST_RULES, LEAF_DROPS, getSkinDef } from '@data/leaves';
import { FREE_BOOST } from '@data/monetization';
import { AUDIO_DEFAULTS } from '@data/audio';
import { TUTORIAL_STEPS } from '@data/tutorial';
import { hashString } from '../math/random';
import { D, Decimal, isDecimalNaN } from '../math/bignum';
import {
  SCHEMA_VERSION,
  createEventSchedule,
  createStats,
  type ActiveBoost,
  type ActiveEvent,
  type EventSchedule,
  type LeafDropState,
  type SkinState,
  type GameState,
  type LocationState,
  type QuestItem,
  type QuestState,
  type Settings,
  type Stats,
} from '../GameState';
import { migrate, SaveError } from './migrations';

type Json = Record<string, unknown>;

const BOOST_MAX = BOOST_RULES.maxMult;

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

/** Nur bekannte Events an vorhandenen Standorten; Zeiten müssen Zahlen sein. */
function reviveEvents(raw: unknown, locations: Record<string, LocationState>): ActiveEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: ActiveEvent[] = [];
  for (const e of raw as unknown[]) {
    if (!isObj(e) || typeof e['id'] !== 'string' || typeof e['locationId'] !== 'string') continue;
    if (!getRandomEventDef(e['id']) || !locations[e['locationId']]) continue;
    const until = num(e['until'], NaN);
    if (Number.isNaN(until)) continue;
    out.push({
      id: e['id'],
      locationId: e['locationId'],
      startedAt: num(e['startedAt'], until),
      until,
    });
  }
  return out;
}

/** Boost-Multiplikatoren nie unter 1 oder unendlich – ein kaputter Save soll nichts vervielfachen. */
function reviveBoosts(raw: unknown): ActiveBoost[] {
  if (!Array.isArray(raw)) return [];
  const mult = (v: unknown): number => Math.max(1, Math.min(BOOST_MAX, num(v, 1)));
  const out: ActiveBoost[] = [];
  for (const b of raw as unknown[]) {
    if (!isObj(b) || typeof b['id'] !== 'string') continue;
    const until = num(b['until'], NaN);
    if (Number.isNaN(until)) continue;
    out.push({
      id: b['id'],
      until,
      spawnMult: mult(b['spawnMult']),
      incomeMult: mult(b['incomeMult']),
      speedMult: mult(b['speedMult']),
    });
  }
  return out;
}

function reviveSchedule(raw: unknown, createdAt: number): EventSchedule {
  const r = isObj(raw) ? raw : {};
  const fallback = createEventSchedule(hashString(String(createdAt)));
  return {
    seed: Math.floor(num(r['seed'], fallback.seed)) >>> 0,
    count: Math.max(0, Math.floor(num(r['count'], 0))),
    nextAt: num(r['nextAt'], fallback.nextAt),
  };
}

function reviveLeafDrops(raw: unknown): LeafDropState {
  const r = isObj(raw) ? raw : {};
  return {
    date: typeof r['date'] === 'string' ? r['date'] : '',
    count: Math.min(LEAF_DROPS.maxPerDay, Math.max(0, Math.floor(num(r['count'], 0)))),
    fraction: Math.min(1, Math.max(0, num(r['fraction'], 0))),
  };
}

function reviveSkins(raw: unknown): SkinState {
  const r = isObj(raw) ? raw : {};
  const ids = (v: unknown): string[] =>
    Array.isArray(v)
      ? [...new Set(v.filter((x): x is string => typeof x === 'string' && !!getSkinDef(x)))]
      : [];
  const owned = ids(r['owned']);
  return { owned, equipped: ids(r['equipped']).filter((id) => owned.includes(id)) };
}

/** Unbekannte Werte fallen auf Standards zurück; Lautstärken werden auf 0..1 geklemmt. */
function reviveSettings(raw: unknown): Settings {
  const r = isObj(raw) ? raw : {};
  const vol = (v: unknown, fallback: number): number =>
    Math.min(1, Math.max(0, typeof v === 'number' && Number.isFinite(v) ? v : fallback));
  return {
    lang: r['lang'] === 'de' ? 'de' : 'en',
    sfx: r['sfx'] !== false,
    music: r['music'] !== false,
    sfxVolume: vol(r['sfxVolume'], AUDIO_DEFAULTS.sfxVolume),
    musicVolume: vol(r['musicVolume'], AUDIO_DEFAULTS.musicVolume),
    numberFormat: r['numberFormat'] === 'scientific' ? 'scientific' : 'short',
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
    settings: reviveSettings(raw['settings']),
    meta: {
      ...(meta as unknown as GameState['meta']),
      goldenLeaves: dec(meta['goldenLeaves'], 'goldenLeaves'),
      zen: dec(meta['zen'], 'zen'),
      lifetimeEarned: dec(meta['lifetimeEarned'], 'lifetimeEarned'),
      unlockedLocations,
      metaUpgrades,
      skins: reviveSkins(meta['skins']),
    },
    locations: revived,
    activeEvents: reviveEvents(raw['activeEvents'], revived),
    calendarEvents: Array.isArray(raw['calendarEvents'])
      ? (raw['calendarEvents'] as unknown[]).filter(
          (x): x is string => typeof x === 'string' && !!getCalendarEventDef(x),
        )
      : [],
    eventSchedule: reviveSchedule(raw['eventSchedule'], num(raw['createdAt'], 0)),
    boosts: reviveBoosts(raw['boosts']),
    freeBoostAt: num(raw['freeBoostAt'], num(raw['playtimeSec'], 0) + FREE_BOOST.intervalSec),
    leafDrops: reviveLeafDrops(raw['leafDrops']),
    tap: reviveTap(raw['tap']),
    stats: reviveStats(raw['stats']),
    quests: reviveQuests(raw['quests']),
    tutorial: reviveTutorial(raw['tutorial']),
  };
}

/** Kaputter Tutorial-Stand → als erledigt werten (lieber kein Tutorial als eines, das hängt). */
function reviveTutorial(raw: unknown): GameState['tutorial'] {
  if (!isObj(raw)) return { step: 0, done: true };
  const step = Math.max(0, Math.floor(num(raw['step'], 0)));
  return { step, done: raw['done'] === true || step >= TUTORIAL_STEPS.length };
}
