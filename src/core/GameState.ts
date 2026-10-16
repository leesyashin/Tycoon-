import { Decimal, D } from './math/bignum';
import { BALANCE } from '@data/balance';
import { STATIONS } from '@data/stations';
import { foundingStaff } from '@data/staff';
import { startAmbience } from '@data/ambience';
import { START_LOCATION_ID, getLocationDef } from '@data/locations';
import { EVENT_CONFIG } from '@data/events';
import { FREE_BOOST } from '@data/monetization';
import { AUDIO_DEFAULTS } from '@data/audio';
import { DELIVERY, MATCHA_GRADES } from '@data/matcha';
import { SOCIAL } from '@data/social';
import { OPENING_HOURS, TIME } from '@data/time';
import { hashString, rng } from './math/random';
import { createTill } from './economy/till';

export const SCHEMA_VERSION = 11;

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
  /** Gepostete Videos (Social Media). */
  videos: number;
  /** Matcha-Bestellungen beim Lieferanten. */
  matchaOrders: number;
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

/**
 * Offene Bons der Kasse (GAME_DESIGN § 7.2): Umsatz der Gäste, die gerade bestellen und bezahlen. Ins Geld
 * (`coins`) kommt er erst, wenn ein Gast fertig bezahlt hat (`settleTill`).
 */
export interface TillState {
  /** Umsatz, der noch nicht bezahlt ist. */
  open: Decimal;
  /** Wie weit der nächste Gast mit dem Bezahlen ist (0..1). */
  progress: number;
  /** Bezahlte Gäste seit Beginn des Laufs; die Szene zeigt je Zahlung Kassenlade und Geldschein. */
  paid: number;
}

/** Öffnungszeiten eines Cafés in vollen Stunden (`close` 24 = Mitternacht). */
export interface OpeningHours {
  open: number;
  close: number;
}

/** Matcha-Bestellung beim Lieferanten, unterwegs bis `arriveAt` (Spielminute). */
export interface SupplyOrder {
  grade: number;
  grams: number;
  arriveAt: number;
  express: boolean;
}

/** Matcha-Lager eines Cafés (GAME_DESIGN § 8). */
export interface SupplyState {
  /** Vorrat je Sorte in Gramm (Index = Sorte). */
  stock: number[];
  /** Sorte im Ausschank; ist sie leer, nimmt die Bar die beste vorrätige. */
  grade: number;
  orders: SupplyOrder[];
  /** Automatisch nachbestellen, wenn der Vorrat knapp wird (Sorte im Ausschank, normale Lieferung). */
  autoReorder: boolean;
  /** Packung der automatischen Nachbestellung (Index in `MATCHA_PACKAGES`). */
  autoPackage: number;
  /** Die letzte automatische Nachbestellung scheiterte am Kontostand (Hinweis in der UI). */
  reorderFailed: boolean;
  /** Angekommene Lieferungen seit Beginn des Laufs (die Szene zeigt je Lieferung den Kurier). */
  delivered: number;
  /** Beste je bestellte Sorte (Erfolge). */
  bestGrade: number;
}

/** Ein gepostetes Video (für die Anzeige im Account). */
export interface SocialPost {
  format: string;
  /** Spielminute des Posts. */
  minute: number;
  views: number;
  followers: number;
  viral: boolean;
}

/** Social-Media-Account eines Cafés (GAME_DESIGN § 9, Phase 3). */
export interface SocialState {
  followers: number;
  /** Kurzer Nachfrage-Schub aus frischen Videos, klingt mit der Zeit ab. */
  buzz: number;
  /** Spieltag, auf den sich die Tageszähler beziehen. */
  day: number;
  postsToday: number;
  bonusToday: number;
  /** Fortlaufende Nummer aller Videos dieses Accounts (Seed für Reichweite und Viralität). */
  count: number;
  /** Neueste zuerst, höchstens `SOCIAL.recentMax`. */
  recent: SocialPost[];
}

/** Geld eines Tages, aufgeteilt (Tagesbilanz in der Verwaltung). Einnahmen positiv, Kosten als Beträge ≥ 0. */
export interface DayLedger {
  guests: number;
  revenue: Decimal;
  tips: Decimal;
  wages: Decimal;
  goods: Decimal;
  matcha: Decimal;
  rent: Decimal;
  marketing: Decimal;
  hiring: Decimal;
  /** Boni außerhalb des Verkaufs: Anfeuern (Tap), Belohnung für ein neues Café-Level. */
  bonus: Decimal;
}

