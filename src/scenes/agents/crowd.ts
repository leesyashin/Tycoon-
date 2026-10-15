import {
  CROWD,
  pathFromPickup,
  pathFromTable,
  pathToPickup,
  pathToTable,
  visibleTables,
  waiterPathToTable,
  type CafeLayout,
  type GridPos,
  type TablePlacement,
} from '@data/layouts';
import type { CustomerTypeId } from '@data/customerTypes';
import { CUSTOMER_LOOKS } from '@data/art';
import { customerTypeShares, pickCustomerType } from '@core/customers/types';

/**
 * Kosmetische Figuren des bedienten Cafés (Phase 2): Gäste stellen sich an der Kasse an, bestellen,
 * setzen sich oder warten an der Ausgabe, Bedienungen bringen die Bestellung, Putzkräfte wischen dreckige
 * Tische. Liest nur Raten und Zähler aus `core`, schreibt nie in den GameState: Einnahmen entstehen
 * ausschließlich im Rate-Modell. Kein Phaser-Import, damit testbar.
 */
export type CustomerPhase =
  'walkIn' | 'queue' | 'order' | 'toSeat' | 'toPickup' | 'waitServe' | 'consume' | 'leave';

export interface Agent {
  readonly id: number;
  active: boolean;
  type: CustomerTypeId;
  /** Figuren-Variante des Typs (`CUSTOMER_LOOKS`), rein optisch. */
  look: string;
  phase: CustomerPhase;
  x: number;
  y: number;
  /** Restliche Waypoints. */
  path: GridPos[];
  timer: number;
  /** Gesamte Bestellzeit (für den Fortschrittsring), 0 außerhalb von „order“. */
  serveTotal: number;
  /** Tisch-Index in `layout.tables` oder −1 (Abholung an der Ausgabe). */
  table: number;
  seat: 0 | 1;
  /** Warteplatz an der Ausgabe (Index in `layout.pickup.spots`). */
  spot: number;
  /** Sekunden, die der Gast schon auf die Bedienung wartet. */
  waited: number;
  /** Versatz im Gedränge hinter der sichtbaren Schlange. */
  jx: number;
  jy: number;
  /** Beim Gehen: schon zur Tür hinaus und auf dem Gehweg unterwegs. */
  outside: boolean;
}

export type WaiterPhase = 'idle' | 'toTable' | 'serve' | 'back';

export interface Waiter {
  readonly id: number;
  active: boolean;
  phase: WaiterPhase;
  x: number;
  y: number;
  path: GridPos[];
  timer: number;
  /** Gast (Agent-ID), der gerade bedient wird, sonst −1. */
  target: number;
}

export type CleanerPhase = 'idle' | 'toTable' | 'wipe' | 'back';

export interface Cleaner {
  readonly id: number;
  active: boolean;
  phase: CleanerPhase;
  x: number;
  y: number;
  path: GridPos[];
  timer: number;
  /** Tisch, der gerade geputzt wird, sonst −1. */
  table: number;
}

export interface CrowdInput {
  /** Bediente Gäste/s aus dem Rate-Modell: so viele Figuren kommen herein. */
  served: number;
  /** Kapazität der Bestelltheke (Gäste/s): sichtbare Bestellzeit des Schlangenkopfs. */
  orderCap: number;
  /** Eingestellte Bedienungen und Putzkräfte (Köpfe); sichtbar höchstens `CROWD.max*`. */
  waiters: number;
  cleaners: number;
  /** `seats`-Stufe: so viele Tische stehen im Raum. */
  tables: number;
  /** Sauberkeit 0..100 → Anteil dreckiger Tische. */
  cleanliness: number;
}

