import { LOCATIONS, getLocationDef } from '@data/locations';
import { D, type Decimal } from '../math/bignum';
import { createLocationState, type GameState } from '../GameState';

export function isLocationUnlocked(state: GameState, locationId: string): boolean {
  return state.meta.unlockedLocations.includes(locationId) && !!state.locations[locationId];
}

export interface LocationRequirement {
  prevLocationId: string;
  cafeLevel: number;
  /** Bisher erreichtes Café-Level des Vorgängers (Bestwert, überlebt Resets). */
  prevBestLevel: number;
  zen: Decimal;
  levelOk: boolean;
  zenOk: boolean;
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
  return {
    prevLocationId: u.prevLocationId,
    cafeLevel: u.cafeLevel,
    prevBestLevel,
    zen,
    levelOk: prevBestLevel >= u.cafeLevel,
    zenOk: state.meta.zen.gte(zen),
  };
}

export function canUnlockLocation(state: GameState, locationId: string): boolean {
  if (isLocationUnlocked(state, locationId)) return false;
  const r = getLocationRequirement(state, locationId);
  return !!r && r.levelOk && r.zenOk;
}

/**
 * Eröffnet einen neuen Standort: Zen wird verbraucht (Zen ist laut GAME_DESIGN § 2 Zahlungsmittel für
 * Standorte), der Standort startet frisch und produziert ab sofort parallel. Wechselt nicht automatisch.
 */
export function unlockLocation(state: GameState, locationId: string): GameState {
  if (!canUnlockLocation(state, locationId)) return state;
  const r = getLocationRequirement(state, locationId);
  if (!r) return state;
  return {
    ...state,
    meta: {
      ...state.meta,
      zen: state.meta.zen.sub(r.zen),
      unlockedLocations: [...state.meta.unlockedLocations, locationId],
    },
    locations: { ...state.locations, [locationId]: createLocationState(locationId) },
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