export interface LedgerState {
  /** Spieltag von `today`. */
  day: number;
  today: DayLedger;
  yesterday: DayLedger | null;
}

/**
 * Laufende Kosten (Löhne, Wareneinsatz, Miete, Strom) sammeln sich in `pending` und werden zu jeder vollen
 * Spielstunde vom Konto abgebucht; `count`/`last` zeigen die letzte Abbuchung (Szene und HUD).
 */
export interface BillsState {
  pending: Decimal;
  last: Decimal;
  count: number;
}

export interface LocationState {
  /** Geld des Standorts in Euro (im Spiel als Geldscheine gezeigt; der Name stammt aus Phase 1). Kann ins Minus gehen. */
  coins: Decimal;
  earnedThisRun: Decimal;
  level: number;
  stations: Record<string, StationState>;
  ambience: Record<string, number>;
  staff: Record<string, number>;
  satisfaction: number;
  /** Sauberkeit 0..100 (GAME_DESIGN § 7.3). */
  cleanliness: number;
  /** Auto-Kauf „günstigstes Gerät upgraden“; wirkt nur mit Filialleiter (GAME_DESIGN § 6). */
  autoBuy: boolean;
  prestigeCount: number;
  /** Höchstes je erreichtes Café-Level; überlebt den Franchise-Reset (Freischaltung, Blätter-Belohnung). */
  bestLevel: number;
  till: TillState;
  hours: OpeningHours;
  supply: SupplyState;
  social: SocialState;
  ledger: LedgerState;
  bills: BillsState;
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
  /**
   * Spieluhr in Spielminuten seit Spielbeginn (Tag 0, 00:00). Eine Spielstunde dauert eine echte Minute, solange das
   * aktive Café geöffnet ist; geschlossen spult die Nacht vor (`data/time.ts`).
   */
  clock: number;
  /** Zuletzt abgerechnete volle Spielstunde (Kosten, Lieferungen, Tageswechsel). */
  hourMark: number;
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

export function createDayLedger(): DayLedger {
  return {
    guests: 0,
    revenue: D(0),
    tips: D(0),
    wages: D(0),
    goods: D(0),
    matcha: D(0),
    rent: D(0),
    marketing: D(0),
    hiring: D(0),
    bonus: D(0),
  };
}

export function createSupply(): SupplyState {
  const stock = MATCHA_GRADES.map(() => 0);
  stock[0] = DELIVERY.startStockGrams;
  return {
    stock,
    grade: 0,
    orders: [],
    // Standard an: sonst geht der Matcha nach gut einem Tag aus (auch in der Abwesenheit).
    autoReorder: true,
    autoPackage: 1,
    reorderFailed: false,
    delivered: 0,
    bestGrade: 0,
  };
}

export function createSocial(day = 0): SocialState {
  return {
    followers: SOCIAL.startFollowers,
    buzz: 0,
    day,
    postsToday: 0,
    bonusToday: 0,
    count: 0,
    recent: [],
  };
}

/**
 * Neuer Standort im Startzustand: kleines Café mit einem Tisch, Matcha-Station, dir an der Kasse und einem
 * Barista; Startkapital und Preise skalieren mit dem Preisniveau des Standorts. `day` = aktueller Spieltag.
 */
export function createLocationState(
  locationId: string = START_LOCATION_ID,
  day = 0,
): LocationState {
  const stations: Record<string, StationState> = {};
  for (const s of STATIONS) {
    stations[s.id] = { level: s.startLevel, unlocked: s.unlockCafeLevel <= 1 };
  }
  return {
    coins: D(BALANCE.startCoins).mul(getLocationDef(locationId).scale),
    earnedThisRun: D(0),
    level: 1,
    stations,
    ambience: startAmbience(),
    // Gründungsteam (GAME_DESIGN § 6): du an der Kasse und ein Barista.
    staff: foundingStaff(),
    satisfaction: BALANCE.startSatisfaction,
    cleanliness: BALANCE.cleanliness.start,
    autoBuy: false,
    prestigeCount: 0,
    bestLevel: 1,
    till: createTill(),
    hours: { ...OPENING_HOURS.default },
    supply: createSupply(),
    social: createSocial(day),
    ledger: { day, today: createDayLedger(), yesterday: null },
    bills: { pending: D(0), last: D(0), count: 0 },
  };
}

export function createStats(): Stats {
  return {
    customersServed: 0,
    levelsBought: 0,
    taps: 0,
    hypeFills: 0,
    videos: 0,
    matchaOrders: 0,
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
    clock: TIME.startMinute,
    hourMark: Math.floor(TIME.startMinute / 60),
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