export interface CrowdUpdate {
  /** Gäste, die in diesem Schritt ihre Bestellung bekommen haben (Münz-Popups). */
  purchases: Agent[];
  spawned: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export class CustomerCrowd {
  readonly agents: Agent[] = [];
  readonly waiters: Waiter[] = [];
  readonly cleaners: Cleaner[] = [];
  /** Dreckige Tische (Index in `layout.tables`). */
  readonly dirty = new Set<number>();
  private readonly queue: Agent[] = [];
  private readonly serviceQueue: Agent[] = [];
  private readonly seatTaken: [boolean, boolean][];
  private readonly shares: Record<CustomerTypeId, number>;
  private spawnAcc = 0;
  private totalRate = 0;
  private tablesVisible = 0;
  private nextSpot = 0;

  constructor(
    private readonly layout: CafeLayout,
    locationId: string,
    private readonly rng: () => number = Math.random,
  ) {
    this.shares = customerTypeShares(locationId);
    this.seatTaken = layout.tables.map(() => [false, false]);
    for (let i = 0; i < CROWD.maxAgents; i++) {
      this.agents.push({
        id: i,
        active: false,
        type: 'student',
        look: CUSTOMER_LOOKS.student[0] ?? '',
        phase: 'walkIn',
        x: 0,
        y: 0,
        path: [],
        timer: 0,
        serveTotal: 0,
        table: -1,
        seat: 0,
        spot: 0,
        waited: 0,
        jx: 0,
        jy: 0,
        outside: false,
      });
    }
    for (let i = 0; i < CROWD.maxWaiters; i++) {
      const home = layout.pickup.waiterHomes[i] ?? layout.pickup.waiterHomes[0] ?? { x: 0, y: 0 };
      this.waiters.push({
        id: i,
        active: false,
        phase: 'idle',
        x: home.x,
        y: home.y,
        path: [],
        timer: 0,
        target: -1,
      });
    }
    for (let i = 0; i < CROWD.maxCleaners; i++) {
      this.cleaners.push({
        id: i,
        active: false,
        phase: 'idle',
        x: layout.cleanerHome.x + i * 0.5,
        y: layout.cleanerHome.y,
        path: [],
        timer: 0,
        table: -1,
      });
    }
  }

  get activeCount(): number {
    return this.agents.reduce((n, a) => n + (a.active ? 1 : 0), 0);
  }

  /** Geschätzte Gäste im Café, die nicht als Figur gezeigt werden („+N“); nur bei vollem Pool. */
  get hiddenCount(): number {
    const active = this.activeCount;
    if (active < CROWD.maxAgents) return 0;
    return Math.max(0, Math.round(this.totalRate * CROWD.avgVisitSec) - active);
  }

  /** Wartende vor der Kasse (Warteschlangen-Tafel, UI_STYLE § 3.10). */
  get waitingCount(): number {
    return this.queue.length;
  }

  /** Gäste, die auf ihre Bestellung warten (Tisch oder Ausgabe). */
  get awaitingServiceCount(): number {
    return this.serviceQueue.length;
  }

  seatPosition(table: number, seat: 0 | 1): GridPos | null {
    return this.layout.tables[table]?.seats[seat] ?? null;
  }

  update(dtSec: number, input: CrowdInput): CrowdUpdate {
    const dt = Number.isFinite(dtSec) ? Math.max(0, dtSec) : 0;
    this.totalRate = Math.max(0, input.served);
    this.tablesVisible = visibleTables(this.layout, input.tables).length;

    let spawned = 0;
    this.spawnAcc += this.totalRate * dt;
    // Nach langen Pausen nicht hunderte Figuren auf einmal erzeugen.
    this.spawnAcc = Math.min(this.spawnAcc, CROWD.maxAgents);
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.spawn()) spawned++;
    }

