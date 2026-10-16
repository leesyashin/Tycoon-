import {
  CROWD,
  pathFromPickup,
  cleanerPathToSpot,
  cleanerPathToTable,
  pathFromStool,
  pathFromTable,
  pathToPickup,
  pathToStool,
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
 * Kosmetische Figuren des bedienten Cafés (Phase 2): Gäste stellen sich an der Kasse an, bestellen und bezahlen,
 * setzen sich oder warten an der Ausgabe, Bedienungen bringen die Bestellung, Abholer trinken auf den Barhockern,
 * Putzkräfte wischen dreckige Tische. Liest nur Raten und Zähler aus `core`, schreibt nie in den GameState:
 * Einnahmen entstehen ausschließlich im Rate-Modell; der Gast an der Kasse bezahlt, wenn `core` die Zahlung bucht
 * (`CrowdInput.till`). Kein Phaser-Import, damit testbar.
 */
export type CustomerPhase =
  | 'walkIn'
  | 'queue'
  | 'order'
  | 'toSeat'
  | 'toPickup'
  | 'waitServe'
  | 'toStool'
  | 'consume'
  | 'leave';

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
  /** Barhocker (Index in `layout.bar.stools`), auf dem der Abholer trinkt, sonst −1. */
  stool: number;
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
  /** Hinweg zum Tisch; zurück geht es denselben Weg (auch durch die Tür von der Terrasse). */
  route: GridPos[];
}

/** `toMop`/`mop`: kein Tisch ist dreckig, die Putzkraft wischt den Boden (nur Optik). */
export type CleanerPhase = 'idle' | 'toTable' | 'wipe' | 'back' | 'toMop' | 'mop';

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
  /** Hinweg zum zuletzt geputzten Tisch (rückwärts zurück auf die Laufzeile). */
  route: GridPos[];
}

/**
 * Barista am Gerät (kosmetisch): bereitet zu (`work`, Fortschrittsring), bringt den Becher zur Ausgabe (`toPass`),
 * stellt ihn ab (`drop`) und geht zurück (`back`). Gelegentlich holt er danach Nachschub aus dem Lager (`toStore`,
 * `fetch` = greift ins Regal, `fromStore` = trägt die Ware ans Gerät). `idle`, solange keine Gäste kommen.
 */
export type BaristaPhase =
  'idle' | 'work' | 'toPass' | 'drop' | 'back' | 'toStore' | 'fetch' | 'fromStore';

export interface Barista {
  readonly id: number;
  active: boolean;
  /** Gerät, an dem die Figur arbeitet (Stations-ID). */
  station: string;
  home: GridPos;
  phase: BaristaPhase;
  x: number;
  y: number;
  path: GridPos[];
  timer: number;
  /** Dauer der laufenden Zubereitung (für den Ring), 0 außerhalb von „work“. */
  workTotal: number;
}

/** Ein sichtbarer Barista: Gerät und Arbeitsplatz davor. */
export interface BaristaPost {
  station: string;
  home: GridPos;
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
  /** Terrassen-Stufe: Tische draußen (Standard 0). */
  terrace?: number;
  /** Sauberkeit 0..100 → Anteil dreckiger Tische. */
  cleanliness: number;
  /** Sichtbare Baristas (je gekauftem Gerät einer, in Reihenfolge); leer = keine Barista-Figuren. */
  baristas?: readonly BaristaPost[];
  /** Sekunden je Becher und Barista (aus der Zubereitungs-Kapazität); 0 = niemand arbeitet. */
  prepSec?: number;
  /**
   * Kasse aus `core` (GAME_DESIGN § 7.2): Zahlungen seit dem letzten Schritt und wie weit der nächste Gast mit dem
   * Bezahlen ist (0..1). Gesetzt, bezahlt der Gast an der Kasse genau dann, wenn `core` die Zahlung bucht, und neue
   * Gäste kommen so rechtzeitig, dass bei jeder Zahlung jemand an der Kasse steht. Ohne (Debug-Spawn, Tests):
   * Bestellzeit aus `orderCap`, Gäste im Takt von `served`, jede fertige Bestellung zählt als Zahlung.
   */
  till?: { payments: number; progress: number };
}

