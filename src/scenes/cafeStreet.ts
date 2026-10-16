import Phaser from 'phaser';
import { CITY_SPRITE } from '@data/city';
import { DELIVERY_VAN, SCENE_FX } from '@data/art';
import type { CafeLayout } from '@data/layouts';
import { UI_THEME } from '@data/ui';
import { ART_SCALE, ATLAS, FRAME } from './art';
import { isoDepth, toScreen } from './iso/iso';

/** Uhrzeit einer vollen Stunde in der Sprache des Spiels („18:00“ bzw. „6:00 PM“). */
export function formatHour(hour: number, lang: string): string {
  return new Intl.DateTimeFormat(lang, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(Date.UTC(2000, 0, 1, hour % 24, 0));
}

/**
 * Was vor der Tür passiert (kosmetisch): das Schild „Geöffnet/Geschlossen“ über der Tür und der Lieferwagen, der bei
 * jeder Matcha-Lieferung am Bordstein hält; ein Karton geht durch die Tür ins Café.
 */
export class CafeStreet {
  private readonly signBg: Phaser.GameObjects.Graphics;
  private readonly signText: Phaser.GameObjects.Text;
  private shownSign = '';
  private readonly van: Phaser.GameObjects.Image;
  private readonly box: Phaser.GameObjects.Image;
  /** Lieferungen, die noch vorfahren sollen (kommen sie schneller, fährt der Wagen nacheinander). */
  private pending = 0;
  private driving = false;
  private readonly door: { x: number; y: number };

  constructor(
    private readonly scene: Phaser.Scene,
    layout: CafeLayout,
    makeText: (size: number, color: string) => Phaser.GameObjects.Text,
    depth: number,
    private readonly onArrive: (x: number, y: number) => void,
  ) {
    const e = layout.entrance;
    // Tür in der Fassade: rechts (x = gridSize) bzw. vorn (y = gridSize), Kachelmitte der Tür.
    const doorGrid =
      layout.entranceSide === 'v'
        ? { x: layout.gridSize, y: e.y + 0.5 }
        : { x: e.x + 0.5, y: layout.gridSize };
    this.door = toScreen(doorGrid.x, doorGrid.y);
    this.signBg = scene.add.graphics().setDepth(depth);
    this.signText = makeText(11, UI_THEME.textCss).setDepth(depth + 1);
    const [ox, oy] = [
      CITY_SPRITE.car.ox / CITY_SPRITE.car.w,
      CITY_SPRITE.car.oy / CITY_SPRITE.car.h,
    ];
    this.van = scene.add
      .image(0, 0, ATLAS.city, FRAME.car(DELIVERY_VAN.carType, true))
      .setScale(ART_SCALE)
      .setOrigin(ox, oy)
      .setVisible(false);
    this.box = scene.add
      .image(0, 0, ATLAS.furniture, FRAME.supply('crate'))
      .setScale(ART_SCALE)
      .setOrigin(0.5, 0.8)
      .setVisible(false);
  }

  /** Schild über der Tür: geöffnet bis …, geschlossen ab … (Farben aus den UI-Tokens). */
  setSign(open: boolean, text: string): void {
    const key = `${open ? 'o' : 'c'}${text}`;
    if (key === this.shownSign) return;
    this.shownSign = key;
    const x = this.door.x;
    const y = this.door.y - SCENE_FX.doorSignLift;
    this.signText.setText(text).setPosition(x, y);
    const w = this.signText.width + 14;
    const h = this.signText.height + 2;
    this.signBg
      .clear()
      .fillStyle(open ? UI_THEME.success : UI_THEME.danger, 1)
      .fillRoundedRect(x - w / 2, y - h, w, h, h / 2)
      .lineStyle(1.5, UI_THEME.surface, 0.9)
      .strokeRoundedRect(x - w / 2, y - h, w, h, h / 2);
  }

  /** Texte behalten beim Herauszoomen eine lesbare Größe (wie die anderen Labels). */
  setLabelScale(f: number): void {
    this.signText.setScale(f);
    this.shownSign = '';
  }

  /** Eine Lieferung ist angekommen: der Wagen fährt vor (nacheinander, falls schon einer unterwegs ist). */
  deliver(count = 1): void {
    this.pending += Math.max(0, count);
    if (!this.driving) this.next();
  }

  private next(): void {
    if (this.pending <= 0) {
      this.driving = false;
      return;
    }
    this.pending--;
    this.driving = true;
    const d = DELIVERY_VAN;
    const at = (y: number) => {
      const p = toScreen(d.laneX, y);
      return { x: p.x, y: p.y, depth: isoDepth(d.laneX - 0.5, y - 0.5, 5) };
    };
    const pos = { y: d.fromY };
    const place = (): void => {
      const p = at(pos.y);
      this.van.setPosition(p.x, p.y).setDepth(p.depth);
    };
    // Entlang v: gespiegelter Wagen, Front nach +v.
    this.van.setFlipX(true).setAlpha(0).setVisible(true);
    place();
    const stopY = this.stopY();
    this.scene.tweens.add({
      targets: pos,
      y: stopY,
      duration: ((stopY - d.fromY) / d.tilesPerSec) * 1000,
      ease: 'Sine.Out',
      onUpdate: () => {
        place();
        this.van.setAlpha(Math.min(1, this.van.alpha + 0.08));
      },
      onComplete: () => {
        this.van.setAlpha(1);
        this.unload(stopY, () => {
          this.scene.tweens.add({
            targets: pos,
            y: d.toY,
            duration: ((d.toY - stopY) / d.tilesPerSec) * 1000,
            ease: 'Sine.In',
            onUpdate: () => {
              place();
              const left = d.toY - pos.y;
              if (left < d.fadeTiles) this.van.setAlpha(left / d.fadeTiles);
            },
            onComplete: () => {
              this.van.setVisible(false);
              this.next();
            },
          });
        });
      },
    });
  }

  /** Halt auf Höhe der Tür. */
  private stopY(): number {
    return DELIVERY_VAN.stopY;
  }

  /** Karton vom Wagen zur Tür, dort verschwindet er im Café. */
  private unload(stopY: number, done: () => void): void {
    const d = DELIVERY_VAN;
    const from = toScreen(d.laneX - d.boxOffset, stopY);
    this.box
      .setPosition(from.x, from.y)
      .setDepth(isoDepth(d.laneX - d.boxOffset - 0.5, stopY - 0.5, 6))
      .setAlpha(1)
      .setVisible(true);
    this.scene.tweens.add({
      targets: this.box,
      x: this.door.x,
      y: this.door.y,
      duration: d.unloadMs,
      delay: d.waitMs / 3,
      ease: 'Sine.InOut',
      onComplete: () => {
        this.onArrive(this.door.x, this.door.y);
        this.scene.tweens.add({
          targets: this.box,
          alpha: 0,
          duration: 250,
          onComplete: () => this.box.setVisible(false),
        });
      },
    });
    this.scene.time.delayedCall(d.waitMs, done);
  }
}
