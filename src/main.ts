import Phaser from 'phaser';
import { detectLang, setLang, t } from '@i18n/index';
import { createInitialState } from '@core/GameState';
import { createStore } from '@core/store';
import { BootScene } from '@scenes/BootScene';
import { CafeScene } from '@scenes/CafeScene';
import { REGISTRY, UI_EVENTS } from '@scenes/registry';
import { mountHud } from '@ui/hud';

const lang = detectLang(window.location.search, navigator.language);
setLang(lang);
document.title = t('app.title');
document.documentElement.lang = lang;

// Laden/Autosave kommen mit der UI in S3; bis dahin startet jede Sitzung frisch.
const store = createStore(createInitialState(Date.now(), lang));

// Die Simulation läuft unabhängig von Phaser: Einnahmen hängen nie an der Szene.
let last = performance.now();
const loop = (now: number): void => {
  store.advance(now - last);
  last = now;
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);

const ui = document.getElementById('ui');
if (ui) mountHud(ui, store);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1d2a17',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [BootScene, CafeScene],
});
game.registry.set(REGISTRY.store, store);
// Nur kosmetisch: `?debugSpawn=100` zeigt so viele Kunden/s, um die Agenten-Grenze zu prüfen.
game.registry.set(
  REGISTRY.debugSpawn,
  Number(new URLSearchParams(window.location.search).get('debugSpawn') ?? 0),
);
game.events.on(UI_EVENTS.openStation, (stationId: string) => {
  // Stub bis S3: dort öffnet sich das Stations-Panel.
  console.info(UI_EVENTS.openStation, stationId);
});
