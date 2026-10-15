import { Decimal, D } from './math/bignum';
import { BALANCE } from '@data/balance';
import { STATIONS } from '@data/stations';
import { foundingStaff } from '@data/staff';
import { START_LOCATION_ID, getLocationDef } from '@data/locations';
import { EVENT_CONFIG } from '@data/events';
import { FREE_BOOST } from '@data/monetization';
import { AUDIO_DEFAULTS } from '@data/audio';
import { hashString, rng } from './math/random';

export const SCHEMA_VERSION = 9;

export interface Settings {
  lang: 'de' | 'en';
  sfx: boolean;
  music: boolean;
  /** Lautstärke 0..1 (S8); der Schalter `sfx`/`music` stummt unabhängig davon. */
  sfxVolume: number;
  musicVolume: number;
  numberFormat: 'short' | 'scientific';
}

/**
 * Laufendes Zufalls-Event (GAME_DESIGN § 12.1) an einem Standort; Wirkung kommt aus `data/events`.
 * Zeiten in `playtimeSec` (monoton, manipulationsarm).
 */
export interface ActiveEvent {
  id: string;
  locationId: string;
  startedAt: number;
  until: number;
}

/** Deterministischer Event-Plan: das n-te Event zieht aus `seed` und `count`. */
export interface EventSchedule {
  seed: number;
  count: number;
  /** Spielzeit, ab der das nächste Zufalls-Event startet. */
  nextAt: number;
}

/** Influencer-Blätter (GAME_DESIGN § 7.5): Erwartungswert sammelt sich in `fraction`, Deckel pro Tag. */
export interface LeafDropState {
  date: string;
  count: number;
  fraction: number;
}

export interface SkinState {
  owned: string[];
  equipped: string[];
}

export interface ActiveBoost {
  id: string;
  until: number;
  spawnMult: number;
  incomeMult: number;
  speedMult: number;
}

export interface QuestItem {
  id: string;
  /** Zählerstand der zugehörigen Statistik beim Ziehen; Fortschritt = aktuell − base. */
  base: number;
  progress: number;
  claimed: boolean;
}

/** Daily Quests (GAME_DESIGN § 13.2); `date` ist der lokale Kalendertag `YYYY-MM-DD`. */
export interface QuestState {
  date: string;
  items: QuestItem[];
  bonusClaimed: boolean;
}

/** Onboarding-Fortschritt (S9); `done` auch nach „Überspringen“. Logik in `core/tutorial`. */
export interface TutorialState {
  step: number;
  done: boolean;
}

/** Lebenslange Zähler für Statistik, Achievements und Quests (überleben später auch Prestige). */
export interface Stats {
  customersServed: number;
  /** Gekaufte Stations-Level (inkl. Auto-Kauf). */
  levelsBought: number;
  taps: number;
  hypeFills: number;
  campaigns: number;
  resets: number;
  events: number;
  questsCompleted: number;
  /** Laufende Spielsekunden am Stück mit Zufriedenheit ≥ Schwelle (aktiver Standort). */
  highSatisfactionSec: number;
  /** Bestwert von `highSatisfactionSec`. */
  highSatisfactionBestSec: number;
  leavesEarned: number;
}

/** Tap-Bonus-Zustand (GAME_DESIGN § 7.4). Zeitfenster in `playtimeSec`. */
export interface TapState {
  /** Hype-Balken 0..hypeMax. */
  hype: number;
  /** Ganze Spielsekunde, in der `windowTaps` gezählt werden (Deckel pro Sekunde). */
  windowStart: number;
  windowTaps: number;
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
  /** Sauberkeit 0..100 (GAME_DESIGN § 7.3). */
  cleanliness: number;
  marketing: MarketingState;
  /** Auto-Kauf „günstigste Station upgraden“; wirkt nur mit Filialleiter (GAME_DESIGN § 6). */
  autoBuy: boolean;
  prestigeCount: number;
  /** Höchstes je erreichtes Café-Level; überlebt den Franchise-Reset (Freischaltung, Blätter-Belohnung). */
  bestLevel: number;
}

/** Zeiten in `playtimeSec`; die Abklingzeit beginnt erst nach dem Ende der Kampagne. */
export interface MarketingState {
  level: number;
  campaignUntil?: number;
  cooldownUntil?: number;
}

