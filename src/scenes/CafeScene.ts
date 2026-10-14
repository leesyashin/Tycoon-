import Phaser from 'phaser';
import {
  CLEANER_AREA,
  getLayout,
  layoutExtent,
  staffSpot,
  type CafeLayout,
  type GridPos,
} from '@data/layouts';
import { STATIONS, getStationDef } from '@data/stations';
import { getLocation, type GameState } from '@core/GameState';
import type { Store } from '@core/store';
import { computeLocationRates, mood, tapCafe, type LocationRates } from '@core/customers';
import { buyStation, getBulkCost, isStationUnlocked } from '@core/economy';
import { formatNumber } from '@core/math/format';
import { Decimal } from '@core/math/bignum';
import { getLang, t } from '@i18n/index';
import { CustomerCrowd } from './agents/crowd';
import { CameraControls } from './cameraControls';
import { TILE_H, TILE_W, toGrid, toScreen } from './iso/iso';
import { STATION_BOX_H, TEX } from './placeholders';
import { REGISTRY, UI_EVENTS, getStore } from './registry';

const WALL_H = 64;
const RATES_REFRESH_MS = 200;
const POPUP_POOL = 24;
const LABEL_MAX_SCALE = 2.2;
const DEPTH = { wall: -2000, floor: -1000, label: 10_000, overlay: 20_000 } as const;

interface StationView {
  id: string;
  sprite: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  shownLevel: number;
  shownUnlocked: boolean;
}

/** Tiefe nach Grid-Position; Feinsortierung innerhalb einer Diagonale über `bias`. */
const isoDepth = (x: number, y: number, bias = 0): number => (x + y) * 10 + bias;

export class CafeScene extends Phaser.Scene {
  private store!: Store;
  private layout!: CafeLayout;
  private locationId = '';
  private crowd!: CustomerCrowd;
  private controls!: CameraControls;
  private stations: StationView[] = [];
  private agentSprites: Phaser.GameObjects.Image[] = [];
  private popups: Phaser.GameObjects.Text[] = [];
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

  constructor() {
    super('CafeScene');
  }