    const purchases: Agent[] = [];
    const step = CROWD.walkTilesPerSec * dt;
    for (const a of this.agents) {
      if (!a.active) continue;
      this.advance(a, step, dt, input.orderCap, purchases);
    }
    this.updateWaiters(dt, input.waiters, purchases);
    this.updateCleaners(dt, input.cleaners, input.cleanliness);
    return { purchases, spawned };
  }

  /** Punkt auf dem Gehweg links oder rechts vom Eingang (Erscheinen und Verschwinden der Gäste). */
  private sidewalkPoint(): GridPos {
    const { curb, spreadMin, spreadMax } = this.layout.street;
    const side = this.rng() < 0.5 ? -1 : 1;
    return { x: curb.x + side * (spreadMin + this.rng() * (spreadMax - spreadMin)), y: curb.y };
  }

  private spawn(): boolean {
    const free = this.agents.find((a) => !a.active);
    if (!free || this.totalRate <= 0) return false;
    this.queue.push(free);
    free.active = true;
    free.type = pickCustomerType(this.shares, this.rng());
    free.look = pickLook(free.type, this.rng());
    free.phase = 'walkIn';
    // Vom Gehweg her: seitlich auftauchen, zur Tür abbiegen, dann wie bisher zur Schlange.
    const start = this.sidewalkPoint();
    free.x = start.x;
    free.y = start.y;
    free.path = [
      { ...this.layout.street.curb },
      { ...this.layout.entrance },
      ...this.layout.order.path.map((p) => ({ ...p })),
    ];
    free.timer = 0;
    free.outside = false;
    free.serveTotal = 0;
    free.table = -1;
    free.spot = 0;
    free.waited = 0;
    free.jx = (this.rng() - 0.5) * CROWD.crowdSpread;
    free.jy = (this.rng() - 0.5) * CROWD.crowdSpread;
    return true;
  }

  /** Plätze 0..maxQueue-1 bilden die Schlange, dahinter wartet ein lockeres Grüppchen. */
  private slotPos(a: Agent, index: number): GridPos {
    const { access, queueDir } = this.layout.order;
    if (index < CROWD.maxQueue) {
      return { x: access.x + queueDir.x * index, y: access.y + queueDir.y * index };
    }
    const end = CROWD.maxQueue;
    return { x: access.x + queueDir.x * end + a.jx, y: access.y + queueDir.y * end + a.jy };
  }

  private advance(a: Agent, step: number, dt: number, orderCap: number, purchases: Agent[]): void {
    switch (a.phase) {
      case 'walkIn':
        if (follow(a, step)) a.phase = 'queue';
        return;
      case 'queue': {
        const idx = this.queue.indexOf(a);
        const arrived = moveToward(a, this.slotPos(a, Math.max(0, idx)), step);
        if (arrived && idx === 0) {
          a.phase = 'order';
          a.timer = serveDuration(orderCap);
          a.serveTotal = a.timer;
        }
        return;
      }
      case 'order':
        a.timer -= dt;
        if (a.timer > 0) return;
        a.serveTotal = 0;
        this.removeFrom(this.queue, a);
        this.afterOrder(a);
        return;
      case 'toSeat':
      case 'toPickup':
        if (follow(a, step)) {
          a.phase = 'waitServe';
          a.waited = 0;
          this.serviceQueue.push(a);
        }
        return;
      case 'waitServe':
        a.waited += dt;
        // Keine Bedienung in Sicht: der Gast holt sich die Bestellung über die Theke (nur Optik).
        if (a.waited > CROWD.maxServiceWaitSec) this.completeService(a, purchases);
        return;
      case 'consume':
        a.timer -= dt;
        if (a.timer > 0) return;
        this.leaveTable(a);
        return;
      case 'leave':
        if (!follow(a, step)) return;
        if (a.outside) {
          this.release(a);
          return;
        }
        // An der Tür angekommen: über den Gehweg zur Seite weg.
        a.outside = true;
        a.path = [{ ...this.layout.street.curb }, this.sidewalkPoint()];
        return;
    }
  }

  /** Nach dem Bestellen: Platz am Tisch, wenn einer frei ist und der Gast bleiben will, sonst Abholung. */
  private afterOrder(a: Agent): void {
    const from = this.layout.order.access;
    const seat = this.rng() < CROWD.dineInShare ? this.pickSeat() : null;
    if (seat) {
      const table = this.layout.tables[seat.table];
      const taken = this.seatTaken[seat.table];
      if (table && taken) {
        taken[seat.seat] = true;
        a.table = seat.table;
        a.seat = seat.seat;
        a.phase = 'toSeat';
        a.path = [...pathToTable(this.layout, from, table), { ...table.seats[seat.seat] }];
        return;
      }
    }
    const spots = this.layout.pickup.spots;
    a.table = -1;
    a.spot = spots.length > 0 ? this.nextSpot++ % spots.length : 0;
    const spot = spots[a.spot] ?? from;
    a.phase = 'toPickup';
    a.path = pathToPickup(this.layout, from, spot).map((p) => ({ ...p }));
  }

  private pickSeat(): { table: number; seat: 0 | 1 } | null {
    const free: { table: number; seat: 0 | 1 }[] = [];
    for (let t = 0; t < this.tablesVisible && t < this.layout.tables.length; t++) {
      const taken = this.seatTaken[t];
      if (!taken) continue;
      if (!taken[0]) free.push({ table: t, seat: 0 });
      if (!taken[1]) free.push({ table: t, seat: 1 });
    }
    if (free.length === 0) return null;
    return free[Math.floor(this.rng() * free.length)] ?? null;
  }

  /** Bestellung ist da: Sitzgäste konsumieren, Abholer gehen. */
  private completeService(a: Agent, purchases: Agent[]): void {
    this.removeFrom(this.serviceQueue, a);
    purchases.push(a);
    if (a.table >= 0) {
      a.phase = 'consume';
      a.timer = CROWD.dwellMinSec + this.rng() * (CROWD.dwellMaxSec - CROWD.dwellMinSec);
      return;
    }
    const spot = this.layout.pickup.spots[a.spot] ?? { x: a.x, y: a.y };
    a.phase = 'leave';
    a.path = pathFromPickup(this.layout, spot).map((p) => ({ ...p }));
  }

  private leaveTable(a: Agent): void {
    const table = this.layout.tables[a.table];
    const taken = this.seatTaken[a.table];
    if (taken) taken[a.seat] = false;
    if (table && this.dirty.size < this.desiredDirty) this.dirty.add(a.table);
    a.phase = 'leave';
    a.path = table
      ? pathFromTable(this.layout, table).map((p) => ({ ...p }))
      : [{ ...this.layout.entrance }];
    a.table = -1;
  }

  private desiredDirtyCache = { cleanliness: -1, tables: -1, value: 0 };
  private get desiredDirty(): number {
    return this.desiredDirtyCache.value;
  }

  private updateWaiters(dt: number, hired: number, purchases: Agent[]): void {
    const visible = Math.min(CROWD.maxWaiters, Math.max(0, Math.floor(hired)));
    const step = CROWD.staffTilesPerSec * dt;
    this.waiters.forEach((w, i) => {
      const home = this.layout.pickup.waiterHomes[i] ?? { x: w.x, y: w.y };
      if (i >= visible) {
        // Entlassen gibt es nicht; weniger sichtbare Figuren nur nach Import/Reset – dann sofort weg.
        if (w.active && w.phase === 'idle') w.active = false;
        if (!w.active) return;
      } else if (!w.active) {
        w.active = true;
        w.phase = 'idle';
        w.x = home.x;
        w.y = home.y;
        w.path = [];
        w.target = -1;
      }
      switch (w.phase) {
        case 'idle': {
          const next = this.serviceQueue.find((a) => !this.waiters.some((o) => o.target === a.id));
          if (!next) return;
          w.target = next.id;
          if (next.table < 0) {
            // Abholung: Übergabe über die Theke, ohne Weg.
            w.phase = 'serve';
            w.timer = CROWD.handoverSec;
            return;
          }
          const table = this.layout.tables[next.table];
          if (!table) return;
          w.phase = 'toTable';
          w.path = waiterPathToTable(this.layout, table).map((p) => ({ ...p }));
          return;
        }
        case 'toTable':
          if (follow(w, step)) {
            w.phase = 'serve';
            w.timer = CROWD.handoverSec;
          }
          return;
        case 'serve': {
          w.timer -= dt;
          if (w.timer > 0) return;
          const a = this.agents[w.target];
          if (a?.active && a.phase === 'waitServe') this.completeService(a, purchases);
          w.target = -1;
          if (Math.hypot(w.x - home.x, w.y - home.y) < 1e-6) {
            w.phase = 'idle';
            return;
          }
          w.phase = 'back';
          w.path = [...this.layout.pickup.exit.map((p) => ({ ...p })).reverse(), { ...home }];
          // Zurück über die Laufzeile, nicht quer durch die Tische.
          w.path.unshift({ x: w.x, y: this.layout.walkRows.top });
          return;
        }
        case 'back':
          if (follow(w, step)) w.phase = 'idle';
          return;
      }
    });
  }

  private updateCleaners(dt: number, hired: number, cleanliness: number): void {
    const cache = this.desiredDirtyCache;
    if (cache.cleanliness !== cleanliness || cache.tables !== this.tablesVisible) {
      cache.cleanliness = cleanliness;
      cache.tables = this.tablesVisible;
      cache.value = Math.round(this.tablesVisible * clamp(1 - cleanliness / 100, 0, 1));
    }
    // Sauberer geworden (oder weniger Tische): überzählige Marker verschwinden, aber nie unter Putzkräften.
    if (this.dirty.size > this.desiredDirty) {
      for (const t of this.dirty) {
        if (this.dirty.size <= this.desiredDirty) break;
        if (this.cleaners.some((c) => c.table === t)) continue;
        this.dirty.delete(t);
      }
    }
    for (const t of this.dirty) if (t >= this.tablesVisible) this.dirty.delete(t);

    const visible = Math.min(CROWD.maxCleaners, Math.max(0, Math.floor(hired)));
    const step = CROWD.staffTilesPerSec * dt;
    const home = this.layout.cleanerHome;
    const row = this.layout.walkRows.bottom;
    this.cleaners.forEach((c, i) => {
      const spot = { x: home.x + i * 0.6, y: home.y };
      if (i >= visible) {
        if (c.active && c.phase === 'idle') c.active = false;
        if (!c.active) return;
      } else if (!c.active) {
        c.active = true;
        c.phase = 'idle';
        c.x = spot.x;
        c.y = spot.y;
        c.table = -1;
      }
      switch (c.phase) {
        case 'idle': {
          const target = [...this.dirty].find((t) => !this.cleaners.some((o) => o.table === t));
          if (target === undefined) return;
          const table = this.layout.tables[target];
          if (!table) return;
          c.table = target;
          c.phase = 'toTable';
          c.path = [{ x: c.x, y: row }, { x: table.side.x, y: row }, { ...table.side }];
          return;
        }
        case 'toTable':
          if (follow(c, step)) {
            c.phase = 'wipe';
            c.timer = CROWD.wipeSec;
          }
          return;
        case 'wipe':
          c.timer -= dt;
          if (c.timer > 0) return;
          this.dirty.delete(c.table);
          c.table = -1;
          if (this.dirty.size > 0) {
            c.phase = 'idle';
            return;
          }
          c.phase = 'back';
          c.path = [{ x: c.x, y: row }, { x: spot.x, y: row }, { ...spot }];
          return;
        case 'back':
          if (follow(c, step)) c.phase = 'idle';
          return;
      }
    });
  }

  private removeFrom(list: Agent[], a: Agent): void {
    const i = list.indexOf(a);
    if (i >= 0) list.splice(i, 1);
  }

  private release(a: Agent): void {
    this.removeFrom(this.queue, a);
    this.removeFrom(this.serviceQueue, a);
    if (a.table >= 0) {
      const taken = this.seatTaken[a.table];
      if (taken) taken[a.seat] = false;
      a.table = -1;
    }
    a.active = false;
    a.path = [];
  }
}

