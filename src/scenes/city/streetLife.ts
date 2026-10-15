import { STREET_LIFE, type CityDef, type LaneDef } from '@data/city';

/**
 * Leben auf der Straße (kosmetisch, wie die Figuren im Café): Autos auf den Fahrstreifen mit Ampel an der
 * Kreuzung und Abstand zum Vordermann, Passanten auf den Gehwegen (an den Überwegen warten sie auf Grün), ein
 * Ausflugsdampfer auf dem Kanal. Kein Phaser, kein `GameState` – die Szene liest nur Positionen.
 */

export interface Car {
  active: boolean;
  lane: number;
  /** Position entlang der Fahrstreifen-Achse (Grid). */
  pos: number;
  type: number;
}

export interface Walker {
  active: boolean;
  path: number;
  /** Index des Punkts, auf den der Passant zuläuft. */
  target: number;
  x: number;
  y: number;
  /** Letzte Bewegungsrichtung (für Blickrichtung und Lauf-Frames). */
  dx: number;
  dy: number;
  moving: boolean;
  /** Restliche Pause bis zum (Neu-)Start. */
  rest: number;
  /** Würfelzahl für Kundentyp/Look (die Szene bildet sie auf `CUSTOMER_LOOKS` ab). */
  seed: number;
}

export interface Boat {
  pos: number;
  dir: 1 | -1;
  rest: number;
}

/** Grüne Achse der Ampel: `u` = Fahrbahn entlang x, `v` = entlang y, `none` = alles Rot. */
export type Signal = 'u' | 'v' | 'none';

export class StreetLife {
  readonly cars: Car[];
  readonly walkers: Walker[];
  readonly boat: Boat;
  private clock = 0;
  private readonly spawnIn: number[];

  constructor(
    private readonly city: CityDef,
    private readonly rng: () => number = Math.random,
  ) {
    this.cars = Array.from({ length: city.lanes.length * STREET_LIFE.maxCarsPerLane }, () => ({
      active: false,
      lane: 0,
      pos: 0,
      type: 0,
    }));
    this.spawnIn = city.lanes.map(() => this.rng() * STREET_LIFE.carEverySec);
    this.walkers = Array.from({ length: STREET_LIFE.walkers }, (_, i) => ({
      active: false,
      path: 0,
      target: 1,
      x: 0,
      y: 0,
      dx: 1,
      dy: 0,
      moving: false,
      rest: i * 0.8,
      seed: 0,
    }));
    this.boat = { pos: STREET_LIFE.laneFrom, dir: 1, rest: 0 };
    // Schon belebt starten: Autos und Passanten über die Strecke verteilen.
    for (let i = 0; i < 40; i++) this.update(0.5);
  }

  /** Ampelphase: Grün u, Räumzeit, Grün v, Räumzeit. */
  signal(): Signal {
    const { greenSec, allRedSec } = STREET_LIFE;
    const t = this.clock % (2 * (greenSec + allRedSec));
    if (t < greenSec) return 'u';
    if (t < greenSec + allRedSec) return 'none';
    if (t < 2 * greenSec + allRedSec) return 'v';
    return 'none';
  }

  /** Verbleibende Grünzeit der Achse `axis` (0, wenn sie Rot hat). */
  greenLeft(axis: 'u' | 'v'): number {
    const { greenSec, allRedSec } = STREET_LIFE;
    const t = this.clock % (2 * (greenSec + allRedSec));
    const start = axis === 'u' ? 0 : greenSec + allRedSec;
    return t >= start && t < start + greenSec ? start + greenSec - t : 0;
  }

  update(dt: number): void {
    this.clock += dt;
    this.updateCars(dt);
    this.updateWalkers(dt);
    this.updateBoat(dt);
  }

  /** Weltposition eines Autos (Grid-Punkt der Mitte). */
  carPosition(car: Car): { x: number; y: number } {
    const lane = this.city.lanes[car.lane];
    if (!lane) return { x: 0, y: 0 };
    return lane.axis === 'u' ? { x: car.pos, y: lane.at } : { x: lane.at, y: car.pos };
  }

  lane(car: Car): LaneDef | undefined {
    return this.city.lanes[car.lane];
  }

