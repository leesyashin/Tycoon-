import Phaser from 'phaser';
import { CITY_SPRITE } from '@data/city';
import { CHAR_WALK, COURIER, DELIVERY_VAN, SCENE_FX } from '@data/art';
import type { CafeLayout, GridPos } from '@data/layouts';
import { UI_THEME } from '@data/ui';
import { ART_SCALE, ATLAS, FRAME } from './art';
import { facing, walkFacing, type Look } from './facing';
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

/** Eine Lieferung auf der Sackkarre: Kartons und Gramm (das Lager-Regal zeigt sie erst, wenn sie dort ist). */
export interface DeliveryLoad {
  boxes: number;
  grams: number;
}

/** Weg des Lieferanten durch das Café (Agenten-Koordinaten, Wegsuche der Figuren): Tür → Lager → Tür. */
export interface CourierRoute {
  /** Hier lädt er im Lager ab. */
  store: GridPos;
  /** Wegpunkte ohne `from`, der letzte ist `to`. */
  path(from: GridPos, to: GridPos): GridPos[];
}

/** Agenten-Koordinaten (Kachelmitte ganzzahlig) → Grid (Kachelmitte bei .5), wie die Straße rechnet. */
const toGridPos = (p: GridPos): GridPos => ({ x: p.x + 0.5, y: p.y + 0.5 });

/**
 * Was vor der Tür passiert (kosmetisch): das Schild „Geöffnet/Geschlossen“ über der Tür und der Lieferwagen, der bei
 * jeder Matcha-Lieferung am Bordstein hält. Der Lieferant steigt aus, schiebt die Kartons auf der Sackkarre durch die
 * Tür und den Personal-Durchgang bis ins Lager, lädt dort ab (erst dann zeigt das Regal den neuen Vorrat) und schiebt
 * die leere Karre zurück; dann fährt der Wagen weiter.
 */
export class CafeStreet {
  private readonly signBg: Phaser.GameObjects.Graphics;
  private readonly signText: Phaser.GameObjects.Text;
  private shownSign = '';
  private readonly van: Phaser.GameObjects.Image;
  private readonly courier: Phaser.GameObjects.Image;
  /** Lieferungen, die noch vorfahren sollen (kommen sie schneller, fährt der Wagen nacheinander). */
  private readonly pending: DeliveryLoad[] = [];
  private driving = false;
  private readonly door: { x: number; y: number };
  /** Tür in Grid-Koordinaten (Mitte der Türkachel an der Fassade). */
  private readonly doorGrid: { x: number; y: number };
  /** Türkachel innen (Agenten-Koordinaten): hier beginnt der Weg durch das Café. */
  private readonly entrance: GridPos;
  /** Ist der Lieferant gerade im Café (Tests, Szene)? */
  private indoors = false;

