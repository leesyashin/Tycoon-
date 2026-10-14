import Phaser from 'phaser';
import { TILE_H, TILE_W } from './iso/iso';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    // Platzhalter-Kacheln; Session S8 ersetzt sie durch echte Sprites.
    for (const [key, color] of [
      ['tile-a', 0xa6c76b],
      ['tile-b', 0x8fb05a],
    ] as const) {
      const g = this.add.graphics();
      g.fillStyle(color, 1);
      g.lineStyle(1, 0x5a7d3a, 1);
      const pts = [
        new Phaser.Geom.Point(TILE_W / 2, 0),
        new Phaser.Geom.Point(TILE_W, TILE_H / 2),
        new Phaser.Geom.Point(TILE_W / 2, TILE_H),
        new Phaser.Geom.Point(0, TILE_H / 2),
      ];
      g.fillPoints(pts, true);
      g.strokePoints(pts, true);
      g.generateTexture(key, TILE_W, TILE_H);
      g.destroy();
    }
    this.scene.start('CafeScene');
  }
}
