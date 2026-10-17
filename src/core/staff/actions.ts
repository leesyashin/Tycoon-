import { getLocationDef } from '@data/locations';
import { getStaffDef, type StaffRoleDef } from '@data/staff';
import { getLocation, withLocation, type GameState } from '../GameState';
import { Decimal, D } from '../math/bignum';
import { payCost } from '../economy/ledger';
import { roleWagePerHour } from '../customers/rates';
import { getMetaEffects } from '../prestige/meta';
import { canAutoBuy, getStaffLevel } from './effects';

/** Einmalige Einstellungsgebühr (Anzeige, Einarbeitung), × Preisniveau. */
export function getHireFee(def: StaffRoleDef, locationId: string): Decimal {
  return D(def.hireFee * getLocationDef(locationId).scale);
}

export function isStaffUnlocked(state: GameState, locationId: string, id: string): boolean {
  return getLocation(state, locationId).level >= getStaffDef(id).unlockCafeLevel;
}

export function isStaffMaxed(state: GameState, locationId: string, id: string): boolean {
  return getStaffLevel(getLocation(state, locationId), id) >= getStaffDef(id).maxLevel;
}

/** Was die nächste Einstellung (bzw. Stufe) einmalig kostet (mit Zen-Rabatt). */
export function getNextStaffCost(state: GameState, locationId: string, id: string): Decimal {
  return getHireFee(getStaffDef(id), locationId).mul(1 - getMetaEffects(state).discount);
}

/** Stundenlohn, den eine weitere Kraft (bzw. die nächste Stufe) zusätzlich kostet. */
export function getNextStaffWage(state: GameState, locationId: string, id: string): number {
  const loc = getLocation(state, locationId);
  const more = { ...loc, staff: { ...loc.staff, [id]: getStaffLevel(loc, id) + 1 } };
  return roleWagePerHour(more, id, locationId) - roleWagePerHour(loc, id, locationId);
}

/** Wie viele Köpfe bzw. Stufen sich nicht entlassen lassen (du selbst an der Kasse). */
export function minStaff(id: string): number {
  const def = getStaffDef(id);
  return Math.max(def.owner, def.minimum);
}

export function canFireStaff(state: GameState, locationId: string, id: string): boolean {
  return getStaffLevel(getLocation(state, locationId), id) > minStaff(id);
}

/** Stellt eine Kraft ein (Stufen-Rollen: eine Stufe höher); alter State, wenn gesperrt, voll oder zu teuer. */
export function hireStaff(state: GameState, locationId: string, id: string): GameState {
  if (!isStaffUnlocked(state, locationId, id) || isStaffMaxed(state, locationId, id)) return state;
  const loc = getLocation(state, locationId);
  const fee = getNextStaffCost(state, locationId, id);
  if (loc.coins.lt(fee)) return state;
  const paid = payCost(loc, 'hiring', fee);
  return withLocation(state, locationId, {
    ...paid,
    staff: { ...paid.staff, [id]: getStaffLevel(loc, id) + 1 },
  });
}

/** Entlässt eine Kraft (Stufen-Rollen: eine Stufe tiefer, bei 0 ganz weg). Du an der Kasse bleibst immer. */
export function fireStaff(state: GameState, locationId: string, id: string): GameState {
  if (!canFireStaff(state, locationId, id)) return state;
  const loc = getLocation(state, locationId);
  const n = getStaffLevel(loc, id) - 1;
  const staff = Object.fromEntries(Object.entries(loc.staff).filter(([k]) => k !== id));
  if (n > 0) staff[id] = n;
  // Ohne Filialleiter gibt es keinen Auto-Kauf mehr.
  const next = { ...loc, staff };
  return withLocation(state, locationId, { ...next, autoBuy: next.autoBuy && canAutoBuy(next) });
}

/** Schaltet den Auto-Kauf; ohne Filialleiter bleibt er aus. */
export function setAutoBuy(state: GameState, locationId: string, enabled: boolean): GameState {
  const loc = getLocation(state, locationId);
  const next = enabled && canAutoBuy(loc);
  if (loc.autoBuy === next) return state;
  return withLocation(state, locationId, { ...loc, autoBuy: next });
}
