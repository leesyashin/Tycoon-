import Phaser from 'phaser';
import {
  getLayout,
  inRoom,
  layoutExtent,
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
  CHAR_FRAMES,
  CHAR_WALK,
  CUSTOMER_LOOKS,
  DECOR_BIG,
  DECOR_BIG_FRAMES,
  SCENE_FX,
  counterLookTier,
  counterPropsAt,
  staffLookFor,
  stationLookTier,
  tableLookTier,
  type LookTier,
} from '@data/art';
import type { StaffRoleId } from '@data/staff';
import { DAY_CYCLE, UI_THEME } from '@data/ui';
import { getLocation, type GameState } from '@core/GameState';
import type { Store } from '@core/store';
import { computeLocationRates, mood, tapCafe, type LocationRates } from '@core/customers';
import { buyStation, getBulkCost, isStationUnlocked, needsTerrace } from '@core/economy';
import { getStaffLevel } from '@core/staff';
import { formatNumber } from '@core/math/format';
import { getEventOverlay } from '@core/events';
import { equippedSkinTints } from '@core/leaves';
import { getCafeClock } from '@core/time/dayCycle';
import type { EventOverlay } from '@data/events';
import { Decimal } from '@core/math/bignum';
import { getLang, t } from '@i18n/index';
import { CustomerCrowd, type Agent } from './agents/crowd';
import { CameraControls } from './cameraControls';
import { CityView } from './city/CityView';
import { TILE_H, TILE_W, isoDepth, toGrid, toScreen } from './iso/iso';
import { ART_SCALE, ATLAS, CHAR_FOOT_ORIGIN_Y, CHAR_OVERLAY_Y, FRAME, atlasUrls } from './art';
import { REGISTRY, UI_EVENTS, getStore } from './registry';

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
/** HUD-Münzsymbol in CSS-Pixeln vom linken oberen Rand (Ziel des Münz-Flugs). */
const HUD_COIN = { x: 34, y: 34 };
const DEPTH = { wall: -2000, floor: -1000, label: 10_000, overlay: 20_000 } as const;
/** Tisch-Objekt-ID für das Antippen (öffnet das Ambiente-Panel „Tische“). */
const TABLE_OBJECT = 'ambience:seats';

interface StationView {
  id: string;
  placement: StationPlacement;
  sprite: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  /** Label-Höhe ohne Versatz und ob es beim Herauszoomen versetzt wird (jedes zweite Rückwand-Gerät). */
  labelY: number;
  stagger: boolean;
  shownLevel: number;
  /** Gezeigter Sperrzustand: frei, Café-Level fehlt oder Terrasse fehlt. */
  shownLock: 'open' | 'level' | 'terrace' | '';
  /** Gezeigte Skin-Tönung (0xffffff = keine). */
  shownTint: number;
}

interface TableView {
  placement: TablePlacement;
  sprite: Phaser.GameObjects.Image;
  dirt: Phaser.GameObjects.Image;
}

/** Modul der Gästetheke (auch unter Kasse und Ausgabe). */
interface CounterView {
  x: number;
  sprite: Phaser.GameObjects.Image;
  /** Deko-Variante (`COUNTER_PROPS`), 0 unter einem Gerät. */
  variant: number;
  facesX: boolean;
}

interface StaffFigure {
  sprite: Phaser.GameObjects.Image;
  prev: { x: number; y: number };
}

/** Größe der Farbfilter (Event, Nacht): deckt jeden Kamera-Ausschnitt ab, egal wie weit gezoomt. */
const OVERLAY_SIZE = 20_000;

// Einmal abfragen, `matches` folgt Änderungen live (vorher lief `matchMedia` in jedem Frame).
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const reducedMotion = (): boolean => motionQuery.matches;

/** Blickrichtung einer Figur aus einem Bewegungs-/Blickvektor im Grid. */
function facing(dx: number, dy: number): { dir: 'front' | 'back'; flip: boolean } {
  if (Math.abs(dx) > Math.abs(dy)) return { dir: dx > 0 ? 'front' : 'back', flip: true };
  return { dir: dy >= 0 ? 'front' : 'back', flip: false };
}

