import { Decimal, D } from './math/bignum';
import { BALANCE } from '@data/balance';
import { STATIONS } from '@data/stations';
import { START_LOCATION_ID } from '@data/locations';

export const SCHEMA_VERSION = 1;

export interface Settings {
  lang: 'de' | 'en';
  sfx: boolean;
  music: boolean;
  numberFormat: 'short' | 'scientific';
}

/** `until` ist in `playtimeSec` gemessen (monoton, manipulationsarm). */
export interface ActiveEvent {
  id: string;
  until: number;
  spawnMult: number;
  incomeMult: number;
}

export interface ActiveBoost {
  id: string;
  until: number;
  spawnMult: number;
  incomeMult: number;
  speedMult: number;
}

export interface QuestState {
  date: string;
  items: { id: string; progress: number; claimed: boolean }[];
}

export interface StationState {
  level: number;
  unlocked: boolean;
}

export interface LocationState {
  coins: Decimal;
  earnedThisRun: Decimal;
  level: number;
  stations: Record<string, StationState>;
  ambience: Record<string, number>;
  staff: Record<string, number>;
  quality: number;
  satisfaction: number;
  marketing: { level: number; campaignUntil?: number };
  prestigeCount: number;
}

export interface MetaState {
  goldenLeaves: Decimal;
  zen: Decimal;
  metaUpgrades: Record<string, number>;
  achievements: Record<string, { unlockedAt: number }>;
  lifetimeEarned: Decimal;
  unlockedLocations: string[];
}

export interface GameState {
  schemaVersion: number;
  createdAt: number;
  lastSavedAt: number;
  playtimeSec: number;
  settings: Settings;
  meta: MetaState;
  activeLocationId: string;
  locations: Record<string, LocationState>;
  activeEvents: ActiveEvent[];
  boosts: ActiveBoost[];
  quests: QuestState;
}

export function createLocationState(): LocationState {
  const stations: Record<string, StationState> = {};
  for (const s of STATIONS) {
    stations[s.id] = { level: s.startLevel, unlocked: s.unlockCafeLevel <= 1 };
  }
  return {
    coins: D(BALANCE.startCoins),
    earnedThisRun: D(0),
    level: 1,
    stations,
    ambience: {},
    staff: {},
    quality: 0,
    satisfaction: BALANCE.startSatisfaction,
    marketing: { level: 0 },
    prestigeCount: 0,
  };
}

export function createInitialState(now: number, lang: 'de' | 'en' = 'en'): GameState {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    lastSavedAt: now,
    playtimeSec: 0,
    settings: { lang, sfx: true, music: true, numberFormat: 'short' },
    meta: {
      goldenLeaves: D(0),
      zen: D(0),
      metaUpgrades: {},
      achievements: {},
      lifetimeEarned: D(0),
      unlockedLocations: [START_LOCATION_ID],
    },
    activeLocationId: START_LOCATION_ID,
    locations: { [START_LOCATION_ID]: createLocationState() },
    activeEvents: [],
    boosts: [],
    quests: { date: '', items: [] },
  };
}

export function getLocation(state: GameState, id: string): LocationState {
  const loc = state.locations[id];
  if (!loc) throw new Error(`Location not in state: ${id}`);
  return loc;
}

export function withLocation(state: GameState, id: string, loc: LocationState): GameState {
  return { ...state, locations: { ...state.locations, [id]: loc } };
}