  private updateCars(dt: number): void {
    const { carTilesPerSec, carGap, laneFrom, laneTo, maxCarsPerLane, carEverySec, carTypes } =
      STREET_LIFE;
    const green = this.signal();
    this.city.lanes.forEach((lane, li) => {
      // Fortschritt s wächst in Fahrtrichtung; vorn = größtes s.
      const s = (c: Car) => c.pos * lane.dir;
      const mine = this.cars.filter((c) => c.active && c.lane === li).sort((a, b) => s(b) - s(a));
      const stopS = lane.stopAt * lane.dir - STREET_LIFE.carHalfLength;
      const endS = lane.dir > 0 ? laneTo : -laneFrom;
      let leader: number | null = null;
      for (const c of mine) {
        let next = s(c) + carTilesPerSec * dt;
        if (leader !== null) next = Math.min(next, leader - carGap);
        if (green !== lane.axis && s(c) <= stopS + 1e-6) next = Math.min(next, stopS);
        next = Math.max(next, s(c));
        c.pos = next * lane.dir;
        leader = next;
        if (next > endS) c.active = false;
      }
      this.spawnIn[li] = (this.spawnIn[li] ?? 0) - dt;
      if ((this.spawnIn[li] ?? 0) > 0) return;
      this.spawnIn[li] = carEverySec * (0.5 + this.rng());
      const startS = lane.dir > 0 ? laneFrom : -laneTo;
      const last = mine[mine.length - 1];
      if (mine.length >= maxCarsPerLane || (last && s(last) - startS < carGap)) return;
      const free = this.cars.find((c) => !c.active);
      if (!free) return;
      free.active = true;
      free.lane = li;
      free.pos = startS * lane.dir;
      free.type = Math.floor(this.rng() * carTypes) % carTypes;
    });
  }

  private updateWalkers(dt: number): void {
    const { walkerTilesPerSec, walkerRestMin, walkerRestMax } = STREET_LIFE;
    for (const w of this.walkers) {
      w.moving = false;
      if (!w.active) {
        w.rest -= dt;
        if (w.rest > 0) continue;
        const path = Math.floor(this.rng() * this.city.walks.length) % this.city.walks.length;
        const start = this.city.walks[path]?.points[0];
        if (!start) continue;
        w.active = true;
        w.path = path;
        w.target = 1;
        w.x = start.x;
        w.y = start.y;
        w.seed = Math.floor(this.rng() * 1_000_000);
        continue;
      }
      const points = this.city.walks[w.path]?.points ?? [];
      let budget = walkerTilesPerSec * dt;
      while (budget > 0) {
        const p = points[w.target];
        if (!p) {
          w.active = false;
          w.rest = walkerRestMin + this.rng() * (walkerRestMax - walkerRestMin);
          break;
        }
        const dx = p.x - w.x;
        const dy = p.y - w.y;
        const dist = Math.hypot(dx, dy);
        // Am Bordstein auf Grün für die Querung warten (die Fahrbahn der Achse `cross` hat Rot).
        const from = points[w.target - 1];
        const seg = from ? Math.hypot(p.x - from.x, p.y - from.y) : dist;
        if (p.cross && dist > 1e-6 && !this.mayCross(p.cross, dist, seg)) break;
        w.moving = true;
        if (dist <= budget) {
          w.x = p.x;
          w.y = p.y;
          budget -= dist;
          w.target++;
        } else {
          w.x += (dx / dist) * budget;
          w.y += (dy / dist) * budget;
          budget = 0;
        }
        if (dist > 1e-6) {
          w.dx = dx / dist;
          w.dy = dy / dist;
        }
      }
    }
  }

  /**
   * Querung erlaubt, solange die Gegenachse Grün hat und die Zeit für den ganzen Weg reicht; wer schon auf der
   * Fahrbahn ist, geht weiter.
   */
  private mayCross(road: 'u' | 'v', dist: number, seg: number): boolean {
    if (dist < seg - 0.05) return true;
    const other = road === 'u' ? 'v' : 'u';
    return this.greenLeft(other) >= seg / STREET_LIFE.walkerTilesPerSec;
  }

  private updateBoat(dt: number): void {
    const b = this.boat;
    if (b.rest > 0) {
      b.rest -= dt;
      return;
    }
    b.pos += b.dir * STREET_LIFE.boatTilesPerSec * dt;
    if (b.pos > STREET_LIFE.laneTo || b.pos < STREET_LIFE.laneFrom) {
      b.dir = b.dir > 0 ? -1 : 1;
      b.pos = b.dir > 0 ? STREET_LIFE.laneFrom : STREET_LIFE.laneTo;
      b.rest = STREET_LIFE.boatRestSec;
    }
  }
}
