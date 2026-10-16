import { LOCATIONS, getLocationDef } from '@data/locations';
import { D, type Decimal } from '../math/bignum';
import { createLocationState, getLocation, type GameState } from '../GameState';
import { dayOf } from '../time/clock';

export function isLocationUnlocked(state: GameState, locationId: string): boolean {
  return state.meta.unlockedLocations.includes(locationId) && !!state.locations[locationId];
}

export interface LocationRequirement {
  prevLocationId: string;
  cafeLevel: number;
  /** Bisher erreichtes Café-Level des Vorgängers (Bestwert, überlebt Resets). */
  prevBestLevel: number;
  zen: Decimal;
  /** Investition für die neue Filiale, bezahlt aus der Kasse des Vorgängers. */
  cost: Decimal;
  levelOk: boolean;
  zenOk: boolean;
  moneyOk: boolean;
}

/** Freischalt-Bedingung (GAME_DESIGN § 3); `null` für den Start-Standort. */
export function getLocationRequirement(
  state: GameState,
  locationId: string,
): LocationRequirement | null {
  const u = getLocationDef(locationId).unlock;
  if (!u) return null;
  const prev = state.locations[u.prevLocationId];
  const prevBestLevel = prev ? Math.max(prev.bestLevel, prev.level) : 0;
  const zen = D(u.zen);
  const cost = D(u.cost);
  return {
    prevLocationId: u.prevLocationId,
    cafeLevel: u.cafeLevel,
    prevBestLevel,
    zen,
    cost,
    levelOk: prevBestLevel >= u.cafeLevel,
    zenOk: state.meta.zen.gte(zen),
    moneyOk: !!prev && prev.coins.gte(cost),
  };
}

export function canUnlockLocation(state: GameState, locationId: string): boolean {
  if (isLocationUnlocked(state, locationId)) return false;
  const r = getLocationRequirement(state, locationId);
  return !!r && r.levelOk && r.zenOk && r.moneyOk;
}

/**
 * Eröffnet eine neue Filiale: Zen wird verbraucht (Zen ist laut GAME_DESIGN § 2 Zahlungsmittel für Standorte), die
 * Investition kommt aus der Kasse des Vorgängers; die Filiale startet frisch und arbeitet ab sofort parallel.
 * Wechselt nicht automatisch.
 */
export function unlockLocation(state: GameState, locationId: string): GameState {
  if (!canUnlockLocation(state, locationId)) return state;
  const r = getLocationRequirement(state, locationId);
  if (!r) return state;
  const prev = getLocation(state, r.prevLocationId);
  return {
    ...state,
    meta: {
      ...state.meta,
      zen: state.meta.zen.sub(r.zen),
      unlockedLocations: [...state.meta.unlockedLocations, locationId],
    },
    locations: {
      ...state.locations,
      [r.prevLocationId]: { ...prev, coins: prev.coins.sub(r.cost) },
      [locationId]: createLocationState(locationId, dayOf(state.clock)),
    },
  };
}

/** Aktiven Standort wechseln (Szene und HUD folgen `activeLocationId`). */
export function switchLocation(state: GameState, locationId: string): GameState {
  if (state.activeLocationId === locationId || !isLocationUnlocked(state, locationId)) return state;
  return { ...state, activeLocationId: locationId };
}

/** Nächster noch gesperrter Standort in der Kette, für Hinweise in der UI. */
export function getNextLockedLocation(state: GameState): string | null {
  return LOCATIONS.find((l) => !isLocationUnlocked(state, l.id))?.id ?? null;
}