/** Variante eines Kundentyps aus einer Zufallszahl 0..1 (gleich verteilt). */
export function pickLook(type: CustomerTypeId, roll: number): string {
  const looks = CUSTOMER_LOOKS[type];
  const i = Math.min(looks.length - 1, Math.max(0, Math.floor(roll * looks.length)));
  return looks[i] ?? looks[0] ?? '';
}

/** Sichtbare Bestellzeit des Schlangenkopfs aus der Kapazität der Bestelltheke. */
export function serveDuration(orderCap: number): number {
  const sec = orderCap > 0 ? 1 / orderCap : CROWD.maxServeSec;
  return clamp(sec, CROWD.minServeSec, CROWD.maxServeSec);
}

/** Folgt den Waypoints um `step` Kacheln; true, wenn das Ziel erreicht ist. */
function follow(a: { x: number; y: number; path: GridPos[] }, step: number): boolean {
  let budget = step;
  while (a.path.length > 0 && budget > 0) {
    const target = a.path[0];
    if (!target) break;
    const d = Math.hypot(target.x - a.x, target.y - a.y);
    if (d <= budget) {
      a.x = target.x;
      a.y = target.y;
      a.path.shift();
      budget -= d;
    } else {
      moveToward(a, target, budget);
      budget = 0;
    }
  }
  return a.path.length === 0;
}

function moveToward(a: { x: number; y: number }, t: GridPos, step: number): boolean {
  const dx = t.x - a.x;
  const dy = t.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d <= step || d === 0) {
    a.x = t.x;
    a.y = t.y;
    return true;
  }
  a.x += (dx / d) * step;
  a.y += (dy / d) * step;
  return false;
}

export type { TablePlacement };
