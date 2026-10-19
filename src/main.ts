import { detectLang, t } from '@i18n/index';
import { createInitialState, type GameState } from '@core/GameState';
import { createStore, type Store } from '@core/store';
import { progressionStep } from '@core/progression';
import { skipTutorial } from '@core/tutorial';
import { UI_CONFIG } from '@data/ui';
import type { GameHandle } from './game';
import type { SceneCover } from '@scenes/registry';
import { SAVE_KEY, loadWithOffline, serialize } from '@core/save';
import type { OfflineResult } from '@core/economy';
import { applyDocumentLang, startApp } from '@ui/app';
import { browserStorage } from '@ui/persistence';
import { installErrorBoundary } from '@ui/errorBoundary';
import { startPwa } from '@ui/pwa';
import { createAudio } from './audio/audio';
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

// Splash weg, sobald die Café-Szene steht (Atlas geladen); Fallback, falls die Szene nie startet.
const hideSplash = (): void => {
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.classList.add('splash--hide');
  window.setTimeout(() => splash.remove(), UI_CONFIG.splashFadeMs);
};
window.setTimeout(hideSplash, UI_CONFIG.splashMaxMs);

const gameEl = document.getElementById('game');
gameEl?.setAttribute('role', 'application');
gameEl?.setAttribute('aria-label', t('scene.label'));

let game: GameHandle | null = null;
const root = document.getElementById('ui');
let openStation: (id: string) => void = () => undefined;
let sceneCover: () => SceneCover = () => ({
  full: false,
  top: 0,
  right: 0,
  bottom: 0,
  object: null,
});
if (root) {
  const app = startApp({
    root,
    store,
    storage,
    version: __APP_VERSION__,
    sfx: (id) => audio.play(id),
    onLangChange: () => {
      gameEl?.setAttribute('aria-label', t('scene.label'));
      game?.langChanged();
    },
  });
  openStation = (id) => app.openStation(id);
  sceneCover = () => app.sceneCover();
  // Nicht im Dev-Server: dort gibt es keinen Service Worker (und e2e soll nichts cachen).
  if (import.meta.env.PROD) startPwa(app.pwa);
  if (loadFailed) {
    app.toastError(t('toast.loadFailed'));
    void app.offerBackupAfterLoadFailure();
  }
  if (offline) app.showOffline(offline);
}
progress();

// Phaser erst laden, wenn das Overlay steht und der Browser kurz Luft hat (eigener Chunk). HUD und
// Einnahmen laufen schon; der Splash deckt nur die Szene ab.
const whenIdle = (fn: () => void): void => {
  // Safari kennt `requestIdleCallback` nicht.
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(fn, { timeout: UI_CONFIG.gameStartMaxWaitMs });
  } else window.setTimeout(fn, 0);
};
whenIdle(() => {
  void import('./game').then(({ startGame }) => {
    game = startGame({
      store,
      debugSpawn: Number(query.get('debugSpawn') ?? 0),
      onSfx: (id) => audio.play(id),
      onOpenStation: (id) => openStation(id),
      onReady: hideSplash,
      sceneCover: () => sceneCover(),
    });
  });
});
