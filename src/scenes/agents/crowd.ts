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
import { CUSTOMER_LOOKS, PASS_ITEMS } from '@data/art';
import { PARKING_CROWD, PARKING_LOT, parkingExit, type ParkingSlot } from '@data/parking';
import { customerTypeShares, pickCustomerType } from '@core/customers/types';
import { CafeNav, pathLength } from './nav';
import { parkSec } from './parking';

/**
 * Kosmetische Figuren des bedienten Cafés (Phase 2/3): Gäste stellen sich an der Kasse an, bestellen und bezahlen,
 * setzen sich oder warten an der Ausgabe. Bedienungen holen das Fertige von der Ausgabe aufs Tablett, stellen es
 * am Tisch ab und räumen später das Geschirr ab; ohne Bedienung holen Gäste selbst an der Theke ab und bringen ihr
 * Geschirr zur Rückgabe. Abholer trinken auf den Barhockern oder gehen mit dem Becher, Putzkräfte wischen dreckige
 * Tische. Nach Ladenschluss geht das Team nach hinten hinaus (Putzkräfte wischen noch kurz), morgens kommt es
 * wieder. Liest nur Raten und Zähler aus `core`, schreibt nie in den GameState: Einnahmen entstehen ausschließlich
 * im Rate-Modell; der Gast an der Kasse bezahlt, wenn `core` die Zahlung bucht (`CrowdInput.till`). Wege kommen aus
 * der Wegsuche (`nav.ts`) und beginnen immer dort, wo die Figur gerade steht. Kein Phaser-Import, damit testbar.
 */
export type CustomerPhase =
  /** Kommt mit Rad, Roller oder Auto: noch im Fahrzeug, bis es geparkt ist (unsichtbar). */
  | 'arrive'
  /**
   * Ausgestiegen, zu Fuß vom Parkplatz zur Tür. Erst so nah an der Kasse wie ein Gast vom Gehweg stellt er sich an
   * (`walkIn`): Wer noch weit weg ist, hält keinen Platz in der Schlange frei.
   */
  | 'approach'
  | 'walkIn'
  | 'queue'
  | 'order'
  | 'toSeat'
  | 'toPickup'
  | 'waitServe'
  | 'toStool'
  | 'consume'
  | 'toReturn'
  | 'returnDishes'
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
  /** Wartet an der Ausgabe bzw. ist dorthin unterwegs (Abholer und Selbstbedienung mit reserviertem Tisch). */
  pickup: boolean;
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
  /** Was der Gast bestellt hat (Item-ID wie `PASS_ITEMS`), sobald er es bekommen hat. */
  item: string | null;
  /** Was er gerade in der Hand trägt (Bestellung, Geschirr als `<id>-empty`), sonst `null`. */
  carry: string | null;
  /** Platz auf dem Parkplatz, wenn der Gast mit dem Fahrzeug gekommen ist, sonst −1. */
  vehicle: number;
}

/** Fahrzeug auf einem Parkplatz-Platz: frei, fährt ein, steht, fährt weg. */
export type VehicleState = 'free' | 'arriving' | 'parked' | 'leaving';

export interface LotVehicle {
  /** Index in `PARKING_LOT.slots`. */
  readonly slot: number;
  state: VehicleState;
  /** Sekunden seit Beginn des Ein- bzw. Ausparkens. */
  t: number;
  /** Farbe bzw. Autotyp, rein optisch. */
  variant: number;
  /** Gast (Agent-ID), dem das Fahrzeug gehört, sonst −1. */
  owner: number;
}

export type WaiterPhase =
  | 'idle'
  | 'pickup'
  | 'toTable'
  | 'serve'
  | 'back'
  | 'toClear'
  | 'clear'
  | 'stash'
  | 'off'
  | 'arrive';

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
  /** Was auf dem Tablett steht (Item-IDs; Geschirr als `<id>-empty`). */
  tray: string[];
  /** Tisch, der gerade abgeräumt wird, sonst −1. */
  table: number;
  /** Deckkraft beim Kommen und Gehen zum Dienst. */
  fade: number;
}

/** `toMop`/`mop`: kein Tisch ist dreckig, die Putzkraft wischt den Boden (nur Optik). */
export type CleanerPhase =
  'idle' | 'toTable' | 'wipe' | 'back' | 'toMop' | 'mop' | 'off' | 'arrive';

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
  fade: number;
}

/**
 * Barista am Gerät (kosmetisch): bereitet zu (`work`, Fortschrittsring; was er dabei tut, steht je Gerät in
 * `WORK_SCRIPTS`), bringt das Fertige zur Ausgabe (`toPass`), stellt es ab (`drop`) und geht zurück (`back`).
 * Gelegentlich holt er danach Nachschub aus dem Lager (`toStore`, `fetch` = greift ins Regal, `fromStore` = trägt
 * die Ware ans Gerät). `idle`, solange keine Gäste kommen; `off`/`arrive` beim Feierabend bzw. Dienstbeginn.
 */
export type BaristaPhase =
  | 'idle'
  | 'work'
  | 'toPass'
  | 'drop'
  | 'back'
  | 'toStore'
  | 'fetch'
  | 'fromStore'
  | 'off'
  | 'arrive';

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
  fade: number;
}

/** Verkäufer hinter der Kasse: stehen an ihrem Platz; kommen morgens herein und gehen abends nach hinten hinaus. */
export type CashierPhase = 'idle' | 'off' | 'arrive';

export interface Cashier {
  readonly id: number;
  active: boolean;
  phase: CashierPhase;
  home: GridPos;
  x: number;
  y: number;
  path: GridPos[];
  timer: number;
  fade: number;
}

