import { D, Decimal, isDecimalNaN } from '../math/bignum';
import { SCHEMA_VERSION, type GameState, type LocationState } from '../GameState';
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
  return {
    ...(raw as unknown as LocationState),
    coins: dec(raw['coins'], `${id}.coins`),
    earnedThisRun: dec(raw['earnedThisRun'], `${id}.earnedThisRun`),
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
    },
    locations: revived,
  };
}
