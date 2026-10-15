import Phaser from 'phaser';
import {
  CLEANER_AREA,
  getLayout,
  layoutExtent,
  staffSpot,
  type CafeLayout,
  type GridPos,
  type StationPlacement,
} from '@data/layouts';
import { STATIONS, CHECKOUT_ID, getStationDef } from '@data/stations';
import { SCENE_FX, stationLookTier } from '@data/art';
import { DAY_CYCLE, UI_THEME } from '@data/ui';
import { getLocation, type GameState } from '@core/GameState';
import type { Store } from '@core/store';
import { computeLocationRates, mood, tapCafe, type LocationRates } from '@core/customers';
import { buyStation, getBulkCost, isStationUnlocked, needsTerrace } from '@core/economy';
import { formatNumber } from '@core/math/format';
import { getEventOverlay } from '@core/events';
import { equippedSkinTints } from '@core/leaves';
import { getCafeClock } from '@core/time/dayCycle';
import type { EventOverlay } from '@data/events';
import { Decimal } from '@core/math/bignum';
import { getLang, t } from '@i18n/index';
import { CustomerCrowd, type Agent } from './agents/crowd';
import { CameraControls } from './cameraControls';
import { TILE_H, TILE_W, toGrid, toScreen } from './iso/iso';
import { ART_SCALE, ATLAS, CHAR_FOOT_ORIGIN_Y, FRAME, atlasUrls } from './art';
import { REGISTRY, UI_EVENTS, getStore } from './registry';

const WALL_H = 64;
const FRONT_WALL_H = 16;
/** Jede wievielte Wandkachel ein Fenster hat. */
const WINDOW_EVERY = 3;
const STATION_TOP = 40;
const RATES_REFRESH_MS = 200;
const POPUP_POOL = 24;
const EMOTE_POOL = 8;
const LABEL_MAX_SCALE = 2.2;
const WALK_FRAME_SEC = 0.18;
/** HUD-Münzsymbol in CSS-Pixeln vom linken oberen Rand (Ziel des Münz-Flugs). */
const HUD_COIN = { x: 34, y: 34 };
const DEPTH = { wall: -2000, floor: -1000, label: 10_000, overlay: 20_000 } as const;

interface StationView {
  id: string;
  placement: StationPlacement;
  sprite: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  shownLevel: number;
  /** Gezeigter Sperrzustand: frei, Café-Level fehlt oder Terrasse fehlt. */
  shownLock: 'open' | 'level' | 'terrace' | '';
  /** Gezeigte Skin-Tönung (0xffffff = keine). */
  shownTint: number;
}

/** Größe der Farbfilter (Event, Nacht): deckt jeden Kamera-Ausschnitt ab, egal wie weit gezoomt. */
const OVERLAY_SIZE = 20_000;

/** Tiefe nach Grid-Position; Feinsortierung innerhalb einer Diagonale über `bias`. */
const isoDepth = (x: number, y: number, bias = 0): number => (x + y) * 10 + bias;

// Einmal abfragen, `matches` folgt Änderungen live (vorher lief `matchMedia` in jedem Frame).
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const reducedMotion = (): boolean => motionQuery.matches;

/** Blickrichtung einer Figur aus einem Bewegungs-/Blickvektor im Grid. */
function facing(dx: number, dy: number): { dir: 'front' | 'back'; flip: boolean } {
  if (Math.abs(dx) > Math.abs(dy)) return { dir: dx > 0 ? 'front' : 'back', flip: true };
  return { dir: dy >= 0 ? 'front' : 'back', flip: false };
}

export class CafeScene extends Phaser.Scene {
  private store!: Store;
  private layout!: CafeLayout;
  private locationId = '';
  /** Reset-Zähler des gezeigten Standorts; ändert er sich, wird der Raum neu aufgebaut. */
  private prestigeCount = 0;
  private crowd!: CustomerCrowd;
  private controls!: CameraControls;
  private stations: StationView[] = [];
  private agentSprites: Phaser.GameObjects.Image[] = [];
  private agentPrev: { x: number; y: number }[] = [];
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
  private moodSprites: Phaser.GameObjects.Image[] = [];
  private staffViews: { stationId: string; sprite: Phaser.GameObjects.Image }[] = [];
  private cleaner!: Phaser.GameObjects.Image;
  private cleanerWait = 0;
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
    this.agentSprites = [];
    this.agentPrev = [];
    this.popups = [];
    this.emotes = [];
    this.coinsFlying = 0;
    this.rates = null;
    this.ratesAge = Infinity;
    this.labelZoom = 0;
    this.ambienceImages = [];
    this.ambienceKey = '';
    this.terraceLevel = -1;
    this.moodSprites = [];
    this.staffViews = [];
    this.cleanerWait = 0;
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

