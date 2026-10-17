import Phaser from 'phaser';
import { CITY_SPRITE, getCityPalette } from '@data/city';
import { PARKING_CROWD, PARKING_LOT, type ParkingSlot } from '@data/parking';
import type { LotVehicle } from '../agents/crowd';
import { carPath, parkSec, pointAt, polylineLength } from '../agents/parking';
import { ART_SCALE, ATLAS } from '../art';
import { isoDepth, toScreen } from '../iso/iso';

type Img = Phaser.GameObjects.Image;

/** Tiefe der Parkplatz-Fläche: über dem Boden der Stadt, unter allem, was darauf steht. */
const LOT_GROUND_DEPTH = -8999.5;
/** Autotypen für Gäste (ohne Taxi) und Lacke (`car-<typ>[-p1]-f|b`). */
const GUEST_CARS = [0, 2, 3] as const;
const GUEST_PAINTS = ['', '-p1'] as const;

const hex = (c: string): number => Number.parseInt(c.slice(1), 16);

function originOf(s: { w: number; h: number; ox: number; oy: number }): [number, number] {
  return [s.ox / s.w, s.oy / s.h];
}

/**
 * Parkplatz neben dem Café (kosmetisch, `data/parking.ts`): Stufe 0 eine eingezäunte Schotterfläche, danach Asphalt
 * mit Markierungen, Fahrradbügel, Roller-Plätze, Auto-Stellplätze und Ladesäule. Fahrzeuge folgen `crowd.vehicles`:
 * Autos fahren durch die Einfahrt in ihre Box und wieder hinaus, Rad und Roller tauchen mit ihrem Gast auf.
 */
export class ParkingView {
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly fence: Img[] = [];
  private readonly loops: (Img | null)[] = [];
  private readonly sign: Img;
  private readonly charger: Img;
  private readonly vehicles: Img[] = [];
  private shownLevel = -1;
  private readonly paths = PARKING_LOT.slots.map((s) => (s.kind === 'car' ? carPath(s) : []));

  constructor(
    scene: Phaser.Scene,
    private readonly locationId: string,
  ) {
    this.ground = scene.add.graphics().setDepth(LOT_GROUND_DEPTH);
    const [px, py] = originOf(CITY_SPRITE.prop);
    const prop = (x: number, y: number, frame: string, flip: boolean, layer = 5): Img =>
      scene.add
        .image(toScreen(x, y).x, toScreen(x, y).y, ATLAS.city, frame)
        .setScale(ART_SCALE)
        .setOrigin(px, py)
        .setFlipX(flip)
        .setDepth(isoDepth(x - 0.5, y - 0.5, layer));
    const r = PARKING_LOT.rect;
    for (let x = r.x0 + 0.5; x < r.x1; x += 1)
      this.fence.push(prop(x, PARKING_LOT.fenceY, 'lot-fence', false).setVisible(false));
    for (const s of PARKING_LOT.slots)
      this.loops.push(
        s.kind === 'bike' ? prop(s.x, s.y, 'lot-loop', true).setVisible(false) : null,
      );
    this.sign = prop(PARKING_LOT.sign.x, PARKING_LOT.sign.y, 'lot-sign', true).setVisible(false);
    this.charger = prop(
      PARKING_LOT.charger.x,
      PARKING_LOT.charger.y,
      'lot-charger',
      true,
    ).setVisible(false);
    const [cx, cy] = originOf(CITY_SPRITE.car);
    for (const s of PARKING_LOT.slots) {
      const car = s.kind === 'car';
      this.vehicles.push(
        scene.add
          .image(0, 0, ATLAS.city, car ? 'car-0-f' : 'lot-bike-0')
          .setScale(ART_SCALE)
          .setOrigin(car ? cx : px, car ? cy : py)
          .setVisible(false),
      );
    }
  }

