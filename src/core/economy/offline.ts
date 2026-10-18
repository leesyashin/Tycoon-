import { BALANCE } from '@data/balance';
import { OPENING_HOURS } from '@data/time';
import { getMetaUpgradeDef } from '@data/prestige';
import { Decimal, D } from '../math/bignum';
import type { GameState } from '../GameState';
import { advanceEventsOffline } from '../events/schedule';
import { advanceRealSeconds } from './simulate';
import { dayOf, realSecondsPerDay } from '../time/clock';

/** Höchstens so viele Spieltage läuft das Café ohne dich (bester Filialleiter aller Standorte). */
export function getOfflineCapDays(state: GameState): number {
  const table = BALANCE.offline.capDaysByManagerLevel;
  const manager = Object.values(state.locations).reduce(
    (m, l) => Math.max(m, l.staff['manager'] ?? 0),
    0,
  );
  return table[Math.min(table.length - 1, Math.max(0, Math.floor(manager)))] ?? table[0];
}

/** Deckel der Abwesenheit in echter Zeit: so lange dauern diese Spieltage mit den Öffnungszeiten des aktiven Cafés. */
export function getOfflineCapMs(state: GameState): number {
  const loc = state.locations[state.activeLocationId];
  const hours = loc?.hours ?? OPENING_HOURS.default;
  return getOfflineCapDays(state) * realSecondsPerDay(hours) * 1000;
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
  /** Abwesenheit bis zum Deckel (Filialleiter). */
  creditedMs: number;
  /** Netto-Änderung des Geldes aller Cafés (Umsatz − Kosten; kann negativ sein). */
  earned: Decimal;
  /** Umsatz inklusive Trinkgeld. */
  revenue: Decimal;
  /** Gäste, die in der Zeit bedient wurden. */
  guests: number;
  /** Vergangene Spieltage. */
  days: number;
}

function totalCoins(state: GameState): Decimal {
  return Object.values(state.locations).reduce((a, l) => a.add(l.coins), D(0));
}

/**
 * Café-Betrieb ohne zeitlich begrenzte Multiplikatoren (Boosts, Events): Ihre Timer laufen in aktiver Spielzeit
 * und stehen offline still; ohne das Abziehen würde ein 10-min-Boost für Stunden zählen.
 */
export function simulateAway(state: GameState, realSec: number): GameState {
  const plain = { ...state, boosts: [], activeEvents: [] };
  const run = advanceRealSeconds(plain, realSec, { direct: true });
  return { ...run, boosts: state.boosts, activeEvents: state.activeEvents };
}

/**
 * Abwesenheit (GAME_DESIGN § 14): Das Café läuft weiter – mit Gästen, Löhnen, Miete, Matcha-Verbrauch und
 * Lieferungen –, bis zum Deckel und zu dem Anteil der Offline-Effizienz (so viel der Zeit wird gespielt). Negative
 * Deltas (Uhr zurückgestellt) zählen als 0. Events laufen in Echtzeit weiter und werden abgeschlossen, wenn sie in
 * der Abwesenheit geendet hätten.
 */
export function applyOffline(state: GameState, elapsedMs: number): OfflineResult {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const credited = Math.min(elapsed, getOfflineCapMs(state));
  const seconds = (credited / 1000) * getOfflineEfficiency(state);
  const run = seconds > 0 ? simulateAway(state, seconds) : state;
  return {
    state: advanceEventsOffline(run, elapsed / 1000),
    elapsedMs: elapsed,
    creditedMs: credited,
    earned: totalCoins(run).sub(totalCoins(state)),
    revenue: run.meta.lifetimeEarned.sub(state.meta.lifetimeEarned),
    guests: run.stats.customersServed - state.stats.customersServed,
    days: dayOf(run.clock) - dayOf(state.clock),
  };
}

/** Beim Laden: Differenz zwischen `now` und dem letzten Speichern. */
export function catchUpOffline(state: GameState, now: number): OfflineResult {
  return applyOffline(state, now - state.lastSavedAt);
}
