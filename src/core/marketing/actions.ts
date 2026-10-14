import { BALANCE } from '@data/balance';
import { getLocationDef } from '@data/locations';
import { getLocation, spendLeaves, withLocation, type GameState } from '../GameState';
import { Decimal, D } from '../math/bignum';
import { collectModifiers } from '../economy/modifiers';
import { computeLocationRates } from '../customers/rates';
import { campaignCooldownSec, campaignStatus } from './effects';

/** Kampagnen-Level: base × 1.6^level × Standort-Skalierung × (1 − Rabatt). */
export function getMarketingLevelCost(state: GameState, locationId: string): Decimal {
  const m = BALANCE.marketing;
  const level = getLocation(state, locationId).marketing.level;
  return D(m.growth)
    .pow(level)
    .mul(m.baseCost * getLocationDef(locationId).scale * (1 - collectModifiers(state).discount));
}

export function isMarketingUnlocked(state: GameState, locationId: string): boolean {
  return getLocation(state, locationId).level >= BALANCE.marketing.unlockCafeLevel;
}

export function isMarketingMaxed(state: GameState, locationId: string): boolean {
  return getLocation(state, locationId).marketing.level >= BALANCE.marketing.maxLevel;
}

export function buyMarketingLevel(state: GameState, locationId: string): GameState {
  if (!isMarketingUnlocked(state, locationId) || isMarketingMaxed(state, locationId)) return state;
  const loc = getLocation(state, locationId);
  const cost = getMarketingLevelCost(state, locationId);
  if (loc.coins.lt(cost)) return state;
  return withLocation(state, locationId, {
    ...loc,
    coins: loc.coins.sub(cost),
    marketing: { ...loc.marketing, level: loc.marketing.level + 1 },
  });
}

/** Aktive Kampagne kostet 2 Minuten aktuelles Einkommen, mindestens `campaignMinCost` (sonst wäre sie am Start gratis). */
export function getCampaignCost(state: GameState, locationId: string): Decimal {
  const m = BALANCE.marketing;
  const income = computeLocationRates(state, locationId).incomePerSec;
  const floor = D(m.campaignMinCost * getLocationDef(locationId).scale);
  return Decimal.max(income.mul(m.campaignIncomeSec), floor);
}

export function startCampaign(state: GameState, locationId: string): GameState {
  if (!isMarketingUnlocked(state, locationId)) return state;
  const loc = getLocation(state, locationId);
  if (campaignStatus(loc, state.playtimeSec).phase !== 'ready') return state;
  const cost = getCampaignCost(state, locationId);
  if (loc.coins.lt(cost)) return state;
  const until = state.playtimeSec + BALANCE.marketing.campaignDurationSec;
  const counted = { ...state, stats: { ...state.stats, campaigns: state.stats.campaigns + 1 } };
  return withLocation(counted, locationId, {
    ...loc,
    coins: loc.coins.sub(cost),
    marketing: {
      ...loc.marketing,
      campaignUntil: until,
      cooldownUntil: until + campaignCooldownSec(loc),
    },
  });
}

/** Beendet die Abklingzeit sofort gegen Goldene Blätter (GAME_DESIGN § 9). */
export function skipCampaignCooldown(state: GameState, locationId: string): GameState {
  const loc = getLocation(state, locationId);
  const price = BALANCE.marketing.skipCooldownLeaves;
  if (campaignStatus(loc, state.playtimeSec).phase !== 'cooldown') return state;
  const paid = spendLeaves(state, price);
  if (!paid) return state;
  return withLocation(paid, locationId, { ...loc, marketing: { level: loc.marketing.level } });
}
