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
  /** Index in `CityDef.boats` (Kanal oder Spree). */
  route: number;
  pos: number;
  dir: 1 | -1;
  rest: number;
}

/**
 * Taube (kosmetisch): pickt an ihrem Platz, fliegt auf, wenn ein Passant nahe kommt, bleibt eine Weile weg und
 * landet wieder. `z` = Höhe in Pixeln über dem Boden.
 */
export interface Pigeon {
  home: { x: number; y: number };
  state: 'peck' | 'fly' | 'away' | 'land';
  x: number;
  y: number;
  z: number;
  /** Flugrichtung (Grid, Einheitsvektor). */
  dx: number;
  dy: number;
  timer: number;
  /** Nächster Wechsel Kopf hoch/runter beim Picken. */
  peckIn: number;
  pecking: boolean;
}

/** Grüne Achse der Ampel: `u` = Fahrbahn entlang x, `v` = entlang y, `none` = alles Rot. */
export type Signal = 'u' | 'v' | 'none';

/** Was die Autoampel einer Achse zeigt (deutsche Folge: Rot → Rot-Gelb → Grün → Gelb → Rot). */
export type LightState = 'red' | 'redYellow' | 'green' | 'yellow';

export class StreetLife {
  readonly cars: Car[];
  readonly walkers: Walker[];
  readonly boats: Boat[];
  readonly pigeons: Pigeon[];
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
    this.pigeons = city.pigeons.map((home, i) => ({
      home,
      state: 'peck' as const,
      x: home.x,
      y: home.y,
      z: 0,
      dx: 1,
      dy: 0,
      timer: 0,
      peckIn: 0.3 + (i % 5) * 0.2,
      pecking: false,
    }));
    this.boats = city.boats.map((r, i) => ({
      route: i,
      pos: r.from + (r.to - r.from) * (0.3 + 0.4 * i),
      dir: i % 2 ? -1 : 1,
      rest: 0,
    }));
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

  /** Lichtzeichen der Autoampel für die Fahrbahn der Achse `axis`. */
  lightState(axis: 'u' | 'v'): LightState {
    const { greenSec, allRedSec, yellowSec, redYellowSec } = STREET_LIFE;
    const cycle = 2 * (greenSec + allRedSec);
    const start = axis === 'u' ? 0 : greenSec + allRedSec;
    const rel = (((this.clock - start) % cycle) + cycle) % cycle;
    if (rel < greenSec - yellowSec) return 'green';
    if (rel < greenSec) return 'yellow';
    if (rel >= cycle - redYellowSec) return 'redYellow';
    return 'red';
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
    this.updatePigeons(dt);
  }

  /** Ist das ein Radfahrer (Typ nach den Autos)? */
  static isBike(type: number): boolean {
    return type >= STREET_LIFE.carTypes;
  }

  private updatePigeons(dt: number): void {
    const { pigeonScare, pigeonFlySec, pigeonAwayMin, pigeonAwayMax, pigeonLandSec } = STREET_LIFE;
    for (const p of this.pigeons) {
      switch (p.state) {
        case 'peck': {
          p.peckIn -= dt;
          if (p.peckIn <= 0) {
            p.pecking = !p.pecking;
            p.peckIn = p.pecking ? 0.25 + this.rng() * 0.3 : 0.4 + this.rng() * 1.2;
          }
          const near = this.walkers.find(
            (w) => w.active && Math.hypot(w.x - p.x, w.y - p.y) < pigeonScare,
          );
          if (!near) break;
          // Weg vom Passanten, schräg nach oben
          const ax = p.x - near.x;
          const ay = p.y - near.y;
          const d = Math.hypot(ax, ay) || 1;
          p.dx = ax / d;
          p.dy = ay / d;
          p.state = 'fly';
          p.timer = pigeonFlySec;
          break;
        }
        case 'fly':
          p.timer -= dt;
          p.x += p.dx * 2.2 * dt;
          p.y += p.dy * 2.2 * dt;
          p.z += 34 * dt;
          if (p.timer <= 0) {
            p.state = 'away';
            p.timer = pigeonAwayMin + this.rng() * (pigeonAwayMax - pigeonAwayMin);
          }
          break;
        case 'away':
          p.timer -= dt;
          if (p.timer > 0) break;
          // Zurück: aus der Höhe schräg auf den Platz
          p.state = 'land';
          p.timer = pigeonLandSec;
          p.dx = this.rng() < 0.5 ? -1 : 1;
          p.dy = 0;
          break;
        case 'land': {
          p.timer -= dt;
          const t = Math.max(0, p.timer / pigeonLandSec);
          p.x = p.home.x + p.dx * 2.5 * t;
          p.y = p.home.y - 1.2 * t;
          p.z = 40 * t;
          if (p.timer <= 0) {
            p.state = 'peck';
            p.x = p.home.x;
            p.y = p.home.y;
            p.z = 0;
          }
          break;
        }
      }
    }
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
    const { bikeShare, bikeTypes, bikeSpeed } = STREET_LIFE;
    const green = this.signal();
    const { yellowCommit } = STREET_LIFE;
    this.city.lanes.forEach((lane, li) => {
      const yellow = this.lightState(lane.axis) === 'yellow';
      // Fortschritt s wächst in Fahrtrichtung; vorn = größtes s.
      const s = (c: Car) => c.pos * lane.dir;
      const mine = this.cars.filter((c) => c.active && c.lane === li).sort((a, b) => s(b) - s(a));
      const stopS = lane.stopAt * lane.dir - STREET_LIFE.carHalfLength;
      const endS = lane.dir > 0 ? laneTo : -laneFrom;
      let leader: number | null = null;
      for (const c of mine) {
        const speed = StreetLife.isBike(c.type) ? carTilesPerSec * bikeSpeed : carTilesPerSec;
        let next = s(c) + speed * dt;
        if (leader !== null) next = Math.min(next, leader - carGap);
        // Rot: vor der Haltelinie warten; Gelb: anhalten, wer noch nicht dicht davor ist.
        const stop = green !== lane.axis || (yellow && s(c) < stopS - yellowCommit);
        if (stop && s(c) <= stopS + 1e-6) next = Math.min(next, stopS);
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
      free.type =
        this.rng() < bikeShare
          ? carTypes + (Math.floor(this.rng() * bikeTypes) % bikeTypes)
          : Math.floor(this.rng() * carTypes) % carTypes;
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
    for (const b of this.boats) {
      const r = this.city.boats[b.route];
      if (!r) continue;
      if (b.rest > 0) {
        b.rest -= dt;
        continue;
      }
      b.pos += b.dir * STREET_LIFE.boatTilesPerSec * dt;
      if (b.pos > r.to || b.pos < r.from) {
        b.dir = b.dir > 0 ? -1 : 1;
        b.pos = b.dir > 0 ? r.from : r.to;
        b.rest = STREET_LIFE.boatRestSec;
      }
    }
  }

  /** Weltposition eines Dampfers (Grid-Punkt der Mitte). */
  boatPosition(b: Boat): { x: number; y: number } {
    const r = this.city.boats[b.route];
    if (!r) return { x: 0, y: 0 };
    return r.axis === 'u' ? { x: b.pos, y: r.at } : { x: r.at, y: b.pos };
  }
}
