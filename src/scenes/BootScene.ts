import Phaser from 'phaser';
import { UI_THEME } from '@data/ui';
import { ATLAS, atlasUrls } from './art';

/** Lädt Figuren-, Möbel- und Stadt-Atlas; Themen-Atlanten lädt `CafeScene` je Standort. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    const { width, height } = this.scale;
    const bar = this.add
      .rectangle(width / 2 - 80, height / 2, 0, 8, UI_THEME.success)
      .setOrigin(0, 0.5);
    this.add.rectangle(width / 2, height / 2, 164, 12).setStrokeStyle(2, UI_THEME.surface, 0.6);
    this.load.on('progress', (p: number) => bar.setSize(160 * p, 8));
    for (const key of [ATLAS.common, ATLAS.furniture, ATLAS.city]) {
      const u = atlasUrls(key);
      this.load.atlas(key, u.png, u.json);
    }
  }

  create(): void {
    this.scene.start('CafeScene');
  }
}
