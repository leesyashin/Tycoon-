import { getLocation, withLocation, type GameState, type OpeningHours } from '../GameState';
import { clampHours } from './clock';

/**
 * Öffnungszeiten eines Cafés ändern (gilt sofort). Früher öffnen oder länger offen haben bringt die Gäste dieser
 * Stunden – und kostet die Löhne der Stunden (GAME_DESIGN § 7.6).
 */
export function setOpeningHours(
  state: GameState,
  locationId: string,
  hours: OpeningHours,
): GameState {
  const loc = getLocation(state, locationId);
  const next = clampHours(hours);
  if (next.open === loc.hours.open && next.close === loc.hours.close) return state;
  return withLocation(state, locationId, { ...loc, hours: next });
}
