import type Phaser from 'phaser';
import type { Store } from '@core/store';

/** Schlüssel, unter denen `main.ts` Abhängigkeiten in die Phaser-Registry legt (statt globaler Variablen). */
export const REGISTRY = { store: 'store', debugSpawn: 'debugSpawn' } as const;

/** Event-Namen zwischen Szene und DOM-UI. */
export const UI_EVENTS = { openStation: 'ui:openStation' } as const;

export function getStore(scene: Phaser.Scene): Store {
  const store = scene.registry.get(REGISTRY.store) as Store | undefined;
  if (!store) throw new Error('Store missing in registry');
  return store;
}
