import {
  CROWD,
  NAV,
  inRoom,
  visibleTables,
  type CafeLayout,
  type GridPos,
  type TablePlacement,
} from '@data/layouts';
import type { CustomerTypeId } from '@data/customerTypes';
import { CUSTOMER_LOOKS } from '@data/art';
import { customerTypeShares, pickCustomerType } from '@core/customers/types';
import { CafeNav, pathLength } from './nav';

/**
 * Kosmetische Figuren des bedienten Cafés (Phase 2): Gäste stellen sich an der Kasse an, bestellen und bezahlen,
 * setzen sich oder warten an der Ausgabe, Bedienungen bringen die Bestellung, Abholer trinken auf den Barhockern,
 * Putzkräfte wischen dreckige Tische. Liest nur Raten und Zähler aus `core`, schreibt nie in den GameState:
 * Einnahmen entstehen ausschließlich im Rate-Modell; der Gast an der Kasse bezahlt, wenn `core` die Zahlung bucht
 * (`CrowdInput.till`). Wege kommen aus der Wegsuche (`nav.ts`) und beginnen immer dort, wo die Figur gerade steht.
 * Kein Phaser-Import, damit testbar.
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
  /** Ziel des laufenden Wegs beim Hereinkommen (Schlangenplatz); ändert es sich, wird ab hier neu geplant. */
  goal: GridPos;
  /** Eigenes Lauftempo (Faktor um 1), damit nicht alle im Gleichschritt gehen. */
  pace: number;
  /** Deckkraft 0..1: Gäste blenden auf dem Gehweg ein und am Ende ihres Wegs wieder aus. */
  fade: number;
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
  /**
   * Ambiente-Level (`LocationState.ambience`): welche Deko, Musik- und WLAN-Ecke im Raum steht und umgangen wird.
   * Ohne Angabe umgehen die Wege jedes Deko-Stück.
   */
  ambience?: Readonly<Record<string, number>>;
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
  /** Neuplanungen unterwegs, die in diesem Frame noch frei sind (`CROWD.replansPerFrame`). */
  private replans = 0;
  private totalRate = 0;
  /** Gäste, die nur auf der Tafel warten (die Schlange ist voll); kommen nach, sobald Platz ist. */
  private overflow = 0;
  private tablesVisible = 0;
  /** Sichtbar je Tisch-Index (Raum nach `seats`, Terrasse nach Terrassen-Stufe). */
  private tableShown: boolean[] = [];
  private nextSpot = 0;
  private readonly nav: CafeNav;
  /** Stehende Figuren dieses Schritts (wartende Abholer, servierende Bedienungen, wischende Putzkräfte). */
  private readonly standing: GridPos[] = [];

  constructor(
    private readonly layout: CafeLayout,
    locationId: string,
    private readonly rng: () => number = Math.random,
  ) {
    this.shares = customerTypeShares(locationId);
    this.seatTaken = layout.tables.map(() => [false, false]);
    this.stoolTaken = layout.bar.stools.map(() => false);
    this.nav = new CafeNav(layout);
    this.walkSec = walkInSec(layout, this.nav);
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
        goal: { x: 0, y: 0 },
        pace: 1,
        fade: 1,
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
    this.nav.setVisible(this.tableShown, input.ambience);
    this.collectStanding();

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
    this.replans = CROWD.replansPerFrame;
    for (const a of this.agents) {
      if (!a.active) continue;
      this.advance(a, step * a.pace, dt, input.orderCap, purchases, orders, !!till);
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

  /**
   * Punkt auf dem Gehweg vor oder hinter dem Eingang (Erscheinen und Verschwinden der Gäste), möglichst nicht in
   * einem Terrassen-Stuhl oder Pflanzkübel.
   */
  private sidewalkPoint(): GridPos {
    const { curb, axis, spreadMin, spreadMax } = this.layout.street;
    let p: GridPos = { ...curb };
    for (let tries = 0; tries < 6; tries++) {
      const off = (this.rng() < 0.5 ? -1 : 1) * (spreadMin + this.rng() * (spreadMax - spreadMin));
      p = axis === 'u' ? { x: curb.x + off, y: curb.y } : { x: curb.x, y: curb.y + off };
      if (this.nav.clear('guest', p.x, p.y)) break;
    }
    return p;
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
    // Vom Gehweg her: seitlich auftauchen (einblenden) und direkt durch die Tür zum eigenen Platz.
    const start = this.sidewalkPoint();
    free.x = start.x;
    free.y = start.y;
    free.timer = 0;
    free.serveTotal = 0;
    free.table = -1;
    free.stool = -1;
    free.spot = 0;
    free.waited = 0;
    free.jx = (this.rng() - 0.5) * CROWD.crowdSpread;
    free.jy = (this.rng() - 0.5) * CROWD.crowdSpread;
    free.pace = 1 + (this.rng() * 2 - 1) * CROWD.paceSpread;
    free.fade = 0;
    // Zum eigenen Platz; die Wegsuche führt neben der Schlange heran (niemand läuft durch Wartende).
    const slot = this.slotPos(free, this.queue.length - 1);
    free.goal = slot;
    if (inQueue) {
      free.x = slot.x;
      free.y = slot.y;
      free.path = [];
      free.phase = 'queue';
      free.fade = 1;
      return true;
    }
    free.path = this.nav.path('guest', start, slot, this.standing);
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
        // Ist vorn inzwischen Platz (oder hinten nicht mehr), geht es von hier aus direkt zum neuen Platz.
        const idx = this.queue.indexOf(a);
        if (idx >= 0) {
          const slot = this.slotPos(a, idx);
          if (Math.hypot(slot.x - a.goal.x, slot.y - a.goal.y) > 0.05 && this.replans > 0) {
            this.replans--;
            a.goal = slot;
            a.path = this.nav.path('guest', a, slot, this.standing);
          }
        }
        a.fade = Math.min(1, a.fade + step / CROWD.fadeTiles);
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
      case 'leave': {
        if (follow(a, step)) {
          this.release(a);
          return;
        }
        // Draußen auf dem letzten Stück ausblenden.
        if (!inRoom(this.layout, Math.round(a.x), Math.round(a.y))) {
          const rest = pathLength(a, a.path);
          a.fade = Math.min(1, rest / CROWD.fadeTiles);
        }
        return;
      }
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
    const seat = this.rng() < CROWD.dineInShare ? this.pickSeat() : null;
    if (seat) {
      const table = this.layout.tables[seat.table];
      const taken = this.seatTaken[seat.table];
      if (table && taken) {
        taken[seat.seat] = true;
        a.table = seat.table;
        a.seat = seat.seat;
        a.phase = 'toSeat';
        a.path = this.nav.path('guest', a, table.seats[seat.seat], this.standing);
        return;
      }
    }
    const spots = this.layout.pickup.spots;
    a.table = -1;
    a.spot = this.pickSpot();
    const spot = spots[a.spot] ?? { x: a.x, y: a.y };
    a.phase = 'toPickup';
    a.path = this.nav.path('guest', a, spot, this.standing);
  }

  /** Nächster Abholplatz reihum, ein freier vor einem, an dem schon jemand wartet. */
  private pickSpot(): number {
    const spots = this.layout.pickup.spots;
    if (spots.length === 0) return 0;
    for (let k = 0; k < spots.length; k++) {
      const i = (this.nextSpot + k) % spots.length;
      const busy = this.agents.some(
        (o) =>
          o.active &&
          o.table < 0 &&
          o.spot === i &&
          (o.phase === 'toPickup' || o.phase === 'waitServe'),
      );
      if (!busy) {
        this.nextSpot = i + 1;
        return i;
      }
    }
    return this.nextSpot++ % spots.length;
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
      a.path = this.nav.path('guest', a, at, this.standing);
      return;
    }
    this.leave(a, this.sidewalkPoint());
  }

  private leaveStool(a: Agent): void {
    this.stoolTaken[a.stool] = false;
    a.stool = -1;
    this.leave(a, this.sidewalkPoint());
  }

  private leaveTable(a: Agent): void {
    const table = this.layout.tables[a.table];
    const taken = this.seatTaken[a.table];
    if (taken) taken[a.seat] = false;
    if (table && this.dirty.size < this.desiredDirty) this.dirty.add(a.table);
    a.table = -1;
    // Vorn auf der Terrasse geht man vom Café weg nach links, sonst den Gehweg rechts entlang (durch die Tür).
    if (table?.outside?.side === 'front') {
      const { spreadMin, spreadMax, frontWalk } = this.layout.street;
      const off = spreadMin + this.rng() * (spreadMax - spreadMin);
      this.leave(a, { x: table.side.x - off, y: frontWalk });
      return;
    }
    this.leave(a, this.sidewalkPoint());
  }

  /** Direkt von hier zu einem Punkt auf dem Gehweg, dort ausblenden. */
  private leave(a: Agent, to: GridPos): void {
    a.phase = 'leave';
    a.path = this.nav.path('guest', a, to, this.standing);
  }

  /**
   * Stehende Figuren dieses Schritts, um die neue Wege herumführen: wartende Abholer, servierende Bedienungen,
   * wischende Putzkräfte. (Die Schlange, Stühle und Hocker kennt die Wegsuche selbst.)
   */
  private collectStanding(): void {
    const s = this.standing;
    s.length = 0;
    for (const a of this.agents)
      if (a.active && a.table < 0 && a.stool < 0 && a.phase === 'waitServe') s.push(a);
    for (const w of this.waiters) if (w.active && w.phase === 'serve') s.push(w);
    for (const c of this.cleaners)
      if (c.active && (c.phase === 'wipe' || c.phase === 'mop')) s.push(c);
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
          const seat = table?.seats[next.seat];
          if (!table || !seat) return;
          // Neben den Gast treten (auf der Seite, von der sie kommt), nicht an einen festen Punkt am Tisch.
          const at = this.nav.standSpot('staff', seat, NAV.serveDist, w, table.side);
          w.phase = 'toTable';
          w.path = this.nav.path('staff', w, at, this.standing);
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
          // Direkt zurück zur Ausgabe (von der Terrasse durch die Tür), nicht den Hinweg rückwärts.
          w.phase = 'back';
          w.path = this.nav.path('staff', w, home, this.standing);
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
      // Ein dreckiger Tisch geht immer vor – auch vom Bodenwischen oder vom Rückweg weg, und zwar der nächste,
      // direkt von hier aus (von Tisch zu Tisch statt über den Startplatz).
      if (
        (c.phase === 'idle' || c.phase === 'back' || c.phase === 'toMop' || c.phase === 'mop') &&
        this.goWipe(c)
      )
        return;
      switch (c.phase) {
        case 'idle': {
          // Nichts zu tun: kurz verschnaufen, dann in der Nähe den Boden wischen.
          c.timer -= dt;
          if (c.timer > 0) return;
          const to = this.pickMopSpot(c);
          if (!to) return;
          c.phase = 'toMop';
          c.path = this.nav.path('guest', c, to, this.standing);
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
          // Gleich weiter zum nächsten dreckigen Tisch, sonst in der Nähe wischen oder Pause.
          if (!this.goWipe(c)) this.afterChore(c, spot);
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
          this.afterChore(c, spot);
          return;
      }
    });
  }

  /** Zum nächsten dreckigen Tisch, den niemand sonst ansteuert; false, wenn keiner wartet. */
  private goWipe(c: Cleaner): boolean {
    const target = this.nearestDirty(c);
    const table = target < 0 ? undefined : this.layout.tables[target];
    if (!table) return false;
    c.table = target;
    c.phase = 'toTable';
    const at = this.nav.standSpot('guest', table.tile, NAV.wipeDist, c, table.side);
    c.path = this.nav.path('guest', c, at, this.standing);
    return true;
  }

  /** Nach dem Wischen: gleich die nächste Stelle in der Nähe oder zum Startplatz verschnaufen. */
  private afterChore(c: Cleaner, home: GridPos): void {
    if (this.rng() < CROWD.mopAgainChance) {
      c.phase = 'idle';
      c.timer = 0;
      return;
    }
    c.phase = 'back';
    c.path = this.nav.path('guest', c, home, this.standing);
  }

  /** Nächster dreckiger Tisch, den keine andere Putzkraft schon ansteuert (−1 = keiner). */
  private nearestDirty(c: Cleaner): number {
    let best = -1;
    let bestD = Infinity;
    for (const t of this.dirty) {
      if (this.cleaners.some((o) => o !== c && o.table === t)) continue;
      const tile = this.layout.tables[t]?.tile;
      if (!tile) continue;
      const d = Math.hypot(tile.x - c.x, tile.y - c.y);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  /** Wischstelle, an der niemand wischt und an der die Putzkraft nicht gerade steht; eher eine nahe. */
  private pickMopSpot(c: Cleaner): GridPos | undefined {
    const taken = this.cleaners
      .filter((o) => o !== c && (o.phase === 'toMop' || o.phase === 'mop'))
      .map((o) => o.path[o.path.length - 1] ?? { x: o.x, y: o.y });
    const free = this.layout.mopSpots
      .filter((p) => !taken.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < 0.5))
      .filter((p) => Math.hypot(p.x - c.x, p.y - c.y) > 0.5)
      .sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y));
    const near = free.slice(0, CROWD.mopNearest);
    return near[Math.floor(this.rng() * near.length)] ?? this.layout.mopSpots[0];
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
          // Leicht versetzt, damit zwei Baristas an der Ausgabe nicht übereinander stehen.
          b.path = this.nav.path('back', b, {
            x: drop.x - (i % 3) * 0.12,
            y: drop.y + ((i % 2) - 0.5) * 0.16,
          });
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
            b.path = this.nav.path('back', b, this.layout.storage.fetchSpot);
            return;
          }
          b.phase = 'back';
          b.path = this.nav.path('back', b, b.home);
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
          b.path = this.nav.path('back', b, b.home);
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
 * Typischer Weg eines neuen Gasts vom Gehweg bis an die Kasse in Sekunden: Mittel der Wege aus beiden Richtungen
 * des Gehwegs (mittlere Streuung beim Auftauchen) bis zum ersten Schlangenplatz.
 */
export function walkInSec(layout: CafeLayout, nav: CafeNav = new CafeNav(layout)): number {
  const { curb, axis, spreadMin, spreadMax } = layout.street;
  const spread = (spreadMin + spreadMax) / 2;
  const first = layout.order.queue[0] ?? layout.order.access;
  let tiles = 0;
  for (const side of [-1, 1]) {
    const start =
      axis === 'u'
        ? { x: curb.x + side * spread, y: curb.y }
        : { x: curb.x, y: curb.y + side * spread };
    tiles += pathLength(start, nav.path('guest', start, first)) / 2;
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
