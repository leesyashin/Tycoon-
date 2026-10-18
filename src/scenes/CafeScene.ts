import Phaser from 'phaser';
import {
  getLayout,
  inRoom,
  layoutBounds,
  visibleTables,
  type CafeLayout,
  type DecorItem,
  type GridPos,
  type StationPlacement,
  type TablePlacement,
} from '@data/layouts';
import { STATIONS, REGISTER_ID, PRODUCT_LINES, getStationDef } from '@data/stations';
import { CROWD } from '@data/layouts';
import {
  CHAR_CARRY,
  CHAR_FRAMES,
  CHAR_LOW,
  CHAR_WALK,
  CHAR_WHISK,
  CHAR_WORK,
  HOLD_POINTS,
  figureOffset,
  workStepAt,
  type WorkPose,
  CUSTOMER_LOOKS,
  DECOR_BIG,
  DECOR_BIG_FRAMES,
  COUNTER_TOP_PX,
  FRONT_PLANTER_H,
  PASS_ITEMS,
  PASS_SLOTS,
  SCENE_FX,
  STOOL_SEAT_LIFT,
  STATION_FX,
  SUPPLY_CANVAS,
  SUPPLY_ITEMS,
  counterLookTier,
  counterPropsAt,
  decorFrame,
  roomLook,
  staffLookFor,
  stationLookTier,
  storageLookTier,
  tableLookTier,
  type LookTier,
  type StorageTier,
} from '@data/art';
import type { StaffRoleId } from '@data/staff';
import { DAY_CYCLE, UI_THEME } from '@data/ui';
import { getLocation, type GameState, type LocationState } from '@core/GameState';
import type { Store } from '@core/store';
import { computeLocationRates, mood, tapCafe, type LocationRates } from '@core/customers';
import { buyStation, getBulkCost, isStationUnlocked, needsTerrace } from '@core/economy';
import { getStaffLevel } from '@core/staff';
import { formatMoney } from '@core/math/format';
import { TIME } from '@data/time';
import { getEventOverlay } from '@core/events';
import { equippedSkinTints } from '@core/leaves';
import { getCafeClock } from '@core/time/dayCycle';
import { isOpenAt } from '@core/time/clock';
import { gradeInUse } from '@core/supply/stock';
import type { EventOverlay } from '@data/events';
import { Decimal } from '@core/math/bignum';
import { getLang, t } from '@i18n/index';
import {
  CustomerCrowd,
  type Agent,
  type BaristaPost,
  type Waiter,
  type WaiterPhase,
} from './agents/crowd';
import { CafeItems, ITEM_ORIGIN_Y } from './cafeItems';
import { CafeStreet, formatHour } from './cafeStreet';
import { CameraControls } from './cameraControls';
import { TAP_TARGET_KEY, ambienceTarget, pickTapTarget, tableTarget } from './tapTarget';
import { CityView } from './city/CityView';
import { ParkingView } from './city/ParkingView';
import { TILE_H, TILE_W, isoDepth, toGrid, toScreen } from './iso/iso';
import { ART_SCALE, ATLAS, CHAR_FOOT_ORIGIN_Y, CHAR_OVERLAY_Y, FRAME, atlasUrls } from './art';
import { REGISTRY, UI_EVENTS, getSceneCover, getStore } from './registry';

const WALL_H = 64;
const FRONT_WALL_H = 16;
/** Glaswände des Wintergartens (höher als die Vorderwand, durchsichtig). */
const GLASS_H = 40;
/** Jede wievielte Wandkachel ein Fenster hat. */
const WINDOW_EVERY = 3;
const STATION_TOP = 40;
const RATES_REFRESH_MS = 200;
const POPUP_POOL = 24;
const EMOTE_POOL = 8;
const LABEL_MAX_SCALE = 1.8;
/**
 * Rückwand-Geräte stehen dicht. In Originalgröße stehen ihre Labels als Treppe (je Kachel 16 px tiefer) frei;
 * beim Herauszoomen wachsen die Labels, dann sitzt jedes zweite um so viel höher (mal Label-Skalierung).
 */
const LABEL_STAGGER = 14;
/** Ab dieser Label-Skalierung (= herausgezoomt) wird versetzt. */
const LABEL_STAGGER_FROM = 1.05;
/** HUD-Geldsymbol in CSS-Pixeln vom linken oberen Rand (Ziel des fliegenden Geldscheins). */
const HUD_CASH = { x: 34, y: 34 };
/** Der Schein startet auf Handhöhe des Zahlenden (Weltpixel über dem Fußpunkt). */
const CASH_BILL_LIFT = 12;
const DEPTH = { wall: -2000, floor: -1000, label: 10_000, overlay: 20_000 } as const;
/** Getränk vor einem Barhocker: so weit zur Theke hin (Kacheln), an der Vorderkante der Platte. */
const STOOL_ITEM_BACK = 0.55;
/** Bedienungen strecken das Tablett vor (Aufnehmen, Abstellen, Abräumen, Wegstellen). */
const WAITER_HANDS: readonly WaiterPhase[] = ['pickup', 'serve', 'clear', 'stash'];
/** Deko, Musik und WLAN sind nur dort antippbar, wo sie sichtbar sind (Pixel-Test, ohne weiche Schatten). */
const TAP_PIXEL = {
  pixelPerfect: true,
  alphaTolerance: SCENE_FX.tapAlpha,
  useHandCursor: true,
} as const;

interface StationView {
  id: string;
  placement: StationPlacement;
  sprite: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  /** Label-Höhe ohne Versatz und ob es beim Herauszoomen versetzt wird (jedes zweite Rückwand-Gerät). */
  labelY: number;
  stagger: boolean;
  shownLevel: number;
  /** Gezeigter Hinweis am Bauplatz: kaufbar, Terrasse fehlt oder keiner (Level stehen nur im Panel). */
  shownLock: 'open' | 'terrace' | '';
  /** Gezeigte Skin-Tönung (0xffffff = keine). */
  shownTint: number;
  /** Ruhelage (die Mühle rüttelt bei der Arbeit). */
  baseX: number;
}

/** Effekt eines Geräts, solange daran gearbeitet wird (`STATION_FX`). */
interface StationFxView {
  stationId: string;
  emitter: Phaser.GameObjects.Particles.ParticleEmitter | null;
  /** Ofen: warmer Schein über dem Fenster (pulsiert). */
  glow: Phaser.GameObjects.Image | null;
  burst: boolean;
  /** Nächster Dampfstoß (Sekunden Szenenzeit). */
  nextBurst: number;
  running: boolean;
}

interface TableView {
  placement: TablePlacement;
  sprite: Phaser.GameObjects.Image;
  dirt: Phaser.GameObjects.Image;
}

/** Modul der Gästetheke (auch unter Kasse und Ausgabe). */
interface CounterView {
  /** Bildschirm-x der Kachel: Reihenfolge der Plopp-Welle (von links nach rechts). */
  order: number;
  sprite: Phaser.GameObjects.Image;
  /** Deko-Variante (`COUNTER_PROPS`), 0 unter einem Gerät. */
  variant: number;
  /** Gerade (Front nach +y), quer (Front nach +x) oder Eckmodul. */
  kind: 'a' | 'b' | 'corner';
}

/** Teil des Lagers (Regal, Palette); sichtbar und gefüllt nach der Lager-Stufe. */
interface StorageView {
  piece: 'corner' | 'rack' | 'stock';
  facesX: boolean;
  minTier: number;
  sprite: Phaser.GameObjects.Image;
}

interface StaffFigure {
  sprite: Phaser.GameObjects.Image;
  prev: { x: number; y: number };
  /** Letzte Blickrichtung (Hysterese beim Gehen), `null` = neu sichtbar. */
  look: Look | null;
}

/** Größe der Farbfilter (Event, Nacht): deckt jeden Kamera-Ausschnitt ab, egal wie weit gezoomt. */
const OVERLAY_SIZE = 20_000;

// Einmal abfragen, `matches` folgt Änderungen live (vorher lief `matchMedia` in jedem Frame).
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const reducedMotion = (): boolean => motionQuery.matches;
/** Rate pro Spielstunde → je echter Sekunde (geöffnet vergeht eine Spielminute je Sekunde). */
const perRealSec = (perHour: number): number => (perHour * TIME.openMinutesPerSec) / 60;

/** Lager-Stufe 1..3 aus einer Mindest-Stufe des Grundrisses. */
function storageTierAt(tier: number): StorageTier {
  return Math.min(3, Math.max(1, Math.trunc(tier))) as StorageTier;
}

type Look = { dir: 'front' | 'back'; flip: boolean };

/** Blickrichtung einer Figur aus einem Bewegungs-/Blickvektor im Grid. */
function facing(dx: number, dy: number): Look {
  if (Math.abs(dx) > Math.abs(dy)) return { dir: dx > 0 ? 'front' : 'back', flip: true };
  return { dir: dy >= 0 ? 'front' : 'back', flip: false };
}

/**
 * Blickrichtung beim Gehen mit Hysterese: Die Figuren haben nur vier Ansichten (entlang der Raster-Achsen); auf
 * schrägen Wegen und in Kurven bleibt die bisherige Ansicht, solange die Figur in diese Richtung vorankommt und die
 * andere Achse nicht deutlich überwiegt – sonst flackert sie auf jeder Diagonale zwischen zwei Ansichten.
 */
function walkFacing(prev: Look | null, dx: number, dy: number): Look {
  if (!prev) return facing(dx, dy);
  const sign = prev.dir === 'front' ? 1 : -1;
  const along = (prev.flip ? dx : dy) * sign;
  const across = Math.abs(prev.flip ? dy : dx);
  if (along > 0 && across < along * SCENE_FX.facingKeep) return prev;
  return facing(dx, dy);
}

