import Phaser from 'phaser';
import { CITY_SPRITE } from '@data/city';
import { CHAR_WALK, COURIER, DELIVERY_VAN, SCENE_FX } from '@data/art';
import type { CafeLayout } from '@data/layouts';
import { UI_THEME } from '@data/ui';
import { ART_SCALE, ATLAS, FRAME } from './art';
import { facing, type Look } from './facing';
import { isoDepth, toScreen } from './iso/iso';

/** Uhrzeit einer vollen Stunde in der Sprache des Spiels („18:00“ bzw. „6:00 PM“). */
export function formatHour(hour: number, lang: string): string {
  return new Intl.DateTimeFormat(lang, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(Date.UTC(2000, 0, 1, hour % 24, 0));
}

/** Kartons auf der Sackkarre für eine Lieferung dieser Größe (`COURIER.boxGrams`). */
export function boxesFor(grams: number): number {
  const steps = COURIER.boxGrams.filter((g) => grams > g).length;
  return Math.min(COURIER.maxBoxes, 1 + steps);
}

/**
 * Was vor der Tür passiert (kosmetisch): das Schild „Geöffnet/Geschlossen“ über der Tür und der Lieferwagen, der bei
 * jeder Matcha-Lieferung am Bordstein hält. Der Lieferant steigt aus, schiebt die Kartons auf der Sackkarre zur Tür
 * und die leere Karre zurück, dann fährt der Wagen weiter.
 */
export class CafeStreet {
  private readonly signBg: Phaser.GameObjects.Graphics;
  private readonly signText: Phaser.GameObjects.Text;
  private shownSign = '';
  private readonly van: Phaser.GameObjects.Image;
  private readonly courier: Phaser.GameObjects.Image;
  /** Kartons je Lieferung, die noch vorfahren soll (kommen sie schneller, fährt der Wagen nacheinander). */
  private readonly pending: number[] = [];
  private driving = false;
  private readonly door: { x: number; y: number };
  /** Tür in Grid-Koordinaten (Mitte der Türkachel an der Fassade). */
  private readonly doorGrid: { x: number; y: number };

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
    this.doorGrid = doorGrid;
    this.door = toScreen(doorGrid.x, doorGrid.y);
    this.signBg = scene.add.graphics().setDepth(depth);
    // Klein wie ein Schild an der Tür; der farbige Grund trägt die Schrift, ohne Kontur wie die anderen Labels.
    this.signText = makeText(SCENE_FX.doorSignPx, UI_THEME.inkCss)
      .setStroke(UI_THEME.inkCss, 0)
      .setDepth(depth + 1);
    const [ox, oy] = [
      CITY_SPRITE.car.ox / CITY_SPRITE.car.w,
      CITY_SPRITE.car.oy / CITY_SPRITE.car.h,
    ];
    this.van = scene.add
      .image(0, 0, ATLAS.city, FRAME.car(DELIVERY_VAN.carType, true))
      .setScale(ART_SCALE)
      .setOrigin(ox, oy)
      .setVisible(false);
    this.courier = scene.add
      .image(0, 0, ATLAS.common, FRAME.courier(0, 'front', 0))
      .setScale(ART_SCALE)
      .setOrigin(0.5, COURIER.sprite.footY / COURIER.sprite.h)
      .setVisible(false);
  }

  /** Schild über der Tür: geöffnet bis …, geschlossen ab … (Farben aus den UI-Tokens). */
  setSign(open: boolean, text: string): void {
    const key = `${open ? 'o' : 'c'}${text}`;
    if (key === this.shownSign) return;
    this.shownSign = key;
    const x = this.door.x;
    const y = this.door.y - SCENE_FX.doorSignLift;
    // Farben wie das Badge im HUD: dunkle Schrift auf Grün, weiße auf tiefem Rot (beides ≥ 4,5:1).
    this.signText
      .setText(text)
      .setColor(open ? UI_THEME.inkCss : UI_THEME.textCss)
      .setPosition(x, y);
    // Der Grund wächst mit der Schrift, die beim Herauszoomen lesbar groß bleibt (vorher nur ein Strich darunter).
    const f = this.signText.scaleX;
    const w = this.signText.displayWidth + 10 * f;
    const h = this.signText.displayHeight + 2 * f;
    const top = y - this.signText.displayHeight - f;
    this.signBg
      .clear()
      .fillStyle(open ? UI_THEME.success : UI_THEME.dangerInk, 1)
      .fillRoundedRect(x - w / 2, top, w, h, h / 2)
      .lineStyle(1.5 * f, UI_THEME.surface, 0.9)
      .strokeRoundedRect(x - w / 2, top, w, h, h / 2);
  }

  /** Texte behalten beim Herauszoomen eine lesbare Größe (wie die anderen Labels). */
  setLabelScale(f: number): void {
    this.signText.setScale(f);
    this.shownSign = '';
  }

  /**
   * Lieferungen sind angekommen (je Eintrag die Kartons auf der Karre): der Wagen fährt vor, nacheinander, falls
   * schon einer unterwegs ist.
   */
  deliver(boxes: readonly number[]): void {
    this.pending.push(...boxes);
    if (!this.driving) this.next();
  }

  private next(): void {
    const boxes = this.pending.shift();
    if (boxes === undefined) {
      this.driving = false;
      return;
    }
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
        this.unload(stopY, boxes, () => {
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

  /**
   * Der Lieferant steigt neben dem Wagen aus, schiebt die Sackkarre mit `boxes` Kartons zur Tür, gibt sie ab
   * („Matcha geliefert!“), schiebt die leere Karre zurück und steigt wieder ein; dann `done` (der Wagen fährt).
   */
  private unload(stopY: number, boxes: number, done: () => void): void {
    const c = COURIER;
    const from = { x: DELIVERY_VAN.laneX - c.fromVan, y: stopY };
    const to = { x: this.doorGrid.x + c.beforeDoor, y: this.doorGrid.y };
    const pos = { ...from };
    let load = Math.min(c.maxBoxes, Math.max(1, Math.round(boxes)));
    let look: Look = facing(to.x - from.x, to.y - from.y);
    let walked = 0;
    const place = (frame: number): void => {
      const p = toScreen(pos.x, pos.y);
      const name = FRAME.courier(load, look.dir, frame);
      if (this.courier.frame.name !== name) this.courier.setFrame(name);
      this.courier
        .setFlipX(look.flip)
        .setPosition(p.x, p.y)
        .setDepth(isoDepth(pos.x - 0.5, pos.y - 0.5, 6));
    };
    // Schritte im Lauf-Zyklus der Figuren, mit der schweren Karre etwas gemächlicher.
    const step = (): number => {
      const cycle = CHAR_WALK.cycle;
      return cycle[Math.floor(walked / (CHAR_WALK.stepSec * 1.3)) % cycle.length] ?? 0;
    };
    const walk = (target: { x: number; y: number }, then: () => void): void => {
      const dist = Math.hypot(target.x - pos.x, target.y - pos.y);
      this.scene.tweens.add({
        targets: pos,
        x: target.x,
        y: target.y,
        duration: (dist / c.tilesPerSec) * 1000,
        onUpdate: (tw: Phaser.Tweens.Tween) => {
          walked = (tw.elapsed ?? 0) / 1000;
          place(step());
        },
        onComplete: () => {
          place(0);
          then();
        },
      });
    };
    place(0);
    this.courier.setAlpha(0).setVisible(true);
    this.scene.tweens.add({ targets: this.courier, alpha: 1, duration: c.fadeMs });
    walk(to, () => {
      // An der Tür: Kartons abgeben, umdrehen, leer zurück.
      this.scene.time.delayedCall(c.doorMs / 2, () => {
        load = 0;
        place(0);
        this.onArrive(this.door.x, this.door.y);
        this.scene.time.delayedCall(c.doorMs / 2, () => {
          look = facing(from.x - to.x, from.y - to.y);
          walk(from, () => {
            this.scene.tweens.add({
              targets: this.courier,
              alpha: 0,
              duration: c.fadeMs,
              onComplete: () => {
                this.courier.setVisible(false);
                done();
              },
            });
          });
        });
      });
    });
  }
}
