import Phaser from 'phaser';
import { detectLang, t } from '@i18n/index';
import { createInitialState, type GameState } from '@core/GameState';
import { createStore } from '@core/store';
import { progressionStep } from '@core/progression';
import { UI_CONFIG, UI_THEME } from '@data/ui';
import { SAVE_KEY, loadWithOffline } from '@core/save';
import type { OfflineResult } from '@core/economy';
import { BootScene } from '@scenes/BootScene';
import { CafeScene } from '@scenes/CafeScene';
import { REGISTRY, UI_EVENTS } from '@scenes/registry';
import { applyDocumentLang, startApp } from '@ui/app';
import { browserStorage } from '@ui/persistence';
import { createAudio } from './audio/audio';
import type { SfxId } from '@data/audio';
import './ui/style.css';

const storage = browserStorage();
const query = new URLSearchParams(window.location.search);

let initial: GameState | null = null;
let offline: OfflineResult | null = null;
let loadFailed = false;
try {
  const loaded = storage ? loadWithOffline(storage, Date.now()) : null;
  if (loaded) {
    initial = loaded.state;
    offline = loaded.offline;
  }
} catch {
  // Kaputter Spielstand: Rohtext beiseitelegen (Autosave überschreibt sonst), frisch starten.
  loadFailed = true;
  const raw = storage?.getItem(SAVE_KEY);
  if (raw) storage?.setItem(`${SAVE_KEY}.corrupt`, raw);
}
// `?lang=` schlägt den gespeicherten Wert, der schlägt die Browser-Sprache.
const queryLang = query.get('lang');
const lang =
  queryLang === 'de' || queryLang === 'en'
    ? queryLang
    : (initial?.settings.lang ?? detectLang('', navigator.language));
applyDocumentLang(lang);
initial = initial
  ? { ...initial, settings: { ...initial.settings, lang } }
  : createInitialState(Date.now(), lang);

const store = createStore(initial);
const audio = createAudio(store);

// Die Simulation läuft unabhängig von Phaser: Einnahmen hängen nie an der Szene.
let last = performance.now();
const loop = (now: number): void => {
  store.advance(now - last);
  last = now;
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);

// Quests und Achievements hängen an der Wanduhr (lokale Mitternacht, Nachtschicht) – daher außerhalb des Ticks.
const progress = (): void => {
  const now = Date.now();
  store.dispatch((s) => progressionStep(s, now, new Date(now).getTimezoneOffset()));
};
window.setInterval(progress, UI_CONFIG.progressionMs);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: UI_THEME.navy,
  // Flat-Shaded-Vektor-Sprites (UI_STYLE § 4): weich skalieren, keine Pixel-Optik.
  pixelArt: false,
  antialias: true,
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [BootScene, CafeScene],
});
game.registry.set(REGISTRY.store, store);
// Nur kosmetisch: `?debugSpawn=100` zeigt so viele Kunden/s, um die Agenten-Grenze zu prüfen.
game.registry.set(REGISTRY.debugSpawn, Number(query.get('debugSpawn') ?? 0));

const gameEl = document.getElementById('game');
gameEl?.setAttribute('role', 'application');
gameEl?.setAttribute('aria-label', t('scene.label'));

const root = document.getElementById('ui');
if (root) {
  const app = startApp({
    root,
    store,
    storage,
    version: __APP_VERSION__,
    sfx: (id) => audio.play(id),
    onLangChange: () => {
      gameEl?.setAttribute('aria-label', t('scene.label'));
      game.events.emit(UI_EVENTS.langChanged);
    },
  });
  game.events.on(UI_EVENTS.sfx, (id: SfxId) => audio.play(id));
  game.events.on(UI_EVENTS.openStation, (stationId: string) => app.openStation(stationId));
  if (loadFailed) app.toastError(t('toast.loadFailed'));
  if (offline) app.showOffline(offline);
}
progress();
