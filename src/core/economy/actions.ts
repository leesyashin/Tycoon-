import { STATIONS, getStationDef } from '@data/stations';
import { getLocation, withLocation, type GameState } from '../GameState';
import { collectModifiers } from './modifiers';
import { computeCafeLevel } from './cafeLevel';
import { getMaxAffordable, getStationCost } from './stations';
import type { Decimal } from '../math/bignum';
import { canAutoBuy } from '../staff/effects';

export type BulkAmount = 1 | 10 | 100 | 'max';

export function isStationUnlocked(
  state: GameState,
  locationId: string,
  stationId: string,
): boolean {
  const loc = getLocation(state, locationId);
  return loc.level >= getStationDef(stationId).unlockCafeLevel;
}

/** Wie viele Level ein Kauf mit `amount` tatsächlich bringt (bei `max`: so viele wie bezahlbar). */
export function resolveAmount(
  state: GameState,
  locationId: string,
  stationId: string,
  amount: BulkAmount,
): number {
  const loc = getLocation(state, locationId);
  const def = getStationDef(stationId);
  const level = loc.stations[stationId]?.level ?? 0;
  if (amount === 'max') {
    return getMaxAffordable(def, level, loc.coins, locationId, collectModifiers(state).discount);
  }
  return amount;
}

export function getBulkCost(
  state: GameState,
  locationId: string,
  stationId: string,
  amount: BulkAmount,
) {
  const loc = getLocation(state, locationId);
  const def = getStationDef(stationId);
  const n = resolveAmount(state, locationId, stationId, amount);
  const level = loc.stations[stationId]?.level ?? 0;
  return getStationCost(def, level, n, locationId, collectModifiers(state).discount);
}

/** Kauft Level; gibt den alten State zurück, wenn nicht möglich (gesperrt, zu teuer, n = 0). */
export function buyStation(
  state: GameState,
  locationId: string,
  stationId: string,
  amount: BulkAmount,
): GameState {
  if (!isStationUnlocked(state, locationId, stationId)) return state;
  const loc = getLocation(state, locationId);
  const n = resolveAmount(state, locationId, stationId, amount);
  if (n <= 0) return state;
  const cost = getBulkCost(state, locationId, stationId, amount);
  if (loc.coins.lt(cost)) return state;
  const cur = loc.stations[stationId] ?? { level: 0, unlocked: true };
  const next = {
    ...loc,
    coins: loc.coins.sub(cost),
    stations: { ...loc.stations, [stationId]: { level: cur.level + n, unlocked: true } },
  };
  next.level = computeCafeLevel(next);
  for (const [id, st] of Object.entries(next.stations)) {
    if (!st.unlocked && next.level >= getStationDef(id).unlockCafeLevel) {
      next.stations = { ...next.stations, [id]: { ...st, unlocked: true } };
    }
  }
  return withLocation(state, locationId, next);
}

/** Günstigste freigeschaltete Station (+1 Level) und ihr Preis, unabhängig vom Kontostand. */
export function getCheapestStation(
  state: GameState,
  locationId: string,
): { id: string; cost: Decimal } | null {
  let best: { id: string; cost: Decimal } | null = null;
  for (const def of STATIONS) {
    if (!isStationUnlocked(state, locationId, def.id)) continue;
    const cost = getBulkCost(state, locationId, def.id, 1);
    if (!best || cost.lt(best.cost)) best = { id: def.id, cost };
  }
  return best;
}

/** Filialleiter-Auto-Kauf: höchstens ein Level pro Aufruf, nur wenn der Spieler ihn aktiviert hat. */
export function autoBuyStep(state: GameState, locationId: string): GameState {
  const loc = getLocation(state, locationId);
  if (!loc.autoBuy || !canAutoBuy(loc)) return state;
  const pick = getCheapestStation(state, locationId);
  if (!pick || loc.coins.lt(pick.cost)) return state;
  return buyStation(state, locationId, pick.id, 1);
}
