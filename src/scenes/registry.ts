import type Phaser from 'phaser';
import type { Store } from '@core/store';

/** Schlüssel, unter denen `main.ts` Abhängigkeiten in die Phaser-Registry legt (statt globaler Variablen). */
export const REGISTRY = {
  store: 'store',
  debugSpawn: 'debugSpawn',
  sceneCover: 'sceneCover',
} as const;

/**
 * Was die DOM-UI gerade von der Szene verdeckt, in Bildschirm-Pixeln: HUD oben, Panel rechts (Seitenkarte) oder unten
 * (Bottom-Sheet, Leiste). `full`: Ein Vollbild-Screen liegt darüber, die Szene ist gar nicht zu sehen. `object`: das
 * Objekt, dessen Panel offen ist (wie `TAP_TARGET_KEY`: Stations-ID oder `ambience:<id>`), sonst `null`.
 */
export interface SceneCover {
  full: boolean;
  top: number;
  right: number;
  bottom: number;
  object: string | null;
}

const NO_COVER: SceneCover = { full: false, top: 0, right: 0, bottom: 0, object: null };

export function getSceneCover(scene: Phaser.Scene): SceneCover {
  const read = scene.registry.get(REGISTRY.sceneCover) as (() => SceneCover) | undefined;
  return read?.() ?? NO_COVER;
}

/** Event-Namen zwischen Szene und DOM-UI. */
export const UI_EVENTS = {
  openStation: 'ui:openStation',
  langChanged: 'ui:langChanged',
  /** Szene meldet einen Klang (Münze, Tap); die Audio-Schicht spielt ihn ab. */
  sfx: 'scene:sfx',
  /** Szene meldet, wie laut Regen und Gemurmel gerade sein sollen (`AmbientLevels`). */
  ambient: 'scene:ambient',
} as const;

export function getStore(scene: Phaser.Scene): Store {
  const store = scene.registry.get(REGISTRY.store) as Store | undefined;
  if (!store) throw new Error('Store missing in registry');
  return store;
}