/** Teller/Becher auf einem Platz am Tisch: noch voll oder benutztes Geschirr, das abgeräumt werden will. */
export interface TableItem {
  item: string;
  empty: boolean;
  /** Sekunden, die das Geschirr schon steht (ohne Bedienung räumt es irgendwann jemand weg). */
  age: number;
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
  /** Verkäufer an der Kasse (Köpfe, du eingeschlossen); sichtbar höchstens `CROWD.maxCashiers`. Standard 0. */
  cashiers?: number;
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
  /** Ausbaustufe des Parkplatzes (Ambiente `parking`, Standard 0): ab 1 kommen manche Gäste mit dem Fahrzeug. */
  parking?: number;
  /**
   * Café geöffnet (Standard): das Team ist da. Geschlossen gehen Wartende ohne Bestellung, das Team geht nach hinten
   * hinaus (Putzkräfte wischen noch `CROWD.cleanAfterCloseSec`), und morgens kommt es wieder.
   */
  onDuty?: boolean;
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

/** Item-ID des Geschirrs, das von einer Bestellung übrig bleibt. */
export const dishOf = (item: string): string => `${item}-empty`;

/** Was ein Gerät auf die Ausgabe stellt (Item-ID). */
const itemOf = (station: string): string => PASS_ITEMS[station] ?? 'matcha';

export class CustomerCrowd {
  readonly agents: Agent[] = [];
  readonly waiters: Waiter[] = [];
  readonly cleaners: Cleaner[] = [];
  readonly baristas: Barista[] = [];
  readonly cashiers: Cashier[] = [];
  /** Dreckige Tische (Index in `layout.tables`). */
  readonly dirty = new Set<number>();
  /**
   * Was auf der Ausgabe steht (Stations-IDs, älteste zuerst): Baristas stellen ab, Bedienungen bzw. Gäste nehmen
   * je Bestellung eins mit. Nur Optik.
   */
  readonly passItems: string[] = [];
  /** Je Tisch und Platz: Bestellung oder Geschirr auf der Tischplatte. */
  readonly tableItems: [TableItem | null, TableItem | null][];
  /** Zurückgebrachtes Geschirr auf der Rückgabe (älteste zuerst) und wie lange es dort steht. */
  readonly returnItems: { item: string; age: number }[] = [];
  /** Fahrzeuge je Parkplatz-Platz (`PARKING_LOT.slots`). */
  readonly vehicles: LotVehicle[] = PARKING_LOT.slots.map((_, slot) => ({
    slot,
    state: 'free' as VehicleState,
    t: 0,
    variant: 0,
    owner: -1,
  }));
  /** Ausbaustufe des Parkplatzes in diesem Schritt. */
  private parkingLevel = 0;
  /** Vorlauf (Sekunden) eines Gasts mit Fahrzeug bis an die Kasse, je Ausbaustufe zwischengespeichert. */
  private readonly vehicleLeadCache = new Map<number, number>();
  /** Weg (Kacheln) vom Aussteigen bis dorthin, wo sich ein Gast vom Parkplatz anstellt, je Platz. */
  private readonly approachCache = new Map<number, number>();
  /** Künftige Zahlungen, die schon einem Gast zu Fuß zugeteilt sind (er kommt rechtzeitig vom Gehweg). */
  private pedReserved = 0;
  private readonly queue: Agent[] = [];
  /** Gäste mit Fahrzeug, die noch nicht in der Schlange sind (`arrive`, `approach`). */
  private readonly inbound: Agent[] = [];
  private readonly serviceQueue: Agent[] = [];
  private readonly seatTaken: [boolean, boolean][];
  private readonly stoolTaken: boolean[];
  /** Sekunden vom Auftauchen auf dem Gehweg bis an die Kasse … */
  private readonly walkSec: number;
  /** … plus Vorlauf (`CROWD.payLeadSec`). */
  private readonly leadSec: number;
  /** Derselbe Weg in Kacheln: So nah an der Kasse stellt sich ein Gast vom Parkplatz an. */
  private readonly walkInTiles: number;
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
  /** Keine Bedienung im Dienst: Gäste holen selbst ab und bringen ihr Geschirr zurück. */
  private selfService = true;
  /** Sichtbare Baristas in diesem Schritt (ohne Baristas kommt „irgendwas“ ohne Warten auf die Ausgabe). */
  private baristasOn = 0;
  /** Was zuletzt gemacht wurde (Item-ID), falls etwas ohne Ausgabe gebracht wird. */
  private lastItem = 'matcha';
  /** Sekunden seit Ladenschluss (Putzkräfte wischen noch eine Weile). */
  private closedSec = 0;
  /** Erster Schritt (Szenenstart): das Team steht schon an seinen Plätzen, statt hereinzukommen. */
  private first = true;

