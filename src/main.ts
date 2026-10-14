import Phaser from 'phaser';
import { detectLang, setLang, t } from '@i18n/index';
import { BootScene } from '@scenes/BootScene';
import { CafeScene } from '@scenes/CafeScene';
import { mountHud } from '@ui/hud';

setLang(detectLang(window.location.search, navigator.language));
document.title = t('app.title');
document.documentElement.lang = detectLang(window.location.search, navigator.language);

const ui = document.getElementById('ui');
if (ui) mountHud(ui);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 540,
  backgroundColor: '#1d2a17',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, CafeScene],
});
