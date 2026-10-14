import type { GameState } from '@core/GameState';
import type { Store } from '@core/store';
import { saveGame, serialize, type StorageLike } from '@core/save';
import { UI_CONFIG } from '@data/ui';

const DB_NAME = 'mce-backups';
const DB_STORE = 'saves';

/** Liefert `localStorage` oder `null`, wenn der Browser ihn verweigert (z. B. privater Modus). */
export function browserStorage(): StorageLike | null {
  try {
    const s = window.localStorage;
    const probe = '__mce_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE, { autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

/** Zusätzliche Sicherung neben localStorage; hält nur die letzten `backupCount` Stände. */
export async function backupToIndexedDb(state: GameState): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      store.add({ savedAt: state.lastSavedAt, text: serialize(state) });
      const keysReq = store.getAllKeys();
      keysReq.onsuccess = () => {
        const keys = keysReq.result;
        for (const k of keys.slice(0, Math.max(0, keys.length - UI_CONFIG.backupCount)))
          store.delete(k);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    });
  } finally {
    db.close();
  }
}

export interface BackupEntry {
  savedAt: number;
  text: string;
}

/** Sicherungen aus IndexedDB, neueste zuerst; ohne IndexedDB leer. */
export async function listIndexedDbBackups(): Promise<BackupEntry[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await openDb();
  try {
    const all = await new Promise<unknown[]>((resolve, reject) => {
      const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).getAll();
      req.onsuccess = () => resolve(req.result as unknown[]);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
    });
    const out: BackupEntry[] = [];
    for (const e of all) {
      if (typeof e !== 'object' || e === null) continue;
      const { savedAt, text } = e as Partial<BackupEntry>;
      if (typeof savedAt === 'number' && typeof text === 'string') out.push({ savedAt, text });
    }
    return out.sort((a, b) => b.savedAt - a.savedAt);
  } finally {
    db.close();
  }
}

export async function clearIndexedDbBackups(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB clear failed'));
    });
  } finally {
    db.close();
  }
}

export interface Persistence {
  save(): boolean;
  /** Stoppt Autosave, z. B. direkt vor dem Löschen, damit `pagehide` nichts zurückschreibt. */
  pause(): void;
  resume(): void;
  /** Keine neuen IndexedDB-Sicherungen, solange die alten noch gebraucht werden (kaputter Spielstand). */
  holdBackups(hold: boolean): void;
}

/** Autosave alle 10 s und bei `visibilitychange`/`pagehide` (PLAN § 2.3). */
export function startPersistence(
  store: Store,
  storage: StorageLike | null,
  onError: () => void,
): Persistence {
  let paused = false;
  let failed = false;
  let backupsHeld = false;
  const save = (): boolean => {
    if (!storage || paused) return false;
    try {
      store.dispatch((s) => saveGame(storage, s, Date.now()));
      failed = false;
    } catch {
      // Nur einmal melden, nicht alle 10 s.
      if (!failed) onError();
      failed = true;
      return false;
    }
    if (!backupsHeld) backupToIndexedDb(store.getState()).catch(() => undefined);
    return true;
  };
  window.setInterval(save, UI_CONFIG.autosaveMs);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  window.addEventListener('pagehide', save);
  return {
    save,
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
    },
    holdBackups: (hold) => {
      backupsHeld = hold;
    },
  };
}
