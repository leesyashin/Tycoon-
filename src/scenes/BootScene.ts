import Phaser from 'phaser';
import { generatePlaceholders } from './placeholders';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    generatePlaceholders(this);
    this.scene.start('CafeScene');
  }
}