  /** Ausbaustufe: Boden, Markierungen, Bügel, Schild und Ladesäule (nur bei Änderung neu). */
  setLevel(level: number): boolean {
    if (level === this.shownLevel) return false;
    const grew = this.shownLevel >= 0 && level > this.shownLevel;
    this.shownLevel = level;
    this.drawGround(level);
    for (const f of this.fence) f.setVisible(level <= 0);
    PARKING_LOT.slots.forEach((s, i) => this.loops[i]?.setVisible(level >= s.minLevel));
    this.sign.setVisible(level > 0);
    this.charger.setVisible(level >= PARKING_LOT.charger.minLevel);
    return grew;
  }

  /** Fläche: Schotter (Stufe 0) bzw. Asphalt mit Stellplatz-Linien, Roller-Feldern und Fahrrad-Streifen. */
  private drawGround(level: number): void {
    const g = this.ground.clear();
    const p = getCityPalette(this.locationId);
    const r = PARKING_LOT.rect;
    const quad = (x0: number, y0: number, x1: number, y1: number, color: number, alpha = 1) => {
      const pts = [toScreen(x0, y0), toScreen(x1, y0), toScreen(x1, y1), toScreen(x0, y1)];
      g.fillStyle(color, alpha).fillPoints(pts, true);
    };
    const line = (x0: number, y0: number, x1: number, y1: number, width = 1.4) => {
      const a = toScreen(x0, y0);
      const b = toScreen(x1, y1);
      g.lineStyle(width, hex(p.lotMark), 0.9).lineBetween(a.x, a.y, b.x, b.y);
    };
    if (level <= 0) {
      // Schotter mit ein paar Grasbüscheln (die Fläche wartet auf den Ausbau).
      quad(r.x0, r.y0, r.x1, r.y1, hex(p.lot));
      for (let k = 0; k < 14; k++) {
        const x = r.x0 + 0.4 + ((k * 2.37) % (r.x1 - r.x0 - 0.8));
        const y = r.y0 + 0.4 + ((k * 1.61) % (r.y1 - r.y0 - 0.8));
        const s = toScreen(x, y);
        g.fillStyle(hex(p.grassDark), 0.8).fillEllipse(s.x, s.y, 7, 3.2);
      }
      return;
    }
    quad(r.x0, r.y0, r.x1, r.y1, hex(p.lotAsphalt));
    // Abgesenkter Bordstein der Einfahrt (Gehweg in Asphaltfarbe bis zur Straße)
    quad(
      PARKING_LOT.driveX - 0.55,
      r.y1,
      PARKING_LOT.driveX + 0.55,
      PARKING_LOT.streetY - 0.4,
      hex(p.lotAsphalt),
      0.85,
    );
    // Fahrrad-Streifen und Roller-Felder vorn, Auto-Boxen hinten
    const { w, d } = PARKING_LOT.bay;
    for (const s of PARKING_LOT.slots) {
      if (level < s.minLevel) continue;
      if (s.kind === 'car') {
        const x0 = s.x - w / 2;
        const x1 = s.x + w / 2;
        const y1 = r.y0 + d;
        line(x0, r.y0 + 0.05, x0, y1);
        line(x1, r.y0 + 0.05, x1, y1);
        if (
          s.x ===
          Math.min(
            ...PARKING_LOT.slots
              .filter((o) => o.kind === 'car' && level >= o.minLevel)
              .map((o) => o.x),
          )
        )
          line(x0, y1, x1, y1, 0.8);
      } else {
        const hw = s.kind === 'moped' ? 0.3 : 0.27;
        line(s.x - hw, s.y - 0.4, s.x - hw, s.y + 0.45, 1);
        if (s.kind === 'moped') {
          const m = toScreen(s.x, s.y);
          g.fillStyle(hex(p.lotMark), 0.35).fillEllipse(m.x, m.y + 2, 10, 4);
        }
      }
    }
    // Pfeil in der Fahrgasse
    const a = toScreen(PARKING_LOT.driveX + 1.4, PARKING_LOT.aisleY);
    const b = toScreen(PARKING_LOT.driveX + 2.4, PARKING_LOT.aisleY);
    g.lineStyle(1.6, hex(p.lotMark), 0.7).lineBetween(a.x, a.y, b.x, b.y);
  }