  create(): void {
    this.store = getStore(this);
    this.debugSpawn = Number(this.registry.get(REGISTRY.debugSpawn) ?? 0) || 0;
    const state = this.store.getState();
    this.locationId = state.activeLocationId;
    this.layout = getLayout(this.locationId);
    this.crowd = new CustomerCrowd(this.layout, this.locationId);

    this.drawRoom();
    this.createStations();
    this.createAmbience(state);
    this.agentSprites = this.crowd.agents.map(() =>
      this.add.image(0, 0, TEX.customer('student')).setOrigin(0.5, 1).setVisible(false),
    );
    this.moodSprites = this.crowd.agents.map(() =>
      this.add.image(0, 0, TEX.mood('happy')).setOrigin(0.5, 1).setVisible(false),
    );
    this.createStaff();
    for (let i = 0; i < POPUP_POOL; i++) {
      this.popups.push(this.makeText(12, '#ffe27a').setVisible(false).setDepth(DEPTH.overlay));
    }
    const e = this.world(this.layout.entrance);
    this.moreText = this.makeText(14, '#ffffff')
      .setPosition(e.x, e.y + TILE_H)
      .setDepth(DEPTH.overlay)
      .setVisible(false);
    this.leaves = this.add.particles(0, 0, TEX.leaf, {
      speed: { min: 40, max: 120 },
      angle: { min: 200, max: 340 },
      gravityY: 220,
      lifespan: 700,
      alpha: { start: 1, end: 0 },
      rotate: { min: 0, max: 360 },
      emitting: false,
    });
    this.leaves.setDepth(DEPTH.overlay);

    this.room = new Phaser.Geom.Rectangle();
    this.updateRoomBounds(getLocation(state, this.locationId).ambience['terrace'] ?? 0);
    this.controls = new CameraControls(this, this.room);
    this.fitCamera();
    this.scale.on('resize', () => this.fitCamera());

    this.input.on('pointerup', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) =>
      this.onPointerUp(p, over),
    );
    if (import.meta.env.DEV) this.input.keyboard?.on('keydown-B', () => this.debugBuy());
    const onLang = (): void => this.relabel();
    this.game.events.on(UI_EVENTS.langChanged, onLang);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.game.events.off(UI_EVENTS.langChanged, onLang),
    );
    this.refreshStations(state);
  }

  update(_time: number, deltaMs: number): void {
    const state = this.store.getState();
    this.scaleLabels();
    this.ratesAge += deltaMs;
    if (!this.rates || this.ratesAge >= RATES_REFRESH_MS) {
      this.rates = computeLocationRates(state, this.locationId);
      this.ratesAge = 0;
      this.refreshStations(state);
      this.createAmbience(state);
      this.refreshStaff(state);
    }
    this.moveCleaner(deltaMs / 1000);
    const { purchases } = this.crowd.update(deltaMs / 1000, this.visibleRates(this.rates));
    this.syncAgents(mood(getLocation(state, this.locationId).satisfaction));
    for (const a of purchases) this.coinPopup(a.x, a.y);
    const hidden = this.crowd.hiddenCount;
    this.moreText.setVisible(hidden > 0);
    if (hidden > 0) this.moreText.setText(t('scene.crowd.more', { count: hidden }));
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
        fontFamily: 'system-ui, sans-serif',
        fontSize: `${String(size)}px`,
        color,
        stroke: '#1d2a17',
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

  private drawRoom(): void {
    const n = this.layout.gridSize;
    for (let gy = 0; gy < n; gy++) {
      for (let gx = 0; gx < n; gx++) {
        const p = toScreen(gx, gy);
        const isEntrance = gx === this.layout.entrance.x && gy === this.layout.entrance.y;
        this.add
          .image(p.x, p.y, isEntrance ? TEX.entrance : (gx + gy) % 2 ? TEX.tileA : TEX.tileB)
          .setOrigin(0.5, 0)
          .setDepth(DEPTH.floor);
      }
    }
    const g = this.add.graphics().setDepth(DEPTH.wall);
    const o = toScreen(0, 0);
    const r = toScreen(n, 0);
    const l = toScreen(0, n);
    g.fillStyle(0xe8dcc0, 1);
    g.fillPoints(
      [
        new Phaser.Geom.Point(o.x, o.y - WALL_H),
        new Phaser.Geom.Point(r.x, r.y - WALL_H),
        new Phaser.Geom.Point(r.x, r.y),
        new Phaser.Geom.Point(o.x, o.y),
      ],
      true,
    );
    g.fillStyle(0xd4c6a6, 1);
    g.fillPoints(
      [
        new Phaser.Geom.Point(o.x, o.y - WALL_H),
        new Phaser.Geom.Point(l.x, l.y - WALL_H),
        new Phaser.Geom.Point(l.x, l.y),
        new Phaser.Geom.Point(o.x, o.y),
      ],
      true,
    );
  }

  private createStations(): void {
    for (const p of this.layout.stations) {
      const w = this.world(p.tile);
      const sprite = this.add
        .image(w.x, w.y + TILE_H, TEX.ghost)
        .setOrigin(0.5, 1)
        .setDepth(isoDepth(p.tile.x, p.tile.y, 5))
        .setInteractive({ useHandCursor: true });
      sprite.setData('stationId', p.stationId);
      const label = this.makeText(13, '#ffffff')
        .setPosition(w.x, w.y - STATION_BOX_H + TILE_H / 2 - 2)
        .setDepth(DEPTH.label);
      this.stations.push({ id: p.stationId, sprite, label, shownLevel: -1, shownUnlocked: false });
    }
  }

  /** Zeichnet Ambiente neu, sobald sich ein Level ändert (Kauf im Shop, Import, Löschen). */
  /** Kamera-Grenzen = Raum plus sichtbare Terrasse (Grid-Erweiterung, GAME_DESIGN § 5.2). */
  private updateRoomBounds(terraceLevel: number): void {
    const { w, h } = layoutExtent(this.layout, terraceLevel);
    const left = toScreen(0, h).x;
    const right = toScreen(w, 0).x;
    const bottom = toScreen(w, h).y;
    this.room.setTo(left, -WALL_H, right - left, bottom + WALL_H);
  }

  private createAmbience(state: GameState): void {
    const loc = getLocation(state, this.locationId);
    const key = this.layout.ambience.map((a) => loc.ambience[a.id] ?? 0).join(',');
    if (key === this.ambienceKey) return;
    const terraceLevel = loc.ambience['terrace'] ?? 0;
    const terraceChanged = this.terraceLevel !== terraceLevel;
    this.ambienceKey = key;
    for (const img of this.ambienceImages) img.destroy();
    this.ambienceImages = [];
    for (const area of this.layout.terrace) {
      if (terraceLevel < area.minLevel) continue;
      for (let gy = area.from.y; gy <= area.to.y; gy++) {
        for (let gx = area.from.x; gx <= area.to.x; gx++) {
          const p = toScreen(gx, gy);
          this.ambienceImages.push(
            this.add.image(p.x, p.y, TEX.terrace).setOrigin(0.5, 0).setDepth(DEPTH.floor),
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
      this.ambienceImages.push(
        this.add
          .image(w.x, w.y + TILE_H * 0.75, TEX.ambience(a.id))
          .setOrigin(0.5, 1)
          .setDepth(isoDepth(a.tile.x, a.tile.y, 5)),
      );
    }
  }

  /** Nach Sprachwechsel alle Stations-Texte neu setzen. */
  private relabel(): void {
    for (const v of this.stations) v.shownLevel = -1;
    this.refreshStations(this.store.getState());
  }

  /** Gekauft = farbiger Block + Level-Badge, sonst Umriss mit „Kaufen“ oder Freischalt-Level. */
  private refreshStations(state: GameState): void {
    const loc = getLocation(state, this.locationId);
    for (const v of this.stations) {
      const level = loc.stations[v.id]?.level ?? 0;
      const unlocked = isStationUnlocked(state, this.locationId, v.id);
      if (level === v.shownLevel && unlocked === v.shownUnlocked) continue;
      v.shownLevel = level;
      v.shownUnlocked = unlocked;
      if (level > 0) {
        v.sprite.setTexture(TEX.station(v.id)).setAlpha(1);
        v.label.setText(t('scene.station.level', { level }));
      } else {
        v.sprite.setTexture(TEX.ghost).setAlpha(unlocked ? 1 : 0.45);
        v.label.setText(
          unlocked
            ? t('scene.station.buy')
            : t('scene.station.locked', { level: getStationDef(v.id).unlockCafeLevel }),
        );
      }
    }
  }

  /** Personal-Figuren (kosmetisch): je Station mit eingestellter Rolle eine Figur daneben, plus Reinigungskraft. */
  private createStaff(): void {
    for (const p of this.layout.stations) {
      const spot = staffSpot(p);
      const w = this.world(spot);
      const role = getStationDef(p.stationId).staffRole;
      const sprite = this.add
        .image(w.x, w.y + TILE_H * 0.75, TEX.staff(role))
        .setOrigin(0.5, 1)
        .setDepth(isoDepth(spot.x, spot.y, 6))
        .setVisible(false);
      this.staffViews.push({ stationId: p.stationId, sprite });
    }
    const start = this.world({ x: CLEANER_AREA.min, y: CLEANER_AREA.min });
    this.cleaner = this.add
      .image(start.x, start.y, TEX.staff('cleaner'))
      .setOrigin(0.5, 1)
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
    const y = p.y + TILE_H / 2 + 4;
    this.cleaner.setFlipX(p.x < this.cleaner.x);
    this.tweens.add({
      targets: this.cleaner,
      x: p.x,
      y,
      duration: CLEANER_AREA.moveEverySec * 500,
      onUpdate: () => this.cleaner.setDepth(isoDepth(gx, gy, 6)),
    });
  }

  private syncAgents(currentMood: string): void {
    const agents = this.crowd.agents;
    const moodTex = TEX.mood(currentMood);
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      const s = this.agentSprites[i];
      const m = this.moodSprites[i];
      if (!a || !s || !m) continue;
      if (!a.active) {
        s.setVisible(false);
        m.setVisible(false);
        continue;
      }
      const p = toScreen(a.x, a.y);
      const x = p.x;
      const y = p.y + TILE_H / 2 + 4;
      if (!s.visible || s.getData('type') !== a.type) {
        s.setTexture(TEX.customer(a.type)).setData('type', a.type);
      } else if (Math.abs(x - s.x) > 0.01) {
        s.setFlipX(x < s.x);
      }
      s.setVisible(true)
        .setPosition(x, y)
        .setDepth(isoDepth(a.x, a.y, 6));
      // Smiley nur in Schlange und beim Bedienen, damit die Szene nicht überladen wirkt.
      const serving = a.phase === 'serve' || a.phase === 'queue';
      m.setVisible(serving);
      if (serving) {
        if (m.texture.key !== moodTex) m.setTexture(moodTex);
        m.setPosition(x, y - 26).setDepth(DEPTH.label - 1);
      }
    }
  }

  private coinPopup(gx: number, gy: number): void {
    const popup = this.popups.find((p) => !p.visible);
    const r = this.rates;
    if (!popup || !r || r.served <= 0) return;
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
    if (accepted) this.leaves.explode(8, p.worldX, p.worldY);
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
    this.refreshStations(this.store.getState());
  }
}