export interface CrowdUpdate {
  /** Gäste, die in diesem Schritt ihre Bestellung bekommen haben (Emote). */
  purchases: Agent[];
  /** Gäste, die in diesem Schritt an der Kasse fertig bestellt und bezahlt haben. */
  orders: Agent[];
  /**
   * Zahlungen an der Kasse in diesem Schritt (Kassenlade, Geldschein, Betrag). Mit `till` so viele, wie `core`
   * gebucht hat – auch ohne Figur an der Kasse (sehr viele Gäste); sonst = `orders.length`.
   */
  payments: number;
  spawned: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export class CustomerCrowd {
  readonly agents: Agent[] = [];
  readonly waiters: Waiter[] = [];
  readonly cleaners: Cleaner[] = [];
  readonly baristas: Barista[] = [];
  /** Dreckige Tische (Index in `layout.tables`). */
  readonly dirty = new Set<number>();
  /**
   * Was auf der Ausgabe steht (Stations-IDs, älteste zuerst): Baristas stellen ab, Bedienungen nehmen je Auftrag
   * eins mit. Nur Optik.
   */
  readonly passItems: string[] = [];
  private readonly queue: Agent[] = [];
  private readonly serviceQueue: Agent[] = [];
  private readonly seatTaken: [boolean, boolean][];
  private readonly stoolTaken: boolean[];
  /** Sekunden vom Auftauchen auf dem Gehweg bis an die Kasse … */
  private readonly walkSec: number;
  /** … plus Vorlauf (`CROWD.payLeadSec`). */
  private readonly leadSec: number;
  /** Höchstens so viele Gäste in der Schlange (mit Kasse zählen die dazu, die noch hereinkommen). */
  private queueCap: number = CROWD.maxQueueFigures;
  /** Sekunden bis zur nächsten Zahlung laut `core` (unendlich ohne Gäste). */
  private payRemaining = Infinity;
  /** Erste Kassen-Runde: wer zur ersten Zahlung gebraucht wird, steht beim Szenenstart schon an. */
  private warm = false;
  private readonly shares: Record<CustomerTypeId, number>;
  private spawnAcc = 0;
  private totalRate = 0;
  /** Gäste, die nur auf der Tafel warten (die Schlange ist voll); kommen nach, sobald Platz ist. */
  private overflow = 0;
  private tablesVisible = 0;
  /** Sichtbar je Tisch-Index (Raum nach `seats`, Terrasse nach Terrassen-Stufe). */
  private tableShown: boolean[] = [];
  private nextSpot = 0;

  constructor(
    private readonly layout: CafeLayout,
    locationId: string,
    private readonly rng: () => number = Math.random,
  ) {
    this.shares = customerTypeShares(locationId);
    this.seatTaken = layout.tables.map(() => [false, false]);
    this.stoolTaken = layout.bar.stools.map(() => false);
    this.walkSec = walkInSec(layout);
    this.leadSec = this.walkSec + CROWD.payLeadSec;
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
        stool: -1,
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
        route: [],
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
        route: [],
      });
    }
    for (let i = 0; i < CROWD.maxBaristas; i++) {
      this.baristas.push({
        id: i,
        active: false,
        station: '',
        home: { x: 0, y: 0 },
        phase: 'idle',
        x: 0,
        y: 0,
        path: [],
        timer: 0,
        workTotal: 0,
      });
    }
  }

  get activeCount(): number {
    return this.agents.reduce((n, a) => n + (a.active ? 1 : 0), 0);
  }

  /**
   * Geschätzte Gäste im Café, die nicht als Figur gezeigt werden („+N“): nur bei vollem Figuren-Pool oder wenn auch
   * die Tafel voll ist.
   */
  get hiddenCount(): number {
    const active = this.activeCount;
    if (active < CROWD.maxAgents && this.overflow < CROWD.maxQueueOverflow) return 0;
    return Math.max(0, Math.round(this.totalRate * CROWD.avgVisitSec) - active);
  }

  /** Wartende vor der Kasse (Warteschlangen-Tafel, UI_STYLE § 3.10), auch die, die noch draußen warten. */
  get waitingCount(): number {
    return this.queue.length + this.overflow;
  }

  /** Platz eines Gasts in der Schlange (0 = bestellt gerade), −1 außerhalb der Schlange. */
  queueIndex(a: Agent): number {
    return this.queue.indexOf(a);
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
    const shown = new Set(visibleTables(this.layout, input.tables, input.terrace ?? 0));
    this.tableShown = this.layout.tables.map((t) => shown.has(t));
    this.tablesVisible = shown.size;

    const till = input.till;
    this.queueCap = CROWD.maxQueueFigures;
    let spawned = till ? this.spawnForTill(till.progress) : 0;
    this.spawnAcc += till ? 0 : this.totalRate * dt;
    // Nach langen Pausen nicht hunderte Figuren auf einmal erzeugen.
    this.spawnAcc = Math.min(this.spawnAcc, CROWD.maxAgents);
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.queue.length >= this.queueCap) {
        this.overflow = Math.min(CROWD.maxQueueOverflow, this.overflow + 1);
        continue;
      }
      if (this.spawn()) spawned++;
    }
    if (this.totalRate <= 0) this.overflow = 0;
    // Wer auf der Tafel wartet, kommt nach, sobald in der Schlange Platz ist.
    while (this.overflow > 0 && this.queue.length < this.queueCap && this.spawn()) {
      this.overflow--;
      spawned++;
    }

    const purchases: Agent[] = [];
    const orders: Agent[] = [];
    const step = CROWD.walkTilesPerSec * dt;
    this.payRemaining =
      till && this.totalRate > 0 ? Math.max(0, 1 - till.progress) / this.totalRate : Infinity;
    for (const a of this.agents) {
      if (!a.active) continue;
      this.advance(a, step, dt, input.orderCap, purchases, orders, !!till);
    }
    // Gebuchte Zahlungen: Wer an der Kasse steht, hat bezahlt (es steht immer nur einer dort); weitere Zahlungen
    // (mehr Gäste, als Figuren an die Kasse passen) zeigt die Szene nur an der Kasse.
    const payments = till ? Math.max(0, Math.floor(till.payments)) : orders.length;
    const head = this.queue[0];
    if (till && payments > 0 && head?.phase === 'order') this.finishOrder(head, orders);
    this.updateWaiters(dt, input.waiters, purchases);
    this.updateCleaners(dt, input.cleaners, input.cleanliness);
    this.updateBaristas(dt, input.baristas ?? [], input.prepSec ?? 0);
    return { purchases, orders, payments, spawned };
  }

  /**
   * Gäste für die Kasse: Jede Zahlung, die `core` in den nächsten `leadSec` bucht, braucht einen Gast, der dann an
   * der Kasse steht – fehlt einer, kommt er jetzt vom Gehweg. Beim Szenenstart stehen die ersten schon an. Mehr als
   * `maxVisiblePayPerSec` schafft keine Figur an der Kasse; was darüber liegt, bezahlt ohne Figur (Tafel, „+N“).
   */
  private spawnForTill(progress: number): number {
    const warm = !this.warm && this.activeCount === 0;
    this.warm = true;
    if (this.totalRate <= 0) return 0;
    const rate = Math.min(this.totalRate, CROWD.maxVisiblePayPerSec);
    const due = Math.floor(Math.max(0, progress) + rate * this.leadSec);
    // Wer noch hereinkommt, steht nicht an der Theke: die Schlange darf um die Gäste unterwegs länger sein.
    this.queueCap = CROWD.maxQueueFigures + Math.ceil(rate * this.walkSec);
    // Szenenstart: wer bezahlt, bevor ein neuer Gast vom Gehweg da wäre, steht schon an.
    let inside = warm
      ? Math.min(CROWD.maxQueueFigures, Math.floor(Math.max(0, progress) + rate * this.walkSec))
      : 0;
    let spawned = 0;
    while (this.queue.length + this.overflow < due) {
      if (this.queue.length >= this.queueCap) {
        if (this.overflow >= CROWD.maxQueueOverflow) break;
        this.overflow++;
        continue;
      }
      if (!this.spawn(inside > 0)) break;
      inside--;
      spawned++;
    }
    return spawned;
  }

  /** Punkt auf dem Gehweg vor oder hinter dem Eingang (Erscheinen und Verschwinden der Gäste). */
  private sidewalkPoint(): GridPos {
    const { curb, axis, spreadMin, spreadMax } = this.layout.street;
    const off = (this.rng() < 0.5 ? -1 : 1) * (spreadMin + this.rng() * (spreadMax - spreadMin));
    return axis === 'u' ? { x: curb.x + off, y: curb.y } : { x: curb.x, y: curb.y + off };
  }

  /** `inQueue`: gleich auf dem eigenen Schlangenplatz (Szenenstart), sonst vom Gehweg her. */
  private spawn(inQueue = false): boolean {
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
    free.timer = 0;
    free.outside = false;
    free.serveTotal = 0;
    free.table = -1;
    free.stool = -1;
    free.spot = 0;
    free.waited = 0;
    free.jx = (this.rng() - 0.5) * CROWD.crowdSpread;
    free.jy = (this.rng() - 0.5) * CROWD.crowdSpread;
    // Neben der Schlange heran bis auf Höhe des eigenen Platzes, erst dann hinein (niemand läuft durch Wartende).
    const { lane, path } = this.layout.order;
    const index = this.queue.length - 1;
    const slot = this.slotPos(free, index);
    const approach =
      index < this.visibleSlots ? { x: slot.x + lane.x, y: slot.y + lane.y } : { ...slot };
    free.path = [
      { ...this.layout.street.curb },
      { ...this.layout.entrance },
      ...path.map((p) => ({ ...p })),
      approach,
    ];
    if (inQueue) {
      free.x = slot.x;
      free.y = slot.y;
      free.path = [];
      free.phase = 'queue';
    }
    return true;
  }

  /**
   * Wer schon da ist, stellt sich vor die, die noch hereinkommen (wer näher an der Tür auftaucht, ist früher an
   * der Kasse); die anderen planen ihren Platz unterwegs neu.
   */
  private overtake(a: Agent): void {
    const i = this.queue.indexOf(a);
    let j = i;
    while (j > 0 && this.queue[j - 1]?.phase === 'walkIn') j--;
    if (j >= i) return;
    this.queue.splice(i, 1);
    this.queue.splice(j, 0, a);
  }

  /** Sichtbare Schlangenplätze (`order.queue`, höchstens `maxQueue`). */
  private get visibleSlots(): number {
    return Math.min(CROWD.maxQueue, this.layout.order.queue.length);
  }

  /** Plätze 0..visibleSlots-1 bilden die Schlange, dahinter wartet ein lockeres Grüppchen. */
  private slotPos(a: Agent, index: number): GridPos {
    const { access, queue, crowd } = this.layout.order;
    if (index < this.visibleSlots) return { ...(queue[index] ?? access) };
    return { x: crowd.x + a.jx, y: crowd.y + a.jy };
  }

  private advance(
    a: Agent,
    step: number,
    dt: number,
    orderCap: number,
    purchases: Agent[],
    orders: Agent[],
    paysWithTill: boolean,
  ): void {
    switch (a.phase) {
      case 'walkIn': {
        // Ist vorn inzwischen Platz, geht es gleich auf Höhe des neuen Platzes (nicht erst ans alte Ende).
        const idx = this.queue.indexOf(a);
        const last = a.path[a.path.length - 1];
        if (last && idx >= 0) {
          const slot = this.slotPos(a, idx);
          const { lane } = this.layout.order;
          a.path[a.path.length - 1] =
            idx < this.visibleSlots ? { x: slot.x + lane.x, y: slot.y + lane.y } : slot;
        }
        if (follow(a, step)) {
          a.phase = 'queue';
          this.overtake(a);
        }
        return;
      }
      case 'queue': {
        const idx = this.queue.indexOf(a);
        const arrived = moveToward(a, this.slotPos(a, Math.max(0, idx)), step);
        if (arrived && idx === 0) {
          a.phase = 'order';
          a.waited = 0;
          // Mit Kasse: der Ring läuft bis zur Zahlung, die `core` als Nächstes bucht.
          a.timer = paysWithTill
            ? clamp(this.payRemaining, CROWD.minServeSec, CROWD.maxPayWaitSec)
            : serveDuration(orderCap);
          a.serveTotal = a.timer;
        }
        return;
      }
      case 'order':
        if (paysWithTill) {
          // Bezahlt wird in `update`, sobald `core` die Zahlung bucht; bis dahin füllt sich der Ring.
          a.waited += dt;
          a.timer = clamp(this.payRemaining, 0, a.serveTotal);
          if (a.waited > CROWD.maxPayWaitSec) this.finishOrder(a, orders);
          return;
        }
        a.timer -= dt;
        if (a.timer > 0) return;
        this.finishOrder(a, orders);
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
      case 'toStool':
        if (follow(a, step)) {
          a.phase = 'consume';
          a.timer = CROWD.dwellMinSec + this.rng() * (CROWD.dwellMaxSec - CROWD.dwellMinSec);
        }
        return;
      case 'consume':
        a.timer -= dt;
        if (a.timer > 0) return;
        if (a.stool >= 0) this.leaveStool(a);
        else this.leaveTable(a);
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

  /** Bestellt und bezahlt: raus aus der Schlange, weiter zum Tisch oder zur Abholung. */
  private finishOrder(a: Agent, orders: Agent[]): void {
    a.serveTotal = 0;
    a.waited = 0;
    this.removeFrom(this.queue, a);
    orders.push(a);
    this.afterOrder(a);
  }

  /** Nach dem Bestellen um die Ecke: Platz am Tisch, wenn einer frei ist und der Gast bleiben will, sonst Abholung. */
  private afterOrder(a: Agent): void {
    const exit = this.layout.order.exit.map((p) => ({ ...p }));
    const from = exit[exit.length - 1] ?? this.layout.order.access;
    const seat = this.rng() < CROWD.dineInShare ? this.pickSeat() : null;
    if (seat) {
      const table = this.layout.tables[seat.table];
      const taken = this.seatTaken[seat.table];
      if (table && taken) {
        taken[seat.seat] = true;
        a.table = seat.table;
        a.seat = seat.seat;
        a.phase = 'toSeat';
        a.path = [...exit, ...pathToTable(this.layout, from, table), { ...table.seats[seat.seat] }];
        return;
      }
    }
    const spots = this.layout.pickup.spots;
    a.table = -1;
    a.spot = spots.length > 0 ? this.nextSpot++ % spots.length : 0;
    const spot = spots[a.spot] ?? from;
    a.phase = 'toPickup';
    a.path = [...exit, ...pathToPickup(this.layout, from, spot).map((p) => ({ ...p }))];
  }

  private pickSeat(): { table: number; seat: 0 | 1 } | null {
    const free: { table: number; seat: 0 | 1 }[] = [];
    for (let t = 0; t < this.layout.tables.length; t++) {
      const taken = this.seatTaken[t];
      if (!taken || !this.tableShown[t]) continue;
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
    // Mit dem Getränk auf einen freien Barhocker, sonst gleich hinaus.
    const stools = this.layout.bar.stools;
    const free = stools.map((_, i) => i).filter((i) => !this.stoolTaken[i]);
    const stool =
      free.length > 0 && this.rng() < CROWD.barShare
        ? free[Math.floor(this.rng() * free.length)]
        : undefined;
    const at = stool === undefined ? undefined : stools[stool];
    if (stool !== undefined && at) {
      this.stoolTaken[stool] = true;
      a.stool = stool;
      a.phase = 'toStool';
      a.path = pathToStool(this.layout, spot, at);
      return;
    }
    a.phase = 'leave';
    a.path = pathFromPickup(this.layout, spot).map((p) => ({ ...p }));
  }

  private leaveStool(a: Agent): void {
    const at = this.layout.bar.stools[a.stool];
    this.stoolTaken[a.stool] = false;
    a.stool = -1;
    a.phase = 'leave';
    a.path = at ? pathFromStool(this.layout, at) : [{ ...this.layout.entrance }];
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
    // Von der Terrasse direkt über den Gehweg weg (nicht noch einmal durchs Café): rechts den Gehweg entlang,
    // vorn vom Café weg nach links.
    if (table?.outside) {
      a.outside = true;
      const end = a.path[a.path.length - 1] ?? this.layout.street.curb;
      const { spreadMin, spreadMax } = this.layout.street;
      const off = spreadMin + this.rng() * (spreadMax - spreadMin);
      a.path.push(
        table.outside.side === 'right' ? this.sidewalkPoint() : { x: end.x - off, y: end.y },
      );
    }
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
          // Die Bedienung nimmt mit, was auf der Ausgabe steht.
          this.passItems.shift();
          if (next.table < 0) {
            // Abholung: Übergabe über die Theke, ohne Weg.
            w.phase = 'serve';
            w.timer = CROWD.handoverSec;
            return;
          }
          const table = this.layout.tables[next.table];
          if (!table) return;
          w.phase = 'toTable';
          w.route = waiterPathToTable(this.layout, table).map((p) => ({ ...p }));
          w.path = w.route.map((p) => ({ ...p }));
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
          // Denselben Weg zurück (über die Laufzeile, von der Terrasse durch die Tür), dann nach Hause.
          w.path = [...w.route.slice(0, -1).reverse(), { ...home }];
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
    for (const t of this.dirty) if (!this.tableShown[t]) this.dirty.delete(t);

    const visible = Math.min(CROWD.maxCleaners, Math.max(0, Math.floor(hired)));
    const step = CROWD.staffTilesPerSec * dt;
    const home = this.layout.cleanerHome;
    const row = this.layout.walkRows.top;
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
        c.timer = this.rest(i);
      }
      // Ein dreckiger Tisch geht immer vor: auch vom Bodenwischen weg.
      if (c.phase === 'idle' || c.phase === 'toMop' || c.phase === 'mop') {
        const target = [...this.dirty].find((t) => !this.cleaners.some((o) => o.table === t));
        const table = target === undefined ? undefined : this.layout.tables[target];
        if (target !== undefined && table) {
          c.table = target;
          c.phase = 'toTable';
          // Erst den letzten Weg zurück auf die Laufzeile (z. B. von der Terrasse), dann zum nächsten Tisch.
          const back = c.route.slice(0, -1).reverse();
          const from = back[back.length - 1] ?? { x: c.x, y: c.y };
          c.route = cleanerPathToTable(this.layout, from, table).map((p) => ({ ...p }));
          c.path = [...back, ...c.route];
          return;
        }
      }
      switch (c.phase) {
        case 'idle': {
          // Nichts zu tun: kurz verschnaufen, dann irgendwo den Boden wischen.
          c.timer -= dt;
          const spots = this.layout.mopSpots;
          if (c.timer > 0 || spots.length === 0) return;
          const taken = this.cleaners
            .filter((o) => o !== c && (o.phase === 'toMop' || o.phase === 'mop'))
            .map((o) => o.path[o.path.length - 1] ?? { x: o.x, y: o.y });
          const free = spots.filter((p) => !taken.some((t) => t.x === p.x && t.y === p.y));
          const to = free[Math.floor(this.rng() * free.length)] ?? spots[0];
          if (!to) return;
          c.phase = 'toMop';
          c.route = cleanerPathToSpot(this.layout, { x: c.x, y: c.y }, to);
          c.path = c.route.map((p) => ({ ...p }));
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
            c.timer = 0;
            return;
          }
          c.phase = 'back';
          c.path = [...c.route.slice(0, -1).reverse(), { x: spot.x, y: row }, { ...spot }];
          c.route = [];
          return;
        case 'back':
          if (follow(c, step)) {
            c.phase = 'idle';
            c.timer = this.rest(i);
          }
          return;
        case 'toMop':
          if (follow(c, step)) {
            c.phase = 'mop';
            c.timer = CROWD.mopMinSec + this.rng() * (CROWD.mopMaxSec - CROWD.mopMinSec);
          }
          return;
        case 'mop':
          c.timer -= dt;
          if (c.timer > 0) return;
          // Noch eine Stelle oder zurück zum Startplatz.
          if (this.rng() < 0.5) {
            c.phase = 'idle';
            c.timer = 0;
            return;
          }
          c.phase = 'back';
          c.path = [...c.route.slice(0, -1).reverse(), { x: spot.x, y: row }, { ...spot }];
          c.route = [];
          return;
      }
    });
  }

  private rest(i: number): number {
    return CROWD.restMinSec + ((this.rng() + i * 0.37) % 1) * (CROWD.restMaxSec - CROWD.restMinSec);
  }

  /**
   * Baristas (kosmetisch): je sichtbarem Gerät einer; bereitet zu, bringt den Becher zur Ausgabe, stellt ihn ab,
   * geht zurück. Wechselt ein Platz das Gerät (neues Gerät gekauft), beginnt die Figur dort neu.
   */
  private updateBaristas(dt: number, posts: readonly BaristaPost[], prepSec: number): void {
    const step = CROWD.staffTilesPerSec * dt;
    const drop = this.layout.pickup.baristaDrop;
    this.baristas.forEach((b, i) => {
      const post = posts[i];
      if (!post) {
        b.active = false;
        b.workTotal = 0;
        return;
      }
      if (!b.active || b.station !== post.station) {
        b.active = true;
        b.station = post.station;
        b.home = { ...post.home };
        b.x = post.home.x;
        b.y = post.home.y;
        b.path = [];
        b.phase = 'idle';
        b.workTotal = 0;
      }
      switch (b.phase) {
        case 'idle':
          if (prepSec > 0) this.startWork(b, prepSec);
          return;
        case 'work':
          if (prepSec <= 0) {
            b.phase = 'idle';
            b.workTotal = 0;
            return;
          }
          b.timer -= dt;
          if (b.timer > 0) return;
          b.workTotal = 0;
          b.phase = 'toPass';
          // Über den Gang; leicht versetzt, damit zwei Baristas an der Ausgabe nicht übereinander stehen.
          b.path = [
            ...this.toAisle(b.home),
            { x: drop.x - (i % 3) * 0.12, y: drop.y + ((i % 2) - 0.5) * 0.16 },
          ];
          return;
        case 'toPass':
          if (follow(b, step)) {
            b.phase = 'drop';
            b.timer = CROWD.dropSec;
          }
          return;
        case 'drop': {
          b.timer -= dt;
          if (b.timer > 0) return;
          this.passItems.push(b.station);
          if (this.passItems.length > CROWD.passItemsMax) this.passItems.shift();
          // Ab und zu Nachschub aus dem Lager holen – immer nur einer, damit sich am Regal niemand drängt.
          const busy = this.baristas.some((o) => o !== b && o.active && FETCHING.includes(o.phase));
          if (!busy && this.rng() < CROWD.fetchChance) {
            b.phase = 'toStore';
            b.path = [{ ...this.layout.storage.fetchSpot }];
            return;
          }
          b.phase = 'back';
          b.path = [...this.toAisle(b.home), { ...b.home }];
          return;
        }
        case 'toStore':
          if (!follow(b, step)) return;
          b.phase = 'fetch';
          b.timer = CROWD.fetchSec;
          return;
        case 'fetch':
          b.timer -= dt;
          if (b.timer > 0) return;
          b.phase = 'fromStore';
          b.path = [{ ...b.home }];
          return;
        case 'back':
        case 'fromStore':
          if (!follow(b, step)) return;
          if (prepSec > 0) this.startWork(b, prepSec);
          else b.phase = 'idle';
          return;
      }
    });
  }

  /** Punkt auf dem Personal-Gang vor einem Arbeitsplatz abseits des Gangs (sonst kein Umweg). */
  private toAisle(home: GridPos): GridPos[] {
    const y = this.layout.pickup.aisleY;
    return Math.abs(home.y - y) < 1e-6 ? [] : [{ x: home.x, y }];
  }

  private startWork(b: Barista, prepSec: number): void {
    b.phase = 'work';
    b.workTotal = clamp(prepSec * (0.85 + 0.3 * this.rng()), CROWD.minPrepSec, CROWD.maxPrepSec);
    b.timer = b.workTotal;
  }

  private removeFrom(list: Agent[], a: Agent): void {
    const i = list.indexOf(a);
    if (i >= 0) list.splice(i, 1);
  }

  private release(a: Agent): void {
    this.removeFrom(this.queue, a);
    this.removeFrom(this.serviceQueue, a);
    if (a.stool >= 0) {
      this.stoolTaken[a.stool] = false;
      a.stool = -1;
    }
    if (a.table >= 0) {
      const taken = this.seatTaken[a.table];
      if (taken) taken[a.seat] = false;
      a.table = -1;
    }
    a.active = false;
    a.path = [];
  }
}