  /** Fahrzeuge je Platz: Autos auf ihrem Weg (rückwärts aus der Box), Rad und Roller blenden ein und aus. */
  sync(vehicles: readonly LotVehicle[]): void {
    vehicles.forEach((v, i) => {
      const img = this.vehicles[i];
      const slot = PARKING_LOT.slots[i];
      if (!img || !slot) return;
      if (v.state === 'free' || this.shownLevel < slot.minLevel) {
        if (img.visible) img.setVisible(false);
        return;
      }
      if (slot.kind === 'car') this.placeCar(img, slot, v, this.paths[i] ?? []);
      else this.placeSmall(img, slot, v);
    });
  }

  private placeSmall(img: Img, slot: ParkingSlot, v: LotVehicle): void {
    const frame =
      slot.kind === 'moped'
        ? `lot-moped-${String(v.variant % 3)}`
        : `lot-bike-${String(v.variant % 4)}`;
    if (img.frame.name !== frame) img.setFrame(frame);
    const pop = PARKING_CROWD.popSec;
    const alpha =
      v.state === 'arriving'
        ? Math.min(1, v.t / pop)
        : v.state === 'leaving'
          ? Math.max(0, 1 - v.t / pop)
          : 1;
    const s = toScreen(slot.x, slot.y);
    img
      .setVisible(true)
      .setFlipX(true)
      .setAlpha(alpha)
      .setPosition(s.x, s.y)
      .setDepth(isoDepth(slot.x - 0.5, slot.y - 0.5, 5.2));
  }

  private placeCar(
    img: Img,
    slot: ParkingSlot,
    v: LotVehicle,
    path: readonly { x: number; y: number }[],
  ): void {
    const total = polylineLength(path);
    const run = Math.min(total, (v.t / Math.max(parkSec(slot), 1e-6)) * total);
    // Einparken: vorwärts den Weg entlang; Ausparken: rückwärts aus der Box, dann vorwärts hinaus.
    const d = v.state === 'arriving' ? run : v.state === 'leaving' ? total - run : total;
    const at = pointAt(path, d);
    const lastLeg =
      path.length >= 2
        ? Math.hypot(
            (path[path.length - 1]?.x ?? 0) - (path[path.length - 2]?.x ?? 0),
            (path[path.length - 1]?.y ?? 0) - (path[path.length - 2]?.y ?? 0),
          )
        : 0;
    const reversing = v.state === 'leaving' && d > total - lastLeg;
    let dx = at.dx;
    let dy = at.dy;
    if (v.state === 'leaving' && !reversing) {
      dx = -dx;
      dy = -dy;
    }
    if (v.state === 'parked') {
      dx = 0;
      dy = -1;
    }
    const alongV = Math.abs(dy) >= Math.abs(dx);
    const front = alongV ? dy > 0 : dx > 0;
    const type = GUEST_CARS[v.variant % GUEST_CARS.length] ?? 0;
    const paint = GUEST_PAINTS[Math.floor(v.variant / 7) % GUEST_PAINTS.length] ?? '';
    const frame = `car-${String(type)}${paint}-${front ? 'f' : 'b'}`;
    if (img.frame.name !== frame) img.setFrame(frame);
    // Am Bordstein ein- bzw. ausblenden.
    const alpha = Math.min(1, d / PARKING_CROWD.carFadeTiles);
    const s = toScreen(at.x, at.y);
    img
      .setVisible(true)
      .setFlipX(alongV)
      .setAlpha(alpha)
      .setPosition(s.x, s.y)
      .setDepth(isoDepth(at.x - 0.5, at.y - 0.5, 5));
  }

  /** Mitte des Parkplatzes in Welt-Pixeln (Kamera zeigt ihn nach dem Ausbau). */
  center(): { x: number; y: number } {
    const r = PARKING_LOT.rect;
    return toScreen((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
  }
}