    this.drawRoom();
    this.createStations();
    this.createAmbience(state);
    this.agentSprites = this.crowd.agents.map(() =>
      this.sprite(0, 0, FRAME.customer('student', 'front', 0))
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

    this.room = new Phaser.Geom.Rectangle();
    this.updateRoomBounds(getLocation(state, this.locationId).ambience['terrace'] ?? 0);
    this.createEventFx();
    this.createNight();
    this.createSteam();
    this.controls = new CameraControls(this, this.room);
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
    this.refreshStations(state, false);
  }

  update(_time: number, deltaMs: number): void {
    const state = this.store.getState();
    // Standortwechsel oder Franchise-Reset: Raum, Stationen und Kunden komplett neu aufbauen.
    if (
      state.activeLocationId !== this.locationId ||
      getLocation(state, this.locationId).prestigeCount !== this.prestigeCount
    ) {
      this.scene.restart();
      return;
    }
    const dt = deltaMs / 1000;
    this.walkClock += dt;
    this.scaleLabels();
    this.ratesAge += deltaMs;
    if (!this.rates || this.ratesAge >= RATES_REFRESH_MS) {
      this.rates = computeLocationRates(state, this.locationId);
      this.ratesAge = 0;
      this.refreshStations(state, true);
      this.createAmbience(state);
      this.refreshStaff(state);
      this.refreshEventFx(state);
      this.refreshNight(state);
      this.refreshBoard();
    }
    this.moveCleaner(dt);
    const { purchases } = this.crowd.update(dt, this.visibleRates(this.rates));
    this.syncAgents(mood(getLocation(state, this.locationId).satisfaction));
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
    for (const v of this.stations) v.label.setScale(f);
    for (const p of this.popups) p.setScale(f);
    this.moreText.setScale(f);
    this.board?.text.setScale(f);
  }