export class CafeScene extends Phaser.Scene {
  private store!: Store;
  private layout!: CafeLayout;
  private locationId = '';
  /** Reset-Zähler des gezeigten Standorts; ändert er sich, wird der Raum neu aufgebaut. */
  private prestigeCount = 0;
  private crowd!: CustomerCrowd;
  private city!: CityView;
  private controls!: CameraControls;
  /** Neue Parkplatz-Stufe, die noch gezeigt werden will (Mitte des Platzes in Weltkoordinaten). */
  private parkingReveal: { x: number; y: number } | null = null;
  private stations: StationView[] = [];
  private tables: TableView[] = [];
  private counters: CounterView[] = [];
  /** Gezeigte Optik-Stufe der Theke (0 bis zum ersten Zeichnen). */
  private shownCounterTier = 0;
  private storage: StorageView[] = [];
  /** Gezeigte Lager-Stufe (0 bis zum ersten Zeichnen). */
  private shownStorageTier = 0;
  /** Ware in der Hand der Baristas, die aus dem Lager kommen (je Barista ein Sprite). */
  private supplySprites: Phaser.GameObjects.Image[] = [];
  private sparkles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private agentSprites: Phaser.GameObjects.Image[] = [];
  private agentPrev: { x: number; y: number }[] = [];
  private agentLook: (Look | null)[] = [];
  private waiterFigures: StaffFigure[] = [];
  private cleanerFigures: StaffFigure[] = [];
  private cashierFigures: StaffFigure[] = [];
  private baristaFigures: StaffFigure[] = [];
  /** Sichtbare Baristas: je gekauftem Gerät einer (Reihenfolge der Produktlinien), höchstens so viele wie eingestellt. */
  private baristaPosts: BaristaPost[] = [];
  private stationFx: StationFxView[] = [];
  /** Ringe über Bestellendem, Baristas und wischenden Putzkräften (Pool, vorgerenderte Frames). */
  private ringPool: Phaser.GameObjects.Image[] = [];
  private passItemSprites: Phaser.GameObjects.Image[] = [];
  /** Getränk auf der Theke vor jedem Barhocker (sichtbar, solange dort jemand trinkt). */
  private stoolItems: Phaser.GameObjects.Image[] = [];
  /** Bezahlte Gäste laut `core` (`till.paid`) beim letzten Frame; neue Zahlungen = Differenz. */
  private lastPaid = 0;
  /** Kassenlade offen bis (Szenenzeit in ms), danach wieder zu. */
  private drawerUntil = 0;
  private drawerShown = false;
  private notes: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  /** Boden, Wände und Vorderwände des Raums: wechseln mit dem Deko-Level die Stufe (`roomLook`). */
  private floorTiles: { sprite: Phaser.GameObjects.Image; checker: 'a' | 'b' }[] = [];
  private wallTiles: { sprite: Phaser.GameObjects.Image; side: 'u' | 'v'; deco: boolean }[] = [];
  private frontTiles: { sprite: Phaser.GameObjects.Image; side: 'u' | 'v' }[] = [];
  private shownRoomLook = '';
  /** Lichtkegel unter den Pendelleuchten (tags schwach, nachts warm). */
  private lightPools: Phaser.GameObjects.Image[] = [];
  private cupSteam: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private cupSteamAcc = 0;
  private popups: Phaser.GameObjects.Text[] = [];
  private emotes: Phaser.GameObjects.Image[] = [];
  private cashFlying = 0;
  /** Bezahlte Gäste, deren Betrag noch nicht über der Kasse stand (bei vielen Zahlungen gebündelt). */
  private cashBatch = 0;
  private cashBatchAt: GridPos = { x: 0, y: 0 };
  /** Szenenzeit (ms) des letzten Betrags über der Kasse. */
  private cashPopupAt = -Infinity;
  private moreText!: Phaser.GameObjects.Text;
  private leaves!: Phaser.GameObjects.Particles.ParticleEmitter;
  private rates: LocationRates | null = null;
  private ratesAge = Infinity;
  private debugSpawn = 0;
  private room!: Phaser.Geom.Rectangle;
  private labelZoom = 0;
  private ambienceImages: Phaser.GameObjects.Image[] = [];
  private ambienceKey = '';
  /** −1 bis zum ersten Zeichnen; danach löst eine Änderung ein Kamera-Refit aus. */
  private terraceLevel = -1;
  private shownTables = -1;
  private moodSprites: Phaser.GameObjects.Image[] = [];
  private eventTint!: Phaser.GameObjects.Rectangle;
  private nightTint!: Phaser.GameObjects.Rectangle;
  private glows: Phaser.GameObjects.Image[] = [];
  private shownNight = -1;
  private board: { text: Phaser.GameObjects.Text; bg: Phaser.GameObjects.Graphics } | null = null;
  private shownQueue = -1;
  private walkClock = 0;
  private fx: Partial<
    Record<NonNullable<EventOverlay['particles']>, Phaser.GameObjects.Particles.ParticleEmitter>
  > = {};
  private overlayKey = '';
  /** Produkte auf Geräten, in Händen, auf Tabletts und Tischen, Geschirr auf der Rückgabe. */
  private items!: CafeItems;
  /** Schild an der Tür und Lieferwagen. */
  private street!: CafeStreet;
  /** Parkplatz neben dem Café mit den Fahrzeugen der Gäste. */
  private parking!: ParkingView;
  /** Zuletzt gezeigte Lieferungen und Kosten-Abbuchungen (neue zeigen Wagen bzw. „−Betrag“). */
  private lastDelivered = 0;
  private lastBills = 0;
  /** Hinweis über der Matcha-Station, wenn kein Matcha mehr da ist. */
  private matchaOut: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('CafeScene');
  }

  /** Läuft vor jedem `create`, auch bei `scene.restart()`: die Szene-Instanz bleibt dieselbe. */
  init(): void {
    this.stations = [];
    this.tables = [];
    this.counters = [];
    this.shownCounterTier = 0;
    this.storage = [];
    this.shownStorageTier = 0;
    this.supplySprites = [];
    this.agentSprites = [];
    this.agentPrev = [];
    this.agentLook = [];
    this.waiterFigures = [];
    this.cleanerFigures = [];
    this.cashierFigures = [];
    this.baristaFigures = [];
    this.baristaPosts = [];
    this.stationFx = [];
    this.ringPool = [];
    this.passItemSprites = [];
    this.stoolItems = [];
    this.lastPaid = 0;
    this.drawerUntil = 0;
    this.drawerShown = false;
    this.notes = null;
    this.floorTiles = [];
    this.wallTiles = [];
    this.frontTiles = [];
    this.shownRoomLook = '';
    this.lightPools = [];
    this.cupSteam = null;
    this.cupSteamAcc = 0;
    this.popups = [];
    this.emotes = [];
    this.cashFlying = 0;
    this.cashBatch = 0;
    this.cashPopupAt = -Infinity;
    this.rates = null;
    this.ratesAge = Infinity;
    this.labelZoom = 0;
    this.ambienceImages = [];
    this.ambienceKey = '';
    this.terraceLevel = -1;
    this.shownTables = -1;
    this.moodSprites = [];
    this.glows = [];
    this.shownNight = -1;
    this.board = null;
    this.shownQueue = -1;
    this.walkClock = 0;
    this.fx = {};
    this.overlayKey = '';
    this.lastDelivered = 0;
    this.lastBills = 0;
    this.matchaOut = null;
    this.parkingReveal = null;
  }

  /** Themen-Atlas nur für den aktiven Standort laden (Lazy-Loading je Standort). */
  preload(): void {
    const key = ATLAS.theme(getStore(this).getState().activeLocationId);
    if (this.textures.exists(key)) return;
    const u = atlasUrls(key);
    this.load.atlas(key, u.png, u.json);
  }

  create(): void {
    this.store = getStore(this);
    this.debugSpawn = Number(this.registry.get(REGISTRY.debugSpawn) ?? 0) || 0;
    const state = this.store.getState();
    this.locationId = state.activeLocationId;
    this.prestigeCount = getLocation(state, this.locationId).prestigeCount;
    // Nur Zahlungen ab jetzt zeigen (nicht alles, was vor dem Szenenstart bezahlt wurde).
    this.lastPaid = getLocation(state, this.locationId).till.paid;
    this.layout = getLayout(this.locationId);
    this.crowd = new CustomerCrowd(this.layout, this.locationId);

    // Stadtviertel zuerst: liegt komplett hinter dem Café (eigene, negative Tiefen).
    const n = this.layout.gridSize;
    const o = this.layout.origin;
    this.city = new CityView(
      this,
      this.locationId,
      { x0: o.x, y0: o.y, x1: n, y1: n },
      DEPTH.overlay - 1,
    );
    this.parking = new ParkingView(this, this.locationId);
    this.drawRoom();
    this.createCounter();
    this.createStorage();
    this.createStations();
    this.createTables();
    this.items = new CafeItems(this, this.layout);
    this.createAmbience(state);
    this.agentSprites = this.crowd.agents.map(() =>
      this.sprite(0, 0, FRAME.customer('student', CUSTOMER_LOOKS.student[0] ?? '', 'front', 0))
        .setOrigin(0.5, CHAR_FOOT_ORIGIN_Y)
        .setVisible(false),
    );
    this.agentPrev = this.crowd.agents.map(() => ({ x: 0, y: 0 }));
    this.agentLook = this.crowd.agents.map(() => null);
    this.moodSprites = this.crowd.agents.map(() =>
      this.sprite(0, 0, FRAME.mood('happy')).setOrigin(0.5, 1).setVisible(false),
    );
    this.createStaff();
    this.createRings();
    this.createPassItems();
    this.createStoolItems();
    for (let i = 0; i < EMOTE_POOL; i++) {
      this.emotes.push(
        this.sprite(0, 0, FRAME.emote('heart'))
          .setOrigin(0.5, 1)
          .setVisible(false)
          .setDepth(DEPTH.overlay),
      );
    }
    const e = this.world(this.layout.entrance);
    this.moreText = this.makeText(14, UI_THEME.textCss)
      .setPosition(e.x, e.y + TILE_H)
      .setDepth(DEPTH.overlay)
      .setVisible(false);
    this.leaves = this.add.particles(0, 0, ATLAS.common, {
      frame: FRAME.leaf,
      speed: { min: 40, max: 120 },
      angle: { min: 200, max: 340 },
      gravityY: 220,
      lifespan: 700,
      scale: ART_SCALE,
      alpha: { start: 1, end: 0 },
      rotate: { min: 0, max: 360 },
      emitting: false,
    });
    this.leaves.setDepth(DEPTH.overlay);
    this.sparkles = this.add.particles(0, 0, ATLAS.common, {
      frame: FRAME.sparkle,
      speed: { min: 30, max: 90 },
      angle: { min: 200, max: 340 },
      gravityY: 90,
      lifespan: 900,
      scale: { start: ART_SCALE * 1.5, end: 0 },
      alpha: { start: 1, end: 0 },
      emitting: false,
    });
    this.sparkles.setDepth(DEPTH.overlay);

    this.room = new Phaser.Geom.Rectangle();
    this.updateRoomBounds(getLocation(state, this.locationId).ambience['terrace'] ?? 0);
    this.createEventFx();
    this.createNight();
    const startLoc = getLocation(state, this.locationId);
    this.lastDelivered = startLoc.supply.delivered;
    this.lastBills = startLoc.bills.count;
    this.street = new CafeStreet(
      this,
      this.layout,
      (size, color) => this.makeText(size, color),
      DEPTH.label - 4,
      (x, y) => this.textPopup(x, y, t('scene.delivery'), UI_THEME.textCss),
    );
    this.createMatchaOut();
    this.createStationFx();
    this.createAmbientFx();
    // Schwenken über das Viertel, ohne je einen Rand zu sehen; die Startansicht passt auf den Raum (`fitCamera`).
    this.controls = new CameraControls(this, CityView.viewLimits());
    this.fitCamera();
    const onResize = (
      size: Phaser.Structs.Size,
      _base: Phaser.Structs.Size,
      _display: Phaser.Structs.Size,
      prevWidth: number,
      prevHeight: number,
    ): void => this.onResize(size, prevWidth, prevHeight);
    this.scale.on('resize', onResize);

    // Alle Objekte unter dem Finger melden, nicht nur das oberste: `onPointerUp` wählt das sichtbar getroffene.
    this.input.topOnly = false;
    this.input.on('pointerup', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) =>
      this.onPointerUp(p, over),
    );
    // Debug-Taste über das DOM: der schlanke Phaser-Build (src/phaserCustom.js) hat kein Keyboard-Plugin.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'b' || e.key === 'B') this.debugBuy();
    };
    if (import.meta.env.DEV) window.addEventListener('keydown', onKey);
    const onLang = (): void => this.relabel();
    this.game.events.on(UI_EVENTS.langChanged, onLang);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(UI_EVENTS.langChanged, onLang);
      this.scale.off('resize', onResize);
      window.removeEventListener('keydown', onKey);
    });
    this.refreshCounter(state, false);
    this.refreshStorage(state, false);
    this.refreshStations(state, false);
    this.refreshTables(state, false);
  }

  update(_time: number, deltaMs: number): void {
    const state = this.store.getState();
    // Standortwechsel oder Franchise-Reset: Raum, Ausstattung und Figuren komplett neu aufbauen.
    if (
      state.activeLocationId !== this.locationId ||
      getLocation(state, this.locationId).prestigeCount !== this.prestigeCount
    ) {
      this.scene.restart();
      return;
    }
    const dt = deltaMs / 1000;
    this.walkClock += dt;
    this.city.update(dt, reducedMotion());
    this.scaleLabels();
    this.ratesAge += deltaMs;
    if (!this.rates || this.ratesAge >= RATES_REFRESH_MS) {
      this.rates = computeLocationRates(state, this.locationId);
      this.ratesAge = 0;
      this.refreshCounter(state, true);
      this.refreshStorage(state, true);
      this.refreshStations(state, true);
      this.refreshTables(state, true);
      this.refreshParking(state);
      this.createAmbience(state);
      this.refreshStaff(state);
      this.refreshEventFx(state);
      this.refreshNight(state);
      this.refreshBoard();
    }
    if (this.parkingReveal) this.revealParking();
    const loc = getLocation(state, this.locationId);
    this.watchSupplyAndBills(loc);
    // Mit Debug-Spawn kommen mehr Figuren, als `core` bucht: dann bezahlen sie im eigenen Takt (nur Optik).
    const till = this.tillInput(loc);
    const open = isOpenAt(loc, state.clock);
    const { purchases, orders, payments } = this.crowd.update(dt, {
      served: this.visibleServed(this.rates),
      orderCap: perRealSec(this.rates.stages.order),
      waiters: getStaffLevel(loc, 'waiter'),
      cleaners: getStaffLevel(loc, 'cleaner'),
      cashiers: getStaffLevel(loc, 'cashier'),
      parking: loc.ambience['parking'] ?? 0,
      onDuty: open || this.debugSpawn > 0,
      tables: loc.ambience['seats'] ?? 0,
      terrace: loc.ambience['terrace'] ?? 0,
      ambience: loc.ambience,
      cleanliness: loc.cleanliness,
      baristas: this.baristaPosts,
      prepSec: this.prepSec(this.rates),
      till: this.debugSpawn > 0 ? undefined : till,
    });
    this.syncAgents(mood(loc.satisfaction));
    this.syncStaffFigures();
    this.syncBaristas();
    this.syncSupplies();
    this.syncCashiers();
    this.syncDirt();
    this.syncPassItems();
    this.syncStoolItems();
    this.items.sync(
      this.crowd,
      (i) => this.tables[i]?.sprite.visible ?? false,
      (img) => this.plop(img),
    );
    this.parking.sync(this.crowd.vehicles);
    this.syncStationFx(dt);
    this.drawRings();
    if (payments > 0) this.onPayments(payments, orders);
    this.flushCashPopup();
    this.syncDrawer();
    this.updateAmbientFx(dt);
    for (const a of purchases) this.onServed(a);
    const hidden = this.crowd.hiddenCount;
    this.moreText.setVisible(hidden > 0);
    if (hidden > 0) this.moreText.setText(t('scene.crowd.more', { count: hidden }));
  }

  private sprite(
    x: number,
    y: number,
    frame: string,
    atlas: string = ATLAS.common,
  ): Phaser.GameObjects.Image {
    return this.add.image(x, y, atlas, frame).setScale(ART_SCALE);
  }

  /** Texte behalten beim Herauszoomen eine lesbare Bildschirmgröße. */
  private scaleLabels(): void {
    const zoom = this.cameras.main.zoom;
    if (zoom === this.labelZoom) return;
    this.labelZoom = zoom;
    const f = Phaser.Math.Clamp(1 / zoom, 1, LABEL_MAX_SCALE);
    const lift = f > LABEL_STAGGER_FROM ? LABEL_STAGGER * f : 0;
    for (const v of this.stations) v.label.setScale(f).setY(v.labelY - (v.stagger ? lift : 0));
    for (const p of this.popups) p.setScale(f);
    this.moreText.setScale(f);
    this.board?.text.setScale(f);
    this.street.setLabelScale(f);
    this.matchaOut?.setScale(f);
  }

  /** Neue Zahlungen seit dem letzten Frame; `till.paid` beginnt nach einem Reset wieder bei 0. */
  private tillInput(loc: LocationState): { payments: number; progress: number } {
    const paid = loc.till.paid;
    const payments = Math.max(0, paid - this.lastPaid);
    this.lastPaid = paid;
    return { payments, progress: loc.till.progress };
  }

  /**
   * Gäste je echter Sekunde für die Figuren (die Raten aus `core` sind pro Spielstunde, geöffnet vergeht eine
   * Spielminute je Sekunde); im Debug-Modus kosmetisch auf `debugSpawn` gesetzt (nie für Einnahmen).
   */
  private visibleServed(r: LocationRates): number {
    return this.debugSpawn > 0 ? this.debugSpawn : perRealSec(r.served);
  }

  private world(p: GridPos): { x: number; y: number } {
    return toScreen(p.x, p.y);
  }

  private makeText(size: number, color: string): Phaser.GameObjects.Text {
    return this.add
      .text(0, 0, '', {
        fontFamily: UI_THEME.fontUi,
        fontStyle: 'bold',
        fontSize: `${String(size)}px`,
        color,
        stroke: UI_THEME.inkCss,
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setResolution(2);
  }

  /** Ganzer Raum sichtbar, auch im Hochformat. */
  private fitCamera(): void {
    this.controls.cancelTour();
    const r = this.room;
    const zoom = Math.min(
      this.scale.width / (r.width + TILE_W),
      this.scale.height / (r.height + TILE_H * 2),
    );
    this.controls.setZoom(zoom);
    this.cameras.main.centerOn(r.centerX, r.centerY);
    this.controls.clamp();
    this.controls.fitted();
  }

  /**
   * Phaser meldet ein `resize` auch, wenn die Leinwand nur ein Stück verrutscht (Gummiband-Scrollen, Adressleiste am
   * Handy): dann bleibt die Kamera, wo sie ist. Bei echter Größenänderung bleibt der Ausschnitt des Spielers stehen;
   * nur wer die Kamera noch nicht bewegt hat, bekommt die Startansicht neu eingepasst. Vorher sprang die Kamera bei
   * jedem `resize` auf die Startansicht zurück.
   */
  private onResize(size: Phaser.Structs.Size, prevWidth: number, prevHeight: number): void {
    if (size.width === prevWidth && size.height === prevHeight) return;
    // Ein laufender Schwenk endet am Ausschnitt von vorher, sonst bliebe die Kamera am Parkplatz stehen.
    this.controls.cancelTour(true);
    if (this.controls.userMoved()) this.controls.keepCenter(prevWidth, prevHeight);
    else this.fitCamera();
  }

  /** Steht auf dieser Kachel ein Möbel (Theke, Gerät), das die niedrige Vorderwand ersetzt? */
  private furnitureAt(x: number, y: number): boolean {
    return (
      this.layout.stations.some((s) => s.tile.x === x && s.tile.y === y) ||
      this.layout.counter.some((c) => c.x === x && c.y === y)
    );
  }

  /** Ist das die Tür (Lücke in der Vorderwand dieser Seite)? */
  private isDoor(x: number, y: number, side: 'u' | 'v'): boolean {
    const e = this.layout.entrance;
    return x === e.x && y === e.y && this.layout.entranceSide === side;
  }

  /**
   * Boden, hohe Rückwände mit Leuchtkasten/Fenstern, niedrige Vorderwände (Dollhouse-Schnitt, UI_STYLE § 4).
   * Der Grundriss ist ein L: Raum ab `origin` bis zu den Fassaden plus Wintergarten vorn links mit Holzboden und
   * Glaswänden; Wände entstehen überall dort, wo eine Raumkachel an eine Nicht-Raumkachel grenzt, außer an der Tür.
   */
  private drawRoom(): void {
    const n = this.layout.gridSize;
    const o = this.layout.origin;
    const theme = ATLAS.theme(this.locationId);
    const { entrance, annex } = this.layout;
    const inAnnex = (x: number, y: number) =>
      x >= annex.from.x && x <= annex.to.x && y >= annex.from.y && y <= annex.to.y;
    const b = layoutBounds(this.layout, 0);
    for (let gy = b.y0; gy < b.y1; gy++) {
      for (let gx = b.x0; gx < b.x1; gx++) {
        if (!inRoom(this.layout, gx, gy)) continue;
        const p = toScreen(gx, gy);
        const isEntrance = gx === entrance.x && gy === entrance.y;
        const checker = (gx + gy) % 2 ? 'a' : 'b';
        const frame = isEntrance
          ? 'entrance'
          : inAnnex(gx, gy)
            ? `floor-wg-${checker}`
            : `floor-${checker}`;
        const img = this.sprite(p.x, p.y, frame, theme).setOrigin(0.5, 0).setDepth(DEPTH.floor);
        if (!isEntrance && !inAnnex(gx, gy)) this.floorTiles.push({ sprite: img, checker });
      }
    }
    // Rückwände: entlang x an der hinteren Kante (y = origin.y), entlang y an der linken (x = origin.x).
    const back = (side: 'u' | 'v', i: number): void => {
      const window = i % WINDOW_EVERY === 1;
      const p = side === 'u' ? toScreen(o.x + i, o.y) : toScreen(o.x, o.y + i);
      const x = side === 'u' ? p.x : p.x - TILE_W / 2;
      this.wallTiles.push({
        sprite: this.sprite(x, p.y - WALL_H - 4, `wall-${side}${window ? '-deco' : ''}`, theme)
          .setOrigin(0, 0)
          .setDepth(DEPTH.wall),
        side,
        deco: window,
      });
      // Licht nachts (additiv, Alpha folgt der Tageszeit).
      if (window)
        this.glows.push(
          this.sprite(side === 'u' ? p.x + TILE_W / 4 : p.x - TILE_W / 4, p.y - 30, FRAME.glow)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDepth(DEPTH.wall + 1)
            .setAlpha(0),
        );
    };
    for (let i = 0; i < n - o.x; i++) back('u', i);
    for (let i = 0; i < n - o.y; i++) back('v', i);
    // Wintergarten: hohe Glaswand an der linken Seite, sie verdeckt den Gehweg dahinter nicht.
    for (let y = annex.from.y; y <= annex.to.y; y++) {
      const pv = toScreen(annex.from.x, y);
      this.sprite(pv.x - TILE_W / 2, pv.y - WALL_H - 4, 'glass-back-v', theme)
        .setOrigin(0, 0)
        .setDepth(DEPTH.wall);
    }
    // Vorderwände (25 %) bzw. Glaswände des Wintergartens an allen offenen Kanten, Lücke an Tür und Möbeln.
    for (let gy = b.y0; gy < b.y1; gy++) {
      for (let gx = b.x0; gx < b.x1; gx++) {
        if (!inRoom(this.layout, gx, gy)) continue;
        const glass = inAnnex(gx, gy);
        const pf = toScreen(gx, gy);
        // Vorderwände haben oben Platz für die Blumenkästen des Endausbaus.
        const top = glass ? GLASS_H + 2 : FRONT_WALL_H + 2 + FRONT_PLANTER_H;
        const wall = (side: 'u' | 'v'): void => {
          const img = this.sprite(
            pf.x - TILE_W / 2,
            pf.y - top,
            glass ? `glass-${side}` : `front-${side}`,
            theme,
          )
            .setOrigin(0, 0)
            .setDepth(isoDepth(gx, gy, 9));
          if (!glass) this.frontTiles.push({ sprite: img, side });
        };
        if (!inRoom(this.layout, gx, gy + 1) && !this.isDoor(gx, gy, 'u')) wall('u');
        if (
          !inRoom(this.layout, gx + 1, gy) &&
          !this.furnitureAt(gx, gy) &&
          !this.isDoor(gx, gy, 'v')
        )
          wall('v');
      }
    }
  }

  /**
   * Gästetheke als L in der Optik-Stufe des Cafés: gerade Module, quer gestellte (Front nach +x) und das Eckmodul.
   * Unter Kasse und Ausgabe liegt ein leeres Modul, auf dem das Gerät steht; Antippen öffnet die Kasse bzw. das
   * Gerät darauf (die freien Module gehören zur Kasse).
   */
  private createCounter(): void {
    const modules = [
      ...this.layout.counter.map((tile, i) => ({
        tile,
        stationId: REGISTER_ID,
        variant: counterPropsAt(i),
        kind: tile.corner ? ('corner' as const) : tile.facesX ? ('b' as const) : ('a' as const),
      })),
      ...this.layout.stations
        .filter((p) => getStationDef(p.stationId).area !== 'bar')
        .map((p) => ({
          tile: p.tile,
          stationId: p.stationId,
          variant: 0,
          kind: p.facesX ? ('b' as const) : ('a' as const),
        })),
    ];
    for (const m of modules) {
      const w = this.world(m.tile);
      const sprite = this.sprite(
        w.x,
        w.y + TILE_H,
        FRAME.counter(1, m.variant, m.kind),
        ATLAS.furniture,
      )
        .setOrigin(0.5, 1)
        .setDepth(isoDepth(m.tile.x, m.tile.y, 5))
        .setInteractive({ useHandCursor: true, pixelPerfect: false })
        .setData(TAP_TARGET_KEY, m.stationId);
      this.counters.push({ order: w.x, sprite, variant: m.variant, kind: m.kind });
    }
    this.counters.sort((a, b) => a.order - b.order);
  }

  /** Theke folgt dem Café-Level (`COUNTER_LOOK_CAFE_LEVELS`); beim Aufstieg ploppen die Module nacheinander. */
  private refreshCounter(state: GameState, animate: boolean): void {
    const tier: LookTier = counterLookTier(getLocation(state, this.locationId).level);
    if (tier === this.shownCounterTier) return;
    const upgrade = animate && this.shownCounterTier > 0 && tier > this.shownCounterTier;
    this.shownCounterTier = tier;
    this.counters.forEach((v, i) => {
      v.sprite.setFrame(FRAME.counter(tier, v.variant, v.kind));
      if (upgrade) this.plop(v.sprite, i * SCENE_FX.counterWaveMs);
    });
    const mid = this.counters[Math.floor(this.counters.length / 2)];
    if (upgrade && mid) this.newLook(this.restBounds(mid.sprite));
  }

  /** Lager hinter dem Personal-Gang: Regale und Palette, nur Optik (kein Antippen). */
  private createStorage(): void {
    for (const p of this.layout.storage.pieces) {
      const w = this.world(p.tile);
      const sprite = this.sprite(
        w.x,
        w.y + TILE_H,
        // Erstes Bild aus der Stufe, ab der das Teil gezeichnet ist (Seitenregal erst ab Stufe 2).
        FRAME.storage(p.piece, storageTierAt(p.minTier), p.facesX),
        ATLAS.furniture,
      )
        .setOrigin(0.5, 1)
        .setDepth(isoDepth(p.tile.x, p.tile.y, 5))
        .setVisible(false);
      this.storage.push({ piece: p.piece, facesX: p.facesX, minTier: p.minTier, sprite });
    }
  }

  /**
   * Das Lager füllt sich mit der Zahl gekaufter Geräte der Barista-Theke (`STORAGE_LOOK_DEVICES`); neue Regale
   * ploppen dazu. Rein kosmetisch.
   */
  private refreshStorage(state: GameState, animate: boolean): void {
    const loc = getLocation(state, this.locationId);
    const devices = PRODUCT_LINES.filter((l) => (loc.stations[l.id]?.level ?? 0) > 0).length;
    const tier: StorageTier = storageLookTier(devices);
    if (tier === this.shownStorageTier) return;
    const upgrade = animate && this.shownStorageTier > 0 && tier > this.shownStorageTier;
    this.shownStorageTier = tier;
    for (const v of this.storage) {
      const show = tier >= v.minTier;
      const appears = show && !v.sprite.visible;
      // Nicht sichtbare Teile behalten ihr Bild (das Seitenregal gibt es erst ab Stufe 2).
      if (show) v.sprite.setFrame(FRAME.storage(v.piece, tier, v.facesX));
      v.sprite.setVisible(show);
      if (upgrade && show) this.plop(v.sprite, appears ? SCENE_FX.counterWaveMs * 4 : 0);
    }
  }

  private createStations(): void {
    for (const p of this.layout.stations) {
      const w = this.world(p.tile);
      // Geräte auf der Theke liegen über ihrem Thekenmodul.
      const onCounter = getStationDef(p.stationId).area !== 'bar';
      const sprite = this.sprite(w.x, w.y + TILE_H, FRAME.ghost, ATLAS.furniture)
        .setOrigin(0.5, 1)
        .setDepth(isoDepth(p.tile.x, p.tile.y, onCounter ? 5.5 : 5))
        .setInteractive({ useHandCursor: true, pixelPerfect: false });
      sprite.setData(TAP_TARGET_KEY, p.stationId);
      const labelY = w.y - STATION_TOP + TILE_H / 2;
      const label = this.makeText(13, UI_THEME.textCss)
        .setPosition(w.x, labelY)
        .setDepth(DEPTH.label);
      this.stations.push({
        id: p.stationId,
        placement: p,
        sprite,
        label,
        labelY,
        stagger: p.tile.y === this.layout.origin.y && (p.tile.x - this.layout.origin.x) % 2 === 0,
        shownLevel: -1,
        shownLock: '',
        shownTint: -1,
        baseX: w.x,
      });
    }
    this.createBoard();
  }

  /** Alle Tischplätze des Grundrisses; sichtbar nach `seats`-Stufe, Schmutz-Marker darüber. */
  private createTables(): void {
    for (const p of this.layout.tables) {
      const w = this.world(p.tile);
      const sprite = this.sprite(w.x, w.y + TILE_H, this.tableFrame(p, 0), ATLAS.furniture)
        .setOrigin(0.5, 1)
        .setDepth(isoDepth(p.tile.x, p.tile.y, 5))
        .setVisible(false)
        .setInteractive({ useHandCursor: true, pixelPerfect: false })
        .setData(TAP_TARGET_KEY, tableTarget(p));
      const dirt = this.sprite(w.x, w.y + TILE_H, FRAME.dirt, ATLAS.furniture)
        .setOrigin(0.5, 1)
        .setDepth(isoDepth(p.tile.x, p.tile.y, 5.5))
        .setVisible(false);
      this.tables.push({ placement: p, sprite, dirt });
    }
  }

  /** Kamera-Grenzen = Raum plus sichtbare Terrasse (Grid-Erweiterung, GAME_DESIGN § 5.2). */
  private updateRoomBounds(terraceLevel: number): void {
    const b = layoutBounds(this.layout, terraceLevel);
    const left = toScreen(b.x0, b.y1).x;
    const right = toScreen(b.x1, b.y0).x;
    const top = toScreen(b.x0, b.y0).y - WALL_H;
    const bottom = toScreen(b.x1, b.y1).y;
    this.room.setTo(left, top, right - left, bottom - top);
  }

  /** Zeichnet Ambiente (Deko, Musik, WLAN, Terrasse) neu, sobald sich ein Level ändert. */
  private createAmbience(state: GameState): void {
    const loc = getLocation(state, this.locationId);
    const key = [
      ...this.layout.ambience.map((a) => loc.ambience[a.id] ?? 0),
      loc.ambience['decor'] ?? 0,
      loc.ambience['terrace'] ?? 0,
    ].join(',');
    if (key === this.ambienceKey) return;
    const first = this.ambienceKey === '';
    const terraceLevel = loc.ambience['terrace'] ?? 0;
    const terraceChanged = this.terraceLevel !== terraceLevel;
    this.ambienceKey = key;
    for (const img of this.ambienceImages) img.destroy();
    this.ambienceImages = [];
    const theme = ATLAS.theme(this.locationId);
    for (const area of this.layout.terrace) {
      if (terraceLevel < area.minLevel) continue;
      for (let gy = area.from.y; gy <= area.to.y; gy++) {
        for (let gx = area.from.x; gx <= area.to.x; gx++) {
          const p = toScreen(gx, gy);
          this.ambienceImages.push(
            this.sprite(p.x, p.y, 'terrace', theme).setOrigin(0.5, 0).setDepth(DEPTH.floor),
          );
        }
      }
    }
    if (terraceChanged && this.terraceLevel >= 0) {
      this.updateRoomBounds(terraceLevel);
      this.fitCamera();
    }
    this.terraceLevel = terraceLevel;
    for (const a of this.layout.ambience) {
      if ((loc.ambience[a.id] ?? 0) < a.minLevel) continue;
      const w = this.world(a.tile);
      const img = this.sprite(w.x, w.y + TILE_H, FRAME.ambience(a.id), ATLAS.furniture)
        .setOrigin(0.5, 1)
        .setDepth(isoDepth(a.tile.x, a.tile.y, 5))
        .setInteractive(TAP_PIXEL)
        .setData(TAP_TARGET_KEY, ambienceTarget(a.id));
      this.ambienceImages.push(img);
    }
    // Deko nach Level: Bilder, Neon und Regale an den Wänden, Pflanzen, Leuchten und Teppich im Raum. Teppiche
    // (und die Terrassen-Fliesen) bleiben Boden: Antippen dort füllt wie überall auf dem Boden den Hype.
    const decor = loc.ambience['decor'] ?? 0;
    for (const p of this.lightPools) p.destroy();
    this.lightPools = [];
    for (const d of this.layout.decor) {
      if (decor < d.minLevel) continue;
      const img = this.decorSprite({ ...d, frame: decorFrame(d.frame, decor) });
      if (!d.floor) img.setInteractive(TAP_PIXEL).setData(TAP_TARGET_KEY, ambienceTarget('decor'));
      this.ambienceImages.push(img);
      if (d.frame === 'deco-pendant') this.lightPools.push(this.lightPool(d.tile));
    }
    this.refreshRoomLook(decor, !first);
    if (!first) this.plop(this.ambienceImages[this.ambienceImages.length - 1]);
    this.shownNight = -1;
  }

  /** Warmer Lichtkegel auf dem Boden unter einer Pendelleuchte (additiv, Stärke folgt der Tageszeit). */
  private lightPool(tile: GridPos): Phaser.GameObjects.Image {
    const p = toScreen(tile.x + 0.5, tile.y + 0.5);
    return this.sprite(p.x, p.y, FRAME.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(ART_SCALE * 1.5, ART_SCALE * 0.75)
      .setDepth(DEPTH.floor + 3)
      .setAlpha(0);
  }

  /**
   * Endausbau (`roomLook`): Boden, Wände und Vorderwände tauschen mit dem Deko-Level ihr Bild; beim Aufstieg
   * ploppt der Boden als Welle und „Neues Design!“ erscheint mitten im Raum.
   */
  private refreshRoomLook(decor: number, animate: boolean): void {
    const look = roomLook(decor);
    const key = `${String(look.floor)}${String(look.wall)}${String(look.front)}`;
    if (key === this.shownRoomLook) return;
    const upgrade = animate && this.shownRoomLook !== '';
    this.shownRoomLook = key;
    const floor = look.floor > 1 ? `${String(look.floor)}-` : '';
    for (const f of this.floorTiles) {
      const name = `floor-${floor}${f.checker}`;
      if (f.sprite.frame.name !== name) f.sprite.setFrame(name);
    }
    const wall = look.wall > 1 ? '-2' : '';
    for (const w of this.wallTiles) {
      const name = `wall-${w.side}${wall}${w.deco ? '-deco' : ''}`;
      if (w.sprite.frame.name !== name) w.sprite.setFrame(name);
    }
    for (const f of this.frontTiles) {
      const name = `front-${f.side}${look.front > 1 ? '-2' : ''}`;
      if (f.sprite.frame.name !== name) f.sprite.setFrame(name);
    }
    if (upgrade && !reducedMotion()) {
      const { origin, gridSize: n } = this.layout;
      const c = this.world({ x: (origin.x + n) / 2, y: (origin.y + n) / 2 });
      this.newLook(new Phaser.Geom.Rectangle(c.x - 40, c.y - 80, 80, 80));
    }
  }

  /** Wand-Deko liegt bündig auf der Rückwand (gleiche Leinwand wie die Wandkachel), sonst wie ein Möbel. */
  private decorSprite(d: DecorItem): Phaser.GameObjects.Image {
    if (d.wall === 'u') {
      const p = toScreen(d.tile.x, this.layout.origin.y);
      return this.sprite(p.x, p.y - WALL_H - 4, d.frame + '-u', ATLAS.furniture)
        .setOrigin(0, 0)
        .setDepth(DEPTH.wall + 2);
    }
    if (d.wall === 'v') {
      const p = toScreen(this.layout.origin.x, d.tile.y);
      return this.sprite(p.x - TILE_W / 2, p.y - WALL_H - 4, d.frame + '-v', ATLAS.furniture)
        .setOrigin(0, 0)
        .setDepth(DEPTH.wall + 2);
    }
    const w = this.world(d.tile);
    // Große Deko (Läufer, Hocker): Ursprung an der unteren Kachelecke innerhalb der größeren Leinwand
    const big = DECOR_BIG_FRAMES.includes(d.frame);
    return this.sprite(w.x, w.y + TILE_H, d.frame, ATLAS.furniture)
      .setOrigin(0.5, big ? (DECOR_BIG.oy + TILE_H) / DECOR_BIG.h : 1)
      .setDepth(d.floor ? DEPTH.floor + 1 : isoDepth(d.tile.x, d.tile.y, 5));
  }

  /**
   * Tische nach `seats`-Stufe ein-/ausblenden; ein neuer Tisch ploppt. Erreicht die Zahl der Tische eine neue
   * Optik-Stufe (`TABLE_LOOK_LEVELS`), ploppen alle Tische nacheinander im neuen Design.
   */
  private refreshTables(state: GameState, animate: boolean): void {
    const loc = getLocation(state, this.locationId);
    const level = loc.ambience['seats'] ?? 0;
    const terrace = loc.ambience['terrace'] ?? 0;
    const key = level * 10 + terrace;
    if (key === this.shownTables) return;
    const before = this.shownTables;
    const levelBefore = Math.floor(before / 10);
    this.shownTables = key;
    const visible = new Set(visibleTables(this.layout, level, terrace));
    const upgrade = animate && before > 0 && tableLookTier(level) > tableLookTier(levelBefore);
    let wave = 0;
    for (const v of this.tables) {
      const show = visible.has(v.placement);
      const frame = this.tableFrame(v.placement, level);
      if (v.sprite.frame.name !== frame) v.sprite.setFrame(frame);
      const appears = v.sprite.visible !== show && show;
      if (v.sprite.visible !== show) v.sprite.setVisible(show);
      if (!show) v.dirt.setVisible(false);
      if (show && upgrade) this.plop(v.sprite, wave++ * SCENE_FX.counterWaveMs);
      else if (appears && animate && before >= 0) this.plop(v.sprite);
    }
    const first = this.tables.find((v) => v.sprite.visible);
    if (upgrade && first) this.newLook(this.restBounds(first.sprite));
  }

  /** Tisch drinnen oder Terrassen-Tisch mit Schirm, jeweils in der Stufe nach Anzahl der Tische. */
  private tableFrame(p: TablePlacement, seatsLevel: number): string {
    return p.outside ? FRAME.tableOut(seatsLevel) : FRAME.table(seatsLevel);
  }

  /** Nach Sprachwechsel alle Stations-Texte neu setzen. */
  private relabel(): void {
    this.matchaOut?.setText(t('scene.matchaOut'));
    this.shownNight = -1;
    for (const v of this.stations) v.shownLevel = -1;
    this.refreshStations(this.store.getState(), false);
  }

  /**
   * Gekauft = Sprite der Ausbaustufe ohne Schild (das Level steht im Panel, das Antippen öffnet), sonst Bauplatz
   * mit „Kaufen“ bzw. „Terrasse nötig“; gesperrte Bauplätze stehen stumm.
   */
  private refreshStations(state: GameState, animate: boolean): void {
    const loc = getLocation(state, this.locationId);
    const tints = equippedSkinTints(state);
    // Fehlt nur noch die Terrasse, bekommt das nächste gesperrte Gerät ein Schild; die anderen stehen stumm.
    const nextLocked = this.stations
      .filter(
        (v) =>
          (loc.stations[v.id]?.level ?? 0) <= 0 && !isStationUnlocked(state, this.locationId, v.id),
      )
      .sort(
        (a, b) => getStationDef(a.id).unlockCafeLevel - getStationDef(b.id).unlockCafeLevel,
      )[0]?.id;
    for (const v of this.stations) {
      const tint = tints[v.id] ?? 0xffffff;
      if (tint !== v.shownTint) {
        v.shownTint = tint;
        v.sprite.setTint(tint);
      }
      const level = loc.stations[v.id]?.level ?? 0;
      const unlocked = isStationUnlocked(state, this.locationId, v.id);
      const shownLock = unlocked
        ? 'open'
        : v.id === nextLocked &&
            needsTerrace(state, this.locationId, v.id) &&
            loc.level >= getStationDef(v.id).unlockCafeLevel
          ? 'terrace'
          : '';
      if (level === v.shownLevel && shownLock === v.shownLock) continue;
      const before = v.shownLevel;
      v.shownLevel = level;
      v.shownLock = shownLock;
      const onCounter = getStationDef(v.id).area !== 'bar';
      if (level > 0) {
        v.sprite
          .setFrame(FRAME.station(v.id, level, v.placement.facesX))
          .setAlpha(1)
          .setVisible(true);
        v.label.setText('');
        if (animate && before >= 0 && level > before) {
          // Maße vor dem Plopp nehmen: währenddessen ist das Sprite auf 0 skaliert.
          const bounds = this.restBounds(v.sprite);
          const newTier = stationLookTier(level) !== stationLookTier(before);
          this.plop(v.sprite);
          if (before === 0 || newTier) this.shine(v.sprite, bounds);
          if (before > 0 && newTier) this.newLook(bounds);
        }
      } else {
        // Kasse und Ausgabe: nur das leere Thekenmodul darunter; Geräte an der Rückwand als Bauplatz.
        v.sprite
          .setFrame(FRAME.ghost)
          .setVisible(!onCounter)
          .setAlpha(unlocked ? 1 : 0.45);
        v.label.setText(
          shownLock === 'open'
            ? t('scene.station.buy')
            : shownLock === 'terrace'
              ? t('scene.station.needsTerrace')
              : '',
        );
      }
      if (v.id === REGISTER_ID) this.drawerShown = false;
    }
  }

  /** Kauf-Plopp: Scale 0 → 1.1 → 1 (UI_STYLE § 4); mit `delay` als Welle über mehrere Objekte. */
  private plop(target: Phaser.GameObjects.Image | undefined, delay = 0): void {
    if (!target || reducedMotion()) return;
    this.tweens.killTweensOf(target);
    target.setScale(0);
    this.tweens.add({
      targets: target,
      scale: { from: 0, to: ART_SCALE * SCENE_FX.plopOvershoot },
      delay,
      duration: SCENE_FX.plopMs * 0.7,
      ease: 'Back.Out',
      onComplete: () =>
        this.tweens.add({ targets: target, scale: ART_SCALE, duration: SCENE_FX.plopMs * 0.3 }),
    });
  }

  /** Maße eines Sprites in Ruhe (unabhängig von einem laufenden Plopp). */
  private restBounds(target: Phaser.GameObjects.Image): Phaser.Geom.Rectangle {
    // Originalgröße (Möbel-Frames sind im Atlas auf ihren Inhalt beschnitten).
    const w = target.frame.realWidth * ART_SCALE;
    const h = target.frame.realHeight * ART_SCALE;
    return new Phaser.Geom.Rectangle(
      target.x - w * target.originX,
      target.y - h * target.originY,
      w,
      h,
    );
  }

  /** Neue Optik-Stufe: Funken und „Neues Design!“ über dem Objekt (kosmetisch). */
  private newLook(b: Phaser.Geom.Rectangle): void {
    if (reducedMotion()) return;
    // Sichtbarer Inhalt beginnt etwa im oberen Drittel des Kachel-Sprites.
    const top = b.top + b.height * 0.25;
    this.sparkles.explode(SCENE_FX.newLookSparkles, b.centerX, top + b.height * 0.15);
    const text = this.makeText(13, UI_THEME.goldCss)
      .setText(t('scene.station.newLook'))
      .setPosition(b.centerX, top)
      .setDepth(DEPTH.overlay)
      .setScale(Phaser.Math.Clamp(1 / this.cameras.main.zoom, 1, LABEL_MAX_SCALE));
    this.tweens.add({
      targets: text,
      y: top - 22,
      alpha: { from: 1, to: 0 },
      duration: SCENE_FX.newLookMs,
      ease: 'Quad.In',
      onComplete: () => text.destroy(),
    });
  }

  /** Weißer Shine-Sweep über das Objekt (Level-up / neue Ausbaustufe). */
  private shine(target: Phaser.GameObjects.Image, bounds?: Phaser.Geom.Rectangle): void {
    if (reducedMotion()) return;
    const b = bounds ?? this.restBounds(target);
    const s = this.sprite(b.left, b.centerY, FRAME.shine)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(target.depth + 1)
      .setScale(ART_SCALE, (b.height / 40) * 1.2);
    this.tweens.add({
      targets: s,
      x: b.right,
      alpha: { from: 0.9, to: 0 },
      duration: SCENE_FX.shineMs,
      onComplete: () => s.destroy(),
    });
  }

  /** Warteschlangen-Tafel über der Kasse: dunkle Tafel, rote LED-Zahl (UI_STYLE § 3.10). */
  private createBoard(): void {
    const p = this.layout.stations.find((s) => s.stationId === REGISTER_ID);
    if (!p) return;
    const w = this.world(p.tile);
    const x = w.x;
    const y = w.y - STATION_TOP - 14;
    const bg = this.add.graphics().setDepth(DEPTH.label);
    bg.fillStyle(UI_THEME.navy900, 0.92);
    bg.fillRoundedRect(x - 16, y - 18, 32, 18, 4);
    // Die Tafel hängt über der Kasse: Antippen öffnet die Kasse.
    bg.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(x - 16, y - 18, 32, 18),
      hitAreaCallback: (r: Phaser.Geom.Rectangle, px: number, py: number) => r.contains(px, py),
      useHandCursor: true,
    }).setData(TAP_TARGET_KEY, REGISTER_ID);
    const text = this.add
      .text(x, y - 1, '0', {
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '14px',
        color: UI_THEME.ledCss,
      })
      .setOrigin(0.5, 1)
      .setResolution(2)
      .setDepth(DEPTH.label + 1);
    this.board = { text, bg };
  }

  private refreshBoard(): void {
    if (!this.board) return;
    const register = this.stations.find((s) => s.id === REGISTER_ID);
    const show = (register?.shownLevel ?? 0) > 0;
    this.board.bg.setVisible(show);
    this.board.text.setVisible(show);
    const n = this.crowd.waitingCount;
    if (n === this.shownQueue) return;
    this.shownQueue = n;
    this.board.text.setText(String(Math.min(n, 99)).padStart(2, '0'));
  }

  /** Farbfilter und Partikel für Events (rein kosmetisch, GAME_DESIGN § 12). */
  private createEventFx(): void {
    const c = this.room;
    this.eventTint = this.add
      .rectangle(c.centerX, c.centerY, OVERLAY_SIZE, OVERLAY_SIZE, 0xffffff, 0)
      .setDepth(DEPTH.overlay - 1)
      .setVisible(false);
    const zone = new Phaser.Geom.Rectangle(c.x, c.y - c.height * 0.2, c.width, c.height * 0.2);
    const emitZone = { type: 'random' as const, source: zone, quantity: 1 };
    const fallLife = Math.max(800, (c.height * 1.2 * 1000) / 420);
    const particles = (
      frame: string,
      cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig,
    ) => this.add.particles(0, 0, ATLAS.common, { frame, emitting: false, ...cfg });
    this.fx = {
      rain: particles(FRAME.rain, {
        emitZone,
        speedY: { min: 380, max: 460 },
        speedX: { min: -30, max: -10 },
        lifespan: fallLife,
        frequency: 25,
        scale: ART_SCALE,
        alpha: { start: 0.7, end: 0.2 },
      }),
      petals: particles(FRAME.petal, {
        emitZone,
        speedY: { min: 40, max: 80 },
        speedX: { min: -30, max: 30 },
        lifespan: (c.height * 1.2 * 1000) / 60,
        frequency: 220,
        scale: ART_SCALE,
        rotate: { min: 0, max: 360 },
      }),
      sparkle: particles(FRAME.sparkle, {
        emitZone: {
          type: 'random' as const,
          source: new Phaser.Geom.Rectangle(c.x, c.y, c.width, c.height),
          quantity: 1,
        },
        lifespan: 900,
        frequency: 180,
        scale: { start: ART_SCALE, end: 0 },
        alpha: { start: 0.9, end: 0 },
      }),
    };
    for (const e of Object.values(this.fx)) e.setDepth(DEPTH.overlay - 1);
  }

  private refreshEventFx(state: GameState): void {
    const o = getEventOverlay(state, this.locationId);
    const key = o ? `${String(o.color)}:${String(o.alpha)}:${o.particles ?? ''}` : '';
    if (key === this.overlayKey) return;
    this.overlayKey = key;
    this.eventTint.setVisible(!!o);
    if (o) this.eventTint.setFillStyle(o.color, o.alpha);
    // Bei „weniger Bewegung“ bleibt nur der Farbfilter.
    const still = reducedMotion();
    for (const [kind, emitter] of Object.entries(this.fx)) {
      if (o?.particles === kind && !still) emitter.start();
      else emitter.stop();
    }
  }

  /** Tag/Nacht (UI_STYLE § 4): Indigo-Multiply über der Szene, Fenster leuchten warm. Rein kosmetisch. */
  private createNight(): void {
    const c = this.room;
    this.nightTint = this.add
      .rectangle(c.centerX, c.centerY, OVERLAY_SIZE, OVERLAY_SIZE, UI_THEME.night, 1)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setDepth(DEPTH.overlay - 2)
      .setAlpha(0);
    // Lichter liegen über dem Nachtfilter, damit sie hell bleiben.
    for (const g of this.glows) g.setDepth(DEPTH.overlay - 1);
  }

  private refreshNight(state: GameState): void {
    const loc = getLocation(state, this.locationId);
    const open = isOpenAt(loc, state.clock);
    // Schild an der Tür: geöffnet bis … bzw. geschlossen ab … (Öffnungszeiten können sich ändern).
    const lang = getLang();
    this.street.setSign(
      open,
      open
        ? t('scene.sign.open', { time: formatHour(loc.hours.close, lang) })
        : t('scene.sign.closed', { time: formatHour(loc.hours.open, lang) }),
    );
    const night = Math.round(getCafeClock(state.clock).night * 100) / 100;
    const key = night + (open ? 10 : 0);
    if (key === this.shownNight) return;
    this.shownNight = key;
    // Multiply mit Alpha mischt Richtung Indigo; 0 = Tag.
    this.nightTint.setAlpha(night * DAY_CYCLE.nightAlpha);
    this.nightTint.setVisible(night > 0);
    // Nach Ladenschluss ist drinnen das Licht aus (nur ein Rest brennt).
    const lit = open ? 1 : SCENE_FX.closedLight;
    for (const g of this.glows) g.setAlpha(night * 0.8 * lit);
    // Heller Marmor sättigt schnell: nur ein Hauch Licht, nachts etwas mehr.
    for (const p of this.lightPools) p.setAlpha((0.06 + night * 0.24) * lit);
    this.city.setNight(night);
  }

  /** Parkplatz-Ausbau: Die neue Stufe zeigt `revealParking`, sobald die Szene zu sehen ist. */
  private refreshParking(state: GameState): void {
    const level = getLocation(state, this.locationId).ambience['parking'] ?? 0;
    if (this.parking.setLevel(level) && !reducedMotion())
      this.parkingReveal = this.parking.center();
  }

  /**
   * Gekauft wird meist im Shop, der die Szene ganz verdeckt: Erst wenn sie wieder zu sehen ist, schwenkt die Kamera
   * kurz zum Parkplatz (mitten in den freien Teil neben HUD und Panel), Funken über der neuen Stufe, dann zurück an
   * den Ausschnitt des Spielers (Vorgabe Vincent).
   */
  private revealParking(): void {
    const c = this.parkingReveal;
    const cover = getSceneCover(this);
    if (!c || cover.full) return;
    this.parkingReveal = null;
    const cam = this.cameras.main;
    const view = new Phaser.Geom.Rectangle(
      0,
      cover.top,
      Math.max(1, cam.width - cover.right),
      Math.max(1, cam.height - cover.top - cover.bottom),
    );
    this.controls.showAndReturn(c, view, () =>
      this.sparkles.explode(SCENE_FX.newLookSparkles, c.x, c.y - 10),
    );
  }

  /** Neue Lieferungen: der Wagen fährt vor; neue Kosten-Abbuchungen: „−Betrag“ über der Kasse. */
  private watchSupplyAndBills(loc: LocationState): void {
    const delivered = loc.supply.delivered;
    if (delivered < this.lastDelivered) this.lastDelivered = delivered;
    if (delivered > this.lastDelivered) {
      this.street.deliver(Math.min(3, delivered - this.lastDelivered));
      this.lastDelivered = delivered;
    }
    const bills = loc.bills.count;
    if (bills < this.lastBills) this.lastBills = bills;
    if (bills > this.lastBills) {
      this.lastBills = bills;
      if (loc.bills.last.gt(0)) {
        const reg = this.layout.stations.find((s) => s.stationId === REGISTER_ID)?.tile;
        const at = reg ? toScreen(reg.x, reg.y) : toScreen(0, 0);
        this.textPopup(
          at.x,
          at.y - STATION_TOP,
          t('scene.costPopup', { amount: formatMoney(loc.bills.last, getLang()) }),
          UI_THEME.dangerCss,
        );
      }
    }
    // Kein Matcha mehr: Hinweis über der Matcha-Station.
    if (this.matchaOut) this.matchaOut.setVisible(gradeInUse(loc.supply) < 0);
  }

  private createMatchaOut(): void {
    const p = this.layout.stations.find((s) => s.stationId === 'matchaStation');
    if (!p) return;
    const w = this.world(p.tile);
    this.matchaOut = this.makeText(12, UI_THEME.dangerCss)
      .setText(t('scene.matchaOut'))
      .setPosition(w.x, w.y - STATION_TOP - 8)
      .setDepth(DEPTH.label)
      .setVisible(false);
  }

  /** Kurzer Text, der aufsteigt und verblasst (Lieferung, Kosten). */
  private textPopup(x: number, y: number, text: string, color: string): void {
    const popup = this.freePopup();
    if (!popup) return;
    popup.setColor(color).setText(text).setPosition(x, y).setAlpha(1).setVisible(true);
    this.tweens.add({
      targets: popup,
      y: y - 30,
      alpha: 0,
      duration: 1400,
      onComplete: () => popup.setVisible(false).setColor(UI_THEME.goldCss),
    });
  }

  /**
   * Personal-Figuren (kosmetisch, aus `crowd`): Verkäufer hinter der Kasse, Baristas an den Geräten (tragen das
   * Fertige zur Ausgabe), Bedienungen mit Tablett und Putzkräfte. Sichtbar nach Anzahl, gedeckelt (`CROWD.max*`);
   * nach Ladenschluss gehen sie nach hinten hinaus, morgens kommen sie wieder.
   */
  private createStaff(): void {
    // Die n-te Figur einer Rolle bekommt den n-ten Look (`STAFF_LOOKS`), rein optisch.
    const moving = (role: StaffRoleId, n: number): StaffFigure[] =>
      Array.from({ length: n }, (_, i) => ({
        sprite: this.sprite(0, 0, FRAME.staff(role, staffLookFor(role, i)))
          .setOrigin(0.5, CHAR_FOOT_ORIGIN_Y)
          .setVisible(false),
        prev: { x: 0, y: 0 },
        look: null,
      }));
    this.cashierFigures = moving('cashier', this.crowd.cashiers.length);
    this.baristaFigures = moving('barista', CROWD.maxBaristas);
    this.waiterFigures = moving('waiter', CROWD.maxWaiters);
    this.cleanerFigures = moving('cleaner', CROWD.maxCleaners);
    this.supplySprites = this.baristaFigures.map(() =>
      this.sprite(0, 0, FRAME.supply('tin'), ATLAS.furniture)
        .setOrigin(0.5, SUPPLY_CANVAS.oy / SUPPLY_CANVAS.h)
        .setVisible(false),
    );
  }

  /** Blickrichtung der Verkäufer: zur Kasse (quer gestellt → nach +x). */
  private cashierLook(): Look {
    const reg = this.layout.stations.find((s) => s.stationId === REGISTER_ID);
    return reg?.facesX ? facing(1, 0) : facing(0, 1);
  }

  private refreshStaff(state: GameState): void {
    const loc = getLocation(state, this.locationId);
    // Baristas arbeiten an den gekauften Geräten, in Reihenfolge der Produktlinien; die Simulation bewegt sie.
    let left = getStaffLevel(loc, 'barista');
    const posts: BaristaPost[] = [];
    for (const line of PRODUCT_LINES) {
      if (left <= 0 || posts.length >= CROWD.maxBaristas) break;
      const p = this.layout.stations.find((x) => x.stationId === line.id);
      if (!p || (loc.stations[line.id]?.level ?? 0) <= 0) continue;
      posts.push({ station: line.id, home: p.workSpot });
      left--;
    }
    const same =
      posts.length === this.baristaPosts.length &&
      posts.every((p, i) => p.station === this.baristaPosts[i]?.station);
    if (!same) this.baristaPosts = posts;
  }

  /** Sekunden je Becher und sichtbarem Barista (aus der Zubereitungs-Kapazität); 0, solange niemand kommt. */
  private prepSec(r: LocationRates): number {
    const n = this.baristaPosts.length;
    if (n === 0 || this.visibleServed(r) <= 0) return 0;
    return n / Math.max(perRealSec(r.stages.production), 1e-6);
  }

  /** Frame in einem Takt (Hände wechseln), je Figur versetzt; bei „weniger Bewegung“ der erste Frame. */
  private cycleFrame(c: { cycle: readonly number[]; stepSec: number }, offset: number): number {
    if (reducedMotion()) return c.cycle[0] ?? CHAR_FRAMES.stand;
    return (
      c.cycle[Math.floor(this.walkClock / c.stepSec + offset) % c.cycle.length] ?? CHAR_FRAMES.stand
    );
  }

  /** Frame einer Arbeits-Pose (`WORK_SCRIPTS`). */
  private poseFrame(pose: WorkPose, offset: number): number {
    switch (pose) {
      case 'place':
        return CHAR_FRAMES.place;
      case 'pour':
        return CHAR_FRAMES.pour;
      case 'stand':
        return CHAR_FRAMES.stand;
      case 'whisk':
        return this.cycleFrame(CHAR_WHISK, offset);
      case 'low':
        return this.cycleFrame(CHAR_LOW, offset);
      case 'work':
        return this.cycleFrame(CHAR_WORK, offset);
    }
  }

  /** Lauf-Frame im Zyklus (mit vorgestreckter Hand beim Tragen), je Figur versetzt. */
  private stepFrame(carrying: boolean, offset: number): number {
    const cycle = carrying ? CHAR_CARRY : CHAR_WALK;
    if (reducedMotion()) return cycle.cycle[1] ?? CHAR_FRAMES.stand;
    return (
      cycle.cycle[Math.floor((this.walkClock + offset) / cycle.stepSec) % cycle.cycle.length] ??
      CHAR_FRAMES.stand
    );
  }

  /** Setzt eine Personal-Figur: Frame, Spiegelung, Position, Tiefe, Ein- und Ausblenden. */
  private placeStaff(
    f: StaffFigure,
    role: StaffRoleId,
    index: number,
    pos: { x: number; y: number; fade: number },
    look: Look,
    frame: number,
  ): void {
    f.look = look;
    const name = FRAME.staff(role, staffLookFor(role, index), look.dir, frame);
    if (f.sprite.frame.name !== name) f.sprite.setFrame(name);
    const p = toScreen(pos.x, pos.y);
    f.sprite
      .setFlipX(look.flip)
      .setVisible(true)
      .setAlpha(pos.fade)
      .setPosition(p.x, p.y + TILE_H / 2)
      .setDepth(isoDepth(pos.x, pos.y, 6));
  }

  /**
   * Baristas: am Gerät mit dem Rücken zum Gastraum, Schritt für Schritt (`WORK_SCRIPTS`: hinstellen, aufschlagen,
   * eingießen, tief in Ofen oder Kühlfach greifen …), mit dem Fertigen in der Hand zur Ausgabe, abstellen (Blick zur
   * Theke) und zurück; im Lager greifen sie ins Regal.
   */
  private syncBaristas(): void {
    this.crowd.baristas.forEach((b, i) => {
      const f = this.baristaFigures[i];
      if (!f) return;
      if (!b.active) {
        if (f.sprite.visible) f.sprite.setVisible(false);
        f.look = null;
        this.items.hold({ sprite: f.sprite, dir: 'front' }, [], HOLD_POINTS.carry);
        return;
      }
      const dx = b.x - f.prev.x;
      const dy = b.y - f.prev.y;
      const moving = f.sprite.visible && Math.hypot(dx, dy) > 1e-4;
      f.prev.x = b.x;
      f.prev.y = b.y;
      const carrying = b.phase === 'toPass' || b.phase === 'fromStore';
      // Mit dem Rücken zum Gastraum ans Gerät (quer gestellte Geräte stehen an der linken Wand).
      const across = this.layout.stations.find((p) => p.stationId === b.station)?.facesX;
      let look = across ? facing(-1, 0) : facing(0, -1);
      let frame: number = CHAR_FRAMES.stand;
      if (moving) {
        look = walkFacing(f.look, dx, dy);
        frame = this.stepFrame(carrying, i * 0.05);
      } else if (b.phase === 'drop') {
        look = facing(0, 1);
        frame = CHAR_FRAMES.place;
      } else if (b.phase === 'work') {
        const step = workStepAt(b.station, b.workTotal > 0 ? 1 - b.timer / b.workTotal : 0);
        frame = this.poseFrame(step.pose, i * 0.5);
      } else if (b.phase === 'fetch') {
        // Greift ins Regal an der linken Wand.
        look = facing(-1, 0);
        frame = CHAR_FRAMES.place;
      }
      this.placeStaff(f, 'barista', i, b, look, frame);
      // Das Fertige in der Hand: auf dem Weg zur Ausgabe vorgestreckt, beim Abstellen vorn auf der Theke.
      const item = PASS_ITEMS[b.station] ?? 'matcha';
      const fig = { sprite: f.sprite, dir: look.dir };
      if (b.phase === 'toPass') this.items.hold(fig, [item], HOLD_POINTS.carry);
      else if (b.phase === 'drop') this.items.hold(fig, [item], HOLD_POINTS.place);
      else this.items.hold(fig, [], HOLD_POINTS.carry);
    });
  }

  /**
   * Ware aus dem Lager: in den Händen eines Baristas, der vom Regal zurück ans Gerät läuft (vor dem Körper; läuft
   * er von der Kamera weg, dahinter).
   */
  private syncSupplies(): void {
    this.crowd.baristas.forEach((b, i) => {
      const s = this.supplySprites[i];
      const f = this.baristaFigures[i];
      if (!s || !f) return;
      const show = b.active && b.phase === 'fromStore' && f.sprite.visible;
      if (s.visible !== show) s.setVisible(show);
      if (!show) return;
      const frame = FRAME.supply(SUPPLY_ITEMS[b.station] ?? 'tin');
      if (s.frame.name !== frame) s.setFrame(frame);
      const dir = f.look?.dir ?? 'front';
      const off = figureOffset(HOLD_POINTS.carry, dir);
      const flip = f.sprite.flipX ? -1 : 1;
      s.setPosition(f.sprite.x + off.x * flip, f.sprite.y + off.y)
        .setAlpha(f.sprite.alpha)
        .setDepth(f.sprite.depth + (dir === 'back' ? -0.05 : 0.05));
    });
  }

  /**
   * Verkäufer: Der erste tippt, solange jemand bestellt (die Kasse zeigt zu ihnen), die anderen helfen erst, wenn
   * sich eine Schlange bildet; sonst stehen sie und schauen zum Gast. Morgens und abends gehen sie durch den Gang.
   */
  private syncCashiers(): void {
    const ordering = this.crowd.agents.some((a) => a.active && a.phase === 'order');
    const busy = ordering || this.crowd.waitingCount > 0;
    const atRegister = this.cashierLook();
    this.crowd.cashiers.forEach((c, i) => {
      const f = this.cashierFigures[i];
      if (!f) return;
      if (!c.active) {
        if (f.sprite.visible) f.sprite.setVisible(false);
        f.look = null;
        return;
      }
      const dx = c.x - f.prev.x;
      const dy = c.y - f.prev.y;
      const moving = f.sprite.visible && Math.hypot(dx, dy) > 1e-4;
      f.prev.x = c.x;
      f.prev.y = c.y;
      if (moving) {
        this.placeStaff(
          f,
          'cashier',
          i,
          c,
          walkFacing(f.look, dx, dy),
          this.stepFrame(false, i * 0.07),
        );
        return;
      }
      const works =
        c.phase === 'idle' && (i === 0 ? ordering : busy && this.crowd.waitingCount > i);
      const frame = works ? this.cycleFrame(CHAR_WORK, i * 0.7) : CHAR_FRAMES.stand;
      this.placeStaff(f, 'cashier', i, c, atRegister, frame);
    });
  }

  /**
   * Bedienungen und Putzkräfte aus der Crowd-Simulation. Bedienungen tragen ihr Tablett mit dem, was darauf steht;
   * beim Aufnehmen an der Ausgabe, Abstellen am Tisch, Abräumen und Wegstellen strecken sie es vor.
   */
  private syncStaffFigures(): void {
    this.crowd.waiters.forEach((w, i) => {
      const f = this.waiterFigures[i];
      if (!f) return;
      if (!w.active) {
        if (f.sprite.visible) f.sprite.setVisible(false);
        f.look = null;
        this.items.hold({ sprite: f.sprite, dir: 'front' }, [], HOLD_POINTS.tray);
        return;
      }
      const dx = w.x - f.prev.x;
      const dy = w.y - f.prev.y;
      const moving = f.sprite.visible && Math.hypot(dx, dy) > 1e-4;
      f.prev.x = w.x;
      f.prev.y = w.y;
      let look: Look;
      let frame: number = CHAR_FRAMES.stand;
      if (moving) {
        look = walkFacing(f.look, dx, dy);
        frame = this.stepFrame(false, i * CHAR_WALK.stepSec);
      } else {
        look = this.waiterLook(w);
        if (WAITER_HANDS.includes(w.phase)) frame = CHAR_FRAMES.place;
      }
      this.placeStaff(f, 'waiter', i, w, look, frame);
      this.items.hold(
        { sprite: f.sprite, dir: look.dir },
        w.tray,
        frame === CHAR_FRAMES.place ? HOLD_POINTS.trayServe : HOLD_POINTS.tray,
      );
    });
    // Putzkräfte blicken zum Tisch bzw. beim Bodenwischen schräg zur Kamera.
    this.crowd.cleaners.forEach((c, i) => {
      const f = this.cleanerFigures[i];
      if (!f) return;
      if (!c.active) {
        if (f.sprite.visible) f.sprite.setVisible(false);
        f.look = null;
        return;
      }
      const dx = c.x - f.prev.x;
      const dy = c.y - f.prev.y;
      const moving = f.sprite.visible && Math.hypot(dx, dy) > 1e-4;
      f.prev.x = c.x;
      f.prev.y = c.y;
      if (moving) {
        this.placeStaff(
          f,
          'cleaner',
          i,
          c,
          walkFacing(f.look, dx, dy),
          this.stepFrame(false, i * CHAR_WALK.stepSec),
        );
        return;
      }
      const table = c.table >= 0 ? this.layout.tables[c.table] : undefined;
      const look = table
        ? facing(table.tile.x - c.x, table.tile.y - c.y)
        : c.phase === 'mop'
          ? facing(i % 2 ? 1 : 0, i % 2 ? 0 : 1)
          : facing(0, 1);
      const frame =
        c.phase === 'wipe' || c.phase === 'mop'
          ? this.cycleFrame(CHAR_WORK, i * 0.5)
          : CHAR_FRAMES.stand;
      this.placeStaff(f, 'cleaner', i, c, look, frame);
    });
  }

  /** Stehende Bedienung: zum Gast bzw. zum Tisch, an der Ausgabe zur Theke, beim Wegstellen nach hinten. */
  private waiterLook(w: Waiter): Look {
    const guest = w.target >= 0 ? this.crowd.agents[w.target] : undefined;
    if (w.phase === 'serve' && guest?.active && guest.table >= 0 && !guest.pickup)
      return facing(guest.x - w.x, guest.y - w.y);
    const table = w.table >= 0 ? this.layout.tables[w.table] : undefined;
    if (w.phase === 'clear' && table) return facing(table.tile.x - w.x, table.tile.y - w.y);
    if (w.phase === 'stash') return facing(0, -1);
    return facing(0, 1);
  }

  /** Ring-Pool: Bestellender, Baristas, wischende Putzkräfte. */
  private createRings(): void {
    const n = 1 + CROWD.maxBaristas + CROWD.maxCleaners;
    for (let i = 0; i < n; i++)
      this.ringPool.push(
        this.sprite(0, 0, FRAME.ring(0))
          .setOrigin(0.5, 1)
          .setDepth(DEPTH.label - 2)
          .setVisible(false),
      );
  }

  /** Teller/Becher auf der Ausgabe (Baristas stellen ab, Bedienungen nehmen mit). */
  private createPassItems(): void {
    const pass = this.layout.stations.find((s) => getStationDef(s.stationId).area === 'service');
    const tile = pass?.tile ?? this.layout.pickup.waiterHomes[0] ?? { x: 0, y: 0 };
    for (const slot of PASS_SLOTS.slice(0, CROWD.passItemsMax)) {
      const p = toScreen(tile.x + slot.u, tile.y + slot.v);
      this.passItemSprites.push(
        this.sprite(p.x, p.y - COUNTER_TOP_PX, FRAME.item('matcha'))
          .setOrigin(0.5, ITEM_ORIGIN_Y)
          .setDepth(isoDepth(tile.x, tile.y, 5.7))
          .setVisible(false),
      );
    }
  }

  private syncPassItems(): void {
    const items = this.crowd.passItems;
    this.passItemSprites.forEach((s, i) => {
      const station = items[i];
      if (station === undefined) {
        if (s.visible) s.setVisible(false);
        return;
      }
      const frame = FRAME.item(PASS_ITEMS[station] ?? 'matcha');
      if (s.frame.name !== frame) s.setFrame(frame);
      if (!s.visible) {
        s.setVisible(true);
        this.plop(s);
      }
    });
  }

  /** Getränke auf der Theke vor den Barhockern (eins je Hocker, an der Vorderkante der Platte). */
  private createStoolItems(): void {
    for (const stool of this.layout.bar.stools) {
      const p = this.stoolItemPoint(stool);
      this.stoolItems.push(
        this.sprite(p.x, p.y, FRAME.item('matcha'))
          .setOrigin(0.5, ITEM_ORIGIN_Y)
          .setDepth(isoDepth(Math.round(stool.x), stool.y - STOOL_ITEM_BACK, 5.7))
          .setVisible(false),
      );
    }
  }

  /** Bildschirmpunkt auf der Thekenplatte vor einem Hocker (Agenten-Koordinaten = Kachelmitte). */
  private stoolItemPoint(stool: GridPos): { x: number; y: number } {
    const p = toScreen(stool.x + 0.5, stool.y + 0.5 - STOOL_ITEM_BACK);
    return { x: p.x, y: p.y - COUNTER_TOP_PX };
  }

  /** Wer auf einem Hocker trinkt, hat sein Getränk vor sich stehen (was, hängt an der Figur und den Geräten). */
  private syncStoolItems(): void {
    const drinking = new Map<number, Agent>();
    for (const a of this.crowd.agents)
      if (a.active && a.phase === 'consume' && a.stool >= 0) drinking.set(a.stool, a);
    this.stoolItems.forEach((img, i) => {
      const a = drinking.get(i);
      if (!a) {
        if (img.visible) img.setVisible(false);
        return;
      }
      const posts = this.baristaPosts;
      const station = posts.length > 0 ? posts[a.id % posts.length]?.station : undefined;
      const frame = FRAME.item((station && PASS_ITEMS[station]) ?? 'matcha');
      if (img.frame.name !== frame) img.setFrame(frame);
      if (!img.visible) {
        img.setVisible(true);
        this.plop(img);
      }
    });
  }

  /** Geräte-Effekte (`STATION_FX`): Dampf, Frost, Glut, Pulver, Funkeln – nur solange ein Barista dort arbeitet. */
  private createStationFx(): void {
    for (const p of this.layout.stations) {
      const fx = STATION_FX[p.stationId];
      if (!fx) continue;
      // Anker gelten für Front nach +y; quer gestellt sind u und v vertauscht.
      const [u, v] = p.facesX ? [fx.v, fx.u] : [fx.u, fx.v];
      const at = toScreen(p.tile.x + u, p.tile.y + v);
      const x = at.x;
      const y = at.y - fx.z;
      const local = isoDepth(p.tile.x, p.tile.y, 5.8);
      const particles = (
        frame: string,
        cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig,
      ) =>
        this.add.particles(x, y, ATLAS.common, {
          frame,
          emitting: false,
          frequency: fx.burst ? -1 : 1000 / fx.rate,
          ...cfg,
        });
      let emitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
      let glow: Phaser.GameObjects.Image | null = null;
      switch (fx.kind) {
        case 'steam':
          emitter = particles(FRAME.steam, {
            speedY: { min: -26, max: -14 },
            speedX: { min: -6, max: 6 },
            lifespan: 1500,
            scale: { start: ART_SCALE * 0.5, end: ART_SCALE * 1.5 },
            alpha: { start: 0.85, end: 0 },
          }).setDepth(DEPTH.label - 3);
          break;
        case 'frost':
          emitter = particles(FRAME.frost, {
            speed: { min: 6, max: 16 },
            angle: { min: 40, max: 140 },
            gravityY: 12,
            lifespan: 900,
            scale: { start: ART_SCALE, end: ART_SCALE * 0.4 },
            alpha: { start: 1, end: 0 },
            emitZone: {
              type: 'random' as const,
              source: new Phaser.Geom.Rectangle(-8, -10, 16, 14),
              quantity: 1,
            },
          }).setDepth(local);
          break;
        case 'powder':
          emitter = particles(FRAME.powder, {
            speedX: { min: -10, max: 10 },
            speedY: { min: -8, max: 4 },
            gravityY: 40,
            lifespan: 650,
            scale: { start: ART_SCALE, end: ART_SCALE * 0.5 },
            alpha: { start: 1, end: 0 },
          }).setDepth(local);
          break;
        case 'sparkle':
          emitter = particles(FRAME.sparkle, {
            speed: { min: 4, max: 12 },
            lifespan: 800,
            scale: { start: ART_SCALE, end: 0 },
            alpha: { start: 1, end: 0 },
            emitZone: {
              type: 'random' as const,
              source: new Phaser.Geom.Rectangle(-10, -8, 20, 12),
              quantity: 1,
            },
          }).setDepth(local);
          break;
        case 'glow':
          glow = this.sprite(x, y, FRAME.glow)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(ART_SCALE * 0.75, ART_SCALE * 0.45)
            .setDepth(local)
            .setAlpha(0);
          emitter = particles(FRAME.steam, {
            speedY: { min: -18, max: -10 },
            speedX: { min: -4, max: 4 },
            lifespan: 1200,
            scale: { start: ART_SCALE * 0.4, end: ART_SCALE * 1.1 },
            alpha: { start: 0.5, end: 0 },
            y: -18,
          }).setDepth(DEPTH.label - 3);
          break;
      }
      this.stationFx.push({
        stationId: p.stationId,
        emitter,
        glow,
        burst: !!fx.burst,
        nextBurst: 0,
        running: false,
      });
    }
  }

  private syncStationFx(dt: number): void {
    const still = reducedMotion();
    const t = this.walkClock;
    for (const v of this.stationFx) {
      // Nur in den Schritten, in denen das Gerät wirklich dampft, glüht oder mahlt (`WORK_SCRIPTS`).
      const run =
        !still &&
        this.crowd.baristas.some(
          (b) =>
            b.active &&
            b.station === v.stationId &&
            b.phase === 'work' &&
            workStepAt(v.stationId, b.workTotal > 0 ? 1 - b.timer / b.workTotal : 0).fx === true,
        );
      if (v.burst) {
        if (run && t >= v.nextBurst) {
          v.emitter?.explode(STATION_FX[v.stationId]?.rate ?? 4);
          v.nextBurst = t + 1.2 + Math.random() * 1.2;
        }
      } else if (run !== v.running) {
        if (run) v.emitter?.start();
        else v.emitter?.stop();
      }
      v.running = run;
      if (v.glow)
        v.glow.setAlpha(run ? 0.45 + 0.25 * Math.sin(t * 5) : Math.max(0, v.glow.alpha - dt * 2));
      // Die Steinmühle rüttelt, solange sie mahlt.
      if (STATION_FX[v.stationId]?.kind === 'powder') {
        const view = this.stations.find((s) => s.id === v.stationId);
        if (view) view.sprite.setX(view.baseX + (run ? Math.sin(t * 45) * 0.45 : 0));
      }
    }
  }

  /** Atmosphäre: Musiknoten über der Anlage, Dampf über den Tassen besetzter Tische (kosmetisch). */
  private createAmbientFx(): void {
    const music = this.layout.ambience.find((a) => a.id === 'music');
    if (music) {
      const w = this.world(music.tile);
      this.notes = this.add
        .particles(w.x, w.y - 8, ATLAS.common, {
          frame: FRAME.note,
          speedY: { min: -16, max: -9 },
          speedX: { min: -8, max: 8 },
          lifespan: 1800,
          frequency: 900,
          scale: { start: ART_SCALE * 0.9, end: ART_SCALE * 0.6 },
          alpha: { start: 0.9, end: 0 },
          rotate: { min: -15, max: 15 },
          emitting: false,
        })
        .setDepth(DEPTH.label - 3);
    }
    this.cupSteam = this.add
      .particles(0, 0, ATLAS.common, {
        frame: FRAME.steam,
        speedY: { min: -12, max: -7 },
        speedX: { min: -3, max: 3 },
        lifespan: 1300,
        scale: { start: ART_SCALE * 0.3, end: ART_SCALE * 0.8 },
        alpha: { start: 0.6, end: 0 },
        emitting: false,
      })
      .setDepth(DEPTH.label - 3);
  }

  private updateAmbientFx(dt: number): void {
    const still = reducedMotion();
    const loc = getLocation(this.store.getState(), this.locationId);
    const music = !still && (loc.ambience['music'] ?? 0) > 0;
    if (this.notes && music !== this.notes.emitting) {
      if (music) this.notes.start();
      else this.notes.stop();
    }
    if (still || !this.cupSteam) return;
    // Etwa ein Wölkchen je Sekunde über einem zufälligen Gast, der gerade trinkt.
    this.cupSteamAcc += dt;
    if (this.cupSteamAcc < 0.5) return;
    this.cupSteamAcc = 0;
    const drinking = this.crowd.agents.filter(
      (a) => a.active && a.phase === 'consume' && (a.table >= 0 || a.stool >= 0),
    );
    const a = drinking[Math.floor(Math.random() * drinking.length)];
    if (!a) return;
    const stool = this.layout.bar.stools[a.stool];
    if (stool) {
      const p = this.stoolItemPoint(stool);
      this.cupSteam.emitParticleAt(p.x, p.y - 10);
      return;
    }
    const table = this.layout.tables[a.table];
    if (!table) return;
    const p = toScreen(table.tile.x + 0.5 + (a.seat ? 0.12 : -0.12), table.tile.y + 0.5);
    this.cupSteam.emitParticleAt(p.x, p.y - 20);
  }

  /** Kassieren: Lade fährt aus, ein paar Funken. */
  private openDrawer(): void {
    const register = this.stations.find((v) => v.id === REGISTER_ID);
    if (!register || register.shownLevel <= 0) return;
    this.drawerUntil = this.time.now + SCENE_FX.drawerOpenMs;
    if (!reducedMotion()) {
      const b = this.restBounds(register.sprite);
      this.sparkles.explode(3, b.centerX, b.bottom - TILE_H - COUNTER_TOP_PX);
    }
  }

  private syncDrawer(): void {
    const register = this.stations.find((v) => v.id === REGISTER_ID);
    if (!register || register.shownLevel <= 0) return;
    const open = this.time.now < this.drawerUntil;
    if (open === this.drawerShown) return;
    this.drawerShown = open;
    const { shownLevel: level, placement } = register;
    register.sprite.setFrame(
      open
        ? FRAME.registerOpen(level, placement.facesX)
        : FRAME.station(REGISTER_ID, level, placement.facesX),
    );
  }

  private syncDirt(): void {
    this.tables.forEach((v, i) => {
      const show = v.sprite.visible && this.crowd.dirty.has(i);
      if (v.dirt.visible !== show) v.dirt.setVisible(show);
    });
  }

  private syncAgents(currentMood: string): void {
    const agents = this.crowd.agents;
    const moodFrame = FRAME.mood(currentMood);
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      const s = this.agentSprites[i];
      const m = this.moodSprites[i];
      const prev = this.agentPrev[i];
      if (!a || !s || !m || !prev) continue;
      if (!a.active) {
        s.setVisible(false);
        m.setVisible(false);
        this.agentLook[i] = null;
        this.items.hold({ sprite: s, dir: 'front' }, [], HOLD_POINTS.carry);
        continue;
      }
      const p = toScreen(a.x, a.y);
      const x = p.x;
      const y = p.y + TILE_H / 2;
      const seated = a.phase === 'consume' || (a.phase === 'waitServe' && a.table >= 0);
      const onStool = seated && a.stool >= 0;
      if (seated) {
        // Sitzpose, Blick zum Tisch bzw. vom Barhocker zur Theke (Richtung und Spiegelung wie beim Gehen).
        const tb = this.layout.tables[a.table];
        const look = onStool
          ? facing(0, -1)
          : tb
            ? facing(tb.tile.x - a.x, tb.tile.y - a.y)
            : facing(0, 1);
        const frame = FRAME.customerSit(a.type, a.look, look.dir);
        if (s.frame.name !== frame) s.setFrame(frame);
        s.setFlipX(look.flip);
        this.agentLook[i] = null;
      } else {
        const dx = a.x - prev.x;
        const dy = a.y - prev.y;
        const moving = s.visible && Math.hypot(dx, dy) > 1e-4;
        const carrying = a.carry !== null;
        let look: Look;
        if (moving) look = walkFacing(s.visible ? (this.agentLook[i] ?? null) : null, dx, dy);
        else if (a.phase === 'queue' || a.phase === 'order') look = this.queueLook(a);
        // An der Ausgabe und an der Rückgabe zur Theke.
        else if (a.pickup || a.phase === 'returnDishes') look = facing(0, -1);
        else look = facing(0, 1);
        this.agentLook[i] = look;
        const frameNo = moving
          ? this.stepFrame(carrying, a.id * CHAR_WALK.stepSec)
          : carrying
            ? CHAR_FRAMES.carry[0]
            : CHAR_FRAMES.stand;
        const frame = FRAME.customer(a.type, a.look, look.dir, frameNo);
        if (s.frame.name !== frame) s.setFrame(frame);
        s.setFlipX(look.flip);
      }
      prev.x = a.x;
      prev.y = a.y;
      // Auf dem Barhocker sitzt man höher als auf einem Stuhl. Auf dem Gehweg blenden Gäste ein und aus.
      s.setVisible(true)
        .setAlpha(a.fade)
        .setPosition(x, onStool ? y - STOOL_SEAT_LIFT : y)
        .setDepth(isoDepth(a.x, a.y, 6));
      // Becher, Teller oder Geschirr in der Hand (Selbstbedienung, Abholer mit dem Becher hinaus).
      this.items.hold(
        { sprite: s, dir: this.agentLook[i]?.dir ?? 'front' },
        a.carry !== null && !seated ? [a.carry] : [],
        HOLD_POINTS.carry,
      );
      // Smiley nur über den sichtbaren Schlangenplätzen, nicht über dem Grüppchen dahinter.
      const queueing = a.phase === 'queue' && this.crowd.queueIndex(a) < CROWD.maxQueue;
      m.setVisible(queueing);
      if (queueing) {
        if (m.frame.name !== moodFrame) m.setFrame(moodFrame);
        m.setPosition(x, y - CHAR_OVERLAY_Y).setDepth(DEPTH.label - 1);
      }
    }
  }

  /** Wartende blicken nach vorn in der Schlange, wer bestellt, zur Kasse. */
  private queueLook(a: Agent): Look {
    const { queue, access } = this.layout.order;
    const idx = this.crowd.queueIndex(a);
    const reg = this.layout.stations.find((s) => s.stationId === REGISTER_ID)?.tile ?? access;
    const ahead = idx <= 0 ? reg : (queue[Math.min(idx, queue.length) - 1] ?? access);
    return facing(ahead.x - a.x, ahead.y - a.y);
  }

  /**
   * Fortschrittsringe (UI_STYLE § 3.10): über dem Gast, der gerade bestellt, über arbeitenden Baristas und über
   * Putzkräften, die einen Tisch wischen. Vorgerenderte Frames, damit der Ring in jedem Zoom sauber bleibt.
   */
  private drawRings(): void {
    let used = 0;
    const ring = (gx: number, gy: number, frac: number): void => {
      const img = this.ringPool[used++];
      if (!img) return;
      const step = Math.round(Phaser.Math.Clamp(frac, 0, 1) * SCENE_FX.ringSteps);
      const name = FRAME.ring(step);
      if (img.frame.name !== name) img.setFrame(name);
      const p = toScreen(gx, gy);
      img.setPosition(p.x, p.y + TILE_H / 2 - CHAR_OVERLAY_Y - SCENE_FX.ringLift).setVisible(true);
    };
    for (const a of this.crowd.agents) {
      if (!a.active || a.phase !== 'order' || a.serveTotal <= 0) continue;
      ring(a.x, a.y, 1 - a.timer / a.serveTotal);
    }
    if (!reducedMotion()) {
      for (const b of this.crowd.baristas)
        if (b.active && b.phase === 'work' && b.workTotal > 0)
          ring(b.x, b.y, 1 - b.timer / b.workTotal);
      for (const c of this.crowd.cleaners)
        if (c.active && c.phase === 'wipe') ring(c.x, c.y, 1 - c.timer / CROWD.wipeSec);
    }
    for (let i = used; i < this.ringPool.length; i++) {
      const img = this.ringPool[i];
      if (img?.visible) img.setVisible(false);
    }
  }

  /** Bestellung ist da: ab und zu ein Emote (das Geld kam schon beim Bezahlen an der Kasse). */
  private onServed(a: Agent): void {
    if (Math.random() < SCENE_FX.emoteChance) this.emote(a.x, a.y);
  }

  /**
   * Bezahlt (GAME_DESIGN § 7.2): `core` hat gerade so viele Gäste gebucht. Die Lade fährt aus, über jedem
   * zahlenden Gast steht sein Betrag, ein Geldschein fliegt von der Kasse ins HUD. Zahlungen ohne Figur an der
   * Kasse (mehr Gäste, als Figuren hineinpassen) zeigt ein Betrag über der Kasse.
   */
  private onPayments(count: number, payers: readonly Agent[]): void {
    this.openDrawer();
    const register = this.layout.stations.find((st) => st.stationId === REGISTER_ID);
    const at = register?.tile ?? this.layout.order.access;
    const from = payers[0] ?? at;
    this.cashBatch += count;
    this.cashBatchAt = { x: from.x, y: from.y };
    this.flushCashPopup();
    for (let i = 0; i < Math.min(count, SCENE_FX.cashFlyMax); i++)
      this.cashFly(from.x, from.y, i * SCENE_FX.cashFlyStaggerMs);
    this.game.events.emit(UI_EVENTS.sfx, 'coin');
  }

  /**
   * Pool wächst bei Bedarf bis `POPUP_POOL`: jeder Text ist ein eigenes Canvas mit GPU-Textur, 24 davon
   * beim Start anzulegen kostete auf schwachen Geräten einen spürbaren Teil des Szenen-Aufbaus.
   */
  private freePopup(): Phaser.GameObjects.Text | null {
    const free = this.popups.find((p) => !p.visible);
    if (free || this.popups.length >= POPUP_POOL) return free ?? null;
    const popup = this.makeText(12, UI_THEME.goldCss).setVisible(false).setDepth(DEPTH.overlay);
    popup.setScale(Phaser.Math.Clamp(1 / this.cameras.main.zoom, 1, LABEL_MAX_SCALE));
    this.popups.push(popup);
    return popup;
  }

  /** Betrag über der Kasse; kommen Zahlungen schneller als `cashPopupMinMs`, steht die Summe in einem Betrag. */
  private flushCashPopup(): void {
    if (this.cashBatch <= 0 || this.time.now < this.cashPopupAt + SCENE_FX.cashPopupMinMs) return;
    this.cashPopup(this.cashBatchAt.x, this.cashBatchAt.y, this.cashBatch);
    this.cashBatch = 0;
    this.cashPopupAt = this.time.now;
  }

  /** „+Betrag“ über dem zahlenden Gast (bzw. der Kasse) für `customers` Gäste. */
  private cashPopup(gx: number, gy: number, customers: number): void {
    const r = this.rates;
    if (!r || r.served <= 0) return;
    const popup = this.freePopup();
    if (!popup) return;
    // Bei gleichbleibenden Raten zahlt jeder Gast genau den Durchschnittsbon (`settleTill`).
    const ticket = r.incomePerHour.div(new Decimal(r.served)).mul(customers);
    const p = toScreen(gx, gy);
    popup
      .setColor(UI_THEME.goldCss)
      .setText(t('scene.coinPopup', { amount: formatMoney(ticket, getLang()) }))
      .setPosition(p.x, p.y - 10)
      .setAlpha(1)
      .setVisible(true);
    this.tweens.add({
      targets: popup,
      y: p.y - 40,
      alpha: 0,
      duration: 900,
      onComplete: () => popup.setVisible(false),
    });
  }

  /**
   * Geldschein fliegt vom zahlenden Gast zum Geld im HUD (nur Optik, gebucht ist schon). Er hat in jedem Zoom
   * dieselbe Bildschirmgröße (`SCENE_FX.cashBillPx`), und das Ziel folgt der Kamera, auch wenn man währenddessen
   * schiebt oder zoomt.
   */
  private cashFly(gx: number, gy: number, delayMs: number): void {
    if (this.cashFlying >= SCENE_FX.cashFlyMax || reducedMotion()) return;
    this.cashFlying++;
    const cam = this.cameras.main;
    const p = toScreen(gx, gy);
    const bill = this.sprite(p.x, p.y, FRAME.cash)
      .setDepth(DEPTH.overlay + 1)
      .setVisible(false);
    const fly = { t: 0 };
    const place = (): void => {
      const z = cam.zoom;
      const e = Phaser.Math.Easing.Cubic.In(fly.t);
      const to = cam.getWorldPoint(HUD_CASH.x, HUD_CASH.y);
      const fromX = p.x + SCENE_FX.cashBillOffset.x / z;
      const fromY = p.y - CASH_BILL_LIFT + SCENE_FX.cashBillOffset.y / z;
      const px = Phaser.Math.Linear(SCENE_FX.cashBillPx, SCENE_FX.cashBillEndPx, e);
      bill
        .setPosition(Phaser.Math.Linear(fromX, to.x, e), Phaser.Math.Linear(fromY, to.y, e))
        .setScale(px / z / bill.frame.width)
        .setAngle(Phaser.Math.Linear(-12, 8, e));
    };
    this.tweens.add({
      targets: fly,
      t: 1,
      delay: delayMs,
      duration: SCENE_FX.cashFlyMs,
      onStart: () => {
        place();
        bill.setVisible(true);
      },
      onUpdate: place,
      onComplete: () => {
        bill.destroy();
        this.cashFlying--;
      },
    });
  }

  /** Gast-Emote nach dem Bedienen: Herz, Note oder Stern in einer Sprechblase. */
  private emote(gx: number, gy: number): void {
    const e = this.emotes.find((x) => !x.visible);
    if (!e) return;
    const kinds = ['heart', 'note', 'star'] as const;
    const kind = kinds[Math.floor(Math.random() * kinds.length)] ?? 'heart';
    const p = toScreen(gx, gy);
    const top = p.y + TILE_H / 2 - CHAR_OVERLAY_Y;
    e.setFrame(FRAME.emote(kind))
      .setPosition(p.x + 8, top)
      .setAlpha(1)
      .setVisible(true);
    if (reducedMotion()) {
      this.time.delayedCall(SCENE_FX.emoteMs, () => e.setVisible(false));
      return;
    }
    this.tweens.add({
      targets: e,
      y: top - 12,
      alpha: { from: 1, to: 0 },
      duration: SCENE_FX.emoteMs,
      ease: 'Quad.In',
      onComplete: () => e.setVisible(false),
    });
  }

  /**
   * Antippen eines Objekts öffnet direkt sein Upgrade-Panel (`pickTapTarget`), Antippen des Bodens füllt den Hype.
   * `over` enthält alle Objekte unter dem Finger, oberstes zuerst (`input.topOnly = false`).
   */
  private onPointerUp(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (this.controls.isDrag()) return;
    const target = pickTapTarget(
      over.flatMap((o) => {
        const id: unknown = o.getData(TAP_TARGET_KEY);
        return typeof id === 'string' ? [{ target: id, solid: this.solidAt(o, p) }] : [];
      }),
    );
    if (target) {
      this.game.events.emit(UI_EVENTS.openStation, target);
      return;
    }
    const g = toGrid(p.worldX, p.worldY);
    const b = layoutBounds(this.layout, this.terraceLevel);
    if (g.x < b.x0 || g.y < b.y0 || g.x >= b.x1 || g.y >= b.y1) return;
    let accepted = false;
    this.store.dispatch((s) => {
      const r = tapCafe(s, this.locationId);
      accepted = r.accepted;
      return r.state;
    });
    if (accepted) {
      this.leaves.explode(8, p.worldX, p.worldY);
      this.game.events.emit(UI_EVENTS.sfx, 'tap');
    }
  }

  /** Liegt unter dem Zeiger ein sichtbares Pixel des Sprites? Die Warteschlangen-Tafel (Graphics) zählt ganz. */
  private solidAt(o: Phaser.GameObjects.GameObject, p: Phaser.Input.Pointer): boolean {
    if (!(o instanceof Phaser.GameObjects.Image)) return true;
    const local = o.getLocalPoint(p.worldX, p.worldY);
    const alpha = this.textures.getPixelAlpha(local.x, local.y, o.texture.key, o.frame.name);
    // Außerhalb des beschnittenen Bilds liefert Phaser `null` (die Typen sagen `number`).
    return ((alpha as number | null) ?? 0) >= SCENE_FX.tapAlpha;
  }

  /** Debug-Taste B (nur im Dev-Server): günstigste kaufbare Ausstattung um 1 Level erhöhen. */
  private debugBuy(): void {
    const state = this.store.getState();
    const loc = getLocation(state, this.locationId);
    let best: { id: string; cost: Decimal } | null = null;
    for (const def of STATIONS) {
      if (!isStationUnlocked(state, this.locationId, def.id)) continue;
      const cost = getBulkCost(state, this.locationId, def.id, 1);
      if (cost.gt(loc.coins)) continue;
      if (!best || cost.lt(best.cost)) best = { id: def.id, cost };
    }
    if (!best) return;
    const id = best.id;
    this.store.dispatch((s) => buyStation(s, this.locationId, id, 1));
    this.refreshStations(this.store.getState(), true);
  }
}
