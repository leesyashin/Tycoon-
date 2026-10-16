import { getLocationDef } from '@data/locations';
import { SOCIAL, VIDEO_FORMATS, getVideoFormat, type VideoFormatDef } from '@data/social';
import {
  getLocation,
  spendLeaves,
  withLocation,
  type GameState,
  type LocationState,
  type SocialState,
} from '../GameState';
import { D, type Decimal } from '../math/bignum';
import { hashString, rng } from '../math/random';
import { payCost } from '../economy/ledger';
import { getStaffLevel } from '../staff/effects';
import { gradeInUse } from '../supply/stock';
import { dayOf } from '../time/clock';

/** Kosten eines Videos (× Preisniveau). */
export function getVideoCost(def: VideoFormatDef, locationId: string): Decimal {
  return D(def.cost * getLocationDef(locationId).scale);
}

export function isFormatUnlocked(loc: LocationState, def: VideoFormatDef): boolean {
  if (loc.level < def.unlockCafeLevel) return false;
  return def.needs !== 'barista' || getStaffLevel(loc, 'barista') > 0;
}

/** Freie Videos heute (ohne Bonus-Videos). */
export function postsLeftToday(loc: LocationState): number {
  return Math.max(0, SOCIAL.postsPerDay - loc.social.postsToday);
}

/**
 * Reichweiten-Faktor des Accounts: mehr Follower, schöneres Café (Deko), besserer Matcha, Social-Media-Manager,
 * zufriedene Gäste.
 */
export function videoReachMult(loc: LocationState): number {
  const s = SOCIAL;
  const grade = Math.max(0, gradeInUse(loc.supply));
  return (
    (1 + Math.max(0, loc.social.followers) / s.followerReach.per) ** s.followerReach.exp *
    (1 + (loc.ambience['decor'] ?? 0) * s.perDecorReach) *
    (1 + grade * s.perGradeReach) *
    (1 + getStaffLevel(loc, 'socialMedia') * s.perManagerReach) *
    (s.satisfactionReach.base + loc.satisfaction * s.satisfactionReach.per)
  );
}

export interface VideoPreview {
  views: number;
  followers: number;
}

/** Erwartete Views und neue Follower eines Videos (ohne Zufall und ohne viral). */
export function previewVideo(loc: LocationState, def: VideoFormatDef): VideoPreview {
  const views = def.reach * videoReachMult(loc);
  return { views, followers: views * def.conversion };
}

export type PostBlock = 'locked' | 'limit' | 'money' | null;

/** Warum gerade nicht gepostet werden kann (`null` = es geht). Bonus-Videos zählen nicht gegen das Tageslimit. */
export function postBlock(
  state: GameState,
  locationId: string,
  formatId: string,
  bonus = false,
): PostBlock {
  const loc = getLocation(state, locationId);
  const def = getVideoFormat(formatId);
  if (!def || !isFormatUnlocked(loc, def)) return 'locked';
  if (bonus) {
    if (loc.social.bonusToday >= SOCIAL.maxBonusPerDay) return 'limit';
    if (state.meta.goldenLeaves.lt(SOCIAL.bonusVideoLeaves)) return 'money';
  } else if (postsLeftToday(loc) <= 0) return 'limit';
  // Gratis-Videos gehen auch im Minus (sonst verliert ein kriselndes Café noch seine Follower).
  const cost = getVideoCost(def, locationId);
  if (cost.gt(0) && loc.coins.lt(cost)) return 'money';
  return null;
}

/** Das n-te Video eines Accounts würfelt immer gleich (Seed aus Spielstart, Standort und Nummer). */
function videoRoll(state: GameState, locationId: string, count: number): () => number {
  return rng(hashString(`${String(state.createdAt)}:${locationId}:${String(count)}`));
}

