import Phaser from 'phaser';
import {
  CITY,
  CITY_SPRITE,
  CITY_STYLE,
  STREET_LIFE,
  buildingHeight,
  getCityPalette,
  groundCellFor,
  hash01,
  isLitWindow,
  upperCellFor,
  type BuildingDef,
  type CityPalette,
  type FacadeFace,
  type GridRect,
  type GroundKind,
  type PropDef,
} from '@data/city';
import { CHAR_FRAMES, CHAR_WALK, CUSTOMER_LOOKS } from '@data/art';
import { CUSTOMER_TYPES } from '@data/customerTypes';
import { ART_SCALE, ATLAS, CHAR_FOOT_ORIGIN_Y, FRAME } from '../art';
import { isoDepth, toScreen } from '../iso/iso';
import { StreetLife } from './streetLife';

/** Tiefen: alles Stadt-Bauliche liegt hinter dem Café (Wände −2000, Boden −1000). */
const DEPTH = { ground: -9000, buildings: -8000, perBuilding: 100 } as const;
/** Helligkeit der sichtbaren Seiten (UI_STYLE § 4): links (+y) 85 %, rechts (+x) 70 %. */
const SHADE_A = 0.85;
const SHADE_B = 0.7;

const hex = (h: string): number => parseInt(h.slice(1), 16);
function shadeNum(n: number, f: number): number {
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

/** Grid-Punkt (x, y) in Höhe z → Bildschirm. */
function P(x: number, y: number, z = 0): Phaser.Math.Vector2 {
  const s = toScreen(x, y);
  return new Phaser.Math.Vector2(s.x, s.y - z);
}

const inRect = (r: GridRect, x: number, y: number): boolean =>
  x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;

/** Ursprung eines Sprites aus seiner Leinwand (Bodenpunkt). */
function originOf(s: { w: number; h: number; ox: number; oy: number }): [number, number] {
  return [s.ox / s.w, s.oy / s.h];
}

function propCanvas(kind: PropDef['kind']) {
  if (kind === 'linden' || kind === 'lindenSmall') return CITY_SPRITE.tree;
  if (kind === 'parked') return CITY_SPRITE.car;
  if (kind === 'railing') return CITY_SPRITE.railing;
  return CITY_SPRITE.prop;
}

interface LitWindow {
  sprite: Phaser.GameObjects.Image;
}

/**
 * Stadtviertel um das Café (`data/city.ts`): Boden als flache Flächen (Phaser Graphics, einmal gezeichnet),
 * Altbauten aus Fassaden-Modulen des Themen-Atlas, Straßen-Objekte und bewegte Autos/Passanten aus dem
 * `city`-Atlas. Rein kosmetisch.
 */
export class CityView {
  private readonly palette: CityPalette;
  private readonly life: StreetLife;
  private readonly carSprites: Phaser.GameObjects.Image[] = [];
  private readonly walkerSprites: Phaser.GameObjects.Image[] = [];
  private boat!: Phaser.GameObjects.Image;
  private readonly lit: LitWindow[] = [];
  private readonly lampGlows: Phaser.GameObjects.Image[] = [];
  private readonly pedLights: { sprite: Phaser.GameObjects.Image; road: 'u' | 'v' }[] = [];
  private shownLit = false;
  private clock = 0;
  /** Höhe (px) belegter Kacheln: Häuser und die Café-Box; verdeckte Fassaden-Module werden nicht erzeugt. */
  private readonly occupied = new Map<string, number>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly locationId: string,
    /** Grundfläche des Cafés in Kacheln (verdeckt die Erdgeschosse dahinter). */
    cafe: GridRect,
    /** Tiefe der Lichter über dem Nachtfilter. */
    private readonly lightDepth: number,
  ) {
    this.palette = getCityPalette(locationId);
    scene.cameras.main.setBackgroundColor(this.palette.outside);
    for (let x = cafe.x0; x < cafe.x1; x++)
      for (let y = cafe.y0; y < cafe.y1; y++) this.occupied.set(`${x},${y}`, CITY_STYLE.cafeH);
    for (const b of CITY.buildings)
      for (let x = b.rect.x0; x < b.rect.x1; x++)
        for (let y = b.rect.y0; y < b.rect.y1; y++)
          this.occupied.set(
            `${x},${y}`,
            Math.max(this.occupied.get(`${x},${y}`) ?? 0, buildingHeight(b)),
          );
    this.drawGround();
    CITY.buildings.forEach((b, i) => this.drawBuilding(b, i));
    for (const p of CITY.props) this.placeProp(p);
    this.life = new StreetLife(CITY);
    this.createMovers();
  }

  /** Bildschirm-Rechteck, in dem die Kamera schwenken darf. */
  static panBounds(): Phaser.Geom.Rectangle {
    const r = CITY.pan;
    const left = toScreen(r.x0, r.y1).x;
    const right = toScreen(r.x1, r.y0).x;
    const top = toScreen(r.x0, r.y0).y - 220;
    const bottom = toScreen(r.x1, r.y1).y;
    return new Phaser.Geom.Rectangle(left, top, right - left, bottom - top);
  }

  // ---------------------------------------------------------------------------------------------
  // Boden
  // ---------------------------------------------------------------------------------------------
  private groundColor(kind: GroundKind): number {
    const p = this.palette;
    const map: Record<GroundKind, string> = {
      courtyard: p.courtyard,
      sidewalk: p.sidewalk,
      road: p.road,
      grass: p.grass,
      path: p.path,
      quay: p.quay,
      water: p.water,
      bridge: p.road,
    };
    return hex(map[kind]);
  }

  private fillRect(g: Phaser.GameObjects.Graphics, r: GridRect, color: number, z = 0): void {
    g.fillStyle(color, 1);
    g.fillPoints([P(r.x0, r.y0, z), P(r.x1, r.y0, z), P(r.x1, r.y1, z), P(r.x0, r.y1, z)], true);
  }

  private drawGround(): void {
    const g = this.scene.add.graphics().setDepth(DEPTH.ground);
    const p = this.palette;
    for (const a of CITY.ground) {
      this.fillRect(g, a.rect, this.groundColor(a.kind));
      if (a.kind === 'sidewalk') this.sidewalkJoints(g, a.rect);
      if (a.kind === 'grass') this.grassTufts(g, a.rect);
      if (a.kind === 'water') this.waves(g, a.rect);
      if (a.kind === 'quay') this.fillRect(g, { ...a.rect, x0: a.rect.x1 - 0.12 }, hex(p.curb));
    }
    // Bordsteine an den Fahrbahnkanten (nicht über die Kreuzung)
    const curb = hex(p.curb);
    const curbDark = shadeNum(hex(p.road), 0.8);
    for (const [x0, x1] of [
      [-16, 15],
      [19, 21],
    ] as const) {
      this.fillRect(g, { x0, y0: 14.88, x1, y1: 15.02 }, curb);
      this.fillRect(g, { x0, y0: 15.02, x1, y1: 15.1 }, curbDark);
      this.fillRect(g, { x0, y0: 18.9, x1, y1: 19.02 }, curb);
      this.fillRect(g, { x0: 14.88, y0: x0, x1: 15.02, y1: x1 }, curb);
      this.fillRect(g, { x0: 15.02, y0: x0, x1: 15.1, y1: x1 }, curbDark);
      this.fillRect(g, { x0: 18.9, y0: x0, x1: 19.02, y1: x1 }, curb);
    }
    // Mittellinien gestrichelt, Haltelinien, Zebrastreifen
    const mark = hex(p.roadMark);
    for (let s = -16; s < 32; s += 1.4) {
      if (s > 13.5 && s < 19.5) continue;
      this.fillRect(g, { x0: s, y0: 16.95, x1: s + 0.7, y1: 17.05 }, mark);
      this.fillRect(g, { x0: 16.95, y0: s, x1: 17.05, y1: s + 0.7 }, mark);
    }
    for (const lane of CITY.lanes) {
      const a = lane.stopAt;
      const half = { x0: lane.at - 0.5, x1: lane.at + 0.5 };
      if (lane.axis === 'u')
        this.fillRect(g, { x0: a - 0.06, x1: a + 0.06, y0: half.x0, y1: half.x1 }, mark);
      else this.fillRect(g, { x0: half.x0, x1: half.x1, y0: a - 0.06, y1: a + 0.06 }, mark);
    }
    for (const c of CITY.crossings) {
      const r = c.rect;
      if (c.axis === 'u')
        for (let y = r.y0 + 0.2; y < r.y1 - 0.1; y += 0.5)
          this.fillRect(g, { x0: r.x0, x1: r.x1, y0: y, y1: y + 0.26 }, mark);
      else
        for (let x = r.x0 + 0.2; x < r.x1 - 0.1; x += 0.5)
          this.fillRect(g, { x0: x, x1: x + 0.26, y0: r.y0, y1: r.y1 }, mark);
    }
  }

  /** Gehwegplatten (Berliner Granitplatten) mit Fugen je Kachel und Mosaikstreifen am Bordstein. */
  private sidewalkJoints(g: Phaser.GameObjects.Graphics, r: GridRect): void {
    const joint = hex(this.palette.sidewalkJoint);
    g.lineStyle(1, joint, 0.9);
    for (let x = Math.ceil(r.x0); x < r.x1; x++)
      g.lineBetween(P(x, r.y0).x, P(x, r.y0).y, P(x, r.y1).x, P(x, r.y1).y);
    for (let y = Math.ceil(r.y0); y < r.y1; y++)
      g.lineBetween(P(r.x0, y).x, P(r.x0, y).y, P(r.x1, y).x, P(r.x1, y).y);
  }

  private grassTufts(g: Phaser.GameObjects.Graphics, r: GridRect): void {
    const dark = hex(this.palette.grassDark);
    g.fillStyle(dark, 1);
    for (let x = Math.ceil(r.x0); x < r.x1; x += 2)
      for (let y = Math.ceil(r.y0); y < r.y1; y += 2) {
        const h = hash01(x, y, 5);
        if (h > 0.45) continue;
        const cx = x + h * 1.6;
        const cy = y + hash01(y, x, 9) * 1.6;
        g.fillPoints(
          [P(cx, cy), P(cx + 0.35, cy), P(cx + 0.35, cy + 0.25), P(cx, cy + 0.25)],
          true,
        );
      }
  }

  private waves(g: Phaser.GameObjects.Graphics, r: GridRect): void {
    const light = hex(this.palette.waterLight);
    for (let y = Math.ceil(r.y0); y < r.y1; y += 1.5) {
      const x = r.x0 + 0.4 + hash01(y, 3) * (r.x1 - r.x0 - 1.4);
      this.fillRect(g, { x0: x, x1: x + 0.08, y0: y, y1: y + 0.7 }, light);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Altbauten
  // ---------------------------------------------------------------------------------------------
  private isStreet(x: number, y: number): boolean {
    return CITY.ground.some((a) => a.kind === 'sidewalk' && inRect(a.rect, x + 0.5, y + 0.5));
  }

  private drawBuilding(b: BuildingDef, index: number): void {
    const base = DEPTH.buildings + index * DEPTH.perBuilding;
    const g = this.scene.add.graphics().setDepth(base);
    const H = buildingHeight(b);
    const { x0, y0, x1, y1 } = b.rect;
    const facade = hex(this.palette.facades[b.facade] ?? this.palette.facades[0] ?? '#e8c993');
    // Grundflächen der beiden sichtbaren Seiten unter den Modulen (keine Fugen zwischen den Modulen)
    g.fillStyle(shadeNum(facade, SHADE_A), 1);
    g.fillPoints([P(x0, y1, 0), P(x1, y1, 0), P(x1, y1, H), P(x0, y1, H)], true);
    g.fillStyle(shadeNum(facade, SHADE_B), 1);
    g.fillPoints([P(x1, y0, 0), P(x1, y1, 0), P(x1, y1, H), P(x1, y0, H)], true);
    // Flachdach mit Attika, Schornsteinen und Oberlicht
    this.fillRect(g, b.rect, hex(this.palette.roofRim), H);
    this.fillRect(
      g,
      { x0: x0 + 0.14, y0: y0 + 0.14, x1: x1 - 0.14, y1: y1 - 0.14 },
      hex(this.palette.roof),
      H,
    );
    const area = (x1 - x0) * (y1 - y0);
    const chimneys = Math.min(5, 1 + Math.floor(area / 14));
    for (let k = 0; k < chimneys; k++) {
      const cx = x0 + 0.5 + hash01(b.seed, k, 1) * (x1 - x0 - 1.2);
      const cy = y0 + 0.5 + hash01(b.seed, k, 2) * (y1 - y0 - 1.2);
      this.box(g, cx, cy, H, 0.32, 0.32, 12, 0xb5654a);
      this.box(g, cx - 0.03, cy - 0.03, H + 12, 0.38, 0.38, 2, 0x8f8a86);
    }
    if (area > 20) {
      const sx = x0 + 1 + hash01(b.seed, 9) * (x1 - x0 - 2.6);
      const sy = y0 + 1 + hash01(b.seed, 10) * (y1 - y0 - 2.6);
      this.box(g, sx, sy, H, 1.2, 0.8, 4, 0xc8d6e6);
    }
    let order = 0;
    const next = () => base + 1 + order++ * 0.01;
    // Seite a: Ebene y = y1, Achsen entlang x
    for (let i = 0; i < x1 - x0; i++) this.facadeColumn(b, 'a', i, x0 + i, y1, x0 + i, y1, next);
    // Seite b: Ebene x = x1, Achsen entlang y
    for (let i = 0; i < y1 - y0; i++) this.facadeColumn(b, 'b', i, x1, y0 + i, x1, y0 + i, next);
  }

  /** Eine Fassadenachse von unten nach oben; `fx/fy` = Kachel davor (Straße? verdeckt?). */
  private facadeColumn(
    b: BuildingDef,
    face: FacadeFace,
    index: number,
    ax: number,
    ay: number,
    fx: number,
    fy: number,
    next: () => number,
  ): void {
    const hidden = this.occupied.get(`${fx},${fy}`) ?? 0;
    const theme = ATLAS.theme(this.locationId);
    const place = (frame: string, hc: number, z: number): Phaser.GameObjects.Image => {
      const s = P(ax, ay, z);
      const [ox, oy] = originOf(CITY_SPRITE.cell(hc));
      return this.scene.add
        .image(s.x, s.y, theme, frame)
        .setScale(ART_SCALE)
        .setOrigin(ox, oy)
        .setDepth(next());
    };
    const gh = CITY_STYLE.groundFloorH;
    if (hidden < gh)
      place(FRAME.facadeGround(groundCellFor(b, index, this.isStreet(fx, fy)), face), gh, 0);
    for (let f = 1; f < b.floors; f++) {
      const z = gh + (f - 1) * CITY_STYLE.floorH;
      if (hidden >= z + CITY_STYLE.floorH) continue;
      const cell = upperCellFor(b, index, f);
      place(FRAME.facadeUpper(cell, b.facade, face), CITY_STYLE.floorH, z);
      if (isLitWindow(b, face, index, f)) {
        const sprite = place(FRAME.facadeLit(cell, face), CITY_STYLE.floorH, z).setVisible(false);
        this.lit.push({ sprite });
      }
    }
    const top = buildingHeight(b) - CITY_STYLE.corniceH;
    if (hidden < top + CITY_STYLE.corniceH)
      place(FRAME.cornice(b.facade, face), CITY_STYLE.corniceH, top);
  }

  /** Quader mit Deckel und den beiden sichtbaren Seiten (Schornstein, Oberlicht). */
  private box(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    h: number,
    color: number,
  ): void {
    g.fillStyle(shadeNum(color, SHADE_A), 1);
    g.fillPoints(
      [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)],
      true,
    );
    g.fillStyle(shadeNum(color, SHADE_B), 1);
    g.fillPoints(
      [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)],
      true,
    );
    g.fillStyle(color, 1);
    g.fillPoints(
      [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)],
      true,
    );
  }

  // ---------------------------------------------------------------------------------------------
  // Objekte, Fahrzeuge, Passanten
  // ---------------------------------------------------------------------------------------------
  private placeProp(p: PropDef): void {
    const frame =
      p.kind === 'parked'
        ? FRAME.car(p.variant ?? 0, true)
        : p.kind === 'bench'
          ? `bench-${p.axis ?? 'u'}`
          : p.kind === 'pedLight'
            ? FRAME.pedLight(false)
            : p.kind;
    const s = P(p.x, p.y);
    const [ox, oy] = originOf(propCanvas(p.kind));
    const img = this.scene.add
      .image(s.x, s.y, ATLAS.city, frame)
      .setScale(ART_SCALE)
      .setOrigin(ox, oy)
      .setDepth(isoDepth(p.x - 0.5, p.y - 0.5, 5));
    // Quer gestellt: entlang v ist gespiegelt entlang u (Fahrzeuge, Fahrräder)
    if (p.axis === 'v' && (p.kind === 'parked' || p.kind === 'bikes')) img.setFlipX(true);
    if (p.kind === 'pedLight') this.pedLights.push({ sprite: img, road: p.axis ?? 'u' });
    if (p.kind === 'lamp')
      this.lampGlows.push(
        this.scene.add
          .image(s.x, s.y - 66, ATLAS.common, FRAME.glow)
          .setScale(ART_SCALE * 1.4)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(this.lightDepth)
          .setAlpha(0),
      );
  }

  private createMovers(): void {
    const [cox, coy] = originOf(CITY_SPRITE.car);
    for (let i = 0; i < this.life.cars.length; i++)
      this.carSprites.push(
        this.scene.add
          .image(0, 0, ATLAS.city, FRAME.car(0, true))
          .setScale(ART_SCALE)
          .setOrigin(cox, coy)
          .setVisible(false),
      );
    const look = CUSTOMER_LOOKS.student[0] ?? '';
    for (let i = 0; i < this.life.walkers.length; i++) {
      this.walkerSprites.push(
        this.scene.add
          .image(0, 0, ATLAS.common, FRAME.customer('student', look, 'front', 0))
          .setScale(ART_SCALE)
          .setOrigin(0.5, CHAR_FOOT_ORIGIN_Y)
          .setVisible(false),
      );
    }
    const [box, boy] = originOf(CITY_SPRITE.boat);
    this.boat = this.scene.add
      .image(0, 0, ATLAS.city, FRAME.boat(true))
      .setScale(ART_SCALE)
      .setOrigin(box, boy);
    this.sync();
  }

  /** Kundentyp und Look eines Passanten aus seiner Würfelzahl. */
  private walkerLook(seed: number): { type: string; look: string } {
    const types = CUSTOMER_TYPES.map((t) => t.id);
    const type = types[seed % types.length] ?? 'student';
    const looks = CUSTOMER_LOOKS[type];
    return { type, look: looks[Math.floor(seed / 7) % looks.length] ?? looks[0] ?? '' };
  }

  update(dt: number, still: boolean): void {
    if (!still) {
      this.clock += dt;
      this.life.update(dt);
    }
    this.sync();
  }

  private sync(): void {
    const life = this.life;
    life.cars.forEach((c, i) => {
      const s = this.carSprites[i];
      if (!s) return;
      s.setVisible(c.active);
      if (!c.active) return;
      const lane = life.lane(c);
      const pos = life.carPosition(c);
      const p = P(pos.x, pos.y);
      // Entlang v = entlang u gespiegelt; „vorn“ zeigt die Front (+u bzw. +v).
      const frame = FRAME.car(c.type, (lane?.dir ?? 1) > 0);
      if (s.frame.name !== frame) s.setFrame(frame);
      s.setFlipX(lane?.axis === 'v');
      s.setPosition(p.x, p.y).setDepth(isoDepth(pos.x - 0.5, pos.y - 0.5, 5));
    });
    life.walkers.forEach((w, i) => {
      const s = this.walkerSprites[i];
      if (!s) return;
      s.setVisible(w.active);
      if (!w.active) return;
      const { type, look } = this.walkerLook(w.seed);
      const across = Math.abs(w.dx) > Math.abs(w.dy);
      const dir = (across ? w.dx : w.dy) >= 0 ? 'front' : 'back';
      const step = w.moving
        ? (CHAR_WALK.cycle[
            Math.floor((this.clock + i * 0.37) / CHAR_WALK.stepSec) % CHAR_WALK.cycle.length
          ] ?? CHAR_FRAMES.stand)
        : CHAR_FRAMES.stand;
      const frame = FRAME.customer(type, look, dir, step);
      if (s.frame.name !== frame) s.setFrame(frame);
      s.setFlipX(across);
      const p = P(w.x, w.y);
      s.setPosition(p.x, p.y).setDepth(isoDepth(w.x - 0.5, w.y - 0.5, 6));
    });
    const b = life.boat;
    const bp = P(STREET_LIFE.boatAt, b.pos);
    const bf = FRAME.boat(b.dir > 0);
    if (this.boat.frame.name !== bf) this.boat.setFrame(bf);
    // Der Kanal läuft entlang v: Sprite entlang u gespiegelt.
    this.boat
      .setFlipX(true)
      .setPosition(bp.x, bp.y)
      .setDepth(isoDepth(STREET_LIFE.boatAt - 0.5, b.pos - 0.5, 4));
    const signal = life.signal();
    for (const l of this.pedLights) {
      const go = signal === (l.road === 'u' ? 'v' : 'u');
      const f = FRAME.pedLight(go);
      if (l.sprite.frame.name !== f) l.sprite.setFrame(f);
    }
  }

  /** Nacht (0..1): Laternen leuchten, ein Teil der Fenster geht an. */
  setNight(night: number): void {
    for (const g of this.lampGlows) g.setAlpha(night * 0.9);
    const on = night >= CITY_STYLE.litFrom;
    if (on === this.shownLit) return;
    this.shownLit = on;
    for (const w of this.lit) w.sprite.setVisible(on);
  }
}