/** Phasen, in denen ein Barista im Lager ist bzw. Ware trägt. */
const FETCHING: readonly BaristaPhase[] = ['toStore', 'fetch', 'fromStore'];

/** Variante eines Kundentyps aus einer Zufallszahl 0..1 (gleich verteilt). */
export function pickLook(type: CustomerTypeId, roll: number): string {
  const looks = CUSTOMER_LOOKS[type];
  const i = Math.min(looks.length - 1, Math.max(0, Math.floor(roll * looks.length)));
  return looks[i] ?? looks[0] ?? '';
}

/**
 * Typischer Weg eines neuen Gasts vom Gehweg bis an die Kasse in Sekunden (mittlere Streuung beim Auftauchen,
 * Abbiegen zur Tür, Weg zur Schlange, seitlich heran an den ersten Platz).
 */
export function walkInSec(layout: CafeLayout): number {
  const { street, entrance, order } = layout;
  const spread = (street.spreadMin + street.spreadMax) / 2;
  const first = order.queue[0] ?? order.access;
  const pts = [
    street.curb,
    entrance,
    ...order.path,
    { x: first.x + order.lane.x, y: first.y + order.lane.y },
    first,
  ];
  let tiles = spread;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a && b) tiles += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return tiles / CROWD.walkTilesPerSec;
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