export interface MetaState {
  goldenLeaves: Decimal;
  zen: Decimal;
  metaUpgrades: Record<string, number>;
  achievements: Record<string, { unlockedAt: number }>;
  lifetimeEarned: Decimal;
  unlockedLocations: string[];
  skins: SkinState;
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
  /** IDs der laufenden Kalender-Events (lokales Datum, `progressionStep`); wirken an allen Standorten. */
  calendarEvents: string[];
  eventSchedule: EventSchedule;
  boosts: ActiveBoost[];
  /** Spielzeit, ab der der Gratis-Boost (No-op-Monetarisierung) wieder bereitsteht. */
  freeBoostAt: number;
  leafDrops: LeafDropState;
  quests: QuestState;
  tap: TapState;
  stats: Stats;
  tutorial: TutorialState;
}

/** Neuer Standort im Startzustand; Start-Münzen skalieren wie alle Preise mit dem Standort. */
export function createLocationState(locationId: string = START_LOCATION_ID): LocationState {
  const stations: Record<string, StationState> = {};
  for (const s of STATIONS) {
    stations[s.id] = { level: s.startLevel, unlocked: s.unlockCafeLevel <= 1 };
  }
  return {
    coins: D(BALANCE.startCoins).mul(getLocationDef(locationId).scale),
    earnedThisRun: D(0),
    level: 1,
    stations,
    ambience: {},
    // Gründungsteam (GAME_DESIGN § 6): je ein Verkäufer, Barista und Bedienung, damit die Pipeline läuft.
    staff: foundingStaff(),
    quality: 0,
    satisfaction: BALANCE.startSatisfaction,
    cleanliness: BALANCE.cleanliness.start,
    marketing: { level: 0 },
    autoBuy: false,
    prestigeCount: 0,
    bestLevel: 1,
  };
}

export function createStats(): Stats {
  return {
    customersServed: 0,
    levelsBought: 0,
    taps: 0,
    hypeFills: 0,
    campaigns: 0,
    resets: 0,
    events: 0,
    questsCompleted: 0,
    highSatisfactionSec: 0,
    highSatisfactionBestSec: 0,
    leavesEarned: 0,
  };
}

export function createTapState(): TapState {
  return { hype: 0, windowStart: 0, windowTaps: 0 };
}

/** Erster Event-Termin aus dem Seed; `now` als Seed macht jedes neue Spiel anders, aber reproduzierbar. */
export function createEventSchedule(seed: number): EventSchedule {
  const r = rng(seed)();
  const { intervalMinSec: lo, intervalMaxSec: hi } = EVENT_CONFIG;
  return { seed, count: 0, nextAt: lo + r * (hi - lo) };
}

export function createInitialState(now: number, lang: 'de' | 'en' = 'en'): GameState {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    lastSavedAt: now,
    playtimeSec: 0,
    settings: {
      lang,
      sfx: true,
      music: true,
      sfxVolume: AUDIO_DEFAULTS.sfxVolume,
      musicVolume: AUDIO_DEFAULTS.musicVolume,
      numberFormat: 'short',
    },
    meta: {
      goldenLeaves: D(0),
      zen: D(0),
      metaUpgrades: {},
      achievements: {},
      lifetimeEarned: D(0),
      unlockedLocations: [START_LOCATION_ID],
      skins: { owned: [], equipped: [] },
    },
    activeLocationId: START_LOCATION_ID,
    locations: { [START_LOCATION_ID]: createLocationState() },
    activeEvents: [],
    calendarEvents: [],
    eventSchedule: createEventSchedule(hashString(String(now))),
    boosts: [],
    freeBoostAt: FREE_BOOST.intervalSec,
    leafDrops: { date: '', count: 0, fraction: 0 },
    quests: { date: '', items: [], bonusClaimed: false },
    tap: createTapState(),
    stats: createStats(),
    tutorial: { step: 0, done: false },
  };
}

export function getLocation(state: GameState, id: string): LocationState {
  const loc = state.locations[id];
  if (!loc) throw new Error(`Location not in state: ${id}`);
  return loc;
}

/** Goldene Blätter ausgeben; `null`, wenn sie nicht reichen – der Stand wird nie negativ. */
export function spendLeaves(state: GameState, amount: number): GameState | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (state.meta.goldenLeaves.lt(amount)) return null;
  return { ...state, meta: { ...state.meta, goldenLeaves: state.meta.goldenLeaves.sub(amount) } };
}

/** Goldene Blätter gutschreiben (Statistik zählt mit). */
export function grantLeaves(state: GameState, amount: number): GameState {
  if (amount <= 0) return state;
  return {
    ...state,
    meta: { ...state.meta, goldenLeaves: state.meta.goldenLeaves.add(amount) },
    stats: { ...state.stats, leavesEarned: state.stats.leavesEarned + amount },
  };
}

export function withLocation(state: GameState, id: string, loc: LocationState): GameState {
  return { ...state, locations: { ...state.locations, [id]: loc } };
}
