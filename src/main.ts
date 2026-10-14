import Phaser from 'phaser';
import { detectLang, t } from '@i18n/index';
import { createInitialState, type GameState } from '@core/GameState';
import { createStore, type Store } from '@core/store';
import { progressionStep } from '@core/progression';
import { skipTutorial } from '@core/tutorial';
import { UI_CONFIG, UI_THEME } from '@data/ui';
import { SAVE_KEY, loadWithOffline, serialize } from '@core/save';
import type { OfflineResult } from '@core/economy';
import { BootScene } from '@scenes/BootScene';
import { CafeScene } from '@scenes/CafeScene';
import { REGISTRY, UI_EVENTS } from '@scenes/registry';
import { applyDocumentLang, startApp } from '@ui/app';
import { browserStorage } from '@ui/persistence';
import { installErrorBoundary } from '@ui/errorBoundary';
import { startPwa } from '@ui/pwa';
import { createAudio } from './audio/audio';
import type { SfxId } from '@data/audio';
import './ui/style.css';

const storage = browserStorage();
const query = new URLSearchParams(window.location.search);
let liveStore: Store | null = null;
// Zuerst, damit auch Fehler beim Laden/Aufbau den Export anbieten (dann der gespeicherte Rohtext).
installErrorBoundary(() =>
  liveStore ? serialize(liveStore.getState()) : (storage?.getItem(SAVE_KEY) ?? null),
);

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
// `?tutorial=0` startet ohne Onboarding (e2e-Tests, die etwas anderes prüfen; wie `?debugSpawn`).
if (query.get('tutorial') === '0') initial = skipTutorial(initial);

const store = createStore(initial);
liveStore = store;
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
// Splash weg, sobald die Café-Szene steht (Atlas geladen); Fallback, falls die Szene nie startet.
const hideSplash = (): void => {
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.classList.add('splash--hide');
  window.setTimeout(() => splash.remove(), UI_CONFIG.splashFadeMs);
};
game.events.once(Phaser.Core.Events.READY, () => {
  game.scene.getScene('CafeScene').events.once(Phaser.Scenes.Events.CREATE, hideSplash);
});
window.setTimeout(hideSplash, UI_CONFIG.splashMaxMs);
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
  // Nicht im Dev-Server: dort gibt es keinen Service Worker (und e2e soll nichts cachen).
  if (import.meta.env.PROD) startPwa(app.pwa);
  if (loadFailed) {
    app.toastError(t('toast.loadFailed'));
    void app.offerBackupAfterLoadFailure();
  }
  if (offline) app.showOffline(offline);
}
progress();
