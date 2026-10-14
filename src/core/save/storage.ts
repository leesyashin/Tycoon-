import type { GameState } from '../GameState';
import { SCHEMA_VERSION } from '../GameState';
import { catchUpOffline, type OfflineResult } from '../economy/offline';
import { deserialize, serialize } from './serialize';
import { SaveError } from './migrations';

/** Strukturell kompatibel zu `localStorage`; wird von außen übergeben, damit `core` nichts aus dem DOM importiert. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SAVE_KEY = `mce.save.v${String(SCHEMA_VERSION)}`;
/** Frühere Schlüssel, aus denen noch gelesen (und migriert) wird. */
const LEGACY_KEYS = ['mce.save.v3', 'mce.save.v2', 'mce.save.v1', 'mce.save.v0'];

export function saveGame(storage: StorageLike, state: GameState, now: number): GameState {
  const stamped = { ...state, lastSavedAt: now };
  storage.setItem(SAVE_KEY, serialize(stamped));
  return stamped;
}

export function loadGame(storage: StorageLike): GameState | null {
  for (const key of [SAVE_KEY, ...LEGACY_KEYS]) {
    const text = storage.getItem(key);
    if (text !== null) return deserialize(text);
  }
  return null;
}

/** Laden + Offline-Einnahmen in einem Schritt. */
export function loadWithOffline(
  storage: StorageLike,
  now: number,
): { state: GameState; offline: OfflineResult } | null {
  const loaded = loadGame(storage);
  if (!loaded) return null;
  const offline = catchUpOffline(loaded, now);
  return { state: { ...offline.state, lastSavedAt: now }, offline };
}

/** Entfernt alle Spielstände (auch alte Schlüssel), damit ein Neustart nicht wieder migriert. */
export function clearSave(storage: StorageLike): void {
  for (const key of [SAVE_KEY, ...LEGACY_KEYS]) storage.removeItem(key);
}

export function exportSave(state: GameState): string {
  return serialize(state);
}

export function exportFilename(now: number): string {
  return `matcha-cafe-empire-${new Date(now).toISOString().slice(0, 10)}.json`;
}

export function importSave(text: string): GameState {
  const state = deserialize(text);
  if (Object.keys(state.locations).length === 0) throw new SaveError('Save has no locations');
  return state;
}
