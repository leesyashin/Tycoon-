import { getLocationDef } from '@data/locations';
import { getStaffDef, type StaffRoleDef } from '@data/staff';
import { getLocation, withLocation, type GameState } from '../GameState';
import { Decimal, D } from '../math/bignum';
import { collectModifiers } from '../economy/modifiers';
import { canAutoBuy, getStaffLevel } from './effects';

/** cost(level→level+1) = base × g^level × locationScale × (1 − discount). */
export function getStaffCost(
  def: StaffRoleDef,
  level: number,
  locationId: string,
  discount = 0,
): Decimal {
  return D(def.growth)
    .pow(level)
    .mul(def.baseCost * getLocationDef(locationId).scale * (1 - discount));
}

export function isStaffUnlocked(state: GameState, locationId: string, id: string): boolean {
  return getLocation(state, locationId).level >= getStaffDef(id).unlockCafeLevel;
}

export function isStaffMaxed(state: GameState, locationId: string, id: string): boolean {
  return getStaffLevel(getLocation(state, locationId), id) >= getStaffDef(id).maxLevel;
}

export function getNextStaffCost(state: GameState, locationId: string, id: string): Decimal {
  return getStaffCost(
    getStaffDef(id),
    getStaffLevel(getLocation(state, locationId), id),
    locationId,
    collectModifiers(state).discount,
  );
}

/** Stellt eine Stufe ein; gibt den alten State zurück, wenn gesperrt, maximal oder zu teuer. */
export function hireStaff(state: GameState, locationId: string, id: string): GameState {
  if (!isStaffUnlocked(state, locationId, id) || isStaffMaxed(state, locationId, id)) return state;
  const loc = getLocation(state, locationId);
  const cost = getNextStaffCost(state, locationId, id);
  if (loc.coins.lt(cost)) return state;
  return withLocation(state, locationId, {
    ...loc,
    coins: loc.coins.sub(cost),
    staff: { ...loc.staff, [id]: getStaffLevel(loc, id) + 1 },
  });
}

/** Schaltet den Auto-Kauf; ohne Filialleiter bleibt er aus. */
export function setAutoBuy(state: GameState, locationId: string, enabled: boolean): GameState {
  const loc = getLocation(state, locationId);
  const next = enabled && canAutoBuy(loc);
  if (loc.autoBuy === next) return state;
  return withLocation(state, locationId, { ...loc, autoBuy: next });
}