  constructor(
    private readonly scene: Phaser.Scene,
    layout: CafeLayout,
    makeText: (size: number, color: string) => Phaser.GameObjects.Text,
    depth: number,
    private readonly route: CourierRoute,
    private readonly onStored: (load: DeliveryLoad, x: number, y: number) => void,
  ) {
    const e = layout.entrance;
    this.entrance = { x: e.x, y: e.y };
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
   * Lieferungen sind angekommen (je Eintrag Kartons und Gramm): der Wagen fährt vor, nacheinander, falls schon einer
   * unterwegs ist.
   */
  deliver(loads: readonly DeliveryLoad[]): void {
    this.pending.push(...loads);
    if (!this.driving) this.next();
  }

  /** Läuft der Lieferant gerade durch das Café? */
  isIndoors(): boolean {
    return this.indoors;
  }

  private next(): void {
    const load = this.pending.shift();
    if (load === undefined) {
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
        this.unload(stopY, load, () => {
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
   * Der Lieferant steigt neben dem Wagen aus, schiebt die Sackkarre durch die Tür und den Personal-Durchgang ins
   * Lager, lädt dort ab (`onStored`: „Matcha geliefert!“, das Regal füllt sich), schiebt die leere Karre zurück und
   * steigt wieder ein; dann `done` (der Wagen fährt).
   */
  private unload(stopY: number, load: DeliveryLoad, done: () => void): void {
    const c = COURIER;
    const from = { x: DELIVERY_VAN.laneX - c.fromVan, y: stopY };
    const door = { x: this.doorGrid.x + c.beforeDoor, y: this.doorGrid.y };
    const store = this.route.store;
    const pos = { ...from };
    let boxes = Math.min(c.maxBoxes, Math.max(1, Math.round(load.boxes)));
    let look: Look | null = null;
    let walked = 0;
    const place = (frame: number): void => {
      const p = toScreen(pos.x, pos.y);
      const l = look ?? facing(door.x - from.x, door.y - from.y);
      const name = FRAME.courier(boxes, l.dir, frame);
      if (this.courier.frame.name !== name) this.courier.setFrame(name);
      this.courier
        .setFlipX(l.flip)
        .setPosition(p.x, p.y)
        .setDepth(isoDepth(pos.x - 0.5, pos.y - 0.5, 6));
    };
    // Schritte im Lauf-Zyklus der Figuren, mit der schweren Karre etwas gemächlicher.
    const step = (): number => {
      const cycle = CHAR_WALK.cycle;
      return cycle[Math.floor(walked / (CHAR_WALK.stepSec * 1.3)) % cycle.length] ?? 0;
    };
    /** Entlang eines Linienzugs (Grid-Koordinaten) in einem Stück; die Blickrichtung folgt mit Hysterese. */
    const walk = (points: readonly GridPos[], then: () => void): void => {
      const legs: { a: GridPos; b: GridPos; len: number }[] = [];
      let a: GridPos = { ...pos };
      for (const b of points) {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len > 1e-6) legs.push({ a, b, len });
        a = b;
      }
      const total = legs.reduce((sum, l) => sum + l.len, 0);
      if (total <= 0) {
        then();
        return;
      }
      const run = { d: 0 };
      const at = (d: number): GridPos => {
        let left = d;
        for (const l of legs) {
          if (left <= l.len) {
            const k = left / l.len;
            return { x: l.a.x + (l.b.x - l.a.x) * k, y: l.a.y + (l.b.y - l.a.y) * k };
          }
          left -= l.len;
        }
        return { ...(legs[legs.length - 1]?.b ?? pos) };
      };
      this.scene.tweens.add({
        targets: run,
        d: total,
        duration: (total / c.tilesPerSec) * 1000,
        onUpdate: (tw: Phaser.Tweens.Tween) => {
          walked = (tw.elapsed ?? 0) / 1000;
          const p = at(run.d);
          const dx = p.x - pos.x;
          const dy = p.y - pos.y;
          if (Math.hypot(dx, dy) > 1e-4) look = walkFacing(look, dx, dy);
          pos.x = p.x;
          pos.y = p.y;
          place(step());
        },
        onComplete: () => {
          const p = at(total);
          pos.x = p.x;
          pos.y = p.y;
          place(0);
          then();
        },
      });
    };
    // Durch die Tür (gerade) und auf dem Weg der Figuren weiter; der Rückweg ebenso, nur umgekehrt.
    const inside = toGridPos(this.entrance);
    const toStore = [door, inside, ...this.route.path(this.entrance, store).map(toGridPos)];
    place(0);
    this.courier.setAlpha(0).setVisible(true);
    this.scene.tweens.add({ targets: this.courier, alpha: 1, duration: c.fadeMs });
    walk(toStore.slice(0, 1), () => {
      this.indoors = true;
      walk(toStore.slice(1), () => {
        // Im Lager: Kartons abladen, umdrehen, leer zurück.
        this.scene.time.delayedCall(c.doorMs / 2, () => {
          boxes = 0;
          place(0);
          const p = toScreen(pos.x, pos.y);
          this.onStored(load, p.x, p.y);
          this.scene.time.delayedCall(c.doorMs / 2, () => {
            const back = [...this.route.path(store, this.entrance).map(toGridPos), door];
            walk(back, () => {
              this.indoors = false;
              walk([from], () => {
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
      });
    });
  }
}
