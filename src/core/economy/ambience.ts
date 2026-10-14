import { getAmbienceDef, type AmbienceDef } from '@data/ambience';
import { getLocationDef } from '@data/locations';
import { getLocation, withLocation, type GameState } from '../GameState';
import { Decimal, D } from '../math/bignum';
import { collectModifiers } from './modifiers';

export function getAmbienceLevel(state: GameState, locationId: string, id: string): number {
  return getLocation(state, locationId).ambience[id] ?? 0;
}

/** cost(level→level+1) = base × g^level × locationScale × (1 − discount). */
export function getAmbienceCost(def: AmbienceDef, level: number, locationId: string, discount = 0) {
  return D(def.growth)
    .pow(level)
    .mul(def.baseCost * getLocationDef(locationId).scale * (1 - discount));
}

export function getNextAmbienceCost(state: GameState, locationId: string, id: string): Decimal {
  return getAmbienceCost(
    getAmbienceDef(id),
    getAmbienceLevel(state, locationId, id),
    locationId,
    collectModifiers(state).discount,
  );
}

export function isAmbienceUnlocked(state: GameState, locationId: string, id: string): boolean {
  return getLocation(state, locationId).level >= getAmbienceDef(id).unlockCafeLevel;
}

export function isAmbienceMaxed(state: GameState, locationId: string, id: string): boolean {
  return getAmbienceLevel(state, locationId, id) >= getAmbienceDef(id).maxLevel;
}

/** Kauft ein Level; gibt den alten State zurück, wenn gesperrt, maximal oder zu teuer. */
export function buyAmbience(state: GameState, locationId: string, id: string): GameState {
  if (!isAmbienceUnlocked(state, locationId, id) || isAmbienceMaxed(state, locationId, id)) {
    return state;
  }
  const loc = getLocation(state, locationId);
  const cost = getNextAmbienceCost(state, locationId, id);
  if (loc.coins.lt(cost)) return state;
  return withLocation(state, locationId, {
    ...loc,
    coins: loc.coins.sub(cost),
    ambience: { ...loc.ambience, [id]: (loc.ambience[id] ?? 0) + 1 },
  });
}