function applyPost(
  state: GameState,
  locationId: string,
  def: VideoFormatDef,
  bonus: boolean,
): GameState {
  const loc = getLocation(state, locationId);
  const paid = payCost(loc, 'marketing', getVideoCost(def, locationId));
  const rand = videoRoll(state, locationId, loc.social.count);
  const s = SOCIAL;
  const viral = rand() < def.viralChance;
  const spread = 1 + (rand() * 2 - 1) * s.spread;
  const boost = viral ? s.viral.min + rand() * (s.viral.max - s.viral.min) : 1;
  const views = Math.round(previewVideo(loc, def).views * spread * boost);
  const gained = Math.round(views * def.conversion);
  const social: SocialState = {
    ...paid.social,
    followers: paid.social.followers + gained,
    buzz: paid.social.buzz + views * s.buzzPerView,
    postsToday: paid.social.postsToday + (bonus ? 0 : 1),
    bonusToday: paid.social.bonusToday + (bonus ? 1 : 0),
    count: paid.social.count + 1,
    recent: [
      { format: def.id, minute: state.clock, views, followers: gained, viral },
      ...paid.social.recent,
    ].slice(0, s.recentMax),
  };
  const next = withLocation(state, locationId, { ...paid, social });
  return { ...next, stats: { ...next.stats, videos: next.stats.videos + 1 } };
}

/** Postet ein Video (eins der drei am Tag); alter State, wenn gesperrt, Limit erreicht oder zu teuer. */
export function postVideo(state: GameState, locationId: string, formatId: string): GameState {
  const def = getVideoFormat(formatId);
  if (!def || postBlock(state, locationId, formatId) !== null) return state;
  return applyPost(state, locationId, def, false);
}

/** Bonus-Video über das Tageslimit gegen Goldene Blätter. */
export function postBonusVideo(state: GameState, locationId: string, formatId: string): GameState {
  const def = getVideoFormat(formatId);
  if (!def || postBlock(state, locationId, formatId, true) !== null) return state;
  const paid = spendLeaves(state, SOCIAL.bonusVideoLeaves);
  return paid ? applyPost(paid, locationId, def, true) : state;
}

/** Buzz klingt ab (Halbwertszeit in Spielstunden). */
export function decayBuzz(social: SocialState, dtHours: number): SocialState {
  if (social.buzz <= 0 || dtHours <= 0) return social;
  const buzz = social.buzz * 0.5 ** (dtHours / SOCIAL.buzzHalfLifeHours);
  return { ...social, buzz: buzz < 1e-4 ? 0 : buzz };
}

/** Neuer Spieltag: wer gestern nichts gepostet hat, verliert ein paar Follower; Tageszähler beginnen neu. */
export function rolloverSocial(social: SocialState, clock: number): SocialState {
  const day = dayOf(clock);
  if (day <= social.day) return social;
  const idle = social.postsToday === 0 && social.bonusToday === 0;
  const followers = idle
    ? Math.round(social.followers * (1 - SOCIAL.decayPerDayWithoutPost))
    : social.followers;
  return { ...social, day, postsToday: 0, bonusToday: 0, followers };
}

/**
 * Social-Media-Manager postet zu festen Stunden (Stufe n: die ersten n Stunden aus `SOCIAL.managerPostHours`) das
 * Format mit den meisten neuen Followern je Euro, das er sich leisten kann.
 */
export function managerPostStep(
  state: GameState,
  locationId: string,
  hourOfDay: number,
): GameState {
  const loc = getLocation(state, locationId);
  const level = getStaffLevel(loc, 'socialMedia');
  if (level <= 0 || !SOCIAL.managerPostHours.slice(0, level).includes(hourOfDay)) return state;
  let best: { id: string; value: number } | null = null;
  for (const def of VIDEO_FORMATS) {
    if (postBlock(state, locationId, def.id) !== null) continue;
    const gain = previewVideo(loc, def).followers;
    const cost = getVideoCost(def, locationId).toNumber();
    const value = gain / (1 + cost);
    if (!best || value > best.value) best = { id: def.id, value };
  }
  return best ? postVideo(state, locationId, best.id) : state;
}