  constructor(
    private readonly layout: CafeLayout,
    locationId: string,
    private readonly rng: () => number = Math.random,
  ) {
    this.shares = customerTypeShares(locationId);
    this.seatTaken = layout.tables.map(() => [false, false]);
    this.tableItems = layout.tables.map(() => [null, null]);
    this.stoolTaken = layout.bar.stools.map(() => false);
    this.nav = new CafeNav(layout);
    this.walkSec = walkInSec(layout, this.nav);
    this.leadSec = this.walkSec + CROWD.payLeadSec;
    this.walkInTiles = this.walkSec * CROWD.walkTilesPerSec;
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
        pickup: false,
        waited: 0,
        jx: 0,
        jy: 0,
        goal: { x: 0, y: 0 },
        pace: 1,
        fade: 1,
        item: null,
        carry: null,
        vehicle: -1,
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
        tray: [],
        table: -1,
        fade: 1,
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
        fade: 1,
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
        fade: 1,
      });
    }
    layout.order.cashierSpots.slice(0, CROWD.maxCashiers).forEach((home, i) => {
      this.cashiers.push({
        id: i,
        active: false,
        phase: 'idle',
        home,
        x: home.x,
        y: home.y,
        path: [],
        timer: 0,
        fade: 1,
      });
    });
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
    const onDuty = input.onDuty ?? true;
    this.closedSec = onDuty ? 0 : this.closedSec + dt;
    this.totalRate = onDuty ? Math.max(0, input.served) : 0;
    const shown = new Set(visibleTables(this.layout, input.tables, input.terrace ?? 0));
    this.tableShown = this.layout.tables.map((t) => shown.has(t));
    this.tablesVisible = shown.size;
    this.nav.setVisible(this.tableShown, input.ambience);
    this.collectStanding();
    this.selfService = !onDuty || Math.floor(Math.max(0, input.waiters)) <= 0;
    this.baristasOn = onDuty ? (input.baristas ?? []).length : 0;
    this.setParking(input.parking ?? 0);
    this.updateVehicles(dt);

    const till = onDuty ? input.till : undefined;
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
      const viaVehicle = this.rng() < this.vehicleShare ? this.pickSlot() : -1;
      if (viaVehicle >= 0 ? this.spawnVehicle(viaVehicle) : this.spawn()) spawned++;
    }
    if (this.totalRate <= 0) this.overflow = 0;
    // Wer auf der Tafel wartet, kommt nach, sobald in der Schlange Platz ist.
    while (this.overflow > 0 && this.queue.length < this.queueCap && this.spawn()) {
      this.overflow--;
      spawned++;
    }
    // Ladenschluss: wer noch nicht bestellt hat, geht wieder.
    if (!onDuty) this.closeQueue();

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
    if (this.selfService) this.selfServe(purchases);
    this.updateWaiters(dt, onDuty ? input.waiters : 0, purchases);
    this.updateCleaners(
      dt,
      onDuty || this.closedSec < CROWD.cleanAfterCloseSec ? input.cleaners : 0,
      input.cleanliness,
    );
    this.updateBaristas(dt, onDuty ? (input.baristas ?? []) : [], input.prepSec ?? 0);
    this.updateCashiers(dt, onDuty ? (input.cashiers ?? 0) : 0);
    this.ageDishes(dt);
    this.first = false;
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
    let spawned = 0;
    // Wer noch hereinkommt, steht nicht an der Theke: die Schlange darf um die Gäste unterwegs länger sein.
    this.queueCap = CROWD.maxQueueFigures + Math.ceil(rate * this.walkSec);
    // Szenenstart: wer bezahlt, bevor ein neuer Gast vom Gehweg da wäre, steht schon an.
    let inside = warm
      ? Math.min(CROWD.maxQueueFigures, Math.floor(Math.max(0, progress) + rate * this.walkSec))
      : 0;
    // Zu Fuß: so viele, dass zu jeder Zahlung im Vorlauf jemand da ist. Gäste vom Parkplatz zählen erst, wenn sie
    // sich angestellt haben (dann sind sie so nah wie ein Gast vom Gehweg).
    while (this.queue.length + this.overflow < due) {
      if (this.queue.length >= this.queueCap) {
        if (this.overflow >= CROWD.maxQueueOverflow) break;
        this.overflow++;
        continue;
      }
      if (!this.spawn(inside > 0)) break;
      if (this.pedReserved > 0) this.pedReserved--;
      inside--;
      spawned++;
    }
    // Gäste mit Fahrzeug sind länger unterwegs (einparken, vom Parkplatz zu Fuß): Sie kommen für spätere Zahlungen.
    // Jede Zahlung im längeren Vorlauf wird einmal ausgewürfelt: mit Fahrzeug (jetzt losfahren) oder zu Fuß
    // (kommt rechtzeitig vom Gehweg, `pedReserved`). Zahlungen, die schon zu nah sind (Szenenstart, plötzlich mehr
    // Gäste), übernehmen Gäste zu Fuß.
    if (this.vehicleShare > 0) {
      const lead = this.vehicleLeadSec();
      const dueV = Math.floor(Math.max(0, progress) + rate * lead);
      const assigned = (): number =>
        this.queue.length + this.inbound.length + this.overflow + this.pedReserved;
      this.pedReserved = clamp(
        this.pedReserved,
        0,
        Math.max(0, dueV - this.queue.length - this.inbound.length - this.overflow),
      );
      while (assigned() < dueV) {
        const inSec = (assigned() + 1 - Math.max(0, progress)) / rate;
        const slot =
          inSec >= lead - CROWD.payLeadSec && this.rng() < this.vehicleShare ? this.pickSlot() : -1;
        if (slot >= 0 && this.spawnVehicle(slot)) {
          spawned++;
          continue;
        }
        this.pedReserved++;
      }
    }
    return spawned;
  }

  /** Anteil der Gäste, die bei dieser Ausbaustufe mit dem Fahrzeug kommen (wenn ein Platz frei ist). */
  private get vehicleShare(): number {
    return PARKING_CROWD.vehicleShare[this.parkingLevel] ?? 0;
  }

  /**
   * Vorlauf eines Gasts mit Fahrzeug bis zu seiner Zahlung (je Ausbaustufe): längstes Einparken plus Weg bis dorthin,
   * wo er sich anstellt (im Tempo der Langsamsten, damit er vor seiner Zahlung in der Schlange ist), plus der Vorlauf
   * eines Gasts vom Gehweg.
   */
  private vehicleLeadSec(): number {
    const have = this.vehicleLeadCache.get(this.parkingLevel);
    if (have !== undefined) return have;
    const slowest = CROWD.walkTilesPerSec * (1 - CROWD.paceSpread);
    let lead = this.leadSec;
    PARKING_LOT.slots.forEach((slot, i) => {
      if (this.parkingLevel < slot.minLevel) return;
      lead = Math.max(lead, parkSec(slot) + this.approachTiles(i) / slowest + this.leadSec);
    });
    this.vehicleLeadCache.set(this.parkingLevel, lead);
    return lead;
  }

  /** Weg vom Aussteigen am Platz `slot` bis dorthin, wo sich der Gast anstellt (Kacheln, zwischengespeichert). */
  private approachTiles(slot: number): number {
    const have = this.approachCache.get(slot);
    if (have !== undefined) return have;
    const place = PARKING_LOT.slots[slot];
    if (!place) return 0;
    const exit = exitPoint(place);
    const walk = pathLength(exit, this.nav.path('guest', exit, this.firstSlot));
    const tiles = Math.max(0, walk - this.walkInTiles);
    this.approachCache.set(slot, tiles);
    return tiles;
  }

  /** Erster Schlangenplatz (vor der Kasse). */
  private get firstSlot(): GridPos {
    return this.layout.order.queue[0] ?? this.layout.order.access;
  }

  /**
   * Neue Ausbaustufe: Plätze, die es nicht (mehr) gibt, werden frei (wer noch darin sitzt, ist weg; wer schon
   * ausgestiegen ist, geht zu Fuß weiter); Vorläufe neu rechnen.
   */
  private setParking(level: number): void {
    const lvl = Math.max(0, Math.floor(Number.isFinite(level) ? level : 0));
    if (lvl === this.parkingLevel) return;
    this.parkingLevel = lvl;
    this.vehicleLeadCache.clear();
    this.vehicles.forEach((v) => {
      const slot = PARKING_LOT.slots[v.slot];
      if (!slot || lvl >= slot.minLevel) return;
      v.state = 'free';
      v.owner = -1;
      v.t = 0;
    });
    for (const a of this.agents) {
      const slot = a.active && a.vehicle >= 0 ? PARKING_LOT.slots[a.vehicle] : undefined;
      if (!slot || lvl >= slot.minLevel) continue;
      a.vehicle = -1;
      if (a.phase === 'arrive') this.release(a);
    }
  }

  /** Ein- und Ausparken laufen ab; danach steht das Fahrzeug bzw. ist der Platz wieder frei. */
  private updateVehicles(dt: number): void {
    for (const v of this.vehicles) {
      if (v.state !== 'arriving' && v.state !== 'leaving') continue;
      const slot = PARKING_LOT.slots[v.slot];
      v.t += dt;
      if (!slot || v.t < parkSec(slot)) continue;
      v.t = 0;
      if (v.state === 'arriving') v.state = 'parked';
      else {
        v.state = 'free';
        v.owner = -1;
      }
    }
  }

  /**
   * Freier sichtbarer Platz für einen ankommenden Gast (−1 = keiner): Auto mit `carShare`, sonst Rad oder Roller;
   * ist von einer Sorte nichts frei, die andere.
   */
  private pickSlot(): number {
    const free = this.vehicles.filter((v) => {
      const slot = PARKING_LOT.slots[v.slot];
      return v.state === 'free' && slot !== undefined && this.parkingLevel >= slot.minLevel;
    });
    if (free.length === 0) return -1;
    const cars = free.filter((v) => PARKING_LOT.slots[v.slot]?.kind === 'car');
    const small = free.filter((v) => PARKING_LOT.slots[v.slot]?.kind !== 'car');
    const wantCar = cars.length > 0 && (small.length === 0 || this.rng() < PARKING_CROWD.carShare);
    const pool = wantCar ? cars : small;
    return pool[Math.floor(this.rng() * pool.length)]?.slot ?? -1;
  }

  /**
   * Gast kommt mit dem Fahrzeug auf Platz `slot`: es parkt ein, dann steigt der Gast aus, geht zur Tür und stellt
   * sich an (bis dahin nicht in der Schlange).
   */
  private spawnVehicle(slot: number): boolean {
    const v = this.vehicles[slot];
    const place = PARKING_LOT.slots[slot];
    if (!v || !place || v.state !== 'free') return false;
    const a = this.newGuest(false);
    if (!a) return false;
    this.inbound.push(a);
    const exit = exitPoint(place);
    a.vehicle = slot;
    a.phase = 'arrive';
    a.x = exit.x;
    a.y = exit.y;
    a.goal = exit;
    a.path = [];
    v.state = 'arriving';
    v.t = 0;
    v.owner = a.id;
    v.variant = Math.floor(this.rng() * 1000);
    return true;
  }

  /** Vom Parkplatz an der Tür angekommen: hinten anstellen, von hier zum eigenen Platz (wie ein Gast vom Gehweg). */
  private joinQueue(a: Agent): void {
    this.removeFrom(this.inbound, a);
    this.queue.push(a);
    a.phase = 'walkIn';
    a.goal = this.slotPos(a, this.queue.length - 1);
    a.path = this.nav.path('guest', a, a.goal, this.standing);
  }

  /** Geschlossen: Wartende ohne Bestellung gehen wieder (die Tafel leert sich), Gäste vom Parkplatz kehren um. */
  private closeQueue(): void {
    this.overflow = 0;
    this.pedReserved = 0;
    for (const a of [...this.inbound]) {
      this.removeFrom(this.inbound, a);
      // Wer noch im Fahrzeug sitzt, fährt gleich wieder.
      if (a.phase === 'arrive') this.release(a);
      else this.leave(a, this.sidewalkPoint());
    }
    for (const a of [...this.queue]) {
      this.removeFrom(this.queue, a);
      a.serveTotal = 0;
      this.leave(a, this.sidewalkPoint());
    }
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
    const free = this.newGuest(true);
    if (!free) return false;
    this.queue.push(free);
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
    free.path = this.nav.path('guest', free, slot, this.standing);
    return true;
  }

  /**
   * Freie Figur als neuer Gast (Typ, Aussehen, Tempo; unsichtbar, ohne Weg), `null` bei vollem Pool.
   * `fromSidewalk`: taucht seitlich auf dem Gehweg auf und geht direkt durch die Tür zum eigenen Platz.
   */
  private newGuest(fromSidewalk: boolean): Agent | null {
    const free = this.agents.find((a) => !a.active);
    if (!free || this.totalRate <= 0) return null;
    free.active = true;
    free.type = pickCustomerType(this.shares, this.rng());
    free.look = pickLook(free.type, this.rng());
    free.phase = 'walkIn';
    if (fromSidewalk) {
      const start = this.sidewalkPoint();
      free.x = start.x;
      free.y = start.y;
    }
    free.path = [];
    free.timer = 0;
    free.serveTotal = 0;
    free.table = -1;
    free.stool = -1;
    free.spot = 0;
    free.pickup = false;
    free.waited = 0;
    free.item = null;
    free.carry = null;
    free.vehicle = -1;
    free.jx = (this.rng() - 0.5) * CROWD.crowdSpread;
    free.jy = (this.rng() - 0.5) * CROWD.crowdSpread;
    free.pace = 1 + (this.rng() * 2 - 1) * CROWD.paceSpread;
    free.fade = 0;
    return free;
  }

  /**
   * Wer schon da ist, stellt sich vor die, die noch hereinkommen (wer näher an der Tür auftaucht, ist früher an
   * der Kasse); die anderen planen ihren Platz unterwegs neu.
   */
  private overtake(a: Agent): void {
    const i = this.queue.indexOf(a);
    let j = i;
    while (j > 0 && COMING.includes(this.queue[j - 1]?.phase ?? 'queue')) j--;
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
      case 'arrive':
        // Steigt aus, sobald das Fahrzeug steht, und geht Richtung Kasse.
        if (this.vehicles[a.vehicle]?.state !== 'parked') return;
        a.phase = 'approach';
        a.path = this.nav.path('guest', a, this.firstSlot, this.standing);
        return;
      case 'approach':
        // Neben dem Fahrzeug einblenden; vor der Tür (so nah wie ein Gast vom Gehweg) hinten anstellen.
        a.fade = Math.min(1, a.fade + step / CROWD.fadeTiles);
        if (follow(a, step) || pathLength(a, a.path) <= this.walkInTiles) this.joinQueue(a);
        return;
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
        if (!follow(a, step)) return;
        // Selbstbedienung: Bestellung abstellen und hinsetzen; sonst auf die Bedienung warten.
        if (a.carry !== null) {
          this.placeOnTable(a.table, a.seat, a.carry);
          a.carry = null;
          this.sitDown(a);
          return;
        }
        a.phase = 'waitServe';
        a.waited = 0;
        this.serviceQueue.push(a);
        return;
      case 'toPickup':
        if (follow(a, step)) {
          a.phase = 'waitServe';
          a.waited = 0;
          this.serviceQueue.push(a);
        }
        return;
      case 'waitServe':
        a.waited += dt;
        // Keine Bedienung in Sicht: der Gast bekommt seine Bestellung „über die Theke“ (nur Optik).
        if (a.waited > CROWD.maxServiceWaitSec)
          this.completeService(a, purchases, this.takePassItem(true));
        return;
      case 'toStool':
        if (follow(a, step)) {
          a.carry = null;
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
      case 'toReturn':
        if (follow(a, step)) {
          a.phase = 'returnDishes';
          a.timer = CROWD.returnSec;
        }
        return;
      case 'returnDishes':
        a.timer -= dt;
        if (a.timer > 0) return;
        if (a.carry !== null) this.returnItems.push({ item: a.carry, age: 0 });
        if (this.returnItems.length > CROWD.returnItemsMax) this.returnItems.shift();
        a.carry = null;
        this.leave(a, this.sidewalkPoint());
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

  /**
   * Nach dem Bestellen um die Ecke: Platz am Tisch, wenn einer frei ist und der Gast bleiben will (mit Bedienung
   * direkt hin, sonst erst zur Ausgabe), sonst Abholung an der Ausgabe.
   */
  private afterOrder(a: Agent): void {
    const seat = this.rng() < CROWD.dineInShare ? this.pickSeat() : null;
    if (seat) {
      const table = this.layout.tables[seat.table];
      const taken = this.seatTaken[seat.table];
      if (table && taken) {
        taken[seat.seat] = true;
        a.table = seat.table;
        a.seat = seat.seat;
        if (!this.selfService) {
          a.phase = 'toSeat';
          a.path = this.nav.path('guest', a, table.seats[seat.seat], this.standing);
          return;
        }
      }
    }
    if (!seat) a.table = -1;
    const spots = this.layout.pickup.spots;
    a.spot = this.pickSpot();
    a.pickup = true;
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
          o.pickup &&
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

  /** Freier Platz an einem sichtbaren Tisch, lieber einer ohne stehengelassenes Geschirr. */
  private pickSeat(): { table: number; seat: 0 | 1 } | null {
    const clean: { table: number; seat: 0 | 1 }[] = [];
    const any: { table: number; seat: 0 | 1 }[] = [];
    for (let t = 0; t < this.layout.tables.length; t++) {
      const taken = this.seatTaken[t];
      if (!taken || !this.tableShown[t]) continue;
      for (const s of [0, 1] as const) {
        if (taken[s]) continue;
        any.push({ table: t, seat: s });
        if (!this.tableItems[t]?.[s]) clean.push({ table: t, seat: s });
      }
    }
    const pool = clean.length > 0 ? clean : any;
    if (pool.length === 0) return null;
    return pool[Math.floor(this.rng() * pool.length)] ?? null;
  }

  /** Selbstbedienung: der erste Wartende an der Ausgabe nimmt, was fertig ist (ohne Baristas sofort). */
  private selfServe(purchases: Agent[]): void {
    const next = this.serviceQueue.find((a) => a.pickup);
    if (!next) return;
    const item = this.takePassItem(next.waited > CROWD.passWaitMaxSec);
    if (item !== null) this.completeService(next, purchases, item);
  }

  /**
   * Nächstes Fertiges von der Ausgabe (Item-ID). Ist nichts da: mit `force` (oder ohne Baristas) kommt trotzdem
   * etwas – das, was zuletzt gemacht wurde –, sonst `null` (weiter warten).
   */
  private takePassItem(force: boolean): string | null {
    const station = this.passItems.shift();
    if (station !== undefined) return itemOf(station);
    if (force || this.baristasOn === 0) return this.lastItem;
    return null;
  }

  /** Bestellung ist da: am Tisch abgestellt (Bedienung), zum Tisch getragen (Selbstbedienung) oder mitgenommen. */
  private completeService(a: Agent, purchases: Agent[], item: string | null): void {
    this.removeFrom(this.serviceQueue, a);
    purchases.push(a);
    const it = item ?? this.lastItem;
    a.item = it;
    if (a.table >= 0) {
      const seat = this.layout.tables[a.table]?.seats[a.seat];
      if (a.pickup && seat) {
        // Selbst abgeholt: mit dem Tablett in der Hand an den reservierten Platz.
        a.pickup = false;
        a.carry = it;
        a.phase = 'toSeat';
        a.path = this.nav.path('guest', a, seat, this.standing);
        return;
      }
      a.pickup = false;
      this.placeOnTable(a.table, a.seat, it);
      this.sitDown(a);
      return;
    }
    a.pickup = false;
    a.carry = it;
    // Mit dem Getränk auf einen freien Barhocker, sonst mit dem Becher hinaus.
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

  private sitDown(a: Agent): void {
    a.phase = 'consume';
    a.timer = CROWD.dwellMinSec + this.rng() * (CROWD.dwellMaxSec - CROWD.dwellMinSec);
  }

  /** Bestellung auf die Tischplatte vor dem Platz (ersetzt dort stehengelassenes Geschirr). */
  private placeOnTable(table: number, seat: 0 | 1, item: string): void {
    const slots = this.tableItems[table];
    if (slots) slots[seat] = { item, empty: false, age: 0 };
  }

  private leaveStool(a: Agent): void {
    this.stoolTaken[a.stool] = false;
    a.stool = -1;
    this.leave(a, this.sidewalkPoint());
  }

  /**
   * Aufstehen: Mit Bedienungen bleibt das Geschirr stehen (sie räumen ab), in Selbstbedienung nimmt der Gast es mit
   * zur Rückgabe.
   */
  private leaveTable(a: Agent): void {
    const table = this.layout.tables[a.table];
    const taken = this.seatTaken[a.table];
    if (taken) taken[a.seat] = false;
    if (table && this.dirty.size < this.desiredDirty) this.dirty.add(a.table);
    const slots = this.tableItems[a.table];
    const mine = slots?.[a.seat] ?? null;
    if (slots && mine) {
      if (this.selfService) {
        slots[a.seat] = null;
        a.carry = dishOf(mine.item);
        a.table = -1;
        a.phase = 'toReturn';
        a.path = this.nav.path('guest', a, this.layout.pickup.returnSpot, this.standing);
        return;
      }
      mine.empty = true;
      mine.age = 0;
    }
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

  /** Direkt von hier zu einem Punkt auf dem Gehweg (bzw. zum eigenen Fahrzeug), dort ausblenden. */
  private leave(a: Agent, to: GridPos): void {
    const place = a.vehicle >= 0 ? PARKING_LOT.slots[a.vehicle] : undefined;
    a.phase = 'leave';
    a.path = this.nav.path('guest', a, place ? exitPoint(place) : to, this.standing);
  }

  /**
   * Stehende Figuren dieses Schritts, um die neue Wege herumführen: wartende Abholer, servierende Bedienungen,
   * wischende Putzkräfte. (Die Schlange, Stühle und Hocker kennt die Wegsuche selbst.)
   */
  private collectStanding(): void {
    const s = this.standing;
    s.length = 0;
    for (const a of this.agents)
      if (
        a.active &&
        a.stool < 0 &&
        ((a.pickup && a.phase === 'waitServe') || a.phase === 'returnDishes')
      )
        s.push(a);
    for (const w of this.waiters)
      if (w.active && (w.phase === 'serve' || w.phase === 'clear')) s.push(w);
    for (const c of this.cleaners)
      if (c.active && (c.phase === 'wipe' || c.phase === 'mop')) s.push(c);
  }

  /**
   * Geschirr altert: Auf der Rückgabe räumt es nach `returnKeepSec` jemand weg; ohne Bedienung verschwindet
   * stehengelassenes Geschirr irgendwann von den Tischen (nur Optik).
   */
  private ageDishes(dt: number): void {
    for (const r of this.returnItems) r.age += dt;
    while ((this.returnItems[0]?.age ?? 0) > CROWD.returnKeepSec) this.returnItems.shift();
    const waiters = this.waiters.some((w) => w.active && w.phase !== 'off');
    this.tableItems.forEach((slots, t) => {
      for (const s of [0, 1] as const) {
        const it = slots[s];
        if (!it) continue;
        if (!this.tableShown[t]) {
          slots[s] = null;
          continue;
        }
        if (!it.empty) continue;
        it.age += dt;
        if (!waiters && it.age > CROWD.dishesMaxSec) slots[s] = null;
      }
    });
  }

  private desiredDirtyCache = { cleanliness: -1, tables: -1, value: 0 };
  private get desiredDirty(): number {
    return this.desiredDirtyCache.value;
  }

  /** Ausgang des Personals: hinten am Lager (Personal-Bereich). */
  private get staffExit(): GridPos {
    return this.layout.storage.fetchSpot;
  }

  /**
   * Bedienungen: holen Fertiges von der Ausgabe aufs Tablett (`pickup`), bringen es an den Tisch (`toTable`) und
   * stellen es vor den Gast (`serve`) bzw. reichen es Abholern über die Theke; ist niemand zu bedienen, räumen sie
   * Geschirr ab (`toClear`, `clear`) und stellen es hinter der Ausgabe in die Spüle (`stash`). Nach Ladenschluss
   * (oder entlassen) gehen sie nach hinten hinaus (`off`), morgens kommen sie herein (`arrive`).
   */
  private updateWaiters(dt: number, hired: number, purchases: Agent[]): void {
    const visible = Math.min(CROWD.maxWaiters, Math.max(0, Math.floor(hired)));
    const step = CROWD.staffTilesPerSec * dt;
    this.waiters.forEach((w, i) => {
      const home = this.layout.pickup.waiterHomes[i] ?? { x: w.x, y: w.y };
      if (i >= visible) {
        if (w.active) this.waiterOff(w, step);
        return;
      }
      if (!w.active || w.phase === 'off') {
        this.staffArrive(w, home, 'staff', i);
        w.phase = 'arrive';
        w.target = -1;
        w.table = -1;
        w.tray = [];
      }
      switch (w.phase) {
        case 'arrive':
          if (this.arriving(w, dt, step)) w.phase = 'idle';
          return;
        case 'idle': {
          // Stapelt sich Geschirr auf vielen Tischen, wird erst abgeräumt (sonst finden Gäste keinen sauberen Platz).
          if (this.dishTables() >= CROWD.clearFirstTables && this.goClear(w)) return;
          const free = this.serviceQueue.find(
            (a) => !this.waiters.some((o) => o !== w && o.target === a.id),
          );
          if (free) {
            const item = this.takePassItem(free.waited > CROWD.passWaitMaxSec);
            if (item === null) return;
            w.target = free.id;
            w.tray = [item];
            w.phase = 'pickup';
            w.timer = CROWD.pickupSec;
            return;
          }
          this.goClear(w);
          return;
        }
        case 'pickup': {
          w.timer -= dt;
          if (w.timer > 0) return;
          const a = this.agents[w.target];
          if (!a?.active || a.phase !== 'waitServe') {
            // Der Gast ist schon weg: zurück auf die Ausgabe damit.
            w.tray = [];
            w.target = -1;
            w.phase = 'idle';
            return;
          }
          if (a.pickup) {
            // Abholung: Übergabe über die Theke, ohne Weg.
            w.phase = 'serve';
            w.timer = CROWD.handoverSec;
            return;
          }
          const table = this.layout.tables[a.table];
          const seat = table?.seats[a.seat];
          if (!table || !seat) {
            w.phase = 'idle';
            return;
          }
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
          if (a?.active && a.phase === 'waitServe')
            this.completeService(a, purchases, w.tray[0] ?? null);
          w.target = -1;
          w.tray = [];
          this.waiterHome(w, home);
          return;
        }
        case 'toClear':
          if (follow(w, step)) {
            w.phase = 'clear';
            w.timer = CROWD.clearSec;
          }
          return;
        case 'clear': {
          w.timer -= dt;
          if (w.timer > 0) return;
          const slots = this.tableItems[w.table];
          if (slots)
            for (const s of [0, 1] as const) {
              const it = slots[s];
              if (it?.empty) {
                w.tray.push(dishOf(it.item));
                slots[s] = null;
              }
            }
          w.table = -1;
          this.waiterHome(w, home);
          return;
        }
        case 'back':
          if (!follow(w, step)) return;
          if (w.tray.length > 0) {
            w.phase = 'stash';
            w.timer = CROWD.stashSec;
            return;
          }
          w.phase = 'idle';
          return;
        case 'stash':
          w.timer -= dt;
          if (w.timer > 0) return;
          w.tray = [];
          w.phase = 'idle';
          return;
      }
    });
  }

  /** Zurück an den eigenen Platz hinter der Ausgabe (von der Terrasse durch die Tür), nicht den Hinweg rückwärts. */
  private waiterHome(w: Waiter, home: GridPos): void {
    if (Math.hypot(w.x - home.x, w.y - home.y) < 1e-6) {
      w.phase = w.tray.length > 0 ? 'stash' : 'idle';
      w.timer = CROWD.stashSec;
      return;
    }
    w.phase = 'back';
    w.path = this.nav.path('staff', w, home, this.standing);
  }

  /** Sichtbare Tische mit stehengelassenem Geschirr. */
  private dishTables(): number {
    let n = 0;
    this.tableItems.forEach((slots, t) => {
      if (this.tableShown[t] && slots.some((it) => it?.empty)) n++;
    });
    return n;
  }

  /** Abräumen: zum nächsten Tisch mit stehengelassenem Geschirr, den keine andere Bedienung ansteuert. */
  private goClear(w: Waiter): boolean {
    let best = -1;
    let bestD = Infinity;
    this.tableItems.forEach((slots, t) => {
      if (!this.tableShown[t] || !slots.some((it) => it?.empty)) return;
      if (this.waiters.some((o) => o !== w && o.table === t)) return;
      const tile = this.layout.tables[t]?.tile;
      if (!tile) return;
      const d = Math.hypot(tile.x - w.x, tile.y - w.y);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    });
    const table = best < 0 ? undefined : this.layout.tables[best];
    if (!table) return false;
    w.table = best;
    w.phase = 'toClear';
    const at = this.nav.standSpot('staff', table.tile, NAV.wipeDist, w, table.side);
    w.path = this.nav.path('staff', w, at, this.standing);
    return true;
  }

  /** Feierabend bzw. entlassen: nach hinten hinaus und ausblenden; was auf dem Tablett stand, bleibt stehen. */
  private waiterOff(w: Waiter, step: number): void {
    if (w.phase !== 'off') {
      w.target = -1;
      w.table = -1;
      w.tray = [];
      w.phase = 'off';
      w.path = this.nav.path('staff', w, this.staffExit, this.standing);
    }
    if (this.leaving(w, step)) w.active = false;
  }

  /** Erscheint am Personal-Ausgang (bzw. auf dem Gehweg) und geht zu `home`; morgens nacheinander. */
  private staffArrive(
    s: { active: boolean; x: number; y: number; path: GridPos[]; timer: number; fade: number },
    home: GridPos,
    role: 'staff' | 'back' | 'guest',
    index: number,
  ): void {
    s.active = true;
    if (this.first) {
      // Szenenstart: schon da.
      s.x = home.x;
      s.y = home.y;
      s.fade = 1;
      s.timer = 0;
      s.path = [];
      return;
    }
    const from = role === 'guest' ? this.sidewalkPoint() : this.staffExit;
    s.x = from.x;
    s.y = from.y;
    s.fade = 0;
    s.timer = index * CROWD.arriveStaggerSec;
    s.path = this.nav.path(role, from, home, this.standing);
  }

  /** Kommt herein: wartet versetzt, blendet ein und geht; true, wenn angekommen. */
  private arriving(
    s: { x: number; y: number; path: GridPos[]; timer: number; fade: number },
    dt: number,
    step: number,
  ): boolean {
    if (s.timer > 0) {
      s.timer -= dt;
      return false;
    }
    s.fade = Math.min(1, s.fade + step / CROWD.fadeTiles);
    if (!follow(s, step)) return false;
    s.fade = 1;
    return true;
  }

  /** Geht hinaus und blendet auf dem letzten Stück aus; true, wenn weg. */
  private leaving(
    s: { x: number; y: number; path: GridPos[]; fade: number },
    step: number,
  ): boolean {
    const done = follow(s, step);
    s.fade = Math.min(s.fade, Math.min(1, pathLength(s, s.path) / CROWD.fadeTiles));
    return done;
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
        if (!c.active) return;
        // Feierabend bzw. entlassen: durch die Tür auf den Gehweg und ausblenden.
        if (c.phase !== 'off') {
          c.table = -1;
          c.phase = 'off';
          c.path = this.nav.path('guest', c, this.sidewalkPoint(), this.standing);
        }
        if (this.leaving(c, step)) c.active = false;
        return;
      }
      if (!c.active || c.phase === 'off') {
        this.staffArrive(c, spot, 'guest', i);
        c.phase = 'arrive';
        c.table = -1;
      }
      if (c.phase === 'arrive') {
        if (this.arriving(c, dt, step)) {
          c.phase = 'idle';
          c.timer = this.rest(i);
        }
        return;
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
   * Baristas (kosmetisch): je sichtbarem Gerät einer; bereitet zu, bringt das Fertige zur Ausgabe, stellt es ab,
   * geht zurück. Wechselt ein Platz das Gerät (neues Gerät gekauft), beginnt die Figur dort neu. Nach Ladenschluss
   * gehen sie nach hinten hinaus, morgens kommen sie von dort an ihre Geräte.
   */
  private updateBaristas(dt: number, posts: readonly BaristaPost[], prepSec: number): void {
    const step = CROWD.staffTilesPerSec * dt;
    const drop = this.layout.pickup.baristaDrop;
    this.baristas.forEach((b, i) => {
      const post = posts[i];
      if (!post) {
        if (!b.active) return;
        b.workTotal = 0;
        if (b.phase !== 'off') {
          b.phase = 'off';
          b.path = this.nav.path('back', b, this.staffExit);
        }
        if (this.leaving(b, step)) b.active = false;
        return;
      }
      if (!b.active || b.phase === 'off') {
        b.station = post.station;
        b.home = { ...post.home };
        this.staffArrive(b, b.home, 'back', i);
        b.phase = 'arrive';
        b.workTotal = 0;
      } else if (b.station !== post.station) {
        // Neues Gerät an diesem Platz: dort neu beginnen.
        b.station = post.station;
        b.home = { ...post.home };
        b.x = post.home.x;
        b.y = post.home.y;
        b.path = [];
        b.phase = 'idle';
        b.workTotal = 0;
      }
      switch (b.phase) {
        case 'arrive':
          if (this.arriving(b, dt, step)) b.phase = 'idle';
          return;
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
          this.lastItem = itemOf(b.station);
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

  /** Verkäufer: kommen morgens nacheinander an ihren Platz hinter der Kasse, gehen abends nach hinten hinaus. */
  private updateCashiers(dt: number, hired: number): void {
    const visible = Math.min(this.cashiers.length, Math.max(0, Math.floor(hired)));
    const step = CROWD.staffTilesPerSec * dt;
    this.cashiers.forEach((c, i) => {
      if (i >= visible) {
        if (!c.active) return;
        if (c.phase !== 'off') {
          c.phase = 'off';
          c.path = this.nav.path('back', c, this.staffExit);
        }
        if (this.leaving(c, step)) c.active = false;
        return;
      }
      if (!c.active || c.phase === 'off') {
        this.staffArrive(c, c.home, 'back', i);
        c.phase = 'arrive';
      }
      if (c.phase === 'arrive' && this.arriving(c, dt, step)) c.phase = 'idle';
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
    this.removeFrom(this.inbound, a);
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
    a.pickup = false;
    a.carry = null;
    // Mit dem Fahrzeug gekommen: es fährt jetzt weg – noch beim Einparken von der Stelle aus, an der es gerade ist.
    const v = a.vehicle >= 0 ? this.vehicles[a.vehicle] : undefined;
    const slot = PARKING_LOT.slots[a.vehicle];
    if (v && slot && v.owner === a.id) {
      v.t = v.state === 'arriving' ? Math.max(0, parkSec(slot) - v.t) : 0;
      v.state = 'leaving';
    }
    a.vehicle = -1;
    a.active = false;
    a.path = [];
  }
}

/** Phasen, in denen ein Gast noch nicht an seinem Platz ist (Wer schon da ist, stellt sich vor sie). */
const COMING: readonly CustomerPhase[] = ['walkIn'];

/** Agenten-Punkt neben einem Parkplatz-Platz, an dem der Gast aussteigt bzw. einsteigt (Grid → Agenten: −0,5). */
function exitPoint(slot: ParkingSlot): GridPos {
  const e = parkingExit(slot);
  return { x: e.x - 0.5, y: e.y - 0.5 };
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
