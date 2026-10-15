import { BALANCE } from '@data/balance';
import { getMetaUpgradeDef } from '@data/prestige';
import { Decimal, D } from '../math/bignum';
import { getLocation, type GameState } from '../GameState';
import { computeLocationRates } from '../customers/rates';
import { advanceEventsOffline } from '../events/schedule';

export function getOfflineCapMs(state: GameState): number {
  const o = BALANCE.offline;
  const manager = Object.values(state.locations).reduce(
    (m, l) => Math.max(m, l.staff['manager'] ?? 0),
    0,
  );
  const hours = Math.min(o.maxCapHours, o.baseCapHours + manager * o.perManagerHours);
  return hours * 3_600_000;
}

export function getOfflineEfficiency(state: GameState): number {
  const o = BALANCE.offline;
  const lvl = state.meta.metaUpgrades['offlineEfficiency'] ?? 0;
  return Math.min(
    o.maxEfficiency,
    o.baseEfficiency + lvl * getMetaUpgradeDef('offlineEfficiency').perLevel,
  );
}

export interface OfflineResult {
  state: GameState;
  elapsedMs: number;
  creditedMs: number;
  earned: Decimal;
}

/**
 * Zustand ohne zeitlich begrenzte Multiplikatoren (Boosts, Events, aktive Kampagne; den Influencer-Hype
 * schaltet `creditIncome` in den Raten ab). Ihre Timer laufen
 * in Spielzeit und stehen offline still; ohne das Abziehen würde ein 10-min-Boost für bis zu 14 h zählen.
 */
export function withoutTemporaryBoosts(state: GameState): GameState {
  const locations = { ...state.locations };
  for (const [id, loc] of Object.entries(state.locations)) {
    locations[id] = { ...loc, marketing: { ...loc.marketing, campaignUntil: undefined } };
  }
  return { ...state, boosts: [], activeEvents: [], locations };
}

export interface CreditResult {
  state: GameState;
  earned: Decimal;
}

/**
 * Schreibt `seconds` Einkommen aller Standorte gut, mit der Rate ohne zeitlich begrenzte Multiplikatoren.
 * Gemeinsame Grundlage für Offline-Einnahmen und den Zeitsprung.
 */
export function creditIncome(state: GameState, seconds: number): CreditResult {
  if (!(seconds > 0)) return { state, earned: D(0) };
  const rateState = withoutTemporaryBoosts(state);
  let total = D(0);
  let served = 0;
  const locations = { ...state.locations };
  for (const id of Object.keys(state.locations)) {
    const loc = getLocation(state, id);
    const rates = computeLocationRates(rateState, id, { influencerHype: false });
    const gain = rates.incomePerSec.mul(seconds);
    served += rates.served * seconds;
    total = total.add(gain);
    locations[id] = {
      ...loc,
      coins: loc.coins.add(gain),
      earnedThisRun: loc.earnedThisRun.add(gain),
    };
  }
  return {
    state: {
      ...state,
      locations,
      meta: { ...state.meta, lifetimeEarned: state.meta.lifetimeEarned.add(total) },
      stats: { ...state.stats, customersServed: state.stats.customersServed + served },
    },
    earned: total,
  };
}

/**
 * Schreibt Offline-Einnahmen gut. Negative Deltas (Uhr zurückgestellt) zählen als 0.
 * Die Rate wird aus dem Zustand beim Speichern genommen und bleibt konstant. Events laufen in
 * Echtzeit weiter und werden abgeschlossen, wenn sie in der Abwesenheit geendet hätten.
 */
export function applyOffline(state: GameState, elapsedMs: number): OfflineResult {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const credited = Math.min(elapsed, getOfflineCapMs(state));
  const seconds = (credited / 1000) * getOfflineEfficiency(state);
  const { state: paid, earned } = creditIncome(state, seconds);
  return {
    state: advanceEventsOffline(paid, elapsed / 1000),
    elapsedMs: elapsed,
    creditedMs: credited,
    earned,
  };
}

/** Beim Laden: Differenz zwischen `now` und dem letzten Speichern. */
export function catchUpOffline(state: GameState, now: number): OfflineResult {
  return applyOffline({ ...state, lastSavedAt: state.lastSavedAt }, now - state.lastSavedAt);
}
