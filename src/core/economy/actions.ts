import { BALANCE } from '@data/balance';
import { STATIONS, getStationDef } from '@data/stations';
import { getLocation, withLocation, type GameState } from '../GameState';
import { collectModifiers } from './modifiers';
import { computeCafeLevel } from './cafeLevel';
import { getMaxAffordable, getStationCost, levelsLeft } from './stations';
import { D, type Decimal } from '../math/bignum';
import { canAutoBuy } from '../staff/effects';
import { applyCafeLevelUp } from '../progression/cafeLevel';
import { rentPerDay, wagesPerOpenHour } from '../customers/rates';
import { openHoursPerDay } from '../time/clock';
import { TERRACE_REQUIREMENT } from '@data/unlocks';

/** Kauf-Mengen im Geräte-Panel (Höchstlevel 20, deshalb ×1, ×5, Max). */
export type BulkAmount = 1 | 5 | 'max';

export function isStationUnlocked(
  state: GameState,
  locationId: string,
  stationId: string,
): boolean {
  const loc = getLocation(state, locationId);
  return (
    loc.level >= getStationDef(stationId).unlockCafeLevel &&
    !needsTerrace(state, locationId, stationId)
  );
}

/** Geräte ab Café-Level 9 brauchen Platz auf der Terrasse (GAME_DESIGN § 5.2). */
export function needsTerrace(state: GameState, locationId: string, stationId: string): boolean {
  const r = TERRACE_REQUIREMENT;
  if (getStationDef(stationId).unlockCafeLevel < r.fromCafeLevel) return false;
  return (getLocation(state, locationId).ambience[r.ambienceId] ?? 0) < r.minLevel;
}

export function isStationMaxed(state: GameState, locationId: string, stationId: string): boolean {
  const lvl = getLocation(state, locationId).stations[stationId]?.level ?? 0;
  return levelsLeft(getStationDef(stationId), lvl) <= 0;
}

/** Wie viele Level ein Kauf mit `amount` tatsächlich bringt (bei `max`: so viele wie bezahlbar, bis zum Höchstlevel). */
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
  return Math.min(amount, levelsLeft(def, level));
}

export function getBulkCost(
  state: GameState,
  locationId: string,
  stationId: string,
  amount: BulkAmount,
): Decimal {
  const loc = getLocation(state, locationId);
  const def = getStationDef(stationId);
  const n = resolveAmount(state, locationId, stationId, amount);
  const level = loc.stations[stationId]?.level ?? 0;
  return getStationCost(def, level, n, locationId, collectModifiers(state).discount);
}

/** Kauft Level; gibt den alten State zurück, wenn nicht möglich (gesperrt, zu teuer, Höchstlevel, n = 0). */
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
  const bought = withLocation(state, locationId, next);
  return applyCafeLevelUp(
    { ...bought, stats: { ...bought.stats, levelsBought: bought.stats.levelsBought + n } },
    locationId,
    loc.level,
  );
}

/** Günstigstes freigeschaltetes Gerät (+1 Level) und sein Preis, unabhängig vom Kontostand. */
export function getCheapestStation(
  state: GameState,
  locationId: string,
): { id: string; cost: Decimal } | null {
  let best: { id: string; cost: Decimal } | null = null;
  for (const def of STATIONS) {
    if (!isStationUnlocked(state, locationId, def.id) || isStationMaxed(state, locationId, def.id))
      continue;
    const cost = getBulkCost(state, locationId, def.id, 1);
    if (!best || cost.lt(best.cost)) best = { id: def.id, cost };
  }
  return best;
}

/** Laufende Kosten eines ganzen Tages (Löhne der Öffnungszeit, Miete), die der Auto-Kauf auf dem Konto lässt. */
export function autoBuyReserve(state: GameState, locationId: string): Decimal {
  const loc = getLocation(state, locationId);
  const day =
    wagesPerOpenHour(loc, locationId) * openHoursPerDay(loc.hours) + rentPerDay(loc, locationId);
  return D(day * BALANCE.manager.autoBuyReserveDays);
}

/**
 * Filialleiter-Auto-Kauf: höchstens ein Level pro Aufruf, nur wenn der Spieler ihn aktiviert hat und danach noch
 * die laufenden Kosten eines Tages auf dem Konto bleiben.
 */
export function autoBuyStep(state: GameState, locationId: string): GameState {
  const loc = getLocation(state, locationId);
  if (!loc.autoBuy || !canAutoBuy(loc)) return state;
  const pick = getCheapestStation(state, locationId);
  if (!pick || loc.coins.sub(pick.cost).lt(autoBuyReserve(state, locationId))) return state;
  return buyStation(state, locationId, pick.id, 1);
}