/** Frame im Lauf-Zyklus nach `sec` Sekunden Gehen. */
function walkFrame(sec: number): number {
  const c = CHAR_WALK.cycle;
  return c[Math.floor(sec / CHAR_WALK.stepSec) % c.length] ?? CHAR_FRAMES.stand;
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
  private stations: StationView[] = [];
  private tables: TableView[] = [];
  private counters: CounterView[] = [];
  /** Gezeigte Optik-Stufe der Theke (0 bis zum ersten Zeichnen). */
  private shownCounterTier = 0;
  private sparkles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private agentSprites: Phaser.GameObjects.Image[] = [];
  private agentPrev: { x: number; y: number }[] = [];
  private waiterFigures: StaffFigure[] = [];
  private cleanerFigures: StaffFigure[] = [];
  private cashierFigures: Phaser.GameObjects.Image[] = [];
  private baristaFigures: { stationId: string; sprite: Phaser.GameObjects.Image }[] = [];
  private popups: Phaser.GameObjects.Text[] = [];
  private emotes: Phaser.GameObjects.Image[] = [];
  private coinsFlying = 0;
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
  private rings!: Phaser.GameObjects.Graphics;
  private board: { text: Phaser.GameObjects.Text; bg: Phaser.GameObjects.Graphics } | null = null;
  private shownQueue = -1;
  private steam: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private walkClock = 0;
  private fx: Partial<
    Record<NonNullable<EventOverlay['particles']>, Phaser.GameObjects.Particles.ParticleEmitter>
  > = {};
  private overlayKey = '';

  constructor() {
    super('CafeScene');
  }

  /** Läuft vor jedem `create`, auch bei `scene.restart()`: die Szene-Instanz bleibt dieselbe. */
  init(): void {
    this.stations = [];
    this.tables = [];
    this.counters = [];
    this.shownCounterTier = 0;
    this.agentSprites = [];
    this.agentPrev = [];
    this.waiterFigures = [];
    this.cleanerFigures = [];
    this.cashierFigures = [];
    this.baristaFigures = [];
    this.popups = [];
    this.emotes = [];
    this.coinsFlying = 0;
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
    this.steam = null;
    this.walkClock = 0;
    this.fx = {};
    this.overlayKey = '';
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
    this.layout = getLayout(this.locationId);
    this.crowd = new CustomerCrowd(this.layout, this.locationId);

    // Stadtviertel zuerst: liegt komplett hinter dem Café (eigene, negative Tiefen).
    const n = this.layout.gridSize;
    this.city = new CityView(
      this,
      this.locationId,
      { x0: 0, y0: 0, x1: n, y1: n },
      DEPTH.overlay - 1,
    );
    this.drawRoom();
    this.createCounter();
    this.createStations();
    this.createTables();
    this.createAmbience(state);
    this.agentSprites = this.crowd.agents.map(() =>
      this.sprite(0, 0, FRAME.customer('student', CUSTOMER_LOOKS.student[0] ?? '', 'front', 0))
        .setOrigin(0.5, CHAR_FOOT_ORIGIN_Y)
        .setVisible(false),
    );
    this.agentPrev = this.crowd.agents.map(() => ({ x: 0, y: 0 }));
    this.moodSprites = this.crowd.agents.map(() =>
      this.sprite(0, 0, FRAME.mood('happy')).setOrigin(0.5, 1).setVisible(false),
    );
    this.rings = this.add.graphics().setDepth(DEPTH.label - 2);
    this.createStaff();
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
    this.createSteam();
    // Schwenken über das Viertel, ohne je einen Rand zu sehen; die Startansicht passt auf den Raum (`fitCamera`).
    this.controls = new CameraControls(this, CityView.viewLimits());
    this.fitCamera();
    const onResize = (): void => this.fitCamera();
    this.scale.on('resize', onResize);

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
      this.refreshStations(state, true);
      this.refreshTables(state, true);
      this.createAmbience(state);
      this.refreshStaff(state);
      this.refreshEventFx(state);
      this.refreshNight(state);
      this.refreshBoard();
    }
    const loc = getLocation(state, this.locationId);
    const { purchases } = this.crowd.update(dt, {
      served: this.visibleServed(this.rates),
      orderCap: this.rates.stages.order,
      waiters: getStaffLevel(loc, 'waiter'),
      cleaners: getStaffLevel(loc, 'cleaner'),
      tables: loc.ambience['seats'] ?? 0,
      terrace: loc.ambience['terrace'] ?? 0,
      cleanliness: loc.cleanliness,
    });
    this.syncAgents(mood(loc.satisfaction));
    this.syncStaffFigures();
    this.syncDirt();
    this.drawRings();
    for (const a of purchases) this.onPurchase(a);
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
  }

  /** Gäste/s für die Figuren; im Debug-Modus kosmetisch auf `debugSpawn` gesetzt (nie für Einnahmen). */
  private visibleServed(r: LocationRates): number {
    return this.debugSpawn > 0 ? this.debugSpawn : r.served;
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
    const r = this.room;
    const zoom = Math.min(
      this.scale.width / (r.width + TILE_W),
      this.scale.height / (r.height + TILE_H * 2),
    );
    this.controls.setZoom(zoom);
    this.cameras.main.centerOn(r.centerX, r.centerY);
    this.controls.clamp();
  }

  /** Steht auf dieser Kachel ein Möbel (Theke, Gerät), das die niedrige Vorderwand ersetzt? */
  private furnitureAt(x: number, y: number): boolean {
    return (
      this.layout.stations.some((s) => s.tile.x === x && s.tile.y === y) ||
      this.layout.counter.some((c) => c.x === x && c.y === y)
    );
  }

  /**
   * Boden, hohe Rückwände mit Leuchtkasten/Fenstern, niedrige Vorderwände (Dollhouse-Schnitt, UI_STYLE § 4).
   * Der Grundriss ist ein L: Raster plus Wintergarten vorn links mit Holzboden und Glaswänden; Wände entstehen
   * überall dort, wo eine Raumkachel an eine Nicht-Raumkachel grenzt.
   */
  private drawRoom(): void {
    const n = this.layout.gridSize;
    const theme = ATLAS.theme(this.locationId);
    const { entrance, annex } = this.layout;
    const inAnnex = (x: number, y: number) =>
      x >= annex.from.x && x <= annex.to.x && y >= annex.from.y && y <= annex.to.y;
    const w = Math.max(n, annex.to.x + 1);
    const h = Math.max(n, annex.to.y + 1);
    for (let gy = 0; gy < h; gy++) {
      for (let gx = 0; gx < w; gx++) {
        if (!inRoom(this.layout, gx, gy)) continue;
        const p = toScreen(gx, gy);
        const isEntrance = gx === entrance.x && gy === entrance.y;
        const checker = (gx + gy) % 2 ? 'a' : 'b';
        const frame = isEntrance
          ? 'entrance'
          : inAnnex(gx, gy)
            ? `floor-wg-${checker}`
            : `floor-${checker}`;
        this.sprite(p.x, p.y, frame, theme).setOrigin(0.5, 0).setDepth(DEPTH.floor);
      }
    }
    for (let i = 0; i < n; i++) {
      const window = i % WINDOW_EVERY === 1;
      const pu = toScreen(i, 0);
      this.sprite(pu.x, pu.y - WALL_H - 4, window ? 'wall-u-deco' : 'wall-u', theme)
        .setOrigin(0, 0)
        .setDepth(DEPTH.wall);
      const pv = toScreen(0, i);
      this.sprite(pv.x - TILE_W / 2, pv.y - WALL_H - 4, window ? 'wall-v-deco' : 'wall-v', theme)
        .setOrigin(0, 0)
        .setDepth(DEPTH.wall);
      if (window) {
        // Licht nachts (additiv, Alpha folgt der Tageszeit).
        this.glows.push(
          this.sprite(pu.x + TILE_W / 4, pu.y - 30, FRAME.glow)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDepth(DEPTH.wall + 1)
            .setAlpha(0),
          this.sprite(pv.x - TILE_W / 4, pv.y - 30, FRAME.glow)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDepth(DEPTH.wall + 1)
            .setAlpha(0),
        );
      }
    }
    // Wintergarten: hohe Glaswand an der linken Seite (x = 0), sie verdeckt den Gehweg dahinter nicht.
    for (let y = annex.from.y; y <= annex.to.y; y++) {
      const pv = toScreen(0, y);
      this.sprite(pv.x - TILE_W / 2, pv.y - WALL_H - 4, 'glass-back-v', theme)
        .setOrigin(0, 0)
        .setDepth(DEPTH.wall);
    }
    // Vorderwände (25 %) bzw. Glaswände des Wintergartens an allen offenen Kanten, Lücke am Eingang und an Möbeln.
    for (let gy = 0; gy < h; gy++) {
      for (let gx = 0; gx < w; gx++) {
        if (!inRoom(this.layout, gx, gy)) continue;
        const glass = inAnnex(gx, gy);
        const pf = toScreen(gx, gy);
        const wallH = glass ? GLASS_H : FRONT_WALL_H;
        if (!inRoom(this.layout, gx, gy + 1) && !(gx === entrance.x && gy === entrance.y))
          this.sprite(pf.x - TILE_W / 2, pf.y - wallH - 2, glass ? 'glass-u' : 'front-u', theme)
            .setOrigin(0, 0)
            .setDepth(isoDepth(gx, gy, 9));
        if (!inRoom(this.layout, gx + 1, gy) && !this.furnitureAt(gx, gy))
          this.sprite(pf.x - TILE_W / 2, pf.y - wallH - 2, glass ? 'glass-v' : 'front-v', theme)
            .setOrigin(0, 0)
            .setDepth(isoDepth(gx, gy, 9));
      }
    }
  }

  /**
   * Durchgehende Gästetheke in der Optik-Stufe des Cafés. Unter Kasse und Ausgabe liegt ein leeres Modul,
   * auf dem das Gerät steht; Antippen öffnet die Kasse bzw. das Gerät darauf.
   */
  private createCounter(): void {
    const modules = [
      ...this.layout.counter.map((tile) => ({
        tile,
        stationId: REGISTER_ID,
        variant: counterPropsAt(tile.x),
        facesX: false,
      })),
      ...this.layout.stations
        .filter((p) => getStationDef(p.stationId).area !== 'bar')
        .map((p) => ({ tile: p.tile, stationId: p.stationId, variant: 0, facesX: p.facesX })),
    ];
    for (const m of modules) {
      const w = this.world(m.tile);
      const sprite = this.sprite(
        w.x,
        w.y + TILE_H,
        FRAME.counter(1, m.variant, m.facesX),
        ATLAS.furniture,
      )
        .setOrigin(0.5, 1)
        .setDepth(isoDepth(m.tile.x, m.tile.y, 5))
        .setInteractive({ useHandCursor: true, pixelPerfect: false })
        .setData('stationId', m.stationId);
      this.counters.push({ x: m.tile.x, sprite, variant: m.variant, facesX: m.facesX });
    }
    this.counters.sort((a, b) => a.x - b.x);
  }

  /** Theke folgt dem Café-Level (`COUNTER_LOOK_CAFE_LEVELS`); beim Aufstieg ploppen die Module nacheinander. */
  private refreshCounter(state: GameState, animate: boolean): void {
    const tier: LookTier = counterLookTier(getLocation(state, this.locationId).level);
    if (tier === this.shownCounterTier) return;
    const upgrade = animate && this.shownCounterTier > 0 && tier > this.shownCounterTier;
    this.shownCounterTier = tier;
    this.counters.forEach((v, i) => {
      v.sprite.setFrame(FRAME.counter(tier, v.variant, v.facesX));
      if (upgrade) this.plop(v.sprite, i * SCENE_FX.counterWaveMs);
    });
    const mid = this.counters[Math.floor(this.counters.length / 2)];
    if (upgrade && mid) this.newLook(this.restBounds(mid.sprite));
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
      sprite.setData('stationId', p.stationId);
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
        stagger: p.tile.y === 0 && p.tile.x % 2 === 0,
        shownLevel: -1,
        shownLock: '',
        shownTint: -1,
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
        .setData('stationId', TABLE_OBJECT);
      const dirt = this.sprite(w.x, w.y + TILE_H, FRAME.dirt, ATLAS.furniture)
        .setOrigin(0.5, 1)
        .setDepth(isoDepth(p.tile.x, p.tile.y, 5.5))
        .setVisible(false);
      this.tables.push({ placement: p, sprite, dirt });
    }
  }

  /** Kamera-Grenzen = Raum plus sichtbare Terrasse (Grid-Erweiterung, GAME_DESIGN § 5.2). */
  private updateRoomBounds(terraceLevel: number): void {
    const { w, h } = layoutExtent(this.layout, terraceLevel);
    const left = toScreen(0, h).x;
    const right = toScreen(w, 0).x;
    const bottom = toScreen(w, h).y;
    this.room.setTo(left, -WALL_H, right - left, bottom + WALL_H);
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
        .setDepth(isoDepth(a.tile.x, a.tile.y, 5));
      this.ambienceImages.push(img);
    }
    // Deko nach Level: Bilder, Neon und Regale an den Wänden, Pflanzen, Leuchten und Teppich im Raum.
    const decor = loc.ambience['decor'] ?? 0;
    for (const d of this.layout.decor) {
      if (decor < d.minLevel) continue;
      const img = this.decorSprite(d);
      this.ambienceImages.push(img);
    }
    if (!first) this.plop(this.ambienceImages[this.ambienceImages.length - 1]);
  }

  /** Wand-Deko liegt bündig auf der Rückwand (gleiche Leinwand wie die Wandkachel), sonst wie ein Möbel. */
  private decorSprite(d: DecorItem): Phaser.GameObjects.Image {
    if (d.wall === 'u') {
      const p = toScreen(d.tile.x, 0);
      return this.sprite(p.x, p.y - WALL_H - 4, d.frame + '-u', ATLAS.furniture)
        .setOrigin(0, 0)
        .setDepth(DEPTH.wall + 2);
    }
    if (d.wall === 'v') {
      const p = toScreen(0, d.tile.y);
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
    for (const v of this.stations) v.shownLevel = -1;
    this.refreshStations(this.store.getState(), false);
  }

  /** Gekauft = Sprite der Ausbaustufe + Level-Badge, sonst Bauplatz mit „Kaufen“ oder Freischalt-Level. */
  private refreshStations(state: GameState, animate: boolean): void {
    const loc = getLocation(state, this.locationId);
    const tints = equippedSkinTints(state);
    // Von den gesperrten Geräten bekommt nur das nächste ein Schild; die anderen stehen stumm als Bauplatz.
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
      const lock = unlocked
        ? 'open'
        : needsTerrace(state, this.locationId, v.id) &&
            loc.level >= getStationDef(v.id).unlockCafeLevel
          ? 'terrace'
          : 'level';
      const silent = lock !== 'open' && v.id !== nextLocked;
      const shownLock = silent ? '' : lock;
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
        v.label.setText(t('scene.station.level', { level }));
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
          silent
            ? ''
            : lock === 'open'
              ? t('scene.station.buy')
              : lock === 'terrace'
                ? t('scene.station.needsTerrace')
                : t('scene.station.locked', { level: getStationDef(v.id).unlockCafeLevel }),
        );
      }
      if (v.id === 'matchaStation') this.refreshSteam(level > 0);
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
    const w = target.frame.width * ART_SCALE;
    const h = target.frame.height * ART_SCALE;
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

  /** Dampf über der Matcha-Station (kosmetisch). */
  private createSteam(): void {
    const p = this.layout.stations.find((s) => s.stationId === 'matchaStation');
    if (!p) return;
    const w = this.world(p.tile);
    // Über dem Kessel links auf der Arbeitsplatte (alle Stufen an derselben Stelle).
    this.steam = this.add.particles(w.x - 6, w.y - 28, ATLAS.common, {
      frame: FRAME.steam,
      speedY: { min: -18, max: -10 },
      speedX: { min: -4, max: 4 },
      lifespan: 1600,
      frequency: 1000 / SCENE_FX.steamPerSec,
      scale: { start: 0.25, end: 0.7 },
      alpha: { start: 0.7, end: 0 },
      emitting: false,
    });
    this.steam.setDepth(DEPTH.label - 3);
  }

  private refreshSteam(on: boolean): void {
    if (!this.steam) return;
    const run = on && !reducedMotion();
    if (run && !this.steam.emitting) this.steam.start();
    else if (!run && this.steam.emitting) this.steam.stop();
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
    const night = Math.round(getCafeClock(state.playtimeSec).night * 100) / 100;
    if (night === this.shownNight) return;
    this.shownNight = night;
    // Multiply mit Alpha mischt Richtung Indigo; 0 = Tag.
    this.nightTint.setAlpha(night * DAY_CYCLE.nightAlpha);
    this.nightTint.setVisible(night > 0);
    for (const g of this.glows) g.setAlpha(night * 0.8);
    this.city.setNight(night);
  }

  /**
   * Personal-Figuren (kosmetisch): Verkäufer hinter der Kasse, Baristas an den Geräten, Bedienungen und
   * Putzkräfte als bewegte Figuren aus `crowd`. Sichtbar nach Anzahl, gedeckelt (`CROWD.max*`).
   */
  private createStaff(): void {
    // Die n-te Figur einer Rolle bekommt den n-ten Look (`STAFF_LOOKS`), rein optisch.
    const standing = (
      role: StaffRoleId,
      spot: GridPos,
      n: number,
      dir: 'front' | 'back' = 'front',
    ) => {
      const w = this.world(spot);
      return this.sprite(w.x, w.y + TILE_H * 0.5, FRAME.staff(role, staffLookFor(role, n), dir))
        .setOrigin(0.5, CHAR_FOOT_ORIGIN_Y)
        .setDepth(isoDepth(spot.x, spot.y, 6))
        .setVisible(false);
    };
    this.layout.order.cashierSpots.slice(0, CROWD.maxCashiers).forEach((spot, i) => {
      this.cashierFigures.push(standing('cashier', spot, i));
    });
    PRODUCT_LINES.forEach((line, i) => {
      const p = this.layout.stations.find((s) => s.stationId === line.id);
      if (!p) return;
      // Baristas arbeiten mit dem Rücken zum Gastraum am Gerät an der Rückwand.
      this.baristaFigures.push({
        stationId: line.id,
        sprite: standing('barista', p.workSpot, i, 'back'),
      });
    });
    const moving = (role: StaffRoleId, n: number): StaffFigure[] =>
      Array.from({ length: n }, (_, i) => ({
        sprite: this.sprite(0, 0, FRAME.staff(role, staffLookFor(role, i)))
          .setOrigin(0.5, CHAR_FOOT_ORIGIN_Y)
          .setVisible(false),
        prev: { x: 0, y: 0 },
      }));
    this.waiterFigures = moving('waiter', CROWD.maxWaiters);
    this.cleanerFigures = moving('cleaner', CROWD.maxCleaners);
  }

  private refreshStaff(state: GameState): void {
    const loc = getLocation(state, this.locationId);
    const cashiers = getStaffLevel(loc, 'cashier');
    this.cashierFigures.forEach((s, i) => {
      const show = i < cashiers;
      if (s.visible !== show) s.setVisible(show);
    });
    // Baristas stehen an den gekauften Geräten, in Reihenfolge der Produktlinien.
    let left = getStaffLevel(loc, 'barista');
    for (const b of this.baristaFigures) {
      const show = left > 0 && (loc.stations[b.stationId]?.level ?? 0) > 0;
      if (show) left--;
      if (b.sprite.visible !== show) b.sprite.setVisible(show);
    }
  }

  /** Bewegte Personal-Figuren (Bedienungen, Putzkräfte) aus der Crowd-Simulation. */
  private syncStaffFigures(): void {
    const still = reducedMotion();
    const sync = (
      role: StaffRoleId,
      figures: StaffFigure[],
      agents: { active: boolean; x: number; y: number; phase: string }[],
      lookWhenIdle: (a: { x: number; y: number }) => ReturnType<typeof facing>,
    ): void => {
      agents.forEach((a, i) => {
        const f = figures[i];
        if (!f) return;
        if (!a.active) {
          f.sprite.setVisible(false);
          return;
        }
        const p = toScreen(a.x, a.y);
        const dx = a.x - f.prev.x;
        const dy = a.y - f.prev.y;
        const moving = f.sprite.visible && Math.hypot(dx, dy) > 1e-4;
        f.prev.x = a.x;
        f.prev.y = a.y;
        const look = moving ? facing(dx, dy) : lookWhenIdle(a);
        // Laufend im Zyklus, je Figur versetzt; stehend Frame 0 (bei reduzierter Bewegung immer).
        const frame =
          moving && !still ? walkFrame(this.walkClock + i * CHAR_WALK.stepSec) : CHAR_FRAMES.stand;
        const name = FRAME.staff(role, staffLookFor(role, i), look.dir, frame);
        if (f.sprite.frame.name !== name) f.sprite.setFrame(name);
        f.sprite
          .setFlipX(look.flip)
          .setVisible(true)
          .setPosition(p.x, p.y + TILE_H / 2)
          .setDepth(isoDepth(a.x, a.y, 6));
      });
    };
    // Stehend blicken Bedienungen zum Gastraum (+y), Putzkräfte zum Tisch bzw. zur Mitte.
    sync('waiter', this.waiterFigures, this.crowd.waiters, () => facing(0, 1));
    sync('cleaner', this.cleanerFigures, this.crowd.cleaners, (a) => {
      const c = this.crowd.cleaners.find((x) => x.x === a.x && x.y === a.y);
      const table = c && c.table >= 0 ? this.layout.tables[c.table] : undefined;
      return table ? facing(table.tile.x - a.x, table.tile.y - a.y) : facing(0, 1);
    });
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
    const still = reducedMotion();
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      const s = this.agentSprites[i];
      const m = this.moodSprites[i];
      const prev = this.agentPrev[i];
      if (!a || !s || !m || !prev) continue;
      if (!a.active) {
        s.setVisible(false);
        m.setVisible(false);
        continue;
      }
      const p = toScreen(a.x, a.y);
      const x = p.x;
      const y = p.y + TILE_H / 2;
      const seated = a.phase === 'consume' || (a.phase === 'waitServe' && a.table >= 0);
      if (seated) {
        // Sitzpose, Blick zum Tisch (Richtung und Spiegelung wie beim Gehen).
        const tb = this.layout.tables[a.table];
        const look = tb ? facing(tb.tile.x - a.x, tb.tile.y - a.y) : facing(0, 1);
        const frame = FRAME.customerSit(a.type, a.look, look.dir);
        if (s.frame.name !== frame) s.setFrame(frame);
        s.setFlipX(look.flip);
      } else {
        const dx = a.x - prev.x;
        const dy = a.y - prev.y;
        const moving = s.visible && Math.hypot(dx, dy) > 1e-4;
        let look: ReturnType<typeof facing>;
        if (moving) look = facing(dx, dy);
        else if (a.phase === 'queue' || a.phase === 'order') look = facing(0, -1);
        else look = facing(0, 1);
        const frameNo =
          moving && !still
            ? walkFrame(this.walkClock + a.id * CHAR_WALK.stepSec)
            : CHAR_FRAMES.stand;
        const frame = FRAME.customer(a.type, a.look, look.dir, frameNo);
        if (s.frame.name !== frame) s.setFrame(frame);
        s.setFlipX(look.flip);
      }
      prev.x = a.x;
      prev.y = a.y;
      s.setVisible(true)
        .setPosition(x, y)
        .setDepth(isoDepth(a.x, a.y, 6));
      // Smiley nur in der Schlange, damit die Szene nicht überladen wirkt.
      const queueing = a.phase === 'queue';
      m.setVisible(queueing);
      if (queueing) {
        if (m.frame.name !== moodFrame) m.setFrame(moodFrame);
        m.setPosition(x, y - CHAR_OVERLAY_Y).setDepth(DEPTH.label - 1);
      }
    }
  }

  /**
   * Fortschrittsringe (UI_STYLE § 3.10): über dem Gast, der gerade bestellt, und über arbeitenden Baristas
   * (Takt aus der Zubereitungs-Kapazität je sichtbarem Barista, kosmetisch).
   */
  private drawRings(): void {
    const g = this.rings;
    g.clear();
    const r = SCENE_FX.ringRadius;
    const ring = (x: number, y: number, frac: number): void => {
      g.fillStyle(UI_THEME.navy900, 0.6);
      g.fillCircle(x, y, r);
      g.lineStyle(SCENE_FX.ringWidth, UI_THEME.successDeep, 1);
      g.strokeCircle(x, y, r);
      g.lineStyle(SCENE_FX.ringWidth, UI_THEME.success, 1);
      g.beginPath();
      g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      g.strokePath();
    };
    for (const a of this.crowd.agents) {
      if (!a.active || a.phase !== 'order' || a.serveTotal <= 0) continue;
      const p = toScreen(a.x, a.y);
      const y = p.y + TILE_H / 2 - CHAR_OVERLAY_Y - r - 1;
      ring(p.x, y, Phaser.Math.Clamp(1 - a.timer / a.serveTotal, 0, 1));
    }
    const rates = this.rates;
    if (!rates || rates.served <= 0 || reducedMotion()) return;
    const busy = this.baristaFigures.filter((b) => b.sprite.visible);
    if (busy.length === 0) return;
    const cycle = Phaser.Math.Clamp(busy.length / Math.max(rates.stages.production, 1e-6), 0.8, 6);
    busy.forEach((b, i) => {
      const frac = (((this.walkClock / cycle + i * 0.37) % 1) + 1) % 1;
      ring(b.sprite.x, b.sprite.y - CHAR_OVERLAY_Y - r - 1, frac);
    });
  }

  private onPurchase(a: Agent): void {
    this.coinPopup(a.x, a.y);
    this.coinFly(a.x, a.y);
    if (Math.random() < SCENE_FX.emoteChance) this.emote(a.x, a.y);
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

  private coinPopup(gx: number, gy: number): void {
    const r = this.rates;
    if (!r || r.served <= 0) return;
    const popup = this.freePopup();
    if (!popup) return;
    // Anzeige: durchschnittlicher Umsatz pro bedientem Gast; die Gutschrift passiert im Rate-Modell.
    const perCustomer = r.incomePerSec.div(new Decimal(r.served));
    const state = this.store.getState();
    const p = toScreen(gx, gy);
    popup
      .setText(
        t('scene.coinPopup', {
          amount: formatNumber(perCustomer, getLang(), state.settings.numberFormat),
        }),
      )
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

  /** Münze fliegt vom Gast zum Münz-Symbol im HUD (nur Optik). */
  private coinFly(gx: number, gy: number): void {
    if (this.coinsFlying >= SCENE_FX.coinFlyMax || reducedMotion()) return;
    this.coinsFlying++;
    const p = toScreen(gx, gy);
    const cam = this.cameras.main;
    const target = cam.getWorldPoint(HUD_COIN.x, HUD_COIN.y);
    const coin = this.sprite(p.x, p.y - 12, FRAME.coin).setDepth(DEPTH.overlay);
    this.tweens.add({
      targets: coin,
      x: target.x,
      y: target.y,
      scale: ART_SCALE * 1.4,
      duration: SCENE_FX.coinFlyMs,
      ease: 'Cubic.In',
      onComplete: () => {
        coin.destroy();
        this.coinsFlying--;
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

  private onPointerUp(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (this.controls.isDrag()) return;
    const stationObj = over.find((o) => typeof o.getData('stationId') === 'string');
    if (stationObj) {
      this.game.events.emit(UI_EVENTS.openStation, stationObj.getData('stationId') as string);
      return;
    }
    const g = toGrid(p.worldX, p.worldY);
    const ext = layoutExtent(this.layout, this.terraceLevel);
    if (g.x < 0 || g.y < 0 || g.x >= ext.w || g.y >= ext.h) return;
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
