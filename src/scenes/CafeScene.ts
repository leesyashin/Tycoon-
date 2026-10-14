import Phaser from 'phaser';
import { GRID_SIZE, depth, toScreen } from './iso/iso';

export class CafeScene extends Phaser.Scene {
  constructor() {
    super('CafeScene');
  }

  create(): void {
    const origin = { x: this.scale.width / 2, y: 60 };
    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const p = toScreen(gx, gy);
        this.add
          .image(origin.x + p.x, origin.y + p.y, (gx + gy) % 2 ? 'tile-a' : 'tile-b')
          .setOrigin(0.5, 0)
          .setDepth(depth(gx, gy));
      }
    }
  }
}