  /** Kunden/s je Station; im Debug-Modus kosmetisch auf `debugSpawn` hochskaliert (nie für Einnahmen). */
  private visibleRates(r: LocationRates): Record<string, number> {
    if (this.debugSpawn <= 0) return r.perStation;
    const total = Object.values(r.perStation).reduce((a, b) => a + b, 0);
    if (total <= 0) return { [STATIONS[0]?.id ?? '']: this.debugSpawn };
    const f = this.debugSpawn / total;
    return Object.fromEntries(Object.entries(r.perStation).map(([k, v]) => [k, v * f]));
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

  private stationAt(x: number, y: number): boolean {
    return this.layout.stations.some((s) => s.tile.x === x && s.tile.y === y);
  }

  /** Boden, hohe Rückwände mit Fenstern, niedrige Vorderwände (Dollhouse-Schnitt, UI_STYLE § 4). */
  private drawRoom(): void {
    const n = this.layout.gridSize;
    const theme = ATLAS.theme(this.locationId);
    const { entrance } = this.layout;
    for (let gy = 0; gy < n; gy++) {
      for (let gx = 0; gx < n; gx++) {
        const p = toScreen(gx, gy);
        const isEntrance = gx === entrance.x && gy === entrance.y;
        this.sprite(
          p.x,
          p.y,
          isEntrance ? 'entrance' : (gx + gy) % 2 ? 'floor-a' : 'floor-b',
          theme,
        )
          .setOrigin(0.5, 0)
          .setDepth(DEPTH.floor);
      }
    }
    for (let i = 0; i < n; i++) {
      const window = i % WINDOW_EVERY === 1;
      const pu = toScreen(i, 0);
      this.sprite(pu.x, pu.y - WALL_H - 4, window ? 'wall-u-window' : 'wall-u', theme)
        .setOrigin(0, 0)
        .setDepth(DEPTH.wall);
      const pv = toScreen(0, i);
      this.sprite(pv.x - TILE_W / 2, pv.y - WALL_H - 4, window ? 'wall-v-window' : 'wall-v', theme)
        .setOrigin(0, 0)
        .setDepth(DEPTH.wall);
      if (window) {
        // Fensterlicht nachts (additiv, Alpha folgt der Tageszeit).
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
      // Vorderwände auf 25 % Höhe, Lücke am Eingang und an Stationen.
      if (i !== entrance.x) {
        const pf = toScreen(i, n - 1);
        this.sprite(pf.x - TILE_W / 2, pf.y - FRONT_WALL_H - 2, 'front-u', theme)
          .setOrigin(0, 0)
          .setDepth(isoDepth(i, n - 1, 9));
      }
      if (!this.stationAt(n - 1, i) && !(entrance.x === n - 1 && entrance.y === i)) {
        const pf = toScreen(n - 1, i);
        this.sprite(pf.x - TILE_W / 2, pf.y - FRONT_WALL_H - 2, 'front-v', theme)
          .setOrigin(0, 0)
          .setDepth(isoDepth(n - 1, i, 9));
      }
    }
  }

  private createStations(): void {
    for (const p of this.layout.stations) {
      const w = this.world(p.tile);
      const sprite = this.sprite(w.x, w.y + TILE_H, FRAME.ghost)
        .setOrigin(0.5, 1)
        .setDepth(isoDepth(p.tile.x, p.tile.y, 5))
        .setInteractive({ useHandCursor: true, pixelPerfect: false });
      sprite.setData('stationId', p.stationId);
      const label = this.makeText(13, UI_THEME.textCss)
        .setPosition(w.x, w.y - STATION_TOP + TILE_H / 2)
        .setDepth(DEPTH.label);
      this.stations.push({
        id: p.stationId,
        placement: p,
        sprite,
        label,
        shownLevel: -1,
        shownLock: '',
        shownTint: -1,
      });
    }
    this.createBoard();
  }

  /** Kamera-Grenzen = Raum plus sichtbare Terrasse (Grid-Erweiterung, GAME_DESIGN § 5.2). */
  private updateRoomBounds(terraceLevel: number): void {
    const { w, h } = layoutExtent(this.layout, terraceLevel);
    const left = toScreen(0, h).x;
    const right = toScreen(w, 0).x;
    const bottom = toScreen(w, h).y;
    this.room.setTo(left, -WALL_H, right - left, bottom + WALL_H);
  }

  /** Zeichnet Ambiente neu, sobald sich ein Level ändert (Kauf im Shop, Import, Löschen). */
  private createAmbience(state: GameState): void {
    const loc = getLocation(state, this.locationId);
    const key = this.layout.ambience.map((a) => loc.ambience[a.id] ?? 0).join(',');
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
      const img = this.sprite(w.x, w.y + TILE_H, FRAME.ambience(a.id))
        .setOrigin(0.5, 1)
        .setDepth(isoDepth(a.tile.x, a.tile.y, 5));
      this.ambienceImages.push(img);
    }
    if (!first) this.plop(this.ambienceImages[this.ambienceImages.length - 1]);
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
      if (level === v.shownLevel && lock === v.shownLock) continue;
      const before = v.shownLevel;
      v.shownLevel = level;
      v.shownLock = lock;
      if (level > 0) {
        v.sprite.setFrame(FRAME.station(v.id, level, v.placement.queueDir.x !== 0)).setAlpha(1);
        v.label.setText(t('scene.station.level', { level }));
        if (animate && before >= 0 && level > before) {
          this.plop(v.sprite);
          if (before === 0 || stationLookTier(level) !== stationLookTier(before)) {
            this.shine(v.sprite);
          }
        }
      } else {
        v.sprite.setFrame(FRAME.ghost).setAlpha(unlocked ? 1 : 0.45);
        v.label.setText(
          lock === 'open'
            ? t('scene.station.buy')
            : lock === 'terrace'
              ? t('scene.station.needsTerrace')
              : t('scene.station.locked', { level: getStationDef(v.id).unlockCafeLevel }),
        );
      }
      if (v.id === 'matchaBar') this.refreshSteam(level > 0);
    }
  }

