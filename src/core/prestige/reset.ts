import { PRESTIGE } from '@data/prestige';
import { getLocationDef } from '@data/locations';
import { STATIONS } from '@data/stations';
import { D, type Decimal } from '../math/bignum';
import { createLocationState, getLocation, withLocation, type GameState } from '../GameState';
import { computeCafeLevel } from '../economy/cafeLevel';
import { peakIncomePerHour } from '../customers/rates';
import { dayOf } from '../time/clock';
import { getMetaEffects } from './meta';

/**
 * zenGain = floor(factor × sqrt(earnedThisRun / (divisor × locationScale)) × (1 + prestigeCount × perPrestige))
 * (GAME_DESIGN § 11.2, Werte in `PRESTIGE.zen`). Die Skalierung sorgt dafür, dass jeder Standort ähnliche
 * Zen-Mengen liefert.
 */
export function computeZenGain(state: GameState, locationId: string): Decimal {
  const loc = getLocation(state, locationId);
  const z = PRESTIGE.zen;
  const scaled = loc.earnedThisRun.div(z.divisor * getLocationDef(locationId).scale);
  if (scaled.lte(0)) return D(0);
  return scaled
    .sqrt()
    .mul(z.factor * (1 + loc.prestigeCount * z.perPrestige))
    .floor();
}

export function canReset(state: GameState, locationId: string): boolean {
  return getLocation(state, locationId).level >= PRESTIGE.resetMinCafeLevel;
}

/** Startkapital nach einem Reset: Basis + Meta-Upgrade „Startkapital“ aus dem Umsatz des Vor-Runs zur Hauptzeit. */
export function getResetStartCoins(state: GameState, locationId: string): Decimal {
  const base = createLocationState(locationId).coins;
  const hours = getMetaEffects(state).startCapitalHours;
  if (hours <= 0) return base;
  return base.add(peakIncomePerHour(state, locationId).mul(hours));
}

/**
 * Franchise-Reset (GAME_DESIGN § 11.1): setzt nur den `LocationState` zurück. `meta` bleibt erhalten und
 * bekommt das Zen; `prestigeCount` und `bestLevel` des Standorts überleben. Gibt den alten State zurück,
 * wenn das Café-Level noch nicht reicht.
 */
export function franchiseReset(state: GameState, locationId: string): GameState {
  if (!canReset(state, locationId)) return state;
  const old = getLocation(state, locationId);
  const zen = computeZenGain(state, locationId);
  const fx = getMetaEffects(state);
  const fresh = createLocationState(locationId, dayOf(state.clock));
  fresh.coins = getResetStartCoins(state, locationId);
  fresh.prestigeCount = old.prestigeCount + 1;
  // Öffnungszeiten sind eine Vorliebe des Spielers, keine Ausbaustufe.
  fresh.hours = { ...old.hours };
  // „Schnellstart“: die ersten N Geräte (Reihenfolge der Freischaltung) starten auf festem Level.
  const fast = [...STATIONS]
    .sort((a, b) => a.unlockCafeLevel - b.unlockCafeLevel)
    .slice(0, fx.fastStartStations);
  for (const def of fast) {
    const cur = fresh.stations[def.id] ?? { level: 0, unlocked: false };
    fresh.stations[def.id] = { level: Math.max(cur.level, fx.fastStartLevel), unlocked: true };
  }
  // Die Schnellstart-Stationen sind die mit dem niedrigsten Freischalt-Level; was das neue Café-Level
  // zusätzlich freigibt, ist damit schon dabei.
  fresh.level = computeCafeLevel(fresh);
  fresh.bestLevel = Math.max(old.bestLevel, old.level, fresh.level);
  const next = withLocation(state, locationId, fresh);
  return {
    ...next,
    meta: { ...next.meta, zen: next.meta.zen.add(zen) },
    stats: { ...next.stats, resets: next.stats.resets + 1 },
  };
}
