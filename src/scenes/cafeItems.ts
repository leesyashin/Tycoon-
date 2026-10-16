import type Phaser from 'phaser';
import {
  COUNTER_TOP_PX,
  DEVICE_ITEM_AT,
  PASS_ITEMS,
  PASS_SLOTS,
  TABLE_ITEM_OFFSET,
  TABLE_TOP_PX,
  figureOffset,
  workStepAt,
  type FigurePoint,
} from '@data/art';
import { CROWD, type CafeLayout } from '@data/layouts';
import type { CustomerCrowd } from './agents/crowd';
import { ART_SCALE, ATLAS, FRAME } from './art';
import { isoDepth, toScreen } from './iso/iso';

/** Teller/Becher-Sprites (`item-*`): Bodenpunkt 16 px unter der Oberkante einer 22 px hohen Leinwand. */
export const ITEM_ORIGIN_Y = 16 / 22;
/** Zwei Dinge auf einem Tablett stehen so weit auseinander (quer, Figuren-Koordinaten). */
const TRAY_SPREAD = 0.04;

type Img = Phaser.GameObjects.Image;

/** Blickrichtung einer Figur, wie die Szene sie zeichnet. */
export interface FigureView {
  sprite: Img;
  dir: 'front' | 'back';
}

/**
 * Was im Café herumsteht und getragen wird (rein kosmetisch, liest nur `crowd`): das Produkt auf dem Gerät, solange
 * ein Barista daran arbeitet (`WORK_SCRIPTS`), Becher und Teller in den Händen und auf dem Tablett, Bestellungen
 * und Geschirr auf den Tischen, zurückgebrachtes Geschirr auf der Rückgabe.
 */
export class CafeItems {
  private readonly device = new Map<string, Img>();
  private readonly tables: [Img, Img][] = [];
  private readonly returns: Img[] = [];
  /** Getragenes je Figur (Sprite der Figur → Item-Sprites). */
  private readonly held = new Map<Img, Img[]>();

  constructor(
    private readonly scene: Phaser.Scene,
    layout: CafeLayout,
  ) {
    for (const p of layout.stations) {
      const at = DEVICE_ITEM_AT[p.stationId];
      if (!at) continue;
      // Anker gelten für Front nach +y; quer gestellt sind u und v vertauscht.
      const [u, v] = p.facesX ? [at.v, at.u] : [at.u, at.v];
      const w = toScreen(p.tile.x + u, p.tile.y + v);
      this.device.set(
        p.stationId,
        this.item(w.x, w.y - at.z, isoDepth(p.tile.x, p.tile.y, 5.2)).setVisible(false),
      );
    }
    for (const t of layout.tables) {
      const pair = ([-1, 1] as const).map((side) => {
        const w = toScreen(t.tile.x + 0.5 + side * TABLE_ITEM_OFFSET, t.tile.y + 0.5);
        return this.item(w.x, w.y - TABLE_TOP_PX, isoDepth(t.tile.x, t.tile.y, 5.6)).setVisible(
          false,
        );
      });
      this.tables.push([pair[0] as Img, pair[1] as Img]);
    }
    const r = layout.pickup.returnTile;
    for (const slot of PASS_SLOTS.slice(0, CROWD.returnItemsMax)) {
      const w = toScreen(r.x + slot.u, r.y + slot.v);
      this.returns.push(
        this.item(w.x, w.y - COUNTER_TOP_PX, isoDepth(r.x, r.y, 5.7)).setVisible(false),
      );
    }
  }

  private item(x: number, y: number, depth: number): Img {
    return this.scene.add
      .image(x, y, ATLAS.common, FRAME.item('matcha'))
      .setScale(ART_SCALE)
      .setOrigin(0.5, ITEM_ORIGIN_Y)
      .setDepth(depth);
  }

  /** Zeigt `frame` (oder blendet aus); neu Erscheinendes ploppt über `onAppear`. */
  private show(img: Img, frame: string | null, onAppear?: (img: Img) => void): void {
    if (!frame) {
      if (img.visible) img.setVisible(false);
      return;
    }
    if (img.frame.name !== frame) img.setFrame(frame);
    if (!img.visible) {
      img.setVisible(true);
      onAppear?.(img);
    }
  }

  /** Produkte auf den Geräten, Bestellungen und Geschirr auf den Tischen, Geschirr auf der Rückgabe. */
  sync(
    crowd: CustomerCrowd,
    tableShown: (i: number) => boolean,
    onAppear: (img: Img) => void,
  ): void {
    for (const [station, img] of this.device) {
      const b = crowd.baristas.find((x) => x.active && x.station === station && x.phase === 'work');
      const step =
        b && b.workTotal > 0 ? workStepAt(station, 1 - b.timer / b.workTotal) : undefined;
      this.show(img, step?.item ? FRAME.item(PASS_ITEMS[station] ?? 'matcha') : null, onAppear);
    }
    this.tables.forEach((pair, t) => {
      const slots = crowd.tableItems[t];
      const shown = tableShown(t);
      pair.forEach((img, s) => {
        const it = shown ? (slots?.[s] ?? null) : null;
        this.show(img, it ? FRAME.item(it.empty ? `${it.item}-empty` : it.item) : null, onAppear);
      });
    });
    this.returns.forEach((img, i) => {
      const r = crowd.returnItems[i];
      this.show(img, r ? FRAME.item(r.item) : null, onAppear);
    });
  }

  /**
   * Was eine Figur trägt: Becher in der Hand (`HOLD_POINTS.carry`) oder bis zu zwei Dinge auf dem Tablett. Liegt
   * vor dem Körper, wenn die Figur zur Kamera blickt, sonst dahinter.
   */
  hold(fig: FigureView, items: readonly string[], at: FigurePoint): void {
    let list = this.held.get(fig.sprite);
    if (!list) {
      list = [];
      this.held.set(fig.sprite, list);
    }
    const show = fig.sprite.visible ? items : [];
    while (list.length < show.length) list.push(this.item(0, 0, 0).setVisible(false));
    const flip = fig.sprite.flipX ? -1 : 1;
    const front = fig.dir === 'front';
    list.forEach((img, i) => {
      const id = show[i];
      if (id === undefined) {
        if (img.visible) img.setVisible(false);
        return;
      }
      const spread = show.length > 1 ? (i === 0 ? -TRAY_SPREAD : TRAY_SPREAD) : 0;
      const off = figureOffset({ ...at, x: at.x + spread }, fig.dir);
      const frame = FRAME.item(id);
      if (img.frame.name !== frame) img.setFrame(frame);
      img
        .setVisible(true)
        .setAlpha(fig.sprite.alpha)
        .setPosition(fig.sprite.x + off.x * flip, fig.sprite.y + off.y)
        .setDepth(fig.sprite.depth + (front ? 0.01 : -0.01) + i * 0.001);
    });
  }
}