  /** Kauf-Plopp: Scale 0 → 1.1 → 1 (UI_STYLE § 4). */
  private plop(target: Phaser.GameObjects.Image | undefined): void {
    if (!target || reducedMotion()) return;
    target.setScale(0);
    this.tweens.add({
      targets: target,
      scale: { from: 0, to: ART_SCALE * SCENE_FX.plopOvershoot },
      duration: SCENE_FX.plopMs * 0.7,
      ease: 'Back.Out',
      onComplete: () =>
        this.tweens.add({ targets: target, scale: ART_SCALE, duration: SCENE_FX.plopMs * 0.3 }),
    });
  }

  /** Weißer Shine-Sweep über das Objekt (Level-up / neue Ausbaustufe). */
  private shine(target: Phaser.GameObjects.Image): void {
    if (reducedMotion()) return;
    const b = target.getBounds();
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

  /** Dampf über der Matcha-Bar (kosmetisch). */
  private createSteam(): void {
    const p = this.layout.stations.find((s) => s.stationId === 'matchaBar');
    if (!p) return;
    const w = this.world(p.tile);
    this.steam = this.add.particles(w.x - 6, w.y - 8, ATLAS.common, {
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
    const p = this.layout.stations.find((s) => s.stationId === CHECKOUT_ID);
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
    const checkout = this.stations.find((s) => s.id === CHECKOUT_ID);
    const show = (checkout?.shownLevel ?? 0) > 0;
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
  }

  /** Personal-Figuren (kosmetisch): je Station mit eingestellter Rolle eine Figur daneben, plus Reinigungskraft. */
  private createStaff(): void {
    for (const p of this.layout.stations) {
      const spot = staffSpot(p);
      const w = this.world(spot);
      const role = getStationDef(p.stationId).staffRole;
      const look = facing(p.queueDir.x, p.queueDir.y);
      const sprite = this.sprite(
        w.x,
        w.y + TILE_H * 0.5,
        FRAME.staff(role, look.dir === 'front' ? 'front' : 'back'),
      )
        .setOrigin(0.5, CHAR_FOOT_ORIGIN_Y)
        .setFlipX(look.flip)
        .setDepth(isoDepth(spot.x, spot.y, 6))
        .setVisible(false);
      this.staffViews.push({ stationId: p.stationId, sprite });
    }
    const start = this.world({ x: CLEANER_AREA.min, y: CLEANER_AREA.min });
    this.cleaner = this.sprite(start.x, start.y, FRAME.staff('cleaner'))
      .setOrigin(0.5, CHAR_FOOT_ORIGIN_Y)
      .setVisible(false);
  }

  private refreshStaff(state: GameState): void {
    const loc = getLocation(state, this.locationId);
    for (const v of this.staffViews) {
      const role = getStationDef(v.stationId).staffRole;
      const show = (loc.stations[v.stationId]?.level ?? 0) > 0 && (loc.staff[role] ?? 0) > 0;
      if (v.sprite.visible !== show) v.sprite.setVisible(show);
    }
    const cleaner = (loc.staff['cleaner'] ?? 0) > 0;
    if (this.cleaner.visible !== cleaner) this.cleaner.setVisible(cleaner);
  }

  /** Die Reinigungskraft wischt sich von Tisch zu Tisch; rein optisch. */
  private moveCleaner(dtSec: number): void {
    if (!this.cleaner.visible) return;
    this.cleanerWait -= dtSec;
    if (this.cleanerWait > 0) return;
    this.cleanerWait = CLEANER_AREA.moveEverySec;
    const span = CLEANER_AREA.max - CLEANER_AREA.min + 1;
    const gx = CLEANER_AREA.min + Math.floor(Math.random() * span);
    const gy = CLEANER_AREA.min + Math.floor(Math.random() * span);
    const p = toScreen(gx, gy);
    const y = p.y + TILE_H / 2;
    const from = toGrid(this.cleaner.x, this.cleaner.y - TILE_H / 2);
    const look = facing(gx - from.x, gy - from.y);
    this.cleaner.setFlipX(look.flip);
    let frame = 0;
    this.tweens.add({
      targets: this.cleaner,
      x: p.x,
      y,
      duration: CLEANER_AREA.moveEverySec * 500,
      onUpdate: (tw) => {
        this.cleaner.setDepth(isoDepth(gx, gy, 6));
        const f = Math.floor((tw.elapsed / 1000 / WALK_FRAME_SEC) % 2);
        if (f !== frame) {
          frame = f;
          this.cleaner.setFrame(FRAME.staff('cleaner', look.dir, f));
        }
      },
      onComplete: () => this.cleaner.setFrame(FRAME.staff('cleaner', look.dir, 0)),
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
      const dx = a.x - prev.x;
      const dy = a.y - prev.y;
      const moving = s.visible && Math.hypot(dx, dy) > 1e-4;
      prev.x = a.x;
      prev.y = a.y;
      let look: ReturnType<typeof facing>;
      if (moving) look = facing(dx, dy);
      else {
        // Stehend: zur Station blicken.
        const st = this.layout.stations.find((q) => q.stationId === a.stationId);
        look = st ? facing(st.tile.x - a.x, st.tile.y - a.y) : facing(0, 1);
      }
      const walkFrame =
        moving && !still ? Math.floor(this.walkClock / WALK_FRAME_SEC + a.id) % 2 : 0;
      const frame = FRAME.customer(a.type, look.dir, walkFrame);
      if (s.frame.name !== frame) s.setFrame(frame);
      s.setFlipX(look.flip)
        .setVisible(true)
        .setPosition(x, y)
        .setDepth(isoDepth(a.x, a.y, 6));
      // Smiley nur in Schlange und beim Bedienen, damit die Szene nicht überladen wirkt.
      const queueing = a.phase === 'queue';
      m.setVisible(queueing);
      if (queueing) {
        if (m.frame.name !== moodFrame) m.setFrame(moodFrame);
        m.setPosition(x, y - 24).setDepth(DEPTH.label - 1);
      }
    }
  }

  /** Fortschrittsringe über bedienten Kunden (UI_STYLE § 3.10): Restzeit der Bedienung. */
  private drawRings(): void {
    const g = this.rings;
    g.clear();
    const r = SCENE_FX.ringRadius;
    for (const a of this.crowd.agents) {
      if (!a.active || a.phase !== 'serve' || a.serveTotal <= 0) continue;
      const p = toScreen(a.x, a.y);
      const x = p.x;
      const y = p.y + TILE_H / 2 - 28;
      const frac = Phaser.Math.Clamp(1 - a.timer / a.serveTotal, 0, 1);
      g.fillStyle(UI_THEME.navy900, 0.6);
      g.fillCircle(x, y, r);
      g.lineStyle(SCENE_FX.ringWidth, UI_THEME.successDeep, 1);
      g.strokeCircle(x, y, r);
      g.lineStyle(SCENE_FX.ringWidth, UI_THEME.success, 1);
      g.beginPath();
      g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      g.strokePath();
    }
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
    // Anzeige: durchschnittlicher Umsatz pro bedientem Kunden; die Gutschrift passiert im Rate-Modell.
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

  /** Münze fliegt vom Kunden zum Münz-Symbol im HUD (nur Optik). */
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

  /** Kunden-Emote nach dem Kauf: Herz, Note oder Stern in einer Sprechblase. */
  private emote(gx: number, gy: number): void {
    const e = this.emotes.find((x) => !x.visible);
    if (!e) return;
    const kinds = ['heart', 'note', 'star'] as const;
    const kind = kinds[Math.floor(Math.random() * kinds.length)] ?? 'heart';
    const p = toScreen(gx, gy);
    e.setFrame(FRAME.emote(kind))
      .setPosition(p.x + 8, p.y - 18)
      .setAlpha(1)
      .setVisible(true);
    if (reducedMotion()) {
      this.time.delayedCall(SCENE_FX.emoteMs, () => e.setVisible(false));
      return;
    }
    this.tweens.add({
      targets: e,
      y: p.y - 30,
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

  /** Debug-Taste B (nur im Dev-Server): günstigste kaufbare Station um 1 Level erhöhen. */
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
