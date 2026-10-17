import { BALANCE } from '@data/balance';
import { getCalendarEventDef, getRandomEventDef } from '@data/events';
import { BOOST_RULES, LEAF_DROPS, getSkinDef } from '@data/leaves';
import { FREE_BOOST } from '@data/monetization';
import { AUDIO_DEFAULTS } from '@data/audio';
import { TUTORIAL_STEPS } from '@data/tutorial';
import { STAFF_ROLES, foundingStaff } from '@data/staff';
import { DELIVERY, MATCHA_GRADES, MATCHA_PACKAGES } from '@data/matcha';
import { SOCIAL, getVideoFormat } from '@data/social';
import { OPENING_HOURS, TIME } from '@data/time';
import { hashString } from '../math/random';
import { D, Decimal, isDecimalNaN } from '../math/bignum';
import { clampHours, dayOf } from '../time/clock';
import {
  SCHEMA_VERSION,
  createDayLedger,
  createEventSchedule,
  createSocial,
  createStats,
  createSupply,
  type ActiveBoost,
  type BillsState,
  type DayLedger,
  type LedgerState,
  type OpeningHours,
  type SocialPost,
  type SocialState,
  type SupplyOrder,
  type SupplyState,
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
  type TillState,
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

function reviveLocation(id: string, raw: unknown, clock: number): LocationState {
  if (!isObj(raw)) throw new SaveError(`Invalid location: ${id}`);
  const level = Math.max(1, Math.floor(num(raw['level'], 1)));
  const day = dayOf(clock);
  return {
    ...(raw as unknown as LocationState),
    coins: dec(raw['coins'], `${id}.coins`),
    earnedThisRun: dec(raw['earnedThisRun'], `${id}.earnedThisRun`),
    satisfaction: Math.min(100, Math.max(0, num(raw['satisfaction'], BALANCE.startSatisfaction))),
    cleanliness: Math.min(
      BALANCE.cleanliness.max,
      Math.max(0, num(raw['cleanliness'], BALANCE.cleanliness.start)),
    ),
    autoBuy: raw['autoBuy'] === true,
    level,
    bestLevel: Math.max(level, Math.floor(num(raw['bestLevel'], level))),
    prestigeCount: Math.max(0, Math.floor(num(raw['prestigeCount'], 0))),
    staff: reviveStaff(raw['staff']),
    till: reviveTill(raw['till'], id),
    hours: reviveHours(raw['hours']),
    supply: reviveSupply(raw['supply'], clock),
    social: reviveSocial(raw['social'], day),
    ledger: reviveLedger(raw['ledger'], id, day),
    bills: reviveBills(raw['bills'], id),
  };
}

function reviveHours(raw: unknown): OpeningHours {
  if (!isObj(raw)) return { ...OPENING_HOURS.default };
  return clampHours({
    open: num(raw['open'], OPENING_HOURS.default.open),
    close: num(raw['close'], OPENING_HOURS.default.close),
  });
}

/** Lager: nur bekannte Sorten, Mengen ≥ 0, Bestellungen mit gültiger Sorte, höchstens so viele wie erlaubt. */
function reviveSupply(raw: unknown, clock: number): SupplyState {
  const fresh = createSupply();
  if (!isObj(raw)) return fresh;
  const rawStock = Array.isArray(raw['stock']) ? (raw['stock'] as unknown[]) : [];
  const stock = MATCHA_GRADES.map((_, i) => Math.max(0, num(rawStock[i], 0)));
  const grade = Math.floor(num(raw['grade'], 0));
  const orders: SupplyOrder[] = [];
  if (Array.isArray(raw['orders'])) {
    for (const o of raw['orders'] as unknown[]) {
      if (!isObj(o)) continue;
      const g = Math.floor(num(o['grade'], -1));
      const grams = num(o['grams'], 0);
      if (!MATCHA_GRADES[g] || !(grams > 0)) continue;
      orders.push({
        grade: g,
        grams,
        // Eine Lieferung kommt nie später als zwei Tage nach jetzt (kaputte Zeiten).
        arriveAt: Math.min(num(o['arriveAt'], clock), clock + 2 * TIME.minutesPerDay),
        express: o['express'] === true,
      });
    }
  }
  const pkg = Math.floor(num(raw['autoPackage'], fresh.autoPackage));
  return {
    stock,
    grade: MATCHA_GRADES[grade] ? grade : 0,
    orders: orders.slice(0, DELIVERY.maxOrders),
    autoReorder: raw['autoReorder'] === true,
    autoPackage: MATCHA_PACKAGES[pkg] ? pkg : fresh.autoPackage,
    reorderFailed: raw['reorderFailed'] === true,
    delivered: Math.max(0, Math.floor(num(raw['delivered'], 0))),
    bestGrade: Math.min(
      MATCHA_GRADES.length - 1,
      Math.max(0, Math.floor(num(raw['bestGrade'], 0))),
    ),
  };
}

function reviveSocial(raw: unknown, day: number): SocialState {
  const fresh = createSocial(day);
  if (!isObj(raw)) return fresh;
  const recent: SocialPost[] = [];
  if (Array.isArray(raw['recent'])) {
    for (const p of raw['recent'] as unknown[]) {
      if (!isObj(p) || typeof p['format'] !== 'string' || !getVideoFormat(p['format'])) continue;
      recent.push({
        format: p['format'],
        minute: num(p['minute'], 0),
        views: Math.max(0, num(p['views'], 0)),
        followers: Math.max(0, num(p['followers'], 0)),
        viral: p['viral'] === true,
      });
    }
  }
  return {
    followers: Math.max(0, num(raw['followers'], fresh.followers)),
    buzz: Math.max(0, num(raw['buzz'], 0)),
    day: Math.max(0, Math.floor(num(raw['day'], day))),
    postsToday: Math.min(SOCIAL.postsPerDay, Math.max(0, Math.floor(num(raw['postsToday'], 0)))),
    bonusToday: Math.min(SOCIAL.maxBonusPerDay, Math.max(0, Math.floor(num(raw['bonusToday'], 0)))),
    count: Math.max(0, Math.floor(num(raw['count'], 0))),
    recent: recent.slice(0, SOCIAL.recentMax),
  };
}

const LEDGER_KEYS = [
  'revenue',
  'tips',
  'wages',
  'goods',
  'matcha',
  'rent',
  'marketing',
  'hiring',
  'bonus',
] as const;

function reviveDay(raw: unknown, what: string): DayLedger {
  const out = createDayLedger();
  if (!isObj(raw)) return out;
  out.guests = Math.max(0, num(raw['guests'], 0));
  for (const k of LEDGER_KEYS) {
    if (raw[k] !== undefined) out[k] = dec(raw[k], `${what}.${k}`);
  }
  return out;
}

function reviveLedger(raw: unknown, id: string, day: number): LedgerState {
  if (!isObj(raw)) return { day, today: createDayLedger(), yesterday: null };
  return {
    day: Math.max(0, Math.floor(num(raw['day'], day))),
    today: reviveDay(raw['today'], `${id}.ledger.today`),
    yesterday: raw['yesterday'] ? reviveDay(raw['yesterday'], `${id}.ledger.yesterday`) : null,
  };
}

/** Offene Kosten nie negativ (sonst schenkte ein kaputter Save Geld). */
function reviveBills(raw: unknown, id: string): BillsState {
  const r = isObj(raw) ? raw : {};
  const pending = r['pending'] === undefined ? D(0) : dec(r['pending'], `${id}.bills.pending`);
  const last = r['last'] === undefined ? D(0) : dec(r['last'], `${id}.bills.last`);
  return {
    pending: pending.lt(0) ? D(0) : pending,
    last: last.lt(0) ? D(0) : last,
    count: Math.max(0, Math.floor(num(r['count'], 0))),
  };
}

/** Kaputte Kasse startet leer; offene Bons nie negativ, Fortschritt im Bereich 0..1. */
function reviveTill(raw: unknown, id: string): TillState {
  const t = isObj(raw) ? raw : {};
  const open = t['open'] === undefined ? D(0) : dec(t['open'], `${id}.till.open`);
  return {
    open: open.lt(0) ? D(0) : open,
    progress: Math.min(1, Math.max(0, num(t['progress'], 0))),
    paid: Math.max(0, Math.floor(num(t['paid'], 0))),
  };
}

/**
 * Nur bekannte Rollen, ganze Zahlen bis zum Höchststand; du an der Kasse bist immer da (lässt sich nicht
 * entlassen). Alle anderen Rollen dürfen 0 sein – Personal lässt sich seit Phase 3 entlassen.
 */
function reviveStaff(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (isObj(raw)) {
    for (const role of STAFF_ROLES) {
      const n = Math.min(role.maxLevel, Math.floor(num(raw[role.id], 0)));
      if (n > 0) out[role.id] = n;
    }
  } else Object.assign(out, foundingStaff());
  for (const role of STAFF_ROLES) {
    if (role.owner > 0) out[role.id] = Math.max(out[role.id] ?? 0, role.owner);
  }
  return out;
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

  const clock = Math.max(0, num(raw['clock'], TIME.startMinute));
  const revived: Record<string, LocationState> = {};
  for (const [id, loc] of Object.entries(locations)) revived[id] = reviveLocation(id, loc, clock);
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
    clock,
    // Nie hinter die Uhr: sonst würden vergangene Stunden noch einmal abgerechnet.
    hourMark: Math.floor(clock / 60 + 1e-9),
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
