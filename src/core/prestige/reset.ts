import { PRESTIGE } from '@data/prestige';
import { getLocationDef } from '@data/locations';
import { STATIONS, getStationDef } from '@data/stations';
import { D, type Decimal } from '../math/bignum';
import { createLocationState, getLocation, withLocation, type GameState } from '../GameState';
import { computeCafeLevel } from '../economy/cafeLevel';
import { getIncomePerSec } from '../customers/rates';
import { getMetaEffects } from './meta';

/**
 * zenGain = floor(3 × sqrt(earnedThisRun / (1e6 × locationScale)) × (1 + prestigeCount × 0.1))
 * (GAME_DESIGN § 11.2). Die Skalierung sorgt dafür, dass jeder Standort ähnliche Zen-Mengen liefert.
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

/** Start-Münzen nach einem Reset: Basis-Start + Meta-Upgrade „Start-Kapital“ aus dem Einkommen des Vor-Runs. */
export function getResetStartCoins(state: GameState, locationId: string): Decimal {
  const base = createLocationState(locationId).coins;
  const sec = getMetaEffects(state).startCapitalSec;
  if (sec <= 0) return base;
  return base.add(getIncomePerSec(state, locationId).mul(sec));
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
  const fresh = createLocationState(locationId);
  fresh.coins = getResetStartCoins(state, locationId);
  fresh.prestigeCount = old.prestigeCount + 1;
  // „Schnellstart“: die ersten N Stationen (Reihenfolge der Freischaltung) starten auf festem Level.
  const fast = [...STATIONS]
    .sort((a, b) => a.unlockCafeLevel - b.unlockCafeLevel)
    .slice(0, fx.fastStartStations);
  for (const def of fast) {
    const cur = fresh.stations[def.id] ?? { level: 0, unlocked: false };
    fresh.stations[def.id] = { level: Math.max(cur.level, fx.fastStartLevel), unlocked: true };
  }
  fresh.level = computeCafeLevel(fresh);
  for (const [id, st] of Object.entries(fresh.stations)) {
    if (!st.unlocked && fresh.level >= getStationDef(id).unlockCafeLevel) {
      fresh.stations[id] = { ...st, unlocked: true };
    }
  }
  fresh.bestLevel = Math.max(old.bestLevel, old.level, fresh.level);
  const next = withLocation(state, locationId, fresh);
  return {
    ...next,
    meta: { ...next.meta, zen: next.meta.zen.add(zen) },
    stats: { ...next.stats, resets: next.stats.resets + 1 },
  };
}
